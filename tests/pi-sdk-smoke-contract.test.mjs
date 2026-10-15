import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions,
  countRuntimeErrors,
  parseJsonLines,
  SDK_VERSIONS,
  VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const warning = {
  type: "extension_ui_request",
  method: "notify",
  notifyType: "warning",
  message: "Warning: 1 non-ASCII path(s) detected\n  - 日本語.txt (file)",
};
const listResult = {
  type: "tool_execution_end",
  toolName: "list_non_ascii_paths",
  isError: false,
  result: {
    content: [{ type: "text", text: "1 non-ASCII path(s): 1 file(s), 0 dir(s).\n日本語.txt" }],
    details: { count: 1, files: 1, dirs: 0, entries: [{ relativePath: "日本語.txt", kind: "file" }] },
  },
};
const blockedGrep = {
  type: "tool_execution_end",
  toolName: "grep",
  isError: true,
  result: { content: [{ type: "text", text: "Blocked grep: 1 non-ASCII path(s)\n  - 日本語.txt (file)" }] },
};

test("smoke contract pins the frozen SDK and parses LF/CRLF JSON lines", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(Object.values(SDK_VERSIONS), ["1.2.0", "1.2.0", "1.2.0", "1.2.0"]);
  const response = { type: "response", command: "prompt", success: true };
  assert.deepEqual(parseJsonLines(`not-json\r\n${JSON.stringify(response)}\n\n`), [response]);
});

test("extension registration requires the actual non-ASCII startup warning", () => {
  assert.equal(behaviorAssertions("extension_load", { events: [warning] })[0].passed, true);
  for (const events of [[], [{ ...warning, message: "loaded" }], [{ ...warning, notifyType: "info" }]]) {
    assert.equal(behaviorAssertions("extension_load", { events })[0].passed, false);
  }
});

test("happy path requires an actual successful list tool result with the expected file", () => {
  assert.equal(behaviorAssertions("happy_path", { events: [listResult] })[0].passed, true);
  for (const event of [
    { ...listResult, isError: true },
    { ...listResult, result: { ...listResult.result, details: { count: 0, entries: [] } } },
    { ...listResult, result: { ...listResult.result, details: { count: 1, entries: [] }, content: [] } },
  ]) {
    assert.equal(behaviorAssertions("happy_path", { events: [event] })[0].passed, false);
  }
  assert.equal(behaviorAssertions("happy_path", { events: [] })[0].passed, false);
});

test("error path accepts only the intentionally handled grep block", () => {
  assert.equal(behaviorAssertions("error_path", { events: [blockedGrep] })[0].passed, true);
  for (const event of [
    { ...blockedGrep, isError: false },
    { ...blockedGrep, result: { content: [{ type: "text", text: "grep succeeded" }] } },
    { ...blockedGrep, result: { content: [{ type: "text", text: "Blocked grep" }] } },
  ]) {
    assert.equal(behaviorAssertions("error_path", { events: [event] })[0].passed, false);
  }
  assert.equal(behaviorAssertions("error_path", { events: [] })[0].passed, false);
});

test("reload requires second-host registration, feature response, and both actual clean exits", () => {
  const good = behaviorAssertions("reload_cleanup", {
    events: [warning, listResult], output: "", exitCode: 0, hostExitCodes: [0, 0],
  });
  assert.deepEqual(good.map((item) => item.id), [
    "reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown",
  ]);
  assert.ok(good.every((item) => item.passed));

  for (const events of [[], [listResult], [warning]]) {
    assert.ok(behaviorAssertions("reload_cleanup", {
      events, output: "", exitCode: 0, hostExitCodes: [0, 0],
    }).some((item) => !item.passed));
  }
  for (const [output, exitCode, hostExitCodes] of [
    ["shutdown error", 0, [0, 0]],
    ["UnhandledPromiseRejection", 0, [0, 0]],
    ["", 1, [0, 1]],
  ]) {
    assert.equal(behaviorAssertions("reload_cleanup", {
      events: [warning, listResult], output, exitCode, hostExitCodes,
    })[2].passed, false);
  }
});

test("native shell must return the exact pinned CLI version and exit cleanly", () => {
  assert.equal(behaviorAssertions("host_shell", {
    exitCode: 0, stdout: "1.2.0\r\n", stderr: "", expectedVersion: "1.2.0", shellName: "Windows PowerShell",
  })[0].passed, true);
  for (const [stdout, stderr, exitCode] of [
    ["", "", 0], ["1.2.0-extra", "", 0], ["1.2.0", "error", 0], ["1.2.0", "", 1],
  ]) {
    assert.equal(behaviorAssertions("host_shell", {
      exitCode, stdout, stderr, expectedVersion: "1.2.0", shellName: "Windows PowerShell",
    })[0].passed, false);
  }
});

test("runtime error accounting distinguishes feature-negative responses from host errors", () => {
  assert.deepEqual(countRuntimeErrors([blockedGrep], ""), { unhandled: 0, extensionLoad: 0 });
  assert.deepEqual(countRuntimeErrors([{ type: "extension_error" }], "uncaught exception"), {
    unhandled: 2, extensionLoad: 1,
  });
});
