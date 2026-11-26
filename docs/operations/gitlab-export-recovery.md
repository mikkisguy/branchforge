# Recover an unresolved GitLab export

Retry the push on its original repository and branch first. BranchForge verifies the saved batch using a commit receipt or a unique commit marker. On a long, stable branch history, a retry continues the search from the last verified point. A change to the branch head or receipt restarts the search.

## Inspect the attempt

Run these commands from the repository root with the intended BranchForge database configured as `DATABASE_URL`. The commands require database operator access.

```sh
pnpm --filter @branchforge/backend exec tsx scripts/gitlab-export-recovery.ts inspect PROJECT_UUID
```

Inspection shows the repository, branch, receipt, commit marker, affected paths, and current legacy markers. It omits exported file bodies and prints a fingerprint of the inspected state.

## Clear a confirmed unapplied attempt

Use this procedure only with authoritative evidence that the original write never took effect and cannot still be applied. For example, GitLab can confirm a terminal rejection, or deployment logs can prove the request was never submitted. A timeout, missing commit marker, or unchanged branch does not establish that the request ended.

1. Quiesce all BranchForge instances or workers that could still send the request and keep them quiesced until the operation completes. Quiescing BranchForge alone does not establish that GitLab finished any request it already received.
2. Verify the outcome using the target repositories and branches in the inspection output. Confirm that your evidence covers every displayed attempt and legacy marker. Record the evidence in an incident ticket.
3. Inspect again. Use the latest fingerprint and the evidence reference below.

```sh
pnpm --filter @branchforge/backend exec tsx scripts/gitlab-export-recovery.ts \
  confirm-unapplied PROJECT_UUID FINGERPRINT \
  --write-confirmed-unapplied-and-drained INCIDENT_REFERENCE
```

The command stops if the inspected state changed or contains a commit receipt. It clears only unresolved-attempt data, including legacy attempt markers when present. Local content, pending file operations, tombstones and remote baselines are preserved. Retain the command output with the evidence.

## Preserve work when the outcome cannot be proved

Retain the unresolved state. Export a ZIP of the current BranchForge project and record its pending file operations. Inspect the current GitLab branch separately. For a legacy attempt that applied or for an outcome you cannot verify, use the two copies and the pending-operation list to reconcile changes in a separate project or recovery branch. Keep the original project and GitLab branch until the recovered project has been checked. Legacy rows predate the full batch snapshot and cannot establish which local versions GitLab received.

## Exact export review and new branches

Opening or refreshing the export dialog reads a local repeatable-read snapshot and an immutable GitLab revision. It does not promote defaults, repair source declarations, change pending operations or export history, reconcile attempts, or create branches. The review includes generated-file cleanup and source rewrites. Confirmation requires the content-bound review token and recomputes that plan before any writes. A stale review must be refreshed and explicitly confirmed again. Unrelated branch-head movement is permitted when all consulted file dependencies remain unchanged.

An unresolved attempt prevents a new review. Use **Recover previous export** in the dialog to verify and finalize the saved attempt, then review the current changes. This explicit action never submits a new batch. If verification remains uncertain, preserve the attempt and use the operator procedure above; do not clear it solely because the branch looks unchanged.

Confirmation rechecks local inputs while holding project and source-file locks. Managed character, variable, and stat writes share the project lock; recovery and attempt admission commit together. Later edits remain pending. A no-op confirmation rereads the reviewed remote file hashes and revisions before advancing local baselines. Recovery reports whether it actually discarded or finalized an attempt, and unrelated review errors offer refresh without claiming recovery.

For updates, moves, and deletions, BranchForge requires each initially existing source file's last modifying commit and sends `last_commit_id` in the atomic commit actions. GitLab documents these guards in the [Commits API](https://docs.gitlab.com/api/commits/#create-a-commit-with-multiple-files-and-actions). Only intermediate paths produced inside the same batch are exempt. Creates and move destinations rely on GitLab rejecting an occupied destination. A changed affected file revision invalidates review even when its content is identical.

For a proposed new branch, confirmation uses the [Branches API](https://docs.gitlab.com/api/branches/#create-repository-branch) to create the selected name from the reviewed immutable base SHA before submitting file actions. An already existing name rejects the push; `start_sha` on a commit alone does not protect branch-name absence. Branch creation occurs only after an export attempt has been saved and claimed. A timeout, server failure, or unverified branch-create receipt keeps that attempt unresolved and never proceeds to a file commit. If branch creation succeeds but the later commit fails, the new branch may remain at its base. BranchForge never automatically deletes it. Inspect and retain this branch during recovery, and refresh the review after resolving the attempt.
