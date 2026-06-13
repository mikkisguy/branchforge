/**
 * ExportHistoryDialog
 *
 * Dialog showing export history for a project with
 * re-download capability.
 */

import { useState } from "react";
import { Download, Loader2, FileArchive, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useExports } from "@/hooks/useExports";
import { useToast } from "@/contexts/ToastContext";
import { formatDate, formatFileSize } from "@/lib/utils";

interface ExportHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function ExportHistoryDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: ExportHistoryDialogProps) {
  const { exports, isLoadingExports, downloadExport, isDownloading } =
    useExports(open ? projectId : "");
  const { success: toastSuccess, error: toastError } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (exportId: string) => {
    setDownloadingId(exportId);
    try {
      await downloadExport(exportId);
      toastSuccess("Download started");
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Download failed",
        "Export Error"
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export History — {projectName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isLoadingExports ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : exports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileArchive className="size-8 mb-2" />
              <p className="text-sm">No exports yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {exports.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {exp.fileName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Clock className="size-3" />
                      <span>{formatDate(exp.createdAt)}</span>
                      {exp.fileSize != null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatFileSize(exp.fileSize)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={downloadingId === exp.id || isDownloading}
                    onClick={() => handleDownload(exp.id)}
                    aria-label={`Download ${exp.fileName}`}
                  >
                    {downloadingId === exp.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
