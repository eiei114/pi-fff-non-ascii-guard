# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] - 2026-07-07

### Changed

- **fff tool block warnings** collapse after the first detailed emission for an unchanged non-ASCII path set; detailed output shows at most 2 example paths plus `... and N more`.
- Repeated blocks for the same path set emit a one-line summary while keeping `list_non_ascii_paths` / `sanitize_filenames(dryRun=true)` remediation guidance visible.

## [0.1.5] - 2026-06-04

### Fixed

- **fff tool gate** now also blocks `grep`. Non-ASCII paths could still panic `fff-core` via content search while only `find_files` / `fff_multi_grep` were gated.

### Changed

- Blocked-tool lists in notifications and prompts are built from `FFF_TOOL_NAMES` via `formatBlockedFffTools()`.

## [0.1.4] - 2026-06-03

### Added

- **fff tool gate**: blocks `find_files` and `fff_multi_grep` while non-ASCII paths exist (prevents fff-core panic instead of only warning).
- **`list_non_ascii_paths` tool**: inspect files and directories with non-ASCII path segments.
- **Full-path scan**: flags paths when any directory segment is non-ASCII, not only the filename.
- **`before_agent_start` hint**: tells the model that fff search tools are blocked until paths are fixed.
- **lib/** modules and smoke tests for scan, slug, and collision detection.

### Changed

- Session warning now states that fff tools are blocked until sanitize completes.
- `sanitize_filenames` only renames files; non-ASCII directories are listed for manual rename.
- Slug collisions get automatic `-2`, `-3`, … suffixes instead of aborting the rename batch.

### Fixed

- Detect non-ASCII segments in the workspace root (`cwd`), not only in `path.relative()` results.
- `sanitize_filenames` skips ASCII-basename files that only sit under non-ASCII directories.
- Rename planner avoids targets that already exist on disk (prevents accidental overwrites).

## [0.1.3] - 2026-06-02

### Fixed

- Added an explicit auto-release to publish workflow handoff so npm publishing runs after a version bump is merged to `main`.
- Bumped package metadata to publish a fresh npm version after the previously tagged `0.1.2` release did not reach npm.

## [0.1.2] - 2026-06-02

### Changed

- Restructured README to match the Pi OSS minimal-docs policy: added badges, Features, Quick start, Usage summary, Package contents, Development, Release, Security, Links, and License sections.
- Preserved all pi-fff-non-ascii-guard-specific content (real incident, tool documentation).

### Added

- CI workflow (`ci.yml`) for package validation on push and PR.
- CHANGELOG.md.
