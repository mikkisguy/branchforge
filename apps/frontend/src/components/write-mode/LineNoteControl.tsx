import { useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import type { DialogueEntry } from "@/lib/prose-types";
import type { NoteStorage } from "@branchforge/shared";

interface LineNoteControlProps {
  entry: DialogueEntry;
  canEdit: boolean;
  onChange: (entry: DialogueEntry) => void;
}

/** Compact note preview and editor beside a prose line's technical badges. */
export function LineNoteControl({
  entry,
  canEdit,
  onChange,
}: LineNoteControlProps) {
  const [open, setOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftStorage, setDraftStorage] =
    useState<NoteStorage>("BRANCHFORGE_ONLY");
  const note = entry.note;

  if (entry.contentType === "CHOICE" || !entry.text.trim()) return null;
  if (!canEdit && !note) return null;

  const startEditing = () => {
    setDraftText(note?.text ?? "");
    setDraftStorage(note?.storage ?? "BRANCHFORGE_ONLY");
    setOpen(true);
  };

  const save = () => {
    const text = draftText.trim();
    if (!text) return;
    onChange({
      ...entry,
      note: { id: note?.id, text, storage: draftStorage },
    });
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 text-xs">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : startEditing())}
        aria-label={note ? "View or edit line note" : "Add line note"}
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="max-w-44 truncate">
          {note ? note.text : "Add note"}
        </span>
        {note?.storage === "SCRIPT" && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide">
            Script
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-medium">Line note</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close line note"
              className="rounded p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {canEdit ? (
            <>
              <label className="sr-only" htmlFor={`note-${entry.id}`}>
                Note text
              </label>
              <textarea
                id={`note-${entry.id}`}
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={4}
                maxLength={4000}
                className="w-full resize-y rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="What should you remember about this line?"
              />
              <fieldset className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                <legend className="mb-1 text-muted-foreground">Save in</legend>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`note-storage-${entry.id}`}
                    checked={draftStorage === "BRANCHFORGE_ONLY"}
                    onChange={() => setDraftStorage("BRANCHFORGE_ONLY")}
                  />
                  BranchForge only
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`note-storage-${entry.id}`}
                    checked={draftStorage === "SCRIPT"}
                    onChange={() => setDraftStorage("SCRIPT")}
                  />
                  Add to script
                </label>
              </fieldset>
              <div className="mt-3 flex items-center justify-between gap-2">
                {note ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ ...entry, note: null });
                      setOpen(false);
                    }}
                    className="rounded px-2 py-1 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Delete note
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={save}
                  disabled={!draftText.trim()}
                  className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Save note
                </button>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{note?.text}</p>
          )}
        </div>
      )}
    </div>
  );
}
