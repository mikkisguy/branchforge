import type { LabelNodeData } from "./LabelNode";
import { statusColors, statusDotColors } from "./label-node-constants";

export function NodeBody({ data }: { data: LabelNodeData }) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        {data.status && (
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              statusDotColors[data.status] ?? ""
            }`}
          />
        )}
        <span className="text-sm font-medium text-foreground truncate">
          {data.title}
        </span>
      </div>
      {data.labelName && (
        <div className="text-xs text-muted-foreground truncate font-mono">
          {data.labelName}
        </div>
      )}
      <div className="flex items-center gap-2 mt-1">
        {data.routeKey && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {data.routeKey}
          </span>
        )}
        {data.status && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded border ${
              statusColors[data.status] ?? ""
            }`}
          >
            {data.status}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground mt-1 truncate">
        {data.fileName}
      </div>
    </div>
  );
}
