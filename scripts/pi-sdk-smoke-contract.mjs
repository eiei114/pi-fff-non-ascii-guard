export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_VERSIONS = Object.freeze({
  "@earendil-works/pi-agent-core": "1.2.0",
  "@earendil-works/pi-ai": "1.2.0",
  "@earendil-works/pi-coding-agent": "1.2.0",
  "@earendil-works/pi-tui": "1.2.0",
});
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function startupWarning(events) {
  return events.find((event) => event?.type === "extension_ui_request"
    && event.method === "notify"
    && event.notifyType === "warning"
    && typeof event.message === "string"
    && event.message.includes("non-ASCII path(s) detected"));
}

function toolResult(events, name) {
  const execution = events.find((event) => event?.type === "tool_execution_end" && event.toolName === name);
  const message = events.find((event) => event?.type === "message_end"
    && event.message?.role === "toolResult" && event.message.toolName === name);
  const result = execution?.result;
  const content = result?.content ?? message?.message?.content ?? [];
  const text = content.filter((item) => item?.type === "text").map((item) => item.text).join("\n");
  const details = result?.details ?? message?.message?.details;
  return {
    found: !!execution || !!message,
    isError: execution?.isError ?? message?.message?.isError,
    text,
    details,
  };
}

export function behaviorAssertions(name, observation) {
  const { events = [], output = "", exitCode = null, hostExitCodes = [], expectedVersion } = observation;
  if (name === "extension_load") {
    const warning = startupWarning(events);
    const observed = warning ? { notifyType: warning.notifyType, message: warning.message } : null;
    return [assertion("extension_registered",
      "The actual Pi host loads the extension and warns about the Japanese fixture path",
      observed, !!warning && warning.message.includes("日本語.txt"))];
  }
  if (name === "happy_path") {
    const result = toolResult(events, "list_non_ascii_paths");
    const entries = result.details?.entries;
    const observed = { found: result.found, isError: result.isError, text: result.text,
      count: result.details?.count, files: result.details?.files, dirs: result.details?.dirs, entries };
    const hasExpectedPath = Array.isArray(entries)
      ? entries.some((entry) => entry.relativePath === "日本語.txt" && entry.kind === "file")
      : result.text.includes("日本語.txt");
    return [assertion("feature_response",
      "The registered list_non_ascii_paths tool returns the actual Japanese file and its count",
      observed, result.found && result.isError === false && result.details?.count === 1 && hasExpectedPath)];
  }
  if (name === "error_path") {
    const result = toolResult(events, "grep");
    const observed = { found: result.found, isError: result.isError, text: result.text };
    return [assertion("handled_error",
      "The real extension blocks Pi's grep tool while a non-ASCII path remains, with a handled tool error",
      observed, result.found && result.isError === true
        && result.text.includes("Blocked grep")
        && result.text.includes("日本語.txt"))];
  }
  if (name === "reload_cleanup") {
    const warning = startupWarning(events);
    const result = toolResult(events, "list_non_ascii_paths");
    const entries = result.details?.entries;
    const feature = result.found && result.isError === false && result.details?.count === 1
      && (Array.isArray(entries)
        ? entries.some((entry) => entry.relativePath === "日本語.txt" && entry.kind === "file")
        : result.text.includes("日本語.txt"));
    return [
      assertion("reloaded_extension_registered",
        "The second actual Pi host reloads the extension and emits its fixture warning",
        warning ? { notifyType: warning.notifyType, message: warning.message } : null,
        !!warning && warning.message.includes("日本語.txt")),
      assertion("reloaded_feature_response",
        "The second host executes list_non_ascii_paths and returns the real fixture entry",
        { found: result.found, isError: result.isError, count: result.details?.count,
          entries, text: result.text }, feature),
      assertion("clean_shutdown",
        "Both real Pi hosts exit naturally with status zero and no shutdown/unhandled errors",
        { exit_code: exitCode, host_exit_codes: hostExitCodes,
          errors: UNHANDLED_ERROR_PATTERN.test(output) },
        exitCode === 0 && hostExitCodes.length === 2 && hostExitCodes.every((code) => code === 0)
          && !UNHANDLED_ERROR_PATTERN.test(output)),
    ];
  }
  if (name === "host_shell") {
    const observed = { exit_code: exitCode, stdout: observation.stdout?.trim() ?? "",
      stderr: observation.stderr?.trim() ?? "", expectedVersion, shell: observation.shellName };
    return [assertion("native_shell_boundary",
      "The native host shell launches the locally pinned Pi CLI and returns its exact version",
      observed, exitCode === 0 && observed.stdout === expectedVersion && observed.stderr === "")];
  }
  throw new Error(`Unknown smoke case: ${name}`);
}

export function countRuntimeErrors(events, output) {
  return {
    unhandled: Number(UNHANDLED_ERROR_PATTERN.test(output))
      + events.filter((event) => event?.type === "extension_error").length,
    extensionLoad: Number(EXTENSION_LOAD_ERROR_PATTERN.test(output))
      + events.filter((event) => event?.type === "extension_error").length,
  };
}
