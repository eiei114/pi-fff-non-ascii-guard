import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import registerExtension from "../extensions/pi-fff-non-ascii-guard.ts";
import { MAX_BLOCK_LIST } from "../lib/constants.ts";

function workspace(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-preview-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "メモ.txt"), "original");
  return cwd;
}

async function preview(cwd) {
  const tools = new Map();
  registerExtension({
    on() {},
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  });
  return tools.get("sanitize_filenames").execute("preview", {}, undefined, undefined, { cwd });
}

test("default mixed preview shows the file rename and manual directory work without changing either path", async (t) => {
  const cwd = workspace(t);
  const dir = path.join(cwd, "資料");
  fs.mkdirSync(dir);

  const { content: [{ text }], details } = await preview(cwd);

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

test("mixed preview caps the directory list and shows the omitted count", async (t) => {
  const cwd = workspace(t);
  for (let i = 0; i < MAX_BLOCK_LIST + 2; i++) {
    fs.mkdirSync(path.join(cwd, `資料-${i}`));
  }

  const { content: [{ text }] } = await preview(cwd);

  assert.equal(text.split("\n").filter((line) => line.endsWith(" (directory)")).length, MAX_BLOCK_LIST);
  assert.match(text, /\.\.\. and 2 more/);
});

test("file-only preview keeps destination conflict reporting and shows no manual directory note", async (t) => {
  const cwd = workspace(t);
  fs.writeFileSync(path.join(cwd, "non-ascii-file.txt"), "keep");

  const { content: [{ text }], details } = await preview(cwd);

  assert.match(text, /メモ\.txt -> non-ascii-file-2\.txt/);
  assert.match(text, /\[existing destination\] non-ascii-file\.txt already exists/);
  assert.equal(details.conflicts[0].type, "existing_destination");
  assert.doesNotMatch(text, /rename manually|directory-related blocks/);
});
