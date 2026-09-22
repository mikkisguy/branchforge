import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GitLabSyncDialogProgress } from "../GitLabSyncDialogProgress";

describe("GitLabSyncDialogProgress", () => {
  it("does not render a zero conflict count", () => {
    const { container } = render(
      <GitLabSyncDialogProgress
        operation={{ status: "COMPLETED", conflictCount: 0 }}
        isProcessing={false}
        progress={100}
        error={null}
        operationType="export"
      />
    );

    expect(screen.getByText("Export completed")).toBeInTheDocument();
    expect(container).toHaveTextContent("Export completed");
    expect(container).not.toHaveTextContent("0");
  });
});
