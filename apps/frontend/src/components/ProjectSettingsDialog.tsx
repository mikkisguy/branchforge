/**
 * Project Settings Dialog
 *
 * Unified modal that hosts the project's configuration tabs:
 *   - Characters (1:N CRUD — list + add/edit/delete)
 *   - Routes (1:N CRUD — list + add/edit/delete)
 *   - Visual System (1:1 config — single form with live preview)
 *
 * Each tab is a self-contained piece of state and persistence.
 * The outer dialog is just a navigation shell: no global save,
 * just a Close button. Inner edit dialogs (for Characters and
 * Routes) stack on top as dialog-over-dialog, matching the
 * pattern the user prefers over inline editing.
 *
 * Replaces the separate Routes / Characters sidebar entries in
 * the left sidebar.
 */

import { useState } from "react";
import {
  AlertCircle,
  Loader2,
  Users,
  Route as RouteIcon,
  Wand2,
  BookText,
  X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDirtyDialogWarning } from "@/hooks/useDirtyDialogWarning";
import { CharacterSettingsContent } from "@/components/characters/CharacterSettingsContent";
import { RouteSettingsContent } from "@/components/routes/RouteSettingsContent";
import { VisualSystemFormContent } from "@/components/visual-system/VisualSystemDialog";
import { WorldElementsSettingsContent } from "@/components/world-elements/WorldElementsSettingsContent";
import { useVisualSystem } from "@/hooks/useVisualSystem";
import { parseGroupPrefixes } from "@/components/visual-system/visual-system.helpers";
import type { VisualSystemFormState } from "@/components/visual-system/visual-system.helpers";

// ============================================================================
// Types
// ============================================================================

export interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Optional initial tab. Defaults to "characters". */
  defaultTab?: SettingsTab;
}

export type SettingsTab = "characters" | "routes" | "visual" | "world";

// ============================================================================
// Helpers
// ============================================================================

const TAB_LABELS: Record<SettingsTab, string> = {
  characters: "Characters",
  routes: "Routes",
  world: "World Bible",
  visual: "Visual System",
};

const TAB_ICONS: Record<
  SettingsTab,
  React.ComponentType<{ className?: string }>
> = {
  characters: Users,
  routes: RouteIcon,
  world: BookText,
  visual: Wand2,
};

const TAB_ORDER: SettingsTab[] = ["characters", "routes", "world", "visual"];

// ============================================================================
// Component
// ============================================================================

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  projectId,
  defaultTab = "characters",
}: ProjectSettingsDialogProps) {
  // Reset to the default tab each time the modal opens. This way a
  // user who closes the dialog while on "Visual" comes back to
  // "Characters" (the most-edited tab) rather than landing on a
  // config screen they were last fiddling with. The reset is done
  // during render (not in an effect) so there's no flash of the
  // previous tab on reopen — React's "storing information from
  // previous renders" pattern.
  // (The previous-value tracker must be `useState` rather than
  // `useRef` because the `react-hooks/refs` rule forbids reading
  // and writing refs during render. The extra render that the
  // tracker produces is the cost of this pattern.)
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);
  const [visualSystemDirty, setVisualSystemDirty] = useState(false);
  // react-doctor-disable-next-line react-doctor/no-derived-useState, react-doctor/rerender-state-only-in-handlers
  const [prevOpen, setPrevOpen] = useState(open);
  // react-doctor-disable-next-line react-doctor/no-derived-useState, react-doctor/rerender-state-only-in-handlers
  const [prevDefaultTab, setPrevDefaultTab] = useState(defaultTab);
  if (open !== prevOpen || defaultTab !== prevDefaultTab) {
    setPrevOpen(open);
    setPrevDefaultTab(defaultTab);
    if (open) {
      setActiveTab(defaultTab);
    } else {
      setVisualSystemDirty(false);
    }
  }

  const {
    handleOpenChange,
    confirmDiscard,
    discardDialogOpen,
    setDiscardDialogOpen,
  } = useDirtyDialogWarning(visualSystemDirty, onOpenChange);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        aria-label="Project Settings"
      >
        <DialogContent className="max-w-3xl w-full max-h-[80vh] min-h-[500px] max-md:min-h-0 p-0 gap-0 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 max-sm:p-4 border-b border-border/30 flex items-start justify-between shrink-0">
            <div>
              <h2 className="text-lg font-medium">Project Settings</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure characters, routes, visual system, and world bible
                elements.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close project settings"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(next) => {
              if (next !== "visual") setVisualSystemDirty(false);
              setActiveTab(next as SettingsTab);
            }}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="px-3 pt-2 pb-3 shrink-0 sm:px-6">
              <TabsList ariaLabel="Project settings sections" scrollable>
                {TAB_ORDER.map((tab) => {
                  const Icon = TAB_ICONS[tab];
                  return (
                    <TabsTrigger key={tab} value={tab}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="size-3.5" />
                        {TAB_LABELS[tab]}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-6 max-sm:p-4">
              <TabsPanel value="characters" className="space-y-4">
                <CharactersTabContent projectId={projectId} />
              </TabsPanel>
              <TabsPanel value="routes" className="space-y-4">
                <RouteSettingsContent projectId={projectId} columns={2} />
              </TabsPanel>
              <TabsPanel value="world" className="space-y-4">
                <WorldElementsSettingsContent projectId={projectId} />
              </TabsPanel>
              <TabsPanel value="visual" className="space-y-4">
                <VisualSystemTabContent
                  projectId={projectId}
                  onDirtyChange={setVisualSystemDirty}
                />
              </TabsPanel>
            </div>
          </Tabs>

          {/* Footer */}
          <div className="p-6 max-sm:p-4 border-t border-border/30 flex justify-end shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          </div>
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

// ============================================================================
// Characters tab content
// ============================================================================
//
// Fetches the current project to get duoEndingEnabled and wires up
// the toggle to updateProject. This keeps CharacterSettingsContent
// presentational and avoids passing project data through the dialog.

interface CharactersTabContentProps {
  projectId: string;
}

function CharactersTabContent({ projectId }: CharactersTabContentProps) {
  return <CharacterSettingsContent projectId={projectId} columns={2} />;
}

// ============================================================================
// Visual System tab content
// ============================================================================
//
// Renders the visual system form directly inside the tab — not as
// a nested dialog. Closing the project-settings modal also closes
// the tab. Cancel/Save are scoped to the form (the outer dialog
// has its own Close button).

interface VisualSystemTabContentProps {
  projectId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

function VisualSystemTabContent({
  projectId,
  onDirtyChange,
}: VisualSystemTabContentProps) {
  const { config, isLoading, isError, isSaving, updateConfig, refetch } =
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

  // Three states: loading (spinner), error (retry UI), ready (form).
  // Previously the dialog showed the spinner whenever `config` was
  // undefined, which also fires on a failed fetch — leaving the
  // user with no recovery path.
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Failed to load visual system</p>
          <p className="text-xs text-muted-foreground">
            Check your connection and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm font-medium text-[var(--theme-color)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <output>
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </output>
      </div>
    );
  }

  return (
    <VisualSystemFormContent
      key="visual-system-tab"
      initialConfig={config}
      isSaving={isSaving}
      onSave={handleSave}
      // The form's "Cancel" button is a no-op inside the tab — the
      // user closes the project-settings modal via the outer Close
      // button (or the X in the header). Keeping Cancel visible
      // preserves visual parity with the standalone dialog.
      onClose={() => {}}
      onDirtyChange={onDirtyChange}
    />
  );
}
