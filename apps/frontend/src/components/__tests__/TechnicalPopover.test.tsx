import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TechnicalPopover } from "@/components/write-mode/TechnicalPopover";
import type { StatCondition } from "@branchforge/shared";

describe("TechnicalPopover", () => {
  it("renders plain English for stat conditions", () => {
    const data = {
      stats: {
        affection_luna: { value: 50, operator: ">=" } as StatCondition,
        trust: { value: 1, operator: "!=" } as StatCondition,
      },
    };

    render(
      <TechnicalPopover
        type="conditions"
        onClose={() => undefined}
        data={data}
      />
    );

    // Check that the stat names are rendered
    expect(screen.getByText("affection_luna")).toBeInTheDocument();
    expect(screen.getByText("trust")).toBeInTheDocument();
    // Check that the keywords are rendered
    expect(screen.getByText("is at least")).toBeInTheDocument();
    expect(screen.getByText("is not")).toBeInTheDocument();
    // Check that the values are rendered
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
