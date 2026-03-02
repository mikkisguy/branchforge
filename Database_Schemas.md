## BranchForge Database Schemas

### Enums

| Enum | Values | Notes |
|------|--------|-------|
| `project_type` | `PREQUEL`, `SEQUEL` | |
| `user_role` | `OWNER`, `READER`, `TESTER` | Beta reader support |
| `scene_status` | `DRAFT`, `REVIEW`, `FINAL` | |
| `route_type` | `EILEEN`, `LUCAS`, `SHARED`, `FEMALE`, `MALE`, `COMBINED`, `COMMON` | Prequel routes + Sequel routes |
| `content_type` | `NARRATION`, `DIALOGUE`, `CHOICE`, `MENU`, `JUMP` | For line-level export logic |
| `visual_type` | `GENERATED`, `BLACK`, `CUSTOM` | Image handling per line |
| `element_type` | `LOCATION`, `ITEM`, `CONCEPT`, `EVENT` | World bible |
| `suggestion_type` | `CONSISTENCY`, `FLAG_SUGGEST`, `METER_SUGGEST`, `DIALOGUE_VARIANT` | |
| `suggestion_status` | `PENDING`, `ACCEPTED`, `REJECTED` | |
| `character_role` | `PRIMARY`, `SECONDARY`, `BACKGROUND`, `MENTIONED` | Scene presence |
| `renpy_definition_category` | `CHARACTER`, `TRANSFORM`, `IMAGE`, `INIT` | Ren'Py definition types |
| `scene_visibility` | `EXCLUSIVE`, `SHARED`, `DUO_PAIR` | Scene visibility across routes |
| `sync_operation` | `export`, `import` | GitLab sync operation type |
| `sync_status` | `pending`, `in_progress`, `completed`, `failed` | GitLab sync status |

---

### 1. Users

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `email` | text, unique, not null | |
| `password_hash` | text, not null | |
| `role` | `user_role`, default `OWNER` | For beta readers |
| `created_at` | timestamp, default now | |
| `updated_at` | timestamp, default now | |

---

### 2. Sessions

Persistent session storage for user authentication (database-backed, replaces in-memory).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Session ID (cookie value) |
| `user_id` | uuid FK → users | Owner |
| `data` | jsonb, not null | Session data (user object, etc.) |
| `expires_at` | timestamp, not null | Session expiration |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### 3. User Settings

Per-user preferences and settings.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `avatar_url` | text | Avatar image URL |
| `username` | text | Display username |
| `language` | text, default 'en' | UI language |
| `theme` | text, default 'light' | UI theme preference |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### 4. Admin Settings

Global application settings as key-value pairs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `key` | text, unique, not null | Setting key |
| `value` | jsonb, not null | Setting value |
| `description` | text | Setting description |
| `updated_at` | timestamp | |
| `updated_by` | uuid FK → users | Last modified by |

---

### 5. Projects

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | Owner |
| `name` | text, not null | |
| `type` | `project_type`, not null | `PREQUEL` or `SEQUEL` |
| `description` | text | |
| `route_lock_chapter` | integer, nullable | Sequel: when route locks |
| `max_meter_delta` | integer, default 10 | For budget calculator |
| `visibility` | `user_role`, default `OWNER` | Who can access |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### 6. Project Users

Beta reader access control.

| Column | Type | Notes |
|--------|------|-------|
| `project_id` | uuid FK → projects | |
| `user_id` | uuid FK → users | |
| `role` | `user_role`, not null | `READER` or `TESTER` |
| `added_at` | timestamp | |

PK: `(project_id, user_id)`

---

### 7. Visual Systems

Pattern configuration per project.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects, unique | One per project |
| `pattern` | enum | `ACT_SCENE_SLUG_COUNTER` (prequel) or `CHAPTER_SCENE_SLUG_COUNTER` (sequel) |
| `act_prefixes` | jsonb | `{"I": "ai", "II": "aii", "III": "aiii"}` or null |
| `chapter_prefix` | text | `"ch"` for sequel |
| `scene_padding` | integer | 1 or 2 digits |
| `counter_padding` | integer | 1 or 2 digits |
| `jump_prefix_shared` | text | e.g., `""` or `"shared"` |
| `jump_prefix_route_a` | text | e.g., `"lucas_"` |
| `jump_prefix_route_b` | text | e.g., `"eileen_"` |
| `route_a_name` | text | `"Lucas"` |
| `route_b_name` | text | `"Eileen"` |
| `placeholder_base_url` | text, nullable | "Where to look for {pattern}.png or serve generated placeholders |

---

### 8. Ren'Py Definitions

Character tags, colors, transforms.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `category` | enum | `CHARACTER`, `TRANSFORM`, `IMAGE`, `INIT` |
| `sort_order` | integer | Export sequence |
| `tag` | text | `"eileen"`, `e` |
| `display_name` | text | `"Eileen"` |
| `definition_code` | text | Full line: `define eileen = Character(...)` |
| `reference_tag` | text, nullable | For transform/image target |

---

### 9. Characters

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `name` | text, not null | Database key |
| `display_name` | text, not null | UI display |
| `renpy_tag` | text, not null | Export: `"eileen"` |
| `route_affiliation` | text | Legacy; prefer `scene.route` |
| `is_love_interest` | boolean, default false | |
| `pair_group_id` | uuid FK → pair_groups, nullable | Sequel duos |
| `dialogue_style` | text | Was `voice_notes`: personality for AI |
| `conditional_prefix` | text, nullable | Sprite variants: `"eileen_happy"` |
| `color` | text | Hex for UI |
| `created_at` | timestamp | |

---

### 10. Pair Groups

Sequel duo tracking.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `character_a_id` | uuid FK → characters | |
| `character_b_id` | uuid FK → characters | |
| `duo_ending_label` | text | Jump target if both >70 |
| `threshold` | integer, default 70 | Configurable |

---

### 11. Meters

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `character_id` | uuid FK → characters, nullable | Null for global |
| `key` | text, not null | `"viola_affection"` |
| `name` | text, not null | `"Viola's Affection"` |
| `min_value` | integer, default 0 | |
| `max_value` | integer, default 100 | |
| `description` | text | |
| `created_at` | timestamp | |

---

### 12. Flags

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `key` | text, not null | `"KNOWS_JULES"` |
| `description` | text | |
| `category` | text | `STORY`, `RELATIONSHIP`, etc. |
| `created_at` | timestamp | |

---

### 13. Scenes

Container for logical scenes; content to `scene_lines`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `title` | text, not null | |
| `act` | text, nullable | `"I"`, `"II"`, `"III"` or null |
| `chapter` | integer, nullable | 1, 2, 3... or null |
| `scene_number` | integer, not null | |
| `sequence_order` | integer, default 0 | Sorting |
| `route` | `route_type`, nullable | Null = shared/common |
| `visibility` | enum | `EXCLUSIVE`, `SHARED`, `DUO_PAIR` |
| `duo_pair_id` | uuid FK → pair_groups, nullable | |
| `status` | `scene_status`, default `DRAFT` | |
| `prerequisites` | jsonb | `{flags: [], meters: {}}` |
| `effects` | jsonb | `{flagsSet: [], flagsUnset: [], meters: {}}` |
| `cross_route_context` | text, nullable | Prequel: `"Lucas_Friend_Mode"` |
| `reader_notes` | text, nullable | Beta feedback |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### 14. Scene Lines

Atomic lines with images.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `scene_id` | uuid FK → scenes | |
| `sequence` | integer, not null | Line order within scene |
| `content` | text, not null | The text |
| `content_type` | `content_type`, not null | |
| `speaker_id` | uuid FK → characters, nullable | Null = narration |
| `visual_type` | `visual_type`, default `GENERATED` | |
| `visual_slug_override` | text, nullable | Manual slug instead of auto |
| `custom_visual_name` | text, nullable | For `CUSTOM` type |
| `menu_options` | jsonb, nullable | `[{label, target_scene_id, condition_flags}]` |
| `word_count` | integer, generated | |
| `demo_placeholder_color` | text, nullable | Black screen fallback hex |
| `demo_notes` | text, nullable | "Character enters from left" for placeholder rendering |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### 15. Scene Characters (Junction)

| Column | Type | Notes |
|--------|------|-------|
| `scene_id` | uuid FK → scenes | |
| `character_id` | uuid FK → characters | |
| `role` | `character_role`, default `PRIMARY` | |
| `emotion` | text | For sprite tracking |
| `notes` | text | `"Wearing red dress"` |

PK: `(scene_id, character_id)`

---

### 16. World Elements

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `name` | text, not null | |
| `type` | `element_type`, not null | |
| `description` | text | |
| `tags` | jsonb, default `[]` | |
| `created_at` | timestamp | |

---

### 17. AI Suggestions

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `scene_id` | uuid FK → scenes, nullable | |
| `character_id` | uuid FK → characters, nullable | For voice checks |
| `suggestion_type` | `suggestion_type`, not null | |
| `prompt_context` | jsonb | Anonymized context |
| `project_name_anonymized` | text | Audit trail |
| `raw_response` | text | |
| `parsed_suggestions` | jsonb | Array of suggestions |
| `status` | `suggestion_status`, default `PENDING` | |
| `applied_at` | timestamp, nullable | When accepted |
| `created_at` | timestamp | |

---

### 18. Exports

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `format` | text | `RENPY`, `MARKDOWN`, `JSON` |
| `file_name` | text, not null | |
| `content` | text | Generated `.rpy` content |
| `file_size` | integer | |
| `visual_system_snapshot` | jsonb | Version of pattern used |
| `created_at` | timestamp | |

---

### 19. Import Logs

One-time Google Docs migration tracking.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `source` | text | `"google_docs"` |
| `source_url` | text, nullable | Original doc reference |
| `scenes_created` | integer | |
| `scenes_skipped` | integer | Duplicates/conflicts |
| `errors` | jsonb | Parse failures |
| `created_at` | timestamp | |

---

### 20. Demo Sessions

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `user_id` | uuid FK → users | Who's viewing |
| `started_at` | timestamp | |
| `current_scene_line_id` | uuid FK → scene_lines, nullable | Playback position |
| `active_flags` | jsonb | Simulated flag state |
| `active_meters` | jsonb | Simulated meter state |
| `route_taken` | text, nullable | Locked route if applicable |
| `ended_at` | timestamp, nullable | |

---

### 21. GitLab Integrations

User-level GitLab integration storing encrypted PAT.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `encrypted_token` | text, not null | Encrypted GitLab PAT |
| `gitlab_url` | text, default 'https://gitlab.com' | GitLab instance URL |
| `username` | text | GitLab username |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### 22. GitLab Repositories

Project to GitLab repository mapping.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `gitlab_project_id` | integer, not null | GitLab project ID |
| `repository_name` | text, not null | Repository name |
| `gitlab_url` | text, default 'https://gitlab.com' | GitLab instance URL |
| `default_branch` | text, default 'main' | Default branch name |
| `last_synced_at` | timestamp | Last sync timestamp |
| `created_at` | timestamp | |

---

### 23. GitLab Sync Operations

Sync operations tracking for export/import.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `operation` | `sync_operation`, not null | `export` or `import` |
| `status` | `sync_status`, not null | `pending`, `in_progress`, `completed`, `failed` |
| `branch` | text | Branch name |
| `conflict_count` | integer, default 0 | Number of conflicts |
| `error_message` | text | Error details |
| `started_at` | timestamp | |
| `completed_at` | timestamp | |

---

## Relations Overview

```
users
├── user_sessions (1:m)
├── user_settings (1:1)
├── admin_settings (updated_by)
├── gitlab_integrations (1:m)
├── projects (as owner)
├── project_users (as reader/tester)
└── demo_sessions (1:m)

projects
├── visual_systems (1:1)
├── renpy_definitions (1:m)
├── characters (1:m)
├── pair_groups (1:m)
├── meters (1:m)
├── flags (1:m)
├── scenes (1:m)
├── ai_suggestions (1:m)
├── exports (1:m)
├── import_logs (1:m)
├── gitlab_repositories (1:m)
├── gitlab_sync_operations (1:m)
└── demo_sessions (1:m)

scenes
├── scene_lines (1:m, ordered by sequence)
├── scene_characters (m:m via junction)
└── ai_suggestions (1:m)

scene_lines
├── demo_sessions (1:1, as current_scene_line_id, nullable)
└── demo_sessions_history (implicit via session playback)

characters
├── meters (1:m, optional)
├── pair_groups (m:1, optional, via character_a/b_id)
├── scene_characters (m:m)
└── demo_sessions (m:m, implicit via active state)

pair_groups
└── scenes (1:m, optional, as duo_pair_id)

visual_systems
└── demo_sessions (m:1, implicit via placeholder_base_url usage)

gitlab_repositories
└── gitlab_sync_operations (1:m)
```
