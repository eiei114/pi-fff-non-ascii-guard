import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  behaviorAssertions,
  countRuntimeErrors,
  SDK_VERSIONS,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = resolve(root, "docs/verification/pi-sdk-smoke.json");
const extensionPath = resolve(root, "extensions/pi-fff-non-ascii-guard.ts");
const providerPath = resolve(root, "tests/fixtures/pi-sdk-smoke-provider.mjs");
const probeTimeoutMs = 15_000;
const cleanupGraceMs = 1_000;
const maxCapturedOutputChars = 100_000;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const packageVersions = {};

for (const [name, version] of Object.entries(SDK_VERSIONS)) {
  const installed = readJson(resolve(root, "node_modules", name, "package.json")).version;
  packageVersions[name] = installed;
  if (manifest.devDependencies?.[name] !== version || installed !== version) {
    throw new Error(`Smoke requires ${name} dev/test pin and installed version ${version}; got ${manifest.devDependencies?.[name]} / ${installed}`);
  }
}

const piPackageDir = resolve(root, "node_modules/@earendil-works/pi-coding-agent");
const piManifest = readJson(resolve(piPackageDir, "package.json"));
const piEntry = typeof piManifest.bin === "string" ? piManifest.bin : piManifest.bin?.pi;
if (!piEntry) throw new Error("The installed Pi SDK manifest does not declare the pi CLI");
const piCli = resolve(piPackageDir, piEntry);
const expectedVersion = piManifest.version;
if (expectedVersion !== SDK_VERSIONS["@earendil-works/pi-coding-agent"]) {
  throw new Error(`Expected Pi CLI ${SDK_VERSIONS["@earendil-works/pi-coding-agent"]}, got ${expectedVersion}`);
}

function createWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-fff-smoke-workspace-"));
  writeFileSync(join(cwd, "日本語.txt"), "guard smoke fixture\n", "utf8");
  return cwd;
}

function redact(text, paths) {
  let result = text;
  for (const [path, replacement] of paths) {
    if (!path) continue;
    const variants = new Set([
      path,
      path.replaceAll("\\", "/"),
      JSON.stringify(path).slice(1, -1),
      JSON.stringify(path.replaceAll("\\", "/")).slice(1, -1),
    ]);
    for (const variant of variants) result = result.replaceAll(variant, replacement);
  }
  return result;
}

function createRpcHost({ cwd, agentDir, mode }) {
  const args = [
    piCli,
    "--offline", "--no-session", "--approve", "--no-extensions",
    "--no-skills", "--no-context-files", "--no-prompt-templates", "--no-mcp", "--no-themes",
    "--model", "dotguard-smoke/deterministic",
    "--tools", mode === "error_path" ? "grep" : "list_non_ascii_paths,sanitize_filenames",
    "-e", extensionPath, "-e", providerPath, "--mode", "rpc",
  ];
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
    PI_CODING_AGENT_SESSION_DIR: join(agentDir, "sessions"),
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0",
    NO_COLOR: "1",
  };
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const startedAt = Date.now();
  const deadline = startedAt + probeTimeoutMs;
  let stdout = "";
  let stderr = "";
  let stdoutBuffer = "";
  let overflow = false;
  let timedOut = false;
  let closeTimedOut = false;
  let exitCode = null;
  let signal = null;
  let closed = false;
  const events = [];
  const protocolErrors = [];
  const waiters = new Set();

  const failWaiters = (error) => {
    for (const waiter of waiters) waiter.reject(error);
    waiters.clear();
  };
  const recordLine = (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      events.push(event);
      for (const waiter of [...waiters]) {
        if (waiter.predicate(event)) {
          waiters.delete(waiter);
          clearTimeout(waiter.timer);
          waiter.resolve(event);
        }
      }
    } catch {
      protocolErrors.push(`Non-JSON Pi RPC stdout line: ${line.slice(0, 500)}`);
    }
  };
  const appendOutput = (destination, chunk) => {
    const text = chunk.toString("utf8");
    if (destination === "stdout") {
      stdout += text;
      stdoutBuffer += text;
      let newline;
      while ((newline = stdoutBuffer.indexOf("\n")) !== -1) {
        const line = stdoutBuffer.slice(0, newline).replace(/\r$/, "");
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        recordLine(line);
      }
    } else {
      stderr += text;
    }
    if (stdout.length + stderr.length > maxCapturedOutputChars) {
      overflow = true;
      child.kill();
    }
  };

  child.stdout.on("data", (chunk) => appendOutput("stdout", chunk));
  child.stderr.on("data", (chunk) => appendOutput("stderr", chunk));
  const closePromise = new Promise((resolveClose) => {
    child.once("close", (code, closeSignal) => {
      if (stdoutBuffer.trim()) recordLine(stdoutBuffer);
      stdoutBuffer = "";
      exitCode = code;
      signal = closeSignal;
      closed = true;
      clearTimeout(deadlineTimer);
      failWaiters(new Error(`Pi host exited before completing the RPC probe (code=${code}, signal=${closeSignal})`));
      resolveClose({ code, signal: closeSignal });
    });
  });
  const deadlineTimer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, probeTimeoutMs);

  function send(command) {
    if (closed || child.stdin.destroyed) throw new Error("Cannot send RPC command to an exited Pi host");
    child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  function waitFor(predicate, label) {
    const existing = events.find(predicate);
    if (existing) return Promise.resolve(existing);
    if (closed) return Promise.reject(new Error(`Pi host exited before ${label}`));
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(new Error(`Pi RPC deadline reached waiting for ${label}`));
    return new Promise((resolveWait, rejectWait) => {
      const waiter = { predicate, resolve: resolveWait, reject: rejectWait, timer: undefined };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        rejectWait(new Error(`Pi RPC deadline reached waiting for ${label}`));
      }, remaining);
      waiters.add(waiter);
    });
  }

  async function complete(commandMode) {
    const stateId = `smoke-state-${commandMode}`;
    send({ id: stateId, type: "get_state" });
    const state = await waitFor((event) => event?.type === "response" && event.id === stateId, "get_state response");
    if (state.success !== true || !state.data?.sessionId) throw new Error(`Pi get_state failed: ${JSON.stringify(state)}`);

    if (commandMode !== "extension_load") {
      const promptId = `smoke-prompt-${commandMode}`;
      const message = commandMode === "error_path" ? "dotguard-smoke:gate" : "dotguard-smoke:list";
      send({ id: promptId, type: "prompt", message });
      const response = await waitFor((event) => event?.type === "response" && event.id === promptId, "prompt response");
      if (response.success !== true) throw new Error(`Pi prompt failed: ${JSON.stringify(response)}`);
      const settled = await waitFor((event) => event?.type === "agent_settled", "agent_settled after feature response");
      if (settled.aborted === true) throw new Error("Pi agent aborted before completing the feature response");
      const afterId = `smoke-after-${commandMode}`;
      send({ id: afterId, type: "get_state" });
      const after = await waitFor((event) => event?.type === "response" && event.id === afterId, "post-feature get_state response");
      if (after.success !== true || after.data?.isStreaming !== false) {
        throw new Error(`Pi host did not settle before cleanup: ${JSON.stringify(after)}`);
      }
    }
  }

  async function closeGracefully() {
    if (!closed) {
      child.stdin.end();
      const firstWait = await Promise.race([
        closePromise.then(() => true),
        new Promise((resolveWait) => setTimeout(() => resolveWait(false), cleanupGraceMs - 100)),
      ]);
      if (!firstWait && !closed) {
        closeTimedOut = true;
        child.kill();
        await Promise.race([
          closePromise,
          new Promise((resolveWait) => setTimeout(resolveWait, 100)),
        ]);
      }
    }
    return { exitCode, signal, closed, closeTimedOut, timedOut };
  }

  function stopAfterFailure() {
    if (!closed) child.kill();
  }

  function result() {
    const sanitizedStdout = redact(stdout, [[cwd, "<isolated-workspace>"], [agentDir, "<isolated-agent-dir>"], [root, "<checkout>"]]);
    const sanitizedStderr = redact(stderr, [[cwd, "<isolated-workspace>"], [agentDir, "<isolated-agent-dir>"], [root, "<checkout>"]]);
    return { events, stdout: sanitizedStdout, stderr: sanitizedStderr, exitCode, signal, closed,
      closeTimedOut, timedOut, overflow, protocolErrors };
  }

  return { complete, closeGracefully, stopAfterFailure, result, deadline, get closed() { return closed; } };
}

async function runRpcHost({ mode, cwd, agentDir }) {
  const host = createRpcHost({ mode, cwd, agentDir });
  let failure;
  try {
    await host.complete(mode);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    if (failure) host.stopAfterFailure();
    if (!host.closed) await host.closeGracefully();
  }
  const result = host.result();
  result.allEvents = result.events;
  if (failure) result.failure = failure;
  return result;
}

function makeProbeCase(name, host, extra = {}) {
  const stdout = host.stdout ?? "";
  const stderr = host.stderr ?? "";
  const output = `${stdout}${stderr}`;
  const runtimeErrors = countRuntimeErrors(host.allEvents ?? host.events ?? [], output);
  const assertions = behaviorAssertions(name, { ...host, ...extra, output, exitCode: host.exitCode,
    hostExitCodes: extra.hostExitCodes ?? [] });
  const passed = host.exitCode === 0 && host.signal === null && host.closed && !host.closeTimedOut
    && !host.timedOut && !host.overflow && (host.protocolErrors?.length ?? 0) === 0
    && !host.failure && runtimeErrors.unhandled === 0 && runtimeErrors.extensionLoad === 0
    && assertions.every((item) => item.passed);
  const evidenceEvents = (host.allEvents ?? host.events ?? []).filter((event) =>
    event?.type === "extension_ui_request"
    || event?.type === "extension_error"
    || event?.type === "tool_execution_end"
    || (event?.type === "message_end" && event.message?.role === "toolResult")
    || (event?.type === "response" && ["get_state", "prompt"].includes(event.command))
    || event?.type === "agent_settled");
  const evidence = JSON.stringify({ captured_rpc_events: evidenceEvents,
    exit_code: host.exitCode, host_exit_codes: extra.hostExitCodes ?? [], signal: host.signal,
    stderr: stderr.trim() || null }, null, 2);
  return { name, command: "npm run smoke:pi", exit_code: host.exitCode, passed, evidence, assertions,
    runtimeErrors, hostExitCodes: extra.hostExitCodes ?? [], failure: host.failure,
    overflow: host.overflow, protocolErrors: host.protocolErrors };
}

function shellCase() {
  let result;
  let shellName;
  const agentDir = mkdtempSync(join(tmpdir(), "pi-fff-host-shell-agent-"));
  try {
    if (process.platform === "win32") {
      shellName = "Windows PowerShell";
      const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
      const quote = (value) => `'${value.replaceAll("'", "''")}'`;
      const command = `& ${quote(process.execPath)} ${quote(piCli)} --version; exit $LASTEXITCODE`;
      result = spawnSync(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
        cwd: root, encoding: "utf8", timeout: probeTimeoutMs, windowsHide: true,
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: join(agentDir, "sessions"), PI_OFFLINE: "1", PI_TELEMETRY: "0", NO_COLOR: "1" },
      });
    } else {
      shellName = "/bin/sh (POSIX)";
      result = spawnSync("/bin/sh", ["-c", '"$1" "$2" --version', "pi-host-shell", process.execPath, piCli], {
        cwd: root, encoding: "utf8", timeout: probeTimeoutMs, windowsHide: true,
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: join(agentDir, "sessions"), PI_OFFLINE: "1", PI_TELEMETRY: "0", NO_COLOR: "1" },
      });
    }
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
  const exitCode = result.status;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? result.error?.message ?? "";
  const output = `${stdout}${stderr}`;
  const runtimeErrors = countRuntimeErrors([], output);
  const assertions = behaviorAssertions("host_shell", { exitCode, stdout, stderr, expectedVersion, shellName });
  const timedOut = result.error?.code === "ETIMEDOUT";
  const passed = exitCode === 0 && !result.error && !timedOut && runtimeErrors.unhandled === 0
    && runtimeErrors.extensionLoad === 0 && assertions.every((item) => item.passed);
  const evidence = output.length <= 6_000 ? output : `${output.slice(0, 6_000)}\n[output truncated after full-output checks]`;
  return { name: "host_shell", command: "npm run smoke:pi", exit_code: exitCode, passed, evidence, assertions,
    runtimeErrors, shell: shellName, timedOut, failure: result.error?.message ?? null };
}

function createSuccessfulReport(cases) {
  const unhandledErrors = cases.reduce((sum, item) => sum + item.runtimeErrors.unhandled, 0);
  const extensionLoadErrors = cases.reduce((sum, item) => sum + item.runtimeErrors.extensionLoad, 0)
    + Number(cases.find((item) => item.name === "extension_load")?.passed !== true);
  return {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: packageVersions,
    platform: process.platform,
    model_inference: "offline deterministic faux provider; Pi 1.1.0 host, extension loader, lifecycle and feature paths are real",
    unhandled_errors: unhandledErrors,
    extension_load_errors: extensionLoadErrors,
    cases: cases.map(({ runtimeErrors: _runtimeErrors, hostExitCodes: _hostExitCodes,
      failure: _failure, overflow: _overflow, protocolErrors: _protocolErrors, shell: _shell,
      timedOut: _timedOut, ...item }) => item),
  };
}

async function main() {
  const temporaryPaths = [];
  const cases = [];
  try {
    for (const name of ["extension_load", "happy_path", "error_path"]) {
      const cwd = createWorkspace();
      const agentDir = mkdtempSync(join(tmpdir(), "pi-fff-smoke-agent-"));
      temporaryPaths.push(cwd, agentDir);
      const host = await runRpcHost({ mode: name, cwd, agentDir });
      cases.push(makeProbeCase(name, host));
    }

    const reloadCwd = createWorkspace();
    const reloadAgentDir = mkdtempSync(join(tmpdir(), "pi-fff-smoke-reload-agent-"));
    temporaryPaths.push(reloadCwd, reloadAgentDir);
    const firstHost = await runRpcHost({ mode: "extension_load", cwd: reloadCwd, agentDir: reloadAgentDir });
    const secondHost = await runRpcHost({ mode: "reload_cleanup", cwd: reloadCwd, agentDir: reloadAgentDir });
    const combined = {
      ...secondHost,
      stdout: `${firstHost.stdout}\n[second Pi host]\n${secondHost.stdout}`,
      stderr: `${firstHost.stderr}\n[second Pi host]\n${secondHost.stderr}`,
      events: secondHost.events,
      allEvents: [...firstHost.events, ...secondHost.events],
      exitCode: secondHost.exitCode,
      signal: secondHost.signal,
      closed: firstHost.closed && secondHost.closed,
      closeTimedOut: firstHost.closeTimedOut || secondHost.closeTimedOut,
      timedOut: firstHost.timedOut || secondHost.timedOut,
      overflow: firstHost.overflow || secondHost.overflow,
      protocolErrors: [...firstHost.protocolErrors, ...secondHost.protocolErrors],
      failure: firstHost.failure ?? secondHost.failure,
    };
    cases.push(makeProbeCase("reload_cleanup", combined, { hostExitCodes: [firstHost.exitCode, secondHost.exitCode] }));

    cases.push(shellCase());
    const report = createSuccessfulReport(cases);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT,
      platform: process.platform, cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })),
      unhandled_errors: report.unhandled_errors, extension_load_errors: report.extension_load_errors }));
    if (cases.some((item) => !item.passed) || report.unhandled_errors !== 0 || report.extension_load_errors !== 0) {
      process.exitCode = 1;
    }
  } finally {
    for (const path of temporaryPaths) rmSync(path, { recursive: true, force: true });
  }
}

await main();
