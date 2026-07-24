/**
 * Preview panel for the Visual System form.
 */
import { Wand2 } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface VisualSystemPreviewPanelProps {
  samplePreview: string;
}

// ============================================================================
// Component
// ============================================================================

export function VisualSystemPreviewPanel({
  samplePreview,
}: VisualSystemPreviewPanelProps) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/40 p-3 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Wand2 className="size-3.5" />
        Preview
      </div>
      <p className="mt-1 text-muted-foreground">
        Sample generated name (route <code>hero</code>, group <code>I</code>,
        label <code>1</code>, counter <code>1</code>, slug <code>cafe</code>):
      </p>
      <p className="mt-1 font-mono text-foreground">{samplePreview}</p>
    </div>
  );
}
