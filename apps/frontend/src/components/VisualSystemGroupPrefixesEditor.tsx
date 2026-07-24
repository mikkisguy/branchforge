/**
 * Group Prefixes JSON editor for the Visual System form.
 */
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";

// ============================================================================
// Types
// ============================================================================

interface VisualSystemGroupPrefixesEditorProps {
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function VisualSystemGroupPrefixesEditor({
  value,
  error,
  disabled,
  onChange,
}: VisualSystemGroupPrefixesEditorProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor="vs-group-prefixes" className="text-xs">
        Group Prefixes (JSON)
      </Label>
      <textarea
        id="vs-group-prefixes"
        aria-label="Group Prefixes JSON"
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        placeholder='{ "act": { "I": "ai" }, "chapter": { "1": "ch1" } }'
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={4}
        aria-invalid={!!error}
        aria-describedby={
          error
            ? "vs-group-prefixes-hint vs-group-prefixes-error"
            : "vs-group-prefixes-hint"
        }
      />
      <p id="vs-group-prefixes-hint" className="text-xs text-muted-foreground">
        Map of group type to value→prefix. Empty or <code>{`{}`}</code> for
        none.
      </p>
      <FormErrorMessage id="vs-group-prefixes-error" message={error} />
    </div>
  );
}
