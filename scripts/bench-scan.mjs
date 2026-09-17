import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const libRoot = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "lib");
const { scanNonAsciiPaths } = await import(pathToFileURL(path.join(libRoot, "non-ascii-scan.ts")).href);

function buildFixture(root, { dirs = 20, filesPerDir = 50, nonAsciiDir = false } = {}) {
  fs.mkdirSync(root, { recursive: true });
  for (let d = 0; d < dirs; d++) {
    const dirName = nonAsciiDir ? `dir-${d}-日本語` : `dir-${d}`;
    const dir = path.join(root, dirName);
    fs.mkdirSync(dir, { recursive: true });
    for (let f = 0; f < filesPerDir; f++) {
      fs.writeFileSync(path.join(dir, `file-${f}.txt`), "x");
    }
  }
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules", "pkg", "index.js"), "module.exports = {};");
}

function bench(label, cwd, iterations = 5) {
  for (let i = 0; i < 2; i++) scanNonAsciiPaths(cwd);
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    scanNonAsciiPaths(cwd);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  console.log(`${label}: median ${median.toFixed(2)}ms (${iterations} runs)`);
  return median;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fff-guard-bench-"));
try {
  const asciiRoot = path.join(tmp, "ascii");
  const nonAsciiRoot = path.join(tmp, "non-ascii");
  buildFixture(asciiRoot, { dirs: 40, filesPerDir: 100, nonAsciiDir: false });
  buildFixture(nonAsciiRoot, { dirs: 40, filesPerDir: 100, nonAsciiDir: true });

  console.log("scanNonAsciiPaths benchmark");
  const asciiMs = bench("ascii-only tree (4000 files)", asciiRoot);
  const nonAsciiMs = bench("non-ASCII dir tree (4000 files)", nonAsciiRoot);
  console.log(JSON.stringify({ asciiMs, nonAsciiMs }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
