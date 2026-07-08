import CodeMirror from "@uiw/react-codemirror";
import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  useImperativeHandle,
} from "react";
import type React from "react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import { StateField, StateEffect } from "@codemirror/state";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { renPy } from "../../lib/codemirror/renpy";
import {
  renPyBaseTheme,
  renPySyntaxHighlighting,
} from "../../lib/codemirror/renpy-theme";
import { stripBOM } from "../../lib/codemirror/utils";
import { useEditorCursor } from "../../lib/codemirror/useEditorCursor";
import {
  labelTitleExtension,
  setLabelTitlesEffect,
  type LabelTitleMap,
} from "@/lib/codemirror/label-title-decoration";
import { PaletteSwitcher } from "./PaletteSwitcher";
import {
  FontSizeSwitcher,
  EDITOR_FONT_SIZE_CHANGED,
} from "../FontSizeSwitcher";
import { LineWrapSwitcher } from "./LineWrapSwitcher";
import { SaveIndicator } from "../write-mode/SaveIndicator";
import { Eye, EyeOff } from "lucide-react";
import type { SaveStatus } from "@/hooks/useAutosave";
import { useLocalStorageBoolean } from "@/hooks/useLocalStorage";

export interface ScriptEditorRef {
  focus: () => void;
}

interface ScriptEditorProps {
  content: string;
  onChange?: (value: string) => void;
  scrollToLine?: number | null;
  readOnly?: boolean;
  isFocusMode?: boolean;
  saveStatus?: SaveStatus;
  saveConflict?: boolean;
  onSaveRequest?: () => void;
  labelTitles?: LabelTitleMap;
  /** Controlled line wrap mode. When provided, overrides internal state. */
  lineWrap?: boolean;
  onLineWrapChange?: (wrap: boolean) => void;
  /** Controlled label titles visibility. When provided, overrides internal state. */
  showLabelTitles?: boolean;
  onShowLabelTitlesChange?: (show: boolean) => void;
}

const TARGET_LINE_HIGHLIGHT_MS = 920;
const TARGET_LINE_HIGHLIGHT_CLEANUP_BUFFER_MS = 90;
const TARGET_LINE_HIGHLIGHT_DEDUPE_WINDOW_MS = 180;

// Create a StateField and extension for highlighting a specific line
const createHighlightExtension = () => {
  // Define the state effect for setting the highlighted line
  const setHighlightEffect = StateEffect.define<number | null>();

  // Create the StateField to manage the highlighted line
  const highlightStateField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update: (decorations, transaction) => {
      // Check if there's a setHighlightEffect in the transaction
      for (const effect of transaction.effects) {
        if (effect.is(setHighlightEffect)) {
          const line = effect.value;
          if (line === null) {
            return Decoration.none;
          }
          try {
            const lineObj = transaction.state.doc.line(line);
            const decoration = Decoration.line({
              class: "cm-target-line-highlight",
            });
            return Decoration.set([decoration.range(lineObj.from)]);
          } catch {
            return Decoration.none;
          }
        }
      }
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return { highlightStateField, setHighlightEffect };
};

export const ScriptEditor = function ScriptEditor({
  content,
  onChange,
  scrollToLine,
  readOnly = false,
  isFocusMode = false,
  saveStatus,
  saveConflict,
  onSaveRequest,
  labelTitles,
  lineWrap: propsLineWrap,
  onLineWrapChange,
  showLabelTitles: propsShowLabelTitles,
  onShowLabelTitlesChange,
  ref,
}: ScriptEditorProps & { ref?: React.Ref<ScriptEditorRef> }) {
  const [internalLineWrap, setInternalLineWrap] = useLocalStorageBoolean(
    "script:line-wrap",
    false
  );
  const lineWrap = propsLineWrap ?? internalLineWrap;
  const setLineWrap = onLineWrapChange ?? setInternalLineWrap;
  const lineWrapExtension = useMemo(
    () => (lineWrap ? EditorView.lineWrapping : []),
    [lineWrap]
  );
  const [isHovered, setIsHovered] = useState(false);
  const cleanContent = useMemo(() => stripBOM(content), [content]);

  // Track if we've scrolled to avoid re-scrolling on every render
  const hasScrolled = useRef(false);
  // Keep a reference to the EditorView for dynamic scroll operations
  const editorViewRef = useRef<EditorView | null>(null);

  // Keep latest labelTitles in a ref so handleCreateEditor can dispatch
  // without re-creating the callback (which would re-mount CodeMirror)
  const labelTitlesRef = useRef<LabelTitleMap | undefined>(labelTitles);
  useEffect(() => {
    labelTitlesRef.current = labelTitles;
  });

  // Toggle for showing/hiding label title pills
  const [internalShowLabelTitles, setInternalShowLabelTitles] =
    useLocalStorageBoolean("script:show-label-titles", true);
  const showLabelTitles = propsShowLabelTitles ?? internalShowLabelTitles;
  const setShowLabelTitles =
    onShowLabelTitlesChange ?? setInternalShowLabelTitles;
  const showLabelTitlesRef = useRef(showLabelTitles);
  useEffect(() => {
    showLabelTitlesRef.current = showLabelTitles;
  });

  // Expose focus method to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editorViewRef.current?.focus();
      },
    }),
    []
  );
  // Track the timeout for removing the highlight
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // Track queued animation frames used to start highlight after scrolling/layout
  const highlightRafRef = useRef<number | null>(null);
  const highlightRafNestedRef = useRef<number | null>(null);
  // Prevent back-to-back re-triggers from restarting the animation mid-flight.
  const lastHighlightedLineRef = useRef<number | null>(null);
  const lastHighlightAtRef = useRef(0);

  // Create the highlight extension (only once)
  const { highlightStateField, setHighlightEffect } = useMemo(
    () => createHighlightExtension(),
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

      // Clear any existing timeout
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

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

  // Schedule highlight on the next paint frames so scroll settles first.
  const scheduleLineHighlight = useCallback(
    (view: EditorView, line: number) => {
      if (highlightRafRef.current !== null) {
        cancelAnimationFrame(highlightRafRef.current);
        highlightRafRef.current = null;
      }
      if (highlightRafNestedRef.current !== null) {
        cancelAnimationFrame(highlightRafNestedRef.current);
        highlightRafNestedRef.current = null;
      }

      highlightRafRef.current = requestAnimationFrame(() => {
        highlightRafNestedRef.current = requestAnimationFrame(() => {
          highlightLineElement(view, line);
          highlightRafRef.current = null;
          highlightRafNestedRef.current = null;
        });
      });
    },
    [highlightLineElement]
  );

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

  // Track previous scrollToLine to detect changes
  const prevScrollToLineRef = useRef<number | null | undefined>(scrollToLine);

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
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      if (highlightRafRef.current !== null) {
        cancelAnimationFrame(highlightRafRef.current);
      }
      if (highlightRafNestedRef.current !== null) {
        cancelAnimationFrame(highlightRafNestedRef.current);
      }
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

  const { cursorPosition, selectionInfo, totalLines, updateListener } =
    useEditorCursor({ initialContent: cleanContent });

  const toggleLineWrap = useCallback(
    () => setLineWrap(!lineWrap),
    [setLineWrap, lineWrap]
  );

  const extensions = useMemo(
    () =>
      [
        renPy,
        renPyBaseTheme,
        renPySyntaxHighlighting,
        lineWrapExtension,
        updateListener,
        highlightStateField,
        labelTitleExtension,
        // Explicitly add search extension with default configuration
        search({}),
        // Highlight matches of the current selection
        highlightSelectionMatches(),
      ].flat(),
    [lineWrapExtension, updateListener, highlightStateField]
  );

  // Dispatch label title updates when the map changes or visibility toggles.
  // Always dispatch (even when labelTitles is undefined) so decorations are
  // cleared when labels are removed and old decorations don't persist.
  useEffect(() => {
    const view = editorViewRef.current;
    if (view) {
      view.dispatch({
        effects: [
          setLabelTitlesEffect.of(
            showLabelTitles && labelTitles ? labelTitles : new Map()
          ),
        ],
      });
    }
  }, [labelTitles, showLabelTitles]);

  return (
    <div className="h-full w-full overflow-hidden min-h-0 min-w-0 flex flex-col">
      <div className="flex-1 min-h-0">
        <CodeMirror
          value={cleanContent}
          height="100%"
          className="h-full w-full min-w-0"
          editable={!readOnly}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={handleCreateEditor}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            drawSelection: true,
            tabSize: 4,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
            // searchKeymap is removed since we add search extension explicitly
          }}
        />
      </div>
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
            onClick={() => setShowLabelTitles(!showLabelTitles)}
            className={`px-3 py-1.5 text-xs font-code border rounded flex items-center gap-2 transition-colors ${
              showLabelTitles
                ? "bg-accent/50 hover:bg-accent border-border"
                : "bg-muted/50 hover:bg-muted border-border"
            }`}
            title={showLabelTitles ? "Hide label titles" : "Show label titles"}
          >
            {showLabelTitles ? (
              <Eye className="size-3" />
            ) : (
              <EyeOff className="size-3" />
            )}
            <span>Titles: {showLabelTitles ? "On" : "Off"}</span>
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
    </div>
  );
};
