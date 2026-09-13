import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveIndicator } from "../SaveIndicator";

describe("SaveIndicator", () => {
  it("renders reload and discard actions when a save conflict exists", () => {
    const onReload = vi.fn();
    const onDiscard = vi.fn();

    render(
      <SaveIndicator
        saveStatus="saved"
        displayMode="compact"
        saveConflict
        onReload={onReload}
        onDiscard={onDiscard}
      />
    );

    expect(screen.getByText("Reload scene")).toBeInTheDocument();
    expect(screen.getByText("Discard draft")).toBeInTheDocument();
  });

  it("calls the provided handlers when conflict actions are clicked", () => {
    const onReload = vi.fn();
    const onDiscard = vi.fn();

    render(
      <SaveIndicator
        saveStatus="saved"
        displayMode="compact"
        saveConflict
        onReload={onReload}
        onDiscard={onDiscard}
      />
    );

    fireEvent.click(screen.getByText("Reload scene"));
    expect(onReload).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Discard draft"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("does not render conflict actions when there is no conflict", () => {
    render(
      <SaveIndicator
        saveStatus="saved"
        displayMode="compact"
        saveConflict={false}
        onReload={vi.fn()}
        onDiscard={vi.fn()}
      />
    );

    expect(screen.queryByText("Reload scene")).not.toBeInTheDocument();
    expect(screen.queryByText("Discard draft")).not.toBeInTheDocument();
  });
});
