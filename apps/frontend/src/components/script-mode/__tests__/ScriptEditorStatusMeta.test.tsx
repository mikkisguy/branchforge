import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScriptEditorStatusMeta } from "../ScriptEditor/ScriptEditorToolbar";

describe("ScriptEditorStatusMeta", () => {
  it("renders the GitLab branch inline with editor metadata", () => {
    render(
      <ScriptEditorStatusMeta
        gitlabBranch="main"
        cursorPosition={{ line: 12, col: 4 }}
        selectionInfo={null}
        totalLines={42}
      />
    );

    const branch = screen.getByText("main");
    const language = screen.getByText("Ren'Py");

    expect(branch.parentElement?.parentElement).toBe(language.parentElement);
    expect(screen.getByText("Ln 12, Col 4")).toBeInTheDocument();
    expect(screen.getByText("42 lines")).toBeInTheDocument();
  });
});
