import { useState } from "react";
import type { LabelLineNote } from "@branchforge/shared";
import type { DialogueEntry } from "@/lib/prose-types";

interface UnattachedNotesProps {
  notes: LabelLineNote[];
  entries: DialogueEntry[];
  canEdit: boolean;
  onAttach: (index: number, note: LabelLineNote) => void;
}

function UnattachedNoteItem({
  note,
  entries,
  canEdit,
  onAttach,
}: Omit<UnattachedNotesProps, "notes"> & { note: LabelLineNote }) {
  const [targetId, setTargetId] = useState("");
  const targets = entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        entry.contentType !== "CHOICE" && entry.text.trim() && !entry.note
    );
  const selected = targets.find(({ entry }) => entry.id === targetId);

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <p className="whitespace-pre-wrap text-sm">{note.body}</p>
      <p className="text-xs text-muted-foreground">
        {note.storage === "SCRIPT" ? "In script" : "BranchForge only"}
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`note-target-${note.id}`}>
            Line for note
          </label>
          <select
            id={`note-target-${note.id}`}
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-input bg-background p-1.5 text-sm"
          >
            <option value="">Choose a line</option>
            {targets.map(({ entry, index }) => (
              <option key={entry.id} value={entry.id}>
                {index + 1}. {entry.text.slice(0, 70)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onAttach(selected.index, note)}
            className="rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Attach
          </button>
        </div>
      )}
    </div>
  );
}

export function UnattachedNotes({
  notes,
  entries,
  canEdit,
  onAttach,
}: UnattachedNotesProps) {
  const pending = notes.filter(
    (note) => !entries.some((entry) => entry.note?.id === note.id)
  );
  if (pending.length === 0) return null;

  return (
    <details className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {pending.length} unattached {pending.length === 1 ? "note" : "notes"}
      </summary>
      <div className="mt-3 space-y-2">
        {pending.map((note) => (
          <UnattachedNoteItem
            key={note.id}
            note={note}
            entries={entries}
            canEdit={canEdit}
            onAttach={onAttach}
          />
        ))}
      </div>
    </details>
  );
}
