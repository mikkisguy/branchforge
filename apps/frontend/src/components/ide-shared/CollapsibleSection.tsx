import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  headerAction,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <div className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/30 transition-colors">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5"
        >
          {title}
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
          />
        </button>
        {headerAction && (
          <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>
        )}
      </div>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
