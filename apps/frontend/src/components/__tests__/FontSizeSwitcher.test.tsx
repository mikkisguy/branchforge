import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FontSizeSwitcher } from "../FontSizeSwitcher";

describe("FontSizeSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--editor-font-size");
  });

  it("keeps tab focus out of the menu options", async () => {
    render(
      <div>
        <FontSizeSwitcher mode="script" />
        <button type="button">After switcher</button>
      </div>
    );

    await userEvent.click(screen.getByRole("button", { name: /font size/i }));

    expect(
      screen.getByRole("listbox", { name: /font size options/i })
    ).toBeInTheDocument();

    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("tabindex", "-1");
    }
  });
});
