import { MoreHorizontal, Pencil, Settings2, Trash2 } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { ROW_MENU_TRIGGER_CLASSNAME } from "@/components/ide-shared/row-menu-styles";

interface LabelRowMenuProps {
  title: string;
  onRename: () => void;
  onEditDetails: () => void;
  onDelete: () => void;
}

export function LabelRowMenu({
  title,
  onRename,
  onEditDetails,
  onDelete,
}: LabelRowMenuProps) {
  return (
    <Menu>
      <MenuTrigger
        size="icon"
        className={ROW_MENU_TRIGGER_CLASSNAME}
        aria-label={`Label actions for ${title}`}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[170px]">
        <MenuItem className="gap-2" onSelect={onRename}>
          <Pencil className="size-3.5" /> Rename
        </MenuItem>
        <MenuItem className="gap-2" onSelect={onEditDetails}>
          <Settings2 className="size-3.5" /> Edit Details
        </MenuItem>
        <MenuItem className="gap-2" variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-3.5" /> Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
