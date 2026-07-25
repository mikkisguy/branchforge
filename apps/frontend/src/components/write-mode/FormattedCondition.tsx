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
      {parts.map((part) =>
        part.type === "keyword" ? (
          <span key={part.id}>{part.text}</span>
        ) : (
          <span key={part.id} className={valueClassName ?? "font-mono"}>
            {part.text}
          </span>
        )
      )}
    </>
  );
}
