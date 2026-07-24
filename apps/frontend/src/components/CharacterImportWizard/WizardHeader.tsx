import { X, User } from "lucide-react";

interface WizardHeaderProps {
  detectedCount: number;
  manualCount: number;
  onClose: () => void;
  disabled: boolean;
}

export function WizardHeader({
  detectedCount,
  manualCount,
  onClose,
  disabled,
}: WizardHeaderProps) {
  const subtitle =
    detectedCount > 0
      ? `Review and approve ${detectedCount} detected character(s)`
      : manualCount > 0
        ? `${manualCount} character(s) added manually`
        : "No characters detected - add them manually";

  return (
    <div className="p-6 border-b border-border/30 flex items-start justify-between shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-md">
          <User className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-medium">Import Characters</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close import dialog"
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground transition-colors"
        disabled={disabled}
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
