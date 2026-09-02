import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resetRuntimeConfig } from "./config.js";
import { listProjects, registerProject } from "./daemon.js";
import { appendFeedback, summarizeFeedback } from "./feedback.js";
import { getHealth } from "./health.js";
import { ingest } from "./ingest.js";
import { runSetup } from "./setup.js";
import { knowledgeStatus } from "./status.js";

const CLI_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "cli.js",
);

/** @type {{ running: boolean, error?: string, startedAt?: string, finishedAt?: string, meta?: unknown }} */
export const ingestJob = { running: false };

/**
 * @param {{ mcpGateway?: import("./mcp-http.js").McpHttpGateway, port?: number, host?: string }} ctx
 */
export async function getControlStatus(ctx = {}) {
  resetRuntimeConfig();
  const setup = runSetup({ quiet: true });
  const kb = await knowledgeStatus();
  const health = await getHealth(ctx);
  try {
    registerProject({ port: ctx.port });
  } catch {
    // ignore
  }
  return {
    ok: true,
    kb,
    health,
    projects: listProjects(),
    feedback: summarizeFeedback({ days: 30 }),
    setup: setup.ok
      ? {
          serverId: setup.serverId,
          mcpPath: setup.mcpPath,
          dashboardPort: setup.dashboardPort,
          workspaceRoot: setup.workspaceRoot,
          mcpMode: setup.mcpMode,
        }
      : { ok: false, reason: setup.reason },
    mcp: ctx.mcpGateway?.getStatus() || { mode: "off" },
    ingest: { ...ingestJob },
    serve: {
      port: ctx.port,
      host: ctx.host,
      pid: process.pid,
    },
  };
}

export function actionSetup() {
  resetRuntimeConfig();
  const result = runSetup();
  return { ok: result.ok, ...result };
}

/**
 * @param {{ mcpGateway?: import("./mcp-http.js").McpHttpGateway }} [ctx]
 */
export async function actionRestartMcp(ctx = {}) {
  if (!ctx.mcpGateway) {
    return { ok: false, error: "HTTP MCP is only available while serve is running" };
  }
  const status = await ctx.mcpGateway.restart();
  return { ok: true, message: "MCP sessions closed — Cursor will reconnect", mcp: status };
}

/**
 * @param {{ full?: boolean }} [opts]
 */
export async function actionStartIngest(opts = {}) {
  if (ingestJob.running) {
    return { ok: false, error: "ingest already running", ingest: { ...ingestJob } };
  }
  ingestJob.running = true;
  ingestJob.error = undefined;
  ingestJob.startedAt = new Date().toISOString();
  ingestJob.finishedAt = undefined;
  ingestJob.meta = undefined;

  void (async () => {
    try {
      resetRuntimeConfig();
      ingestJob.meta = await ingest({ full: opts.full === true });
    } catch (err) {
      ingestJob.error = err instanceof Error ? err.message : String(err);
    } finally {
      ingestJob.running = false;
      ingestJob.finishedAt = new Date().toISOString();
    }
  })();

  return {
    ok: true,
    message: opts.full ? "full ingest started" : "incremental ingest started",
    ingest: { ...ingestJob },
  };
}

export function actionFeedback(body = {}) {
  const row = appendFeedback({
    useful: body.useful !== false,
    query: body.query,
    path: body.path,
    heading: body.heading,
    score: body.score,
    note: body.note,
  });
  return { ok: true, feedback: row, summary: summarizeFeedback({ days: 30 }) };
}

/**
 * @param {{ port?: number, host?: string }} ctx
 */
export function actionRestartServer(ctx = {}) {
  const port = ctx.port || 8787;
  const host = ctx.host || "127.0.0.1";

  const child = spawn(process.execPath, [CLI_PATH, "serve", "--port", String(port)], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();

  setTimeout(() => process.exit(0), 300);
  return {
    ok: true,
    message: "dashboard restarting",
    url: `http://${host}:${port}/`,
    pid: child.pid,
  };
}
