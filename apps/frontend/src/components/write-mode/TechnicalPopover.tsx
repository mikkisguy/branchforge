import { BadgeQuestionMark, ArrowUpRight, Image } from "lucide-react";
import { useRef, useEffect } from "react";

interface ConditionsData {
  stats?: Record<string, number>;
  variables?: string[];
}

interface JumpData {
  labelName: string;
}

interface VisualData {
  type: string;
  target: string;
}

interface TechnicalPopoverProps {
  type: "conditions" | "jump" | "visuals";
  data: ConditionsData | JumpData | VisualData[] | null;
  onClose: () => void;
}

export function TechnicalPopover({
  type,
  data,
  onClose,
}: TechnicalPopoverProps) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start 100ms dismiss timer
    timeoutRef.current = setTimeout(() => {
      onClose();
    }, 100);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onClose]);

  const icons = {
    conditions: BadgeQuestionMark,
    jump: ArrowUpRight,
    visuals: Image,
  };

  const Icon = icons[type];

  const renderContent = () => {
    switch (type) {
      case "conditions": {
        if (!data) return null;
        const conditionsData = data as ConditionsData;
        return (
          <div className="space-y-2">
            {conditionsData.stats && (
              <div>
                <h4 className="text-sm font-medium mb-1">Stats</h4>
                <ul className="text-xs text-slate-600 space-y-1">
                  {Object.entries(conditionsData.stats).map(([key, value]) => (
                    <li key={key}>
                      {key}: {String(value)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {conditionsData.variables &&
              conditionsData.variables.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Variables</h4>
                  <ul className="text-xs text-slate-600 space-y-1">
                    {conditionsData.variables.map((variable: string) => (
                      <li key={variable}>{variable}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        );
      }

      case "jump": {
        if (!data) return null;
        const jumpData = data as JumpData;
        return (
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-slate-500" />
            <div>
              <div className="text-xs text-slate-500">Jump to:</div>
              <div className="text-sm font-medium">{jumpData.labelName}</div>
            </div>
          </div>
        );
      }

      case "visuals": {
        if (!data || !Array.isArray(data) || data.length === 0) return null;
        const visualsData = data as VisualData[];
        return (
          <div className="space-y-2">
            {visualsData.map((visual, index) => (
              <div key={index} className="flex items-start gap-2">
                <Image className="w-4 h-4 text-slate-500 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">{visual.type}</div>
                  {visual.target && (
                    <div className="text-xs text-slate-600">
                      {visual.target}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-3"
      style={{ maxWidth: "280px" }}
    >
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 text-slate-500 mt-0.5" />
        <div className="flex-1">{renderContent()}</div>
      </div>
    </div>
  );
}
