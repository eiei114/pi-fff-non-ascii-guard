# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
