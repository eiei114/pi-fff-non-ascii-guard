# Roadmap

> **Maintenance direction:** `oss-maintenance-roadmap-direction-v1`.
>
> This roadmap prioritizes **stabilization, execution/startup speed, token efficiency, explicit design boundaries, `pi-extension-template` compliance, and public quality** (README / CHANGELOG / SECURITY / CI / npm pack / release handoff) over new feature surface.
>
> **Constraints:** existing commands, tools, and main UX stay unless a compatibility fix is required. Secrets, publish, permissions, and production actions stay human-owned. Each seed is 30–90 minutes, independently verifiable, and carries a version-bump classification.

Current release: **0.1.10** — npm [`pi-fff-non-ascii-guard`](https://www.npmjs.com/package/pi-fff-non-ascii-guard).

## What this extension does (shipped)

- **Session-start scan** — detects non-ASCII paths when a Pi session begins.
- **fff tool gate** — blocks `grep`, `find_files`, and `fff_multi_grep` while non-ASCII paths remain, preventing `fff-core` panics on UTF-8 byte boundaries.
- **`list_non_ascii_paths` tool** — list files and directories with non-ASCII path segments.
- **`sanitize_filenames` tool** — preview or execute safe ASCII-slug renames for files (non-ASCII directories are listed for manual rename).
- **Smart exclusions** — skips `.git`, `.obsidian`, `.pi`, `.claude`, `.scratch`, and `node_modules`.
- **Collision disambiguation** — slug collisions get automatic `-2`, `-3`, … suffixes.

## Phased goals

### Month 1 — Public quality & release hygiene

Close the remaining `pi-extension-template` compliance gaps so every merged, publishable change can actually reach npm and the supply chain is hardened.

- Pin third-party GitHub Actions to commit SHAs (currently floating `@v4`).
- ~~Add a `version:check` CI gate~~ **shipped** — `ci.yml` runs `npm run version:check` on pull requests.

### Month 2 — Stabilization

Make the panic-prevention guarantee robust as the surrounding tool surface evolves.

- Harden the fff tool gate against tool-name drift (the gated set is a hardcoded constant today).

### Month 3 — Speed & token efficiency

Keep the session-start scan cheap on large workspaces and reduce recurring token cost while non-ASCII paths exist.

- Add startup scan timing instrumentation to guide optimization.
- Reduce the recurring `before_agent_start` hint cost.

## Guard feature priorities (fff tool-gate coverage)

The extension's core guarantee is: **no fff-core-backed tool runs while a non-ASCII path exists.** Coverage today:

| fff-core-backed tool | Gated? |
|---|---|
| `grep` | ✅ (0.1.5) |
| `find_files` | ✅ (0.1.4) |
| `fff_multi_grep` | ✅ (0.1.4) |

Priority going forward: keep this list authoritative as Pi/fff-core evolve. The gated set (`FFF_TOOL_NAMES` in `lib/constants.ts`) is a hardcoded `Set`; a future fff-backed tool that is not added here would silently bypass the gate. Month 2 adds a drift guard so that gap is surfaced, not hidden.

## Edge-case testing strategy

The smoke tests in `tests/` cover slug conversion, collision disambiguation, and full-path (directory-segment) scanning. Planned edge-case coverage:

- ASCII-basename files that only sit under non-ASCII directories (already handled; keep a regression test).
- Rename targets that already exist on disk (already guarded; keep a regression test).
- Dry-run previews for unique renames, slug collisions, and already-existing first-choice destinations (covered in 0.1.8).
- Workspace-root (`cwd`) non-ASCII detection (already handled; keep a regression test).
- Slug suffix exhaustion / very large collision batches.
- Empty and deeply-nested non-ASCII directories (currently manual-rename only).

## Performance / speed roadmap

- `lib/scan-cache.ts` already memoizes the non-ASCII scan within a session.
- Month 3 adds timing instrumentation around `session_start` scan and cache reads, then evaluates incremental/ignored-path widening if the numbers justify it.

## Candidate maintenance seeds

Thin, independently verifiable work items (30–90 min) derived from the phases above. `Ready` = can be picked up automatically; `HITL` = needs a human design decision first.

| # | Seed | Phase | Bump | Blocked by | Ready |
|---|---|---|---|---|---|
| 03 | Pin GitHub Actions to commit SHAs | M1 public quality | none | — | ✅ |
| 04 | Add `version:check` CI gate | M1 public quality | none | — | ✅ shipped |
| 05 | Harden fff tool gate against tool-name drift | M2 stabilization | patch | — | ✅ |
| 06 | Add startup scan timing instrumentation | M3 speed | patch | — | ✅ |
| 07 | Auto-rename non-ASCII directories (with reference updates) | later (feature) | minor | — | ⛔ HITL |

Suggested order: M1 (03, 04) → M2 (05) → M3 (06). 07 is a feature that needs a design decision (collision handling and cross-file reference updates) before implementation starts.

## pi-extension-template compliance checklist

Status as of **0.1.10**. Baseline: [`pi-extension-template/Docs/pi-extension-oss-rules.md`](https://github.com/eiei114/pi-extension-template).

| Area | Status | Notes |
|---|---|---|
| README (minimal-docs policy, badges) | ✅ | Restructured in 0.1.2; all 7 badges present (CI, Publish, npm version, npm downloads, License, Pi Package, Trusted Publishing). |
| CHANGELOG (Keep a Changelog) | ✅ | Maintained through 0.1.10. |
| LICENSE (MIT) | ✅ | Present. |
| SECURITY.md | ✅ | Added in 0.1.6, linked from README. |
| `package.json` minimum (`files`, `pi.extensions`, metadata) | ✅ | `files` ships README, ROADMAP, CHANGELOG, LICENSE, SECURITY, `extensions`, `lib`. |
| CI workflow (`npm run check`) | ✅ | `ci.yml` runs typecheck + test + `npm pack --dry-run`. |
| `typecheck` script | ✅ | Added in 0.1.6. |
| npm publish (Trusted Publishing / provenance, no token) | ✅ | `publish.yml` uses OIDC (`id-token: write`), no `NPM_TOKEN`. |
| Release handoff (auto-release → publish) | ✅ | `auto-release.yml` dispatches `publish.yml` after tag (fixed in 0.1.3). |
| GitHub Actions pinned to SHAs | ❌ | Floating `@v4` in `ci.yml`, `auto-release.yml`, `publish.yml` → seed 03. |
| `version:check` CI gate | ✅ | `ci.yml` runs `npm run version:check` on pull requests (seed 04). |
| Resource-collision / template-generic naming | ✅ | Package and tool names are `pi-fff-non-ascii-guard`-specific. |

## Later (feature track)

After the maintenance direction (03–06):

- **Auto-rename non-ASCII directories** with collision handling and cross-file reference updates (seed 07, needs design).
- Follow upstream `fff-core` once the byte-boundary panic is fixed at the source.
- Slug-collision automatic suffix policy tuning.
- Vault-wide bulk `sanitize` workflow.
