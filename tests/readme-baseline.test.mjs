import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, "..");

const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");

test("README package contents lists every npm-packaged markdown doc", () => {
  const treeMatch = readme.match(/^## Package contents\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  assert.ok(treeMatch, "README missing Package contents section");
  const tree = treeMatch[1];
  const markdownFiles = (pkg.files ?? []).filter((entry) => entry.endsWith(".md"));
  for (const file of markdownFiles) {
    const name = file.replace(/^\.\//, "");
    assert.ok(
      tree.includes(name),
      `README package contents tree missing shipped markdown file "${name}"`,
    );
  }
});

test("README Development section documents version:check CI guard", () => {
  const devSection = readme.match(/^## Development\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  assert.ok(devSection, "README missing Development section");
  assert.match(
    devSection[1],
    /BASE_REF=origin\/main npm run version:check/,
    "Development section should document the complete BASE_REF=origin/main version check command for PR authors",
  );
});
