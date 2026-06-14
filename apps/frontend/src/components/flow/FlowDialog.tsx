/**
 * FlowDialog - Overlay dialog for flow graph visualization
 *
 * Refetches the flow graph + its supporting queries (routes, characters)
 * on every open so the user always sees the latest state, even if a
 * mutation happened elsewhere in the app while the dialog was closed.
 * The mutation hooks (useLabels, useRouteConfigs, useCharacters) also
 * invalidate the flow keys eagerly — this is the backstop for cases
 * the mutation layer can't predict (e.g. external sync, navigation).
 *
 * The refetch is intentionally triggered on the `open` prop transition
 * (not from the Dialog's onOpenChange) because the parent can open the
 * dialog programmatically — e.g. `dispatchModal({ type: "OPEN", key: "flow" })`
 * in LeftSidebar — without going through onOpenChange. An effect is the
 * correct primitive for "respond to an externally controlled prop".
 */

import { useEffect, useRef, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { flowKeys, routeConfigKeys, characterKeys } from "@/lib/query-keys";

const LazyFlowGraph = lazy(() =>
  import("./FlowGraph").then((m) => ({ default: m.FlowGraph }))
);

interface FlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function FlowDialog({ open, onOpenChange, projectId }: FlowDialogProps) {
  const queryClient = useQueryClient();
  // Track the previous `open` value so we only refetch on the
  // closed → open transition (not on every render while the dialog is
  // open).
  const wasOpen = useRef(false);

  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (open && !wasOpen.current) {
      // Fire-and-forget: the queries will refetch in the background
      // and the FlowGraph component will pick up the fresh data via
      // its useQuery subscriptions. We do this here rather than in
      // FlowGraph because FlowGraph is unmounted while the dialog is
      // closed, so its useQuery hooks aren't subscribed.
      void queryClient.refetchQueries({
        queryKey: flowKeys.graph(projectId),
      });
      void queryClient.refetchQueries({
        queryKey: routeConfigKeys.lists(projectId),
      });
      void queryClient.refetchQueries({
        queryKey: characterKeys.lists(projectId),
      });
    }
    wasOpen.current = open;
  }, [open, projectId, queryClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[2200px] h-[96vh] p-0 gap-0 overflow-hidden flex flex-col">
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
          {open && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Loading graph…
                </div>
              }
            >
              <LazyFlowGraph projectId={projectId} />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
