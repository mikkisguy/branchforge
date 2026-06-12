/**
 * FlowDialog - Overlay dialog for flow graph visualization
 */

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FlowGraph } from "./FlowGraph";
import { X } from "lucide-react";

interface FlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function FlowDialog({ open, onOpenChange, projectId }: FlowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[99vw] max-w-[1900px] h-[96vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 shrink-0">
          <DialogTitle>Flow Graph</DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
            aria-label="Close flow graph"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Graph area - explicit min-height to ensure ReactFlow renders */}
        <div className="flex-1 min-h-0 relative" style={{ minHeight: "500px" }}>
          {open && <FlowGraph projectId={projectId} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
