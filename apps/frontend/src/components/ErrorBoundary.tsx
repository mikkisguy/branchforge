import type { ReactNode } from "react";
import { Component } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
  /** Keys that trigger a reset when changed */
  resetKeys?: readonly unknown[];
  /** Callback invoked after error boundary is reset */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary catches errors in React component trees, including errors from
 * lazy-loaded components during dynamic imports.
 *
 * Place this around Suspense boundaries to catch lazy-load failures.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    // Log to console in development
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught an error:", error);
      console.error("Component stack:", errorInfo.componentStack);
    }

    // Call optional onError prop for custom logging/error tracking
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: Readonly<ErrorBoundaryProps>): void {
    const { resetKeys } = this.props;
    const { resetKeys: prevResetKeys } = prevProps;

    // Auto-reset when resetKeys change
    if (prevResetKeys !== resetKeys) {
      if (resetKeys && prevResetKeys) {
        const hasKeyChanged = resetKeys.some(
          (key, i) => !Object.is(key, prevResetKeys[i])
        );
        if (hasKeyChanged && this.state.hasError) {
          this.resetErrorBoundary();
        }
      } else if (resetKeys !== prevResetKeys && this.state.hasError) {
        // Handle undefined -> array or array -> undefined transitions
        this.resetErrorBoundary();
      }
    }
  }

  /** Public method to programmatically reset the error boundary */
  resetErrorBoundary(): void {
    const { onReset } = this.props;

    // Clear error state
    this.setState({ hasError: false, error: undefined });

    // Call onReset callback after state is cleared
    onReset?.();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided, otherwise use default
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center"
          >
            <div className="text-6xl text-muted-foreground">⚠️</div>
            <h2 className="text-xl font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              The application encountered an unexpected error. Please try
              refreshing the page.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <details className="mt-4 max-w-lg text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">
                  Error details
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-panel p-3">
                  {this.state.error.stack ?? this.state.error.toString()}
                </pre>
              </details>
            )}
            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => this.resetErrorBoundary()}
              >
                Try Again
              </Button>
              <Button type="button" onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
