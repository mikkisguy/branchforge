import type { FormattedConditionPart } from "@/lib/format-conditions";

interface FormattedConditionProps {
  parts: FormattedConditionPart[];
  valueClassName?: string;
}

export function FormattedCondition({
  parts,
  valueClassName,
}: FormattedConditionProps) {
  return (
    <>
      {parts.map((part, i) =>
        part.type === "keyword" ? (
          <span key={i}>{part.text}</span>
        ) : (
          <span key={i} className={valueClassName ?? "font-mono"}>
            {part.text}
          </span>
        )
      )}
    </>
  );
}
