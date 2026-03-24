/**
 * WriteMode Page
 *
 * Prose-focused writing interface for dialogue and narration.
 * Features character context, distraction-free focus mode, and line-by-line editing.
 */

import { useState, useCallback, useEffect } from "react";
import {
  ProseEditor,
  SceneNavigator,
  CharacterReferencePanel,
  FocusModeToggle,
} from "@/components/write-mode";
import { useLabels } from "@/hooks/useLabels";
import { useCharacters } from "@/hooks/useCharacters";
import { useProject } from "@/hooks/useProject";
import type { DialogueEntry } from "@/lib/prose-types";

interface WriteModeProps {
  projectName?: string;
}

export function WriteMode({ projectName }: WriteModeProps) {
  const { currentProject } = useProject();
  const {
    labels,
    activeLabel,
    activeLabelId,
    setActiveLabelId,
    isLoadingLabels,
  } = useLabels();

  // Get all project characters
  const { characters } = useCharacters(currentProject?.id ?? "");

  // Focus mode state - controls whether panels are visible
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Handle focus mode toggle - use functional update to avoid stale closure
  const handleFocusModeToggle = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  // Handle content change
  const handleContentChange = useCallback((entries: DialogueEntry[]) => {
    // TODO: Implement saving logic
    console.log("WriteMode content changed:", entries);
  }, []);

  // Handle keyboard shortcut for focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        handleFocusModeToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFocusModeToggle]);

  // Loading state
  if (isLoadingLabels) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading scenes...</p>
      </div>
    );
  }

  // No labels state
  if (!labels.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full">
        <p className="text-muted-foreground">No scenes found in this project</p>
        <p className="text-sm text-muted-foreground">
          Create scenes to start writing
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Transparent Header with Focus Mode Toggle */}
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground/70">
            {projectName || currentProject?.name || "Write Mode"}
          </span>
        </div>
        <FocusModeToggle
          isFocusMode={isFocusMode}
          onToggle={handleFocusModeToggle}
        />
      </div>

      {/* Main Editor Layout */}
      <div className="flex-1 flex gap-6 px-6 pb-6 overflow-hidden min-h-0 min-w-0">
        {/* Left Sidebar - Scene Navigator (transparent) */}
        {!isFocusMode && (
          <div className="w-48 min-h-0 shrink-0">
            <SceneNavigator
              labels={labels}
              activeLabelId={activeLabelId}
              onSelect={setActiveLabelId}
            />
          </div>
        )}

        {/* Main Editor Area - centered with max-width */}
        <div className="flex-1 flex justify-center min-h-0 min-w-0">
          <div className="w-full max-w-3xl min-h-0">
            <ProseEditor
              activeLabel={activeLabel}
              characters={characters}
              onChange={handleContentChange}
            />
          </div>
        </div>

        {/* Right Sidebar - Character Reference (transparent) */}
        {!isFocusMode && (
          <div className="w-56 min-h-0 shrink-0">
            <CharacterReferencePanel
              characters={characters}
              activeLabel={activeLabel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
