import * as fs from "node:fs";
import * as path from "node:path";
import { toAsciiSlug } from "./ascii-slug.ts";
import { filterNonAsciiFiles, type NonAsciiEntry } from "./non-ascii-scan.ts";

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

function isTargetTaken(
  relPath: string,
  used: Set<string>,
  cwd: string,
  targetKey: (target: string) => string
): boolean {
  if (isWindowsReservedDeviceTarget(relPath)) return true;
  if (used.has(targetKey(relPath))) return true;
  return fs.existsSync(path.resolve(cwd, relPath));
}

function isWindowsReservedDeviceTarget(relPath: string): boolean {
  const basename = path.posix.basename(relPath);
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(basename);
}

function addNumericSuffix(targetPath: string, n: number): string {
  if (isWindowsReservedDeviceTarget(targetPath)) {
    const basenameStart = targetPath.lastIndexOf("/") + 1;
    const firstDot = targetPath.indexOf(".", basenameStart);
    const suffixAt = firstDot === -1 ? targetPath.length : firstDot;
    return `${targetPath.slice(0, suffixAt)}-${n}${targetPath.slice(suffixAt)}`;
  }

  const ext = path.extname(targetPath);
  const stem = ext.length > 0 ? targetPath.slice(0, -ext.length) : targetPath;
  return `${stem}-${n}${ext}`;
}

function disambiguateTarget(
  basePath: string,
  used: Set<string>,
  cwd: string,
  targetKey: (target: string) => string
): string {
  if (!isTargetTaken(basePath, used, cwd, targetKey)) return basePath;
  for (let n = 2; n < 10_000; n++) {
    const candidate = addNumericSuffix(basePath, n);
    if (!isTargetTaken(candidate, used, cwd, targetKey)) return candidate;
  }
  throw new Error(`Could not disambiguate target path: ${basePath}`);
}

function windowsTargetKey(target: string): string {
  // Fold characters independently: lowercasing a whole path can turn Σ into
  // final sigma (ς) after a cased stem, missing a collision with σ.
  return Array.from(target, (char) => {
    const lower = char.toLowerCase();
    return lower.length === char.length ? lower : char;
  }).join("");
}

export function buildRenamePlan(
  entries: NonAsciiEntry[],
  cwd: string,
  platform = process.platform
): RenamePlan {
  const files = filterNonAsciiFiles(entries).sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath)
  );

  // Fold only the comparison keys; keep the original case for I/O and reports.
  const targetKey = platform === "win32" ? windowsTargetKey : (target: string) => target;
  const baseTargets = new Map<string, [targetPath: string, sourcePaths: string[]]>();
  const renames: PlannedRename[] = [];
  const usedTargets = new Set<string>();

  for (const e of files) {
    const slug = toAsciiSlug(e.basename);
    const baseName = slug + e.ext;
    const basePath = e.dir === "." ? baseName : e.dir + "/" + baseName;
    const key = targetKey(basePath);
    const group = baseTargets.get(key);
    if (group) {
      group[1].push(e.relativePath);
    } else {
      baseTargets.set(key, [basePath, [e.relativePath]]);
    }

    const newPath = disambiguateTarget(basePath, usedTargets, cwd, targetKey);
    usedTargets.add(targetKey(newPath));
    renames.push({
      oldPath: e.relativePath,
      newPath,
      oldName: path.basename(e.relativePath),
      newName: path.basename(newPath),
    });
  }

  const collisions = [...baseTargets.values()].filter(([, sources]) => sources.length > 1);
  const existingDestinations = [...baseTargets.values()]
    .filter(
      ([targetPath]) =>
        !isWindowsReservedDeviceTarget(targetPath) &&
        fs.existsSync(path.resolve(cwd, targetPath))
    )
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
