import { use } from "react";
import { PaletteSwitcher } from "../PaletteSwitcher";
import { FontSizeSwitcher } from "../../FontSizeSwitcher";
import { LineWrapSwitcher } from "../LineWrapSwitcher";
import { SaveIndicator } from "../../write-mode/SaveIndicator";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/useAutosave";
import { ScriptEditorToolbarPlacementContext } from "./script-editor-toolbar-context";

interface ScriptEditorFormattingControlsProps {
  lineWrap: boolean;
  toggleLineWrap: () => void;
  showOverlays: boolean;
  setShowOverlays: (show: boolean) => void;
  className?: string;
}

export function ScriptEditorFormattingControls({
  lineWrap,
  toggleLineWrap,
  showOverlays,
  setShowOverlays,
  className,
}: ScriptEditorFormattingControlsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <FontSizeSwitcher mode="script" direction="up" />
      <LineWrapSwitcher lineWrap={lineWrap} onToggle={toggleLineWrap} />
      <PaletteSwitcher />
      <button
        type="button"
        onClick={() => setShowOverlays(!showOverlays)}
        aria-pressed={showOverlays}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
          "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          showOverlays && "bg-muted/40 text-foreground"
        )}
        title={
          showOverlays
            ? "Hide overlays (label titles + image hover previews)"
            : "Show overlays (label titles + image hover previews)"
        }
      >
        {showOverlays ? (
          <Eye className="size-3" />
        ) : (
          <EyeOff className="size-3" />
        )}
        <span className="max-sm:hidden">
          Overlays: {showOverlays ? "On" : "Off"}
        </span>
      </button>
    </div>
  );
}

interface ScriptEditorStatusMetaProps {
  cursorPosition: { line: number; col: number };
  selectionInfo: string | null;
  totalLines: number;
}

export function ScriptEditorStatusMeta({
  cursorPosition,
  selectionInfo,
  totalLines,
}: ScriptEditorStatusMetaProps) {
  return (
    <div className="flex items-center gap-3">
      <span>Ren&apos;Py</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>UTF-8</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>4 spaces</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>
        Ln {cursorPosition.line}, Col {cursorPosition.col}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>
        {totalLines} {totalLines === 1 ? "line" : "lines"}
      </span>
      {selectionInfo ? (
        <>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span className="text-foreground">{selectionInfo}</span>
        </>
      ) : null}
    </div>
  );
}

interface ScriptEditorToolbarProps {
  isFocusMode: boolean;
  lineWrap: boolean;
  toggleLineWrap: () => void;
  showOverlays: boolean;
  setShowOverlays: (show: boolean) => void;
  saveStatus?: SaveStatus;
  saveConflict?: boolean;
  onSaveRequest?: () => void;
  cursorPosition: { line: number; col: number };
  selectionInfo: string | null;
  totalLines: number;
}

export function ScriptEditorToolbar({
  lineWrap,
  toggleLineWrap,
  showOverlays,
  setShowOverlays,
  saveStatus,
  saveConflict,
  onSaveRequest,
  cursorPosition,
  selectionInfo,
  totalLines,
}: ScriptEditorToolbarProps) {
  const placement = use(ScriptEditorToolbarPlacementContext);

  if (placement === "workspace") {
    return (
      <div
        className="flex items-center justify-end px-3 font-code text-xs text-muted-foreground max-md:hidden"
        data-script-editor-meta
      >
        <ScriptEditorStatusMeta
          cursorPosition={cursorPosition}
          selectionInfo={selectionInfo}
          totalLines={totalLines}
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between px-2 py-1 font-code text-xs text-muted-foreground max-md:hidden"
      data-script-editor-toolbar
    >
      <ScriptEditorFormattingControls
        lineWrap={lineWrap}
        toggleLineWrap={toggleLineWrap}
        showOverlays={showOverlays}
        setShowOverlays={setShowOverlays}
      />
      <div className="flex items-center gap-3">
        {saveStatus ? (
          <>
            <SaveIndicator
              saveStatus={saveStatus}
              displayMode="compact"
              saveConflict={saveConflict}
              onRetry={onSaveRequest}
            />
            <span className="h-3 w-px bg-border" aria-hidden="true" />
          </>
        ) : null}
        <ScriptEditorStatusMeta
          cursorPosition={cursorPosition}
          selectionInfo={selectionInfo}
          totalLines={totalLines}
        />
      </div>
    </div>
  );
}
