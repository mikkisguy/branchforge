/**
 * Route Edit Dialog
 *
 * Modal for creating or editing a single route configuration.
 */

import { useEffect, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { isValidJumpPrefix, isValidRouteKey } from "@branchforge/shared";
import type { RouteConfig } from "@branchforge/shared";

interface RouteEditDialogProps {
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

  const [form, setForm] = useState<RouteFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<RouteFormErrors>({});
  const initializedForRouteIdRef = useRef<string | null>(null);

  const isSaving = isCreatingRouteConfig || isUpdatingRouteConfig;
  const isEditMode = !!routeId;

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setErrors({});
    initializedForRouteIdRef.current = null;
  };

  // Initialize form via useEffect when dialog opens with route data
  useEffect(() => {
    if (
      open &&
      !isLoadingRouteConfigs &&
      routeId !== initializedForRouteIdRef.current
    ) {
      if (routeId) {
        const route = routeConfigs.find(
          (item: RouteConfig) => item.id === routeId
        );
        if (route) {
          setForm({
            routeKey: route.routeKey,
            routeName: route.routeName,
            jumpPrefix: route.jumpPrefix,
            isShared: route.isShared,
          });
          initializedForRouteIdRef.current = routeId;
        }
      } else {
        setForm(INITIAL_FORM);
        initializedForRouteIdRef.current = null;
      }
      setErrors({});
    }
  }, [open, isLoadingRouteConfigs, routeId, routeConfigs]);

  const handleChange = (
    field: keyof RouteFormState,
    value: string | boolean
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors({});
  };

  const handleSave = async () => {
    const validationErrors = validateRoute(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      if (routeId) {
        await updateRouteConfig(routeId, {
          routeName: form.routeName.trim(),
          jumpPrefix: form.jumpPrefix.trim(),
          isShared: form.isShared,
        });
      } else {
        await createRouteConfig({
          routeKey: form.routeKey.trim(),
          routeName: form.routeName.trim(),
          jumpPrefix: form.jumpPrefix.trim(),
          isShared: form.isShared,
        });
      }

      resetForm();
      onOpenChange(false);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) resetForm();
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="max-w-xl w-full">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Route" : "Add Route"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the route settings."
              : "Create a new route for your project."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="route-key" className="text-xs">
                Route Key *
              </Label>
              <Input
                id="route-key"
                type="text"
                placeholder="hero"
                value={form.routeKey}
                onChange={(event) =>
                  handleChange("routeKey", event.target.value)
                }
                disabled={isSaving || isEditMode}
              />
              <p className="text-xs text-muted-foreground">
                {isEditMode
                  ? "Route key cannot be changed after creation"
                  : "Unique identifier (letters, numbers, underscores, hyphens)"}
              </p>
              {errors.routeKey && (
                <p className="text-xs text-destructive">{errors.routeKey}</p>
              )}
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
              />
              {errors.routeName && (
                <p className="text-xs text-destructive">{errors.routeName}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
              />
              {errors.jumpPrefix && (
                <p className="text-xs text-destructive">{errors.jumpPrefix}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="route-type" className="text-xs">
                Route Type
              </Label>
              <select
                id="route-type"
                value={form.isShared ? "shared" : "exclusive"}
                onChange={(event) =>
                  handleChange("isShared", event.target.value === "shared")
                }
                disabled={isSaving}
                className="w-full px-3 py-2 rounded-md border border-border/30 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="exclusive">Exclusive Route</option>
                <option value="shared">Shared/Common Route</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Shared routes appear in all story branches
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
