/**
 * Shared Jump Prefix field for the Visual System form.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";

// ============================================================================
// Types
// ============================================================================

interface VisualSystemJumpPrefixInputProps {
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function VisualSystemJumpPrefixInput({
  value,
  error,
  disabled,
  onChange,
}: VisualSystemJumpPrefixInputProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor="vs-jump-prefix" className="text-xs">
        Shared Jump Prefix *
      </Label>
      <Input
        id="vs-jump-prefix"
        type="text"
        placeholder="shared_"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-required="true"
        aria-invalid={!!error}
        aria-describedby={error ? "vs-jump-prefix-error" : undefined}
      />
      <FormErrorMessage id="vs-jump-prefix-error" message={error} />
    </div>
  );
}
