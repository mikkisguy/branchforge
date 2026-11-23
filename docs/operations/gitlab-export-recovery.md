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
