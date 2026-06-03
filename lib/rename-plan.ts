import * as path from "node:path";
import { toAsciiSlug } from "./ascii-slug.ts";
import type { NonAsciiEntry } from "./non-ascii-scan.ts";

export interface PlannedRename {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
}

function disambiguateTarget(basePath: string, used: Set<string>): string {
  if (!used.has(basePath)) {
    used.add(basePath);
    return basePath;
  }
  const ext = path.extname(basePath);
  const stem = ext.length > 0 ? basePath.slice(0, -ext.length) : basePath;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Could not disambiguate target path: ${basePath}`);
}

export function buildRenamePlan(entries: NonAsciiEntry[]): {
  renames: PlannedRename[];
  collisions: [string, string[]][];
} {
  const files = entries
    .filter((e) => e.kind === "file")
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const baseTargets = new Map<string, string[]>();
  const renames: PlannedRename[] = [];
  const usedTargets = new Set<string>();

  for (const e of files) {
    const slug = toAsciiSlug(e.basename);
    const baseName = slug + e.ext;
    const basePath = e.dir === "." ? baseName : e.dir + "/" + baseName;
    const sources = baseTargets.get(basePath) || [];
    sources.push(e.relativePath);
    baseTargets.set(basePath, sources);

    const newPath = disambiguateTarget(basePath, usedTargets);
    renames.push({
      oldPath: e.relativePath,
      newPath,
      oldName: path.basename(e.relativePath),
      newName: path.basename(newPath),
    });
  }

  const collisions = [...baseTargets.entries()].filter(([, v]) => v.length > 1);
  return { renames, collisions };
}
