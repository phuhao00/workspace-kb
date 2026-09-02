import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "./config.js";
import { ensureDir } from "./config.js";
import { allocateDashboardPort, resolveDashboardPort } from "./port.js";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "cli.js");

function registryDir() {
  return path.join(os.homedir(), ".workspace-kb");
}

function registryPath() {
  return path.join(registryDir(), "registry.json");
}

function pidPath(port) {
  return path.join(registryDir(), `serve-${port}.pid`);
}

export function loadRegistry() {
  ensureDir(registryDir());
  if (!fs.existsSync(registryPath())) {
    return { projects: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(registryPath(), "utf8"));
  } catch {
    return { projects: [] };
  }
}

export function saveRegistry(reg) {
  ensureDir(registryDir());
  fs.writeFileSync(registryPath(), JSON.stringify(reg, null, 2), "utf8");
}

/** Register current workspace in global multi-project list. */
export function registerProject(extra = {}) {
  const cfg = loadRuntimeConfig();
  const resolved = resolveDashboardPort({
    port: extra.port !== undefined ? extra.port : undefined,
    cfg,
  });
  const port = Number(extra.port) > 0 ? Number(extra.port) : resolved.port;
  const reg = loadRegistry();
  const id = path.basename(cfg.workspaceRoot);
  const entry = {
    id,
    name: extra.name || id,
    workspaceRoot: cfg.workspaceRoot,
    configPath: cfg.configPath,
    dataDir: cfg.dataDir,
    port,
    mcpUrl: `http://127.0.0.1:${port}/mcp`,
    dashboardUrl: `http://127.0.0.1:${port}/`,
    updatedAt: new Date().toISOString(),
  };
  reg.projects = (reg.projects || []).filter(
    (p) => p.workspaceRoot !== entry.workspaceRoot && p.port !== entry.port,
  );
  reg.projects.push(entry);
  saveRegistry(reg);
  return entry;
}

export function listProjects() {
  const reg = loadRegistry();
  return (reg.projects || []).map((p) => {
    const running = isPortAlive(p.port);
    return { ...p, running };
  });
}

export function isPortAlive(port) {
  try {
    const pidFile = pidPath(port);
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
      if (pid && processExists(pid)) return true;
    }
  } catch {
    // fall through
  }
  return false;
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detach serve as background daemon.
 * @param {{ port?: unknown }} [opts]
 */
export async function startDaemon(opts = {}) {
  const cfg = loadRuntimeConfig();
  const resolved = resolveDashboardPort({ port: opts.port, cfg });
  const port = resolved.auto
    ? (await allocateDashboardPort({ port: "auto" })).port
    : resolved.port;

  if (isPortAlive(port)) {
    const entry = registerProject({ port });
    return { ok: true, alreadyRunning: true, portSource: resolved.source, ...entry };
  }

  ensureDir(registryDir());
  const logFile = path.join(registryDir(), `serve-${port}.log`);
  const out = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [CLI, "serve", "--port", String(port)], {
    cwd: cfg.workspaceRoot,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      WORKSPACE_KB_CONFIG: cfg.configPath || "",
      WORKSPACE_ROOT: cfg.workspaceRoot,
      WORKSPACE_KB_PORT: String(port),
    },
  });
  child.unref();
  fs.writeFileSync(pidPath(port), String(child.pid), "utf8");
  const entry = registerProject({ port });
  return {
    ok: true,
    alreadyRunning: false,
    pid: child.pid,
    logFile,
    portSource: resolved.auto ? `auto->${port}` : resolved.source,
    ...entry,
  };
}

/**
 * @param {{ port?: unknown }} [opts]
 */
export function stopDaemon(opts = {}) {
  const resolved = resolveDashboardPort({ port: opts.port });
  if (resolved.auto) {
    return {
      ok: false,
      error: "stop requires a concrete port — pass --port <n> or set setup.dashboardPort",
    };
  }
  const port = resolved.port;
  const pidFile = pidPath(port);
  if (!fs.existsSync(pidFile)) {
    return {
      ok: false,
      error: `no pid file for port ${port} (source=${resolved.source})`,
      port,
      source: resolved.source,
    };
  }
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), port };
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // ignore
  }
  return { ok: true, port, pid, source: resolved.source };
}
