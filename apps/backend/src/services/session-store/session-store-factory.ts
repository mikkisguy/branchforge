import type { SessionStore as FastifySessionStore } from "@fastify/session";
import type { Session } from "fastify";
import { retryWithBackoff } from "../session-store.service.js";
import {
  cleanExpiredSessions,
  compareAndSetSession,
  destroySession,
  getSession,
  setSession,
} from "./session-operations.js";
import {
  createDeadLetterQueue,
  addToDeadLetterQueue,
  getDeadLetterQueue,
  getDeadLetterQueueSize,
  clearDeadLetterQueue,
  type DeadLetterEntry,
  type DeadLetterQueue,
  type DeadLetterAlertCallback,
} from "./dead-letter-queue.js";
import {
  createCleanupManager,
  startCleanup,
  destroyCleanupManager,
} from "./cleanup-manager.js";
import { logError, LogEventType } from "../../lib/logger.js";

type Callback = (err?: Error | null) => void;
type CallbackSession = (err: Error | null, result?: Session | null) => void;

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
};

export interface SessionStoreOptions {
  cleanupInterval?: number;
  retryOptions?: Partial<RetryOptions>;
  onDeadLetterEntry?: DeadLetterAlertCallback;
}

export interface SessionStore extends FastifySessionStore {
  cleanup(): void;
  getDeadLetterQueue(): DeadLetterQueue;
  getDeadLetterQueueSize(): number;
  clearDeadLetterQueue(): void;
}

/**
 * Create a session store instance
 */
export function createSessionStore(
  options?: SessionStoreOptions
): SessionStore {
  const cleanupInterval = options?.cleanupInterval ?? 60 * 60 * 1000;
  const retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options?.retryOptions };

  // State managed in closure
  let deadLetterQueue = createDeadLetterQueue();
  const cleanupManager = createCleanupManager(
    cleanupInterval,
    cleanExpiredSessions
  );

  // Start cleanup interval
  startCleanup(cleanupManager);

  function write(
    sessionId: string,
    operation: DeadLetterEntry["operation"],
    persist: () => Promise<boolean | void>,
    callback: Callback,
    sessionData?: Session
  ): void {
    retryWithBackoff(persist, retryOptions).then(
      (result) => {
        if (result === false) {
          // A missing or changed generation is an ordinary invalidation.
          callback(
            Object.assign(new Error("Session no longer matches"), {
              code: "ENOENT",
            })
          );
          return;
        }
        callback();
      },
      (err: Error) => {
        deadLetterQueue = addToDeadLetterQueue(
          deadLetterQueue,
          {
            sessionId,
            operation,
            sessionData,
            timestamp: new Date(),
            lastError: err.message,
            retryCount: retryOptions.maxRetries,
          },
          1000,
          options?.onDeadLetterEntry
        );

        logError(
          LogEventType.SESSION_STORE_ERROR,
          {
            event: `session_${operation}_failed`,
            sessionId,
            operation,
            retryCount: retryOptions.maxRetries,
          },
          err
        );
        callback(err);
      }
    );
  }

  function touch(session: Session): void {
    // Fastify reads the cookie expiry in the write callback.
    if ("touch" in session && typeof session.touch === "function") {
      session.touch();
    }
  }

  return {
    set(sessionId: string, session: Session, callback: Callback): void {
      touch(session);
      write(
        sessionId,
        "set",
        () => setSession(sessionId, session),
        callback,
        session
      );
    },

    compareAndSet(
      sessionId: string,
      expectedGeneration: string,
      session: Session,
      callback: Callback
    ): void {
      touch(session);
      write(
        sessionId,
        "compareAndSet",
        () => compareAndSetSession(sessionId, expectedGeneration, session),
        callback,
        session
      );
    },

    get(sessionId: string, callback: CallbackSession): void {
      retryWithBackoff(() => getSession(sessionId), retryOptions)
        .then((session) => callback(null, session))
        .catch((err) => {
          logError(
            LogEventType.SESSION_STORE_ERROR,
            {
              event: "session_get_error",
              sessionId,
            },
            err
          );
          callback(null, null);
        });
    },

    destroy(sessionId: string, callback: Callback): void {
      write(sessionId, "destroy", () => destroySession(sessionId), callback);
    },

    cleanup(): void {
      destroyCleanupManager(cleanupManager);
      deadLetterQueue = clearDeadLetterQueue(deadLetterQueue);
    },

    getDeadLetterQueue(): DeadLetterQueue {
      return getDeadLetterQueue(deadLetterQueue);
    },

    getDeadLetterQueueSize(): number {
      return getDeadLetterQueueSize(deadLetterQueue);
    },

    clearDeadLetterQueue(): void {
      deadLetterQueue = clearDeadLetterQueue(deadLetterQueue);
    },
  };
}
