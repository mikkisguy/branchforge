import { AlertCircle } from "lucide-react";

interface AuthErrorAlertProps {
  id: string;
  message: string;
}

export function AuthErrorAlert({ id, message }: AuthErrorAlertProps) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm shadow-sm"
    >
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <p className="leading-5 text-destructive-muted">{message}</p>
    </div>
  );
}
