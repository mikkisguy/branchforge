import { useState, useMemo } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { cva } from "class-variance-authority";
import type { Character } from "@branchforge/shared";
import { VariablesDialog } from "@/components/script-mode/VariablesDialog";
import { StatManagementDialog } from "@/components/script-mode/StatManagementDialog";
import { WorldElementsDialog } from "@/components/WorldElementsDialog";
import { useVariables } from "@/hooks/useVariables";
import { useStats } from "@/hooks/useStats";
import { useWorldElements } from "@/hooks/useWorldElements";
import { ScriptReferenceCharactersSection } from "./ScriptReferenceCharactersSection";
import { ScriptReferenceVariablesSection } from "./ScriptReferenceVariablesSection";
import { ScriptReferenceStatsSection } from "./ScriptReferenceStatsSection";
import { ScriptReferenceWorldElementsSection } from "./ScriptReferenceWorldElementsSection";

interface ScriptReferencePanelProps {
  projectId: string;
  projectCharacters: Character[];
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  onCharacterEdit?: (characterId: string) => void;
}

const panelVariants = cva(
  "min-h-0 shrink-0 rounded-lg border border-border bg-panel-tinted overflow-hidden mt-3 transition-all duration-300 ease-out",
  {
    variants: {
      collapsed: {
        true: "w-0 opacity-0 translate-x-full pointer-events-none max-md:absolute max-md:z-40 max-md:inset-y-0 max-md:right-0 max-md:h-full max-md:mb-0 max-md:mt-0 max-md:rounded-none",
        false:
          "w-64 opacity-100 translate-x-0 max-md:absolute max-md:z-40 max-md:inset-y-0 max-md:right-0 max-md:h-full max-md:w-72 max-md:shadow-xl max-md:rounded-none max-md:mt-0",
      },
    },
  }
);

export function ScriptReferencePanel({
  projectId,
  projectCharacters,
  isCollapsed = false,
  onCollapseToggle,
  onCharacterEdit,
}: ScriptReferencePanelProps) {
  const [variablesDialogOpen, setVariablesDialogOpen] = useState(false);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [worldElementsDialogOpen, setWorldElementsDialogOpen] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>(
    {}
  );

  // Skip API calls if projectId is not valid
  const { variables, isLoadingVariables } = useVariables(
    projectId && projectId.trim() ? projectId : ""
  );
  const { stats, isLoadingStats } = useStats(
    projectId && projectId.trim() ? projectId : ""
  );
  const { elements, isLoadingElements } = useWorldElements(
    projectId && projectId.trim() ? projectId : ""
  );

  // Group variables by category for display
  const groupedVariables = useMemo(() => {
    const groups: Record<string, typeof variables> = {};
    for (const variable of variables) {
      const category =
        (variable.category?.trim() as string | undefined) || "Uncategorized";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(variable);
    }
    return groups;
  }, [variables]);

  const sortedCharacters = useMemo(
    () =>
      projectCharacters.toSorted((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
    [projectCharacters]
  );

  return (
    <>
      <div
        className={panelVariants({ collapsed: isCollapsed })}
        aria-hidden={isCollapsed}
        inert={isCollapsed}
      >
        <div className="h-full overflow-y-auto relative">
          <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3">
            {onCollapseToggle && (
              <button
                type="button"
                onClick={onCollapseToggle}
                className="absolute top-2 right-2 z-30 p-1 rounded-md hover:bg-muted/80 transition-colors"
                aria-label="Collapse reference sidebar"
                title="Collapse reference sidebar"
              >
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            )}
            <h2 className="text-sm font-semibold tracking-wide">Reference</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Project definitions
            </p>
          </div>
          <div>
            <ScriptReferenceCharactersSection
              characters={sortedCharacters}
              failedAvatars={failedAvatars}
              onAvatarError={(id) => {
                setFailedAvatars((prev) => ({ ...prev, [id]: true }));
              }}
              canEdit={!!onCharacterEdit}
              onEdit={onCharacterEdit}
            />
            <ScriptReferenceVariablesSection
              isLoading={isLoadingVariables}
              groupedVariables={groupedVariables}
              onManage={() => setVariablesDialogOpen(true)}
            />
            <ScriptReferenceStatsSection
              isLoading={isLoadingStats}
              stats={stats}
              onManage={() => setStatsDialogOpen(true)}
            />
            <ScriptReferenceWorldElementsSection
              isLoading={isLoadingElements}
              elements={elements}
              onManage={() => setWorldElementsDialogOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <VariablesDialog
        open={variablesDialogOpen}
        onOpenChange={setVariablesDialogOpen}
        projectId={projectId}
      />
      <StatManagementDialog
        open={statsDialogOpen}
        onOpenChange={setStatsDialogOpen}
        projectId={projectId}
      />
      <WorldElementsDialog
        open={worldElementsDialogOpen}
        onOpenChange={setWorldElementsDialogOpen}
        projectId={projectId}
      />

      {isCollapsed && onCollapseToggle && (
        <div className="min-h-0 shrink-0 mt-3 flex items-start -ml-4 max-md:hidden">
          <button
            type="button"
            onClick={onCollapseToggle}
            className="size-12 rounded-lg border border-border bg-card/50 hover:bg-muted/80 transition-colors flex items-center justify-center"
            aria-label="Expand reference sidebar"
            title="Expand reference sidebar"
          >
            <ChevronLeft className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </>
  );
}
