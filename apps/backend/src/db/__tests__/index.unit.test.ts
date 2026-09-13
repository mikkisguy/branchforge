import { describe, expect, it } from "vitest";
import { getDbTimeoutConfig } from "../index.js";

describe("getDbTimeoutConfig", () => {
  it("returns safe positive defaults", () => {
    const config = getDbTimeoutConfig({});

    expect(config.connectTimeoutMs).toBeGreaterThan(0);
    expect(config.statementTimeoutMs).toBeGreaterThan(0);
    expect(config.queryTimeoutMs).toBeGreaterThan(0);
  });

  it("honors environment overrides", () => {
    const config = getDbTimeoutConfig({
      DB_CONNECT_TIMEOUT_MS: "5000",
      DB_STATEMENT_TIMEOUT_MS: "15000",
      DB_QUERY_TIMEOUT_MS: "20000",
    });

    expect(config).toEqual({
      connectTimeoutMs: 5_000,
      statementTimeoutMs: 15_000,
      queryTimeoutMs: 20_000,
    });
  });

  it("rejects non-positive and malformed values", () => {
    expect(() => getDbTimeoutConfig({ DB_CONNECT_TIMEOUT_MS: "0" })).toThrow(
      "DB_CONNECT_TIMEOUT_MS must be a positive integer"
    );
    expect(() => getDbTimeoutConfig({ DB_STATEMENT_TIMEOUT_MS: "-1" })).toThrow(
      "DB_STATEMENT_TIMEOUT_MS must be a positive integer"
    );
    expect(() => getDbTimeoutConfig({ DB_QUERY_TIMEOUT_MS: "abc" })).toThrow(
      "DB_QUERY_TIMEOUT_MS must be a positive integer"
    );
  });

  it("treats empty overrides as unset", () => {
    const config = getDbTimeoutConfig({
      DB_CONNECT_TIMEOUT_MS: "",
      DB_STATEMENT_TIMEOUT_MS: "",
      DB_QUERY_TIMEOUT_MS: "",
    });

    expect(config.connectTimeoutMs).toBeGreaterThan(0);
    expect(config.statementTimeoutMs).toBeGreaterThan(0);
    expect(config.queryTimeoutMs).toBeGreaterThan(0);
  });
});
