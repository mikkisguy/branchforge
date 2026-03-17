/**
 * useSettings Hook Tests
 *
 * Tests for the useSettings hook which manages settings with optimistic updates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSettings } from "../useSettings";
import { settingsApi } from "@/lib/api/settings";
import { settingsKeys } from "@/lib/query-keys";
import type { PublicUser } from "@/lib/api/auth";

// Mock the settings API
vi.mock("@/lib/api/settings", () => ({
  settingsApi: {
    getSignUpStatus: vi.fn(),
    updateSetting: vi.fn(),
  },
}));

// Mock the toast context
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

describe("useSettings", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
        },
        mutations: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("Query", () => {
    it("should fetch sign-ups status on mount", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: true });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(true);
      });

      expect(settingsApi.getSignUpStatus).toHaveBeenCalledOnce();
    });

    it("should show loading during fetch", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ enabled: true }), 100))
      );

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should handle API errors gracefully", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(settingsApi.getSignUpStatus).mockRejectedValue(error);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fail open - undefined means we don't know, so allow signups
      expect(result.current.signUpsEnabled).toBeUndefined();
    });

    it("should not retry on fetch failures", async () => {
      const error = new Error("Failed to fetch");
      vi.mocked(settingsApi.getSignUpStatus).mockRejectedValue(error);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should only be called once (no retries)
      expect(settingsApi.getSignUpStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("Optimistic Update Pattern", () => {
    it("should optimistically update sign-ups setting", async () => {
      // Set up initial state and user with OWNER role
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: false });
      vi.mocked(settingsApi.updateSetting).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ key: "sign_ups_enabled", value: true }), 100))
      );

      // Set a user with OWNER role in cache
      const mockUser: PublicUser = {
        id: "user-1",
        email: "admin@example.com",
        role: "OWNER",
      };
      queryClient.setQueryData(["auth", "user"], { user: mockUser });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(false);
      });

      // Start the mutation
      const mutationPromise = result.current.updateSignUpsSetting(true);

      // The optimistic update should have happened - check the hook state
      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(true);
      });

      // Wait for mutation to complete
      await mutationPromise;
    });

    it("should rollback optimistic update on error", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: false });
      const error = new Error("Update failed");
      vi.mocked(settingsApi.updateSetting).mockRejectedValue(error);

      const mockUser: PublicUser = {
        id: "user-1",
        email: "admin@example.com",
        role: "OWNER",
      };
      queryClient.setQueryData(["auth", "user"], { user: mockUser });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(false);
      });

      // Try to update - should fail
      await expect(
        result.current.updateSignUpsSetting(true)
      ).rejects.toThrow("Update failed");

      // Verify rollback happened - cache should be restored to original value
      await waitFor(() => {
        const cachedData = queryClient.getQueryData<boolean>(settingsKeys.signUps());
        expect(cachedData).toBe(false);
      });

      // Verify error toast was shown
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to update setting. The original value has been restored.",
        "Error"
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it("should show success toast on successful update", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: false });
      vi.mocked(settingsApi.updateSetting).mockResolvedValue({ key: "sign_ups_enabled", value: true });

      const mockUser: PublicUser = {
        id: "user-1",
        email: "admin@example.com",
        role: "OWNER",
      };
      queryClient.setQueryData(["auth", "user"], { user: mockUser });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(false);
      });

      await result.current.updateSignUpsSetting(true);

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith(
          "Sign-ups have been enabled",
          "Setting saved"
        );
      });

      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("should show success toast when disabling sign-ups", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: true });
      vi.mocked(settingsApi.updateSetting).mockResolvedValue({ key: "sign_ups_enabled", value: true });

      const mockUser: PublicUser = {
        id: "user-1",
        email: "admin@example.com",
        role: "OWNER",
      };
      queryClient.setQueryData(["auth", "user"], { user: mockUser });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(true);
      });

      await result.current.updateSignUpsSetting(false);

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith(
          "Sign-ups have been disabled",
          "Setting saved"
        );
      });
    });

    it("should invalidate queries after update settles", async () => {
      vi.mocked(settingsApi.getSignUpStatus)
        .mockResolvedValueOnce({ enabled: false })
        .mockResolvedValueOnce({ enabled: true }); // After invalidation
      vi.mocked(settingsApi.updateSetting).mockResolvedValue({ key: "sign_ups_enabled", value: true });

      const mockUser: PublicUser = {
        id: "user-1",
        email: "admin@example.com",
        role: "OWNER",
      };
      queryClient.setQueryData(["auth", "user"], { user: mockUser });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(false);
      });

      await result.current.updateSignUpsSetting(true);

      // Wait for invalidation to trigger refetch
      await waitFor(() => {
        expect(settingsApi.getSignUpStatus).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Authorization", () => {
    it("should throw error when non-OWNER tries to update", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: false });

      // Set a user with READER role (not OWNER)
      const mockUser: PublicUser = {
        id: "user-1",
        email: "user@example.com",
        role: "READER",
      };
      queryClient.setQueryData(["auth", "user"], { user: mockUser });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(false);
      });

      // Should throw error for non-OWNER user
      await expect(
        result.current.updateSignUpsSetting(true)
      ).rejects.toThrow("Only administrators can change this setting");

      // API should not be called
      expect(settingsApi.updateSetting).not.toHaveBeenCalled();
    });

    it("should throw error when no user tries to update", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: false });

      // No user in cache
      queryClient.setQueryData(["auth", "user"], null);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(false);
      });

      // Should throw error when no user
      await expect(
        result.current.updateSignUpsSetting(true)
      ).rejects.toThrow("Only administrators can change this setting");
    });
  });

  describe("Loading States", () => {
    it("should show saving state during mutation", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: false });
      vi.mocked(settingsApi.updateSetting).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ key: "sign_ups_enabled", value: true }), 100))
      );

      const mockUser: PublicUser = {
        id: "user-1",
        email: "admin@example.com",
        role: "OWNER",
      };
      queryClient.setQueryData(["auth", "user"], { user: mockUser });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(false);
      });

      // Start update but don't await
      const updatePromise = result.current.updateSignUpsSetting(true);

      // Wait for saving state to be set
      await waitFor(() => {
        expect(result.current.isSaving).toBe(true);
      });

      await updatePromise;

      await waitFor(() => {
        expect(result.current.isSaving).toBe(false);
      });
    });

    it("should not show saving state when not updating", async () => {
      vi.mocked(settingsApi.getSignUpStatus).mockResolvedValue({ enabled: true });

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.signUpsEnabled).toBe(true);
      });

      expect(result.current.isSaving).toBe(false);
    });
  });
});
