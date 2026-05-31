# List + Edit Dialogs Refactor (Stats, Variables, Routes)

## Summary

Refactor stats, variables, and routes management to follow the list + separate edit dialog pattern used by character management. Preserve existing features, keep the stats progression panel, add delete confirmations, and lock keys/tags after creation in both UI and backend.

## Goals

- Align stats/variables/routes with the CharacterDialog pattern (list view + edit dialog).
- Preserve all existing content, validations, and loading/empty/error states.
- Keep stats progression in the master-detail dialog.
- Use per-item save for routes.
- Lock keys/tags after creation across UI and backend.
- Add delete confirmation for stats, variables, routes.

## Non-Goals

- No migration of existing data or schema changes.
- No changes to Ren'Py export format.
- No redesign of unrelated dialogs or pages.

## UX Flow

- List dialogs show existing entities with read-only cards, edit/delete actions, and a create button.
- Edit actions open a dedicated edit dialog (create or edit mode).
- Delete requires confirmation.
- Stats dialog keeps the right-side progression panel; selection uses the stat key.

## Components

### New/Refactored Components

- Stats
  - List: `StatList` (read-only list + actions + confirmation)
  - Edit: `StatEditDialog` (create/edit form)
  - Wrapper: `StatManagementDialog` owns edit mode state, selection state, and progression panel
- Variables
  - List: `VariablesList` (grouped by category; read-only list + actions + confirmation)
  - Edit: `VariableEditDialog` (create/edit form)
  - Wrapper: `VariablesDialog` owns edit mode state
- Routes
  - List: `RouteList` (read-only list + actions + confirmation)
  - Edit: `RouteEditDialog` (create/edit form)
  - Wrapper: `RouteSettingsDialog` owns edit mode state

### Shared Patterns

- Use three-state edit mode: `null | "__new__" | id`.
- Use `ConfirmDialog` for delete confirmation.
- Disable edit dialog key fields when editing existing records.

## Backend Changes

Lock keys after creation:

- `updateVariableSchema`: remove `key` from update inputs.
- `updateRouteConfigSchema`: remove `routeKey` from update inputs.
- Keep stats and characters as-is (already locked).

## Validation

- Reuse existing validation logic from current inline forms.
- Keep frontend validation messages and structure.
- Preserve backend validation in `validation.ts` schemas.

## Data Flow

- List dialog loads via existing hooks (`useStats`, `useVariables`, `useRouteConfigs`).
- Edit dialog uses the same hooks for create/update.
- Delete actions call hook delete methods; list state relies on query invalidation.

## Error Handling

- Continue using hook-level toast handling for create/update/delete failures.
- List views show loading spinners and inline error states as today.

## Testing

- Update or add unit tests for new list/edit components where existing tests cover dialogs.
- Ensure route/variable update requests no longer accept key changes (schema coverage).

## Rollout / Compatibility

- Existing data remains valid.
- UI will prevent key edits; backend will reject key edits for variables/routes.
