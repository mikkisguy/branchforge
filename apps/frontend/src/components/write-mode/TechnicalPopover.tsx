import { ArrowUpRight, Image, HelpCircle, Split } from "lucide-react";
import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
} from "react";
import type { ComparisonOperator, StatCondition } from "@branchforge/shared";

interface ConditionsData {
  stats?: Record<string, StatCondition>;
  variables?: string[];
}

interface JumpData {
  labelName: string;
}

interface VisualData {
  type: string;
  target: string;
}

interface MenuChoiceData {
  label: string;
  targetLabelId: string;
  targetLabelName: string;
  effects?: {
    stats?: Record<string, number>;
  };
}

interface TechnicalPopoverProps {
  type: "conditions" | "jump" | "visuals" | "menu";
  data: ConditionsData | JumpData | VisualData[] | MenuChoiceData[] | null;
  onClose: () => void;
}

const OPERATOR_SYMBOLS: Record<ComparisonOperator, string> = {
  ">=": "≥",
  "<=": "≤",
  "==": "=",
  "!=": "≠",
  ">": ">",
  "<": "<",
};

function formatStatCondition(condition: StatCondition): string {
  return `${OPERATOR_SYMBOLS[condition.operator]} ${condition.value}`;
}

export function TechnicalPopover({
  type,
  data,
  onClose,
}: TechnicalPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  const measureAndSetFlip = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const rect = popover.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;

    // If less than 16px space below (allow some margin), flip upwards
    if (spaceBelow < 16) {
      setIsFlipped(true);
    } else {
      setIsFlipped(false);
    }
  }, []);

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

  // Calculate position - flip upwards if not enough space below
  useLayoutEffect(() => {
    measureAndSetFlip();

    const handleResize = () => measureAndSetFlip();
    const handleScroll = () => measureAndSetFlip();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [measureAndSetFlip, type, data]);

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
            <ul className="text-xs text-muted-foreground space-y-1.5">
              {hasStats &&
                Object.entries(conditionsData.stats!).map(([key, value]) => (
                  <li key={key} className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/60 w-2 flex-shrink-0 select-none">
                      -
                    </span>
                    {key}: {formatStatCondition(value)}
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
              {visualsData.map((visual) => (
                <li
                  key={`${visual.type}_${visual.target}`}
                  className="flex items-center gap-1.5"
                >
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

      case "menu": {
        if (!data || !Array.isArray(data) || data.length === 0) return null;
        const choicesData = data as MenuChoiceData[];
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Split className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium">Menu Choices</span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-2">
              {choicesData.map((choice) => (
                <li key={choice.targetLabelId} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/60 w-2 flex-shrink-0 select-none">
                      -
                    </span>
                    <span className="font-medium text-foreground/90">
                      {choice.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3.5">
                    <ArrowUpRight className="w-3 h-3 text-muted-foreground/60" />
                    <span className="text-muted-foreground/70">
                      {choice.targetLabelName || choice.targetLabelId}
                    </span>
                  </div>
                  {choice.effects?.stats &&
                    Object.keys(choice.effects.stats).length > 0 && (
                      <ul className="ml-3.5 space-y-0.5">
                        {Object.entries(choice.effects.stats).map(
                          ([key, value]) => (
                            <li
                              key={key}
                              className="flex items-center gap-1.5 text-muted-foreground/60"
                            >
                              <span className="w-2" />
                              {key}: {value > 0 ? "+" : ""}
                              {value}
                            </li>
                          )
                        )}
                      </ul>
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
      className={`absolute left-0 z-50 bg-popover border border-border rounded-md shadow-lg p-3 min-w-[200px] animate-in fade-in-0 zoom-in-95 duration-200 ${
        isFlipped ? "bottom-full mb-1" : "top-full mt-1"
      }`}
      style={{ maxWidth: "280px" }}
    >
      {renderContent()}
    </div>
  );
}
