/**
 * Simple concurrency limiter for parallel async operations
 * Limits the number of concurrent promises to avoid overwhelming external APIs
 */

class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private concurrency: number) {}

  async run<T>(fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
    while (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(
          () => reject(new Error("Task timeout")),
          timeoutMs
        );
      });
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export { ConcurrencyLimiter };
