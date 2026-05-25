import { BadgeQuestionMark, ArrowUpRight, Image } from "lucide-react";

type BadgeType = "conditions" | "jump" | "visuals";

interface TechnicalBadgeProps {
  type: BadgeType;
  onClick: () => void;
  className?: string;
}

export function TechnicalBadge({
  type,
  onClick,
  className = "",
}: TechnicalBadgeProps) {
  const icons = {
    conditions: BadgeQuestionMark,
    jump: ArrowUpRight,
    visuals: Image,
  };

  const Icon = icons[type];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center justify-center
        w-6 h-6 rounded-sm
        text-slate-400 hover:text-slate-500
        transition-colors duration-150
        ${className}
      `}
      aria-label={`Technical badge: ${type}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
