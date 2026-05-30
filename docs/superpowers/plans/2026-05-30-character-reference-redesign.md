# Character Reference Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Character section in ScriptReferencePanel to show all project characters alphabetically with Ren'Py dialogue tags as a coding reference sheet.

**Architecture:** Simple refactor of existing component—remove scene-character filtering, add alphabetical sorting, display Ren'Py tags and avatar images. No new API calls or state management.

**Tech Stack:** React, TypeScript, lucide-react icons, existing CollapsibleSection component.

---

## File Structure

**Modify:**
- `apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx` — Main refactor
- `apps/frontend/src/pages/ide/components/ScriptModeEditorLayout.tsx` — Remove sceneCharacters prop

**Test files:**
- `apps/frontend/src/components/script-mode/__tests__/ScriptReferencePanel.test.tsx` — Add/extend unit tests

---

## Task 1: Remove sceneCharacters prop from parent component

**Files:**
- Modify: `apps/frontend/src/pages/ide/components/ScriptModeEditorLayout.tsx`

- [ ] **Step 1: Read the parent component to understand current usage**

```bash
cd apps/frontend && grep -n "sceneCharacters" src/pages/ide/components/ScriptModeEditorLayout.tsx
```

Expected: Find where `sceneCharacters` is passed to ScriptReferencePanel

- [ ] **Step 2: Remove sceneCharacters from props calculation**

Find the line that passes `sceneCharacters` to ScriptReferencePanel and remove that prop. The prop likely comes from a hook or state.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/ide/components/ScriptModeEditorLayout.tsx
git commit -m "refactor: remove sceneCharacters prop from ScriptReferencePanel"
```

---

## Task 2: Update ScriptReferencePanel interface to remove sceneCharacters

**Files:**
- Modify: `apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx`

- [ ] **Step 1: Read current interface**

```bash
cd apps/frontend && head -30 apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx
```

- [ ] **Step 2: Remove sceneCharacters from ScriptReferencePanelProps interface**

Locate:
```typescript
interface ScriptReferencePanelProps {
  projectId: string;
  sceneCharacters: LabelCharacter[];  // Remove this line
  projectCharacters: Character[];
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
}
```

Change to:
```typescript
interface ScriptReferencePanelProps {
  projectId: string;
  projectCharacters: Character[];
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
}
```

- [ ] **Step 3: Update function parameter destructuring**

Locate:
```typescript
export function ScriptReferencePanel({
  projectId,
  sceneCharacters,
  projectCharacters,
  isCollapsed = false,
  onCollapseToggle,
}: ScriptReferencePanelProps) {
```

Change to:
```typescript
export function ScriptReferencePanel({
  projectId,
  projectCharacters,
  isCollapsed = false,
  onCollapseToggle,
}: ScriptReferencePanelProps) {
```

- [ ] **Step 4: Remove unused imports**

Check if `LabelCharacter` is still used. If only used for the `sceneCharacters` prop, remove:
```typescript
import type { Character, LabelCharacter } from "@branchforge/shared";
```

Change to:
```typescript
import type { Character } from "@branchforge/shared";
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx
git commit -m "refactor: remove sceneCharacters prop from ScriptReferencePanel interface"
```

---

## Task 3: Remove scene-character filtering logic

**Files:**
- Modify: `apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx`

- [ ] **Step 1: Locate and remove sceneCharacterIds useMemo**

Find this block (around lines 63-66):
```typescript
const sceneCharacterIds = useMemo(
  () => new Set(sceneCharacters.map((character) => character.id)),
  [sceneCharacters]
);
```

Delete it entirely.

- [ ] **Step 2: Locate and remove otherCharacters useMemo**

Find this block (around lines 68-74):
```typescript
const otherCharacters = useMemo(
  () =>
    projectCharacters.filter(
      (character) => !sceneCharacterIds.has(character.id)
    ),
  [projectCharacters, sceneCharacterIds]
);
```

Delete it entirely.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx
git commit -m "refactor: remove scene-character filtering logic"
```

---

## Task 4: Add alphabetical sorting for all project characters

**Files:**
- Modify: `apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx`

- [ ] **Step 1: Add sortedCharacters useMemo after existing useMemo blocks**

Add after the `groupedVariables` useMemo (around line 88):
```typescript
const sortedCharacters = useMemo(
  () =>
    [...projectCharacters].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    ),
  [projectCharacters]
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx
git commit -m "feat: add alphabetical sorting for project characters"
```

---

## Task 5: Replace Characters section rendering

**Files:**
- Modify: `apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx`

- [ ] **Step 1: Locate the Characters CollapsibleSection**

Find the section starting around line 117:
```tsx
<CollapsibleSection title="Characters" defaultOpen={true}>
```

Delete everything from `<CollapsibleSection title="Characters" defaultOpen={true}>` to its closing `</CollapsibleSection>` (around line 178).

- [ ] **Step 2: Replace with new Characters section**

Replace with:
```tsx
{/* Characters */}
<CollapsibleSection title="Characters" defaultOpen={true}>
  {sortedCharacters.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-4 text-center">
      <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mb-2">
        <span className="text-xl opacity-40">👥</span>
      </div>
      <p className="text-xs text-muted-foreground">No characters defined</p>
    </div>
  ) : (
    <div className="space-y-2">
      {sortedCharacters.map((character) => (
        <div
          key={character.id}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group"
        >
          {/* Avatar: image or colored circle */}
          {character.avatarUrl ? (
            <img
              src={character.avatarUrl}
              alt={character.displayName}
              className="size-8 rounded-full shrink-0 object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
          ) : (
            <div
              className="size-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 shadow-sm"
              style={{ backgroundColor: character.color ?? "var(--theme-color)" }}
            >
              {character.displayName[0] || "?"}
            </div>
          )}

          {/* Name and tag */}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{character.displayName}</p>
            <span className="font-mono text-xs text-muted-foreground">
              {character.renpyTag}
            </span>
          </div>

          {/* Love interest indicator */}
          {character.isLoveInterest && (
            <Heart className="size-3 text-pink-400 fill-pink-400 shrink-0 opacity-70" />
          )}
        </div>
      ))}
    </div>
  )}
</CollapsibleSection>
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/script-mode/ScriptReferencePanel.tsx
git commit -m "feat: render all project characters with Ren'Py tags"
```

---

## Task 6: Write unit tests

**Files:**
- Create/Modify: `apps/frontend/src/components/script-mode/__tests__/ScriptReferencePanel.test.tsx`

- [ ] **Step 1: Check if test file exists**

```bash
ls -la apps/frontend/src/components/script-mode/__tests__/ScriptReferencePanel.test.tsx
```

If file doesn't exist, create it. If it exists, read it first.

- [ ] **Step 2: Add/extend tests**

Add or extend the test file with:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScriptReferencePanel } from "../ScriptReferencePanel";
import type { Character } from "@branchforge/shared";

describe("ScriptReferencePanel - Characters Section", () => {
  const mockProjectId = "test-project";
  const mockOnCollapseToggle = vi.fn();

  const mockCharacters: Character[] = [
    {
      id: "char-1",
      name: "emily",
      displayName: "Emily",
      renpyTag: "e",
      color: "#ff6b6b",
      avatarUrl: null,
      isLoveInterest: true,
      routeAffiliation: "route-a",
      dialogueStyle: "default",
      conditionalPrefix: null,
      pairGroupId: null,
    },
    {
      id: "char-2",
      name: "natsuki",
      displayName: "Natsuki",
      renpyTag: "n",
      color: "#ffd93d",
      avatarUrl: "/avatars/natsuki.png",
      isLoveInterest: false,
      routeAffiliation: "route-b",
      dialogueStyle: "default",
      conditionalPrefix: null,
      pairGroupId: null,
    },
    {
      id: "char-3",
      name: "sayori",
      displayName: "Sayori",
      renpyTag: "s",
      color: "#6bcb77",
      avatarUrl: null,
      isLoveInterest: true,
      routeAffiliation: "route-c",
      dialogueStyle: "default",
      conditionalPrefix: null,
      pairGroupId: null,
    },
  ];

  it("renders empty state when no characters exist", () => {
    render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={[]}
        onCollapseToggle={mockOnCollapseToggle}
      />
    );

    expect(screen.getByText("No characters defined")).toBeInTheDocument();
  });

  it("sorts characters alphabetically by displayName", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={[
          mockCharacters[1], // Natsuki
          mockCharacters[0], // Emily
          mockCharacters[2], // Sayori
        ]}
        onCollapseToggle={mockOnCollapseToggle}
      />
    );

    const characterNames = container.querySelectorAll(".text-xs.font-medium.truncate");
    expect(characterNames[0].textContent).toBe("Emily");
    expect(characterNames[1].textContent).toBe("Natsuki");
    expect(characterNames[2].textContent).toBe("Sayori");
  });

  it("displays character avatars when avatarUrl exists", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={[mockCharacters[1]]} // Natsuki with avatarUrl
        onCollapseToggle={mockOnCollapseToggle}
      />
    );

    const avatar = container.querySelector("img[src='/avatars/natsuki.png']");
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute("alt", "Natsuki");
  });

  it("falls back to colored circle when avatarUrl is missing", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={[mockCharacters[0]]} // Emily without avatarUrl
        onCollapseToggle={mockOnCollapseToggle}
      />
    );

    const circle = container.querySelector("div[style*='#ff6b6b']");
    expect(circle).toBeInTheDocument();
    expect(circle?.textContent).toBe("E");
  });

  it("displays Ren'Py tags in monospace", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={mockCharacters}
        onCollapseToggle={mockOnCollapseToggle}
      />
    );

    const tags = container.querySelectorAll(".font-mono");
    expect(tags[0].textContent).toBe("e");
    expect(tags[1].textContent).toBe("n");
    expect(tags[2].textContent).toBe("s");
  });

  it("shows heart icon only for love interests", () => {
    const { container } = render(
      <ScriptReferencePanel
        projectId={mockProjectId}
        projectCharacters={mockCharacters}
        onCollapseToggle={mockOnCollapseToggle}
      />
    );

    const hearts = container.querySelectorAll(".text-pink-400");
    expect(hearts).toHaveLength(2); // Emily and Sayori are love interests
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/frontend && pnpm test src/components/script-mode/__tests__/ScriptReferencePanel.test.tsx
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/script-mode/__tests__/ScriptReferencePanel.test.tsx
git commit -m "test: add Character section unit tests"
```

---

## Task 7: Manual testing and verification

**Files:**
- None (manual verification)

- [ ] **Step 1: Start development server**

```bash
pnpm dev
```

- [ ] **Step 2: Navigate to Script Mode in a project with characters**

- [ ] **Step 3: Verify Characters section is expanded by default**

Check: Characters section shows with arrow pointing down

- [ ] **Step 4: Verify all project characters are displayed**

Check: Characters from the entire project appear in one list (no scene separation)

- [ ] **Step 5: Verify alphabetical ordering**

Check: Characters sorted by displayName (A to Z)

- [ ] **Step 6: Verify Ren'Py tags are displayed**

Check: Each character shows their renpyTag in monospace font

- [ ] **Step 7: Verify avatars**

Check:
- Characters with avatarUrl show the uploaded image
- Characters without avatarUrl show colored circle with initial
- Background color matches character.color

- [ ] **Step 8: Verify love interest icons**

Check: Heart icon appears only for characters with isLoveInterest=true

- [ ] **Step 9: Test empty state**

Create a project with no characters, verify "No characters defined" message appears

- [ ] **Step 10: Test collapse/expand**

Click on Characters section header, verify it collapses and expands correctly

- [ ] **Step 11: Test long list**

Verify scrolling works smoothly with many characters

- [ ] **Step 12: Verify no TypeScript errors**

```bash
cd apps/frontend && pnpm typecheck
```

Expected: No errors

- [ ] **Step 13: Run all frontend tests**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 14: Commit**

```bash
git commit -m "chore: manual testing complete"
```

---

## Task 8: Final cleanup and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-character-reference-redesign.md`

- [ ] **Step 1: Update spec status**

Update line 4 from:
```markdown
**Status:** Approved
```

To:
```markdown
**Status:** Completed
```

- [ ] **Step 2: Add implementation notes section**

Add at end of spec:
```markdown

## Implementation Notes

**Date completed:** 2026-05-30
**Changes:**
- Removed sceneCharacters prop from ScriptReferencePanel and parent
- Removed scene-character filtering logic (sceneCharacterIds, otherCharacters)
- Added alphabetical sorting by displayName
- Added Ren'Py tag display in monospace
- Updated avatar display to show image when available, fallback to colored circle
- Empty state for no characters
- Unit tests covering all character display behaviors
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-character-reference-redesign.md
git commit -m "docs: mark character reference redesign as completed"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Display all project characters (Task 5)
- ✅ Sort alphabetically by displayName (Task 4)
- ✅ Show avatar (image or colored circle with initial) (Task 5)
- ✅ Show display name (Task 5)
- ✅ Show Ren'Py tag (Task 5)
- ✅ Show heart icon for love interests (Task 5)
- ✅ Remove scene separation and "Others" section (Task 3)
- ✅ Keep CollapsibleSection wrapper (Task 5)
- ✅ Empty state when no characters (Task 5)
- ✅ Consistent styling (follows existing patterns)
- ✅ Scrollable long lists (inherent in flex + overflow)

**Placeholder scan:**
- ✅ No TBD/TODO markers
- ✅ All code blocks complete
- ✅ All commands exact with expected outputs
- ✅ All test code provided

**Type consistency:**
- ✅ Character type from @branchforge/shared used consistently
- ✅ Props updated in both interface and function signature
- ✅ displayName, renpyTag, isLoveInterest used consistently

**No issues found - plan is ready.**