/**
 * Centralized user-facing copy for BranchForge.
 *
 * All UI strings (labels, tooltips, empty states, error messages) should live
 * here, keyed by feature domain. Components import from "@/copy" — e.g.
 * `import { WRITE_MODE_COPY } from "@/copy"`.
 *
 * Keeping copy centralized means:
 * - The docs site can quote the same strings, so they never drift
 * - Future i18n can swap this layer without touching components
 * - Consistent voice and wording across the app
 *
 * TODO: migrate consumers. As of this commit nothing imports from "@/copy" —
 * components still hardcode their strings (e.g. VariableEditDialog.tsx uses
 * "Save"/"Cancel"/"Delete"). Until the migration is done, these constants
 * are scaffolding and will silently drift from what users see. Track the
 * remaining work and wire up components feature-by-feature.
 */
export { COMMON_COPY } from "./common";
export { PROJECTS_COPY } from "./projects";
export { WRITE_MODE_COPY } from "./write-mode";
