import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GitLabSyncDialogProgress } from "../GitLabSyncDialogProgress";

describe("GitLabSyncDialogProgress", () => {
  it("announces a no-op export and preserves import completion", () => {
    const view = render(
      <GitLabSyncDialogProgress
        operation={{ status: "COMPLETED", noChanges: true }}
        isProcessing={false}
        progress={100}
        error={null}
        operationType="export"
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("No changes to push.");
    expect(screen.queryByText("Export completed")).not.toBeInTheDocument();
    view.rerender(
      <GitLabSyncDialogProgress
        operation={{ status: "COMPLETED", noChanges: true }}
        isProcessing={false}
        progress={100}
        error={null}
        operationType="import"
      />
    );
    expect(screen.getByText("Import completed")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains that an unchanged export did not create the requested branch", () => {
    render(
      <GitLabSyncDialogProgress
        operation={{ status: "COMPLETED", noChanges: true }}
        isProcessing={false}
        progress={100}
        error={null}
        operationType="export"
        createNewBranch
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "No commit or new branch was created."
    );
  });

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
