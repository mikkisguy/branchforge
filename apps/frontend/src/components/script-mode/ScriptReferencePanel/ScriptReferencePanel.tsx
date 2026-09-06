import { useState, useMemo } from "react";
import type { Character } from "@branchforge/shared";
import { VariablesDialog } from "@/components/script-mode/VariablesDialog";
import { StatManagementDialog } from "@/components/script-mode/StatManagementDialog";
import { WorldElementsDialog } from "@/components/world-elements/WorldElementsDialog";
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
  onCharacterEdit?: (characterId: string) => void;
}

export function ScriptReferencePanel({
  projectId,
  projectCharacters,
  onCharacterEdit,
}: ScriptReferencePanelProps) {
  const [variablesDialogOpen, setVariablesDialogOpen] = useState(false);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [worldElementsDialogOpen, setWorldElementsDialogOpen] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>(
    {}
  );

  const { variables, isLoadingVariables } = useVariables(
    projectId && projectId.trim() ? projectId : ""
  );
  const { stats, isLoadingStats } = useStats(
    projectId && projectId.trim() ? projectId : ""
  );
  const { elements, isLoadingElements } = useWorldElements(
    projectId && projectId.trim() ? projectId : ""
  );

  const groupedVariables = useMemo(() => {
    const groups: Record<string, typeof variables> = {};
    for (const variable of variables) {
      const category = variable.category || "Uncategorized";
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
      <div className="h-full min-h-0 overflow-y-auto">
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
    </>
  );
}
