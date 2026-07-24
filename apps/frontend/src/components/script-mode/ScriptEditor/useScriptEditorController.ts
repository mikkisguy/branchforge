import { useCallback, useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import type { StateEffectType } from "@codemirror/state";
import { setLabelTitlesEffect } from "@/lib/codemirror/label-title-decoration";
import type { LabelTitleMap } from "@/lib/codemirror/label-title-decoration";
import {
  TARGET_LINE_HIGHLIGHT_MS,
  TARGET_LINE_HIGHLIGHT_CLEANUP_BUFFER_MS,
  TARGET_LINE_HIGHLIGHT_DEDUPE_WINDOW_MS,
} from "./ScriptEditorHighlight";
import { EDITOR_FONT_SIZE_CHANGED } from "../../FontSizeSwitcher";

interface UseScriptEditorControllerOptions {
  scrollToLine: number | null | undefined;
  labelTitles: LabelTitleMap | undefined;
  showLabelTitles: boolean;
  setHighlightEffect: StateEffectType<number | null>;
}

export function useScriptEditorController({
  scrollToLine,
  labelTitles,
  showLabelTitles,
  setHighlightEffect,
}: UseScriptEditorControllerOptions) {
  const hasScrolled = useRef(false);
  const editorViewRef = useRef<EditorView | null>(null);

  // Track the timeout for removing the highlight.
  // 0 sentinel — browsers never return 0 from setTimeout / requestAnimationFrame.
  const highlightTimeoutRef = useRef(0);
  // Track queued animation frames used to start highlight after scrolling/layout
  const highlightRafRef = useRef(0);
  const highlightRafNestedRef = useRef(0);
  // Prevent back-to-back re-triggers from restarting the animation mid-flight
  const lastHighlightedLineRef = useRef<number | null>(null);
  const lastHighlightAtRef = useRef(0);

  // Keep latest labelTitles in a ref so handleCreateEditor can dispatch
  // without re-creating the callback (which would re-mount CodeMirror)
  const labelTitlesRef = useRef<LabelTitleMap | undefined>(labelTitles);
  useEffect(() => {
    labelTitlesRef.current = labelTitles;
  });
  const showLabelTitlesRef = useRef(showLabelTitles);
  useEffect(() => {
    showLabelTitlesRef.current = showLabelTitles;
  });

  // Track previous scrollToLine to detect changes
  const prevScrollToLineRef = useRef<number | null | undefined>(scrollToLine);

  // Helper to scroll to a specific line with validation
  const scrollToLineIfValid = useCallback(
    (view: EditorView, line: number | null | undefined) => {
      if (!line) return;

      const docLines = view.state.doc.lines;
      if (Number.isFinite(line) && line >= 1 && line <= docLines) {
        const pos = view.state.doc.line(line).from;
        view.dispatch({
          effects: [
            EditorView.scrollIntoView(pos, { y: "start", yMargin: 50 }),
          ],
        });
      }
      // Mark as scrolled even if out of bounds to avoid repeated attempts
      hasScrolled.current = true;
    },
    []
  );

  // Helper to highlight a specific line using the StateEffect
  const highlightLineElement = useCallback(
    (view: EditorView, line: number) => {
      const now = performance.now();
      if (
        lastHighlightedLineRef.current === line &&
        now - lastHighlightAtRef.current <
          TARGET_LINE_HIGHLIGHT_DEDUPE_WINDOW_MS
      ) {
        return;
      }
      lastHighlightedLineRef.current = line;
      lastHighlightAtRef.current = now;

      // Clear any existing timeout (browser setTimeout always returns > 0,
      // so 0 safely means "no pending timer")
      clearTimeout(highlightTimeoutRef.current);

      // Apply the highlight effect
      view.dispatch({
        effects: [setHighlightEffect.of(line)],
      });

      // Remove the highlight after the pulse fully fades out
      highlightTimeoutRef.current = setTimeout(() => {
        view.dispatch({
          effects: [setHighlightEffect.of(null)],
        });
      }, TARGET_LINE_HIGHLIGHT_MS + TARGET_LINE_HIGHLIGHT_CLEANUP_BUFFER_MS);
    },
    [setHighlightEffect]
  );

  // Schedule highlight on the next paint frames so scroll settles first
  const scheduleLineHighlight = useCallback(
    (view: EditorView, line: number) => {
      if (highlightRafRef.current) {
        cancelAnimationFrame(highlightRafRef.current);
        highlightRafRef.current = 0;
      }
      if (highlightRafNestedRef.current) {
        cancelAnimationFrame(highlightRafNestedRef.current);
        highlightRafNestedRef.current = 0;
      }

      highlightRafRef.current = requestAnimationFrame(() => {
        highlightRafNestedRef.current = requestAnimationFrame(() => {
          highlightLineElement(view, line);
          highlightRafRef.current = 0;
          highlightRafNestedRef.current = 0;
        });
      });
    },
    [highlightLineElement]
  );

  const applyEditorFontSize = useCallback((view: EditorView) => {
    const fontSize = getComputedStyle(document.documentElement)
      .getPropertyValue("--editor-font-size")
      .trim();
    if (!fontSize) {
      return;
    }

    view.dom.style.fontSize = fontSize;
    view.requestMeasure();
  }, []);

  // Add a handler for editor creation to store the view and handle initial scroll
  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      editorViewRef.current = view;
      if (!hasScrolled.current) {
        scrollToLineIfValid(view, scrollToLine);
        // Trigger the highlight effect
        if (scrollToLine) {
          scheduleLineHighlight(view, scrollToLine);
        }
      }
      // Apply initial font size
      applyEditorFontSize(view);

      // Dispatch label titles on initial mount (effect fires while
      // lazy-loaded fallback is still showing, so ref wasn't set yet)
      const currentTitles = labelTitlesRef.current;
      if (
        currentTitles &&
        currentTitles.size > 0 &&
        showLabelTitlesRef.current
      ) {
        view.dispatch({
          effects: [setLabelTitlesEffect.of(currentTitles)],
        });
      }
    },
    [
      scrollToLine,
      scrollToLineIfValid,
      scheduleLineHighlight,
      applyEditorFontSize,
    ]
  );

  // Handle dynamic scrollToLine changes after the editor is created
  useEffect(() => {
    // Reset hasScrolled when scrollToLine changes
    if (prevScrollToLineRef.current !== scrollToLine) {
      hasScrolled.current = false;
      prevScrollToLineRef.current = scrollToLine;
    }

    const view = editorViewRef.current;
    if (scrollToLine && !hasScrolled.current && view) {
      scrollToLineIfValid(view, scrollToLine);
      scheduleLineHighlight(view, scrollToLine);
    }
  }, [scrollToLine, scrollToLineIfValid, scheduleLineHighlight]);

  // Cleanup highlight timeout on unmount
  useEffect(() => {
    return () => {
      clearTimeout(highlightTimeoutRef.current);
      cancelAnimationFrame(highlightRafRef.current);
      cancelAnimationFrame(highlightRafNestedRef.current);
    };
  }, []);

  // Listen for font size changes and update CodeMirror DOM
  useEffect(() => {
    const handleFontSizeChange = (event: Event) => {
      const fontSize = (event as CustomEvent<{ fontSize: number }>).detail
        .fontSize;
      if (
        editorViewRef.current &&
        typeof fontSize === "number" &&
        Number.isFinite(fontSize)
      ) {
        editorViewRef.current.dom.style.fontSize = `${fontSize}px`;
        editorViewRef.current.requestMeasure();
      }
    };

    window.addEventListener(EDITOR_FONT_SIZE_CHANGED, handleFontSizeChange);

    return () => {
      window.removeEventListener(
        EDITOR_FONT_SIZE_CHANGED,
        handleFontSizeChange
      );
    };
  }, []);

  return { editorViewRef, handleCreateEditor };
}
