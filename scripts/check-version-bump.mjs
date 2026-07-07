#!/usr/bin/env node
/**
 * PR guard for optional version bumps.
 *
 * Rules:
 * - version bump is optional even when publishable paths changed
 * - if version is bumped, semver must increase
 * - if version is bumped, CHANGELOG.md must be updated in the same diff
 * - major bumps require explicit human approval
 *
 * Publishable paths: template defaults + package.json files + pi.extensions.
 *
 * Usage:
 *   node scripts/check-version-bump.mjs
 *   BASE_REF=origin/main node scripts/check-version-bump.mjs
 *   ALLOW_MAJOR_VERSION_BUMP=1 BASE_REF=origin/main node scripts/check-version-bump.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const TEMPLATE_DEFAULT = [
  "extensions/",
  "lib/",
  "skills/",
  "prompts/",
  "themes/",
  "src/",
  "bin/",
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "package.json",
];

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i];
  }
  return 0;
}

function getSemverParts(v) {
  return parseSemver(v) ?? [0, 0, 0];
}

function isMajorBump(baseVersion, headVersion) {
  const [baseMajor] = getSemverParts(baseVersion);
  const [headMajor] = getSemverParts(headVersion);
  return headMajor > baseMajor;
}

function hasMajorApproval() {
  if (process.env.ALLOW_MAJOR_VERSION_BUMP === "1") return true;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return false;
  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    const pr = event.pull_request ?? {};
    const haystack = `${pr.title ?? ""}
${pr.body ?? ""}`.toLowerCase();
    return haystack.includes("major-approved");
  } catch {
    return false;
  }
}

function readPackageVersion(ref) {
  const raw = run(`git show ${ref}:package.json`);
  return JSON.parse(raw).version;
}

function loadPublishablePaths() {
  const paths = new Set(TEMPLATE_DEFAULT);
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    for (const entry of pkg.files ?? []) {
      paths.add(String(entry).replace(/^\.\//, ""));
    }
    for (const ext of pkg.pi?.extensions ?? []) {
      if (typeof ext === "string") {
        paths.add(ext.replace(/^\.\//, ""));
      }
    }
    if (existsSync("index.ts")) paths.add("index.ts");
  } catch {
    // keep template defaults
  }
  return [...paths];
}

function isPublishablePath(file, publishable) {
  return publishable.some(
    (p) => file === p || (p.endsWith("/") && file.startsWith(p)),
  );
}

const baseRef = process.env.BASE_REF ?? "origin/main";
const publishable = loadPublishablePaths();

let changed;
try {
  run(`git rev-parse --verify ${baseRef}`);
  changed = run(`git diff --name-only ${baseRef}...HEAD`).split("\n").filter(Boolean);
} catch {
  console.log("version:check skip ? base ref not available (local run?)");
  process.exit(0);
}

const publishableChanged = changed.some((f) => isPublishablePath(f, publishable));
const baseVersion = readPackageVersion(baseRef);
const headVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const versionDelta = compareSemver(headVersion, baseVersion);

if (versionDelta < 0) {
  console.error(
    `version:check fail ? package.json version went backwards (${baseVersion} -> ${headVersion}).`,
  );
  process.exit(1);
}

if (versionDelta === 0) {
  if (publishableChanged) {
    console.log(
      `version:check ok ? publishable paths changed with no version bump (${baseVersion} -> ${headVersion})`,
    );
  } else {
    console.log("version:check ok ? no version bump requested");
  }
  process.exit(0);
}

if (isMajorBump(baseVersion, headVersion) && !hasMajorApproval()) {
  console.error(
    "version:check fail ? major version bump requires explicit human approval. Add 'major-approved' to the PR title/body or rerun locally with ALLOW_MAJOR_VERSION_BUMP=1.",
  );
  process.exit(1);
}

if (!changed.includes("CHANGELOG.md")) {
  console.error(
    "version:check fail ? version bumped, but CHANGELOG.md was not updated in this PR.",
  );
  process.exit(1);
}

console.log(
  `version:check ok ? ${baseVersion} -> ${headVersion}, CHANGELOG.md updated`,
);
process.exit(0);
