import { cn } from "@/lib/utils";
import { TabScrollArea } from "@/components/ui/tab-scroll-area";
import { APP_VERSION } from "@/lib/version";
import type { Tab } from "../settings-types";

function getTabClassName(isActive: boolean, variant: "desktop" | "mobile") {
  const base =
    variant === "desktop"
      ? "flex h-10 max-md:min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-medium transition-colors"
      : "flex h-10 max-md:min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors";
  return cn(
    base,
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
  );
}

interface SettingsModalNavProps {
  tabs: { id: Tab; label: string }[];
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function SettingsModalNav({
  tabs,
  activeTab,
  onTabChange,
}: SettingsModalNavProps) {
  return (
    <div className="flex w-48 flex-col border-r border-border max-md:sticky max-md:top-0 max-md:z-10 max-md:w-full max-md:border-r-0 max-md:border-b max-md:bg-raised">
      {/* Desktop: vertical sidebar */}
      <div className="p-2 space-y-1 max-md:hidden">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={getTabClassName(activeTab === tab.id, "desktop")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mobile: horizontally scrollable with fade indicators */}
      <TabScrollArea className="md:hidden w-full" fadeFrom="card">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={getTabClassName(activeTab === tab.id, "mobile")}
          >
            {tab.label}
          </button>
        ))}
      </TabScrollArea>

      {/* Version — desktop only */}
      <div className="mt-auto pt-4 pb-2 px-3 max-md:hidden">
        <p className="text-xs text-muted-foreground font-mono">
          v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
