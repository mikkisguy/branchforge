/**
 * FlowGraphEmpty - Empty state for FlowGraph when no labels exist
 */

import { FlowGraphStatus } from "./FlowGraphStatus";

export function FlowGraphEmpty() {
  return (
    <FlowGraphStatus>
      <div className="text-center">
        <p className="text-lg font-medium mb-2">No labels found</p>
        <p className="text-sm">
          Add labels to your project to see the flow visualization.
        </p>
      </div>
    </FlowGraphStatus>
  );
}
