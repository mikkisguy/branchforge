import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/ui/loading-state";
import { useFlowGraphEntryRefetch } from "@/components/flow/useFlowGraphEntryRefetch";

const LazyFlowGraph = lazy(() =>
  import("@/components/flow/FlowGraph").then((m) => ({
    default: m.FlowGraph,
  }))
);

export function FlowMode(props: { projectId: string }) {
  const { projectId } = props;

  useFlowGraphEntryRefetch(projectId);

  return (
    <div className="flex flex-col bg-canvas min-h-0 h-full">
      <div className="flex-1 min-h-0 relative h-full">
        <Suspense
          fallback={<LoadingState label="Loading flow…" className="h-full" />}
        >
          <LazyFlowGraph
            projectId={projectId}
            className="h-full w-full min-h-0"
          />
        </Suspense>
      </div>
    </div>
  );
}
