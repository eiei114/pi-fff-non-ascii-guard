import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const { buildRenamePlan, formatRenamePlanReport } = await import(
  pathToFileURL(path.join(root, "..", "lib", "rename-plan.ts")).href
);

function fileEntry(relativePath, dir, basename, ext) {
  return { relativePath, kind: "file", dir, basename, ext };
}

test("dry-run report shows stable source-to-destination path mapping", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-unique-"));
  try {
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    const plan = buildRenamePlan(
      [fileEntry("docs/メモ.txt", "docs", "メモ", ".txt")],
      tmp
    );

    assert.deepEqual(plan.conflicts, []);
    assert.equal(plan.renames[0].oldPath, "docs/メモ.txt");
    assert.equal(plan.renames[0].newPath, "docs/non-ascii-file.txt");

    const report = formatRenamePlanReport(plan);
    assert.match(report, /docs\/メモ\.txt -> docs\/non-ascii-file\.txt/);
    assert.match(report, /No filesystem changes made\./);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("dry-run report flags slug collisions before apply mode", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-collision-"));
  try {
    fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
    const plan = buildRenamePlan(
      [
        fileEntry(
          "scripts/SpreadsheetToJson_wrapあり・nullなし.gs",
          "scripts",
          "SpreadsheetToJson_wrapあり・nullなし",
          ".gs"
        ),
        fileEntry(
          "scripts/SpreadsheetToJson_wrapなし・nullあり.gs",
          "scripts",
          "SpreadsheetToJson_wrapなし・nullあり",
          ".gs"
        ),
      ],
      tmp
    );

    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].type, "slug_collision");
    assert.equal(
      plan.conflicts[0].targetPath,
      "scripts/spreadsheettojson_wrap-null.gs"
    );

    const report = formatRenamePlanReport(plan);
    assert.match(report, /\[slug collision\]/);
    assert.match(report, /scripts\/spreadsheettojson_wrap-null-2\.gs/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("dry-run report flags already-existing destinations before apply mode", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-existing-"));
  try {
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs", "non-ascii-file.txt"), "keep");

    const plan = buildRenamePlan(
      [fileEntry("docs/メモ.txt", "docs", "メモ", ".txt")],
      tmp
    );

    assert.equal(plan.existingDestinations.length, 1);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].type, "existing_destination");
    assert.equal(plan.conflicts[0].targetPath, "docs/non-ascii-file.txt");
    assert.equal(plan.renames[0].newPath, "docs/non-ascii-file-2.txt");

    const report = formatRenamePlanReport(plan);
    assert.match(report, /\[existing destination\] docs\/non-ascii-file\.txt already exists/);
    assert.match(report, /planned: docs\/non-ascii-file-2\.txt/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
