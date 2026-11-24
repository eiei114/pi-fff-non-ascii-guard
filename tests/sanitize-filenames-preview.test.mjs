import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import registerExtension from "../extensions/pi-fff-non-ascii-guard.ts";
import { MAX_BLOCK_LIST } from "../lib/constants.ts";

function workspace(t) {
  // Pass a relative path to the scanner so host path names aren't part of the fixture.
  fs.mkdirSync(".tmp", { recursive: true });
  const cwd = fs.mkdtempSync(path.join(".tmp", "fff-guard-preview-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "メモ.txt"), "original");
  return cwd;
}

async function sanitize(cwd, params = {}) {
  const tools = new Map();
  registerExtension({
    on() {},
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  });
  return tools.get("sanitize_filenames").execute("sanitize", params, undefined, undefined, { cwd });
}

test("default mixed preview shows the file rename and manual directory work without changing either path", async (t) => {
  const cwd = workspace(t);
  const dir = path.join(cwd, "資料");
  fs.mkdirSync(dir);

  const { content: [{ text }], details } = await sanitize(cwd);

  assert.equal(details.dryRun, true);
  assert.match(text, /メモ\.txt -> non-ascii-file\.txt/);
  assert.match(text, /No filesystem changes made\./);
  assert.match(text, /Directory paths to rename manually \(1\):/);
  assert.match(text, /Applying this file plan will not clear directory-related blocks\./);
  assert.match(text, /資料 \(directory\)/);
  assert.deepEqual(fs.readdirSync(cwd).sort(), ["メモ.txt", "資料"].sort());
  assert.equal(fs.readFileSync(path.join(cwd, "メモ.txt"), "utf8"), "original");
  assert.ok(fs.statSync(dir).isDirectory());
});

test("mixed apply renames the file but reports that the remaining directory keeps fff tools blocked", async (t) => {
  const cwd = workspace(t);
  const dir = path.join(cwd, "資料");
  fs.mkdirSync(dir);

  const { content: [{ text }], details } = await sanitize(cwd, { dryRun: false });

  assert.deepEqual(fs.readdirSync(cwd).sort(), ["non-ascii-file.txt", "資料"].sort());
  assert.equal(fs.readFileSync(path.join(cwd, "non-ascii-file.txt"), "utf8"), "original");
  assert.ok(fs.statSync(dir).isDirectory());
  assert.deepEqual(fs.readdirSync(dir), []);

  assert.equal(details.renamed, 1);
  assert.equal(details.errors, 0);
  assert.equal(details.remaining, 1);
  assert.deepEqual(details.results, [
    { oldPath: "メモ.txt", newPath: "non-ascii-file.txt", status: "ok" },
  ]);
  assert.match(text, /fff tools stay blocked:/);
  assert.match(text, /資料 \(directory\)/);
  assert.doesNotMatch(text, /All (?:paths ASCII-safe|clear)|\bunblocked\b/i);
});

test("mixed preview caps the directory list and shows the omitted count", async (t) => {
  const cwd = workspace(t);
  for (let i = 0; i < MAX_BLOCK_LIST + 2; i++) {
    fs.mkdirSync(path.join(cwd, `資料-${i}`));
  }

  const { content: [{ text }] } = await sanitize(cwd);

  assert.equal(text.split("\n").filter((line) => line.endsWith(" (directory)")).length, MAX_BLOCK_LIST);
  assert.match(text, /\.\.\. and 2 more/);
});

test("file-only preview keeps destination conflict reporting and shows no manual directory note", async (t) => {
  const cwd = workspace(t);
  fs.writeFileSync(path.join(cwd, "non-ascii-file.txt"), "keep");

  const { content: [{ text }], details } = await sanitize(cwd);

  assert.match(text, /メモ\.txt -> non-ascii-file-2\.txt/);
  assert.match(text, /\[existing destination\] non-ascii-file\.txt already exists/);
  assert.equal(details.conflicts[0].type, "existing_destination");
  assert.doesNotMatch(text, /rename manually|directory-related blocks/);
});
