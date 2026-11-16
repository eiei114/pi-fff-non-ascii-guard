import { resetBlockWarningState } from "./block-warning.ts";
import { SCAN_CACHE_TTL_MS } from "./constants.ts";
import type { NonAsciiEntry } from "./non-ascii-scan.ts";
import { scanNonAsciiPaths } from "./non-ascii-scan.ts";

let cached: { cwd: string; entries: NonAsciiEntry[]; cachedAt: number } | null =
  null;

/**
 * Serve the cached scan while it is within `SCAN_CACHE_TTL_MS`, otherwise re-scan.
 * The bounded window lets the fff gate notice manual renames (or new non-ASCII
 * paths) without a session restart, while still capping directory walks.
 * `now` is injectable so tests stay deterministic without fake timers.
 */
export function getNonAsciiEntries(
  cwd: string,
  now = Date.now()
): NonAsciiEntry[] {
  if (
    cached?.cwd === cwd &&
    now - cached.cachedAt < SCAN_CACHE_TTL_MS
  ) {
    return cached.entries;
  }
  const entries = scanNonAsciiPaths(cwd);
  cached = { cwd, entries, cachedAt: now };
  return entries;
}

export function invalidateNonAsciiCache(): void {
  cached = null;
  resetBlockWarningState();
}
