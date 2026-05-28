import { BadgeQuestionMark, ArrowUpRight, Image, Split } from "lucide-react";

type BadgeType = "conditions" | "jump" | "visuals" | "menu";

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

interface MenuChoiceData {
  label: string;
  targetLabelId: string;
  targetLabelName: string;
  effects?: {
    stats?: Record<string, number>;
  };
}

interface TechnicalBadgeProps {
  type: BadgeType;
  onClick: () => void;
  data?: ConditionsData | JumpData | VisualData[] | MenuChoiceData[];
  isLineHovered?: boolean;
  className?: string;
}

export function TechnicalBadge({
  type,
  onClick,
  data,
  isLineHovered = false,
  className = "",
}: TechnicalBadgeProps) {
  const icons = {
    conditions: BadgeQuestionMark,
    jump: ArrowUpRight,
    visuals: Image,
    menu: Split,
  };

  const Icon = icons[type];

  // Generate display text based on type and data
  const getBadgeText = (): string => {
    switch (type) {
      case "conditions": {
        if (!data) return "Conditions";
        const conditions = data as ConditionsData;
        const statsCount = conditions.stats
          ? Object.keys(conditions.stats).length
          : 0;
        const varsCount = conditions.variables?.length || 0;
        const count = statsCount + varsCount;
        return count === 1 ? "1 condition" : `${count} conditions`;
      }
      case "jump": {
        if (!data) return "Jump";
        const jump = data as JumpData;
        return jump.labelName;
      }
      case "visuals": {
        if (!data || !Array.isArray(data)) return "Visuals";
        const visuals = data as VisualData[];
        if (visuals.length === 1) {
          return visuals[0].target;
        }
        return `${visuals.length} visuals`;
      }
      case "menu": {
        if (!data || !Array.isArray(data)) return "Menu";
        const choices = data as MenuChoiceData[];
        if (choices.length === 1) {
          return choices[0].label;
        }
        return `${choices.length} choices`;
      }
      default:
        return type;
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center justify-center gap-1.5 px-3 rounded
        min-w-[44px] min-h-[44px]
        text-xs font-normal
        text-muted-foreground
        hover:bg-accent/30
        transition-colors duration-150
        ${className}
      `}
      aria-label={`Technical badge: ${type}`}
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      {isLineHovered && (
        <span className="truncate max-w-[150px] opacity-80">
          {getBadgeText()}
        </span>
      )}
    </button>
  );
}
