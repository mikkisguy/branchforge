import type {
  ComparisonOperator,
  StatCondition,
  VariableCondition,
} from "@branchforge/shared";

export type FormattedConditionPart =
  | { type: "keyword"; text: string }
  | { type: "value"; text: string };

export function formatVariableCondition(
  varName: string,
  condition: VariableCondition
): FormattedConditionPart[] {
  if (condition.operator === "truthy") {
    return [
      { type: "keyword", text: "is" },
      { type: "value", text: varName },
    ];
  }
  if (condition.operator === "falsy") {
    return [
      { type: "keyword", text: "not" },
      { type: "value", text: varName },
    ];
  }
  const val =
    typeof condition.value === "string"
      ? `"${condition.value}"`
      : String(condition.value);
  if (condition.operator === "==") {
    return [
      { type: "value", text: varName },
      { type: "keyword", text: "is" },
      { type: "value", text: val },
    ];
  }
  // operator === "!="
  return [
    { type: "value", text: varName },
    { type: "keyword", text: "is not" },
    { type: "value", text: val },
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
    { type: "value", text: statName },
    { type: "keyword", text: STAT_OPERATOR_WORDS[condition.operator] },
    { type: "value", text: String(condition.value) },
  ];
}
