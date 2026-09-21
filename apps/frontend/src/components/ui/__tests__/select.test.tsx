/**
 * Select Tests
 *
 * Option clicks must call onChange even though the menu is portaled.
 * The listbox z-index must sit above app chrome (sidebar is z-50).
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
] as const;

describe("Select", () => {
  it("calls onChange when an option is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Select value="a" onChange={onChange} options={OPTIONS} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Beta" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("does not call onChange twice when pointerdown is followed by click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Select value="a" onChange={onChange} options={OPTIONS} />);

    await user.click(screen.getByRole("combobox"));
    const option = screen.getByRole("option", { name: "Beta" });
    fireEvent.pointerDown(option, { button: 0 });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("waits for click before selecting an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Select value="a" onChange={onChange} options={OPTIONS} />);

    await user.click(screen.getByRole("combobox"));
    const option = screen.getByRole("option", { name: "Beta" });

    expect(fireEvent.pointerDown(option, { button: 0 })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("keeps its containing dialog open when an option is selected", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <Select value="a" onChange={vi.fn()} options={OPTIONS} />
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Beta" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("selects from a click without pointerdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Select value="a" onChange={onChange} options={OPTIONS} />);

    await user.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("can select again after reopening", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <Select value="a" onChange={onChange} options={OPTIONS} />
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");

    rerender(<Select value="b" onChange={onChange} options={OPTIONS} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Alpha" }));

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(2, "a");
  });

  it("stacks the listbox above sidebar chrome", async () => {
    const user = userEvent.setup();

    render(<Select value="a" onChange={vi.fn()} options={OPTIONS} />);

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByRole("listbox").className).toContain("z-[110]");
  });
});
