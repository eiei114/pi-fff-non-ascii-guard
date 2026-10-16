import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, "..");
const workflowsDir = path.join(repoRoot, ".github", "workflows");

function topLevelTriggers(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^on:\s*/.test(line));
  if (start < 0) return [];

  const inlineValue = lines[start].replace(/^on:\s*/, "").replace(/\s+#.*$/, "").trim();
  if (inlineValue) {
    const values = inlineValue.startsWith("[") && inlineValue.endsWith("]")
      ? inlineValue.slice(1, -1).split(",")
      : [inlineValue];
    return values.map((value) => value.trim().replace(/^(['"])(.*?)\1$/, "$2")).filter(Boolean);
  }

  const triggers = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !/^\s/.test(line) && !line.trimStart().startsWith("#")) break;
    const match = /^ {2}([A-Za-z0-9_-]+):/.exec(line);
    if (match && !line.trimStart().startsWith("#")) triggers.push(match[1]);
  }
  return triggers;
}

function assertNoReleaseCapabilities(name, source) {
  const triggers = topLevelTriggers(source);
  assert.ok(!triggers.includes("workflow_dispatch"), `${name} must not contain a workflow_dispatch trigger`);
  assert.ok(!triggers.includes("release"), `${name} must not contain a GitHub release trigger`);

  const forbidden = [
    [/^\s*permissions\s*:\s*write-all\s*(?:#.*)?$/m, "write-all permissions"],
    [/^\s*(?:actions|contents)\s*:\s*write\s*$/m, "write-enabled GitHub token"],
    [/^\s*id-token\s*:\s*write\s*$/m, "OIDC token permission"],
    [/\bnpm\s+publish\b/i, "npm publication command"],
    [/\bgh\s+release\s+create\b/i, "GitHub release command"],
    [/\bgh\s+workflow\s+run\b/i, "workflow dispatch command"],
  ];

  for (const [pattern, description] of forbidden) {
    assert.doesNotMatch(source, pattern, `${name} must not contain ${description}`);
  }
}

test("active workflows have no release or publication path while external authorization is unavailable", () => {
  const files = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/i.test(name));
  assert.deepEqual(files, ["ci.yml"], "only the non-publishing CI workflow should be active");

  for (const file of files) {
    assertNoReleaseCapabilities(file, readFileSync(path.join(workflowsDir, file), "utf8"));
  }

  const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const roadmap = readFileSync(path.join(repoRoot, "ROADMAP.md"), "utf8");
  assert.match(readme, /Automated\s+release and npm publication are currently disabled/i);
  assert.match(readme, /trusted, protected release authorization boundary/i);
  assert.match(roadmap, /Release and publish workflows are disabled/i);
});

test("the former branch-dispatch release and OIDC publish entry points fail the hold contract", () => {
  const formerRelease = `
on:
  workflow_dispatch:
permissions:
  actions: write
  contents: write
jobs:
  release:
    if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'
    steps:
      - run: gh release create "$TAG"
      - run: gh workflow run publish.yml --ref "$TAG"
`;
  const formerPublish = `
on:
  push:
    tags: ['v*.*.*']
  workflow_dispatch:
permissions:
  contents: read
  id-token: write
jobs:
  publish:
    steps:
      - run: npm publish --access public
`;

  assert.throws(() => assertNoReleaseCapabilities("former auto-release.yml", formerRelease), /workflow_dispatch trigger/);
  assert.throws(
    () => assertNoReleaseCapabilities("former auto-release.yml", formerRelease.replace("  workflow_dispatch:\n", "")),
    /write-enabled GitHub token/,
  );
  assert.throws(() => assertNoReleaseCapabilities("former publish.yml", formerPublish), /workflow_dispatch trigger/);

  const publishWithoutDispatch = formerPublish.replace("  workflow_dispatch:\n", "");
  assert.throws(
    () => assertNoReleaseCapabilities("former publish.yml", publishWithoutDispatch),
    /OIDC token permission/,
  );
  const publishWithoutDispatchOrOidc = publishWithoutDispatch.replace("  id-token: write\n", "");
  assert.throws(
    () => assertNoReleaseCapabilities("former publish.yml", publishWithoutDispatchOrOidc),
    /npm publication command/,
  );
});

test("inline workflow triggers and write-all permissions fail the hold contract", () => {
  assert.throws(
    () => assertNoReleaseCapabilities("inline scalar trigger", "on: workflow_dispatch\npermissions:\n  contents: read\n"),
    /workflow_dispatch trigger/,
  );
  assert.throws(
    () => assertNoReleaseCapabilities("inline list trigger", "on: [push, workflow_dispatch]\npermissions:\n  contents: read\n"),
    /workflow_dispatch trigger/,
  );
  assert.throws(
    () => assertNoReleaseCapabilities("write-all permissions", "on:\n  push:\n    branches: [main]\npermissions: write-all\njobs:\n  validate:\n    runs-on: ubuntu-latest\n"),
    /write-all permissions/,
  );
});
