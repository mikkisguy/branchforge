/**
 * Visual System Dialog
 *
 * Modal for editing the per-project visual system configuration
 * (template tokens, group prefixes, padding, shared jump prefix,
 * placeholder base URL).
 *
 * The dialog previews how a sample visual name is generated with the
 * current form values by feeding them into `generateVisualName()`,
 * so the user gets immediate feedback on their template edits.
 */

import { useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { Select } from "@/components/ui/select";
import { useVisualSystem } from "@/hooks/useVisualSystem";
import {
  generateVisualName,
  type VisualSystemConfig,
} from "@branchforge/shared";
import {
  INITIAL_VISUAL_SYSTEM_FORM,
  parseGroupPrefixes,
  toVisualSystemFormState,
  type VisualSystemFormState,
} from "@/components/visual-system.helpers";

// ============================================================================
// Types
// ============================================================================

export interface VisualSystemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export type { VisualSystemFormState };

interface VisualSystemFormErrors {
  namingTemplate?: string;
  labelPadding?: string;
  counterPadding?: string;
  jumpPrefixShared?: string;
  placeholderBaseUrl?: string;
  groupPrefixesJson?: string;
}

// ============================================================================
// Helpers
// ============================================================================
//
// `toVisualSystemFormState`, `parseGroupPrefixes`, and
// `INITIAL_VISUAL_SYSTEM_FORM` live in `./visual-system.helpers` so
// both this dialog and the project-settings tab can share them.

/** Validate the form and return a flat error object. */
function validateForm(form: VisualSystemFormState): VisualSystemFormErrors {
  const errors: VisualSystemFormErrors = {};
  if (!form.namingTemplate.trim()) {
    errors.namingTemplate = "Naming template is required";
  }
  if (form.labelPadding !== 1 && form.labelPadding !== 2) {
    errors.labelPadding = "Label padding must be 1 or 2";
  }
  if (form.counterPadding !== 1 && form.counterPadding !== 2) {
    errors.counterPadding = "Counter padding must be 1 or 2";
  }
  if (!form.jumpPrefixShared.trim()) {
    errors.jumpPrefixShared = "Shared jump prefix is required";
  }
  if (form.placeholderBaseUrl.trim()) {
    try {
      // URL constructor is permissive; ensure it has a protocol.
      // Match the server's exact `===` check (`url.protocol === "http:"
      // || url.protocol === "https:"`) so client validation rejects the
      // same set of inputs — `startsWith("http")` would let `httpa:`
      // and similar bogus schemes through.
      const url = new URL(form.placeholderBaseUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.placeholderBaseUrl = "Placeholder URL must use http or https";
      }
    } catch {
      errors.placeholderBaseUrl = "Placeholder URL is not a valid URL";
    }
  }
  const parsed = parseGroupPrefixes(form.groupPrefixesJson);
  if (parsed.error) {
    errors.groupPrefixesJson = parsed.error;
  }
  return errors;
}

// ============================================================================
// Form content
// ============================================================================

interface VisualSystemFormContentProps {
  initialConfig: VisualSystemConfig | null;
  isSaving: boolean;
  onSave: (form: VisualSystemFormState) => Promise<void>;
  onClose: () => void;
}

/**
 * The form body of the visual-system settings, with no dialog chrome
 * around it. Used by `VisualSystemDialog` (standalone) and by
 * `ProjectSettingsDialog` (as a tab panel).
 */
export function VisualSystemFormContent({
  initialConfig,
  isSaving,
  onSave,
  onClose,
}: VisualSystemFormContentProps) {
  const [form, setForm] = useState<VisualSystemFormState>(
    initialConfig
      ? toVisualSystemFormState(initialConfig)
      : INITIAL_VISUAL_SYSTEM_FORM
  );
  const [errors, setErrors] = useState<VisualSystemFormErrors>({});

  // When the server config first arrives (or changes after a save),
  // re-hydrate the form. Done during render — not in an effect — so
  // the form is in sync with `initialConfig` from the same commit,
  // avoiding a one-frame flash of stale values.
  // (The previous-value tracker must be `useState` rather than
  // `useRef` because the `react-hooks/refs` rule forbids reading
  // and writing refs during render.)
  // react-doctor-disable-next-line react-doctor/rerender-state-only-in-handlers
  const [hydratedConfig, setHydratedConfig] = useState(initialConfig);
  if (initialConfig !== hydratedConfig) {
    setHydratedConfig(initialConfig);
    if (initialConfig) {
      setForm(toVisualSystemFormState(initialConfig));
    }
  }

  const handleChange = <K extends keyof VisualSystemFormState>(
    field: K,
    value: VisualSystemFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSave = async () => {
    const validation = validateForm(form);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    try {
      await onSave(form);
      onClose();
    } catch {
      // Error handled by hook toast
    }
  };

  // Build the live config for the preview. We re-parse the JSON
  // textarea on every render so the preview always reflects the
  // current form state, even if the JSON isn't yet valid.
  const previewConfig: VisualSystemConfig = useMemo(() => {
    const parsed = parseGroupPrefixes(form.groupPrefixesJson);
    return {
      namingTemplate: form.namingTemplate,
      labelPadding: form.labelPadding,
      counterPadding: form.counterPadding,
      jumpPrefixShared: form.jumpPrefixShared,
      ...(form.defaultGroupType.trim()
        ? { defaultGroupType: form.defaultGroupType.trim() }
        : {}),
      ...(form.placeholderBaseUrl.trim()
        ? { placeholderBaseUrl: form.placeholderBaseUrl.trim() }
        : {}),
      ...(parsed.value ? { groupPrefixes: parsed.value } : {}),
    };
  }, [form]);

  const samplePreview = useMemo(() => {
    try {
      return generateVisualName(previewConfig, {
        groupType: form.defaultGroupType.trim() || undefined,
        groupValue: form.defaultGroupType.trim() ? "I" : undefined,
        routeKey: "hero",
        labelNumber: 1,
        counter: 1,
        slug: "cafe",
      });
    } catch {
      return "—";
    }
  }, [previewConfig, form.defaultGroupType]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="vs-naming-template" className="text-xs">
          Naming Template *
        </Label>
        <Input
          id="vs-naming-template"
          type="text"
          placeholder="{route}{group}_{label}_{counter}_{slug}"
          value={form.namingTemplate}
          onChange={(event) =>
            handleChange("namingTemplate", event.target.value)
          }
          disabled={isSaving}
          aria-invalid={!!errors.namingTemplate}
          aria-describedby={
            errors.namingTemplate ? "vs-naming-template-error" : undefined
          }
        />
        <p className="text-xs text-muted-foreground">
          Tokens: <code>{`{route}`}</code>, <code>{`{group}`}</code>,{" "}
          <code>{`{label}`}</code> (or legacy <code>{`{scene}`}</code>),{" "}
          <code>{`{counter}`}</code>, <code>{`{slug}`}</code>
        </p>
        <FormErrorMessage
          id="vs-naming-template-error"
          message={errors.namingTemplate}
        />
      </div>

      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label htmlFor="vs-label-padding" className="text-xs">
            Label Padding *
          </Label>
          <Select
            id="vs-label-padding"
            value={String(form.labelPadding) as "1" | "2"}
            onChange={(value) =>
              handleChange("labelPadding", Number(value) as 1 | 2)
            }
            disabled={isSaving}
            options={[
              { value: "1", label: "1 (e.g. 1, 2, 3)" },
              { value: "2", label: "2 (e.g. 01, 02, 03)" },
            ]}
            aria-invalid={!!errors.labelPadding}
            aria-describedby={
              errors.labelPadding ? "vs-label-padding-error" : undefined
            }
          />
          <FormErrorMessage
            id="vs-label-padding-error"
            message={errors.labelPadding}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="vs-counter-padding" className="text-xs">
            Counter Padding *
          </Label>
          <Select
            id="vs-counter-padding"
            value={String(form.counterPadding) as "1" | "2"}
            onChange={(value) =>
              handleChange("counterPadding", Number(value) as 1 | 2)
            }
            disabled={isSaving}
            options={[
              { value: "1", label: "1 (e.g. 1, 2, 3)" },
              { value: "2", label: "2 (e.g. 01, 02, 03)" },
            ]}
            aria-invalid={!!errors.counterPadding}
            aria-describedby={
              errors.counterPadding ? "vs-counter-padding-error" : undefined
            }
          />
          <FormErrorMessage
            id="vs-counter-padding-error"
            message={errors.counterPadding}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="vs-jump-prefix" className="text-xs">
          Shared Jump Prefix *
        </Label>
        <Input
          id="vs-jump-prefix"
          type="text"
          placeholder="shared_"
          value={form.jumpPrefixShared}
          onChange={(event) =>
            handleChange("jumpPrefixShared", event.target.value)
          }
          disabled={isSaving}
          aria-invalid={!!errors.jumpPrefixShared}
          aria-describedby={
            errors.jumpPrefixShared ? "vs-jump-prefix-error" : undefined
          }
        />
        <FormErrorMessage
          id="vs-jump-prefix-error"
          message={errors.jumpPrefixShared}
        />
      </div>

      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label htmlFor="vs-default-group" className="text-xs">
            Default Group Type
          </Label>
          <Input
            id="vs-default-group"
            type="text"
            placeholder="act"
            value={form.defaultGroupType}
            onChange={(event) =>
              handleChange("defaultGroupType", event.target.value)
            }
            disabled={isSaving}
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
            value={form.placeholderBaseUrl}
            onChange={(event) =>
              handleChange("placeholderBaseUrl", event.target.value)
            }
            disabled={isSaving}
            aria-invalid={!!errors.placeholderBaseUrl}
            aria-describedby={
              errors.placeholderBaseUrl ? "vs-placeholder-error" : undefined
            }
          />
          <FormErrorMessage
            id="vs-placeholder-error"
            message={errors.placeholderBaseUrl}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="vs-group-prefixes" className="text-xs">
          Group Prefixes (JSON)
        </Label>
        <textarea
          id="vs-group-prefixes"
          aria-label="Group Prefixes JSON"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder='{ "act": { "I": "ai" }, "chapter": { "1": "ch1" } }'
          value={form.groupPrefixesJson}
          onChange={(event) =>
            handleChange("groupPrefixesJson", event.target.value)
          }
          disabled={isSaving}
          rows={4}
          aria-invalid={!!errors.groupPrefixesJson}
          aria-describedby={
            errors.groupPrefixesJson ? "vs-group-prefixes-error" : undefined
          }
        />
        <p className="text-xs text-muted-foreground">
          Map of group type to value→prefix. Empty or <code>{`{}`}</code> for
          none.
        </p>
        <FormErrorMessage
          id="vs-group-prefixes-error"
          message={errors.groupPrefixesJson}
        />
      </div>

      <div className="rounded-md border border-border/50 bg-muted/40 p-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Wand2 className="size-3.5" />
          Preview
        </div>
        <p className="mt-1 text-muted-foreground">
          Sample generated name (route <code>hero</code>, group <code>I</code>,
          label <code>1</code>, counter <code>1</code>, slug <code>cafe</code>):
        </p>
        <p className="mt-1 font-mono text-foreground">{samplePreview}</p>
      </div>

      <div className="flex justify-end gap-2">
        {/* No Cancel button — the dialog's X / the outer Close
            button (in `ProjectSettingsDialog`) is the equivalent.
            Save persists; close discards unsaved changes. */}
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
          Save
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Public component
// ============================================================================

export function VisualSystemDialog({
  open,
  onOpenChange,
  projectId,
}: VisualSystemDialogProps) {
  const { config, isLoading, isSaving, updateConfig } =
    useVisualSystem(projectId);

  const handleSave = async (form: VisualSystemFormState) => {
    const parsed = parseGroupPrefixes(form.groupPrefixesJson);
    // Always include all fields. The PATCH semantics on the server
    // mean that *omitting* a key would leave the existing value
    // untouched, so to *clear* optional fields we have to send the
    // explicit empty-string / empty-object sentinel. The service
    // converts these to NULL on write.
    await updateConfig({
      namingTemplate: form.namingTemplate.trim(),
      labelPadding: form.labelPadding,
      counterPadding: form.counterPadding,
      jumpPrefixShared: form.jumpPrefixShared.trim(),
      defaultGroupType: form.defaultGroupType.trim(),
      placeholderBaseUrl: form.placeholderBaseUrl.trim(),
      // `parsed.value` is `null` for empty input. The service treats
      // `{}` as "clear to NULL", so always pass either the parsed
      // object or `{}` (never `undefined`).
      groupPrefixes: parsed.value ?? {},
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} aria-label="Visual System">
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>Visual System</DialogTitle>
          <DialogDescription>
            Configure how generated Ren'Py visual filenames are produced.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !config ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <VisualSystemFormContent
            key={`visual-system-${open}`}
            initialConfig={config}
            isSaving={isSaving}
            onSave={handleSave}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
