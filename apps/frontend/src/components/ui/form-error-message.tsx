import { cn } from "@/lib/utils";

interface FormErrorMessageProps {
  id: string;
  message?: string;
  className?: string;
}

export function FormErrorMessage({
  id,
  message,
  className,
}: FormErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <p
      id={id}
      role="alert"
      className={cn("text-xs text-destructive mt-1", className)}
    >
      {message}
    </p>
  );
}
