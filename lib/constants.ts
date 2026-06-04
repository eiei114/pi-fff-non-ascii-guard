export const EXCLUDE_DIRS = new Set([
  ".git",
  ".obsidian",
  "node_modules",
  ".pi",
  ".claude",
  ".scratch",
]);

/** Tools backed by fff-core that can panic on non-ASCII paths. */
export const FFF_TOOL_NAMES = new Set(["grep", "find_files", "fff_multi_grep"]);

/** Human-readable list for notifications and prompts. */
export function formatBlockedFffTools(): string {
  return [...FFF_TOOL_NAMES].sort().join(" / ");
}

export const MAX_BLOCK_LIST = 12;
