/**
 * Labels Service
 *
 * Handles label management operations including listing labels for a project,
 * getting detailed label information with lines and characters, and
 * authorization checks for label access.
 *
 * Also includes label file sync operations (consolidated from label-sync.service.ts
 * and gitlab-file-sync.service.ts).
 *
 * NOTE: This file is now a backward-compatible re-export barrel.
 * The implementation has been split into focused modules under `./labels/`.
 */

export type { PublicLabel } from "./labels/index.js";
export type {
  QueryContext,
  SyncLabelsResult,
  SyncLabelsOptions,
  LabelLineWithSpeaker,
  LabelCharacterWithInfo,
  LabelDetail,
  LabelForPublic,
  ListLabelsFilters,
} from "./labels/index.js";
export { UUID_REGEX, MAX_LABEL_ATTEMPTS } from "./labels/index.js";

export {
  validateRPYContent,
  validateFileType,
  isValidLabelStatus,
} from "./labels/index.js";

export {
  checkInProgressSync,
  checkContentAlreadySynced,
  createSyncState,
  startSyncHeartbeat,
  getDbLabelCount,
  completeSyncState,
} from "./labels/index.js";

export {
  syncLabelsFromFile,
  syncLabelsFromGitLabFile,
  resyncLabelPositions,
} from "./labels/index.js";

export {
  listLabels,
  getLabel,
  authorizeLabelAccess,
  getLabelCharacters,
  mapToPublicLabel,
} from "./labels/index.js";

export {
  createLabel,
  updateLabel,
  deleteLabel,
  cleanupLabelWordCounts,
} from "./labels/index.js";

export { reconstructFileForLabel } from "./labels/index.js";

export { updateLabelDialogue } from "./labels/index.js";
export type { UpdateLabelDialogueResult } from "./labels/index.js";

export { updateIncomingJumpsForLabels } from "./labels/index.js";

export { resolveJumpTargets } from "./labels/index.js";
