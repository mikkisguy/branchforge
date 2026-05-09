import { describe, it, expect, vi } from "vitest";
import type { Session } from "fastify";
import {
  createDeadLetterQueue,
  addToDeadLetterQueue,
  getDeadLetterQueue,
  getDeadLetterQueueSize,
  clearDeadLetterQueue,
  type DeadLetterEntry,
} from "../dead-letter-queue.js";

describe("DeadLetterQueue", () => {
  const createMockEntry = (sessionId: string): DeadLetterEntry => ({
    sessionId,
    operation: "set",
    sessionData: { user: { id: "123" } } as Session,
    timestamp: new Date(),
    lastError: "Test error",
    retryCount: 3,
  });

  describe("createDeadLetterQueue", () => {
    it("should create an empty queue", () => {
      const queue = createDeadLetterQueue();
      expect(queue).toEqual([]);
      expect(queue.length).toBe(0);
    });
  });

  describe("addToDeadLetterQueue", () => {
    it("should add an entry to the queue", () => {
      let queue = createDeadLetterQueue();
      const entry = createMockEntry("session-1");

      queue = addToDeadLetterQueue(queue, entry);

      expect(getDeadLetterQueueSize(queue)).toBe(1);
      expect(getDeadLetterQueue(queue)[0]).toEqual(entry);
    });

    it("should add multiple entries in order", () => {
      let queue = createDeadLetterQueue();
      const entry1 = createMockEntry("session-1");
      const entry2 = createMockEntry("session-2");

      queue = addToDeadLetterQueue(queue, entry1);
      queue = addToDeadLetterQueue(queue, entry2);

      expect(getDeadLetterQueueSize(queue)).toBe(2);
      expect(getDeadLetterQueue(queue)[0].sessionId).toBe("session-1");
      expect(getDeadLetterQueue(queue)[1].sessionId).toBe("session-2");
    });

    it("should remove oldest entry when exceeding maxSize", () => {
      let queue = createDeadLetterQueue();
      const maxSize = 3;

      queue = addToDeadLetterQueue(
        queue,
        createMockEntry("session-1"),
        maxSize
      );
      queue = addToDeadLetterQueue(
        queue,
        createMockEntry("session-2"),
        maxSize
      );
      queue = addToDeadLetterQueue(
        queue,
        createMockEntry("session-3"),
        maxSize
      );
      queue = addToDeadLetterQueue(
        queue,
        createMockEntry("session-4"),
        maxSize
      );

      expect(getDeadLetterQueueSize(queue)).toBe(3);
      expect(getDeadLetterQueue(queue)[0].sessionId).toBe("session-2");
      expect(getDeadLetterQueue(queue)[2].sessionId).toBe("session-4");
    });

    it("should use default maxSize of 1000", () => {
      let queue = createDeadLetterQueue();

      for (let i = 0; i < 1001; i++) {
        queue = addToDeadLetterQueue(queue, createMockEntry(`session-${i}`));
      }

      expect(getDeadLetterQueueSize(queue)).toBe(1000);
    });

    it("should call alertCallback when provided", () => {
      const queue = createDeadLetterQueue();
      const entry = createMockEntry("session-1");
      const alertCallback = vi.fn();

      void addToDeadLetterQueue(queue, entry, 1000, alertCallback);

      expect(alertCallback).toHaveBeenCalledTimes(1);
      expect(alertCallback).toHaveBeenCalledWith(entry);
    });

    it("should not throw when alertCallback throws", () => {
      let queue = createDeadLetterQueue();
      const entry = createMockEntry("session-1");
      const alertCallback = vi.fn(() => {
        throw new Error("Callback error");
      });

      expect(() => {
        queue = addToDeadLetterQueue(queue, entry, 1000, alertCallback);
      }).not.toThrow();
    });
  });

  describe("getDeadLetterQueue", () => {
    it("should return a copy of the queue", () => {
      let queue = createDeadLetterQueue();
      const entry = createMockEntry("session-1");
      queue = addToDeadLetterQueue(queue, entry);

      const retrieved = getDeadLetterQueue(queue);

      expect(retrieved).toEqual(queue);
      expect(retrieved).not.toBe(queue);
    });

    it("should return empty array for empty queue", () => {
      const queue = createDeadLetterQueue();
      const retrieved = getDeadLetterQueue(queue);
      expect(retrieved).toEqual([]);
    });
  });

  describe("getDeadLetterQueueSize", () => {
    it("should return correct size for empty queue", () => {
      const queue = createDeadLetterQueue();
      expect(getDeadLetterQueueSize(queue)).toBe(0);
    });

    it("should return correct size for non-empty queue", () => {
      let queue = createDeadLetterQueue();
      queue = addToDeadLetterQueue(queue, createMockEntry("session-1"));
      queue = addToDeadLetterQueue(queue, createMockEntry("session-2"));
      queue = addToDeadLetterQueue(queue, createMockEntry("session-3"));

      expect(getDeadLetterQueueSize(queue)).toBe(3);
    });
  });

  describe("clearDeadLetterQueue", () => {
    it("should return a new empty queue", () => {
      let queue = createDeadLetterQueue();
      queue = addToDeadLetterQueue(queue, createMockEntry("session-1"));
      queue = addToDeadLetterQueue(queue, createMockEntry("session-2"));

      const cleared = clearDeadLetterQueue(queue);

      expect(cleared).toEqual([]);
      expect(cleared).not.toBe(queue);
      expect(getDeadLetterQueueSize(queue)).toBe(2);
    });

    it("should return empty queue for empty queue", () => {
      const queue = createDeadLetterQueue();
      const cleared = clearDeadLetterQueue(queue);
      expect(cleared).toEqual([]);
    });
  });
});
