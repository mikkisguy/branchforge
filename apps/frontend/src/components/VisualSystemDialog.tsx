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
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { VisualSystemNamingTemplate } from "./VisualSystemNamingTemplate";
import { VisualSystemPaddingSelects } from "./VisualSystemPaddingSelects";
import { VisualSystemJumpPrefixInput } from "./VisualSystemJumpPrefixInput";
import { VisualSystemOptionalInputs } from "./VisualSystemOptionalInputs";
import { VisualSystemGroupPrefixesEditor } from "./VisualSystemGroupPrefixesEditor";
import { VisualSystemPreviewPanel } from "./VisualSystemPreviewPanel";

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
      <VisualSystemNamingTemplate
        value={form.namingTemplate}
        error={errors.namingTemplate}
        disabled={isSaving}
        onChange={(value) => handleChange("namingTemplate", value)}
      />
      <VisualSystemPaddingSelects
        labelPadding={form.labelPadding}
        counterPadding={form.counterPadding}
        labelPaddingError={errors.labelPadding}
        counterPaddingError={errors.counterPadding}
        disabled={isSaving}
        onLabelPaddingChange={(value) => handleChange("labelPadding", value)}
        onCounterPaddingChange={(value) =>
          handleChange("counterPadding", value)
        }
      />
      <VisualSystemJumpPrefixInput
        value={form.jumpPrefixShared}
        error={errors.jumpPrefixShared}
        disabled={isSaving}
        onChange={(value) => handleChange("jumpPrefixShared", value)}
      />
      <VisualSystemOptionalInputs
        defaultGroupType={form.defaultGroupType}
        placeholderBaseUrl={form.placeholderBaseUrl}
        placeholderBaseUrlError={errors.placeholderBaseUrl}
        disabled={isSaving}
        onDefaultGroupTypeChange={(value) =>
          handleChange("defaultGroupType", value)
        }
        onPlaceholderBaseUrlChange={(value) =>
          handleChange("placeholderBaseUrl", value)
        }
      />
      <VisualSystemGroupPrefixesEditor
        value={form.groupPrefixesJson}
        error={errors.groupPrefixesJson}
        disabled={isSaving}
        onChange={(value) => handleChange("groupPrefixesJson", value)}
      />
      <VisualSystemPreviewPanel samplePreview={samplePreview} />

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
