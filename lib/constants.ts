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

export type FffToolGate = "known" | "prefix" | null;

/**
 * Classify fff-backed tools without requiring a fragile, exhaustive inventory.
 * Unknown fff_* names are conservatively guarded for forward compatibility.
 */
export function classifyFffToolGate(toolName: string): FffToolGate {
  if (FFF_TOOL_NAMES.has(toolName)) return "known";
  if (toolName.startsWith("fff_")) return "prefix";
  return null;
}

/** Human-readable list for notifications and prompts. */
export function formatBlockedFffTools(): string {
  return [...FFF_TOOL_NAMES].sort().join(" / ");
}

/** Max path examples in a detailed fff tool block warning. */
export const MAX_DETAILED_EXAMPLES = 2;

export const MAX_BLOCK_LIST = 12;
