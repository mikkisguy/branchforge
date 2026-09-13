/**
 * File menu item model tests
 */

import { describe, it, expect, vi } from "vitest";
import { buildFileMenuItems } from "@/components/ide-shared/file-menu-items";

describe("buildFileMenuItems", () => {
  it("builds the rename and delete items in order", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();

    const items = buildFileMenuItems({ onRename, onDelete });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      key: "rename",
      label: "Rename / Move",
      destructive: false,
      disabled: false,
    });
    expect(items[1]).toMatchObject({
      key: "delete",
      label: "Delete file…",
      destructive: true,
      disabled: false,
    });

    items[0].onSelect();
    items[1].onSelect();
    expect(onRename).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("honors the disabled flags", () => {
    const items = buildFileMenuItems({
      onRename: vi.fn(),
      onDelete: vi.fn(),
      renameDisabled: true,
      deleteDisabled: true,
    });

    expect(items.map((item) => item.disabled)).toEqual([true, true]);
  });
});
