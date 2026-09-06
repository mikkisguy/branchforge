import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

describe("Menu", () => {
  function renderMenu(onAppearance = vi.fn(), onLogout = vi.fn()) {
    return render(
      <Menu>
        <MenuTrigger aria-label="Account">Open</MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={onAppearance}>Appearance</MenuItem>
          <MenuSeparator />
          <MenuItem variant="destructive" onSelect={onLogout}>
            Logout
          </MenuItem>
        </MenuContent>
      </Menu>
    );
  }

  it("opens via click and sets aria-expanded", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Account" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("chooses an item, calls onSelect, and closes", async () => {
    const user = userEvent.setup();
    const onAppearance = vi.fn();
    renderMenu(onAppearance);

    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: "Appearance" }));

    expect(onAppearance).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("choosing an item restores focus to the Account trigger", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Appearance" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("restores focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);

    const menu = screen.getByRole("menu");
    expect(menu).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("moves highlight with arrow keys", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Account" }));

    const menu = screen.getByRole("menu");
    const appearance = screen.getByRole("menuitem", { name: "Appearance" });
    const logout = screen.getByRole("menuitem", { name: "Logout" });

    expect(menu).toHaveAttribute("aria-activedescendant", appearance.id);

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(menu).toHaveAttribute("aria-activedescendant", logout.id);

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(menu).toHaveAttribute("aria-activedescendant", appearance.id);
  });

  it("selected radio item uses menuitemradio role", async () => {
    const user = userEvent.setup();

    render(
      <Menu>
        <MenuTrigger aria-label="Theme">Open</MenuTrigger>
        <MenuContent>
          <MenuItem aria-checked={true}>Forest</MenuItem>
          <MenuItem aria-checked={false}>Graphite</MenuItem>
        </MenuContent>
      </Menu>
    );

    await user.click(screen.getByRole("button", { name: "Theme" }));

    const selected = screen.getByRole("menuitemradio", { name: "Forest" });
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "Graphite" })
    ).toHaveAttribute("aria-checked", "false");
  });

  it("stacks the menu above sidebar chrome", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Account" }));

    expect(screen.getByRole("menu").className).toContain("z-[110]");
  });

  it("does not select on right-click pointerdown", async () => {
    const user = userEvent.setup();
    const onAppearance = vi.fn();
    renderMenu(onAppearance);

    await user.click(screen.getByRole("button", { name: "Account" }));
    const item = screen.getByRole("menuitem", { name: "Appearance" });
    fireEvent.pointerDown(item, { button: 2 });

    expect(onAppearance).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
