import { BookText, Plus, Loader2 } from "lucide-react";
import { CollapsibleSection } from "@/components/ide-shared/CollapsibleSection";
import type { WorldElement } from "@branchforge/shared";

export interface ScriptReferenceWorldElementsSectionProps {
  isLoading: boolean;
  elements: WorldElement[];
  onManage: () => void;
}

export function ScriptReferenceWorldElementsSection({
  isLoading,
  elements,
  onManage,
}: ScriptReferenceWorldElementsSectionProps) {
  return (
    <CollapsibleSection
      title="World Bible"
      defaultOpen={false}
      headerAction={
        <button
          type="button"
          onClick={onManage}
          className="p-1 rounded hover:bg-muted/80 transition-colors"
          aria-label="Manage world elements"
          title="Manage world elements"
        >
          <BookText className="size-3 text-muted-foreground" />
        </button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : elements.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground mb-2">
            No world elements defined
          </p>
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="size-3" />
            Add element
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {elements
            .toSorted((a, b) =>
              a.type !== b.type
                ? a.type.localeCompare(b.type)
                : a.name.localeCompare(b.name)
            )
            .map((element) => (
              <div
                key={element.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-xs truncate block">{element.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {element.type.charAt(0) +
                      element.type.slice(1).toLowerCase()}
                  </span>
                </div>
              </div>
            ))}
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-1"
          >
            <Plus className="size-3" />
            Manage elements
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}
