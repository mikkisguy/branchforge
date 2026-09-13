/**
 * Project Files API Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { projectFilesApi } from "../project-files";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("projectFilesApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateFile", () => {
    it("returns success payload on 200", async () => {
      const payload = {
        success: true,
        contentHash: "hash-1",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => payload,
      });

      const result = await projectFilesApi.updateFile("file-1", "content");

      expect(result).toEqual(payload);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/files/file-1");
      expect(options?.method).toBe("PUT");
      expect(JSON.parse(options?.body as string)).toEqual({
        content: "content",
        expectedContentHash: undefined,
      });
    });

    it("passes through 409 conflict responses instead of throwing", async () => {
      const conflict = {
        success: false,
        conflict: {
          reason: "STALE_CONTENT_HASH",
          currentContentHash: "server-hash",
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => conflict,
      });

      const result = await projectFilesApi.updateFile("file-1", "content", {
        expectedContentHash: "stale-hash",
      });

      expect(result).toEqual(conflict);
    });
  });

  describe("importZip", () => {
    it("uploads a zip file via fetch when no progress callback is provided", async () => {
      const zipFile = new File(["zip"], "project.zip", {
        type: "application/zip",
      });
      const responseBody = {
        success: true,
        filesImported: 2,
        filesUpdated: 0,
        filesSkipped: 0,
        filesFailed: 0,
        labelsCreated: 1,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseBody,
      });

      const result = await projectFilesApi.importZip("proj-1", zipFile);

      expect(result).toEqual(responseBody);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1/import/zip");
      expect(options?.method).toBe("POST");
      expect(options?.body).toBeInstanceOf(FormData);
    });

    it("rejects non-zip files before upload", async () => {
      const textFile = new File(["txt"], "notes.txt", { type: "text/plain" });

      await expect(
        projectFilesApi.importZip("proj-1", textFile)
      ).rejects.toThrow("File must be a .zip file");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("listExports", () => {
    it("lists export history for a project", async () => {
      const exports = [
        {
          id: "exp-1",
          projectId: "proj-1",
          format: "zip",
          fileName: "project.zip",
          fileSize: 1024,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exports }),
      });

      const result = await projectFilesApi.listExports("proj-1");

      expect(result).toEqual(exports);
      expect(mockFetch.mock.calls[0][0]).toContain("/projects/proj-1/exports");
    });
  });

  describe("generateExport", () => {
    it("creates a new export", async () => {
      const generated = {
        id: "exp-2",
        fileName: "project.zip",
        fileSize: 2048,
        format: "zip",
        createdAt: "2024-01-02T00:00:00.000Z",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => generated,
      });

      const result = await projectFilesApi.generateExport("proj-1");

      expect(result).toEqual(generated);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/projects/proj-1/export");
      expect(options?.method).toBe("POST");
    });
  });

  describe("downloadExport", () => {
    it("downloads an export and triggers a browser save", async () => {
      const mockClick = vi.fn();
      const link = { href: "", download: "", click: mockClick };
      const anchor = link as unknown as HTMLAnchorElement;
      const appendChildSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation(() => anchor);
      const removeChildSpy = vi
        .spyOn(document.body, "removeChild")
        .mockImplementation(() => anchor);
      vi.spyOn(document, "createElement").mockReturnValue(anchor);
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === "Content-Disposition" ? 'filename="export.zip"' : null,
        },
        blob: async () => new Blob(["zip"]),
      });

      await projectFilesApi.downloadExport("proj-1", "exp-1");

      expect(mockFetch.mock.calls[0][0]).toContain(
        "/projects/proj-1/exports/exp-1/download"
      );
      expect(mockClick).toHaveBeenCalled();
      expect(link.download).toBe("export.zip");

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it("throws when download fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Export not found" }),
      });

      await expect(
        projectFilesApi.downloadExport("proj-1", "missing")
      ).rejects.toThrow("Export not found");
    });
  });
});
