import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

function triggerBlock(workflow) {
  const match = workflow.split(/\npermissions:/)[0].match(/^on:[ \t]*\r?\n((?:[ \t][^\n]*\r?\n)*)/m);
  return match ? match[1] : "";
}

function topLevelTriggers(block) {
  return [...block.matchAll(/^  ([A-Za-z_]+):/gm)].map((m) => m[1]);
}

// Triggers that can start a run without a human choosing to release.
const AUTOMATIC = ["push", "pull_request", "workflow_run", "schedule", "repository_dispatch", "create", "delete"];

test("no automatic trigger can start the release workflow", () => {
  const triggers = topLevelTriggers(triggerBlock(releaseWorkflow));
  assert.ok(triggers.includes("workflow_dispatch"), "release must remain manually dispatchable");
  for (const automatic of AUTOMATIC) {
    assert.ok(!triggers.includes(automatic), `release must not be triggered by ${automatic}`);
  }
});

test("publishing is not reachable from a branch or path push", () => {
  const block = triggerBlock(publishWorkflow);
  assert.doesNotMatch(block, /^\s+branches:/m, "a branch push must not publish");
  assert.doesNotMatch(block, /^\s+paths:/m, "a path-filtered push must not publish");
  assert.match(publishWorkflow, /npm publish/);
});

test("a branch push added to release or publish fails these contracts", () => {
  const withBranchRelease = releaseWorkflow.replace(/^on:[ \t]*\r?\n/m, "on:\n  push:\n    branches: [main]\n");
  assert.throws(() => {
    const triggers = topLevelTriggers(triggerBlock(withBranchRelease));
    assert.ok(!triggers.includes("push"));
  });
  const withBranchPublish = publishWorkflow.replace(/^on:[ \t]*\r?\n/m, "on:\n  push:\n    branches: [main]\n");
  assert.throws(() => assert.doesNotMatch(triggerBlock(withBranchPublish), /^\s+branches:/m));
});
