import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

/**
 * Node 26 exposes an experimental `localStorage` getter on the global object
 * that returns `undefined` unless `--localstorage-file` is passed. Under
 * vitest + jsdom that getter also shadows `window.localStorage`, while
 * `window.sessionStorage` remains a usable jsdom Storage.
 *
 * Fix narrowly: if `localStorage` is missing/unusable, install a Map-backed
 * Storage **only** on `globalThis.localStorage` and `window.localStorage`.
 * Do **not** mutate `Storage.prototype` — that would also rewrite
 * `sessionStorage` behavior and break per-storage isolation.
 *
 * Tests that need to simulate storage failures should spy the instance
 * (`vi.spyOn(localStorage, "getItem")`), not `Storage.prototype`.
 */
function isUsableStorage(value: unknown): value is Storage {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Storage).getItem === "function" &&
    typeof (value as Storage).setItem === "function" &&
    typeof (value as Storage).removeItem === "function" &&
    typeof (value as Storage).clear === "function"
  );
}

function createMemoryLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(String(key)) ? (store.get(String(key)) ?? null) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  } as Storage;
}

function readLocalStorageFromDescriptor(
  target: typeof globalThis | Window
): Storage | undefined {
  const descriptor =
    Object.getOwnPropertyDescriptor(target, "localStorage") ??
    ("localStorage" in target
      ? Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(target) as object,
          "localStorage"
        )
      : undefined);

  if (!descriptor) {
    return undefined;
  }

  // Node 26 getter warns when invoked without --localstorage-file; probe only.
  if (descriptor.get) {
    return undefined;
  }

  const value = descriptor.value;
  return isUsableStorage(value) ? value : undefined;
}

function ensureLocalStorage(): void {
  const existing =
    readLocalStorageFromDescriptor(globalThis) ??
    (typeof window !== "undefined"
      ? readLocalStorageFromDescriptor(window)
      : undefined);

  if (existing) {
    return;
  }

  const storage = createMemoryLocalStorage();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
  });

  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      enumerable: true,
      value: storage,
    });
  }
}

ensureLocalStorage();

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
  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }
});
