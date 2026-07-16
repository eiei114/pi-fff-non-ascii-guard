import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, "..");

const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const roadmap = readFileSync(path.join(repoRoot, "ROADMAP.md"), "utf8");
const ci = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");

test("ROADMAP Current release matches package.json version", () => {
  const expected = `Current release: **${pkg.version}**`;
  assert.ok(roadmap.includes(expected), `ROADMAP missing "${expected}"`);
});

test("ROADMAP documents version:check CI gate as shipped", () => {
  assert.match(roadmap, /\| `version:check` CI gate \| ✅/);
  assert.match(ci, /npm run version:check/);
});
