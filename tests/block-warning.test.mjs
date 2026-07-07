import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const libRoot = path.join(root, "..", "lib");

const {
  formatBlockedToolReason,
  formatCompactBlockReason,
  formatDetailedBlockReason,
  pathSetKey,
  REMEDIATION_HINT,
  resetBlockWarningState,
} = await import(pathToFileURL(path.join(libRoot, "block-warning.ts")).href);

/** @param {string} relativePath @param {"file" | "directory"} [kind] */
function entry(relativePath, kind = "file") {
  return {
    relativePath,
    kind,
    dir: ".",
    basename: relativePath,
    ext: "",
  };
}

test.beforeEach(() => {
  resetBlockWarningState();
});

test("pathSetKey changes when members or count change", () => {
  const a = [entry("foo.txt"), entry("bar.txt")];
  const b = [entry("foo.txt")];
  const c = [entry("foo.txt"), entry("baz.txt")];
  assert.notEqual(pathSetKey(a), pathSetKey(b));
  assert.notEqual(pathSetKey(a), pathSetKey(c));
  assert.equal(pathSetKey(a), pathSetKey([entry("bar.txt"), entry("foo.txt")]));
});

test("first blocked emission shows detailed warning with at most 2 examples", () => {
  const entries = [
    entry("a.txt"),
    entry("b.txt"),
    entry("c.txt"),
    entry("d.txt"),
  ];
  const reason = formatBlockedToolReason("grep", entries);

  assert.match(reason, /Blocked grep: 4 non-ASCII path/);
  assert.match(reason, /a\.txt/);
  assert.match(reason, /b\.txt/);
  assert.doesNotMatch(reason, /c\.txt/);
  assert.match(reason, /\.\.\. and 2 more/);
  assert.match(reason, new RegExp(REMEDIATION_HINT.replace(/[()]/g, "\\$&")));
});

test("repeated blocked emission for same path set collapses to one line", () => {
  const entries = [entry("a.txt"), entry("b.txt"), entry("c.txt")];
  const first = formatBlockedToolReason("find_files", entries);
  const second = formatBlockedToolReason("grep", entries);

  assert.match(first, /a\.txt/);
  assert.doesNotMatch(second, /a\.txt/);
  assert.match(second, /still block/);
  assert.match(second, new RegExp(REMEDIATION_HINT.replace(/[()]/g, "\\$&")));
  assert.equal(second.split("\n").length, 1);
});

test("changed path set restores detailed warning", () => {
  const original = [entry("a.txt"), entry("b.txt")];
  formatBlockedToolReason("grep", original);
  formatBlockedToolReason("grep", original);

  const changed = [entry("a.txt"), entry("new.txt")];
  const reason = formatBlockedToolReason("grep", changed);

  assert.match(reason, /new\.txt/);
  assert.match(reason, /a\.txt/);
  assert.doesNotMatch(reason, /still block/);
});

test("formatDetailedBlockReason caps examples at MAX_DETAILED_EXAMPLES", () => {
  const entries = [entry("1"), entry("2"), entry("3")];
  const reason = formatDetailedBlockReason("fff_multi_grep", entries);
  assert.match(reason, /\.\.\. and 1 more/);
});

test("formatCompactBlockReason keeps remediation hint", () => {
  const reason = formatCompactBlockReason("grep", [entry("x.txt")]);
  assert.match(reason, /list_non_ascii_paths/);
  assert.match(reason, /sanitize_filenames\(dryRun=true\)/);
});
