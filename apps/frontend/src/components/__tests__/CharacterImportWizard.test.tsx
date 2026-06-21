/**
 * CharacterImportWizard — nameType badge & helper text
 *
 * Tests the warning indicators added for #138: characters with variable,
 * interpolated, tagged, empty, or unknown display names should surface a
 * badge in the import wizard and a helper text below the display name
 * input. Literal names should not trigger any indicator.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CharacterImportWizard } from "../CharacterImportWizard";
import type { DetectedCharacter } from "@branchforge/shared";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockImport = vi.fn();

vi.mock("@/lib/api/characters", () => ({
  charactersApi: {
    importCharacters: (...args: unknown[]) => mockImport(...args),
  },
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChar(
  overrides: Partial<DetectedCharacter> & {
    tag: string;
    nameType: DetectedCharacter["nameType"];
  }
): DetectedCharacter {
  return {
    name: overrides.nameType === "none" ? null : "name",
    displayName: overrides.displayName ?? "Display",
    color: "#c8ffc8",
    isSpecial: false,
    sourceFile: "test.rpy",
    confidence: 1,
    ...overrides,
  };
}

function renderWizard(
  detectedCharacters: DetectedCharacter[],
  existingTags: string[] = []
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChange = vi.fn();
  const onComplete = vi.fn();

  return {
    onOpenChange,
    onComplete,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CharacterImportWizard
          open
          onOpenChange={onOpenChange}
          projectId="proj-1"
          detectedCharacters={detectedCharacters}
          conflicts={[]}
          excludedTags={[]}
          existingTags={existingTags}
          onComplete={onComplete}
        />
      </QueryClientProvider>
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CharacterImportWizard — nameType warnings (issue #138)", () => {
  beforeEach(() => {
    mockImport.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  it("shows no badge for literal names", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "s",
        name: "Sarah",
        displayName: "Sarah",
        nameType: "literal",
      }),
    ];

    renderWizard(chars);

    // No badge for this tag
    expect(screen.queryByTestId("name-type-badge-s")).not.toBeInTheDocument();
  });

  it("shows a 'Variable name' badge for variable names", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "boss",
        name: "boss_name",
        displayName: "boss_name",
        nameType: "variable",
      }),
    ];

    renderWizard(chars);

    const badge = screen.getByTestId("name-type-badge-boss");
    expect(badge).toHaveTextContent(/Variable name/i);
    expect(badge).toHaveAttribute("title");
    expect(screen.getByTestId("name-type-helper-boss")).toBeInTheDocument();
  });

  it("shows a 'Interpolated name' badge for bracketed interpolation", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "e",
        name: "[e_name]",
        displayName: "[e_name]",
        nameType: "interpolated",
      }),
    ];

    renderWizard(chars);

    const badge = screen.getByTestId("name-type-badge-e");
    expect(badge).toHaveTextContent(/Interpolated name/i);
    expect(screen.getByTestId("name-type-helper-e")).toBeInTheDocument();
  });

  it("shows a 'Formatting stripped' badge when tags were stripped", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "mystery",
        name: "{color=#f00}Stranger{/color}",
        displayName: "Stranger",
        nameType: "tagged",
      }),
    ];

    renderWizard(chars);

    const badge = screen.getByTestId("name-type-badge-mystery");
    expect(badge).toHaveTextContent(/Formatting stripped/i);
  });

  it("shows an 'Empty name' badge and a placeholder when displayName is empty", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "x",
        name: "",
        displayName: "",
        nameType: "empty",
      }),
    ];

    renderWizard(chars);

    const badge = screen.getByTestId("name-type-badge-x");
    expect(badge).toHaveTextContent(/Empty name/i);

    // The display-name input shows a "(unnamed)" placeholder
    const helper = screen.getByTestId("name-type-helper-x");
    expect(helper).toHaveTextContent(/Enter a display name/i);
  });

  it("shows an 'Unknown speaker' badge for ??? names", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "mystery",
        name: "???",
        displayName: "???",
        nameType: "unknown",
        isSpecial: false,
      }),
    ];

    renderWizard(chars);

    const badge = screen.getByTestId("name-type-badge-mystery");
    expect(badge).toHaveTextContent(/Unknown speaker/i);
  });

  it("renders badges for multiple flagged characters in the same group", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "boss",
        name: "boss_name",
        displayName: "boss_name",
        nameType: "variable",
      }),
      makeChar({
        tag: "mystery",
        name: "{color=#f00}Stranger{/color}",
        displayName: "Stranger",
        nameType: "tagged",
      }),
      makeChar({
        tag: "s",
        name: "Sarah",
        displayName: "Sarah",
        nameType: "literal",
      }),
    ];

    renderWizard(chars);

    expect(screen.getByTestId("name-type-badge-boss")).toBeInTheDocument();
    expect(screen.getByTestId("name-type-badge-mystery")).toBeInTheDocument();
    expect(screen.queryByTestId("name-type-badge-s")).not.toBeInTheDocument();
  });

  it("preserves the original displayName and lets the user override it", async () => {
    const user = userEvent.setup();
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "boss",
        name: "boss_name",
        displayName: "boss_name",
        nameType: "variable",
      }),
    ];

    renderWizard(chars);

    const displayNameInput = screen.getByDisplayValue("boss_name");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Big Boss");

    expect(displayNameInput).toHaveValue("Big Boss");
  });

  it("does not show badges when the character is excluded", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "boss",
        name: "boss_name",
        displayName: "boss_name",
        nameType: "variable",
      }),
    ];

    renderWizard(chars);

    // The new-character row renders the badge and helper by default
    expect(screen.getByTestId("name-type-badge-boss")).toBeInTheDocument();
  });

  it("imports flagged characters with the user-edited displayName", async () => {
    const user = userEvent.setup();
    mockImport.mockResolvedValue({
      characters: [
        {
          id: "char-boss",
          projectId: "proj-1",
          name: "boss_name",
          displayName: "Big Boss",
          renpyTag: "boss",
          color: "#c8ffc8",
          routeAffiliation: null,
          isLoveInterest: false,
          dialogueStyle: null,
          conditionalPrefix: null,
          avatarUrl: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      unmatched: [],
    });

    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "boss",
        name: "boss_name",
        displayName: "boss_name",
        nameType: "variable",
      }),
    ];

    renderWizard(chars);

    const displayNameInput = screen.getByDisplayValue("boss_name");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Big Boss");

    const importButton = screen.getByRole("button", {
      name: /Import 1 Character/,
    });
    await user.click(importButton);

    expect(mockImport).toHaveBeenCalledTimes(1);
    const [projectId, payload] = mockImport.mock.calls[0];
    expect(projectId).toBe("proj-1");
    expect(payload.characters).toEqual([
      expect.objectContaining({
        tag: "boss",
        name: "boss_name", // raw name preserved for round-tripping
        displayName: "Big Boss", // user override
      }),
    ]);
  });
});

/**
 * The excluded-state behavior: when the user unchecks "include", the
 * helper text and badge should disappear, since the user has opted out
 * of the character and no longer needs guidance.
 *
 * (This is a documented intent: badges are for characters the user is
 *  actively considering importing.)
 */
describe("CharacterImportWizard — excluded state", () => {
  it("hides the helper text and the input fields once a character is excluded", async () => {
    const user = userEvent.setup();
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "boss",
        name: "boss_name",
        displayName: "boss_name",
        nameType: "variable",
      }),
    ];

    renderWizard(chars);

    expect(screen.getByTestId("name-type-helper-boss")).toBeInTheDocument();

    // Uncheck "include"
    const includeCheckbox = screen.getByLabelText("Include boss");
    await user.click(includeCheckbox);

    expect(
      screen.queryByTestId("name-type-helper-boss")
    ).not.toBeInTheDocument();
  });
});

/**
 * Regression for the wizard-not-showing bug introduced by PR #245.
 *
 * PR #245 promotes extracted characters into the `characters` table
 * during import, so by the time `detectCharacters` runs, all
 * detected tags are in `existingTags`. The wizard's "Already
 * imported" badge gives the user a clear signal that confirming the
 * import is a no-op for those rows.
 */
describe("CharacterImportWizard — already-imported indicator", () => {
  it("shows an 'Already imported' badge for characters that are in the DB", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "s",
        name: "Sarah",
        displayName: "Sarah",
        nameType: "literal",
      }),
      makeChar({
        tag: "boss",
        name: "boss_name",
        displayName: "boss_name",
        nameType: "variable",
      }),
    ];

    // "s" was inserted by PR #245's auto-promote; "boss" is brand new.
    renderWizard(chars, ["s"]);

    expect(screen.getByTestId("already-imported-badge-s")).toBeInTheDocument();
    expect(
      screen.queryByTestId("already-imported-badge-boss")
    ).not.toBeInTheDocument();
  });
});

/**
 * Smoke test: the "Special Characters" group should still render
 * characters that are flagged as special by the parser, and a narrator
 * with `nameType: "none"` should be assigned to that group.
 */
describe("CharacterImportWizard — group assignment", () => {
  it("groups characters with nameType 'none' as special when their tag is the narrator", () => {
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "n",
        name: null,
        displayName: "",
        nameType: "none",
        isSpecial: true,
      }),
      makeChar({
        tag: "s",
        name: "Sarah",
        displayName: "Sarah",
        nameType: "literal",
      }),
    ];

    renderWizard(chars);

    // Both group headers are visible
    expect(screen.getByText("Special Characters")).toBeInTheDocument();
    expect(screen.getByText("New Characters")).toBeInTheDocument();

    // Sarah is rendered in the document (the wizard renders her in the
    // new-character row by tag). The narrator does not appear as a row
    // because it's already excluded by default and the row would be
    // collapsed; but the group header is still shown.
    expect(screen.getByText("s")).toBeInTheDocument();
  });

  it("shows '(unnamed)' for narrator characters with empty displayName", () => {
    // Regression: when a Character(None, ...) is detected, the
    // displayName is empty. The special-character group should render
    // '(unnamed)' instead of an empty parenthetical.
    const chars: DetectedCharacter[] = [
      makeChar({
        tag: "n",
        name: null,
        displayName: "",
        nameType: "none",
        isSpecial: true,
      }),
    ];

    renderWizard(chars);

    // The special-character group is expanded by default and shows
    // the narrator's tag with '((unnamed))' (outer parens from the
    // row template, inner parens from the displayName fallback).
    expect(screen.getByText(/unnamed/)).toBeInTheDocument();
  });
});
