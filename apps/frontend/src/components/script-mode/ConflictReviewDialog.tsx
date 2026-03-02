/**
 * Conflict Review Dialog
 *
 * Dialog for manually resolving conflicts between BranchForge and GitLab versions.
 * Shows side-by-side comparison and allows user to choose which version to keep.
 */

import { useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gitlabApi, type ConflictDetectionResult, type ConflictInfo } from '@/lib/api/gitlab';
import { useToast } from '@/contexts/ToastContext';

// ============================================================================
// Types
// ============================================================================

interface ConflictResolution {
  label: string;
  choice: 'local' | 'remote' | 'skip';
}

interface ConflictReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  branch: string;
  onApplyResolutions?: (resolutions: ConflictResolution[]) => void;
}

// ============================================================================
// Mock Data for UI Development
// ============================================================================

const MOCK_CONFLICTS: ConflictInfo[] = [
  {
    label: 'start',
    type: 'dialogue_mismatch',
    localContent: [
      { speaker: null, text: 'The story begins in a small village...' },
      { speaker: 'eileen', text: 'Hello there, traveler!' },
    ],
    remoteContent: [
      { speaker: null, text: 'The story begins in a bustling city...' },
      { speaker: 'eileen', text: 'Greetings, weary traveler!' },
    ],
  },
  {
    label: 'ending_a',
    type: 'dialogue_mismatch',
    localContent: [
      { speaker: 'protagonist', text: 'I choose to follow my heart.' },
      { speaker: null, text: 'She walked into the sunset, hopeful.' },
    ],
    remoteContent: [
      { speaker: 'protagonist', text: 'I choose to follow my dreams.' },
      { speaker: null, text: 'She walked into the sunset, determined.' },
    ],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function formatContent(content: any[]): string {
  if (!content || content.length === 0) return 'Empty';
  return content
    .map((line) => {
      if (line.speaker) {
        return `${line.speaker}: "${line.text}"`;
      }
      return `"${line.text}"`;
    })
    .join('\n');
}

function getConflictTypeLabel(type: ConflictInfo['type']): string {
  switch (type) {
    case 'dialogue_mismatch':
      return 'Dialogue differs between versions';
    case 'new_remote_label':
      return 'New label in GitLab';
    case 'deleted_remote_label':
      return 'Label deleted in GitLab';
    case 'choice_mismatch':
      return 'Branching choices differ';
    default:
      return 'Unknown conflict type';
  }
}

// ============================================================================
// Component
// ============================================================================

export function ConflictReviewDialog({
  open,
  onOpenChange,
  projectId,
  branch,
  onApplyResolutions,
}: ConflictReviewDialogProps) {
  const { success, error } = useToast();

  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<string, 'local' | 'remote' | 'skip'>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>(MOCK_CONFLICTS);

  const currentConflict = conflicts[currentIndex];
  const currentResolution = resolutions.get(currentConflict?.label || '');

  /**
   * Set resolution for current conflict
   */
  const setResolution = useCallback((choice: 'local' | 'remote' | 'skip') => {
    if (!currentConflict) return;
    setResolutions(prev => new Map(prev).set(currentConflict.label, choice));
  }, [currentConflict]);

  /**
   * Navigate to previous conflict
   */
  const goPrevious = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  /**
   * Navigate to next conflict
   */
  const goNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(conflicts.length - 1, prev + 1));
  }, [conflicts.length]);

  /**
   * Apply all resolutions
   */
  const handleApply = useCallback(async () => {
    setIsLoading(true);

    try {
      // Convert resolutions to array
      const resolutionArray: ConflictResolution[] = Array.from(resolutions.entries()).map(([label, choice]) => ({
        label,
        choice,
      }));

      // Call callback if provided
      onApplyResolutions?.(resolutionArray);

      success(`Applied ${resolutionArray.length} conflict resolution(s)`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply resolutions';
      error(message);
    } finally {
      setIsLoading(false);
    }
  }, [resolutions, onApplyResolutions, onOpenChange, success, error]);

  /**
   * Reset state when dialog opens
   */
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen && open !== newOpen) {
      // Dialog opening - reset state
      setCurrentIndex(0);
      setResolutions(new Map());
    }
    onOpenChange(newOpen);
  }, [open, onOpenChange]);

  // Calculate progress
  const resolvedCount = resolutions.size;
  const totalCount = conflicts.length;
  const hasUnresolved = totalCount > resolvedCount;

  // ============================================================================
  // Render
  // ============================================================================

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border/30 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium">Review Sync Conflicts</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {resolvedCount} of {totalCount} conflicts resolved
            </p>
          </div>
          <button
            onClick={() => handleOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentConflict ? (
            <div className="space-y-6">
              {/* Conflict Info */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Label: {currentConflict.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getConflictTypeLabel(currentConflict.type)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <button
                    onClick={goPrevious}
                    disabled={currentIndex === 0 || isLoading}
                    className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-50"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span>{currentIndex + 1} / {totalCount}</span>
                  <button
                    onClick={goNext}
                    disabled={currentIndex === totalCount - 1 || isLoading}
                    className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-50"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Resolution Status */}
              {currentResolution && (
                <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 rounded-md text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Will use: {currentResolution === 'local' ? 'BranchForge' : currentResolution === 'remote' ? 'GitLab' : 'Skipped'} version
                  </span>
                </div>
              )}

              {/* Side-by-side Comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* BranchForge Version */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">BranchForge Version</h4>
                    <Button
                      size="sm"
                      variant={currentResolution === 'local' ? 'default' : 'outline'}
                      onClick={() => setResolution('local')}
                      disabled={isLoading}
                    >
                      {currentResolution === 'local' ? 'Selected' : 'Use This'}
                    </Button>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-md border border-border/30">
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {formatContent(currentConflict.localContent)}
                    </pre>
                  </div>
                </div>

                {/* GitLab Version */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">GitLab Version</h4>
                    <Button
                      size="sm"
                      variant={currentResolution === 'remote' ? 'default' : 'outline'}
                      onClick={() => setResolution('remote')}
                      disabled={isLoading}
                    >
                      {currentResolution === 'remote' ? 'Selected' : 'Use This'}
                    </Button>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-md border border-border/30">
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {formatContent(currentConflict.remoteContent)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Skip Option */}
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResolution('skip')}
                  disabled={isLoading}
                  className={currentResolution === 'skip' ? 'text-muted-foreground' : ''}
                >
                  Skip this conflict
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-4" />
              <h3 className="text-lg font-medium">All Conflicts Resolved</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You can now apply your resolutions to complete the sync.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/30 flex justify-between">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            {hasUnresolved && (
              <Button variant="ghost" disabled={isLoading}>
                {hasUnresolved && 'Resolve all conflicts first'}
              </Button>
            )}
            <Button
              onClick={handleApply}
              disabled={isLoading || hasUnresolved}
            >
              {isLoading ? (
                <>Applying...</>
              ) : (
                <>Apply Resolutions</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
