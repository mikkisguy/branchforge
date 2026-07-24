import { cn } from "@/lib/utils";
import { TabScrollArea } from "@/components/ui/tab-scroll-area";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import type { Tab } from "../settings-types";

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
    <div className="w-48 border-r border-border/30 flex flex-col max-md:w-full max-md:border-r-0 max-md:border-b max-md:sticky max-md:top-0 max-md:bg-card max-md:z-10">
      {/* Desktop: vertical sidebar */}
      <div className="p-2 space-y-1 max-md:hidden">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
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
            className={cn(
              "shrink-0 whitespace-nowrap px-3 py-2 my-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </TabScrollArea>

      {/* Version — desktop only */}
      <div className="mt-auto pt-4 px-3 max-md:hidden">
        <p className="text-xs text-muted-foreground">
          {APP_NAME} v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
