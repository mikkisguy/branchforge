import { Fragment } from "react";
import {
  KEYBOARD_SHORTCUT_GROUPS,
  type ShortcutPlatform,
} from "@/lib/keyboard-shortcuts";
import { KeyboardShortcutKeys } from "./KeyboardShortcutKeys";

interface KeyboardShortcutListProps {
  platform: ShortcutPlatform;
}

export function KeyboardShortcutList({ platform }: KeyboardShortcutListProps) {
  return (
    <div className="space-y-8">
      {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
        <section key={group.id} className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">{group.title}</h3>
            {group.description ? (
              <p className="text-sm text-muted-foreground">
                {group.description}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            {group.shortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                className="flex flex-col gap-3 rounded-md border border-border/30 p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{shortcut.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {shortcut.description}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
                  {shortcut.chords.map((chord, chordIndex) => (
                    <Fragment key={chordIndex}>
                      {chordIndex > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          or
                        </span>
                      ) : null}
                      <KeyboardShortcutKeys chord={chord} platform={platform} />
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
