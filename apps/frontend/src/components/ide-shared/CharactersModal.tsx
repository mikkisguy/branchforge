import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CharacterContent } from "@/components/CharacterContent";

interface CharactersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function CharactersModal({
  open,
  onOpenChange,
  projectId,
}: CharactersModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[700px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>Character Management</DialogTitle>
        </DialogHeader>
        <CharacterContent projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
