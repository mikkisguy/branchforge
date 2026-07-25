/**
 * Naming Template field for the Visual System form.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";

// ============================================================================
// Types
// ============================================================================

interface VisualSystemNamingTemplateProps {
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function VisualSystemNamingTemplate({
  value,
  error,
  disabled,
  onChange,
}: VisualSystemNamingTemplateProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor="vs-naming-template" className="text-xs">
        Naming Template *
      </Label>
      <Input
        id="vs-naming-template"
        type="text"
        placeholder="{route}{group}_{label}_{counter}_{slug}"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-required="true"
        aria-invalid={!!error}
        aria-describedby={
          error
            ? "vs-naming-template-hint vs-naming-template-error"
            : "vs-naming-template-hint"
        }
      />
      <p id="vs-naming-template-hint" className="text-xs text-muted-foreground">
        Tokens: <code>{`{route}`}</code>, <code>{`{group}`}</code>,{" "}
        <code>{`{label}`}</code> (or legacy <code>{`{scene}`}</code>),{" "}
        <code>{`{counter}`}</code>, <code>{`{slug}`}</code>
      </p>
      <FormErrorMessage id="vs-naming-template-error" message={error} />
    </div>
  );
}
