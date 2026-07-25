import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NoProjectSelectedProps {
  onOpenSettings?: () => void;
}

export function NoProjectSelected({ onOpenSettings }: NoProjectSelectedProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="size-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
        <FileText className="size-10 text-muted-foreground/60" />
      </div>
      <p className="text-foreground font-medium">No project selected</p>
      <p className="text-sm text-muted-foreground/70 mt-1 text-center max-w-md px-4">
        To start writing, import a project in Settings.
      </p>
      {onOpenSettings && (
        <Button type="button" className="mt-4" onClick={onOpenSettings}>
          Open Settings
        </Button>
      )}
    </div>
  );
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- related variants co-located
export function LoadingLabels() {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="relative">
        <div className="size-16 rounded-full bg-[var(--theme-color)]/10 flex items-center justify-center">
          <Loader2 className="size-8 text-[var(--theme-color)] animate-spin" />
        </div>
        <div className="absolute inset-0 size-16 rounded-full bg-[var(--theme-color)]/5 animate-ping" />
      </div>
      <p className="text-muted-foreground mt-4">Loading labels…</p>
    </div>
  );
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- related variants co-located
export function NoLabels() {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="size-20 rounded-full bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
        <FileText className="size-10 text-muted-foreground/60" />
      </div>
      <p className="text-foreground font-medium">No labels in this project</p>
      <p className="text-sm text-muted-foreground/70 mt-1 text-center max-w-md px-4">
        Import content or create labels to start writing.
      </p>
    </div>
  );
}
