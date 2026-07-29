import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, "..");

const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const changelog = readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf8");
const escapedVersion = pkg.version.replace(/\./g, "\\.");

test("CHANGELOG has a released section for the current package version", () => {
  const heading = `## [${pkg.version}]`;
  assert.match(
    changelog,
    new RegExp(`^## \\[${escapedVersion}\\].*$`, "m"),
    `CHANGELOG missing released section heading "${heading}"`,
  );
});

test("CHANGELOG Unreleased does not keep a pending bump for the current version", () => {
  const unreleasedMatch = changelog.match(/^## Unreleased\r?\n([\s\S]*?)(?=^## \[|$)/m);
  assert.ok(unreleasedMatch, "CHANGELOG missing the Unreleased section");
  const unreleased = unreleasedMatch[1];
  const pendingBump = new RegExp(
    `Bump package version to \`${escapedVersion}\``,
  );
  assert.equal(
    pendingBump.test(unreleased),
    false,
    `Unreleased still documents a pending bump to the already-released ${pkg.version}`,
  );
});
