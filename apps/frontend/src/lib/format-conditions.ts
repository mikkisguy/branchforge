import type { VariableCondition } from "@branchforge/shared";

export const VARIABLE_OPERATOR_SYMBOLS: Record<
  VariableCondition["operator"],
  string
> = {
  "==": "=",
  "!=": "≠",
  truthy: "",
  falsy: "¬",
};

export function formatVariableCondition(
  varName: string,
  condition: VariableCondition
): string {
  if (condition.operator === "truthy") {
    return varName;
  }
  if (condition.operator === "falsy") {
    return `¬${varName}`;
  }
  const symbol = VARIABLE_OPERATOR_SYMBOLS[condition.operator];
  const val =
    typeof condition.value === "string"
      ? condition.value
      : String(condition.value);
  return `${varName} ${symbol} ${val}`;
}
