import type {
  ComparisonOperator,
  StatCondition,
  VariableCondition,
} from "@branchforge/shared";

// `id` is a stable role key within one condition (left/op/right/name),
// scoped to FormattedCondition's sibling list — not a global unique id.
export type FormattedConditionPart =
  | { type: "keyword"; text: string; id: string }
  | { type: "value"; text: string; id: string };

export function formatVariableCondition(
  varName: string,
  condition: VariableCondition
): FormattedConditionPart[] {
  if (condition.operator === "truthy") {
    return [
      { type: "keyword", text: "is", id: "op" },
      { type: "value", text: varName, id: "name" },
    ];
  }
  if (condition.operator === "falsy") {
    return [
      { type: "keyword", text: "not", id: "op" },
      { type: "value", text: varName, id: "name" },
    ];
  }
  const val =
    typeof condition.value === "string"
      ? `"${condition.value}"`
      : String(condition.value);
  if (condition.operator === "==") {
    return [
      { type: "value", text: varName, id: "left" },
      { type: "keyword", text: "is", id: "op" },
      { type: "value", text: val, id: "right" },
    ];
  }
  // operator === "!="
  return [
    { type: "value", text: varName, id: "left" },
    { type: "keyword", text: "is not", id: "op" },
    { type: "value", text: val, id: "right" },
  ];
}

const STAT_OPERATOR_WORDS: Record<ComparisonOperator, string> = {
  ">=": "is at least",
  "<=": "is at most",
  ">": "is more than",
  "<": "is less than",
  "==": "is",
  "!=": "is not",
};

export function formatStatCondition(
  statName: string,
  condition: StatCondition
): FormattedConditionPart[] {
  return [
    { type: "value", text: statName, id: "left" },
    {
      type: "keyword",
      text: STAT_OPERATOR_WORDS[condition.operator],
      id: "op",
    },
    { type: "value", text: String(condition.value), id: "right" },
  ];
}
