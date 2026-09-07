import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Menu,
  MenuContent,
  MenuGroup,
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
          <MenuGroup label="Theme">
            <MenuItem aria-checked={true}>Forest</MenuItem>
            <MenuItem aria-checked={false}>Graphite</MenuItem>
          </MenuGroup>
        </MenuContent>
      </Menu>
    );

    await user.click(screen.getByRole("button", { name: "Theme" }));

    const selected = screen.getByRole("menuitemradio", { name: "Forest" });
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "Graphite" })
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
  });

  it("can show a visible group label", async () => {
    const user = userEvent.setup();

    render(
      <Menu>
        <MenuTrigger aria-label="Project">Open</MenuTrigger>
        <MenuContent>
          <MenuGroup label="Projects" showLabel>
            <MenuItem>Alpha</MenuItem>
          </MenuGroup>
        </MenuContent>
      </Menu>
    );

    await user.click(screen.getByRole("button", { name: "Project" }));

    expect(screen.getByRole("group", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("stacks the menu above sidebar chrome", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Account" }));

    expect(screen.getByRole("menu").className).toContain("z-[110]");
  });

  it("destructive items use the readable muted token", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Account" }));

    expect(
      screen.getByRole("menuitem", { name: "Logout" }).className
    ).toContain("text-destructive-muted");
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

  function mockTriggerRect(
    trigger: HTMLElement,
    rect: Pick<
      DOMRect,
      "top" | "left" | "bottom" | "right" | "width" | "height"
    >
  ) {
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
      ...rect,
    });
  }

  it("positions under the trigger on the first open", async () => {
    const user = userEvent.setup();
    const innerWidthSpy = vi
      .spyOn(window, "innerWidth", "get")
      .mockReturnValue(1280);

    try {
      renderMenu();

      const trigger = screen.getByRole("button", { name: "Account" });
      mockTriggerRect(trigger, {
        top: 8,
        left: 400,
        bottom: 40,
        right: 480,
        width: 80,
        height: 32,
      });

      await user.click(trigger);

      const menu = screen.getByRole("menu");
      expect(menu).toHaveClass("fixed");
      expect(menu.style.position).toBe("fixed");
      expect(menu.style.visibility).not.toBe("hidden");
      expect(menu.style.top).toBe("44px");
      expect(menu.style.width).toBe("max-content");
      expect(menu.style.left).toBe("auto");
      expect(menu.style.right).toBe("800px");
    } finally {
      innerWidthSpy.mockRestore();
    }
  });

  it("aligns start menus to the trigger left on the first open", async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger aria-label="Project">Open</MenuTrigger>
        <MenuContent align="start">
          <MenuItem>Settings</MenuItem>
        </MenuContent>
      </Menu>
    );

    const trigger = screen.getByRole("button", { name: "Project" });
    mockTriggerRect(trigger, {
      top: 8,
      left: 24,
      bottom: 40,
      right: 160,
      width: 136,
      height: 32,
    });

    await user.click(trigger);

    const menu = screen.getByRole("menu");
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.top).toBe("44px");
    expect(menu.style.left).toBe("24px");
    expect(menu.style.width).toBe("max-content");
    expect(menu.style.right).toBe("auto");
  });

  it("aligns end menus to the trigger right edge on the first open", async () => {
    const user = userEvent.setup();
    const innerWidthSpy = vi
      .spyOn(window, "innerWidth", "get")
      .mockReturnValue(1280);

    try {
      renderMenu();

      const trigger = screen.getByRole("button", { name: "Account" });
      mockTriggerRect(trigger, {
        top: 8,
        left: 880,
        bottom: 40,
        right: 960,
        width: 80,
        height: 32,
      });

      await user.click(trigger);

      const menu = screen.getByRole("menu");
      expect(menu.style.position).toBe("fixed");
      expect(menu.style.visibility).not.toBe("hidden");
      expect(menu.style.top).toBe("44px");
      expect(menu.style.width).toBe("max-content");
      expect(menu.style.left).toBe("auto");
      // 1280 (viewport) - 960 (trigger right); does not use trigger width.
      expect(menu.style.right).toBe("320px");
      expect(Number.parseFloat(menu.style.maxWidth)).toBeGreaterThan(200);
    } finally {
      innerWidthSpy.mockRestore();
    }
  });
});
