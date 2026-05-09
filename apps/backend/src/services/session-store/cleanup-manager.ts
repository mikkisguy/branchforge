/**
 * Cleanup Manager for periodic session cleanup
 */

import { logInfo, LogEventType } from "../../lib/logger.js";

export interface CleanupManager {
  interval: NodeJS.Timeout | null;
  intervalMs: number;
  cleanupFn: () => Promise<number>;
  onCleanup?: (count: number, duration: number) => void;
}

/**
 * Create a cleanup manager
 */
export function createCleanupManager(
  intervalMs: number,
  cleanupFn: () => Promise<number>,
  onCleanup?: (count: number, duration: number) => void
): CleanupManager {
  return {
    interval: null,
    intervalMs,
    cleanupFn,
    onCleanup,
  };
}

/**
 * Start the cleanup interval
 */
export function startCleanup(manager: CleanupManager): void {
  if (manager.interval) {
    return;
  }

  let isRunning = false;

  const scheduleNext = () => {
    if (isRunning) {
      return;
    }

    isRunning = true;
    const startTime = Date.now();

    manager
      .cleanupFn()
      .then((count) => {
        const duration = Date.now() - startTime;

        if (count > 0) {
          logInfo(LogEventType.SESSION_STORE_CLEANUP, {
            sessionsCleaned: count,
            durationMs: duration,
          });
        }

        if (manager.onCleanup) {
          manager.onCleanup(count, duration);
        }
      })
      .finally(() => {
        isRunning = false;
        if (manager.interval) {
          manager.interval = setTimeout(
            scheduleNext,
            manager.intervalMs
          ) as unknown as NodeJS.Timeout;
        }
      });
  };

  const timerId = setTimeout(scheduleNext, manager.intervalMs);
  manager.interval = timerId as unknown as NodeJS.Timeout;

  if (manager.interval.unref) {
    manager.interval.unref();
  }
}

/**
 * Stop the cleanup interval
 */
export function stopCleanup(manager: CleanupManager): void {
  if (manager.interval) {
    clearTimeout(manager.interval as NodeJS.Timeout);
    manager.interval = null;
  }
}

/**
 * Destroy the cleanup manager and reset state
 */
export function destroyCleanupManager(manager: CleanupManager): void {
  stopCleanup(manager);
}
