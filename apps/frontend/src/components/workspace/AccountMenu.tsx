import type { ReactNode } from "react";
import { Check, CircleUser } from "lucide-react";
import type { ThemePalette } from "@/contexts/ThemeContext";
import type { ThemePaletteOption } from "@/components/ide-shared/ThemeSwitcher";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  theme: string;
  setTheme: (theme: ThemePalette) => void;
  themePalettes: ThemePaletteOption[];
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenKeyboardShortcuts: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  contentClassName?: string;
  menuClassName?: string;
  trigger?: ReactNode;
  align?: "start" | "center" | "end";
}

export function AccountMenu({
  theme,
  setTheme,
  themePalettes,
  isDarkMode,
  onToggleDarkMode,
  onOpenKeyboardShortcuts,
  onOpenSettings,
  onLogout,
  contentClassName,
  menuClassName,
  trigger,
  align = "end",
}: AccountMenuProps) {
  const appearanceLabel = isDarkMode ? "Appearance: Dark" : "Appearance: Light";

  return (
    <Menu className={menuClassName}>
      {trigger ?? (
        <MenuTrigger size="icon" variant="ghost" aria-label="Account menu">
          <CircleUser className="size-5" aria-hidden="true" />
        </MenuTrigger>
      )}
      <MenuContent
        align={align}
        className={cn("min-w-[220px]", contentClassName)}
      >
        <MenuItem onSelect={onToggleDarkMode}>{appearanceLabel}</MenuItem>
        <MenuSeparator />
        {themePalettes.map((palette) => {
          const isCurrent = theme === palette.key;
          return (
            <MenuItem
              key={palette.key}
              aria-checked={isCurrent}
              onSelect={() => setTheme(palette.key)}
              className="justify-between gap-2"
            >
              <span>{palette.name}</span>
              {isCurrent ? (
                <Check className="size-4 flex-shrink-0" aria-hidden="true" />
              ) : null}
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <MenuItem onSelect={onOpenKeyboardShortcuts}>
          Keyboard shortcuts
        </MenuItem>
        <MenuItem onSelect={onOpenSettings}>Settings</MenuItem>
        <MenuItem variant="destructive" onSelect={onLogout}>
          Logout
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
