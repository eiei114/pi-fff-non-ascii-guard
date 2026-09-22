import {
  classifyFffToolGate,
  formatBlockedFffTools,
  MAX_DETAILED_EXAMPLES,
  type FffToolGate,
} from "./constants.ts";
import { formatEntryList, type NonAsciiEntry } from "./non-ascii-scan.ts";

export const REMEDIATION_HINT =
  "Fix: list_non_ascii_paths / sanitize_filenames(dryRun=true)";

let lastPathSetKey: string | null = null;
let detailedShownForKey: string | null = null;

export function pathSetKey(entries: NonAsciiEntry[]): string {
  return entries
    .map((e) => e.relativePath)
    .sort()
    .join("\0");
}

export function resetBlockWarningState(): void {
  lastPathSetKey = null;
  detailedShownForKey = null;
}

export function formatDetailedBlockReason(
  toolName: string,
  entries: NonAsciiEntry[]
): string {
  return (
    `Blocked ${toolName}: ${entries.length} non-ASCII path(s) in workspace (fff-core may panic on UTF-8 byte boundaries).\n` +
    formatEntryList(entries, MAX_DETAILED_EXAMPLES) +
    `\n\n${REMEDIATION_HINT}`
  );
}

export function formatCompactBlockReason(
  toolName: string,
  entries: NonAsciiEntry[],
  gate: FffToolGate = classifyFffToolGate(toolName)
): string {
  const prefixNote = gate === "prefix"
    ? ` (unknown fff_* tool; conservatively blocked)`
    : "";
  return (
    `Blocked ${toolName}${prefixNote}: ${entries.length} non-ASCII path(s) still block ${formatBlockedFffTools()}. ` +
    REMEDIATION_HINT
  );
}

/** First block for a path set is detailed; repeats collapse until the set changes. */
export function formatBlockedToolReason(
  toolName: string,
  entries: NonAsciiEntry[],
  gate: FffToolGate = classifyFffToolGate(toolName)
): string {
  const key = pathSetKey(entries);
  if (key !== lastPathSetKey) {
    lastPathSetKey = key;
    detailedShownForKey = null;
  }

  if (detailedShownForKey !== key) {
    detailedShownForKey = key;
    if (gate === "prefix") {
      return (
        `Blocked ${toolName}: unknown fff_* tool conservatively blocked while ` +
        `${entries.length} non-ASCII path(s) remain (fff-core may panic on UTF-8 byte boundaries).\n` +
        `${formatEntryList(entries, MAX_DETAILED_EXAMPLES)}\n\n${REMEDIATION_HINT}`
      );
    }
    return formatDetailedBlockReason(toolName, entries);
  }

  return formatCompactBlockReason(toolName, entries, gate);
}
