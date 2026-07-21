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
const autoRelease = readFileSync(path.join(repoRoot, ".github", "workflows", "auto-release.yml"), "utf8");
const publish = readFileSync(path.join(repoRoot, ".github", "workflows", "publish.yml"), "utf8");

const workflowFiles = [ci, autoRelease, publish];
const floatingActionRef = /uses:\s*actions\/(checkout|setup-node)@v\d/;

test("ROADMAP Current release matches package.json version", () => {
  const expected = `Current release: **${pkg.version}**`;
  assert.ok(roadmap.includes(expected), `ROADMAP missing "${expected}"`);
});

test("ROADMAP documents version:check CI gate as shipped", () => {
  assert.match(roadmap, /\| `version:check` CI gate \| ✅/);
  assert.match(ci, /npm run version:check/);
});

test("ROADMAP compliance checklist version matches package.json", () => {
  const expected = `Status as of **${pkg.version}**`;
  assert.ok(roadmap.includes(expected), `ROADMAP compliance checklist missing "${expected}"`);
});

test("ROADMAP documents GitHub Actions SHA pinning as shipped", () => {
  assert.match(roadmap, /\| GitHub Actions pinned to SHAs \| ✅/);
  assert.match(roadmap, /\| 03 \| Pin GitHub Actions to commit SHAs .*\| ✅ shipped \|/);
  for (const workflow of workflowFiles) {
    assert.doesNotMatch(workflow, floatingActionRef, "workflow still uses floating @v action refs");
    assert.match(workflow, /uses:\s*actions\/(checkout|setup-node)@[0-9a-f]{40}/);
  }
});
