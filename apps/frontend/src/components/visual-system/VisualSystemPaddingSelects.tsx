/**
 * Label Padding and Counter Padding selectors for the Visual System form.
 */
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { Select } from "@/components/ui/select";

// ============================================================================
// Types
// ============================================================================

interface VisualSystemPaddingSelectsProps {
  labelPadding: 1 | 2;
  counterPadding: 1 | 2;
  labelPaddingError: string | undefined;
  counterPaddingError: string | undefined;
  disabled: boolean;
  onLabelPaddingChange: (value: 1 | 2) => void;
  onCounterPaddingChange: (value: 1 | 2) => void;
}

const PADDING_OPTIONS = [
  { value: "1", label: "1 (e.g. 1, 2, 3)" },
  { value: "2", label: "2 (e.g. 01, 02, 03)" },
] as const;

// ============================================================================
// Component
// ============================================================================

export function VisualSystemPaddingSelects({
  labelPadding,
  counterPadding,
  labelPaddingError,
  counterPaddingError,
  disabled,
  onLabelPaddingChange,
  onCounterPaddingChange,
}: VisualSystemPaddingSelectsProps) {
  return (
    <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
      <div className="space-y-1">
        <Label htmlFor="vs-label-padding" className="text-xs">
          Label Padding *
        </Label>
        <Select
          id="vs-label-padding"
          value={String(labelPadding) as "1" | "2"}
          onChange={(value) => onLabelPaddingChange(Number(value) as 1 | 2)}
          disabled={disabled}
          options={PADDING_OPTIONS}
          aria-required="true"
          aria-invalid={!!labelPaddingError}
          aria-describedby={
            labelPaddingError ? "vs-label-padding-error" : undefined
          }
        />
        <FormErrorMessage
          id="vs-label-padding-error"
          message={labelPaddingError}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="vs-counter-padding" className="text-xs">
          Counter Padding *
        </Label>
        <Select
          id="vs-counter-padding"
          value={String(counterPadding) as "1" | "2"}
          onChange={(value) => onCounterPaddingChange(Number(value) as 1 | 2)}
          disabled={disabled}
          options={PADDING_OPTIONS}
          aria-required="true"
          aria-invalid={!!counterPaddingError}
          aria-describedby={
            counterPaddingError ? "vs-counter-padding-error" : undefined
          }
        />
        <FormErrorMessage
          id="vs-counter-padding-error"
          message={counterPaddingError}
        />
      </div>
    </div>
  );
}
