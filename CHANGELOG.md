# Changelog

All notable changes to BranchForge will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.7.1 - 2026-04-10

- 9b5b4fe: Updated write mode design and features, now tabs
- 6c0f03f: Improved GitLab sync user flow
- 7e4a16a: Added focus mode toggle for both write and script mode.
- 18a6d9d: Added collapsible sidebars to modes
  - @branchforge/shared@0.7.1
- @branchforge/shared@0.7.1

## v0.7.0 - 2026-04-03

- b5285de: Added write mode components and functionality
- cecbd23: Updated auto saving feature
- 5071dea: Added undo/redo functionality to write mode
- 27afc62: Added daily writing goal
  - @branchforge/shared@0.7.0

## v0.6.0 - 2026-03-23

- 51d9927: Added CodeMirror for code editing and syntax highlighting options
- bd774a8: Added character dialog
- 428a22c: Added font size and line wrap to script editor
- 0c68594: Updated search functionality for script editor
- fe28c8b: Added left sidebar for better usability
- cace201: Integrated CodeMirror for RenPy syntax highlighting
- Updated dependencies [bd774a8]
  - @branchforge/shared@0.6.0
- 0077a58: Excluded screens.rpy from dialogue line import to avoid processing UI definitions

## v0.5.1 - 2026-03-15

- 4078ffb: Added Ren'Py definitions management service and UI components
- 8a59220: Added character parser service and import wizard for RPY character management
- 3ced98a: Added game state variables management
- Updated dependencies [4078ffb, 9898c, 8a59220, 3ced98a]
  - @branchforge/shared@0.5.1
- 9898c: Added soft delete and sync tracking to labels

## v0.5.0 - 2026-03-09

- 3dfc713: Changed scene terminology to be consistent with Ren'Py
- 2e58af9: General refactor: Add route configuration dialog and API integration
- 187b3b0: General refactor: Implement route configuration management with CRUD operations and update project types
- 567d601: Dynamic story structure: First pass
- 8274a8e: Added route settings dialog
- Updated dependencies [3dfc713, 2e58af9, 187b3b0, 567d601]
  - @branchforge/shared@0.5.0

## v0.4.1 - 2026-03-06

- a39e621: Integrated scenes with ScriptMode UI, added RPY generator, and added refresh for scenes after GitLab sync
- 8057951: Enhanced GitLab integration
- 57be3dc: Updated GitLab PAT handling and testing, renamed GitLab endpoint for clarity
- 5b5e312: Added TanStack Query-based scenes integration with API client, query keys, useScenes hook, and shared types
- Updated dependencies [a39e621, 5b5e312]
  - @branchforge/shared@0.4.1

## v0.4.0 - 2026-03-05

- 9cdac7a: Migrated to TanStack Query for better data fetching and handling
- 4d51360: Reduced type duplication across the codebase
- Updated dependencies [4d51360]
  - @branchforge/shared@0.4.0

## v0.3.1 - 2026-03-05

- 79715: Updated the GitLab routes to return appropriate responses
- 3d7c10d: Fixed settings modal sizing
- 55c156d: Fixed bugs in project loading and sessions
- Updated dependencies [55c156d]
  - @branchforge/shared@0.3.1

## v0.3.0 - 2026-03-05

- da436a9: Improved app performance and security
- Updated dependencies [da436a9]
  - @branchforge/shared@0.3.0

## v0.2.0 - 2026-03-03

- 0ad737c: Added scene functionality to backend, created integration tests for projects
- 3934293: Converted brittle unit tests to integration tests, updated test handling
- Updated dependencies
  - @branchforge/shared@0.2.0

## v0.1.3 - 2026-03-03

- 01611fe: Fixed changelog handling
- f93d106: Fixed missing pnpm
- Updated dependencies [01611fe]
  - @branchforge/shared@0.1.3

## Previous documented changes (< v0.1.3)

- GitLab integration (parts 1 and 2)
- Settings modal
- Working signup/login/logout flow
- Changesets-based unified version numbering system
- Top-right panel for functions and BF logo
- Robust session management (backend)
- GPLv3 license
- Updated versioning process to read version from root package.json
