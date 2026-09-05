import { describe, expect, it } from "vitest";
import { canonicalizeRpyFilePath } from "./rpy-file-path.js";

describe("canonicalizeRpyFilePath", () => {
  it("trims surrounding whitespace", () => {
    expect(canonicalizeRpyFilePath("  labels/act  ")).toEqual({
      ok: true,
      filePath: "labels/act.rpy",
    });
  });

  it("converts backslashes to forward slashes", () => {
    expect(canonicalizeRpyFilePath("labels\\act")).toEqual({
      ok: true,
      filePath: "labels/act.rpy",
    });
  });

  it("drops harmless empty and ./ segments", () => {
    expect(canonicalizeRpyFilePath("labels/./act")).toEqual({
      ok: true,
      filePath: "labels/act.rpy",
    });
  });

  it("appends .rpy when no extension is present", () => {
    expect(canonicalizeRpyFilePath("labels/act")).toEqual({
      ok: true,
      filePath: "labels/act.rpy",
    });
  });

  it("normalizes .RPY extension to .rpy without changing other casing", () => {
    expect(canonicalizeRpyFilePath("foo.RPY")).toEqual({
      ok: true,
      filePath: "foo.rpy",
    });
    expect(canonicalizeRpyFilePath("Labels/Act.RPY")).toEqual({
      ok: true,
      filePath: "Labels/Act.rpy",
    });
  });

  it("rejects empty input", () => {
    expect(canonicalizeRpyFilePath("")).toEqual({
      ok: false,
      code: "EMPTY",
      message: "File path cannot be empty",
    });
    expect(canonicalizeRpyFilePath("   ")).toEqual({
      ok: false,
      code: "EMPTY",
      message: "File path cannot be empty",
    });
  });

  it("rejects absolute paths", () => {
    expect(canonicalizeRpyFilePath("/labels/act")).toMatchObject({
      ok: false,
      code: "ABSOLUTE",
    });
    expect(canonicalizeRpyFilePath("C:\\labels\\act")).toMatchObject({
      ok: false,
      code: "ABSOLUTE",
    });
    expect(canonicalizeRpyFilePath("\\\\server\\share\\act")).toMatchObject({
      ok: false,
      code: "ABSOLUTE",
    });
  });

  it("rejects parent directory traversal", () => {
    expect(canonicalizeRpyFilePath("../labels/act")).toMatchObject({
      ok: false,
      code: "TRAVERSAL",
    });
    expect(canonicalizeRpyFilePath("labels/../act")).toMatchObject({
      ok: false,
      code: "TRAVERSAL",
    });
  });

  it("rejects C0, C1, Unicode line separators, and bidi controls before trim", () => {
    expect(canonicalizeRpyFilePath("labels/act\u001f.rpy")).toMatchObject({
      ok: false,
      code: "CONTROL",
    });
    expect(canonicalizeRpyFilePath("labels/act .rpy")).toEqual({
      ok: true,
      filePath: "labels/act .rpy",
    });
    expect(canonicalizeRpyFilePath("labels/act\u007f.rpy")).toMatchObject({
      ok: false,
      code: "CONTROL",
    });
    expect(canonicalizeRpyFilePath("labels/act\u0085.rpy")).toMatchObject({
      ok: false,
      code: "CONTROL",
    });
    expect(canonicalizeRpyFilePath("labels/act\u009f.rpy")).toMatchObject({
      ok: false,
      code: "CONTROL",
    });
    expect(canonicalizeRpyFilePath("labels/act\u2028.rpy")).toMatchObject({
      ok: false,
      code: "CONTROL",
    });
    expect(canonicalizeRpyFilePath("labels/act\u2029.rpy")).toMatchObject({
      ok: false,
      code: "CONTROL",
    });
    expect(canonicalizeRpyFilePath("\tlabels/act.rpy")).toMatchObject({
      ok: false,
      code: "CONTROL",
    });
    expect(canonicalizeRpyFilePath("labels/\u202Eact.rpy")).toMatchObject({
      ok: false,
      code: "CONTROL",
    });
  });

  it("rejects paths longer than 500 characters", () => {
    const longPath = `${"a".repeat(497)}.rpy`;
    expect(canonicalizeRpyFilePath(longPath)).toMatchObject({
      ok: false,
      code: "TOO_LONG",
    });
  });

  it("rejects non-.rpy extensions", () => {
    expect(canonicalizeRpyFilePath("labels/act.txt")).toMatchObject({
      ok: false,
      code: "EXTENSION",
    });
  });

  it("rejects reserved basenames case-insensitively", () => {
    for (const reserved of [
      "branchforge_variables.rpy",
      "BranchForge_Stats.RPY",
      "labels/branchforge_definitions.rpy",
    ]) {
      expect(canonicalizeRpyFilePath(reserved)).toMatchObject({
        ok: false,
        code: "RESERVED",
      });
    }
  });
});
