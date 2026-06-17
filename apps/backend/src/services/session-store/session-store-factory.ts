import type { SessionStore as FastifySessionStore } from "@fastify/session";
import type { Session } from "fastify";
import { retryWithBackoff } from "../session-store.service.js";
import {
  setSession,
  getSession,
  destroySession,
} from "./session-operations.js";
import { cleanExpiredSessions } from "./session-operations.js";
import {
  createDeadLetterQueue,
  addToDeadLetterQueue,
  getDeadLetterQueue,
  getDeadLetterQueueSize,
  clearDeadLetterQueue,
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

  return {
    set(sessionId: string, session: Session, callback: Callback): void {
      // @fastify/session with `rolling: true` calls store.set on every request
      // but does NOT call session.touch() itself. Without this, cookie.expires
      // (and therefore the DB expiresAt written below) stays at the original
      // creation time, defeating sliding expiry. touch() must run BEFORE
      // callback() because @fastify/session snapshots cookie.expires inside
      // the callback to produce the Set-Cookie response header.
      // touch() updates cookie.expires to now + cookie.originalMaxAge, which
      // setSession then writes to the DB.
      const fastifySession = session as Session & {
        touch?: () => void;
      };
      if (typeof fastifySession.touch === "function") {
        fastifySession.touch();
      }

      callback();

      retryWithBackoff(
        () => setSession(sessionId, session),
        retryOptions
      ).catch((err) => {
        deadLetterQueue = addToDeadLetterQueue(
          deadLetterQueue,
          {
            sessionId,
            operation: "set",
            sessionData: session,
            timestamp: new Date(),
            lastError: err.message || String(err),
            retryCount: retryOptions.maxRetries,
          },
          1000,
          options?.onDeadLetterEntry
        );

        logError(
          LogEventType.SESSION_STORE_ERROR,
          {
            event: "session_set_failed",
            sessionId,
            retryCount: retryOptions.maxRetries,
          },
          err
        );
      });
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
      callback();

      retryWithBackoff(() => destroySession(sessionId), retryOptions).catch(
        (err) => {
          deadLetterQueue = addToDeadLetterQueue(
            deadLetterQueue,
            {
              sessionId,
              operation: "destroy",
              timestamp: new Date(),
              lastError: err.message || String(err),
              retryCount: retryOptions.maxRetries,
            },
            1000,
            options?.onDeadLetterEntry
          );

          logError(
            LogEventType.SESSION_STORE_ERROR,
            {
              event: "session_destroy_failed",
              sessionId,
              retryCount: retryOptions.maxRetries,
            },
            err
          );
        }
      );
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
