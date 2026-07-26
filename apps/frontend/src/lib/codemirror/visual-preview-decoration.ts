/**
 * CodeMirror extension for visual statement preview hover/click in Script Mode.
 */

// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
} from "@codemirror/view";
import { PROJECT_IMAGE_TOOLTIP_SIZE } from "@branchforge/shared";

export interface ParsedVisualStatement {
  type: "scene" | "show" | "hide";
  target: string;
}

export interface VisualPreviewImage {
  tooltipUrl: string;
}

export interface VisualPreviewHandlers {
  getImageForTarget: (target: string) => VisualPreviewImage | undefined;
  onOpenPreview: (info: ParsedVisualStatement) => void;
  /** When false, hover tooltips are suppressed (Ctrl/Cmd+click still works). */
  hoverPreviewsEnabled: boolean;
}

export const setVisualPreviewHandlersEffect =
  StateEffect.define<VisualPreviewHandlers>();

const noopHandlers: VisualPreviewHandlers = {
  getImageForTarget: () => undefined,
  onOpenPreview: () => undefined,
  hoverPreviewsEnabled: false,
};

const visualPreviewHandlersField = StateField.define<VisualPreviewHandlers>({
  create: () => noopHandlers,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setVisualPreviewHandlersEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

const VISUAL_STATEMENT_STOP_WORD = /\b(?:at|with|as|zorder)\b/i;

export function parseVisualStatementLine(
  lineText: string
): ParsedVisualStatement | null {
  const trimmed = lineText.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(scene|show|hide)\s+(.+)$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const type = match[1].toLowerCase() as ParsedVisualStatement["type"];
  const rest = match[2].trim();

  if (type === "hide") {
    const target = rest.match(/^(\S+)/)?.[1];
    return target ? { type, target } : null;
  }

  const stopIndex = rest.search(VISUAL_STATEMENT_STOP_WORD);
  const target = (stopIndex === -1 ? rest : rest.slice(0, stopIndex)).trim();
  return target ? { type, target } : null;
}

function buildLineDecorations(state: EditorState): DecorationSet {
  const handlers = state.field(visualPreviewHandlersField);
  const decorations: ReturnType<Decoration["range"]>[] = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const parsed = parseVisualStatementLine(line.text);
    if (!parsed?.target) {
      continue;
    }

    const image = handlers.getImageForTarget(parsed.target);
    const classes = [
      "cm-visual-preview-line",
      image ? "cm-visual-preview-line--has-image" : "",
    ]
      .filter(Boolean)
      .join(" ");

    decorations.push(
      Decoration.line({
        class: classes,
        attributes: {
          title: "Ctrl/Cmd+click to open visual preview",
        },
      }).range(line.from)
    );
  }

  return Decoration.set(decorations, true);
}

const visualPreviewLineDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildLineDecorations(state);
  },
  update(decorations, transaction) {
    const handlersChanged =
      transaction.state.field(visualPreviewHandlersField) !==
      transaction.startState.field(visualPreviewHandlersField);

    if (transaction.docChanged || handlersChanged) {
      return buildLineDecorations(transaction.state);
    }

    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

class VisualPreviewTooltipPlugin implements PluginValue {
  private tooltipEl: HTMLDivElement | null = null;

  constructor(private readonly view: EditorView) {}

  destroy() {
    this.hideTooltip();
  }

  private hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }

  private showTooltip(imageUrl: string, x: number, y: number) {
    if (!this.tooltipEl) {
      const el = document.createElement("div");
      el.className = "cm-visual-preview-tooltip";
      el.style.position = "fixed";
      el.style.zIndex = "10000";
      el.style.pointerEvents = "none";
      el.style.padding = "4px";
      el.style.borderRadius = "6px";
      el.style.border =
        "1px solid color-mix(in srgb, var(--border) 70%, transparent)";
      el.style.background = "var(--popover)";
      el.style.boxShadow = "0 8px 24px rgb(0 0 0 / 0.18)";

      const img = document.createElement("img");
      img.width = PROJECT_IMAGE_TOOLTIP_SIZE;
      img.height = PROJECT_IMAGE_TOOLTIP_SIZE;
      img.style.display = "block";
      img.style.objectFit = "contain";
      el.appendChild(img);
      document.body.appendChild(el);
      this.tooltipEl = el;
    }

    const img = this.tooltipEl.querySelector("img");
    if (img instanceof HTMLImageElement) {
      img.src = imageUrl;
      img.alt = "";
    }

    const offset = 12;
    const maxLeft = window.innerWidth - PROJECT_IMAGE_TOOLTIP_SIZE - 16;
    const maxTop = window.innerHeight - PROJECT_IMAGE_TOOLTIP_SIZE - 16;
    this.tooltipEl.style.left = `${Math.min(x + offset, maxLeft)}px`;
    this.tooltipEl.style.top = `${Math.min(y + offset, maxTop)}px`;
    this.tooltipEl.style.display = "block";
  }

  private getVisualAtPosition(pos: number): {
    parsed: ParsedVisualStatement;
    image?: VisualPreviewImage;
  } | null {
    const line = this.view.state.doc.lineAt(pos);
    const parsed = parseVisualStatementLine(line.text);
    if (!parsed?.target) {
      return null;
    }

    const handlers = this.view.state.field(visualPreviewHandlersField);
    return {
      parsed,
      image: handlers.getImageForTarget(parsed.target),
    };
  }

  update() {
    const handlers = this.view.state.field(visualPreviewHandlersField);
    if (!handlers.hoverPreviewsEnabled) {
      this.hideTooltip();
    }
  }

  onMouseMove(event: MouseEvent) {
    const handlers = this.view.state.field(visualPreviewHandlersField);
    if (!handlers.hoverPreviewsEnabled) {
      this.hideTooltip();
      return;
    }

    const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      this.hideTooltip();
      return;
    }

    const visual = this.getVisualAtPosition(pos);
    if (!visual?.image?.tooltipUrl) {
      this.hideTooltip();
      return;
    }

    this.showTooltip(visual.image.tooltipUrl, event.clientX, event.clientY);
  }

  onMouseLeave() {
    this.hideTooltip();
  }

  /**
   * Ctrl/Cmd + primary-button opens the preview modal.
   * Handled on mousedown so CodeMirror caret placement / selection
   * does not consume the gesture before click fires.
   */
  onModifierOpen(event: MouseEvent): boolean {
    if (!(event.ctrlKey || event.metaKey) || event.button !== 0) {
      return false;
    }

    const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      return false;
    }

    const visual = this.getVisualAtPosition(pos);
    if (!visual) {
      return false;
    }

    event.preventDefault();
    this.hideTooltip();
    const handlers = this.view.state.field(visualPreviewHandlersField);
    handlers.onOpenPreview(visual.parsed);
    return true;
  }
}

const visualPreviewTooltipPlugin = ViewPlugin.fromClass(
  VisualPreviewTooltipPlugin,
  {
    eventHandlers: {
      mousemove(this: VisualPreviewTooltipPlugin, event) {
        this.onMouseMove(event);
      },
      mouseleave(this: VisualPreviewTooltipPlugin) {
        this.onMouseLeave();
      },
      mousedown(this: VisualPreviewTooltipPlugin, event) {
        return this.onModifierOpen(event);
      },
    },
  }
);

export const visualPreviewTheme = EditorView.baseTheme({
  ".cm-visual-preview-line--has-image": {
    backgroundColor: "color-mix(in srgb, var(--primary) 6%, transparent)",
  },
});

export const visualPreviewExtension = [
  visualPreviewHandlersField,
  visualPreviewLineDecorations,
  visualPreviewTooltipPlugin,
  visualPreviewTheme,
];
