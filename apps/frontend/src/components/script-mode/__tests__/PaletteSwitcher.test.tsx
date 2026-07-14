import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaletteSwitcher } from "../PaletteSwitcher";

describe("PaletteSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps tab focus out of the menu options", async () => {
    render(
      <div>
        <PaletteSwitcher />
        <button type="button">After switcher</button>
      </div>
    );

    await userEvent.click(
      screen.getByRole("button", { name: /syntax palette/i })
    );

    expect(
      screen.getByRole("listbox", { name: /syntax palette options/i })
    ).toBeInTheDocument();

    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("tabindex", "-1");
    }
  });

  it("opens dropdown on ArrowDown key press", async () => {
    render(<PaletteSwitcher />);

    const button = screen.getByRole("button", { name: /syntax palette/i });
    button.focus();

    await userEvent.keyboard("{ArrowDown}");

    expect(
      screen.getByRole("listbox", { name: /syntax palette options/i })
    ).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("opens dropdown on Enter key press", async () => {
    render(<PaletteSwitcher />);

    const button = screen.getByRole("button", { name: /syntax palette/i });
    button.focus();

    await userEvent.keyboard("{Enter}");

    expect(
      screen.getByRole("listbox", { name: /syntax palette options/i })
    ).toBeInTheDocument();
  });

  it("closes dropdown on Escape and returns focus to button", async () => {
    render(<PaletteSwitcher />);

    const button = screen.getByRole("button", { name: /syntax palette/i });
    button.focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("listbox", { name: /syntax palette options/i })
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByRole("listbox", { name: /syntax palette options/i })
    ).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
  });

  it("navigates with ArrowDown and ArrowUp through palette items", async () => {
    render(<PaletteSwitcher />);

    const button = screen.getByRole("button", { name: /syntax palette/i });
    button.focus();

    // Open with keyboard
    await userEvent.keyboard("{ArrowDown}");

    const options = screen.getAllByRole("option");
    const firstOption = options[0];
    expect(firstOption).toHaveAttribute("aria-selected", "true");

    // ArrowDown to next option
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-activedescendant",
      "palette-option-1"
    );

    // ArrowUp back to first
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-activedescendant",
      "palette-option-0"
    );
  });

  it("selects palette with Enter key", async () => {
    render(<PaletteSwitcher />);

    const button = screen.getByRole("button", { name: /syntax palette/i });
    button.focus();

    // Open, navigate to second item, select
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    // Dropdown should be closed
    expect(
      screen.queryByRole("listbox", { name: /syntax palette options/i })
    ).not.toBeInTheDocument();
    // Focus should be back on button
    expect(document.activeElement).toBe(button);
  });

  it("jumps to first item on Home and last item on End", async () => {
    render(<PaletteSwitcher />);

    const button = screen.getByRole("button", { name: /syntax palette/i });
    button.focus();

    await userEvent.keyboard("{ArrowDown}");

    // Navigate to last item
    await userEvent.keyboard("{End}");
    const options = screen.getAllByRole("option");
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-activedescendant",
      `palette-option-${options.length - 1}`
    );

    // Navigate to first item
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-activedescendant",
      "palette-option-0"
    );
  });

  it("closes dropdown when clicking backdrop", async () => {
    render(<PaletteSwitcher />);

    await userEvent.click(
      screen.getByRole("button", { name: /syntax palette/i })
    );

    const listbox = screen.getByRole("listbox", {
      name: /syntax palette options/i,
    });
    expect(listbox).toBeInTheDocument();

    // The backdrop is the fixed inset-0 div preceding the listbox
    const backdrop = listbox.previousElementSibling!;
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(backdrop);

    expect(
      screen.queryByRole("listbox", { name: /syntax palette options/i })
    ).not.toBeInTheDocument();
  });

  it("has proper ARIA attributes on toggle button", () => {
    render(<PaletteSwitcher />);

    const button = screen.getByRole("button", { name: /syntax palette/i });
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("has proper ARIA attributes on options", async () => {
    render(<PaletteSwitcher />);

    await userEvent.click(
      screen.getByRole("button", { name: /syntax palette/i })
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);

    // First option should be selected (index 0 is Mixed)
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });
});
