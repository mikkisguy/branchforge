import type { LabelNodeData } from "./LabelNode";
import { useFlowCharacters } from "./use-flow-characters";
import { statusColors, statusDotColors } from "./label-node-constants";
import { TooltipRow } from "./label-tooltip-row";

export function LabelTooltipContent({ data }: { data: LabelNodeData }) {
  // Resolve character display info lazily — only for this one node when its
  // tooltip is visible — instead of eagerly for every node in the graph.
  const { resolve } = useFlowCharacters();
  const characters = resolve(data.characterIds ?? []);
  const wordCount = data.wordCount ?? 0;

  return (
    <>
      {/* Header: status dot + title + status badge */}
      <div className="flex items-center gap-2 mb-2">
        {data.status && (
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              statusDotColors[data.status] ?? ""
            }`}
          />
        )}
        <span className="text-sm font-semibold text-slate-100 truncate flex-1">
          {data.title}
        </span>
        {data.status && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
              statusColors[data.status] ?? ""
            }`}
          >
            {data.status}
          </span>
        )}
      </div>

      {/* Character appearances */}
      <TooltipRow label="Characters">
        {characters.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {characters.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 text-slate-300"
              >
                {c.avatarUrl ? (
                  <img
                    src={c.avatarUrl}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                {c.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-slate-500 italic">None</span>
        )}
      </TooltipRow>

      {/* Word count */}
      <TooltipRow label="Words">
        <span className="text-slate-300 tabular-nums">
          {wordCount.toLocaleString()}
        </span>
      </TooltipRow>

      {/* Route affiliation */}
      <TooltipRow label="Route">
        <span className="text-slate-300">{data.routeKey ?? "Unassigned"}</span>
      </TooltipRow>

      {/* File name */}
      <TooltipRow label="File">
        <span className="text-slate-400 font-mono text-[11px]">
          {data.fileName}
        </span>
      </TooltipRow>
    </>
  );
}
