import { ArrowUpRight, Image, HelpCircle } from "lucide-react";
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
  const popoverRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const renderContent = () => {
    switch (type) {
      case "conditions": {
        if (!data) return null;
        const conditionsData = data as ConditionsData;
        const hasStats =
          conditionsData.stats && Object.keys(conditionsData.stats).length > 0;
        const hasVars =
          conditionsData.variables && conditionsData.variables.length > 0;
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium">Conditions</span>
            </div>
            {/* TODO: Show comparison operators (≥, =, etc.) once LineConditions
                 data model includes operator field and parser extracts them */}
            <ul className="text-xs text-muted-foreground space-y-1.5">
              {hasStats &&
                Object.entries(conditionsData.stats!).map(([key, value]) => (
                  <li key={key} className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/60 w-2 flex-shrink-0 select-none">
                      -
                    </span>
                    {key}: {String(value)}
                  </li>
                ))}
              {hasVars &&
                conditionsData.variables!.map((variable: string) => (
                  <li key={variable} className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/60 w-2 flex-shrink-0 select-none">
                      -
                    </span>
                    {variable}
                  </li>
                ))}
            </ul>
          </div>
        );
      }

      case "jump": {
        if (!data) return null;
        const jumpData = data as JumpData;
        return (
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Jump to:</div>
              <div className="text-sm font-medium">{jumpData.labelName}</div>
            </div>
          </div>
        );
      }

      case "visuals": {
        if (!data || !Array.isArray(data) || data.length === 0) return null;
        const visualsData = data as VisualData[];
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Image className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium">Visuals</span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              {visualsData.map((visual, index) => (
                <li key={index} className="flex items-center gap-1.5">
                  <span className="font-medium">{visual.type}</span>
                  {visual.target && (
                    <>
                      <span className="text-muted-foreground/60 select-none">
                        :
                      </span>
                      <span>{visual.target}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-3 min-w-[200px] animate-in fade-in-0 zoom-in-95 duration-200"
      style={{ maxWidth: "280px" }}
    >
      {renderContent()}
    </div>
  );
}
