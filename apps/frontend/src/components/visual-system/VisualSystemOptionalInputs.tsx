/**
 * Optional Default Group Type and Placeholder Base URL fields
 * for the Visual System form.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";

// ============================================================================
// Types
// ============================================================================

interface VisualSystemOptionalInputsProps {
  defaultGroupType: string;
  placeholderBaseUrl: string;
  placeholderBaseUrlError: string | undefined;
  disabled: boolean;
  onDefaultGroupTypeChange: (value: string) => void;
  onPlaceholderBaseUrlChange: (value: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function VisualSystemOptionalInputs({
  defaultGroupType,
  placeholderBaseUrl,
  placeholderBaseUrlError,
  disabled,
  onDefaultGroupTypeChange,
  onPlaceholderBaseUrlChange,
}: VisualSystemOptionalInputsProps) {
  return (
    <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
      <div className="space-y-1">
        <Label htmlFor="vs-default-group" className="text-xs">
          Default Group Type
        </Label>
        <Input
          id="vs-default-group"
          type="text"
          placeholder="act"
          value={defaultGroupType}
          onChange={(event) => onDefaultGroupTypeChange(event.target.value)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Optional. e.g. <code>act</code>, <code>chapter</code>
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="vs-placeholder" className="text-xs">
          Placeholder Base URL
        </Label>
        <Input
          id="vs-placeholder"
          type="text"
          placeholder="https://example.com/img/"
          value={placeholderBaseUrl}
          onChange={(event) => onPlaceholderBaseUrlChange(event.target.value)}
          disabled={disabled}
          aria-invalid={!!placeholderBaseUrlError}
          aria-describedby={
            placeholderBaseUrlError ? "vs-placeholder-error" : undefined
          }
        />
        <FormErrorMessage
          id="vs-placeholder-error"
          message={placeholderBaseUrlError}
        />
      </div>
    </div>
  );
}
