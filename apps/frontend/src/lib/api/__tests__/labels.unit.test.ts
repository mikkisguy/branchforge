/**
 * Labels API Unit Tests
 *
 * Tests for label management API methods.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import { labelsApi } from "../labels";
import type { ListLabelsParams } from "../labels";
import type { PublicLabel, LabelDetail } from "@branchforge/shared";

describe("Labels API", () => {
  let mockFetch: ReturnType<typeof vi.fn> & typeof globalThis.fetch;
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn() as ReturnType<typeof vi.fn> & typeof globalThis.fetch;
    globalThis.fetch = mockFetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });
  const mockLabel: PublicLabel = {
    id: "label-1",
    projectId: "proj-1",
    routeKey: "EILEEN",
    groupType: "act",
    groupValue: "1",
    labelNumber: 1,
    sequenceOrder: 1,
    title: "Scene 1",
    status: "DRAFT",
    visibility: "EXCLUSIVE",
    projectFileId: "file-1",
    fileName: "scene_1.rpy",
    labelName: null,
    conditions: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  const mockLabelDetail: LabelDetail = {
    ...mockLabel,
    lines: [],
    characters: [],
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("List Labels", () => {
    it("should list labels for a project", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [mockLabel] }),
      });

      const params: ListLabelsParams = { projectId: "proj-1" };
      const result = await labelsApi.listLabels(params);

      expect(result).toEqual([mockLabel]);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/labels?");
      expect(url).toContain("projectId=proj-1");
      expect(options?.method).toBeUndefined(); // GET is default
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [] }),
      });

      await labelsApi.listLabels({ projectId: "proj-1" });

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle empty list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [] }),
      });

      const result = await labelsApi.listLabels({ projectId: "proj-1" });

      expect(result).toEqual([]);
    });

    it("should filter by routeKey", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [mockLabel] }),
      });

      await labelsApi.listLabels({
        projectId: "proj-1",
        routeKey: "EILEEN",
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("routeKey=EILEEN");
    });

    it("should filter by status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [mockLabel] }),
      });

      await labelsApi.listLabels({
        projectId: "proj-1",
        status: "DRAFT",
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("status=DRAFT");
    });

    it("should filter by both routeKey and status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [mockLabel] }),
      });

      await labelsApi.listLabels({
        projectId: "proj-1",
        routeKey: "LUCAS",
        status: "REVIEW",
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("routeKey=LUCAS");
      expect(url).toContain("status=REVIEW");
    });

    it("should encode special characters in parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [] }),
      });

      await labelsApi.listLabels({
        projectId: "proj-1",
        routeKey: "SOME ROUTE",
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("routeKey=SOME+ROUTE");
    });

    it("should handle error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(
        labelsApi.listLabels({ projectId: "proj-1" })
      ).rejects.toThrow("Unauthorized");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        labelsApi.listLabels({ projectId: "proj-1" })
      ).rejects.toThrow("Network error");
    });
  });

  describe("Get Label", () => {
    it("should get label by ID with full details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ label: mockLabelDetail }),
      });

      const result = await labelsApi.getLabel("label-1");

      expect(result).toEqual(mockLabelDetail);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/labels/label-1");
      expect(options?.method).toBeUndefined(); // GET is default
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ label: mockLabelDetail }),
      });

      await labelsApi.getLabel("label-1");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should include lines and characters in detail", async () => {
      const detailWithContent: LabelDetail = {
        ...mockLabelDetail,
        lines: [
          {
            id: "line-1",
            labelId: "label-1",
            sequence: 1,
            contentType: "DIALOGUE",
            content: "Hello!",
            visualType: "BLACK",
            visualPrompt: null,
            speakerId: "char-1",
            speakerName: "Eileen",
            speakerTag: "a",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            conditions: null,
            visualStatements: null,
          },
        ],
        characters: [
          {
            id: "char-1",
            name: "a",
            displayName: "Eileen",
            renpyTag: "a",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ label: detailWithContent }),
      });

      const result = await labelsApi.getLabel("label-1");

      expect(result.lines).toHaveLength(1);
      expect(result.characters).toHaveLength(1);
      expect(result.lines[0].content).toBe("Hello!");
      expect(result.characters[0].renpyTag).toBe("a");
    });

    it("should handle not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Label not found" }),
      });

      await expect(labelsApi.getLabel("unknown")).rejects.toThrow(
        "Label not found"
      );
    });

    it("should handle forbidden access (wrong project)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden: no access to this label" }),
      });

      await expect(labelsApi.getLabel("label-1")).rejects.toThrow(
        "Forbidden: no access to this label"
      );
    });
  });

  describe("Request Headers", () => {
    it("should not set Content-Type header for GET requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ label: mockLabelDetail }),
      });

      await labelsApi.getLabel("label-1");

      expect(mockFetch.mock.calls[0][1]?.headers).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should throw generic error when response has no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => Promise.reject(new Error("JSON parse error")),
      });

      await expect(
        labelsApi.listLabels({ projectId: "proj-1" })
      ).rejects.toThrow("Unknown error");
    });

    it("should throw error with status code when no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(labelsApi.getLabel("label-1")).rejects.toThrow(
        "Request failed with status 503"
      );
    });
  });

  describe("URL Parameter Encoding", () => {
    it("should properly encode all query parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [] }),
      });

      await labelsApi.listLabels({
        projectId: "project with spaces & symbols!",
        routeKey: "route/with/slashes",
        status: "status?query",
      });

      const [url] = mockFetch.mock.calls[0];
      // Verify URL is properly encoded - spaces become + in query strings, & becomes %26
      expect(url).toContain("project+with+spaces+%26+symbols%21");
      expect(url).toContain("routeKey=route%2Fwith%2Fslashes");
      expect(url).toContain("status=status%3Fquery");
    });
  });
});
