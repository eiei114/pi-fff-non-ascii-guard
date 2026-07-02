import * as fs from "node:fs";
import * as path from "node:path";
import { toAsciiSlug } from "./ascii-slug.ts";
import type { NonAsciiEntry } from "./non-ascii-scan.ts";

export interface PlannedRename {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
}

export interface ExistingDestinationConflict {
  targetPath: string;
  sourcePaths: string[];
}

export type RenamePlanConflict =
  | {
      type: "slug_collision";
      targetPath: string;
      sourcePaths: string[];
    }
  | {
      type: "existing_destination";
      targetPath: string;
      sourcePaths: string[];
    };

export interface RenamePlan {
  renames: PlannedRename[];
  collisions: [string, string[]][];
  existingDestinations: ExistingDestinationConflict[];
  conflicts: RenamePlanConflict[];
}

function isTargetTaken(relPath: string, used: Set<string>, cwd: string): boolean {
  if (used.has(relPath)) return true;
  return fs.existsSync(path.resolve(cwd, relPath));
}

function disambiguateTarget(
  basePath: string,
  used: Set<string>,
  cwd: string
): string {
  if (!isTargetTaken(basePath, used, cwd)) {
    used.add(basePath);
    return basePath;
  }
  const ext = path.extname(basePath);
  const stem = ext.length > 0 ? basePath.slice(0, -ext.length) : basePath;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!isTargetTaken(candidate, used, cwd)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Could not disambiguate target path: ${basePath}`);
}

export function buildRenamePlan(
  entries: NonAsciiEntry[],
  cwd: string
): RenamePlan {
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

    const newPath = disambiguateTarget(basePath, usedTargets, cwd);
    renames.push({
      oldPath: e.relativePath,
      newPath,
      oldName: path.basename(e.relativePath),
      newName: path.basename(newPath),
    });
  }

  const collisions = [...baseTargets.entries()].filter(([, v]) => v.length > 1);
  const existingDestinations = [...baseTargets.entries()]
    .filter(([targetPath]) => fs.existsSync(path.resolve(cwd, targetPath)))
    .map(([targetPath, sourcePaths]) => ({ targetPath, sourcePaths }));
  const conflicts: RenamePlanConflict[] = [
    ...collisions.map(([targetPath, sourcePaths]) => ({
      type: "slug_collision" as const,
      targetPath,
      sourcePaths,
    })),
    ...existingDestinations.map(({ targetPath, sourcePaths }) => ({
      type: "existing_destination" as const,
      targetPath,
      sourcePaths,
    })),
  ];

  return { renames, collisions, existingDestinations, conflicts };
}

function plannedTargetsForSources(
  renames: PlannedRename[],
  sourcePaths: string[]
): string[] {
  const sourceSet = new Set(sourcePaths);
  return renames
    .filter((r) => sourceSet.has(r.oldPath))
    .map((r) => r.newPath);
}

export function formatRenamePlanReport(plan: RenamePlan): string {
  const preview = plan.renames
    .map((r) => "  " + r.oldPath + " -> " + r.newPath)
    .join("\n");
  let text =
    "Dry run -- " +
    plan.renames.length +
    " file(s) to rename:\n" +
    preview +
    "\n\nNo filesystem changes made.";

  if (plan.conflicts.length > 0) {
    const conflictList = plan.conflicts
      .map((conflict) => {
        const planned = plannedTargetsForSources(plan.renames, conflict.sourcePaths);
        const plannedText = planned.length > 0 ? "; planned: " + planned.join(", ") : "";
        if (conflict.type === "slug_collision") {
          return (
            "  [slug collision] " +
            conflict.targetPath +
            " <- " +
            conflict.sourcePaths.join(", ") +
            plannedText
          );
        }
        return (
          "  [existing destination] " +
          conflict.targetPath +
          " already exists <- " +
          conflict.sourcePaths.join(", ") +
          plannedText
        );
      })
      .join("\n");
    text +=
      "\n\nConflict preview (auto-suffixed -2, -3, ... when needed):\n" +
      conflictList;
  }

  text += "\n\nCall with dryRun: false to execute.";
  return text;
}
