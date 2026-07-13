/**
 * RegisterPage Component Tests
 *
 * Tests for the RegisterPage component which handles user registration.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RegisterPage } from "../register";
import { createTestQueryClient } from "@/test/query-client";

// Mock the useAuth hook
const mockRegister = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    register: mockRegister,
  }),
}));

// Mock the useSettings hook
const mockUseSettings = vi.fn();
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => mockUseSettings(),
}));

// Mock BASE_URL
vi.mock("@/lib/constants", () => ({
  BASE_URL: "/",
}));

// Mock APP_NAME
vi.mock("@/lib/version", () => ({
  APP_NAME: "BranchForge",
}));

describe("RegisterPage", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
    // Default to signups enabled and not loading
    mockUseSettings.mockReturnValue({
      signUpsEnabled: true,
      isLoading: false,
      isSaving: false,
      updateSignUpsSetting: vi.fn(),
    });
  });

  describe("Rendering", () => {
    it("should render form with all fields", () => {
      render(<RegisterPage />, { wrapper });

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /create account/i })
      ).toBeInTheDocument();
    });

    it("should show email placeholder", () => {
      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute("placeholder", "you@example.com");
    });

    it("should show password placeholders", () => {
      render(<RegisterPage />, { wrapper });

      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      expect(passwordInput).toHaveAttribute("placeholder", "••••••••");
      expect(confirmPasswordInput).toHaveAttribute("placeholder", "••••••••");
    });

    it("should show password inputs as type password", () => {
      render(<RegisterPage />, { wrapper });

      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      expect(passwordInput).toHaveAttribute("type", "password");
      expect(confirmPasswordInput).toHaveAttribute("type", "password");
    });

    it("should show link to login page", () => {
      render(<RegisterPage />, { wrapper });

      expect(
        screen.getByText(/already have an account\?/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /sign in/i })
      ).toBeInTheDocument();
    });

    it("should have proper HTML5 validation attributes", () => {
      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      expect(emailInput).toHaveAttribute("type", "email");
      expect(emailInput).toHaveAttribute("required");
      expect(passwordInput).toHaveAttribute("required");
      expect(passwordInput).toHaveAttribute("minLength", "8");
      expect(confirmPasswordInput).toHaveAttribute("required");
      expect(confirmPasswordInput).toHaveAttribute("minLength", "8");
    });
  });

  describe("Settings Loading State", () => {
    it("should show loading state while checking settings", () => {
      mockUseSettings.mockReturnValue({
        signUpsEnabled: true,
        isLoading: true,
        isSaving: false,
        updateSignUpsSetting: vi.fn(),
      });

      render(<RegisterPage />, { wrapper });

      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("should not show form while loading", () => {
      mockUseSettings.mockReturnValue({
        signUpsEnabled: true,
        isLoading: true,
        isSaving: false,
        updateSignUpsSetting: vi.fn(),
      });

      render(<RegisterPage />, { wrapper });

      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });
  });

  describe("Signups Disabled State", () => {
    it("should show registration closed message when signups disabled", () => {
      mockUseSettings.mockReturnValue({
        signUpsEnabled: false,
        isLoading: false,
        isSaving: false,
        updateSignUpsSetting: vi.fn(),
      });

      render(<RegisterPage />, { wrapper });

      expect(screen.getByText("Registration Closed")).toBeInTheDocument();
      expect(
        screen.getByText(/new user registration is currently disabled/i)
      ).toBeInTheDocument();
    });

    it("should show link to login when signups disabled", () => {
      mockUseSettings.mockReturnValue({
        signUpsEnabled: false,
        isLoading: false,
        isSaving: false,
        updateSignUpsSetting: vi.fn(),
      });

      render(<RegisterPage />, { wrapper });

      const loginLink = screen.getByRole("link", { name: /sign in/i });
      expect(loginLink).toHaveAttribute("href", "/login");
    });

    it("should not show form when signups disabled", () => {
      mockUseSettings.mockReturnValue({
        signUpsEnabled: false,
        isLoading: false,
        isSaving: false,
        updateSignUpsSetting: vi.fn(),
      });

      render(<RegisterPage />, { wrapper });

      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(/confirm password/i)
      ).not.toBeInTheDocument();
    });
  });

  describe("Form Submission", () => {
    it("should submit form with email and password", async () => {
      const user = userEvent.setup({ delay: null });
      mockRegister.mockResolvedValue(undefined);

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.type(confirmPasswordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(
          "test@example.com",
          "password123"
        );
      });
    });

    it("should show loading state during submission", async () => {
      const user = userEvent.setup({ delay: null });
      mockRegister.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.type(confirmPasswordInput, "password123");
      await user.click(submitButton);

      // Should show loading state
      await waitFor(() => {
        expect(submitButton).toHaveTextContent("Creating account…");
      });

      // Button and inputs should be disabled
      expect(submitButton).toBeDisabled();
      expect(emailInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();
      expect(confirmPasswordInput).toBeDisabled();
    });

    it("should display error message on failed registration", async () => {
      const user = userEvent.setup({ delay: null });
      const error = new Error("Email already exists");
      mockRegister.mockRejectedValue(error);

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "existing@example.com");
      await user.type(passwordInput, "password123");
      await user.type(confirmPasswordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getAllByText("Email already exists")[0]
        ).toBeInTheDocument();
      });
    });

    it("should display error message and keep it visible", async () => {
      const user = userEvent.setup({ delay: null });
      mockRegister.mockRejectedValue(new Error("Previous error"));

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.type(confirmPasswordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getAllByText("Previous error")[0]).toBeInTheDocument();
      });

      // Type in input to verify error doesn't auto-clear
      await user.type(emailInput, "x");

      // Error should remain visible
      expect(screen.getAllByText("Previous error")[0]).toBeInTheDocument();
    });

    it("should handle non-Error errors", async () => {
      const user = userEvent.setup({ delay: null });
      mockRegister.mockRejectedValue("String error");

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.type(confirmPasswordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Registration failed")).toBeInTheDocument();
      });
    });

    it("should redirect after successful registration", async () => {
      const user = userEvent.setup({ delay: null });
      mockRegister.mockResolvedValue(undefined);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/register"]}>
            <Routes>
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/" element={<div>Dashboard</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.type(confirmPasswordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
      });
    });
  });

  describe("Client-side Validation", () => {
    it("should require email field", async () => {
      const user = userEvent.setup({ delay: null });

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      // Try to submit with empty email (browser's HTML5 validation should block)
      await user.click(submitButton);

      // Email input should be invalid
      expect(emailInput).toBeInvalid();
    });

    it("should require password field", async () => {
      const user = userEvent.setup({ delay: null });

      render(<RegisterPage />, { wrapper });

      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      // Try to submit with empty password (browser's HTML5 validation should block)
      await user.click(submitButton);

      // Password input should be invalid
      expect(passwordInput).toBeInvalid();
    });

    it("should require confirm password field", async () => {
      const user = userEvent.setup({ delay: null });

      render(<RegisterPage />, { wrapper });

      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      // Try to submit with empty confirm password (browser's HTML5 validation should block)
      await user.click(submitButton);

      // Confirm password input should be invalid
      expect(confirmPasswordInput).toBeInvalid();
    });

    it("should validate password length minimum", async () => {
      const user = userEvent.setup({ delay: null });

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "short");
      await user.type(confirmPasswordInput, "short");
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getAllByText("Password must be at least 8 characters")[0]
        ).toBeInTheDocument();
      });

      expect(mockRegister).not.toHaveBeenCalled();
    });

    it("should validate passwords match", async () => {
      const user = userEvent.setup({ delay: null });

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.type(confirmPasswordInput, "different123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getAllByText("Passwords do not match")[0]
        ).toBeInTheDocument();
      });

      expect(mockRegister).not.toHaveBeenCalled();
    });

    it("should enforce email format via HTML5 validation", () => {
      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);

      expect(emailInput).toHaveAttribute("type", "email");
    });

    it("should enforce minimum password length via HTML5 validation", () => {
      render(<RegisterPage />, { wrapper });

      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      expect(passwordInput).toHaveAttribute("minLength", "8");
      expect(confirmPasswordInput).toHaveAttribute("minLength", "8");
    });
  });

  describe("Navigation", () => {
    it("should have link to login page", () => {
      render(<RegisterPage />, { wrapper });

      const loginLink = screen.getByRole("link", { name: /sign in/i });
      expect(loginLink).toHaveAttribute("href", "/login");
    });
  });

  describe("Disabled State", () => {
    it("should re-enable form inputs after submission fails", async () => {
      const user = userEvent.setup({ delay: null });
      // Simulate failed submission to keep component mounted and verify re-enabling
      mockRegister.mockImplementation(
        () =>
          new Promise<void>((_resolve, reject) =>
            setTimeout(() => reject(new Error("Registration failed")), 100)
          )
      );

      render(<RegisterPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.type(confirmPasswordInput, "password123");
      await user.click(submitButton);

      // Wait for loading to start
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });

      // Wait for loading to complete after failure - all inputs should be re-enabled
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      expect(emailInput).not.toBeDisabled();
      expect(passwordInput).not.toBeDisabled();
      expect(confirmPasswordInput).not.toBeDisabled();
    });
  });
});
