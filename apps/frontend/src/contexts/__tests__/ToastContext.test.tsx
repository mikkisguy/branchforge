/**
 * ToastContext Tests
 *
 * Tests for the ToastContext which manages toast notifications.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "../ToastContext";

describe("ToastContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // Helper component to test the hook
  function TestComponent() {
    const { success, error, info, toasts } = useToast();

    return (
      <div>
        <div data-testid="toast-count">{toasts.length}</div>
        <button onClick={() => success("Success message", "Success Title")}>
          Success
        </button>
        <button onClick={() => error("Error message", "Error Title")}>Error</button>
        <button onClick={() => info("Info message", "Info Title")}>Info</button>
        <button onClick={() => success("Message without title")}>
          No Title
        </button>
        <button onClick={() => success("Message with custom duration", "Title")}>
          Custom Duration
        </button>
      </div>
    );
  }

  describe("Success Toasts", () => {
    it("should add success toast with title and message", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText("Success");
      fireEvent.click(button);

      expect(screen.getByText("Success Title")).toBeInTheDocument();
      expect(screen.getByText("Success message")).toBeInTheDocument();
    });

    it("should add success toast without title", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText("No Title");
      fireEvent.click(button);

      expect(screen.getByText("Message without title")).toBeInTheDocument();
    });

    it("should auto-dismiss success toast after default duration", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText("Success");
      fireEvent.click(button);

      expect(screen.getByText("Success message")).toBeInTheDocument();

      // Fast-forward 3 seconds (default duration)
      act(() => {
        vi.advanceTimersByTime(3000);
        vi.runOnlyPendingTimers();
      });

      expect(screen.queryByText("Success message")).not.toBeInTheDocument();
    });
  });

  describe("Error Toasts", () => {
    it("should add error toast with title and message", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText("Error");
      fireEvent.click(button);

      expect(screen.getByText("Error Title")).toBeInTheDocument();
      expect(screen.getByText("Error message")).toBeInTheDocument();
    });

    it("should auto-dismiss error toast after 5 seconds", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText("Error");
      fireEvent.click(button);

      expect(screen.getByText("Error message")).toBeInTheDocument();

      // Fast-forward 5 seconds (error toast default duration)
      act(() => {
        vi.advanceTimersByTime(5000);
        vi.runOnlyPendingTimers();
      });

      expect(screen.queryByText("Error message")).not.toBeInTheDocument();
    });
  });

  describe("Info Toasts", () => {
    it("should add info toast with title and message", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText("Info");
      fireEvent.click(button);

      expect(screen.getByText("Info Title")).toBeInTheDocument();
      expect(screen.getByText("Info message")).toBeInTheDocument();
    });

    it("should auto-dismiss info toast after default duration", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText("Info");
      fireEvent.click(button);

      expect(screen.getByText("Info message")).toBeInTheDocument();

      // Fast-forward 3 seconds (default duration)
      act(() => {
        vi.advanceTimersByTime(3000);
        vi.runOnlyPendingTimers();
      });

      expect(screen.queryByText("Info message")).not.toBeInTheDocument();
    });
  });

  describe("Multiple Toasts", () => {
    it("should render multiple toasts simultaneously", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Success"));
      fireEvent.click(screen.getByText("Error"));
      fireEvent.click(screen.getByText("Info"));

      expect(screen.getByText("Success message")).toBeInTheDocument();
      expect(screen.getByText("Error message")).toBeInTheDocument();
      expect(screen.getByText("Info message")).toBeInTheDocument();

      const toastCount = screen.getByTestId("toast-count");
      expect(toastCount).toHaveTextContent("3");
    });

    it("should dismiss toasts independently", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Success"));
      fireEvent.click(screen.getByText("Error"));

      // Find and click the close button for the first toast
      const closeButtons = screen.getAllByText("×");
      expect(closeButtons.length).toBeGreaterThan(0);

      fireEvent.click(closeButtons[0]);

      // One toast should remain
      const remainingCloseButtons = screen.queryAllByText("×");
      expect(remainingCloseButtons.length).toBe(1);
    });

    it("should auto-dismiss toasts at different times", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add success toast (3s duration) at t=0
      fireEvent.click(screen.getByText("Success"));
      vi.advanceTimersByTime(1000);

      // Add error toast (5s duration) at t=1
      fireEvent.click(screen.getByText("Error"));

      // Success toast should dismiss at t=3 (2 seconds from now)
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.queryByText("Success message")).not.toBeInTheDocument();
      expect(screen.getByText("Error message")).toBeInTheDocument();

      // Error toast should dismiss at t=6 (3 more seconds from now, since we're at t=3)
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.queryByText("Error message")).not.toBeInTheDocument();
    });
  });

  describe("Custom Duration", () => {
    it("should respect custom duration", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText("Custom Duration");
      fireEvent.click(button);

      expect(screen.getByText("Message with custom duration")).toBeInTheDocument();

      // Fast-forward 1 second (custom duration)
      act(() => {
        vi.advanceTimersByTime(1000);
        vi.runOnlyPendingTimers();
      });

      expect(screen.queryByText("Message with custom duration")).not.toBeInTheDocument();
    });
  });

  describe("Manual Dismiss", () => {
    it("should dismiss toast when close button is clicked", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Success"));

      const closeButton = screen.getByText("×");
      fireEvent.click(closeButton);

      expect(screen.queryByText("Success message")).not.toBeInTheDocument();
    });

    it("should prevent auto-dismissal when manually dismissed", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Success"));

      // Manually dismiss immediately
      const closeButton = screen.getByText("×");
      fireEvent.click(closeButton);

      // Advance time past auto-dismissal
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Toast should not reappear
      expect(screen.queryByText("Success message")).not.toBeInTheDocument();
    });
  });

  describe("Toast Provider", () => {
    it("should provide toast context to children", () => {
      expect(() => {
        render(
          <ToastProvider>
            <TestComponent />
          </ToastProvider>
        );
      }).not.toThrow();
    });

    it("should render toast container", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // The toast container should be present
      const container = document.querySelector(".fixed.bottom-4.right-4");
      expect(container).toBeInTheDocument();
    });
  });

  describe("useToast Hook", () => {
    it("should throw error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow("useToast must be used within ToastProvider");

      consoleError.mockRestore();
    });

    it("should provide success, error, and info methods", () => {
      let capturedContext: any;

      function TestCaptureComponent() {
        capturedContext = useToast();
        return null;
      }

      render(
        <ToastProvider>
          <TestCaptureComponent />
        </ToastProvider>
      );

      expect(capturedContext).toHaveProperty("success");
      expect(capturedContext).toHaveProperty("error");
      expect(capturedContext).toHaveProperty("info");
      expect(typeof capturedContext.success).toBe("function");
      expect(typeof capturedContext.error).toBe("function");
      expect(typeof capturedContext.info).toBe("function");
    });
  });

  describe("Toast Container", () => {
    it("should render toasts in correct order", () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Success"));
      fireEvent.click(screen.getByText("Error"));
      fireEvent.click(screen.getByText("Info"));

      const toastTexts = screen.getAllByText(/message$/);
      expect(toastTexts[0]).toHaveTextContent("Success message");
      expect(toastTexts[1]).toHaveTextContent("Error message");
      expect(toastTexts[2]).toHaveTextContent("Info message");
    });
  });
});
