/**
 * Settings API Unit Tests
 *
 * Tests for settings management API methods.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { settingsApi } from "../settings";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Settings API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Get Sign Up Status", () => {
    it("should get sign up status successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: true }),
      });

      const result = await settingsApi.getSignUpStatus();

      expect(result).toEqual({ enabled: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/public/settings/signups");
      expect(options?.method).toBeUndefined(); // GET is default
    });

    it("should handle disabled sign ups", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: false }),
      });

      const result = await settingsApi.getSignUpStatus();

      expect(result).toEqual({ enabled: false });
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: true }),
      });

      await settingsApi.getSignUpStatus();

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      await expect(settingsApi.getSignUpStatus()).rejects.toThrow(
        "Internal server error"
      );
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(settingsApi.getSignUpStatus()).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("Get All Settings", () => {
    it("should get all settings successfully", async () => {
      const mockSettings = {
        signups: true,
        maxMeterDelta: 10,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ settings: mockSettings }),
      });

      const result = await settingsApi.getAllSettings();

      expect(result).toEqual({ settings: mockSettings });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/admin/settings");
      expect(options?.method).toBeUndefined(); // GET is default
    });

    it("should handle empty settings", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ settings: {} }),
      });

      const result = await settingsApi.getAllSettings();

      expect(result).toEqual({ settings: {} });
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ settings: {} }),
      });

      await settingsApi.getAllSettings();

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle unauthorized access", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(settingsApi.getAllSettings()).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("should handle forbidden access (non-admin)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden: admin access required" }),
      });

      await expect(settingsApi.getAllSettings()).rejects.toThrow(
        "Forbidden: admin access required"
      );
    });
  });

  describe("Update Setting", () => {
    it("should update setting successfully", async () => {
      const mockResponse = {
        key: "signups",
        value: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await settingsApi.updateSetting("signups", false);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/admin/settings/signups");
      expect(options?.method).toBe("PUT");
    });

    it("should send value in request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: "maxMeterDelta", value: 15 }),
      });

      await settingsApi.updateSetting("maxMeterDelta", 15);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual({ value: 15 });
    });

    it.each([
      ["boolean", "signups", true],
      ["number", "maxMeterDelta", 20],
      ["string", "title", "My Title"],
      ["null", "nullable", null],
    ])("should handle %s values", async (_type, key, value) => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key, value }),
      });

      await settingsApi.updateSetting(key, value);

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string
      );
      expect(requestBody).toEqual({ value });
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: "test", value: "test" }),
      });

      await settingsApi.updateSetting("test", "test");

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe("include");
    });

    it("should handle validation error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid setting value" }),
      });

      await expect(
        settingsApi.updateSetting("maxMeterDelta", "invalid")
      ).rejects.toThrow("Invalid setting value");
    });

    it("should handle unknown setting key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Setting not found" }),
      });

      await expect(
        settingsApi.updateSetting("unknown", "value")
      ).rejects.toThrow("Setting not found");
    });

    it("should handle unauthorized access", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(settingsApi.updateSetting("test", "value")).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("should handle forbidden access (non-admin)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden: admin access required" }),
      });

      await expect(settingsApi.updateSetting("test", "value")).rejects.toThrow(
        "Forbidden: admin access required"
      );
    });
  });

  describe("Request Headers", () => {
    it("should set Content-Type header for PUT requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: "test", value: "test" }),
      });

      await settingsApi.updateSetting("test", "test");

      expect(mockFetch.mock.calls[0][1]?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
    });
  });

  describe("Error Handling", () => {
    it("should throw generic error when response has no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => Promise.reject(new Error("JSON parse error")),
      });

      await expect(settingsApi.getAllSettings()).rejects.toThrow(
        "Unknown error"
      );
    });

    it("should throw error with status code when no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(settingsApi.getSignUpStatus()).rejects.toThrow(
        "Request failed with status 503"
      );
    });
  });
});
