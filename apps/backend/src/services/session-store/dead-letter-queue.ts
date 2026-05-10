import type { Session } from "fastify";
import { logError, LogEventType } from "../../lib/logger.js";

export type DeadLetterQueue = DeadLetterEntry[];

export type DeadLetterAlertCallback = (entry: DeadLetterEntry) => void;

export interface DeadLetterEntry {
  sessionId: string;
  operation: "set" | "destroy";
  sessionData?: Session;
  timestamp: Date;
  lastError: string;
  retryCount: number;
}

/**
 * Create a new empty dead letter queue
 */
export function createDeadLetterQueue(): DeadLetterQueue {
  return [];
}

/**
 * Add an entry to the dead letter queue
 * Returns a new queue with the entry added
 */
export function addToDeadLetterQueue(
  queue: DeadLetterQueue,
  entry: DeadLetterEntry,
  maxSize: number = 1000,
  alertCallback?: DeadLetterAlertCallback
): DeadLetterQueue {
  const newQueue = [...queue, entry];

  // Remove oldest entry if queue exceeds max size
  if (newQueue.length > maxSize) {
    newQueue.shift();
  }

  // Trigger alert callback if provided
  if (alertCallback) {
    try {
      alertCallback(entry);
    } catch (err) {
      logError(
        LogEventType.SESSION_STORE_ERROR,
        {
          event: "dead_letter_alert_callback_failed",
        },
        err
      );
    }
  }

  return newQueue;
}

/**
 * Get all entries from the dead letter queue
 */
export function getDeadLetterQueue(queue: DeadLetterQueue): DeadLetterEntry[] {
  return [...queue];
}

/**
 * Get the size of the dead letter queue
 */
export function getDeadLetterQueueSize(queue: DeadLetterQueue): number {
  return queue.length;
}

/**
 * Clear the dead letter queue
 * Returns a new empty queue
 */
export function clearDeadLetterQueue(_queue: DeadLetterQueue): DeadLetterQueue {
  return [];
}
