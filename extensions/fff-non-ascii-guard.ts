import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

const EXCLUDE_DIRS = new Set([
  ".git",
  ".obsidian",
  "node_modules",
  ".pi",
  ".claude",
  ".scratch",
]);

function hasNonAscii(s: string): boolean {
  return /[^\x00-\x7F]/.test(s);
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

interface NonAsciiEntry {
  relativePath: string;
  dir: string;
  basename: string;
  ext: string;
}

function scanNonAsciiFiles(cwd: string): NonAsciiEntry[] {
  const results: NonAsciiEntry[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && hasNonAscii(entry.name)) {
        const relativePath = toPosix(path.relative(cwd, fullPath));
        results.push({
          relativePath,
          dir: toPosix(path.dirname(relativePath)),
          basename: path.basename(entry.name, path.extname(entry.name)),
          ext: path.extname(entry.name),
        });
      }
    }
  }

  walk(cwd);
  return results;
}

function toAsciiSlug(name: string): string {
  const slug = name
    .replace(/[\uff01-\uff5e]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug.length > 0 ? slug : "non-ascii-file";
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const entries = scanNonAsciiFiles(ctx.cwd);

    if (entries.length > 0) {
      const filelist = entries.map((e) => "  - " + e.relativePath).join("\n");
      ctx.ui.notify(
        "Warning: " + entries.length + " non-ASCII filename(s) detected (fff-core may panic):\n" +
          filelist + "\n\nLLM can call `sanitize_filenames` to fix.",
        "warn"
      );
    }
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
      const entries = scanNonAsciiFiles(ctx.cwd);

      if (entries.length === 0) {
        return {
          content: [
            { type: "text", text: "No non-ASCII filenames found. All clear!" },
          ],
          details: { scanned: true, count: 0 },
        };
      }

      const renames = entries.map((e) => {
        const slug = toAsciiSlug(e.basename);
        const newName = slug + e.ext;
        const newPath = e.dir === "." ? newName : e.dir + "/" + newName;
        return {
          oldPath: e.relativePath,
          newPath,
          oldName: path.basename(e.relativePath),
          newName,
        };
      });

      // Check for target collisions
      const targets = new Map<string, string[]>();
      for (const r of renames) {
        const arr = targets.get(r.newPath) || [];
        arr.push(r.oldPath);
        targets.set(r.newPath, arr);
      }
      const collisions = [...targets.entries()].filter(([, v]) => v.length > 1);

      if (collisions.length > 0) {
        const collisionList = collisions
          .map(([target, sources]) => "  " + target + " <- " + sources.join(", "))
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: "Cannot auto-rename: target filename collisions detected:\n" + collisionList + "\n\nResolve manually.",
            },
          ],
          details: { error: "collisions", collisions },
          isError: true,
        };
      }

      if (params.dryRun !== false) {
        const preview = renames
          .map((r) => "  " + r.oldName + " -> " + r.newName)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: "Dry run -- " + renames.length + " file(s) to rename:\n" + preview + "\n\nCall with dryRun: false to execute.",
            },
          ],
          details: { dryRun: true, renames },
        };
      }

      // Execute renames
      const results: { oldPath: string; newPath: string; status: string; error?: string }[] = [];

      for (const r of renames) {
        try {
          const oldFull = path.resolve(ctx.cwd, r.oldPath);
          const newFull = path.resolve(ctx.cwd, r.newPath);
          fs.renameSync(oldFull, newFull);
          results.push({ oldPath: r.oldPath, newPath: r.newPath, status: "ok" });
        } catch (err: any) {
          results.push({ oldPath: r.oldPath, newPath: r.newPath, status: "error", error: err.message });
        }
      }

      const ok = results.filter((r) => r.status === "ok");
      const errors = results.filter((r) => r.status === "error");

      let text = "Renamed " + ok.length + " file(s).";
      if (errors.length > 0) {
        text += "\n" + errors.length + " error(s):\n" +
          errors.map((e) => "  " + e.oldPath + ": " + e.error).join("\n");
      }

      return {
        content: [{ type: "text", text }],
        details: { renamed: ok.length, errors: errors.length, results },
      };
    },
  });
}

