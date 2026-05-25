# fff-non-ascii-guard

Pi extension that prevents `fff-core` panics caused by non-ASCII filenames.

## Problem

`fff-core` can panic when it slices UTF-8 paths at byte offsets that are not character boundaries, for example paths containing Japanese characters.

Example:

```text
thread '<unnamed>' panicked at crates\fff-core\src\constraints.rs:73:13:
byte index 65 is not a char boundary
```

## What this extension does

- Scans the current Pi workspace on `session_start`.
- Warns when non-ASCII filenames are found.
- Registers a `sanitize_filenames` tool that can preview or execute safe ASCII slug renames.
- Skips noisy/internal folders such as `.git`, `.obsidian`, `.pi`, `.claude`, `.scratch`, and `node_modules`.

## Install

```bash
pi install git:github.com/eiei114/fff-non-ascii-guard
```

For project-local install:

```bash
pi install -l git:github.com/eiei114/fff-non-ascii-guard
```

## Tool

`sanitize_filenames`

Parameters:

```json
{
  "dryRun": true
}
```

- `dryRun: true` previews planned renames.
- `dryRun: false` performs renames.

## Notes

This does not patch `fff-core` itself. It prevents the known crash by keeping scanned filenames ASCII-safe.
