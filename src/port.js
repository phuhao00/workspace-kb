import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { loadRuntimeConfig } from "./config.js";

/** Fallback only when config/env/CLI omit a port — any 1–65535 is valid. */
export const DEFAULT_DASHBOARD_PORT = 8787;

/**
 * Normalize a user/port config value.
 * Accepts number|string; `0` / `auto` mean “pick a free port”.
 * @param {unknown} value
 * @returns {{ mode: "fixed", port: number } | { mode: "auto" } | { mode: "invalid", error: string }}
 */
export function normalizePortSpec(value) {
  if (value === undefined || value === null || value === "") {
    return { mode: "invalid", error: "empty port" };
  }
  const raw = String(value).trim().toLowerCase();
  if (raw === "auto" || raw === "0") {
    return { mode: "auto" };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return {
      mode: "invalid",
      error: `invalid port "${value}" (use 1–65535, or auto/0)`,
    };
  }
  return { mode: "fixed", port: n };
}

/**
 * Resolve dashboard/MCP listen port for the current workspace.
 * Priority: explicit CLI/API → WORKSPACE_KB_PORT → setup.dashboardPort →
 * registry entry for this workspace → DEFAULT_DASHBOARD_PORT.
 *
 * @param {{ port?: unknown, cfg?: ReturnType<typeof loadRuntimeConfig> }} [opts]
 * @returns {{ port: number, auto: boolean, source: string }}
 */
export function resolveDashboardPort(opts = {}) {
  const cfg = opts.cfg || loadRuntimeConfig();
  const candidates = [
    { value: opts.port, source: "cli" },
    { value: process.env.WORKSPACE_KB_PORT, source: "env" },
    { value: cfg.setup?.dashboardPort, source: "config" },
    { value: registryPortForWorkspace(cfg.workspaceRoot), source: "registry" },
    { value: DEFAULT_DASHBOARD_PORT, source: "default" },
  ];

  for (const c of candidates) {
    if (c.value === undefined || c.value === null || c.value === "") continue;
    const spec = normalizePortSpec(c.value);
    if (spec.mode === "invalid") {
      if (c.source === "cli") {
        throw new Error(spec.error);
      }
      continue;
    }
    if (spec.mode === "auto") {
      return { port: 0, auto: true, source: c.source };
    }
    return { port: spec.port, auto: false, source: c.source };
  }
  return { port: DEFAULT_DASHBOARD_PORT, auto: false, source: "default" };
}

/**
 * Bind probe: return a free TCP port on 127.0.0.1.
 * If `preferred` is free, use it; otherwise let the OS assign (listen 0).
 * @param {number} [preferred]
 * @returns {Promise<number>}
 */
export function findFreePort(preferred) {
  const prefer = Number(preferred);
  const tryPreferred = Number.isInteger(prefer) && prefer >= 1 && prefer <= 65535;

  return new Promise((resolve, reject) => {
    const tryListen = (portHint) => {
      const server = net.createServer();
      server.unref();
      server.once("error", (err) => {
        if (portHint && /** @type {NodeJS.ErrnoException} */ (err).code === "EADDRINUSE") {
          tryListen(0);
          return;
        }
        reject(err);
      });
      server.listen(portHint, "127.0.0.1", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        server.close((closeErr) => {
          if (closeErr) reject(closeErr);
          else if (!port) reject(new Error("failed to allocate free port"));
          else resolve(port);
        });
      });
    };
    tryListen(tryPreferred ? prefer : 0);
  });
}

/**
 * Pick the listen port for serve/start.
 * @param {{ port?: unknown, autoFallback?: boolean }} [opts]
 * @returns {Promise<{ port: number, source: string, auto: boolean }>}
 */
export async function allocateDashboardPort(opts = {}) {
  const resolved = resolveDashboardPort({ port: opts.port });
  if (resolved.auto) {
    const port = await findFreePort();
    return { port, source: resolved.source, auto: true };
  }
  if (opts.autoFallback) {
    const port = await findFreePort(resolved.port);
    return {
      port,
      source: port === resolved.port ? resolved.source : `${resolved.source}+free`,
      auto: port !== resolved.port,
    };
  }
  return { port: resolved.port, source: resolved.source, auto: false };
}

function registryPortForWorkspace(workspaceRoot) {
  try {
    const file = path.join(os.homedir(), ".workspace-kb", "registry.json");
    if (!fs.existsSync(file)) return undefined;
    const reg = JSON.parse(fs.readFileSync(file, "utf8"));
    const hit = (reg.projects || []).find(
      (p) =>
        String(p.workspaceRoot || "").toLowerCase() ===
        String(workspaceRoot || "").toLowerCase(),
    );
    return hit?.port;
  } catch {
    return undefined;
  }
}
