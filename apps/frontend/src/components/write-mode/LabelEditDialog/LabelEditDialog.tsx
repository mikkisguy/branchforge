/**
 * Label Edit Dialog
 *
 * Modal for editing label metadata, routing, and duo pair configuration.
 */

import { useEffect, useReducer, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { INITIAL_FORM_STATE, formReducer } from "./LabelEditDialogReducer.js";
import { LabelEditDialogFields } from "./LabelEditDialogFields.js";
import { LabelEditDialogFooter } from "./LabelEditDialogFooter.js";

export interface LabelEditDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Current title of the label */
  currentTitle: string;
  /** Current label name (RPY identifier, null for UI-created labels) */
  currentLabelName: string | null;
  /** Current route key (null = shared/no route) */
  currentRoute: string | null;
  /** Current status */
  currentStatus: "DRAFT" | "REVIEW" | "FINAL" | null;
  /** Current visibility */
  currentVisibility: "EXCLUSIVE" | "SHARED" | "DUO_PAIR" | null;
  /** Available route configs from the project */
  routeConfigs: Array<{ id: string; routeKey: string; routeName: string }>;
  /** Available pair groups for duo ending selection */
  pairGroups: Array<{
    id: string;
    characterAName: string;
    characterBName: string;
    duoEndingLabel: string;
  }>;
  /** Current duo pair group ID (null if none) */
  currentDuoPairId: string | null;
  /** Whether duo ending tracking is enabled for this project */
  duoEndingEnabled: boolean;
  /** Called when save is clicked */
  onSave: (data: {
    title?: string;
    labelName?: string;
    route?: string | null;
    status?: "DRAFT" | "REVIEW" | "FINAL";
    visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
    duoPairId?: string | null;
  }) => Promise<void>;
  /** Whether save is in progress */
  isSaving: boolean;
}

export function LabelEditDialog({
  open,
  onOpenChange,
  currentTitle,
  currentLabelName,
  currentRoute,
  currentStatus,
  currentVisibility,
  routeConfigs,
  pairGroups,
  currentDuoPairId,
  duoEndingEnabled,
  onSave,
  isSaving,
}: LabelEditDialogProps) {
  const [form, dispatch] = useReducer(formReducer, INITIAL_FORM_STATE);

  const initializedForOpenRef = useRef(false);

  // Initialize form state when dialog opens
  useEffect(() => {
    if (open && !initializedForOpenRef.current) {
      initializedForOpenRef.current = true;
      dispatch({
        type: "RESET",
        title: currentTitle,
        labelName: currentLabelName ?? "",
        route: currentRoute ?? "",
        status: currentStatus ?? "DRAFT",
        visibility: currentVisibility ?? "EXCLUSIVE",
        duoPairId: currentDuoPairId ?? "",
      });
    }
  }, [
    open,
    currentTitle,
    currentLabelName,
    currentRoute,
    currentStatus,
    currentVisibility,
    currentDuoPairId,
  ]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      dispatch({ type: "SET_TITLE_ERROR", value: "Title is required" });
      return;
    }

    if (form.title.length > 255) {
      dispatch({
        type: "SET_TITLE_ERROR",
        value: "Title must be at most 255 characters",
      });
      return;
    }

    dispatch({ type: "SET_TITLE_ERROR", value: "" });

    const trimmedLabelName = form.labelName.trim();

    if (!trimmedLabelName && currentLabelName !== null) {
      dispatch({
        type: "SET_LABEL_NAME_ERROR",
        value: "Label name cannot be empty",
      });
      return;
    }

    if (
      trimmedLabelName &&
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedLabelName)
    ) {
      dispatch({
        type: "SET_LABEL_NAME_ERROR",
        value:
          "Label name must start with a letter or underscore and contain only letters, numbers, and underscores",
      });
      return;
    }

    dispatch({ type: "SET_LABEL_NAME_ERROR", value: "" });

    const changes: {
      title?: string;
      labelName?: string;
      route?: string | null;
      status?: "DRAFT" | "REVIEW" | "FINAL";
      visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
      duoPairId?: string | null;
    } = {};

    if (form.title.trim() !== currentTitle) {
      changes.title = form.title.trim();
    }

    if (trimmedLabelName && trimmedLabelName !== (currentLabelName ?? "")) {
      changes.labelName = trimmedLabelName;
    }

    const normalizedRoute = form.route || null;
    if (normalizedRoute !== currentRoute) {
      changes.route = normalizedRoute;
    }

    if (form.status !== (currentStatus ?? "DRAFT")) {
      changes.status = form.status;
    }

    if (form.visibility !== (currentVisibility ?? "EXCLUSIVE")) {
      changes.visibility = form.visibility;
    }

    const normalizedDuoPairId = form.duoPairId || null;
    if (normalizedDuoPairId !== currentDuoPairId) {
      changes.duoPairId = normalizedDuoPairId;
    }

    if (Object.keys(changes).length === 0) {
      initializedForOpenRef.current = false;
      onOpenChange(false);
      return;
    }

    await onSave(changes);
    initializedForOpenRef.current = false;
  };

  const handleCancel = () => {
    initializedForOpenRef.current = false;
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) initializedForOpenRef.current = false;
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="w-[560px] max-w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Label</DialogTitle>
          <DialogDescription>
            Update the label metadata and routing configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <LabelEditDialogFields
            form={form}
            dispatch={dispatch}
            isSaving={isSaving}
            currentLabelName={currentLabelName}
            routeConfigs={routeConfigs}
            pairGroups={pairGroups}
            duoEndingEnabled={duoEndingEnabled}
          />

          <LabelEditDialogFooter
            isSaving={isSaving}
            onCancel={handleCancel}
            onSave={handleSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
