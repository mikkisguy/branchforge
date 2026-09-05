import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoStoryFiles } from "@/pages/ide/components/WriteModeEmptyStates";

describe("WriteModeEmptyStates", () => {
  it("shows + New File in the no story files state", () => {
    const onNewFile = vi.fn();
    render(<NoStoryFiles onNewFile={onNewFile} />);

    fireEvent.click(screen.getByRole("button", { name: "+ New File" }));
    expect(onNewFile).toHaveBeenCalledTimes(1);
  });

  it("hides + New File when the owner action is omitted", () => {
    render(<NoStoryFiles />);

    expect(
      screen.queryByRole("button", { name: "+ New File" })
    ).not.toBeInTheDocument();
  });
});
