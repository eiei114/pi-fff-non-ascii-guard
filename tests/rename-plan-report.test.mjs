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
const { scanNonAsciiPaths } = await import(
  pathToFileURL(path.join(root, "..", "lib", "non-ascii-scan.ts")).href
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

test("only Windows groups planned targets that differ by extension case", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-case-collision-"));
  try {
    const entries = [
      fileEntry("メモ.md", ".", "メモ", ".md"),
      fileEntry("ノート.MD", ".", "ノート", ".MD"),
      fileEntry("記録.Md", ".", "記録", ".Md"),
    ];

    const windows = buildRenamePlan(entries, tmp, "win32");
    const sources = windows.renames.map((r) => r.oldPath);
    const targets = windows.renames.map((r) => r.newPath);
    const expected = sources.map((source, i) =>
      `non-ascii-file${i === 0 ? "" : `-${i + 1}`}${path.extname(source)}`
    );
    assert.equal(sources.length, entries.length);
    assert.deepEqual(targets, expected);
    assert.deepEqual(windows.conflicts, [
      { type: "slug_collision", targetPath: expected[0], sourcePaths: sources },
    ]);
    assert.ok(formatRenamePlanReport(windows).includes(
      `[slug collision] ${expected[0]} <- ${sources.join(", ")}; planned: ${expected.join(", ")}`
    ));

    const nonWindows = buildRenamePlan(entries, tmp, "linux");
    assert.deepEqual(nonWindows.conflicts, []);
    assert.deepEqual(nonWindows.renames.map((r) => r.newPath),
      sources.map((source) => `non-ascii-file${path.extname(source)}`));
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

test("reserved Windows device targets get a safe numeric suffix and keep extensions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-device-names-"));
  try {
    const reservedNames = [
      ["cön", "con"],
      ["prñ", "prn"],
      ["aüx", "aux"],
      ["nül", "nul"],
      ...Array.from({ length: 9 }, (_, i) => [`cöm${i + 1}`, `com${i + 1}`]),
      ...Array.from({ length: 9 }, (_, i) => [`lpť${i + 1}`, `lpt${i + 1}`]),
    ];
    const nearMatches = [
      ["cöm0", "com0"],
      ["lpť0", "lpt0"],
      ["ordinary-namé", "ordinary-name"],
    ];
    const entries = [...reservedNames, ...nearMatches].map(([source]) =>
      fileEntry(`${source}.txt`, ".", source, ".txt")
    );

    const plan = buildRenamePlan(entries, tmp);
    const plannedBySource = new Map(plan.renames.map((rename) => [rename.oldPath, rename.newPath]));

    assert.deepEqual(plan.existingDestinations, []);
    for (const [source, target] of reservedNames) {
      assert.equal(plannedBySource.get(`${source}.txt`), `${target}-2.txt`);
    }
    for (const [source, target] of nearMatches) {
      assert.equal(plannedBySource.get(`${source}.txt`), `${target}.txt`);
    }

    const report = formatRenamePlanReport(plan);
    assert.match(report, /cön\.txt -> con-2\.txt/);
    assert.match(report, /cöm9\.txt -> com9-2\.txt/);
    assert.match(report, /lpť9\.txt -> lpt9-2\.txt/);
    assert.match(report, /cöm0\.txt -> com0\.txt/);
    assert.match(report, /ordinary-namé\.txt -> ordinary-name\.txt/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("reserved Windows device targets with multiple dots suffix before the first dot", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-device-multidot-"));
  try {
    fs.writeFileSync(path.join(tmp, "cön.backup.txt"), "source");

    const entries = scanNonAsciiPaths(tmp);
    const plan = buildRenamePlan(entries, tmp);
    const report = formatRenamePlanReport(plan);

    assert.equal(plan.renames.length, 1);
    assert.equal(plan.renames[0].oldPath, "cön.backup.txt");
    assert.equal(plan.renames[0].newPath, "con-2.backup.txt");
    assert.match(report, /cön\.backup\.txt -> con-2\.backup\.txt/);
    assert.deepEqual(fs.readdirSync(tmp), ["cön.backup.txt"]);
    assert.deepEqual(plan.existingDestinations, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
