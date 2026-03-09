# Changelog

All notable changes to BranchForge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.5.0 - 2026-03-09

### Added
- 3dfc713: Changed scene terminology tyo be consistent with Renpy
- 2e58af9: General refactor: Add route configuration dialog and API integration, other edits
- 187b3b0: General refactor: Implement route configuration management with CRUD operations and update project types
- 567d601: Dynamic story structure: First pass

### Fixed
- 8274a8e: Added route settings dialog
- Updated dependencies [3dfc713]
- Updated dependencies [2e58af9]
- Updated dependencies [187b3b0]
- Updated dependencies [567d601]
  - @branchforge/shared@0.5.0

## v0.4.1 - 2026-03-06

### Fixed
- a39e621: Integrated scenes with ScriptMode UI, added RPY generator, and added refresh for scenes after GitLab sync
- 8057951: Enhanced GitLab integration
- 57be3dc: Updated GitLab PAT handling and testing, renamed GitLab endpoint for clarity
- 5b5e312: Added TanStack Query-based scenes integration with API client, query keys, useScenes hook, and shared types
- Updated dependencies [a39e621]
- Updated dependencies [5b5e312]
  - @branchforge/shared@0.4.1

## v0.4.0 - 2026-03-05

### Added
- 9cdac7a: Migrated to TanStack Query for better data fetching and handling

### Fixed
- 4d51360: Reduced type duplication across the codebase
- Updated dependencies [4d51360]
  - @branchforge/shared@0.4.0

## v0.3.1 - 2026-03-05

### Fixed
- 79715: Updated the GitLab routes to return appropriate responses
- 3d7c10d: Fixed settings modal sizing
- 55c156d: Bug fixes to project loading and sessions
  - @branchforge/shared@0.3.1

## v0.3.0 - 2026-03-05

### Added
- da436a9: Performance and security improvements

### Fixed
- @branchforge/shared@0.3.0

## v0.2.0 - 2026-03-03

### Added
- 0ad737c: Added scene functionality to backend, created integration tests for projects
- 3934293: Converted brittle unit tests to integration tests, updated test handling

### Fixed
- @branchforge/shared@0.2.0

## v0.1.3 - 2026-03-03

### Fixed
- 01611fe: Fixed changelog handling
- Updated dependencies [01611fe]
  - @branchforge/shared@0.1.3
- f93d106: Fixed missing pnpm

## Previous documented changes (< v0.1.3)

### Added
- GitLab integration (parts 1 and 2)
- Settings modal
- Working signup/login/logout flow
- Changesets-based unified version numbering system
- Top-right panel for functions and BF logo
- Robust session management (backend)
- GPLv3 license

### Changed
- Updated versioning process to read version from root package.json
- Updated  configuration and Gitleaks settings
