/**
 * Route Configuration Content
 *
 * Reusable content component for route configuration.
 * Can be rendered inline or wrapped in a dialog.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineMessage } from "@/components/ui/inline-error";
import { useRouteConfigs } from "@/hooks/useRouteConfigs";
import { useToast } from "@/contexts/ToastContext";
import { isValidRouteKey, isValidJumpPrefix } from "@branchforge/shared";

interface RouteConfigContentProps {
  projectId: string;
}

interface RouteConfigForm {
  id?: string;
  routeKey: string;
  routeName: string;
  jumpPrefix: string;
  isShared: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function RouteConfigContent({ projectId }: RouteConfigContentProps) {
  const {
    routeConfigs,
    isLoadingRouteConfigs,
    routeConfigsError,
    isCreatingRouteConfig,
    isUpdatingRouteConfig,
    isDeletingRouteConfig,
    createRouteConfig,
    updateRouteConfig,
    deleteRouteConfig,
  } = useRouteConfigs(projectId);
  const { success, error } = useToast();

  // Form state
  const [routes, setRoutes] = useState<RouteConfigForm[]>([]);
  const hasInitialized = useRef(false);

  // Combined loading state for any mutation
  const isSaving =
    isCreatingRouteConfig || isUpdatingRouteConfig || isDeletingRouteConfig;

  /**
   * Initialize form state from route configs
   * Guard against re-initialization during save operations
   */
  useEffect(() => {
    // Skip if saving or already initialized for this session
    if (isSaving || hasInitialized.current) {
      return;
    }

    if (routeConfigs.length > 0) {
      setRoutes(
        routeConfigs.map((rc) => ({
          id: rc.id,
          routeKey: rc.routeKey,
          routeName: rc.routeName,
          jumpPrefix: rc.jumpPrefix,
          isShared: rc.isShared,
        }))
      );
      hasInitialized.current = true;
    } else if (routeConfigs.length === 0) {
      // Initialize with empty routes
      setRoutes([]);
      hasInitialized.current = true;
    }
  }, [routeConfigs, isSaving]);

  /**
   * Add new route
   */
  const addRoute = useCallback(() => {
    setRoutes((prev) => [
      ...prev,
      {
        routeKey: "",
        routeName: "",
        jumpPrefix: "",
        isShared: false,
      },
    ]);
  }, []);

  /**
   * Update route field
   */
  const updateRoute = useCallback(
    (index: number, field: keyof RouteConfigForm, value: string | boolean) => {
      setRoutes((prev) => {
        const newRoutes = [...prev];
        newRoutes[index] = { ...newRoutes[index], [field]: value };
        return newRoutes;
      });
    },
    []
  );

  /**
   * Remove route
   */
  const removeRoute = useCallback((index: number) => {
    setRoutes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Validate routes
   */
  const validateRoutes = useCallback((): string | null => {
    if (routes.length === 0) {
      return "At least one route is required";
    }

    const routeKeys = new Set<string>();
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];

      if (!route.routeKey.trim()) {
        return `Route ${i + 1}: Route key is required`;
      }
      if (!isValidRouteKey(route.routeKey)) {
        return `Route ${
          i + 1
        }: Route key can only contain letters, numbers, underscores, and hyphens`;
      }
      if (!route.routeName.trim()) {
        return `Route ${i + 1}: Route name is required`;
      }
      if (!route.jumpPrefix.trim()) {
        return `Route ${i + 1}: Jump prefix is required`;
      }
      if (!isValidJumpPrefix(route.jumpPrefix)) {
        return `Route ${
          i + 1
        }: Jump prefix can only contain letters, numbers, underscores, and hyphens`;
      }

      // Check for duplicate route keys
      if (routeKeys.has(route.routeKey)) {
        return `Route ${i + 1}: Route key "${route.routeKey}" is already used`;
      }
      routeKeys.add(route.routeKey);
    }

    return null;
  }, [routes]);

  /**
   * Save routes
   */
  const handleSave = useCallback(async () => {
    const validationError = validateRoutes();
    if (validationError) {
      error(validationError);
      return;
    }

    try {
      // Delete routes that are no longer in the form (parallel)
      const routesToDelete = routeConfigs.filter(
        (rc) => !routes.find((r) => r.id === rc.id)
      );

      const deleteResults = await Promise.allSettled(
        routesToDelete.map((route) => deleteRouteConfig(route.id))
      );

      // Check for failed deletions
      const failedDeletes = deleteResults
        .map((result, index) => ({ result, route: routesToDelete[index] }))
        .filter(({ result }) => result.status === "rejected");

      if (failedDeletes.length > 0) {
        const deleteErrorMessages = failedDeletes.map(
          ({ route, result }) =>
            `Route "${route.routeKey}" (${route.id}): ${
              result.status === "rejected"
                ? result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
                : "Unknown error"
            }`
        );
        console.error("Failed to delete routes:", deleteErrorMessages);
        error(
          `Failed to delete ${
            failedDeletes.length
          } route(s): ${deleteErrorMessages.join("; ")}`
        );
        return; // Don't proceed with creates/updates if deletes failed
      }

      // Create or update routes (parallel)
      const routeMutations = routes.map((route) =>
        route.id
          ? // Update existing route
            updateRouteConfig(route.id, {
              routeKey: route.routeKey,
              routeName: route.routeName,
              jumpPrefix: route.jumpPrefix,
              isShared: route.isShared,
            })
          : // Create new route
            createRouteConfig({
              routeKey: route.routeKey,
              routeName: route.routeName,
              jumpPrefix: route.jumpPrefix,
              isShared: route.isShared,
            })
      );

      const mutationResults = await Promise.allSettled(routeMutations);

      // Check for failed mutations
      const failedMutations = mutationResults
        .map((result, index) => ({ result, route: routes[index] }))
        .filter(({ result }) => result.status === "rejected");

      if (failedMutations.length > 0) {
        const mutationErrorMessages = failedMutations.map(
          ({ route, result }) =>
            `Route "${route.routeKey}": ${
              result.status === "rejected"
                ? result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
                : "Unknown error"
            }`
        );
        console.error("Failed to save routes:", mutationErrorMessages);
        error(
          `Failed to save ${
            failedMutations.length
          } route(s): ${mutationErrorMessages.join("; ")}`
        );
        return;
      }

      success("Route configurations saved successfully");
    } catch (err) {
      // Catch any unexpected errors (should be rare with allSettled)
      const message =
        err instanceof Error ? err.message : "Failed to save routes";
      error(message);
    }
  }, [
    routes,
    routeConfigs,
    validateRoutes,
    deleteRouteConfig,
    updateRouteConfig,
    createRouteConfig,
    success,
    error,
  ]);

  /**
   * Check if routes are valid
   * Derived from validateRoutes to ensure Save button reflects actual validation state
   * Memoized to avoid recalculating on every render
   */
  const isValid = useMemo(() => validateRoutes() === null, [validateRoutes]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Route Configuration</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Define the routes for your visual novel project. Routes determine
          character paths and story branching.
        </p>
      </div>

      {isLoadingRouteConfigs ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : routeConfigsError ? (
        <InlineMessage variant="error">
          Failed to load route configurations
        </InlineMessage>
      ) : (
        <>
          {routes.length === 0 ? (
            <div className="p-8 border border-dashed border-border/30 rounded-md text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No routes configured yet. Add your first route to get started.
              </p>
              <Button type="button" variant="outline" onClick={addRoute}>
                <Plus className="size-4 mr-2" />
                Add Route
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {routes.map((route, index) => (
                <div
                  key={route.id || index}
                  className="border border-border/30 rounded-md p-4 space-y-3"
                >
                  {/* Route Header */}
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-4 text-muted-foreground cursor-grab" />
                    <Label className="text-sm font-medium">
                      Route {index + 1}
                    </Label>
                    {routes.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRoute(index)}
                        className="ml-auto text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>

                  {/* Route Fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`route-key-${index}`} className="text-xs">
                        Route Key *
                      </Label>
                      <Input
                        id={`route-key-${index}`}
                        type="text"
                        placeholder="hero"
                        value={route.routeKey}
                        onChange={(e) =>
                          updateRoute(index, "routeKey", e.target.value)
                        }
                        disabled={isSaving}
                      />
                      <p className="text-xs text-muted-foreground">
                        Unique identifier (letters, numbers, underscores)
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor={`route-name-${index}`}
                        className="text-xs"
                      >
                        Route Name *
                      </Label>
                      <Input
                        id={`route-name-${index}`}
                        type="text"
                        placeholder="Hero's Route"
                        value={route.routeName}
                        onChange={(e) =>
                          updateRoute(index, "routeName", e.target.value)
                        }
                        disabled={isSaving}
                      />
                      <p className="text-xs text-muted-foreground">
                        Display name for the route
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor={`jump-prefix-${index}`}
                        className="text-xs"
                      >
                        Jump Prefix *
                      </Label>
                      <Input
                        id={`jump-prefix-${index}`}
                        type="text"
                        placeholder="hero_"
                        value={route.jumpPrefix}
                        onChange={(e) =>
                          updateRoute(index, "jumpPrefix", e.target.value)
                        }
                        disabled={isSaving}
                      />
                      <p className="text-xs text-muted-foreground">
                        Prefix for Ren'Py labels (e.g., "hero_" for "hero_01")
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`is-shared-${index}`} className="text-xs">
                        Route Type
                      </Label>
                      <select
                        id={`is-shared-${index}`}
                        value={route.isShared ? "shared" : "exclusive"}
                        onChange={(e) =>
                          updateRoute(
                            index,
                            "isShared",
                            e.target.value === "shared"
                          )
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
                </div>
              ))}

              {/* Add Route Button */}
              <Button
                type="button"
                variant="outline"
                onClick={addRoute}
                disabled={isSaving}
                className="w-full"
              >
                <Plus className="size-4 mr-2" />
                Add Another Route
              </Button>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSave}
                  disabled={!isValid || isSaving || isLoadingRouteConfigs}
                >
                  {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
                  Save Routes
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
