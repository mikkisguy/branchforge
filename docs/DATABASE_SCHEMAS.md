## BranchForge Database Schemas

### Enums

| Enum                        | Values                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_role`                 | `OWNER`, `READER`, `TESTER`                                        | Used in TWO contexts: (1) `users.role` for system-level admin access (OWNER only), (2) `project_users.role` for project-level access control (READER/TESTER only). Project ownership is tracked by `projects.user_id`, not by `project_users.role = OWNER`. The `getProjectRole()` function returns "OWNER" as a computed value when user matches `projects.user_id`. |
| `project_visibility`        | `PUBLIC`, `PRIVATE`, `TEAM`                                        | Project visibility (not to be confused with roles)                                                                                                                                                                                                                                                                                                                    |
| `label_status`              | `DRAFT`, `REVIEW`, `FINAL`                                         | Label workflow status                                                                                                                                                                                                                                                                                                                                                 |
| `content_type`              | `NARRATION`, `DIALOGUE`, `CHOICE`, `MENU`, `JUMP`                  | For line-level export logic                                                                                                                                                                                                                                                                                                                                           |
| `visual_type`               | `GENERATED`, `BLACK`, `CUSTOM`                                     | Image handling per line                                                                                                                                                                                                                                                                                                                                               |
| `element_type`              | `LOCATION`, `ITEM`, `CONCEPT`, `EVENT`                             | World bible                                                                                                                                                                                                                                                                                                                                                           |
| `suggestion_type`           | `CONSISTENCY`, `FLAG_SUGGEST`, `METER_SUGGEST`, `DIALOGUE_VARIANT` | AI suggestion types                                                                                                                                                                                                                                                                                                                                                   |
| `suggestion_status`         | `PENDING`, `ACCEPTED`, `REJECTED`                                  | AI suggestion workflow status                                                                                                                                                                                                                                                                                                                                         |
| `character_role`            | `PRIMARY`, `SECONDARY`, `BACKGROUND`, `MENTIONED`                  | Character role in label                                                                                                                                                                                                                                                                                                                                               |
| `renpy_definition_category` | `CHARACTER`, `TRANSFORM`, `IMAGE`, `INIT`                          | Ren'Py definition types                                                                                                                                                                                                                                                                                                                                               |
| `label_visibility`          | `EXCLUSIVE`, `SHARED`, `DUO_PAIR`                                  | Label visibility across routes                                                                                                                                                                                                                                                                                                                                        |
| `sync_operation`            | `EXPORT`, `IMPORT`                                                 | GitLab sync operation type                                                                                                                                                                                                                                                                                                                                            |
| `sync_operation_status`     | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`                    | GitLab sync operation status                                                                                                                                                                                                                                                                                                                                          |
| `sync_status`               | `SYNCED`, `MODIFIED_LOCAL`, `CONFLICT`                             | File sync state (labels and file sync state)                                                                                                                                                                                                                                                                                                                          |
| `project_file_type`         | `STORY`, `SETTINGS`                                                | Project file type (unified for all sources)                                                                                                                                                                                                                                                                                                                           |
| `file_source`               | `GITLAB`, `ZIP`                                                    | File source type (where files come from)                                                                                                                                                                                                                                                                                                                              |

---

### 1. Users

| Column          | Type                         | Notes                                                                                                     |
| --------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`            | uuid PK                      |                                                                                                           |
| `email`         | text, unique, not null       |                                                                                                           |
| `password_hash` | text, not null               |                                                                                                           |
| `role`          | `user_role`, default `OWNER` | System-level admin role (OWNER only for admin access, distinct from project-level roles in project_users) |
| `deleted_at`    | timestamp, nullable          | Soft delete                                                                                               |
| `created_at`    | timestamp, default now       |                                                                                                           |
| `updated_at`    | timestamp, default now       |                                                                                                           |

---

### 2. Sessions

Persistent session storage for user authentication (database-backed).

| Column       | Type                | Notes                            |
| ------------ | ------------------- | -------------------------------- |
| `id`         | text PK             | Session ID (cookie value)        |
| `user_id`    | uuid FK → users     | Owner                            |
| `data`       | jsonb, not null     | Session data (user object, etc.) |
| `expires_at` | timestamp, not null | Session expiration               |
| `created_at` | timestamp           |                                  |
| `updated_at` | timestamp           |                                  |

---

### 3. User Settings

Per-user preferences and settings.

| Column       | Type                  | Notes               |
| ------------ | --------------------- | ------------------- |
| `id`         | uuid PK               |                     |
| `user_id`    | uuid FK → users       |                     |
| `avatar_url` | text                  | Avatar image URL    |
| `username`   | text                  | Display username    |
| `language`   | text, default 'en'    | UI language         |
| `theme`      | text, default 'light' | UI theme preference |
| `created_at` | timestamp             |                     |
| `updated_at` | timestamp             |                     |

---

### 4. Admin Settings

Global application settings as key-value pairs.

| Column        | Type                   | Notes               |
| ------------- | ---------------------- | ------------------- |
| `id`          | uuid PK                |                     |
| `key`         | text, unique, not null | Setting key         |
| `value`       | jsonb, not null        | Setting value       |
| `description` | text                   | Setting description |
| `updated_at`  | timestamp              |                     |
| `updated_by`  | uuid FK → users        | Last modified by    |

---

### 5. Projects

| Column            | Type                                    | Notes                 |
| ----------------- | --------------------------------------- | --------------------- |
| `id`              | uuid PK                                 |                       |
| `user_id`         | uuid FK → users                         | Owner                 |
| `name`            | text, not null                          |                       |
| `description`     | text                                    |                       |
| `max_meter_delta` | integer, default 10                     | For budget calculator |
| `visibility`      | `project_visibility`, default `PRIVATE` | Who can access        |
| `created_at`      | timestamp                               |                       |
| `updated_at`      | timestamp                               |                       |

---

### 6. Project Users

Beta reader access control.

| Column       | Type                  | Notes                                                                                 |
| ------------ | --------------------- | ------------------------------------------------------------------------------------- |
| `project_id` | uuid FK → projects    |                                                                                       |
| `user_id`    | uuid FK → users       |                                                                                       |
| `role`       | `user_role`, not null | `READER` or `TESTER` (not OWNER - project ownership is tracked by `projects.user_id`) |
| `added_at`   | timestamp             |                                                                                       |

PK: `(project_id, user_id)`

---

### 7. Project Settings

Per-project configuration for character import and other project-specific settings.

| Column                    | Type                   | Notes                                 |
| ------------------------- | ---------------------- | ------------------------------------- |
| `project_id`              | uuid PK, FK → projects | One-to-one with projects              |
| `excluded_character_tags` | jsonb                  | Tags to exclude from character import |
| `auto_link_speakers`      | boolean, default true  | Auto-link speakers to characters      |
| `updated_at`              | timestamp, default now |                                       |

---

### 8. Visual Systems

Pattern configuration per project.

| Column                 | Type                       | Notes                                                           |
| ---------------------- | -------------------------- | --------------------------------------------------------------- |
| `id`                   | uuid PK                    |                                                                 |
| `project_id`           | uuid FK → projects, unique | One per project                                                 |
| `naming_template`      | text                       | Template pattern: `{label}_{counter}_{slug}`                    |
| `group_prefixes`       | jsonb                      | `{ "act": { "I": "ai" }, "chapter": { "1": "ch1" } }`           |
| `default_group_type`   | text                       | `"act"`, `"chapter"`, etc. or null                              |
| `label_padding`        | integer                    | 1 or 2 digits                                                   |
| `counter_padding`      | integer                    | 1 or 2 digits                                                   |
| `jump_prefix_shared`   | text                       | e.g., `""` or `"shared"`                                        |
| `placeholder_base_url` | text, nullable             | Where to look for {pattern}.png or serve generated placeholders |
| `created_at`           | timestamp                  |                                                                 |
| `updated_at`           | timestamp                  |                                                                 |

---

### 9. Route Configurations

User-defined routes per project. Replaces hardcoded route enums.

| Column        | Type                   | Notes                                      |
| ------------- | ---------------------- | ------------------------------------------ |
| `id`          | uuid PK                |                                            |
| `project_id`  | uuid FK → projects     |                                            |
| `route_key`   | text, not null         | `"hero"`, `"villain"` - unique per project |
| `route_name`  | text, not null         | `"Hero's Route"` - display name            |
| `jump_prefix` | text, not null         | `"hero_"` - for Ren'Py labels              |
| `sort_order`  | integer, default 0     | Display order                              |
| `is_shared`   | boolean, default false | Whether this is a shared route             |
| `created_at`  | timestamp              |                                            |
| `updated_at`  | timestamp              |                                            |

Unique constraint: `(project_id, route_key)`

---

### 10. Ren'Py Definitions

Character tags, colors, transforms.

| Column            | Type               | Notes                                       |
| ----------------- | ------------------ | ------------------------------------------- |
| `id`              | uuid PK            |                                             |
| `project_id`      | uuid FK → projects |                                             |
| `category`        | enum               | `CHARACTER`, `TRANSFORM`, `IMAGE`, `INIT`   |
| `sort_order`      | integer            | Export sequence                             |
| `tag`             | text               | `"eileen"`, `e`                             |
| `display_name`    | text               | `"Eileen"`                                  |
| `definition_code` | text               | Full line: `define eileen = Character(...)` |
| `reference_tag`   | text, nullable     | For transform/image target                  |
| `created_at`      | timestamp          |                                             |
| `updated_at`      | timestamp          |                                             |

Unique constraint: `(project_id, tag)`

---

### 11. Variables

Boolean story state tracking (simpler alternative to flags).

| Column        | Type               | Notes                |
| ------------- | ------------------ | -------------------- |
| `id`          | uuid PK            |                      |
| `project_id`  | uuid FK → projects |                      |
| `key`         | text, not null     | `"met_lucas"`        |
| `description` | text               | Variable description |
| `category`    | text               | For grouping         |
| `created_at`  | timestamp          |                      |

Unique constraint: `(project_id, key)`

---

### 12. Characters

| Column               | Type                            | Notes                             |
| -------------------- | ------------------------------- | --------------------------------- |
| `id`                 | uuid PK                         |                                   |
| `project_id`         | uuid FK → projects              |                                   |
| `name`               | text, not null                  | Database key                      |
| `display_name`       | text, not null                  | UI display                        |
| `renpy_tag`          | text, not null                  | Export: `"eileen"`                |
| `route_affiliation`  | text                            | Legacy; prefer `label.route`      |
| `is_love_interest`   | boolean, default false          |                                   |
| `pair_group_id`      | uuid FK → pair_groups, nullable | Sequel duos                       |
| `dialogue_style`     | text                            | Personality for AI dialogue       |
| `conditional_prefix` | text, nullable                  | Sprite variants: `"eileen_happy"` |
| `color`              | text, not null                  | Hex for UI                        |
| `avatar_url`         | text, nullable                  | Path to avatar image file         |
| `created_at`         | timestamp                       |                                   |
| `updated_at`         | timestamp                       |                                   |

---

### 13. Pair Groups

Sequel duo tracking.

| Column             | Type                 | Notes                          |
| ------------------ | -------------------- | ------------------------------ |
| `id`               | uuid PK              |                                |
| `project_id`       | uuid FK → projects   |                                |
| `character_a_id`   | uuid FK → characters |                                |
| `character_b_id`   | uuid FK → characters |                                |
| `duo_ending_label` | text                 | Jump target if both >threshold |
| `threshold`        | integer, default 70  | Stat value for duo ending      |
| `created_at`       | timestamp            |                                |
| `updated_at`       | timestamp            |                                |

---

### 14. Stats

| Column         | Type                           | Notes                  |
| -------------- | ------------------------------ | ---------------------- |
| `id`           | uuid PK                        |                        |
| `project_id`   | uuid FK → projects             |                        |
| `character_id` | uuid FK → characters, nullable | Null for global        |
| `key`          | text, not null                 | `"eileen_affection"`   |
| `name`         | text, not null                 | `"Eileen's Affection"` |
| `min_value`    | integer, default 0             |                        |
| `max_value`    | integer, default 100           |                        |
| `description`  | text                           |                        |
| `created_at`   | timestamp                      |                        |
| `updated_at`   | timestamp                      |                        |

---

### 15. Labels

Container for logical labels; content in `label_lines`. Represents Ren'Py label statements (not to be confused with Ren'Py 'scene' commands).

| Column                | Type                              | Notes                                                                                                                                                                                                                                                                                        |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid PK                           |                                                                                                                                                                                                                                                                                              |
| `project_id`          | uuid FK → projects                |                                                                                                                                                                                                                                                                                              |
| `title`               | text, not null                    |                                                                                                                                                                                                                                                                                              |
| `group_type`          | text, nullable                    | `"act"`, `"chapter"`, `"episode"`, etc. or null                                                                                                                                                                                                                                              |
| `group_value`         | text, nullable                    | `"I"`, `"1"`, `"1a"`, etc. or null                                                                                                                                                                                                                                                           |
| `label_number`        | integer, not null                 |                                                                                                                                                                                                                                                                                              |
| `sequence_order`      | integer, default 0                | Sorting                                                                                                                                                                                                                                                                                      |
| `route`               | text, nullable                    | **Soft reference** to `route_configs.route_key` within same project. Null = shared/common. Application-layer validation ensures the route exists for the project; no database FK constraint due to composite key requirement `(project_id, route)` → `route_configs(project_id, route_key)`. |
| `visibility`          | enum                              | `EXCLUSIVE`, `SHARED`, `DUO_PAIR`                                                                                                                                                                                                                                                            |
| `duo_pair_id`         | uuid FK → pair_groups, nullable   |                                                                                                                                                                                                                                                                                              |
| `status`              | `label_status`, default `DRAFT`   |                                                                                                                                                                                                                                                                                              |
| `prerequisites`       | jsonb                             | `{stateVariables?: [], meters?: {}}`                                                                                                                                                                                                                                                         |
| `effects`             | jsonb                             | `{stateVariablesSet?: [], stateVariablesUnset?: [], meters?: {}}`                                                                                                                                                                                                                            |
| `cross_route_context` | text, nullable                    | Prequel: `"Lucas_Friend_Mode"`                                                                                                                                                                                                                                                               |
| `reader_notes`        | text, nullable                    | Beta feedback                                                                                                                                                                                                                                                                                |
| `project_file_id`     | uuid FK → project_files, nullable | Project file reference                                                                                                                                                                                                                                                                       |
| `label_name`          | text, nullable                    | The actual label name in the RPY file                                                                                                                                                                                                                                                        |
| `label_position`      | integer, nullable                 | Position of this label within the file                                                                                                                                                                                                                                                       |
| `content_hash`        | text, nullable                    | Hash of all lines' content                                                                                                                                                                                                                                                                   |
| `last_synced_hash`    | text, nullable                    |                                                                                                                                                                                                                                                                                              |
| `sync_status`         | enum, nullable                    | `SYNCED`, `MODIFIED_LOCAL`, `CONFLICT`                                                                                                                                                                                                                                                       |
| `last_exported_at`    | timestamp, nullable               |                                                                                                                                                                                                                                                                                              |
| `last_imported_at`    | timestamp, nullable               |                                                                                                                                                                                                                                                                                              |
| `export_commit_sha`   | text, nullable                    |                                                                                                                                                                                                                                                                                              |
| `import_commit_sha`   | text, nullable                    |                                                                                                                                                                                                                                                                                              |
| `created_by`          | uuid FK → users, nullable         | Audit trail                                                                                                                                                                                                                                                                                  |
| `updated_by`          | uuid FK → users, nullable         | Audit trail                                                                                                                                                                                                                                                                                  |
| `version`             | integer, default 1                |                                                                                                                                                                                                                                                                                              |
| `deleted_at`          | timestamp, nullable               | Soft delete                                                                                                                                                                                                                                                                                  |
| `created_at`          | timestamp                         |                                                                                                                                                                                                                                                                                              |
| `updated_at`          | timestamp                         |                                                                                                                                                                                                                                                                                              |

> **Design Note - Soft Route Reference**: The `route` column uses a soft reference (text field without FK constraint) instead of a hard foreign key. This design choice was made because:
>
> 1. **Composite Key Requirement**: A proper FK would require `(project_id, route)` → `route_configs(project_id, route_key)`, which Drizzle ORM doesn't natively support
> 2. **Current Implementation**: Labels are created via GitLab sync with `route = null` (shared/common), and there is no current API to modify the route field
> 3. **Future Safeguards**: When adding route assignment functionality, application-layer validation must ensure the route exists for the project by querying `route_configs` before allowing a non-null value

---

### 16. Label Lines

Atomic lines with images.

| Column                   | Type                               | Notes                                                  |
| ------------------------ | ---------------------------------- | ------------------------------------------------------ |
| `id`                     | uuid PK                            |                                                        |
| `label_id`               | uuid FK → labels                   |                                                        |
| `sequence`               | integer, not null                  | Line order within label                                |
| `content`                | text, not null                     | The text                                               |
| `content_type`           | `content_type`, not null           |                                                        |
| `speaker_id`             | uuid FK → characters, nullable     | Null = narration                                       |
| `visual_type`            | `visual_type`, default `GENERATED` |                                                        |
| `visual_slug_override`   | text, nullable                     | Manual slug instead of auto                            |
| `custom_visual_name`     | text, nullable                     | For `CUSTOM` type                                      |
| `menu_options`           | jsonb, nullable                    | `[{label, targetLabelId, conditionFlags?}]`            |
| `word_count`             | integer, nullable                  | Computed on insert/update via trigger                  |
| `demo_placeholder_color` | text, nullable                     | Black screen fallback hex                              |
| `demo_notes`             | text, nullable                     | "Character enters from left" for placeholder rendering |
| `project_file_id`        | uuid FK → project_files, nullable  | Project file reference                                 |
| `line_position`          | integer, nullable                  | Position within the RPY file                           |
| `content_hash`           | text, nullable                     | SHA-256 of content field                               |
| `last_synced_hash`       | text, nullable                     | Hash at last sync                                      |
| `is_dirty`               | boolean, default false             | Modified since last sync                               |
| `last_synced_at`         | timestamp, nullable                |                                                        |
| `rpy_line_number`        | integer, nullable                  | Actual line number in source                           |
| `rpy_indent_level`       | integer, nullable                  | Indent for proper formatting                           |
| `deleted_at`             | timestamp, nullable                | Soft delete                                            |
| `created_at`             | timestamp                          |                                                        |
| `updated_at`             | timestamp                          |                                                        |

---

### 17. Label Characters (Junction)

| Column         | Type                                | Notes                 |
| -------------- | ----------------------------------- | --------------------- |
| `label_id`     | uuid FK → labels                    |                       |
| `character_id` | uuid FK → characters                |                       |
| `role`         | `character_role`, default `PRIMARY` |                       |
| `emotion`      | text                                | For sprite tracking   |
| `notes`        | text                                | `"Wearing red dress"` |

PK: `(label_id, character_id)`

---

### 18. World Elements

| Column        | Type                     | Notes |
| ------------- | ------------------------ | ----- |
| `id`          | uuid PK                  |       |
| `project_id`  | uuid FK → projects       |       |
| `name`        | text, not null           |       |
| `type`        | `element_type`, not null |       |
| `description` | text                     |       |
| `tags`        | jsonb, default `[]`      |       |
| `created_at`  | timestamp                |       |

---

### 19. AI Suggestions

| Column                    | Type                                   | Notes                |
| ------------------------- | -------------------------------------- | -------------------- |
| `id`                      | uuid PK                                |                      |
| `project_id`              | uuid FK → projects                     |                      |
| `label_id`                | uuid FK → labels, nullable             |                      |
| `character_id`            | uuid FK → characters, nullable         | For voice checks     |
| `suggestion_type`         | `suggestion_type`, not null            |                      |
| `prompt_context`          | jsonb                                  | Anonymized context   |
| `project_name_anonymized` | text                                   | Audit trail          |
| `raw_response`            | text                                   |                      |
| `parsed_suggestions`      | jsonb                                  | Array of suggestions |
| `status`                  | `suggestion_status`, default `PENDING` |                      |
| `applied_at`              | timestamp, nullable                    | When accepted        |
| `created_at`              | timestamp                              |                      |

---

### 20. Exports

| Column                   | Type               | Notes                       |
| ------------------------ | ------------------ | --------------------------- |
| `id`                     | uuid PK            |                             |
| `project_id`             | uuid FK → projects |                             |
| `format`                 | text               | `RENPY`, `MARKDOWN`, `JSON` |
| `file_name`              | text, not null     |                             |
| `content`                | text               | Generated `.rpy` content    |
| `file_size`              | integer            |                             |
| `visual_system_snapshot` | jsonb              | Version of pattern used     |
| `created_at`             | timestamp          |                             |

---

### 21. Import Logs

One-time migration tracking (e.g., from Google Docs).

| Column           | Type               | Notes                                |
| ---------------- | ------------------ | ------------------------------------ |
| `id`             | uuid PK            |                                      |
| `project_id`     | uuid FK → projects |                                      |
| `source`         | text               | `"google_docs"`                      |
| `source_url`     | text, nullable     | Original doc reference               |
| `labels_created` | integer            |                                      |
| `labels_skipped` | integer            | Duplicates/conflicts                 |
| `errors`         | jsonb              | Parse failures: `[{message, line?}]` |
| `created_at`     | timestamp          |                                      |

---

### 22. Demo Sessions

| Column                  | Type                            | Notes                      |
| ----------------------- | ------------------------------- | -------------------------- |
| `id`                    | uuid PK                         |                            |
| `project_id`            | uuid FK → projects              |                            |
| `user_id`               | uuid FK → users                 | Who's viewing              |
| `started_at`            | timestamp                       |                            |
| `current_label_line_id` | uuid FK → label_lines, nullable | Playback position          |
| `active_flags`          | jsonb                           | Simulated flag state: `[]` |
| `active_stats`          | jsonb                           | Simulated stat state: `{}` |
| `route_taken`           | text, nullable                  | Locked route if applicable |
| `ended_at`              | timestamp, nullable             |                            |

---

### 23. GitLab Integrations

User-level GitLab integration storing encrypted PAT.

| Column            | Type                               | Notes                |
| ----------------- | ---------------------------------- | -------------------- |
| `id`              | uuid PK                            |                      |
| `user_id`         | uuid FK → users, unique            |                      |
| `encrypted_token` | text, not null                     | Encrypted GitLab PAT |
| `gitlab_url`      | text, default 'https://gitlab.com' | GitLab instance URL  |
| `username`        | text                               | GitLab username      |
| `created_at`      | timestamp                          |                      |
| `updated_at`      | timestamp                          |                      |

---

### 24. Project Files

Unified file storage for all project sources (GitLab, zip, etc.). Stores full RPY file content for Script Mode editing and links to labels.

| Column             | Type                          | Notes                                                       |
| ------------------ | ----------------------------- | ----------------------------------------------------------- |
| `id`               | uuid PK                       |                                                             |
| `project_id`       | uuid FK → projects            |                                                             |
| `source`           | `file_source`, not null       | `GITLAB` or `ZIP` (where the file came from)                |
| `file_path`        | text, not null                | e.g., `"labels/act_i.rpy"` or `"gui/screens.rpy"`           |
| `file_type`        | `project_file_type`, not null | `STORY` (story labels) or `SETTINGS` (gui, etc.)            |
| `content`          | text, not null                | Full RPY file content for Script Mode                       |
| `original_content` | text, nullable                | Original imported content (used as base for reconstruction) |
| `content_hash`     | text, not null                | SHA-256 hash for idempotency                                |
| `last_synced_at`   | timestamp, nullable           | Last sync timestamp (GitLab-specific, null for non-GitLab)  |
| `last_commit_sha`  | text, nullable                | Last commit SHA (GitLab-specific, null for non-GitLab)      |
| `created_at`       | timestamp                     |                                                             |
| `updated_at`       | timestamp                     |                                                             |

Unique constraint: `(project_id, source, file_path)`

---

### 25. Project File Sync State

Track sync operations for individual files (supports all file sources: GitLab, zip, etc.).

| Column            | Type                    | Notes                                  |
| ----------------- | ----------------------- | -------------------------------------- |
| `id`              | uuid PK                 |                                        |
| `project_file_id` | uuid FK → project_files |                                        |
| `content_hash`    | text, not null          | SHA-256 for idempotency                |
| `status`          | `sync_status`, not null | `synced`, `modified_local`, `conflict` |
| `started_at`      | timestamp               |                                        |
| `completed_at`    | timestamp, nullable     |                                        |
| `error_message`   | text, nullable          |                                        |
| `rpy_label_count` | integer, nullable       | Number of labels parsed                |
| `db_label_count`  | integer, nullable       | Number of labels created/updated       |

---

### 26. GitLab Repositories

Project to GitLab repository mapping.

| Column              | Type                               | Notes               |
| ------------------- | ---------------------------------- | ------------------- |
| `id`                | uuid PK                            |                     |
| `project_id`        | uuid FK → projects                 |                     |
| `gitlab_project_id` | integer, not null                  | GitLab project ID   |
| `repository_name`   | text, not null                     | Repository name     |
| `gitlab_url`        | text, default 'https://gitlab.com' | GitLab instance URL |
| `default_branch`    | text, default 'main'               | Default branch name |
| `last_synced_at`    | timestamp, nullable                | Last sync timestamp |
| `created_at`        | timestamp                          |                     |

---

### 27. GitLab Sync Operations

Sync operations tracking for export/import.

| Column           | Type                              | Notes                                           |
| ---------------- | --------------------------------- | ----------------------------------------------- |
| `id`             | uuid PK                           |                                                 |
| `project_id`     | uuid FK → projects                |                                                 |
| `operation`      | `sync_operation`, not null        | `export` or `import`                            |
| `status`         | `sync_operation_status`, not null | `pending`, `in_progress`, `completed`, `failed` |
| `branch`         | text, nullable                    | Branch name                                     |
| `conflict_count` | integer, default 0                | Number of conflicts                             |
| `error_message`  | text, nullable                    | Error details                                   |
| `started_at`     | timestamp                         |                                                 |
| `completed_at`   | timestamp, nullable               |                                                 |

---

## Relations Overview

```
users
├── sessions (1:m)
├── user_settings (1:1)
├── admin_settings (updated_by)
├── gitlab_integrations (1:1)
├── projects (as owner)
├── project_users (as reader/tester)
└── demo_sessions (1:m)

projects
├── project_settings (1:1)
├── visual_systems (1:1)
├── route_configs (1:m)
├── renpy_definitions (1:m)
├── state_variables (1:m)
├── characters (1:m)
├── pair_groups (1:m)
├── meters (1:m)
├── labels (1:m)
├── ai_suggestions (1:m)
├── exports (1:m)
├── import_logs (1:m)
├── project_files (1:m)
├── gitlab_repositories (1:m)
├── gitlab_sync_operations (1:m)
└── demo_sessions (1:m)

labels
├── label_lines (1:m, ordered by sequence)
├── characters (derived from label_lines.speakerId)
├── ai_suggestions (1:m)
├── project_file_id (FK to project_files)
└── route (soft reference to route_configs.route_key, same project)

label_lines
├── demo_sessions (1:1, as current_label_line_id, nullable)
└── menu_options (JSON array with targetLabelId references)

characters
├── meters (1:m, optional)
├── pair_groups (m:1, optional, via character_a/b_id)
├── label_lines (1:m, as speakerId)
└── renpy_definitions (1:m, optional)

pair_groups
└── labels (1:m, optional, as duo_pair_id)

visual_systems
└── projects (1:1)

route_configs
├── projects (1:m)
└── labels.route (soft reference from labels within same project)

project_files
├── project_file_sync_state (1:m)
└── labels (1:m, via project_file_id)

gitlab_repositories
└── projects (1:m)

gitlab_sync_operations
└── projects (1:m)
```

---

## Planned Features (Not Yet Implemented)

The following features are planned but have not been implemented in the current schema:

### User Management Enhancements

- Email verification workflow
- Password reset functionality
- User profile customization
- User activity tracking

### Collaboration Features

- Real-time collaborative editing
- Comment threads on labels/lines
- Change history and rollback
- User permissions beyond OWNER/READER/TESTER

### AI Integration Enhancements

- Voice generation integration
- Image generation integration
- Advanced narrative suggestions
- Character personality consistency checking

### Export/Import Features

- Additional export formats (Twine, Ink, etc.)
- Import from more sources (Google Sheets, CSV)
- Merge conflict resolution UI
- Version control integration beyond GitLab

### Analytics

- Project analytics dashboard
- User activity reports
- Label completion tracking
- Story branching visualization

### Advanced Script Mode

- Ren'Py syntax highlighting
- Code completion
- Inline error checking
- Ren'Py preview in browser
