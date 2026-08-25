# Changelog

All notable changes to BranchForge will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v1.0.0-beta.0 - 2026-08-25

- First 1.0 beta: core write and script editing, flow graph, zip import/export, and GitLab sync for solo authors.
  GitLab conflict review is read-only in this beta. Apply does not write resolved files. Resolve conflicts in GitLab or locally, then pull again.
- Improved reliability and performance through comprehensive code quality improvements and bug fixes
- Added visual statement preview images and hover/click previews in Write and Script modes
- Fixed a bug in Character() export to use Ren'Py name
- Added warnings for unsaved changes across multiple editing dialogs
- Documented keyboard shortcuts with an in-app help dialog, contextual hints, and a user guide page
- Documented keyboard shortcuts with in-app help and docs
- Updated various places in the UI and added BranchForge logo as favicon
- Added Script Mode generated-file preview with clearer import handling and fixed label ordering in file tree

## v0.13.0 - 2026-07-14

- Made the app shell significantly more mobile-responsive
- Added a mobile overflow menu and improved mobile-safe layouts
- Improved form accessibility
- Overhauled keyboard navigation
- Improved screen reader support
- Fixed contrast errors
- Changed dialogue style to more generic notes on the character info

## v0.12.0 - 2026-07-06

- Added dark/light mode toggle, tuned color tokens
- Added pair groups for duo tracking
- Added world bible feature for tracking info
- Added user settings: avatar upload, username management, and theme persistence
- Added per-project visual system configuration
- Enhanced character detection on import, fixed wizard not showing

## v0.11.1 - 2026-06-17

- Improved safety with security fixes
- Added tooltips with label details in flow graph

## v0.11.0 - 2026-06-14

- Enhanced security with CSRF protection and improved GitLab-related validations
- Updated packages throughout the project
- Added filtering and search to flow graph
- Enhanced performance with additional lazy-loading on several components
- Added layout modes to flow graph

## v0.10.0 - 2026-06-13

- Added flow graph visualization feature
- Added Zip export feature
- Fixed visual statement support, enhanced flow graph and tweaked UI
- Renamed prerequisites to conditions, state variables to variables and meters to stats for clarity
- Added support for editing menu choice texts in write mode
- Replaced character reference panel with properties panel that displays detailed info about selected label
- Added line-level conditions and metadata badges to write mode
- Implemented incoming jumps section to write mode
- Added collapsible reference panel in script mode and simplified left sidebar and write mode

## v0.9.2 - 2026-05-22

- Fixed Docker builds by updating build permission configs

## v0.9.1 - 2026-05-22

- Fixed Docker builds

## v0.9.0 - 2026-05-22

- Added stat management
- Added the possibility to add a new label on write mode, also some styling updates for the label and file lists
- Added for labels: edit dialog for title and name, title display to script mode and filtering in write mode
- Added sorting toggle for labels: file order/recent
- Fixed GitLab export flow

## v0.8.0 - 2026-04-24

- Unified project imports and management in a single settings view
- Added undo/redo functionality to the script editor
- Refined the Settings modal UI and improved toggle accessibility
- Fixed autosave sync
- Added editing and deleting projects

## v0.7.4 - 2026-04-13

- Fixed release workflow

## v0.7.3 - 2026-04-12

- Fixed release workflow again

## v0.7.2 - 2026-04-12

- Fixed release workflow

## v0.7.1 - 2026-04-10

- Updated write mode design and features, now tabs
- Improved GitLab sync user flow
- Added focus mode toggle for both write and script mode.
- Added collapsible sidebars to modes

## v0.7.0 - 2026-04-03

- Added write mode components and functionality
- Updated auto saving feature
- Added undo/redo functionality to write mode
- Added daily writing goal

## v0.6.0 - 2026-03-23

- Added CodeMirror for code editing and syntax highlighting options
- Added character dialog
- Added font size and line wrap to script editor
- Updated search functionality for script editor
- Added left sidebar for better usability
- Integrated CodeMirror for RenPy syntax highlighting
- Excluded screens.rpy from dialogue line import to avoid processing UI definitions

## v0.5.1 - 2026-03-15

- Added Ren'Py definitions management service and UI components
- Added character parser service and import wizard for RPY character management
- Added game variables management
- Added soft delete and sync tracking to labels

## v0.5.0 - 2026-03-09

- Changed scene terminology to be consistent with Ren'Py
- General refactor: Add route configuration dialog and API integration
- General refactor: Implement route configuration management with CRUD operations and update project types
- Dynamic story structure: First pass
- Added route settings dialog

## v0.4.1 - 2026-03-06

- Integrated scenes with ScriptMode UI, added RPY generator, and added refresh for scenes after GitLab sync
- Enhanced GitLab integration
- Updated GitLab PAT handling and testing, renamed GitLab endpoint for clarity
- Added TanStack Query-based scenes integration with API client, query keys, useScenes hook, and shared types

## v0.4.0 - 2026-03-05

- Migrated to TanStack Query for better data fetching and handling
- Reduced type duplication across the codebase

## v0.3.1 - 2026-03-05

- Updated the GitLab routes to return appropriate responses
- Fixed settings modal sizing
- Fixed bugs in project loading and sessions

## v0.3.0 - 2026-03-05

- Improved app performance and security

## v0.2.0 - 2026-03-03

- Added scene functionality to backend, created integration tests for projects
- Converted brittle unit tests to integration tests, updated test handling

## v0.1.3 - 2026-03-03

- Fixed changelog handling
- Fixed missing pnpm

## Previous documented changes (< v0.1.3)

- GitLab integration (parts 1 and 2)
- Settings modal
- Working signup/login/logout flow
- Changesets-based unified version numbering system
- Top-right panel for functions and BF logo
- Robust session management (backend)
- GPLv3 license
- Updated versioning process to read version from root package.json
