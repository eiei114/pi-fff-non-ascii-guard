import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { FFF_TOOL_NAMES, formatBlockedFffTools, MAX_BLOCK_LIST } from "../lib/constants.ts";
import { buildRenamePlan } from "../lib/rename-plan.ts";
import {
  formatEntryList,
  isRenamableFile,
  scanNonAsciiPaths,
  type NonAsciiEntry,
} from "../lib/non-ascii-scan.ts";
import { getNonAsciiEntries, invalidateNonAsciiCache } from "../lib/scan-cache.ts";

function blockReason(toolName: string, entries: NonAsciiEntry[]): string {
  return (
    `Blocked ${toolName}: ${entries.length} non-ASCII path(s) in workspace (fff-core may panic on UTF-8 byte boundaries).\n` +
    formatEntryList(entries, MAX_BLOCK_LIST) +
    "\n\nFix: call sanitize_filenames with dryRun:true, review, then dryRun:false."
  );
}

function notifyNonAscii(ctx: { cwd: string; ui: { notify: (msg: string, level: string) => void } }) {
  const entries = getNonAsciiEntries(ctx.cwd);
  if (entries.length === 0) return;

  ctx.ui.notify(
    "Warning: " +
      entries.length +
      " non-ASCII path(s) detected (fff-core may panic). " +
      formatBlockedFffTools() +
      " are blocked until fixed.\n" +
      formatEntryList(entries, MAX_BLOCK_LIST) +
      "\n\nLLM: call sanitize_filenames to rename files.",
    "warn"
  );
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    invalidateNonAsciiCache();
    notifyNonAscii(ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    const entries = getNonAsciiEntries(ctx.cwd);
    if (entries.length === 0) return;

    const fileCount = entries.filter((e) => e.kind === "file").length;
    const dirCount = entries.length - fileCount;

    return {
      systemPrompt:
        _event.systemPrompt +
        "\n\n[pi-fff-non-ascii-guard] This workspace has " +
        entries.length +
        " non-ASCII path(s) (" +
        fileCount +
        " file(s), " +
        dirCount +
        " dir(s)). fff tools " +
        formatBlockedFffTools() +
        " are blocked until sanitize_filenames fixes renamable files. Do not retry blocked fff searches.",
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!FFF_TOOL_NAMES.has(event.toolName)) return;

    const entries = getNonAsciiEntries(ctx.cwd);
    if (entries.length === 0) return;

    return { block: true, reason: blockReason(event.toolName, entries) };
  });

  pi.registerTool({
    name: "list_non_ascii_paths",
    label: "List Non-ASCII Paths",
    description:
      "List files and directories whose path contains non-ASCII characters (fff-core panic risk).",
    promptSnippet: "List non-ASCII paths in the workspace",
    promptGuidelines: [
      "Use list_non_ascii_paths to inspect fff-core risk paths before renaming.",
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      invalidateNonAsciiCache();
      const entries = scanNonAsciiPaths(ctx.cwd);

      if (entries.length === 0) {
        return {
          content: [{ type: "text", text: "No non-ASCII paths found. All clear!" }],
          details: { count: 0 },
        };
      }

      const files = entries.filter((e) => e.kind === "file").length;
      const dirs = entries.length - files;

      return {
        content: [
          {
            type: "text",
            text:
              entries.length +
              " non-ASCII path(s): " +
              files +
              " file(s), " +
              dirs +
              " dir(s).\n" +
              formatEntryList(entries) +
              "\n\nRenamable files: sanitize_filenames. Non-empty non-ASCII dirs must be renamed manually.",
          },
        ],
        details: { count: entries.length, files, dirs, entries },
      };
    },
  });

  pi.registerTool({
    name: "sanitize_filenames",
    label: "Sanitize Filenames",
    description:
      "Rename non-ASCII files to ASCII slugs to prevent fff-core panics. " +
      "Scans the project, shows a preview of renames, and renames files.",
    promptSnippet: "Rename non-ASCII filenames to ASCII slugs",
    promptGuidelines: [
      "Use sanitize_filenames when non-ASCII filenames are detected or when fff-core panics occur.",
      formatBlockedFffTools() + " stay blocked until renamable files are fixed.",
    ],
    parameters: Type.Object({
      dryRun: Type.Optional(
        Type.Boolean({
          default: true,
          description: "Preview renames without executing (default: true)",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      invalidateNonAsciiCache();
      const entries = scanNonAsciiPaths(ctx.cwd);
      const files = entries.filter(isRenamableFile);

      if (files.length === 0) {
        const dirs = entries.filter((e) => e.kind === "directory");
        if (dirs.length > 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "No renamable non-ASCII files. " +
                  dirs.length +
                  " non-ASCII director(ies) remain — rename manually:\n" +
                  formatEntryList(dirs),
              },
            ],
            details: { scanned: true, fileCount: 0, dirCount: dirs.length },
          };
        }
        return {
          content: [
            { type: "text", text: "No non-ASCII paths found. All clear!" },
          ],
          details: { scanned: true, count: 0 },
        };
      }

      const { renames, collisions } = buildRenamePlan(files, ctx.cwd);

      if (params.dryRun !== false) {
        const preview = renames
          .map((r) => "  " + r.oldName + " -> " + r.newName)
          .join("\n");
        let text =
          "Dry run -- " +
          renames.length +
          " file(s) to rename:\n" +
          preview +
          "\n\nCall with dryRun: false to execute.";
        if (collisions.length > 0) {
          const collisionList = collisions
            .map(([target, sources]) => "  " + target + " <- " + sources.join(", "))
            .join("\n");
          text +=
            "\n\nSlug collisions (auto-suffixed -2, -3, ...):\n" + collisionList;
        }
        return {
          content: [{ type: "text", text }],
          details: { dryRun: true, renames, collisions },
        };
      }

      const results: {
        oldPath: string;
        newPath: string;
        status: string;
        error?: string;
      }[] = [];

      for (const r of renames) {
        try {
          const oldFull = path.resolve(ctx.cwd, r.oldPath);
          const newFull = path.resolve(ctx.cwd, r.newPath);
          fs.renameSync(oldFull, newFull);
          results.push({ oldPath: r.oldPath, newPath: r.newPath, status: "ok" });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({
            oldPath: r.oldPath,
            newPath: r.newPath,
            status: "error",
            error: message,
          });
        }
      }

      invalidateNonAsciiCache();

      const ok = results.filter((r) => r.status === "ok");
      const errors = results.filter((r) => r.status === "error");
      const remaining = getNonAsciiEntries(ctx.cwd);

      let text = "Renamed " + ok.length + " file(s).";
      if (errors.length > 0) {
        text +=
          "\n" +
          errors.length +
          " error(s):\n" +
          errors.map((e) => "  " + e.oldPath + ": " + e.error).join("\n");
      }
      if (remaining.length > 0) {
        text +=
          "\n\n" +
          remaining.length +
          " non-ASCII path(s) still remain (dirs or new files). fff tools stay blocked:\n" +
          formatEntryList(remaining, MAX_BLOCK_LIST);
      } else {
        text += "\n\nAll paths ASCII-safe. " + formatBlockedFffTools() + " unblocked.";
      }

      return {
        content: [{ type: "text", text }],
        details: {
          renamed: ok.length,
          errors: errors.length,
          remaining: remaining.length,
          results,
        },
      };
    },
  });
}
