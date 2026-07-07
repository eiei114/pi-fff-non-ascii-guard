import { resetBlockWarningState } from "./block-warning.ts";
import type { NonAsciiEntry } from "./non-ascii-scan.ts";
import { scanNonAsciiPaths } from "./non-ascii-scan.ts";

let cached: { cwd: string; entries: NonAsciiEntry[] } | null = null;

export function getNonAsciiEntries(cwd: string): NonAsciiEntry[] {
  if (cached?.cwd === cwd) return cached.entries;
  const entries = scanNonAsciiPaths(cwd);
  cached = { cwd, entries };
  return entries;
}

export function invalidateNonAsciiCache(): void {
  cached = null;
  resetBlockWarningState();
}
