import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertReleaseTriggerContract } from "../scripts/release-trigger-contract.mjs";

const release = readFileSync(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publish = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

test("merge cannot directly or indirectly start release and publication", () => {
  assert.doesNotThrow(() => assertReleaseTriggerContract(release, publish));
  assert.match(publish, /if: steps\.published\.outputs\.skip != 'true'/);
  assert.match(release, /gh workflow run publish\.yml/);
});

test("manual release accepts stable SemVer without leading zeroes", () => {
  const pattern = release.match(/grep -Eq '([^']+)'/)?.[1];
  assert.ok(pattern, "release workflow must validate stable SemVer");
  const stableSemver = new RegExp(pattern);
  for (const version of ["0.0.0", "1.2.3", "10.20.300"]) assert.match(version, stableSemver);
  for (const version of ["01.2.3", "1.02.3", "1.2.03", "1.2", "1.2.3-beta"]) {
    assert.doesNotMatch(version, stableSemver);
  }
});

test("trigger regressions fail closed", () => {
  assert.throws(() => assertReleaseTriggerContract(
    release.replace("  workflow_dispatch:", "  push:\n    branches: [main]"), publish));
  assert.throws(() => assertReleaseTriggerContract(
    release.replace(" && github.ref == 'refs/heads/main'", ""), publish));
  assert.throws(() => assertReleaseTriggerContract(
    release, publish.replace("    tags:", "    branches: [main]\n    tags:")));
  assert.throws(() => assertReleaseTriggerContract(release, publish.replace("'v*.*.*'", "'*'")));
  assert.throws(() => assertReleaseTriggerContract(release.replace("on:", "on: *triggers"), publish));
});
