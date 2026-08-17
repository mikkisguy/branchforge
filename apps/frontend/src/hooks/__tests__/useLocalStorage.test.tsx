import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPrefixedStorageKey,
  readLocalStorageItem,
  removeLocalStorageItem,
  useLocalStorage,
  useLocalStorageBoolean,
  useLocalStorageNumber,
  writeLocalStorageItem,
} from "../useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("prefixes keys consistently", () => {
    expect(getPrefixedStorageKey("theme")).toBe("branchforge:theme");
    expect(getPrefixedStorageKey("branchforge:theme")).toBe(
      "branchforge:theme"
    );
  });

  it("reads and writes values with default JSON serialization", () => {
    localStorage.setItem(
      "branchforge:editor:settings",
      JSON.stringify({ x: 1 })
    );

    const { result } = renderHook(() =>
      useLocalStorage("editor:settings", { x: 0 })
    );

    expect(result.current[0]).toEqual({ x: 1 });

    act(() => {
      result.current[1]({ x: 2 });
    });

    expect(localStorage.getItem("branchforge:editor:settings")).toBe(
      JSON.stringify({ x: 2 })
    );
  });

  it("supports updater function setters", () => {
    const { result } = renderHook(() => useLocalStorageNumber("count", 1));

    act(() => {
      result.current[1]((prev) => prev + 4);
    });

    expect(result.current[0]).toBe(5);
    expect(localStorage.getItem("branchforge:count")).toBe("5");
  });

  it("falls back to default when validation fails", () => {
    localStorage.setItem("branchforge:port", "0");

    const { result } = renderHook(() =>
      useLocalStorageNumber("port", 8080, {
        validate: (value) => value >= 1,
      })
    );

    expect(result.current[0]).toBe(8080);
  });

  it("warns and falls back when read throws", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Spy the localStorage instance — not Storage.prototype — so sessionStorage
    // and other Storage consumers stay unaffected.
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("read-failure");
    });

    const { result } = renderHook(() => useLocalStorage("theme", "forest"));

    expect(result.current[0]).toBe("forest");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("warns and keeps state when write throws", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("write-failure");
    });

    const { result } = renderHook(() => useLocalStorageNumber("size", 12));

    act(() => {
      result.current[1](16);
    });

    expect(result.current[0]).toBe(16);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("clears only localStorage and leaves sessionStorage intact", () => {
    localStorage.setItem("branchforge:isolation", "local");
    sessionStorage.setItem("branchforge:isolation", "session");

    try {
      localStorage.clear();

      expect(localStorage.getItem("branchforge:isolation")).toBeNull();
      expect(sessionStorage.getItem("branchforge:isolation")).toBe("session");
    } finally {
      sessionStorage.removeItem("branchforge:isolation");
    }
  });

  it("supports boolean convenience hook", () => {
    localStorage.setItem("branchforge:write:focus-mode", "true");

    const { result } = renderHook(() =>
      useLocalStorageBoolean("write:focus-mode", false)
    );

    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1](false);
    });

    expect(localStorage.getItem("branchforge:write:focus-mode")).toBe("false");
  });

  it("supports localStorage helper functions", () => {
    writeLocalStorageItem("branchforge:test:key", "value");
    expect(readLocalStorageItem("branchforge:test:key")).toBe("value");

    removeLocalStorageItem("branchforge:test:key");
    expect(readLocalStorageItem("branchforge:test:key")).toBeNull();
  });
});
