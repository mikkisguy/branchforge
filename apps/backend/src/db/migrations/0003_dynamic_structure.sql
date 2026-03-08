-- Drop project type enum
DROP TYPE IF EXISTS project_type;

-- Remove type and routeLockChapter from projects
ALTER TABLE projects DROP COLUMN IF EXISTS type;
ALTER TABLE projects DROP COLUMN IF EXISTS route_lock_chapter;

-- Replace act/chapter with flexible grouping in scenes
ALTER TABLE scenes DROP COLUMN IF EXISTS act;
ALTER TABLE scenes DROP COLUMN IF EXISTS chapter;
ALTER TABLE scenes ADD COLUMN group_type TEXT;
ALTER TABLE scenes ADD COLUMN group_value TEXT;

-- Update visual_systems for template-based naming
ALTER TABLE visual_systems DROP COLUMN IF EXISTS pattern;
ALTER TABLE visual_systems DROP COLUMN IF EXISTS act_prefixes;
ALTER TABLE visual_systems DROP COLUMN IF EXISTS chapter_prefix;
ALTER TABLE visual_systems ADD COLUMN naming_template TEXT NOT NULL DEFAULT '{scene}_{counter}_{slug}';
ALTER TABLE visual_systems ADD COLUMN group_prefixes JSONB;
ALTER TABLE visual_systems ADD COLUMN default_group_type TEXT;
