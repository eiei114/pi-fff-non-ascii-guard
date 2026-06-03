import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const libRoot = path.join(root, "..", "lib");

const { hasNonAscii, scanNonAsciiPaths } = await import(
  pathToFileURL(path.join(libRoot, "non-ascii-scan.ts")).href
);
const { toAsciiSlug } = await import(
  pathToFileURL(path.join(libRoot, "ascii-slug.ts")).href
);
const { buildRenamePlan } = await import(
  pathToFileURL(path.join(libRoot, "rename-plan.ts")).href
);

test("hasNonAscii detects multibyte characters", () => {
  assert.equal(hasNonAscii("hello.gs"), false);
  assert.equal(hasNonAscii("あり.gs"), true);
  assert.equal(hasNonAscii("wrapあり・nullなし"), true);
});

test("toAsciiSlug converts mixed script basenames", () => {
  assert.equal(
    toAsciiSlug("SpreadsheetToJson_wrapあり・nullなし"),
    "spreadsheettojson_wrap-null"
  );
});

test("scanNonAsciiPaths flags file and parent directory segments", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-"));
  try {
    const scripts = path.join(tmp, "scripts");
    fs.mkdirSync(scripts, { recursive: true });
    fs.writeFileSync(
      path.join(scripts, "SpreadsheetToJson_wrapあり・nullなし.gs"),
      "// test"
    );
    const asciiDir = path.join(tmp, "docs", "ok");
    fs.mkdirSync(asciiDir, { recursive: true });
    fs.writeFileSync(path.join(asciiDir, "readme.txt"), "ok");

    const entries = scanNonAsciiPaths(tmp);
    const paths = entries.map((e) => e.relativePath);
    assert.ok(
      paths.some((p) => p.includes("SpreadsheetToJson_wrap")),
      "expected non-ASCII file path"
    );
    assert.ok(!paths.some((p) => p.endsWith("readme.txt")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildRenamePlan disambiguates slug collisions", () => {
  const entries = [
    {
      relativePath: "scripts/SpreadsheetToJson_wrapあり・nullなし.gs",
      kind: "file",
      dir: "scripts",
      basename: "SpreadsheetToJson_wrapあり・nullなし",
      ext: ".gs",
    },
    {
      relativePath: "scripts/SpreadsheetToJson_wrapなし・nullあり.gs",
      kind: "file",
      dir: "scripts",
      basename: "SpreadsheetToJson_wrapなし・nullあり",
      ext: ".gs",
    },
  ];
  const { renames, collisions } = buildRenamePlan(entries);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0][0], "scripts/spreadsheettojson_wrap-null.gs");
  const targets = new Set(renames.map((r) => r.newPath));
  assert.equal(targets.size, 2);
  assert.ok(
    renames.some((r) => r.newPath === "scripts/spreadsheettojson_wrap-null-2.gs")
  );
});
