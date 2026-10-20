import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, logError } from "../logger.js";

afterEach(() => vi.restoreAllMocks());

describe("logError", () => {
  it("records nested PostgreSQL diagnostics without arbitrary driver fields", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "labels_project_file_label_name_unique_idx",
      privateDriverField: "secret",
    });
    logError(
      "gitlab_sync.import_failed",
      { projectId: "project" },
      new Error("Failed query", { cause: new Error("wrapper", { cause }) })
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Failed query",
        causes: [
          { message: "wrapper" },
          {
            message: "duplicate key",
            code: "23505",
            constraint: "labels_project_file_label_name_unique_idx",
          },
        ],
      })
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain("privateDriverField");
  });

  it("stops at cyclic causes", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const error = new Error("cycle");
    error.cause = error;
    logError("failure", {}, error);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ causes: [] }));
  });
});
