import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useLocalStorage,
  useLocalStorageBoolean,
  useLocalStorageNumber,
} from "@/hooks/useLocalStorage";
import type { PublicLabel, LabelDetail } from "@branchforge/shared";
import type { UpdateLabelInput } from "@/lib/api/labels";

// ── Constants ──────────────────────────────────────────────────────────

const WRITE_FONT_SIZE_OPTIONS = [
  { label: "Small", value: 14 },
  { label: "Medium", value: 16 },
  { label: "Large", value: 18 },
  { label: "Extra Large", value: 20 },
  { label: "Huge", value: 22 },
] as const;

const FONT_FAMILY_OPTIONS = [
  { label: "Default", value: "default" },
  { label: "Fira Code", value: "fira-code" },
  { label: "Noto Serif", value: "noto-serif" },
] as const;

export interface PairGroupSummary {
  id: string;
  characterAName: string;
  characterBName: string;
  duoEndingLabel: string;
}

export function useWriteModeView(
  isMobile: boolean,
  setIsLeftSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>,
  setIsRightSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>,
  activeLabel: LabelDetail | undefined,
  onUpdateLabel: (
    labelId: string,
    data: UpdateLabelInput
  ) => Promise<PublicLabel>,
  onDeleteLabel: (labelId: string) => Promise<void>,
  pairGroups: {
    id: string;
    characterAName: string;
    characterBName: string;
    duoEndingLabel: string | null;
  }[]
) {
  // ── Editor settings ──────────────────────────────────────────────────
  const [writeFontSize, setWriteFontSize] = useLocalStorageNumber(
    "write:font-size",
    16,
    { validate: (v) => WRITE_FONT_SIZE_OPTIONS.some((o) => o.value === v) }
  );
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--prose-editor-font-size",
      `${writeFontSize}px`
    );
  }, [writeFontSize]);

  const [writeFontFamily, setWriteFontFamily] = useLocalStorage<string>(
    "write:font-family",
    "default",
    { validate: (v) => FONT_FAMILY_OPTIONS.some((o) => o.value === v) }
  );
  useEffect(() => {
    const option =
      FONT_FAMILY_OPTIONS.find((o) => o.value === writeFontFamily) ??
      FONT_FAMILY_OPTIONS[0];
    const families: Record<string, string> = {
      default: "var(--font-sans)",
      "fira-code": "'Fira Code', monospace",
      "noto-serif": "'Noto Serif', serif",
    };
    document.documentElement.style.setProperty(
      "--prose-editor-font-family",
      families[option.value] ?? families.default
    );
  }, [writeFontFamily]);

  const [writeLineLayout, setWriteLineLayout] = useLocalStorage<string>(
    "write:line-layout",
    "inline",
    { validate: (v) => v === "inline" || v === "stacked" }
  );
  const [showBadges, setShowBadges] = useLocalStorageBoolean(
    "write:show-badges",
    true
  );

  // ── Dialog state ─────────────────────────────────────────────────────
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    label: PublicLabel | null;
  }>({ open: false, label: null });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    label: PublicLabel | null;
  }>({ open: false, label: null });
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(
    null
  );

  const handleEditLabel = useCallback((label: PublicLabel) => {
    setEditDialog({ open: true, label });
  }, []);

  const handleDeleteRequest = useCallback((label: PublicLabel) => {
    setDeleteConfirm({ open: true, label });
  }, []);

  const handleEditFromPanel = useCallback(() => {
    if (activeLabel) setEditDialog({ open: true, label: activeLabel });
  }, [activeLabel]);

  const handleEditSave = useCallback(
    async (data: {
      title?: string;
      labelName?: string;
      route?: string | null;
      status?: "DRAFT" | "REVIEW" | "FINAL";
      visibility?: "EXCLUSIVE" | "SHARED" | "DUO_PAIR";
      duoPairId?: string | null;
    }) => {
      if (editDialog.label) {
        await onUpdateLabel(
          editDialog.label.id,
          data as unknown as Record<string, unknown>
        );
        setEditDialog({ open: false, label: null });
      }
    },
    [editDialog.label, onUpdateLabel]
  );

  const handleDeleteConfirmAction = useCallback(async () => {
    if (deleteConfirm.label) {
      await onDeleteLabel(deleteConfirm.label.id);
      setDeleteConfirm({ open: false, label: null });
    }
  }, [deleteConfirm.label, onDeleteLabel]);

  // ── Sidebar callbacks ────────────────────────────────────────────────
  const handleOpenLeftSidebar = useCallback(() => {
    setIsLeftSidebarCollapsed(false);
    if (isMobile) setIsRightSidebarCollapsed(true);
  }, [isMobile, setIsLeftSidebarCollapsed, setIsRightSidebarCollapsed]);

  const handleToggleRightSidebar = useCallback(() => {
    setIsRightSidebarCollapsed((prev) => !prev);
    if (isMobile) setIsLeftSidebarCollapsed(true);
  }, [isMobile, setIsLeftSidebarCollapsed, setIsRightSidebarCollapsed]);

  // ── Derived ──────────────────────────────────────────────────────────
  const pairGroupSummaries = useMemo(
    () =>
      pairGroups.map((pg) => ({
        id: pg.id,
        characterAName: pg.characterAName,
        characterBName: pg.characterBName,
        duoEndingLabel: pg.duoEndingLabel ?? "",
      })),
    [pairGroups]
  );

  return {
    writeFontSize,
    setWriteFontSize,
    writeFontFamily,
    setWriteFontFamily,
    writeLineLayout,
    setWriteLineLayout,
    showBadges,
    setShowBadges,
    editDialog,
    setEditDialog,
    deleteConfirm,
    setDeleteConfirm,
    editingCharacterId,
    setEditingCharacterId,
    handleEditLabel,
    handleDeleteRequest,
    handleEditFromPanel,
    handleEditSave,
    handleDeleteConfirmAction,
    handleOpenLeftSidebar,
    handleToggleRightSidebar,
    pairGroupSummaries,
    WRITE_FONT_SIZE_OPTIONS,
    FONT_FAMILY_OPTIONS,
  };
}
