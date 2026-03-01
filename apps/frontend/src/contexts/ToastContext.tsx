import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastVariant = 'default' | 'success' | 'destructive';

interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return {
    ...context,
    success: (message: string, title?: string) => context.showToast({ variant: 'success', title, message }),
    error: (message: string, title?: string) => context.showToast({ variant: 'destructive', title, message, duration: 5000 }),
    info: (message: string, title?: string) => context.showToast({ variant: 'default', title, message }),
  };
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration (default 3 seconds)
    const duration = toast.duration ?? 3000;
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-in slide-in-from-right-4 fade-in-50 duration-300"
        >
          <div className="flex items-start gap-3 rounded-md border border-border/30 bg-card p-4 shadow-lg min-w-[300px] max-w-md">
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
              onClick={() => onRemove(toast.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
