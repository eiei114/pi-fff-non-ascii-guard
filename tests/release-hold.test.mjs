import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, "..");
const workflowsDir = path.join(repoRoot, ".github", "workflows");

function workflow(name) {
  return readFileSync(path.join(workflowsDir, name), "utf8");
}

function topLevelTriggers(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^on:\s*/.test(line));
  if (start < 0) return [];

  const inlineValue = lines[start].replace(/^on:\s*/, "").replace(/\s+#.*$/, "").trim();
  if (inlineValue) {
    if (inlineValue.startsWith("{")) {
      throw new Error("unsupported inline flow mapping for workflow triggers");
    }
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

// ---------------------------------------------------------------------------
// Release authorization contract
//
// Publication must never be a merge side effect. Each barrier below is required
// independently: removing any one of them reopens an unauthenticated publish
// path, so every assertion fails closed on its own.
// ---------------------------------------------------------------------------

function assertProtectedRelease(name, source) {
  const triggers = topLevelTriggers(source);

  // Barrier 1: dispatch-only. A push or release trigger publishes on merge.
  assert.deepEqual(
    triggers,
    ["workflow_dispatch"],
    `${name} must be dispatch-only so merging does not publish`,
  );

  // Barrier 2: an explicit authorization input, required and defaulting to false.
  assert.match(
    source,
    /^      release_authorized:\r?\n        description: .+\r?\n        required: true\r?\n        type: boolean\r?\n        default: false$/m,
    `${name} must require an explicit release_authorized input that defaults to false`,
  );

  // Barrier 3: the job is gated on the Authorization input and the default branch.
  const jobGuard = source.match(/^  release:\r?\n(?:    .+\r?\n)*?    if: (.+)$/m);
  assert.ok(jobGuard, `${name} must guard the release job with an if condition`);
  assert.match(jobGuard[1], /inputs\.release_authorized == true/, `${name} release job must require release_authorized`);
  assert.match(jobGuard[1], /refs\/heads\/main/, `${name} release job must require the default branch`);

  // Barrier 4: a protected environment, so a branch-editable condition alone is
  // never sufficient. The environment also carries the branch policy in GitHub.
  assert.match(
    source,
    /^    environment:\r?\n      name: release$/m,
    `${name} must bind the release job to the protected release environment`,
  );
}

function assertPublishContract(name, source) {
  const triggers = topLevelTriggers(source);

  // The publish workflow may react to an already-authorized tag or release, but
  // never to a plain branch push.
  assert.ok(!triggers.includes("push") || !/^\s{2}push:\r?\n(\s{4}.+\r?\n)*?\s{4}branches:/m.test(source),
    `${name} must not publish on a branch push`);
  assert.match(source, /id-token: write/, `${name} must use OIDC for Trusted Publishing`);
  assert.match(source, /npm publish --access public/, `${name} must publish with public access`);
  assert.match(source, /Skip already published version/, `${name} must skip an already published version`);
}

test("the release workflow is dispatch-only, authorized, and environment-protected", () => {
  assertProtectedRelease("auto-release.yml", workflow("auto-release.yml"));
});

test("the publish workflow uses OIDC and never triggers on a branch push", () => {
  assertPublishContract("publish.yml", workflow("publish.yml"));
});

test("only the release and publish workflows may carry privileged capabilities", () => {
  const files = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/i.test(name)).sort();
  assert.deepEqual(files, ["auto-release.yml", "ci.yml", "publish.yml"]);

  const ci = workflow("ci.yml");
  assert.doesNotMatch(ci, /\bnpm\s+publish\b/i, "ci.yml must not publish");
  assert.doesNotMatch(ci, /\bgh\s+release\s+create\b/i, "ci.yml must not create releases");
  assert.doesNotMatch(ci, /\bid-token:\s*write/i, "ci.yml must not request an OIDC token");
});

test("the branch-dispatch release shape fails the contract", () => {
  const unprotected = `
name: Auto Release
on:
  workflow_dispatch:
    inputs:
      release_authorized:
        description: "Confirm."
        required: true
        type: boolean
        default: false
permissions:
  actions: write
  contents: write
jobs:
  release:
    if: github.ref == 'refs/heads/main' && inputs.release_authorized == true
    runs-on: ubuntu-latest
    steps:
      - run: gh release create "$TAG"
`;

  // Missing the protected environment is the exact defect DOT-2387/DOT-2561 held.
  assert.throws(() => assertProtectedRelease("unprotected", unprotected), /protected release environment/);

  const pushTriggered = unprotected.replace(
    "on:\n  workflow_dispatch:\n    inputs:",
    "on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n    inputs:",
  );
  assert.throws(() => assertProtectedRelease("push-triggered", pushTriggered), /dispatch-only/);
});

test("a release job without the authorization input fails the contract", () => {
  const noInput = `
name: Auto Release
on:
  workflow_dispatch:
permissions:
  actions: write
  contents: write
jobs:
  release:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: release
    steps:
      - run: gh release create "$TAG"
`;
  assert.throws(() => assertProtectedRelease("no-input", noInput), /release_authorized/);
});

test("publishing on a branch push fails the publish contract", () => {
  const branchPush = `
name: Publish to npm
on:
  push:
    branches: [main]
permissions:
  contents: read
  id-token: write
jobs:
  publish:
    steps:
      - run: npm publish --access public
`;
  assert.throws(() => assertPublishContract("branch-push", branchPush), /must not publish on a branch push/);
});

test("the hold is documented where a maintainer will look", () => {
  const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /release_authorized|release environment/i);
});
