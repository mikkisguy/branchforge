import { Button } from "@/components/ui/button";

interface WizardFooterProps {
  selectedCount: number;
  isImporting: boolean;
  onClose: () => void;
  onImport: () => void;
}

export function WizardFooter({
  selectedCount,
  isImporting,
  onClose,
  onImport,
}: WizardFooterProps) {
  return (
    <div className="p-6 border-t border-border/30 flex justify-between items-center shrink-0">
      <span className="text-sm text-muted-foreground">
        {selectedCount} character(s) selected
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isImporting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onImport}
          disabled={isImporting || selectedCount === 0}
        >
          {isImporting
            ? "Importing..."
            : `Import ${selectedCount} Character${
                selectedCount !== 1 ? "s" : ""
              }`}
        </Button>
      </div>
    </div>
  );
}
