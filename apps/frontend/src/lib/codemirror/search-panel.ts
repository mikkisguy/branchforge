import type { EditorView } from "@codemirror/view";
import { getSearchQuery, searchPanelOpen } from "@codemirror/search";

const SEARCH_MATCH_COUNT_CLASS = "-search-match-count";
const SEARCH_PRIMARY_ROW_CLASS = "-search-row-primary";
const SEARCH_SECONDARY_ROW_CLASS = "-search-row-secondary";
const SEARCH_UTILITY_CLASS = "-search-utility";
const MAX_MATCHES = 999;

// Track previous panel open state to detect when panel is newly opened
let wasPanelOpen = false;

function getOrCreateSearchCountElement(panel: HTMLElement): HTMLSpanElement {
  const existing = panel.querySelector(`.${SEARCH_MATCH_COUNT_CLASS}`);
  const element =
    existing instanceof HTMLSpanElement
      ? existing
      : document.createElement("span");

  if (!(existing instanceof HTMLSpanElement)) {
    element.className = SEARCH_MATCH_COUNT_CLASS;
    panel.appendChild(element);
  }

  const closeButton = panel.querySelector('button[name="close"]');
  if (closeButton?.parentNode && element.nextElementSibling !== closeButton) {
    closeButton.parentNode.insertBefore(element, closeButton);
  }

  return element;
}

function getOrCreatePanelRow(
  panel: HTMLElement,
  className: string
): HTMLDivElement {
  const existing = panel.querySelector(`.${className}`);
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const row = document.createElement("div");
  row.className = className;
  panel.appendChild(row);
  return row;
}

function normalizeSearchPanelLayout(
  panel: HTMLElement,
  countElement: HTMLSpanElement
): void {
  const primaryRow = getOrCreatePanelRow(panel, SEARCH_PRIMARY_ROW_CLASS);
  const secondaryRow = getOrCreatePanelRow(panel, SEARCH_SECONDARY_ROW_CLASS);
  const utilityRow = getOrCreatePanelRow(panel, SEARCH_UTILITY_CLASS);

  const moveTo = (row: HTMLElement, selector: string): void => {
    const element = panel.querySelector(selector);
    if (element && element.parentElement !== row) {
      row.appendChild(element);
    }
  };

  moveTo(primaryRow, 'input[name="search"]');
  moveTo(primaryRow, 'button[name="next"]');
  moveTo(primaryRow, 'button[name="prev"]');
  moveTo(primaryRow, 'button[name="select"]');

  panel.querySelectorAll("label").forEach((label) => {
    if (label.parentElement !== primaryRow) {
      primaryRow.appendChild(label);
    }
  });

  moveTo(secondaryRow, 'input[name="replace"]');
  moveTo(secondaryRow, 'button[name="replace"]');
  moveTo(secondaryRow, 'button[name="replaceAll"]');

  if (countElement.parentElement !== utilityRow) {
    utilityRow.appendChild(countElement);
  }
  moveTo(utilityRow, 'button[name="close"]');

  // Keep utility controls as the final item so margin-left:auto pins them right.
  if (utilityRow.parentElement !== primaryRow) {
    primaryRow.appendChild(utilityRow);
  } else if (primaryRow.lastElementChild !== utilityRow) {
    primaryRow.appendChild(utilityRow);
  }

  panel.querySelectorAll("br").forEach((lineBreak) => lineBreak.remove());
}

export function updateSearchPanel(view: EditorView): void {
  const panel = view.dom.querySelector(".cm-panel.cm-search");
  if (!(panel instanceof HTMLElement)) {
    wasPanelOpen = false;
    return;
  }

  const countElement = getOrCreateSearchCountElement(panel);
  normalizeSearchPanelLayout(panel, countElement);

  const isPanelOpen = searchPanelOpen(view.state);

  // Focus search input when panel is newly opened
  if (isPanelOpen && !wasPanelOpen) {
    const searchInput = panel.querySelector('input[name="search"]') as HTMLInputElement | null;
    searchInput?.focus();
  }

  wasPanelOpen = isPanelOpen;

  if (!isPanelOpen) {
    countElement.textContent = "";
    return;
  }

  const query = getSearchQuery(view.state);
  if (!query.search) {
    countElement.textContent = "";
    return;
  }

  if (!query.valid) {
    countElement.textContent = "Invalid regex";
    return;
  }

  const selection = view.state.selection.main;
  const hasMultipleSelections = view.state.selection.ranges.length > 1;
  let total = 0;
  let current = 0;
  let capped = false;

  const cursor = query.getCursor(view.state);
  while (true) {
    const nextMatch = cursor.next();
    if (nextMatch.done) {
      break;
    }

    const match = nextMatch.value;
    total += 1;
    if (
      current === 0 &&
      selection.from === match.from &&
      selection.to === match.to
    ) {
      current = total;
    }

    // Stop iterating after reaching the cap to avoid blocking on large result sets
    if (total >= MAX_MATCHES) {
      capped = true;
      break;
    }
  }

  if (total === 0) {
    countElement.textContent = "No matches";
    return;
  }

  const matchLabel = total === 1 ? "match" : "matches";
  const displayTotal = capped ? `${MAX_MATCHES}+` : total;

  if (hasMultipleSelections) {
    countElement.textContent = `${displayTotal} ${matchLabel}`;
    return;
  }

  countElement.textContent =
    current > 0 ? `${current} of ${displayTotal}` : `${displayTotal} ${matchLabel}`;
}
