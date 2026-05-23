# Rename Domain Terms to User-Friendly Names

## Goal

Rename domain terminology across backend, shared, frontend, and RPY
generation so user-facing terms match internal naming. This is a pure
rename refactor with no behavioral changes.

## Scope

- Backend: DB schema/table/column renames, migrations, service and
  route updates, validation schemas.
- Shared package: rename exported types for variables and stats.
- Frontend: update hooks, query keys, API calls, and UI copy.
- RPY generation: rename type names and output filenames.

## Approach

Single sweeping rename pass with generated migrations, followed by
application updates to align on new names. No compatibility shims or
aliasing because this is pre-production.

## Rename Map

| Current term                         | New term     | Scope                    |
| ------------------------------------ | ------------ | ------------------------ |
| `prerequisites`                      | `conditions` | DB column, API, frontend |
| `state_variables` / `stateVariables` | `variables`  | DB table, API, frontend  |
| `meters`                             | `stats`      | DB table, API, frontend  |

## Architecture and Data Flow

- DB schema: rename tables `state_variables` -> `variables`, `meters`
  -> `stats`, and column `labels.prerequisites` -> `labels.conditions`
  via generated migrations.
- Backend services/routes: rename service modules and update route
  handlers and validation schemas to the new terms.
- Shared types: rename `StateVariable` -> `Variable`, `Meter` -> `Stat`
  and update exports so frontend imports stay aligned.
- Frontend: update hooks, query keys, and API client calls to new
  endpoints/fields; update UI copy (headings, labels, aria labels).
- RPY generation: update generator types and output filenames to
  `branchforge_variables.rpy` and `branchforge_stats.rpy`.

## Error Handling

No new error handling paths are introduced. Existing validation and
error classes remain; only identifiers change.

## Testing

Update tests that assert names or labels. Run targeted unit or
integration tests that cover renamed routes, schemas, and UI components.

## Out of Scope

- Backward compatibility layers or alias routes.
- Any behavior changes to existing business logic.
