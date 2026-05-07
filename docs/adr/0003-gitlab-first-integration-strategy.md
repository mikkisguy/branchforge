# ADR-0003: GitLab-first Integration Strategy

**Status:** Accepted

**Date:** 2025-05-07

## Context

BranchForge is a visual novel IDE that integrates with version control for bi-directional sync between the database and Ren'Py (.rpy) files. The primary use case is:

- Author stores game scripts in a GitLab repository
- BranchForge imports dialogue, parses Ren'Py labels, and provides enhanced editing tools
- Author exports changes back to GitLab as commits

Key question: Should the integration be GitLab-specific, or use a generic Git adapter that supports multiple providers (GitHub, GitLab, Bitbucket, self-hosted)?

## Decision

Implement **GitLab-first integration** using GitLab API directly, with project files abstraction layer for future extensibility.

### Implementation

```typescript
// GitLab-specific service using GitLab API
export class GitLabService {
  async getRepository projectId: string): Promise<GitlabRepository> { }
  async getFileContent(projectId: string, filePath: string): Promise<string> { }
  async createCommit(projectId: string, branch: string, files: FileChange[]): Promise<void> { }
}

// Project files abstraction (supports multiple sources)
export const projectFiles = pgTable("project_files", {
  source: fileSourceEnum("source").notNull(), // "GITLAB" or "ZIP"
  path: text("path").notNull(),
  originalFileName: text("original_file_name").notNull(),
  // ...
});
```

### Bi-directional sync flow

**Import (GitLab → Database):**

1. User connects GitLab account (stores encrypted PAT)
2. User selects repository and branch
3. Fetch .rpy files from GitLab API
4. Parse Ren'Py labels and dialogue lines
5. Store in database (labels, label_lines tables)
6. Track sync state (hash, status, last commit SHA)

**Export (Database → GitLab):**

1. User edits labels in BranchForge UI
2. Changes validated and saved to database
3. User clicks "Export to GitLab"
4. Generate .rpy files from database
5. Create commit via GitLab API
6. Update sync state (mark as synced, store commit SHA)

### Conflict detection

- Track `content_hash` (SHA-256) and `last_synced_hash`
- On import: Compare remote hash with stored hash
- Status values: `SYNCED`, `MODIFIED_LOCAL`, `CONFLICT`
- Conflict UI shows both versions and asks user to resolve

## Consequences

### Positive

- **Immediate value** — Integration works for the author's existing GitLab repositories
- **Full GitLab feature access** — Branches, commits, file operations, PAT auth
- **Simpler implementation** — No abstraction layer complexity upfront
- **ZIP import support** — Project files abstraction allows ZIP source alongside GitLab

### Negative

- **Vendor lock-in** — GitHub users cannot use BranchForge without GitLab account
- **Narrower audience** — Visual novel authors using GitHub are excluded
- **GitLab-specific quirks** — API behavior may differ from other Git providers

### Why not generic Git adapter?

| Generic adapter drawback          | GitLab-first advantage         |
| --------------------------------- | ------------------------------ |
| Complex abstraction layer         | Direct API usage, simpler code |
| Least common denominator features | Full GitLab API capabilities   |
| More testing surface area         | Single provider to test        |
| Async conversion complexity       | Implement only what's needed   |

A generic adapter would require:

- Abstraction over Git API differences (branches, commits, file operations)
- Provider configuration (GitHub vs GitLab vs self-hosted)
- OAuth flows for multiple providers
- Testing matrix across providers

For a product with 0 users, this is premature generalization.

### Future considerations

If GitHub support becomes a requirement:

1. **Create `GitProvider` interface** — Extract current GitLab service methods
2. **Implement `GitHubService`** — Same interface, GitHub API calls
3. **User provider selection** — Add `git_provider` column to project files table
4. **Migrate existing users** — GitLab remains default, GitHub is opt-in

The `project_files.source` enum already supports this pattern:

```typescript
export const fileSourceEnum = pgEnum("file_source", ["GITLAB", "ZIP"]);
// Future: ["GITLAB", "GITHUB", "BITBUCKET", "GIT", "ZIP"]
```

## References

- GitLab service: `apps/backend/src/services/gitlab.service.ts`
- File sync service: `apps/backend/src/services/gitlab-file-sync.service.ts`
- Schema: `apps/backend/src/db/schema/tables/gitlab-integrations.ts`
- Project files: `apps/backend/src/db/schema/tables/project-files.ts`
