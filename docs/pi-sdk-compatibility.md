# Pi SDK 1.5.0 compatibility

This package is verified against the frozen Pi SDK wave:

- `@earendil-works/pi-agent-core`: `1.5.0`
- `@earendil-works/pi-ai`: `1.5.0`
- `@earendil-works/pi-coding-agent`: `1.5.0`
- `@earendil-works/pi-tui`: `1.5.0`

The package keeps its existing wildcard peer ranges for
`@earendil-works/pi-coding-agent` and `typebox`. Exact SDK versions are
development/test pins only. `typebox` remains pinned to `1.3.27` for
reproducible typechecking.

## Extension APIs exercised

`extensions/pi-fff-non-ascii-guard.ts` uses the `ExtensionAPI` and
`ExtensionContext` types, `session_start`, `before_agent_start`, and `tool_call`
event handlers, `ctx.ui.notify`, TypeBox object/optional schemas, and
`pi.registerTool()` with asynchronous `execute()` handlers. These signatures
typecheck against SDK 1.5.0 and run in its actual host.

## Migration notes from 1.2.0

Pi 1.5.0 validates tool arguments with `@earendil-works/pi-schema` instead of
TypeBox, so TypeBox features outside JSON Schema (`Type.Refine()`,
`Type.BigInt()`, `Type.Undefined()`, codecs, `Format.Set()`) no longer apply to
tool parameters. Both tool schemas here stay inside JSON Schema:
`Type.Object({})` for `list_non_ascii_paths`, and
`Type.Object({ dryRun: Type.Optional(Type.Boolean({ default: true })) })` for
`sanitize_filenames`. No code migration is required; `params.dryRun !== false`
keeps working because the JSON Schema default is unchanged.

Pi 1.2.0 changed `before_agent_start` events to a `messageType` union: user
events carry `prompt` and `images`, while custom events carry `message` instead
of `prompt`. Handlers that read user-only fields must narrow on
`event.messageType === "user"`. This extension only reads the shared
`systemPrompt`, so that change also requires no code migration. The same
release changed startup-session busy semantics (`ctx.isIdle()` is false and
`sendUserMessage()` requires `deliverAs`); this extension does not call those
APIs from startup handlers. See the
[Pi v1.2.0 release notes](https://github.com/earendil-works/pi/releases/tag/v1.2.0).

Pi 1.5.0 also exposes each package's changelog to installed hosts
(`CHANGELOG.md` in the package root), which is why this package keeps that file
in `files`. No code change is required for it.

## Verification harness

The smoke harness starts the installed Pi 1.5.0 CLI in isolated RPC processes,
loads the real package extension and invokes its actual tools. A deterministic
offline faux provider supplies reproducible tool calls; it does not replace the
Pi loader, extension lifecycle, tool execution, guard behavior, or filesystem
feature paths. Provider inference and paid model requests are outside this
package's compatibility contract. All profile and session state is isolated
from global Pi settings.

Run `npm run smoke:pi` for the actual host checks. `npm run check` and CI execute
the same harness as well as typechecking, focused regression tests, and pack
dry-run.
