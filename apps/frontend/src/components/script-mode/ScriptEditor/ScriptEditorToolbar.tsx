import { useState } from "react";
import { PaletteSwitcher } from "../PaletteSwitcher";
import { FontSizeSwitcher } from "../../FontSizeSwitcher";
import { LineWrapSwitcher } from "../LineWrapSwitcher";
import { SaveIndicator } from "../../write-mode/SaveIndicator";
import { Eye, EyeOff } from "lucide-react";
import type { SaveStatus } from "@/hooks/useAutosave";

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
  isFocusMode,
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
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex items-center justify-between px-2 py-1 border-t border-border bg-muted/20 font-code text-xs text-muted-foreground transition-opacity duration-300 ease-out max-md:hidden"
      style={{
        opacity: isFocusMode ? (isHovered ? 1 : 0.4) : 1,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-2">
        <FontSizeSwitcher mode="script" direction="up" />
        <LineWrapSwitcher lineWrap={lineWrap} onToggle={toggleLineWrap} />
        <PaletteSwitcher />
        <button
          type="button"
          onClick={() => setShowOverlays(!showOverlays)}
          aria-pressed={showOverlays}
          className={`px-3 py-1.5 text-xs font-code border rounded flex items-center gap-2 transition-colors ${
            showOverlays
              ? "bg-accent/50 hover:bg-accent border-border"
              : "bg-muted/50 hover:bg-muted border-border"
          }`}
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
          <span>Overlays: {showOverlays ? "On" : "Off"}</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        {saveStatus && (
          <>
            <SaveIndicator
              saveStatus={saveStatus}
              displayMode="compact"
              saveConflict={saveConflict}
              onRetry={onSaveRequest}
            />
            <span className="w-px h-3 bg-border" aria-hidden="true" />
          </>
        )}
        <span>Ren'Py</span>
        <span className="w-px h-3 bg-border" aria-hidden="true" />
        <span>UTF-8</span>
        <span className="w-px h-3 bg-border" aria-hidden="true" />
        <span>4 spaces</span>
        <span className="w-px h-3 bg-border" aria-hidden="true" />
        <span>
          Ln {cursorPosition.line}, Col {cursorPosition.col}
        </span>
        <span className="w-px h-3 bg-border" aria-hidden="true" />
        <span>
          {totalLines} {totalLines === 1 ? "line" : "lines"}
        </span>
        {selectionInfo && (
          <>
            <span className="w-px h-3 bg-border" aria-hidden="true" />
            <span className="text-foreground">{selectionInfo}</span>
          </>
        )}
      </div>
    </div>
  );
}
