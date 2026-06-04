import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const { FFF_TOOL_NAMES, formatBlockedFffTools } = await import(
  pathToFileURL(path.join(root, "..", "lib", "constants.ts")).href
);

test("FFF_TOOL_NAMES includes grep (fff-core content search)", () => {
  assert.equal(FFF_TOOL_NAMES.has("grep"), true);
  assert.equal(FFF_TOOL_NAMES.has("find_files"), true);
  assert.equal(FFF_TOOL_NAMES.has("fff_multi_grep"), true);
});

test("formatBlockedFffTools lists all gated tools", () => {
  const formatted = formatBlockedFffTools();
  for (const name of FFF_TOOL_NAMES) {
    assert.ok(formatted.includes(name), `expected ${name} in ${formatted}`);
  }
});
