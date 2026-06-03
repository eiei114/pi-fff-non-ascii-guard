import * as fs from "node:fs";
import * as path from "node:path";
import { EXCLUDE_DIRS } from "./constants.ts";

export function hasNonAscii(s: string): boolean {
  return /[^\x00-\x7F]/.test(s);
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

export function scanNonAsciiPaths(cwd: string): NonAsciiEntry[] {
  const results: NonAsciiEntry[] = [];
  const seen = new Set<string>();

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
      const relativePath = toPosix(path.relative(cwd, fullPath));

      if (!hasNonAscii(relativePath)) {
        if (entry.isDirectory()) walk(fullPath);
        continue;
      }

      if (entry.isDirectory()) {
        record(relativePath, "directory");
        walk(fullPath);
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
