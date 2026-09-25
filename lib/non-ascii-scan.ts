import * as fs from "node:fs";
import * as path from "node:path";
import { EXCLUDE_DIRS } from "./constants.ts";

export function hasNonAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return true;
  }
  return false;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export type NonAsciiKind = "file" | "directory";

export interface NonAsciiEntry {
  relativePath: string;
  kind: NonAsciiKind;
  dir: string;
  basename: string;
  ext: string;
}

/** True when sanitize_filenames would change this file's basename. */
export function isRenamableFile(entry: NonAsciiEntry): boolean {
  return entry.kind === "file" && hasNonAscii(entry.basename + entry.ext);
}

export function filterNonAsciiFiles(entries: NonAsciiEntry[]): NonAsciiEntry[] {
  return entries.filter((e) => e.kind === "file");
}

export function filterNonAsciiDirectories(
  entries: NonAsciiEntry[]
): NonAsciiEntry[] {
  return entries.filter((e) => e.kind === "directory");
}

export function countNonAsciiByKind(entries: NonAsciiEntry[]): {
  files: number;
  dirs: number;
  total: number;
} {
  let files = 0;
  for (const entry of entries) {
    if (entry.kind === "file") files++;
  }
  return { files, dirs: entries.length - files, total: entries.length };
}

export function scanNonAsciiPaths(cwd: string): NonAsciiEntry[] {
  const results: NonAsciiEntry[] = [];
  const seen = new Set<string>();
  const cwdHasNonAscii = hasNonAscii(toPosix(cwd));

  if (cwdHasNonAscii) {
    record(".", "directory");
  }

  function record(relativePath: string, kind: NonAsciiKind) {
    if (seen.has(relativePath)) return;
    seen.add(relativePath);
    const basename = path.basename(relativePath);
    results.push({
      relativePath,
      kind,
      dir: toPosix(path.dirname(relativePath)),
      basename: path.basename(basename, path.extname(basename)),
      ext: path.extname(basename),
    });
  }

  function walk(
    dir: string,
    relativeDir = "",
    inNonAsciiSubtree = cwdHasNonAscii
  ) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const flagged = inNonAsciiSubtree || hasNonAscii(entry.name);

      if (!flagged) {
        if (entry.isDirectory()) {
          const childRelativeDir = relativeDir
            ? `${relativeDir}/${entry.name}`
            : entry.name;
          walk(fullPath, childRelativeDir, false);
        }
        continue;
      }

      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        record(relativePath, "directory");
        walk(fullPath, relativePath, true);
      } else if (entry.isFile()) {
        record(relativePath, "file");
      }
    }
  }

  walk(cwd);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

export function formatEntryList(entries: NonAsciiEntry[], max = 12): string {
  const shown = entries.slice(0, max);
  const lines = shown.map((e) => `  - ${e.relativePath} (${e.kind})`);
  if (entries.length > max) {
    lines.push(`  ... and ${entries.length - max} more`);
  }
  return lines.join("\n");
}
