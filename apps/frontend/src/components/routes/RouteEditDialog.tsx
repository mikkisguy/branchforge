/**
 * Route Edit Dialog
 *
 * Modal for creating or editing a single route configuration.
 */

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { isValidJumpPrefix, isValidRouteKey } from "@branchforge/shared";
import type { RouteConfig } from "@branchforge/shared";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { useDirtyDialogWarning } from "@/hooks/useDirtyDialogWarning";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface RouteEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  routeId?: string;
}

interface RouteFormState {
  routeKey: string;
  routeName: string;
  jumpPrefix: string;
  isShared: boolean;
}

interface RouteFormErrors {
  routeKey?: string;
  routeName?: string;
  jumpPrefix?: string;
}

const INITIAL_FORM: RouteFormState = {
  routeKey: "",
  routeName: "",
  jumpPrefix: "",
  isShared: false,
};

function validateRoute(form: RouteFormState): RouteFormErrors {
  const errors: RouteFormErrors = {};

  if (!form.routeKey.trim()) {
    errors.routeKey = "Route key is required";
  } else if (!isValidRouteKey(form.routeKey)) {
    errors.routeKey =
      "Route key can only contain letters, numbers, underscores, and hyphens";
  }

  if (!form.routeName.trim()) {
    errors.routeName = "Route name is required";
  }

  if (!form.jumpPrefix.trim()) {
    errors.jumpPrefix = "Jump prefix is required";
  } else if (!isValidJumpPrefix(form.jumpPrefix)) {
    errors.jumpPrefix =
      "Jump prefix can only contain letters, numbers, underscores, and hyphens";
  }

  return errors;
}

function RouteFormContent({
  routeId,
  routeConfigs,
  isSaving,
  onSave,
  onClose,
  onDirtyChange,
  onSaveSuccess,
}: {
  routeId: string | undefined;
  routeConfigs: RouteConfig[];
  isSaving: boolean;
  onSave: (routeId: string | undefined, form: RouteFormState) => Promise<void>;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaveSuccess: () => void;
}) {
  const [initialFormSnapshot] = useState<RouteFormState>(() => {
    if (!routeId) return INITIAL_FORM;
    const route = routeConfigs.find((item: RouteConfig) => item.id === routeId);
    if (!route) return INITIAL_FORM;
    return {
      routeKey: route.routeKey,
      routeName: route.routeName,
      jumpPrefix: route.jumpPrefix,
      isShared: route.isShared,
    };
  });
  const [form, setForm] = useState<RouteFormState>(initialFormSnapshot);
  const [errors, setErrors] = useState<RouteFormErrors>({});
  const { isDirty } = useDirtyForm(initialFormSnapshot, form);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // react-doctor-disable-next-line react-doctor/no-event-handler
  const isEditMode = !!routeId;

  // Close dialog if editing a route that no longer exists
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (isEditMode && !routeConfigs.find((item) => item.id === routeId)) {
      // react-doctor-disable-next-line react-doctor/no-prop-callback-in-effect
      onClose();
    }
  }, [isEditMode, routeId, routeConfigs, onClose]);

  const handleChange = (
    field: keyof RouteFormState,
    value: string | boolean
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field as keyof RouteFormErrors];
      return next;
    });
  };

  const handleSave = async () => {
    const validationErrors = validateRoute(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await onSave(routeId, form);
      onSaveSuccess();
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEditMode ? "Edit Route" : "Add Route"}</DialogTitle>
        <DialogDescription>
          {isEditMode
            ? "Update the route settings."
            : "Create a new route for your project."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 mt-4">
        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
          <div className="space-y-1">
            <Label htmlFor="route-key" className="text-xs">
              Route Key *
            </Label>
            <Input
              id="route-key"
              type="text"
              placeholder="hero"
              value={form.routeKey}
              onChange={(event) => handleChange("routeKey", event.target.value)}
              disabled={isSaving || isEditMode}
              aria-required="true"
              aria-invalid={!!errors.routeKey}
              aria-describedby={
                errors.routeKey
                  ? "route-key-hint route-key-error"
                  : "route-key-hint"
              }
            />
            <p id="route-key-hint" className="text-xs text-muted-foreground">
              {isEditMode
                ? "Route key cannot be changed after creation"
                : "Unique identifier (letters, numbers, underscores, hyphens)"}
            </p>
            <FormErrorMessage id="route-key-error" message={errors.routeKey} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="route-name" className="text-xs">
              Route Name *
            </Label>
            <Input
              id="route-name"
              type="text"
              placeholder="Hero's Route"
              value={form.routeName}
              onChange={(event) =>
                handleChange("routeName", event.target.value)
              }
              disabled={isSaving}
              aria-required="true"
              aria-invalid={!!errors.routeName}
              aria-describedby={
                errors.routeName ? "route-name-error" : undefined
              }
            />
            <FormErrorMessage
              id="route-name-error"
              message={errors.routeName}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
          <div className="space-y-1">
            <Label htmlFor="jump-prefix" className="text-xs">
              Jump Prefix *
            </Label>
            <Input
              id="jump-prefix"
              type="text"
              placeholder="hero_"
              value={form.jumpPrefix}
              onChange={(event) =>
                handleChange("jumpPrefix", event.target.value)
              }
              disabled={isSaving}
              aria-required="true"
              aria-invalid={!!errors.jumpPrefix}
              aria-describedby={
                errors.jumpPrefix ? "jump-prefix-error" : undefined
              }
            />
            <FormErrorMessage
              id="jump-prefix-error"
              message={errors.jumpPrefix}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="route-type" className="text-xs">
              Route Type
            </Label>
            <Select
              id="route-type"
              value={form.isShared ? "shared" : "exclusive"}
              onChange={(value) => handleChange("isShared", value === "shared")}
              disabled={isSaving}
              options={[
                { value: "exclusive", label: "Exclusive Route" },
                { value: "shared", label: "Shared/Common Route" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Shared routes appear in all story branches
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
          >
            {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
            Save
          </Button>
        </div>
      </div>
    </>
  );
}

export function RouteEditDialog({
  open,
  onOpenChange,
  projectId,
  routeId,
}: RouteEditDialogProps) {
  const {
    routeConfigs,
    isLoadingRouteConfigs,
    createRouteConfig,
    updateRouteConfig,
    isCreatingRouteConfig,
    isUpdatingRouteConfig,
  } = useRouteConfigs(projectId);

  const isSaving = isCreatingRouteConfig || isUpdatingRouteConfig;
  const [isDirty, setIsDirty] = useState(false);
  const {
    handleOpenChange,
    confirmDiscard,
    discardDialogOpen,
    setDiscardDialogOpen,
  } = useDirtyDialogWarning(isDirty, onOpenChange);

  if (isLoadingRouteConfigs) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader>
            <DialogTitle>{routeId ? "Edit Route" : "Add Route"}</DialogTitle>
            <DialogDescription>Loading...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl w-full">
          <RouteFormContent
            key={`${routeId ?? "new"}-${open}`}
            routeId={routeId}
            routeConfigs={routeConfigs}
            isSaving={isSaving}
            onSave={async (id, formData) => {
              if (id) {
                await updateRouteConfig(id, {
                  routeName: formData.routeName.trim(),
                  jumpPrefix: formData.jumpPrefix.trim(),
                  isShared: formData.isShared,
                });
              } else {
                await createRouteConfig({
                  routeKey: formData.routeKey.trim(),
                  routeName: formData.routeName.trim(),
                  jumpPrefix: formData.jumpPrefix.trim(),
                  isShared: formData.isShared,
                });
              }
            }}
            onClose={() => handleOpenChange(false)}
            onDirtyChange={setIsDirty}
            onSaveSuccess={() => onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onConfirm={confirmDiscard}
        title="Discard unsaved changes?"
        description="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </>
  );
}
