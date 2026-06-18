import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// Polyfill ResizeObserver for jsdom (used by auto-resize textareas, etc.)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// Polyfill HTMLDialogElement.showModal/close for jsdom
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

// Polyfill Document.caretPositionFromPoint for jsdom.
// Production click handlers (e.g. DialogueLine.handleRenderedLineClick) use
// this to map a click on a rendered overlay to a caret offset in the raw
// textarea text. jsdom doesn't implement it, so without this polyfill the
// click-to-caret path is never exercised in tests. We find a text node
// under the rendered-line overlay and return its end-of-text offset so
// the resulting selection is distinguishable from the "no offset" default.
if (typeof document.caretPositionFromPoint === "undefined") {
  document.caretPositionFromPoint = function (_x: number, _y: number) {
    const wrapper = document.querySelector("[data-rendered-line-wrapper]");
    if (!wrapper) return null;
    const span = wrapper.querySelector("[data-raw-start]");
    const textNode = span?.firstChild;
    if (
      !textNode ||
      textNode.nodeType !== Node.TEXT_NODE ||
      !textNode.textContent
    ) {
      return null;
    }
    return {
      offsetNode: textNode,
      offset: textNode.textContent.length,
      getClientRect: () => null,
    };
  };
}

afterEach(() => {
  cleanup();
});
