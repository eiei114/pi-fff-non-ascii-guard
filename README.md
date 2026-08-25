# pi-fff-non-ascii-guard

[![Join dotfield.xyz on Discord](https://img.shields.io/badge/Join%20dotfield.xyz%20on%20Discord-5865F2?logo=discord&logoColor=white)](https://discord.gg/4945dXZVW5)

[![CI](https://github.com/eiei114/pi-fff-non-ascii-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-fff-non-ascii-guard/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-fff-non-ascii-guard/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-fff-non-ascii-guard/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-fff-non-ascii-guard)](https://www.npmjs.com/package/pi-fff-non-ascii-guard)
[![npm downloads](https://img.shields.io/npm/dw/pi-fff-non-ascii-guard)](https://www.npmjs.com/package/pi-fff-non-ascii-guard)
[![License: MIT](https://img.shields.io/github/license/eiei114/pi-fff-non-ascii-guard)](https://github.com/eiei114/pi-fff-non-ascii-guard/blob/main/LICENSE)
![Pi Package](https://img.shields.io/badge/Pi-Package-blue)
[![Trusted Publishing](https://img.shields.io/badge/npm-provenance-yellow)](https://docs.npmjs.com/generating-provenance-statements)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

Pi extension that prevents `fff-core` panics caused by non-ASCII filenames.

See the [Roadmap](ROADMAP.md) for the maintenance direction and planned work.

## What this is

A Pi extension that detects and renames non-ASCII filenames before `fff-core` can panic on UTF-8 byte boundaries. It scans your workspace on session start, warns about problematic filenames, and provides a tool to safely rename them to ASCII slugs.

## Problem

`fff-core` can panic when it slices UTF-8 paths at byte offsets that are not character boundaries — for example, paths containing Japanese characters:

```text
thread '<unnamed>' panicked at crates\fff-core\src\constraints.rs:73:13:
byte index 65 is not a char boundary
```

This extension prevents the known crash by keeping scanned filenames ASCII-safe.

## Features

- **Session-start scan** — automatically detects non-ASCII paths when a Pi session begins
- **fff tool gate** — blocks `grep`, `find_files`, and `fff_multi_grep` while non-ASCII paths remain (prevents fff-core panic)
- **Warning notification** — alerts the LLM when problematic paths are found
- **`list_non_ascii_paths` tool** — list files and directories with non-ASCII path segments
- **`sanitize_filenames` tool** — preview or execute safe ASCII slug renames for files
- **Smart exclusions** — skips `.git`, `.obsidian`, `.pi`, `.claude`, `.scratch`, and `node_modules`
- **Collision disambiguation** — when two files slug to the same name, appends `-2`, `-3`, … and continues

## Install

```bash
pi install git:github.com/eiei114/pi-fff-non-ascii-guard
```

For project-local install:

```bash
pi install -l git:github.com/eiei114/pi-fff-non-ascii-guard
```

## Quick start

1. Install the extension (see [Install](#install)).
2. Start a Pi session in a workspace that may contain non-ASCII filenames.
3. If non-ASCII filenames are detected, Pi shows a warning with the file list.
4. Ask the LLM to call `sanitize_filenames` with `dryRun: true` to preview, then `dryRun: false` to execute.
5. After paths are ASCII-safe, `grep` / `find_files` / `fff_multi_grep` work again.

While non-ASCII paths exist, Pi blocks fff search tools and returns a fix hint instead of crashing.

## Usage summary

### `list_non_ascii_paths` tool

Lists every file and directory whose relative path contains non-ASCII characters. No parameters.

### `sanitize_filenames` tool

| Parameter | Type    | Default | Description                     |
|-----------|---------|---------|---------------------------------|
| `dryRun`  | boolean | `true`  | Preview renames without executing |

**Preview renames:**

```json
{ "dryRun": true }
```

**Execute renames:**

```json
{ "dryRun": false }
```

Dry-run output is a stable report of each relative source path and its proposed destination path:

```text
Dry run -- 2 file(s) to rename:
  scripts/SpreadsheetToJson_wrapあり・nullなし.gs -> scripts/spreadsheettojson_wrap-null.gs
  scripts/SpreadsheetToJson_wrapなし・nullあり.gs -> scripts/spreadsheettojson_wrap-null-2.gs

No filesystem changes made.

Conflict preview (auto-suffixed -2, -3, ... when needed):
  [slug collision] scripts/spreadsheettojson_wrap-null.gs <- scripts/SpreadsheetToJson_wrapあり・nullなし.gs, scripts/SpreadsheetToJson_wrapなし・nullあり.gs; planned: scripts/spreadsheettojson_wrap-null.gs, scripts/spreadsheettojson_wrap-null-2.gs
```

If two files would collide after slug conversion, or if the first-choice destination already exists on disk, the conflict preview flags the risk before you run apply mode. The current behavior is to auto-suffix planned destinations (`-2`, `-3`, …) so the batch can proceed without manual renaming. Future collision-policy work may tune those suffix rules; for now, treat the preview as the source of truth and manually rename files first if the proposed suffixes are not what you want.

Apply mode returns a list of completed renames and any errors.

## Package contents

```
pi-fff-non-ascii-guard/
├── extensions/
│   └── pi-fff-non-ascii-guard.ts   # Extension entry
├── lib/                            # Scan, slug, rename-plan helpers
├── tests/                          # Smoke tests
├── .github/workflows/
│   ├── auto-release.yml            # Auto-tag + release on merge to main
│   ├── ci.yml                      # Validate on PR / push
│   └── publish.yml                 # Publish to npm on tag or release
├── CHANGELOG.md
├── ROADMAP.md                      # Maintenance direction and seeds
├── LICENSE                         # MIT
├── SECURITY.md                     # Vulnerability reporting
├── package.json
└── README.md
```

## Development

Clone and validate:

```bash
git clone https://github.com/eiei114/pi-fff-non-ascii-guard.git
cd pi-fff-non-ascii-guard
npm run typecheck   # type-check all TypeScript sources
npm test            # smoke tests
npm run check       # typecheck + tests + npm pack --dry-run
BASE_REF=origin/main npm run version:check  # PR-only semver/CHANGELOG guard
```

## Release

Planned maintenance work is tracked in [ROADMAP.md](ROADMAP.md). Releases are automated:

1. Bump `version` in `package.json`.
2. Merge to `main`.
3. The **Auto Release** workflow tags `v<version>` and creates a GitHub release.
4. The tag triggers the **Publish** workflow, which publishes to npm with provenance.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

- No network requests.
- No environment variables or secrets read.
- Only renames files within the current Pi workspace directory.
- Skips hidden and internal directories (`.git`, `.obsidian`, `.pi`, `.claude`, `.scratch`, `node_modules`).

## Real incidents

This extension was created after Pi crashed while updating `.pi/monofold.yaml` in an Obsidian vault that contained Japanese PDF filenames.

Another crash while editing `AGENTS.md` in a Roblox repo with Google Apps Script files:

```text
thread '<unnamed>' panicked at crates\fff-core\src\constraints.rs:73:13:
byte index 44 is not a char boundary; it is inside 'な' (bytes 43..46) of
`scripts\SpreadsheetToJson_wrapあり・nullなし.gs`
```

The fff tool gate blocks `grep`, `find_files`, and `fff_multi_grep` until those paths are renamed.

Observed error:

```text
thread '<unnamed>' panicked at crates\fff-core\src\constraints.rs:73:13:
byte index 65 is not a char boundary; it is inside 'イ' (bytes 63..66) of `2_Literature\2_Tools\Pi Coding Agent - 初心者向け比較ガイド - slides.pdf`
```

Both offending files were renamed to ASCII slugs:

```text
2_Literature/2_Tools/pi-coding-agent-beginner-guide-slides.pdf
2_Literature/PKM/3x-zettelkasten-ai-serial-acceleration.pdf
```

## Links

- **Repository**: <https://github.com/eiei114/pi-fff-non-ascii-guard>
- **npm**: <https://www.npmjs.com/package/pi-fff-non-ascii-guard>
- **Issues**: <https://github.com/eiei114/pi-fff-non-ascii-guard/issues>

## License

[MIT](LICENSE) © Keisu
