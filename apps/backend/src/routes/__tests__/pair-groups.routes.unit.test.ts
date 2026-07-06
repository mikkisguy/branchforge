/**
 * Pair Groups Routes Unit Tests
 *
 * Tests for the pair groups API routes using Fastify inject.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { pairGroupsRoutes } from "../pair-groups.routes.js";
import * as pairGroupsService from "../../services/pair-groups.service.js";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  globalErrorHandler,
} from "../../middleware/error-handler.middleware.js";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const PAIR_ID = "660e8400-e29b-41d4-a716-446655440001";
const CHAR_A_ID = "770e8400-e29b-41d4-a716-44665544000a";
const CHAR_B_ID = "770e8400-e29b-41d4-a716-44665544000b";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../../services/pair-groups.service.js", () => ({
  listPairGroups: vi.fn(),
  getPairGroup: vi.fn(),
  createPairGroup: vi.fn(),
  updatePairGroup: vi.fn(),
  deletePairGroup: vi.fn(),
}));

vi.mock("../../middleware/auth.middleware.js", () => ({
  authenticate: async (request: any, _reply: any) => {
    (request as any).user = {
      id: "user-123",
      email: "test@example.com",
      role: "OWNER" as const,
    };
  },
}));

vi.mock("../../services/rate-limiter.service.js", () => ({
  checkRateLimit: vi.fn(),
  clearRateLimit: vi.fn(),
}));

// ============================================================================
// Fixtures
// ============================================================================

function makePairGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: PAIR_ID,
    projectId: PROJECT_ID,
    characterAId: CHAR_A_ID,
    characterBId: CHAR_B_ID,
    duoEndingLabel: "best_friends",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    ...overrides,
  };
}

function makePairGroupWithNames(overrides: Record<string, unknown> = {}) {
  return {
    id: PAIR_ID,
    projectId: PROJECT_ID,
    characterAId: CHAR_A_ID,
    characterBId: CHAR_B_ID,
    duoEndingLabel: "best_friends",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    characterAName: "Alice",
    characterBName: "Bob",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("PairGroupsRoutes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();

    fastify = Fastify();
    await pairGroupsRoutes(fastify);
    fastify.setErrorHandler(globalErrorHandler);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
  });

  // --------------------------------------------------------------------------
  // GET /projects/:projectId/pairs
  // --------------------------------------------------------------------------

  describe("GET /projects/:projectId/pairs", () => {
    it("returns empty array when no pair groups exist", async () => {
      vi.mocked(pairGroupsService.listPairGroups).mockResolvedValue([]);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}/pairs`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ pairGroups: [] });
    });

    it("returns pair groups list with character names", async () => {
      const pgs = [makePairGroupWithNames()];
      vi.mocked(pairGroupsService.listPairGroups).mockResolvedValue(pgs);

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}/pairs`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pairGroups).toHaveLength(1);
      expect(body.pairGroups[0].characterAName).toBe("Alice");
      expect(body.pairGroups[0].characterBName).toBe("Bob");
    });

    it("returns 403 when user lacks permission", async () => {
      vi.mocked(pairGroupsService.listPairGroups).mockRejectedValue(
        new ForbiddenError("Forbidden")
      );

      const response = await fastify.inject({
        method: "GET",
        url: `/projects/${PROJECT_ID}/pairs`,
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // POST /projects/:projectId/pairs
  // --------------------------------------------------------------------------

  describe("POST /projects/:projectId/pairs", () => {
    it("creates a pair group and returns 201", async () => {
      const pg = makePairGroup();
      vi.mocked(pairGroupsService.createPairGroup).mockResolvedValue(pg);

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${PROJECT_ID}/pairs`,
        payload: {
          characterAId: CHAR_A_ID,
          characterBId: CHAR_B_ID,
          duoEndingLabel: "best_friends",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().pairGroup.duoEndingLabel).toBe("best_friends");
    });

    it("returns 400 when validation fails (missing label)", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${PROJECT_ID}/pairs`,
        payload: {
          characterAId: CHAR_A_ID,
          characterBId: CHAR_B_ID,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 409 on duplicate pair", async () => {
      vi.mocked(pairGroupsService.createPairGroup).mockRejectedValue(
        new ConflictError("A pair group with these characters already exists")
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${PROJECT_ID}/pairs`,
        payload: {
          characterAId: CHAR_A_ID,
          characterBId: CHAR_B_ID,
          duoEndingLabel: "test",
        },
      });

      expect(response.statusCode).toBe(409);
    });

    it("returns 404 when character not found", async () => {
      vi.mocked(pairGroupsService.createPairGroup).mockRejectedValue(
        new NotFoundError("character_a_id not found in this project")
      );

      const response = await fastify.inject({
        method: "POST",
        url: `/projects/${PROJECT_ID}/pairs`,
        payload: {
          characterAId: CHAR_A_ID,
          characterBId: CHAR_B_ID,
          duoEndingLabel: "test",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // PUT /projects/:projectId/pairs/:pairGroupId
  // --------------------------------------------------------------------------

  describe("PUT /projects/:projectId/pairs/:pairGroupId", () => {
    it("updates a pair group", async () => {
      const updated = makePairGroup({
        duoEndingLabel: "new_ending",
      });
      vi.mocked(pairGroupsService.updatePairGroup).mockResolvedValue(updated);

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${PROJECT_ID}/pairs/${PAIR_ID}`,
        payload: {
          duoEndingLabel: "new_ending",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().pairGroup.duoEndingLabel).toBe("new_ending");
    });

    it("returns 404 when pair group not found", async () => {
      vi.mocked(pairGroupsService.updatePairGroup).mockRejectedValue(
        new NotFoundError("Pair group not found")
      );

      const response = await fastify.inject({
        method: "PUT",
        url: `/projects/${PROJECT_ID}/pairs/${PAIR_ID}`,
        payload: { duoEndingLabel: "test" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // DELETE /projects/:projectId/pairs/:pairGroupId
  // --------------------------------------------------------------------------

  describe("DELETE /projects/:projectId/pairs/:pairGroupId", () => {
    it("deletes a pair group and returns 204", async () => {
      vi.mocked(pairGroupsService.deletePairGroup).mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "DELETE",
        url: `/projects/${PROJECT_ID}/pairs/${PAIR_ID}`,
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 when pair group not found", async () => {
      vi.mocked(pairGroupsService.deletePairGroup).mockRejectedValue(
        new NotFoundError("Pair group not found")
      );

      const response = await fastify.inject({
        method: "DELETE",
        url: `/projects/${PROJECT_ID}/pairs/${PAIR_ID}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
