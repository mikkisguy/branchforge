/**
 * GitLab API Client Tests
 *
 * Unit tests for GitLab integration API client.
 * Tests are written before implementation (TDD approach).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { gitlabApi } from "../gitlab.js";

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("GitLab API Client", () => {
  afterEach(() => {
    mockFetch.mockReset();
    vi.useRealTimers();
  });

  describe("validateToken", () => {
    it("should validate a GitLab PAT successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, username: "testuser" }),
      } as Response);

      const result = await gitlabApi.validateToken("glpat-test123");

      expect(result).toEqual({ valid: true, username: "testuser" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "glpat-test123" }),
        })
      );
    });

    it("should validate with custom GitLab URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, username: "testuser" }),
      } as Response);

      await gitlabApi.validateToken(
        "glpat-test123",
        "https://gitlab.example.com"
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            token: "glpat-test123",
            gitlabUrl: "https://gitlab.example.com",
          }),
        })
      );
    });

    it("should handle invalid token (API error)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Invalid GitLab token" }),
      } as Response);

      await expect(gitlabApi.validateToken("glpat-invalid")).rejects.toThrow(
        "Invalid GitLab token"
      );
    });

    it("should reject invalid token format", async () => {
      await expect(gitlabApi.validateToken("invalid-format")).rejects.toThrow(
        "Token must start with glpat-"
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("storeIntegration", () => {
    it("should store GitLab integration", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => undefined,
      } as Response);

      await gitlabApi.storeIntegration("glpat-test123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            token: "glpat-test123",
          }),
        })
      );
    });

    it("should store with custom GitLab URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => undefined,
      } as Response);

      await gitlabApi.storeIntegration(
        "glpat-test123",
        "https://gitlab.example.com"
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            token: "glpat-test123",
            gitlabUrl: "https://gitlab.example.com",
          }),
        })
      );
    });
  });

  describe("deleteIntegration", () => {
    it("should delete GitLab integration", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await gitlabApi.deleteIntegration();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/gitlab/integration"),
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  describe("getRepositories", () => {
    it("should list GitLab repositories", async () => {
      const mockRepositories = [
        { id: 1, name: "test-repo", path_with_namespace: "user/test-repo" },
        {
          id: 2,
          name: "another-repo",
          path_with_namespace: "user/another-repo",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRepositories,
      } as Response);

      const result = await gitlabApi.getRepositories();

      expect(result).toEqual(mockRepositories);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("gitlab/repositories"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("linkRepository", () => {
    it("should link repository to project", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => undefined,
      } as Response);

      await gitlabApi.linkRepository("project-123", 12345, "main");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "project-123",
            gitlabProjectId: 12345,
            branch: "main",
          }),
        })
      );
    });

    it("should use default branch when not specified", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => undefined,
      } as Response);

      await gitlabApi.linkRepository("project-123", 12345);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            projectId: "project-123",
            gitlabProjectId: 12345,
            branch: "main",
          }),
        })
      );
    });
  });

  describe("unlinkRepository", () => {
    it("should unlink repository from project", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await gitlabApi.unlinkRepository("project-123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/gitlab/unlink/project-123"),
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  describe("getBranches", () => {
    it("should list branches for a project", async () => {
      const mockBranches = ["main", "develop", "feature/test"];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockBranches,
      } as Response);

      const result = await gitlabApi.getBranches("project-123");

      expect(result).toEqual(mockBranches);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/gitlab/branches/project-123"),
        expect.objectContaining({ credentials: "include" })
      );
    });
  });

  describe("getRpyFiles", () => {
    it("should list RPY files in repository", async () => {
      const mockFiles = [
        { name: "script.rpy", path: "game/script.rpy" },
        { name: "chapter1.rpy", path: "game/chapter1.rpy" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFiles,
      } as Response);

      const result = await gitlabApi.getRpyFiles("project-123", "main");

      expect(result).toEqual(mockFiles);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/gitlab/files/project-123"),
        expect.objectContaining({ credentials: "include" })
      );
    });
  });

  describe("exportToGitlab", () => {
    it("should export scenes to GitLab", async () => {
      const mockOperation = {
        id: "op-123",
        projectId: "project-123",
        operation: "EXPORT",
        status: "COMPLETED",
        branch: "main",
        conflictCount: 0,
        startedAt: "2024-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOperation,
      } as Response);

      const result = await gitlabApi.exportToGitlab(
        "project-123",
        "main",
        "Test export"
      );

      expect(result).toEqual(mockOperation);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/gitlab/export"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "project-123",
            branch: "main",
            commitMessage: "Test export",
          }),
        })
      );
    });
  });

  describe("importFromGitlab", () => {
    it("should import from GitLab", async () => {
      const mockOperation = {
        id: "op-123",
        projectId: "project-123",
        operation: "IMPORT",
        status: "COMPLETED",
        branch: "main",
        conflictCount: 0,
        startedAt: "2024-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOperation,
      } as Response);

      const result = await gitlabApi.importFromGitlab(
        "project-123",
        "main",
        "gitlab_wins"
      );

      expect(result).toEqual(mockOperation);
    });

    it.each([
      ["branchforge_wins"],
      ["gitlab_wins"],
      ["manual_review"],
    ] as const)(
      "should support conflict resolution: %s",
      async (resolution) => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "op-123",
            operation: "IMPORT",
            status: "COMPLETED",
          }),
        } as Response);

        await gitlabApi.importFromGitlab("project-123", "main", resolution);

        expect(mockFetch).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining(
              `"conflictResolution":"${resolution}"`
            ),
          })
        );
      }
    );
  });

  describe("getOperationStatus", () => {
    it("should get sync operation status", async () => {
      const mockOperation = {
        id: "op-123",
        projectId: "project-123",
        operation: "EXPORT",
        status: "IN_PROGRESS",
        branch: "main",
        conflictCount: 0,
        startedAt: "2024-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOperation,
      } as Response);

      const result = await gitlabApi.getOperationStatus("op-123");

      expect(result).toEqual(mockOperation);
    });
  });

  describe("listOperations", () => {
    it("should list sync operations for a project", async () => {
      const mockOperations = [
        {
          id: "op-1",
          projectId: "project-123",
          operation: "EXPORT",
          status: "COMPLETED",
          branch: "main",
          conflictCount: 0,
          startedAt: "2024-01-01T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOperations,
      } as Response);

      const result = await gitlabApi.listOperations("project-123");

      expect(result).toEqual(mockOperations);
    });
  });

  describe("detectConflicts", () => {
    it("should detect conflicts between local and remote", async () => {
      const mockConflicts = {
        hasConflicts: true,
        conflicts: [
          {
            label: "start",
            type: "dialogue_mismatch",
            localContent: [{ speaker: null, text: "Local content" }],
            remoteContent: [{ speaker: null, text: "Remote content" }],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConflicts,
      } as Response);

      const result = await gitlabApi.detectConflicts("project-123", "main");

      expect(result).toEqual(mockConflicts);
    });
  });

  describe("pollOperation", () => {
    it("should poll operation status until completion", async () => {
      const inProgressOp = {
        id: "op-123",
        status: "IN_PROGRESS",
        operation: "EXPORT",
      };

      const completedOp = {
        id: "op-123",
        status: "COMPLETED",
        operation: "EXPORT",
        conflictCount: 0,
      };

      // First call: in progress
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => inProgressOp,
      } as Response);

      // Second call: completed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => completedOp,
      } as Response);

      const onUpdate = vi.fn();

      await gitlabApi.pollOperation("op-123", onUpdate, { interval: 10 });

      // Should have called update twice (in_progress, completed)
      expect(onUpdate).toHaveBeenCalledTimes(2);
      expect(onUpdate).toHaveBeenLastCalledWith(completedOp);
    });

    it("should stop polling on failed operation", async () => {
      const failedOp = {
        id: "op-123",
        status: "FAILED",
        errorMessage: "API Error",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => failedOp,
      } as Response);

      const onUpdate = vi.fn();

      await gitlabApi.pollOperation("op-123", onUpdate, { interval: 10 });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith(failedOp);
    });

    it("should handle timeout", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "op-123",
          status: "IN_PROGRESS",
        }),
      } as Response);

      const onUpdate = vi.fn();

      const pollPromise = gitlabApi.pollOperation("op-123", onUpdate, {
        interval: 20,
        timeout: 50,
      });

      // Attach rejection handler before advancing timers to prevent
      // unhandled rejection warning
      const assertion = expect(pollPromise).rejects.toThrow(
        "Operation polling timed out"
      );

      await vi.runAllTimersAsync();
      await assertion;

      expect(onUpdate).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
