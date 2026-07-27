/**
 * Visual preview row for TechnicalPopover visuals list.
 */

import {
  PROJECT_IMAGE_TOOLTIP_SIZE,
  type ProjectImage,
} from "@branchforge/shared";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface VisualPreviewRowData {
  type: string;
  target: string;
}

interface VisualPreviewRowProps {
  visual: VisualPreviewRowData;
  image?: ProjectImage;
  onOpenPreview: (visual: VisualPreviewRowData) => void;
}

export function VisualPreviewRow({
  visual,
  image,
  onOpenPreview,
}: VisualPreviewRowProps) {
  const hasPreview = Boolean(image?.tooltipUrl);

  const rowButton = (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      onClick={() => onOpenPreview(visual)}
      aria-label={
        hasPreview
          ? `Open preview for ${visual.type} ${visual.target}`
          : `Upload preview for ${visual.type} ${visual.target}`
      }
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          hasPreview ? "bg-primary/80" : "bg-transparent"
        )}
        aria-hidden="true"
      />
      <span>{visual.type}</span>
      {visual.target ? (
        <span className="font-mono text-foreground">{visual.target}</span>
      ) : null}
    </button>
  );

  if (!hasPreview || !image) {
    return <li>{rowButton}</li>;
  }

  return (
    <li>
      <Tooltip
        content={
          <img
            src={image.tooltipUrl}
            alt=""
            className="rounded object-contain"
            style={{
              width: PROJECT_IMAGE_TOOLTIP_SIZE,
              height: PROJECT_IMAGE_TOOLTIP_SIZE,
              maxWidth: PROJECT_IMAGE_TOOLTIP_SIZE,
              maxHeight: PROJECT_IMAGE_TOOLTIP_SIZE,
            }}
          />
        }
        side="bottom"
        className="p-1"
      >
        {rowButton}
      </Tooltip>
    </li>
  );
}
