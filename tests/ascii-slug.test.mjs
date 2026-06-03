import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const { toAsciiSlug } = await import(
  pathToFileURL(path.join(root, "..", "lib", "ascii-slug.ts")).href
);

test("toAsciiSlug returns fallback for empty result", () => {
  assert.equal(toAsciiSlug("あいう"), "non-ascii-file");
});
