import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const libRoot = path.join(root, "..", "lib");

const { getNonAsciiEntries, invalidateNonAsciiCache } = await import(
  pathToFileURL(path.join(libRoot, "scan-cache.ts")).href
);
const { SCAN_CACHE_TTL_MS } = await import(
  pathToFileURL(path.join(libRoot, "constants.ts")).href
);
const { formatBlockedToolReason, resetBlockWarningState } = await import(
  pathToFileURL(path.join(libRoot, "block-warning.ts")).href
);
const { hasNonAscii } = await import(
  pathToFileURL(path.join(libRoot, "non-ascii-scan.ts")).href
);

const NON_ASCII_FILE = "\u65e5\u672c\u8a9e.txt"; // 日本語.txt
const ASCII_FILE = "japanese.txt";

// `scanNonAsciiPaths` flags the workspace root itself (".") when the cwd path is
// non-ASCII, so a `mkdtempSync(tmpdir())` fixture would report [".", NON_ASCII_FILE]
// on machines whose temp directory is non-ASCII. Build the fixtures under an
// ASCII-only scratch directory inside the repo (`.tmp/` is git-ignored) and fail
// loudly instead of producing a confusing assertion mismatch if that is not ASCII.
const scratchRoot = path.join(root, "..", ".tmp", "scan-cache-fixtures");

function createWorkspace(fileName) {
  if (hasNonAscii(scratchRoot.split(path.sep).join("/"))) {
    throw new Error(
      `scan-cache fixtures require an ASCII-only path; ${scratchRoot} contains non-ASCII characters`
    );
  }
  mkdirSync(scratchRoot, { recursive: true });
  const cwd = mkdtempSync(path.join(scratchRoot, "pi-fff-scan-cache-"));
  writeFileSync(path.join(cwd, fileName), "fixture\n", "utf8");
  return cwd;
}

test.beforeEach(() => {
  invalidateNonAsciiCache();
  resetBlockWarningState();
});

test("TTL constant is a short bounded window", () => {
  assert.equal(typeof SCAN_CACHE_TTL_MS, "number");
  assert.ok(SCAN_CACHE_TTL_MS > 0);
  assert.ok(SCAN_CACHE_TTL_MS <= 60_000, "TTL should stay a short window");
});

test("returns the cached scan within the TTL window", () => {
  const cwd = createWorkspace(NON_ASCII_FILE);
  try {
    const start = 1_000_000;
    const first = getNonAsciiEntries(cwd, start);
    assert.equal(first.length, 1);
    assert.deepEqual(first.map((e) => e.relativePath), [NON_ASCII_FILE]);

    // A change on disk inside the window must not be observed yet.
    renameSync(path.join(cwd, NON_ASCII_FILE), path.join(cwd, ASCII_FILE));
    const cachedRead = getNonAsciiEntries(cwd, start + SCAN_CACHE_TTL_MS - 1);
    assert.deepEqual(cachedRead.map((e) => e.relativePath), [NON_ASCII_FILE]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("re-scans past the TTL so a manual rename unblocks the gate", () => {
  const cwd = createWorkspace(NON_ASCII_FILE);
  try {
    const start = 2_000_000;
    assert.equal(getNonAsciiEntries(cwd, start).length, 1);

    // Manual rename outside the tools (as the README instructs).
    renameSync(path.join(cwd, NON_ASCII_FILE), path.join(cwd, ASCII_FILE));

    const afterTtl = getNonAsciiEntries(cwd, start + SCAN_CACHE_TTL_MS);
    assert.deepEqual(afterTtl, []);

    // The empty result is cached again for the next window.
    const withinNextWindow = getNonAsciiEntries(
      cwd,
      start + SCAN_CACHE_TTL_MS + Math.floor(SCAN_CACHE_TTL_MS / 2)
    );
    assert.deepEqual(withinNextWindow, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("re-scan past TTL also picks up non-ASCII paths created mid-session", () => {
  const cwd = createWorkspace(ASCII_FILE);
  try {
    const start = 3_000_000;
    assert.deepEqual(getNonAsciiEntries(cwd, start), []);

    writeFileSync(path.join(cwd, NON_ASCII_FILE), "fixture\n", "utf8");
    assert.deepEqual(getNonAsciiEntries(cwd, start + 1), []);
    const afterTtl = getNonAsciiEntries(cwd, start + SCAN_CACHE_TTL_MS);
    assert.deepEqual(afterTtl.map((e) => e.relativePath), [NON_ASCII_FILE]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("invalidateNonAsciiCache forces an immediate re-scan", () => {
  const cwd = createWorkspace(NON_ASCII_FILE);
  try {
    const now = 4_000_000;
    assert.equal(getNonAsciiEntries(cwd, now).length, 1);

    renameSync(path.join(cwd, NON_ASCII_FILE), path.join(cwd, ASCII_FILE));
    invalidateNonAsciiCache();

    // Same timestamp as the previous scan, so only invalidation can explain it.
    assert.deepEqual(getNonAsciiEntries(cwd, now), []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("a different cwd never reuses the cache, even within the TTL", () => {
  const firstCwd = createWorkspace(NON_ASCII_FILE);
  const secondCwd = createWorkspace(ASCII_FILE);
  try {
    const now = 5_000_000;
    assert.equal(getNonAsciiEntries(firstCwd, now).length, 1);
    assert.equal(getNonAsciiEntries(firstCwd, now).length, 1);

    assert.deepEqual(getNonAsciiEntries(secondCwd, now), []);
    // The second scan replaced the cache entry, so switching back re-scans too.
    assert.deepEqual(
      getNonAsciiEntries(firstCwd, now).map((e) => e.relativePath),
      [NON_ASCII_FILE]
    );
  } finally {
    rmSync(firstCwd, { recursive: true, force: true });
    rmSync(secondCwd, { recursive: true, force: true });
  }
});

test("a TTL re-scan that changes the path set restores the detailed block reason", () => {
  const cwd = createWorkspace(NON_ASCII_FILE);
  try {
    const start = 6_000_000;
    const blocked = getNonAsciiEntries(cwd, start);
    assert.equal(blocked.length, 1);

    const firstReason = formatBlockedToolReason("grep", blocked);
    assert.match(firstReason, /Blocked grep: 1 non-ASCII path/);
    assert.ok(firstReason.includes(NON_ASCII_FILE));
    const secondReason = formatBlockedToolReason("grep", blocked);
    assert.match(secondReason, /still block/);

    // Within the TTL the set is unchanged, so repeats stay compact.
    assert.equal(getNonAsciiEntries(cwd, start + 1).length, 1);
    assert.match(formatBlockedToolReason("grep", blocked), /still block/);

    renameSync(path.join(cwd, NON_ASCII_FILE), path.join(cwd, ASCII_FILE));
    // The rename frees the gate entirely.
    assert.deepEqual(getNonAsciiEntries(cwd, start + SCAN_CACHE_TTL_MS), []);

    // A new non-ASCII path created after the rename changes the set again.
    writeFileSync(path.join(cwd, "\u8ffd\u52a0.txt"), "fixture\n", "utf8");
    const changed = getNonAsciiEntries(cwd, start + 2 * SCAN_CACHE_TTL_MS);
    assert.deepEqual(changed.map((e) => e.relativePath), ["\u8ffd\u52a0.txt"]);

    const detailedAgain = formatBlockedToolReason("grep", changed);
    assert.match(detailedAgain, /Blocked grep: 1 non-ASCII path/);
    assert.doesNotMatch(detailedAgain, /still block/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("an empty TTL refresh re-arms the detailed warning for a returning path set", () => {
  const cwd = createWorkspace(NON_ASCII_FILE);
  try {
    const start = 8_000_000;
    const blocked = getNonAsciiEntries(cwd, start);
    assert.deepEqual(blocked.map((e) => e.relativePath), [NON_ASCII_FILE]);

    const first = formatBlockedToolReason("grep", blocked);
    assert.match(first, /Blocked grep: 1 non-ASCII path/);
    assert.ok(first.includes(NON_ASCII_FILE));
    assert.match(formatBlockedToolReason("grep", blocked), /still block/);

    // The only blocked path is renamed to ASCII outside the tools.
    renameSync(path.join(cwd, NON_ASCII_FILE), path.join(cwd, ASCII_FILE));
    assert.deepEqual(getNonAsciiEntries(cwd, start + SCAN_CACHE_TTL_MS), []);

    // The same path returns after the next TTL: the gate must warn in detail
    // again instead of collapsing to the compact repeat for a stale path set.
    writeFileSync(path.join(cwd, NON_ASCII_FILE), "fixture\n", "utf8");
    const returning = getNonAsciiEntries(cwd, start + 2 * SCAN_CACHE_TTL_MS);
    assert.deepEqual(returning.map((e) => e.relativePath), [NON_ASCII_FILE]);

    const reason = formatBlockedToolReason("grep", returning);
    assert.match(reason, /Blocked grep: 1 non-ASCII path/);
    assert.ok(reason.includes(NON_ASCII_FILE));
    assert.doesNotMatch(reason, /still block/);

    // Repeats within the unchanged set still collapse to the compact line.
    assert.match(formatBlockedToolReason("grep", returning), /still block/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("non-empty TTL refreshes keep compact repeats for an unchanged path set", () => {
  const cwd = createWorkspace(NON_ASCII_FILE);
  try {
    const start = 9_000_000;
    const blocked = getNonAsciiEntries(cwd, start);
    assert.match(formatBlockedToolReason("grep", blocked), /Blocked grep: 1 non-ASCII path/);

    const refreshed = getNonAsciiEntries(cwd, start + SCAN_CACHE_TTL_MS);
    assert.deepEqual(refreshed.map((e) => e.relativePath), [NON_ASCII_FILE]);
    assert.match(formatBlockedToolReason("grep", refreshed), /still block/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("fixture root is ASCII-only so the scan cannot report the workspace root", () => {
  const cwd = createWorkspace(NON_ASCII_FILE);
  try {
    const entries = getNonAsciiEntries(cwd, 10_000_000);
    assert.deepEqual(entries.map((e) => e.relativePath), [NON_ASCII_FILE]);
    assert.equal(entries.length, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
