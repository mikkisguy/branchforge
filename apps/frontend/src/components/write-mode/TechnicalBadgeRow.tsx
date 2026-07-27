import { useCallback, useState } from "react";
import { TechnicalBadge } from "./TechnicalBadge";
import { TechnicalPopover } from "./TechnicalPopover";
import type { DialogueEntry } from "@/lib/prose-types";
import { useProject } from "@/hooks/useProject";
import {
  VisualPreviewModal,
  type VisualPreviewSelection,
} from "@/components/project-images/VisualPreviewModal";

type PopoverType = "conditions" | "jump" | "visuals" | "menu" | null;

interface TechnicalBadgeRowProps {
  showBadges?: boolean;
  technicalInfo?: DialogueEntry["technicalInfo"];
  isHovered: boolean;
  isStacked: boolean;
  popoverType: PopoverType;
  setPopoverType: React.Dispatch<React.SetStateAction<PopoverType>>;
}

export function TechnicalBadgeRow({
  showBadges,
  technicalInfo,
  isHovered,
  isStacked,
  popoverType,
  setPopoverType,
}: TechnicalBadgeRowProps) {
  const { currentProject } = useProject();
  const [previewSelection, setPreviewSelection] =
    useState<VisualPreviewSelection | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const handleOpenVisualPreview = useCallback(
    (selection: VisualPreviewSelection) => {
      setPreviewSelection(selection);
      setIsPreviewModalOpen(true);
      // Close the popover so its outside-click handler cannot unmount the modal
      // (native <dialog> is outside the popover DOM tree).
      setPopoverType(null);
    },
    [setPopoverType]
  );

  const hasTechnicalContent = Boolean(
    technicalInfo &&
    (technicalInfo.choices ||
      technicalInfo.conditions ||
      technicalInfo.jumpTarget ||
      (technicalInfo.visuals && technicalInfo.visuals.length > 0))
  );
  const showBadgeUi = Boolean(showBadges && hasTechnicalContent);

  // Keep the preview modal mounted even when badge UI is hidden (badges
  // toggled off / line no longer showing badges). Returning null here would
  // unmount VisualPreviewModal and dismiss an open dialog on the next render.
  if (!showBadgeUi && !isPreviewModalOpen) {
    return null;
  }

  return (
    <>
      {showBadgeUi && technicalInfo ? (
        <div className={`mt-1 mb-3 relative ${isStacked ? "" : "ml-[172px]"}`}>
          <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border-b border-border/40 bg-muted/15">
            {/* Menu choices badge (first per spec stacking order) */}
            {technicalInfo.choices && technicalInfo.choices.length > 0 && (
              <TechnicalBadge
                type="menu"
                data={technicalInfo.choices}
                isLineHovered={isHovered}
                onClick={() =>
                  setPopoverType((prev) => (prev === "menu" ? null : "menu"))
                }
              />
            )}

            {/* Conditions badge */}
            {technicalInfo.conditions && (
              <TechnicalBadge
                type="conditions"
                data={technicalInfo.conditions}
                isLineHovered={isHovered}
                onClick={() =>
                  setPopoverType((prev) =>
                    prev === "conditions" ? null : "conditions"
                  )
                }
              />
            )}

            {/* Jump badge */}
            {technicalInfo.jumpTarget && (
              <TechnicalBadge
                type="jump"
                data={technicalInfo.jumpTarget}
                isLineHovered={isHovered}
                onClick={() =>
                  setPopoverType((prev) => (prev === "jump" ? null : "jump"))
                }
              />
            )}

            {/* Visuals badge */}
            {technicalInfo.visuals && technicalInfo.visuals.length > 0 && (
              <TechnicalBadge
                type="visuals"
                data={technicalInfo.visuals}
                isLineHovered={isHovered}
                onClick={() =>
                  setPopoverType((prev) =>
                    prev === "visuals" ? null : "visuals"
                  )
                }
              />
            )}
          </div>

          {/* Popover - renders once at container level, anchored under badge row */}
          {popoverType === "menu" && technicalInfo.choices && (
            <TechnicalPopover
              type="menu"
              data={technicalInfo.choices}
              onClose={() => setPopoverType(null)}
            />
          )}
          {popoverType === "conditions" && technicalInfo.conditions && (
            <TechnicalPopover
              type="conditions"
              data={technicalInfo.conditions}
              onClose={() => setPopoverType(null)}
            />
          )}
          {popoverType === "jump" && technicalInfo.jumpTarget && (
            <TechnicalPopover
              type="jump"
              data={technicalInfo.jumpTarget}
              onClose={() => setPopoverType(null)}
            />
          )}
          {popoverType === "visuals" && technicalInfo.visuals && (
            <TechnicalPopover
              type="visuals"
              data={technicalInfo.visuals}
              onClose={() => setPopoverType(null)}
              onOpenVisualPreview={handleOpenVisualPreview}
            />
          )}
        </div>
      ) : null}

      <VisualPreviewModal
        open={isPreviewModalOpen}
        onOpenChange={setIsPreviewModalOpen}
        projectId={currentProject?.id}
        selection={previewSelection}
      />
    </>
  );
}
