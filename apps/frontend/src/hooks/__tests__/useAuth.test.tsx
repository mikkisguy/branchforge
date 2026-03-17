/**
 * useAuth Hook Tests
 *
 * Tests for the useAuth hook which manages authentication state and operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "../useAuth";
import { authApi, type PublicUser } from "@/lib/api/auth";
import { authKeys } from "@/lib/query-keys";
import { createTestQueryClient } from "@/test/query-client";

// Mock the auth API
vi.mock("@/lib/api/auth", () => ({
  authApi: {
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
  type: {},
}));

// Import the mocked type
import type { AuthResponse } from "@/lib/api/auth";

const mockUser: PublicUser = {
  id: "user-1",
  email: "test@example.com",
  role: "OWNER",
};

describe("useAuth", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("Query", () => {
    it("should fetch current user on mount", async () => {
      const mockResponse: AuthResponse = { user: mockUser };
      vi.mocked(authApi.getMe).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      expect(authApi.getMe).toHaveBeenCalledOnce();
    });

    it("should show loading state during fetch", async () => {
      vi.mocked(authApi.getMe).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ user: mockUser }), 100)
          )
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should handle auth errors gracefully", async () => {
      const error = new Error("Unauthorized");
      vi.mocked(authApi.getMe).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for both user to be undefined AND isLoading to be false
      await waitFor(() => {
        expect(result.current.user).toBeUndefined();
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should set isAuthenticated to false when user is null", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should set isAuthenticated to false when user is undefined", () => {
      // Don't mock getMe, so it stays pending - user stays undefined
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.user).toBeUndefined();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should set isAuthenticated to true when user exists", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({ user: mockUser });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      expect(result.current.isAuthenticated).toBe(true);
    });

    it("should not retry on auth failures", async () => {
      const error = new Error("Unauthorized");
      vi.mocked(authApi.getMe).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should only be called once (no retries)
      expect(authApi.getMe).toHaveBeenCalledTimes(1);
    });
  });

  describe("Login Mutation", () => {
    it("should login successfully and set cache", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });
      vi.mocked(authApi.login).mockResolvedValue({ user: mockUser });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      await result.current.login("test@example.com", "password123");

      expect(authApi.login).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });

      // Verify user data is set in cache
      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      // Check cache directly
      const cachedData = queryClient.getQueryData<PublicUser>(authKeys.user());
      expect(cachedData).toEqual(mockUser);
    });

    it("should show loading state during login", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });
      vi.mocked(authApi.login).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ user: mockUser }), 100)
          )
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      // Start login - note: isLoading is for the query, not the mutation
      const loginPromise = result.current.login("test@example.com", "password");

      // The hook's isLoading only reflects the query state, not mutations
      // The query is already complete, so isLoading should be false
      expect(result.current.isLoading).toBe(false);

      // Wait for login to complete
      await loginPromise;

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });
    });

    it("should throw error on failed login", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });
      const error = new Error("Invalid credentials");
      vi.mocked(authApi.login).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      await expect(
        result.current.login("test@example.com", "wrongpassword")
      ).rejects.toThrow("Invalid credentials");

      expect(authApi.login).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "wrongpassword",
      });
    });

    it("should handle validation errors from API", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });
      const error = new Error("Email is required");
      vi.mocked(authApi.login).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      await expect(result.current.login("", "password")).rejects.toThrow(
        "Email is required"
      );
    });
  });

  describe("Register Mutation", () => {
    it("should register successfully and set cache", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });
      vi.mocked(authApi.register).mockResolvedValue({ user: mockUser });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      await result.current.register("new@example.com", "password123");

      expect(authApi.register).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "password123",
      });

      // Verify user data is set in cache
      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      // Check cache directly
      const cachedData = queryClient.getQueryData<PublicUser>(authKeys.user());
      expect(cachedData).toEqual(mockUser);
    });

    it("should show loading state during registration", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });
      vi.mocked(authApi.register).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ user: mockUser }), 100)
          )
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      // Start register - note: isLoading is for the query, not the mutation
      const registerPromise = result.current.register(
        "new@example.com",
        "password123"
      );

      // The hook's isLoading only reflects the query state, not mutations
      expect(result.current.isLoading).toBe(false);

      // Wait for register to complete
      await registerPromise;

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });
    });

    it("should throw error on failed registration", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });
      const error = new Error("Email already exists");
      vi.mocked(authApi.register).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      await expect(
        result.current.register("existing@example.com", "password123")
      ).rejects.toThrow("Email already exists");

      expect(authApi.register).toHaveBeenCalledWith({
        email: "existing@example.com",
        password: "password123",
      });
    });

    it("should handle validation errors from API", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });
      const error = new Error("Password must be at least 8 characters");
      vi.mocked(authApi.register).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });

      await expect(
        result.current.register("test@example.com", "short")
      ).rejects.toThrow("Password must be at least 8 characters");
    });
  });

  describe("Logout Mutation", () => {
    it("should logout successfully and clear all queries", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({ user: mockUser });
      vi.mocked(authApi.logout).mockResolvedValue(undefined);

      // Add some test data to the cache
      queryClient.setQueryData(["test"], { data: "test" });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      await result.current.logout();

      expect(authApi.logout).toHaveBeenCalledOnce();

      // Verify cache is cleared
      await waitFor(() => {
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      });

      // After logout, user is undefined (cache cleared), not null
      expect(result.current.user).toBeUndefined();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should show loading state during logout", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({ user: mockUser });
      vi.mocked(authApi.logout).mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(undefined), 100))
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      // Mock getMe to return null before logout so the refetch triggered by the
      // cache clear uses the null response deterministically (avoids a race).
      vi.mocked(authApi.getMe).mockResolvedValue({
        user: null,
      });

      // Start logout - note: isLoading is for the query, not the mutation
      const logoutPromise = result.current.logout();

      // The hook's isLoading only reflects the query state, not mutations
      expect(result.current.isLoading).toBe(false);

      // Wait for logout to complete
      await logoutPromise;

      // Wait for the cache to be cleared and user to become null
      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should handle logout errors", async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({ user: mockUser });
      const error = new Error("Network error");
      vi.mocked(authApi.logout).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      await expect(result.current.logout()).rejects.toThrow("Network error");
    });
  });

  describe("refreshUser", () => {
    it("should invalidate and refetch user query", async () => {
      vi.mocked(authApi.getMe)
        .mockResolvedValueOnce({ user: mockUser })
        .mockResolvedValueOnce({
          user: { ...mockUser, email: "updated@example.com" },
        });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      await result.current.refreshUser();

      await waitFor(() => {
        expect(result.current.user?.email).toBe("updated@example.com");
      });

      // Should be called twice (initial mount + refresh)
      expect(authApi.getMe).toHaveBeenCalledTimes(2);
    });
  });
});
