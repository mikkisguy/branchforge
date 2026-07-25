/**
 * LoginPage Component Tests
 *
 * Tests for the LoginPage component which handles user authentication.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { LoginPage } from "../login";
import { createTestQueryClient } from "@/test/query-client";

// Mock the useAuth hook
const mockLogin = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

// Mock BASE_URL
vi.mock("@/lib/constants", () => ({
  BASE_URL: "/",
}));

// Mock APP_NAME
vi.mock("@/lib/version", () => ({
  APP_NAME: "BranchForge",
}));

describe("LoginPage", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render form with all fields", () => {
      render(<LoginPage />, { wrapper });

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign in/i })
      ).toBeInTheDocument();
    });

    it("should show email placeholder", () => {
      render(<LoginPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute("placeholder", "you@example.com");
    });

    it("should show password placeholder", () => {
      render(<LoginPage />, { wrapper });

      const passwordInput = screen.getByLabelText(/^password$/i);
      expect(passwordInput).toHaveAttribute("placeholder", "••••••••");
    });

    it("should show password input as type password", () => {
      render(<LoginPage />, { wrapper });

      const passwordInput = screen.getByLabelText(/^password$/i);
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("should show link to register page", () => {
      render(<LoginPage />, { wrapper });

      expect(screen.getByText(/don't have an account\?/i)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /sign up/i })
      ).toBeInTheDocument();
    });

    it("should have proper HTML5 validation attributes", () => {
      render(<LoginPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);

      expect(emailInput).toHaveAttribute("type", "email");
      expect(emailInput).toHaveAttribute("required");
      expect(passwordInput).toHaveAttribute("required");
      expect(passwordInput).toHaveAttribute("minLength", "8");
    });
  });

  describe("Form Submission", () => {
    it("should submit form with email and password", async () => {
      const user = userEvent.setup({ delay: null });
      mockLogin.mockResolvedValue(undefined);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/login"]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<div>Dashboard</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(
          "test@example.com",
          "password123"
        );
      });
    });

    it("should show loading state during submission", async () => {
      const user = userEvent.setup({ delay: null });
      mockLogin.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<LoginPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      // Should show loading state and disabled button
      await waitFor(() => {
        expect(submitButton).toHaveTextContent("Signing in...");
        expect(submitButton).toBeDisabled();
        expect(emailInput).toBeDisabled();
        expect(passwordInput).toBeDisabled();
      });
    });

    it("should display error message on failed login", async () => {
      const user = userEvent.setup({ delay: null });
      const error = new Error("Invalid credentials");
      mockLogin.mockRejectedValue(error);

      render(<LoginPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "wrongpassword");
      await user.click(submitButton);

      await waitFor(() => {
        expect(document.getElementById("login-error")).toHaveTextContent(
          "Invalid credentials"
        );
      });
    });

    it("should keep error visible when user types", async () => {
      const user = userEvent.setup({ delay: null });
      mockLogin.mockRejectedValue(new Error("Previous error"));

      render(<LoginPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "wrongpassword");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getAllByText("Previous error")[0]).toBeInTheDocument();
      });

      // Type in email - error should remain (component doesn't clear errors on input)
      await user.clear(emailInput);
      await user.type(emailInput, "a");

      // Error should still be visible
      expect(screen.getAllByText("Previous error")[0]).toBeInTheDocument();
    });

    it("should handle non-Error errors", async () => {
      const user = userEvent.setup({ delay: null });
      mockLogin.mockRejectedValue("String error");

      render(<LoginPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(document.getElementById("login-error")).toHaveTextContent(
          "Login failed"
        );
      });
    });

    it("should redirect after successful login", async () => {
      const user = userEvent.setup({ delay: null });
      mockLogin.mockResolvedValue(undefined);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/login"]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<div>Dashboard</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
      });
    });
  });

  describe("Client-side Validation", () => {
    it("should require email field", async () => {
      const user = userEvent.setup({ delay: null });

      render(<LoginPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      // Try to submit with empty email (browser's HTML5 validation should block)
      await user.click(submitButton);

      // Email input should be invalid
      expect(emailInput).toBeInvalid();
    });

    it("should require password field", async () => {
      const user = userEvent.setup({ delay: null });

      render(<LoginPage />, { wrapper });

      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      // Try to submit with empty password (browser's HTML5 validation should block)
      await user.click(submitButton);

      // Password input should be invalid
      expect(passwordInput).toBeInvalid();
    });
  });

  describe("Navigation", () => {
    it("should have link to register page", () => {
      render(<LoginPage />, { wrapper });

      const registerLink = screen.getByRole("link", { name: /sign up/i });
      expect(registerLink).toHaveAttribute("href", "/register");
    });
  });

  describe("Disabled State", () => {
    it("should re-enable form inputs after submission completes", async () => {
      const user = userEvent.setup({ delay: null });
      // Use mockImplementationOnce to return a rejecting Promise after a delay
      // This keeps the component mounted so we can verify inputs are re-enabled
      mockLogin.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error("Login failed")), 100)
          )
      );

      render(<LoginPage />, { wrapper });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole("button", { name: /sign in/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      // Wait for loading to start
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });

      // Wait for loading to complete and error to be displayed
      await waitFor(() => {
        expect(document.getElementById("login-error")).toHaveTextContent(
          "Login failed"
        );
      });

      // Inputs should be re-enabled after failed submission
      expect(emailInput).not.toBeDisabled();
      expect(passwordInput).not.toBeDisabled();
    });
  });
});
