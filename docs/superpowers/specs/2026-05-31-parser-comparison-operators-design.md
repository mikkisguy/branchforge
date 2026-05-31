# Parser Comparison Operators Design

## Goal

Capture comparison operators for `if`-parsed stat conditions so write mode can display the correct operator. Keep backward compatibility by defaulting missing operators to ">=".

## Scope

- Only conditions parsed from `if` statements.
- Operators: `>=`, `<=`, `>`, `<`, `==`, `!=`.
- Store ASCII operators; render pretty symbols in UI.

## Data Model

Introduce a shared operator type and extend stat conditions:

```ts
export type ComparisonOperator = ">=" | "<=" | ">" | "<" | "==" | "!=";

export type StatCondition = {
  value: number;
  operator: ComparisonOperator;
};

export type LineConditions = {
  stats?: Record<string, StatCondition>;
  // other fields unchanged
};
```

Backward compatibility: validation accepts legacy `Record<string, number>` and normalizes to `{ value, operator: ">=" }`.

## Backend Changes

- `rpy-parser.service.ts`: when parsing comparison expressions in `if` statements, extract operator and value into `StatCondition`.
- Label-line mapper: normalize legacy numeric stats to `StatCondition` with default operator `">="`.
- Validation: update Zod schemas to accept both legacy and new shapes, output normalized `StatCondition`.

## Frontend Changes

- `useTechnicalInfo.ts`: normalize legacy numeric stats to `StatCondition` with default `">="`.
- `TechnicalPopover.tsx`: display operator symbol mapping for stat conditions.
- `LabelPropertiesPanel`: same operator display as popover.

Operator display mapping:

- `>=` → `≥`
- `<=` → `≤`
- `==` → `=`
- `!=` → `≠`
- `>` and `<` unchanged

## Data Flow

1. Parser extracts `if` stat comparisons into `{ value, operator }`.
2. Persist in `label_lines.conditions`.
3. On read, normalize legacy numeric stats to `{ value, operator: ">=" }`.
4. UI renders symbol-mapped operators.

## Error Handling

- Missing operator defaults to `">="`.
- Validation errors stay generic for clients; log parser details server-side.

## Testing

- Parser tests for all six operators.
- UI test for operator symbol mapping (unit or snapshot around badges).

## Non-Goals

- No changes to non-`if` condition sources.
- No migration of existing data beyond runtime normalization.
