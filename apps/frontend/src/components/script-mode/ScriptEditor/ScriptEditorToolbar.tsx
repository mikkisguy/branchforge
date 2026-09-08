import { use } from "react";
import { PaletteSwitcher } from "../PaletteSwitcher";
import { FontSizeSwitcher } from "../../FontSizeSwitcher";
import { LineWrapSwitcher } from "../LineWrapSwitcher";
import { SaveIndicator } from "../../write-mode/SaveIndicator";
import { Eye, EyeOff, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/useAutosave";
import {
  STATUS_BAR_ACTIVE_CONTROL_CLASSNAME,
  STATUS_BAR_CONTROL_CLASSNAME,
} from "@/components/workspace/status-bar-control";
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
      <PaletteSwitcher direction="up" />
      <button
        type="button"
        onClick={() => setShowOverlays(!showOverlays)}
        aria-pressed={showOverlays}
        className={cn(
          STATUS_BAR_CONTROL_CLASSNAME,
          "font-code",
          showOverlays && STATUS_BAR_ACTIVE_CONTROL_CLASSNAME
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

export interface ScriptEditorStatus {
  cursorPosition: { line: number; col: number };
  selectionInfo: string | null;
  totalLines: number;
}

interface ScriptEditorStatusMetaProps extends ScriptEditorStatus {
  gitlabBranch?: string;
}

export function ScriptEditorStatusMeta({
  cursorPosition,
  selectionInfo,
  totalLines,
  gitlabBranch,
}: ScriptEditorStatusMetaProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
      {gitlabBranch ? (
        <>
          <span className="flex items-center gap-1.5 text-foreground">
            <GitBranch className="size-3" aria-hidden="true" />
            <span>{gitlabBranch}</span>
          </span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
        </>
      ) : null}
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
    return null;
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
