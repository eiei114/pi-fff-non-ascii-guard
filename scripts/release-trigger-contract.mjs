function triggerBlock(content) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "on:");
  if (start < 0) throw new Error("Expected explicit multiline on: trigger mapping");
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith(" ") && !line.startsWith("#")) break;
    if (line.trim() && !line.trimStart().startsWith("#")) block.push(line);
  }
  return block;
}

export function assertReleaseTriggerContract(release, publish) {
  const manual = triggerBlock(release);
  if (manual.join("\n") !== "  workflow_dispatch:") {
    throw new Error("Release must be explicit workflow_dispatch only");
  }
  if (!release.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'")) {
    throw new Error("Manual release must be restricted to selected main");
  }
  if (!release.includes("grep -Eq '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'")) {
    throw new Error("Manual release must reject invalid or leading-zero SemVer");
  }

  const publishTriggers = triggerBlock(publish);
  const events = publishTriggers.filter((line) => /^ {2}\S/.test(line)).map((line) => line.trim());
  if (JSON.stringify(events) !== JSON.stringify(["push:", "release:", "workflow_dispatch:"])) {
    throw new Error("Publish may only use version-tag push, published release, or explicit dispatch");
  }
  const releaseIndex = publishTriggers.findIndex((line) => line === "  release:");
  const push = publishTriggers.slice(1, releaseIndex);
  if (JSON.stringify(push) !== JSON.stringify(["    tags:", "      - 'v*.*.*'"])) {
    throw new Error("Publish push must contain only version tags, never main branches or paths");
  }
}
