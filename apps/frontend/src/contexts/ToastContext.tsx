import {
  createContext,
  use,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastVariant = "default" | "success" | "destructive";

interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

function getToastPortalContainer(): HTMLElement {
  // Native `<dialog showModal>` content lives in the browser top layer, so
  // fixed-position toasts on `document.body` render behind the backdrop blur.
  // Portal into the topmost open dialog (last in document order) when one
  // is open, matching the tooltip/select fix.
  const dialogs = document.querySelectorAll("dialog[open]");
  const topmost = dialogs[dialogs.length - 1];
  if (topmost instanceof HTMLElement) return topmost;
  return document.body;
}

function useToastPortalContainer(): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const update = () => {
      if (typeof document === "undefined") return;
      setContainer(getToastPortalContainer());
    };

    update();

    // Only react to dialog-relevant mutations: new / removed dialog
    // elements as direct body children, and open-attribute toggles on
    // any dialog in the subtree (showModal / close).
    const childListObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some(
        (m) =>
          Array.from(m.addedNodes).some(
            (n) => n instanceof HTMLDialogElement
          ) ||
          Array.from(m.removedNodes).some((n) => n instanceof HTMLDialogElement)
      );
      if (relevant) update();
    });
    childListObserver.observe(document.body, { childList: true });

    const attrObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some(
        (m) =>
          m.target instanceof HTMLDialogElement && m.attributeName === "open"
      );
      if (relevant) update();
    });
    attrObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });

    document.addEventListener("close", update, true);

    return () => {
      childListObserver.disconnect();
      attrObserver.disconnect();
      document.removeEventListener("close", update, true);
    };
  }, []);

  return container;
}

export function useToast() {
  const context = use(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return {
    ...context,
    success: (message: string, title?: string, duration?: number) =>
      context.showToast({
        variant: "success",
        title,
        message,
        duration: duration ?? 3000,
      }),
    error: (message: string, title?: string, duration?: number) =>
      context.showToast({
        variant: "destructive",
        title,
        message,
        duration: duration ?? 5000,
      }),
    info: (message: string, title?: string, duration?: number) =>
      context.showToast({
        variant: "default",
        title,
        message,
        duration: duration ?? 3000,
      }),
  };
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);

      // Auto-remove after duration (default 3 seconds)
      const duration = toast.duration ?? 3000;
      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  const contextValue = useMemo(
    () => ({ toasts, showToast, removeToast }),
    [toasts, showToast, removeToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

function getToastClasses(variant: ToastVariant): string {
  switch (variant) {
    case "success":
      return "border-[var(--toast-success-border)] bg-[var(--toast-success-bg)]";
    case "destructive":
      return "border-[var(--toast-destructive-border)] bg-[var(--toast-destructive-bg)]";
    default:
      return "border-[var(--toast-info-border)] bg-[var(--toast-info-bg)]";
  }
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  const portalContainer = useToastPortalContainer();

  if (!portalContainer) return null;

  return createPortal(
    <div
      data-testid="toast-container"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === "destructive" ? "alert" : "status"}
          className="pointer-events-auto animate-in slide-in-from-right-4 fade-in-50 duration-300"
        >
          <div
            className={`flex items-start gap-3 rounded-md border p-4 shadow-lg min-w-[300px] max-w-md ${getToastClasses(
              toast.variant
            )}`}
          >
            <div className="flex-1">
              {toast.title && (
                <p className="text-sm font-medium">{toast.title}</p>
              )}
              {toast.message && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onRemove(toast.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>,
    portalContainer
  );
}
