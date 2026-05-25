# pi-fff-non-ascii-guard

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
pi install git:github.com/eiei114/pi-fff-non-ascii-guard
```

For project-local install:

```bash
pi install -l git:github.com/eiei114/pi-fff-non-ascii-guard
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
## Real incident that motivated this extension

This extension was created after Pi crashed while updating `.pi/monofold.yaml` in an Obsidian vault that contained Japanese PDF filenames.

The observed error was:

```text
thread '<unnamed>' panicked at crates\fff-core\src\constraints.rs:73:13:
byte index 65 is not a char boundary; it is inside 'イ' (bytes 63..66) of `2_Literature\2_Tools\Pi Coding Agent - 初心者向け比較ガイド - slides.pdf`
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

A second non-ASCII PDF filename was also present:

```text
2_Literature/PKM/3倍Zettelkasten - AI支援による直列高速化.pdf
```

Both files were renamed to ASCII slugs:

```text
2_Literature/2_Tools/pi-coding-agent-beginner-guide-slides.pdf
2_Literature/PKM/3x-zettelkasten-ai-serial-acceleration.pdf
```

The immediate workaround was to rename the files manually. This extension codifies that workaround so future projects get an early warning before `fff-core` touches paths that may trigger the same UTF-8 boundary panic.



