/**
 * Labels module - Barrel re-export
 *
 * Backward-compatible re-exports of all labels service symbols.
 * Consumers importing from "../services/labels.service.js" continue
 * to work without modification.
 */

// Types
export type { PublicLabel } from "./types.js";
export type {
  QueryContext,
  SyncLabelsResult,
  SyncLabelsOptions,
  LabelLineWithSpeaker,
  LabelCharacterWithInfo,
  LabelDetail,
  LabelForPublic,
  ListLabelsFilters,
} from "./types.js";
export { UUID_REGEX, MAX_LABEL_ATTEMPTS } from "./types.js";

// Validation
export {
  validateRPYContent,
  validateFileType,
  isValidLabelStatus,
} from "./validation.js";

// Sync State (GitLab-specific)
export {
  checkInProgressSync,
  checkContentAlreadySynced,
  createSyncState,
  startSyncHeartbeat,
  getDbLabelCount,
  completeSyncState,
} from "./sync-state.js";

// Sync
export {
  syncLabelsFromFile,
  syncLabelsFromGitLabFile,
  resyncLabelPositions,
} from "./sync.js";

// Queries
export {
  listLabels,
  getLabel,
  authorizeLabelAccess,
  getLabelCharacters,
  mapToPublicLabel,
} from "./queries.js";

// CRUD
export {
  createLabel,
  updateLabel,
  deleteLabel,
  cleanupLabelWordCounts,
} from "./crud.js";

// Reconstruction
export { reconstructFileForLabel } from "./reconstruct.js";

// Dialogue
export { updateLabelDialogue } from "./dialogue.js";
export type { UpdateLabelDialogueResult } from "./dialogue.js";

// Incoming Jumps
export { updateIncomingJumpsForLabels } from "./incoming-jumps.js";

// Jump Targets
export { resolveJumpTargets } from "./jump-targets.js";
