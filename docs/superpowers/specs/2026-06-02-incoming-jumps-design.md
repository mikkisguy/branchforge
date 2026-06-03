# Incoming Jumps Feature Design

**Date:** 2026-06-02
**Issue:** #175
**Status:** Draft

## Summary

Add an "Incoming Jumps" section to Write Mode's LabelPropertiesPanel that displays which labels jump TO the current label, providing writers with context about narrative flow.

## Problem

Currently, LabelPropertiesPanel only shows "Outgoing Jump" (where this label goes). Writers lack visibility into what leads TO this label, making it harder to understand narrative flow and dependencies.

## Solution

Add a new collapsible section "Incoming Jumps" that displays:

- Count badge (e.g., "(3)")
- List of labels that jump to the current label
- For each incoming jump:
  - Source label title
  - Choice text (for menu choices) or "Automatic jump"
  - Optional: conditions on the jump
- Collapsed by default to avoid visual clutter

## Architecture

### Data Model

**New column in `labels` table:**

```sql
incoming_jumps JSONB DEFAULT NULL
```

**IncomingJump interface:**

```typescript
interface IncomingJump {
  sourceLabelId: string;
  sourceLabelTitle: string;
  sourceLabelName: string | null;
  jumpType: "MENU_CHOICE" | "AUTOMATIC";
  choiceText: string | null; // Menu option label, or "Automatic jump"
  conditions?: {
    stats?: Record<string, StatCondition>;
    variables?: string[];
  };
}
```

### Backend Implementation

#### Database Schema

- Add `incoming_jumps` JSONB column to `labels` table
- No indexes needed initially (queried by label ID)

#### Service Layer (labels.service.ts)

**Function: `updateIncomingJumpsForLabel`**

```typescript
async function updateIncomingJumpsForLabel(
  tx: Transaction,
  labelId: string,
  projectId: string
): Promise<void>;
```

Logic:

1. Query all label_lines in project with `isNull(deletedAt)`
2. For menu jumps:
   - Find lines with menuOptions where targetLabelId == labelId
   - Extract source label info, choice text, conditions
3. For automatic jumps:
   - Parse content for "jump label_name" statements
   - Extract source label info
4. Build IncomingJump[] array
5. Update labels.incoming_jumps with the array

**Integration point:**

- Call in `syncLabelsInTransaction` after label lines are upserted
- For each affected label in `affectedLabelIds`, update incoming jumps
- Batch process all affected labels in single transaction

#### API Layer

- No new endpoint needed
- Include `incoming_jumps` in `LabelDetail` response from `GET /labels/:labelId`
- Update `getLabel` service function to include incoming_jumps

#### Shared Types

- Add `incoming_jumps?: IncomingJump[]` to `PublicLabel` interface in `packages/shared/src/index.ts`

### Frontend Implementation

#### Component: LabelPropertiesPanel

**Add after "Outgoing Jump" section:**

```tsx
<CollapsibleSection
  title="Incoming Jumps"
  defaultOpen={false}
  headerAction={
    activeLabel?.incomingJumps && activeLabel.incomingJumps.length > 0 ? (
      <span className="text-xs text-muted-foreground">
        ({activeLabel.incomingJumps.length})
      </span>
    ) : null
  }
>
  {/* List incoming jumps */}
</CollapsibleSection>
```

**Incoming jump item display:**

- Source label title (truncated if needed)
- Jump type indicator (icon or badge)
- Choice text for menu choices
- Conditions badge if present
- Click to navigate to source label (optional, future enhancement)

#### Styling

- Consistent with existing sections
- Use muted colors for visual hierarchy
- Compact layout to fit sidebar width

## Implementation Phases

### Phase 1: Backend

1. Database migration: Add `incoming_jumps` column
2. Implement `updateIncomingJumpsForLabel` function
3. Integrate into `syncLabelsInTransaction`
4. Update `getLabel` to include incoming_jumps
5. Update shared types
6. Add unit tests

### Phase 2: Frontend

1. Update LabelPropertiesPanel component
2. Add incoming jumps section UI
3. Style and polish
4. Add tests

### Phase 3: Validation

1. Manual testing with sample project
2. Verify performance with large projects
3. Check edge cases (broken references, circular jumps)

## Edge Cases

1. **Broken references**: Jump targets labels that don't exist
   - Display with warning indicator
   - Still show source label info

2. **Circular jumps**: A jumps to B, B jumps to A
   - Handle naturally (both show each other in incoming jumps)

3. **Deleted labels**: Source label soft-deleted
   - Exclude from incoming jumps (use `isNull(deletedAt)` in query)

4. **Multiple jumps from same label**: A label jumps to same target multiple times
   - Deduplicate by source label ID and choice text

5. **Empty projects**: No labels or jumps
   - Display empty state message

## Performance Considerations

- Querying all label_lines in project for each affected label could be expensive
- Optimization: Single query for all label lines, then build map in-memory
- For typical project sizes (200 labels × 20 lines = 4,000 rows), should be acceptable
- Consider batch processing if performance issues arise

## Future Enhancements

1. Click to navigate to source label
2. Filter incoming jumps by route/character
3. Visual graph showing jump relationships
4. Highlight incoming jumps in editor
5. Analytics on most common jump patterns

## Acceptance Criteria

- [ ] Incoming Jumps section appears in LabelPropertiesPanel
- [ ] Shows list of labels that jump to the current label
- [ ] Collapsed by default with badge showing count
- [ ] Expands to show detailed information (source label, choice text, conditions)
- [ ] Works for both menu choices and automatic jumps
- [ ] Performance acceptable for typical project sizes
- [ ] Handles edge cases (broken refs, circular jumps, etc.)
- [ ] Updates correctly when Script Mode saves changes
