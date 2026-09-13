/**
 * Shared File Menu Item Model
 *
 * Builds the per-file action items rendered by both `FileRowMenu` (hover /
 * focus-revealed trailing button) and `FileContextMenu` (right-click) in
 * `FileRowMenu.tsx`, so behavior stays identical across Script Mode and
 * Write Mode file rows.
 */

import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";

export interface FileMenuItem {
  key: "rename" | "delete";
  label: string;
  icon: ReactNode;
  destructive: boolean;
  disabled: boolean;
  onSelect: () => void | Promise<void>;
}

export interface BuildFileMenuItemsOptions {
  onRename: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  /** Disables rename (e.g. another file operation is in flight). */
  renameDisabled?: boolean;
  /** Disables delete (e.g. another file operation is in flight). */
  deleteDisabled?: boolean;
}

export function buildFileMenuItems({
  onRename,
  onDelete,
  renameDisabled = false,
  deleteDisabled = false,
}: BuildFileMenuItemsOptions): FileMenuItem[] {
  return [
    {
      key: "rename",
      label: "Rename / Move",
      icon: <Pencil className="size-3.5" />,
      destructive: false,
      disabled: renameDisabled,
      onSelect: onRename,
    },
    {
      key: "delete",
      label: "Delete file…",
      icon: <Trash2 className="size-3.5" />,
      destructive: true,
      disabled: deleteDisabled,
      onSelect: onDelete,
    },
  ];
}
