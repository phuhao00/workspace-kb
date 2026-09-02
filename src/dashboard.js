#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionFeedback,
  actionMemoryDelete,
  actionMemoryList,
  actionMemoryPrune,
  actionMemoryPut,
  actionMemorySearch,
  actionRestartMcp,
  actionRestartServer,
  actionSetup,
  actionStartIngest,
  getControlStatus,
} from "./actions.js";
import { getPackageRoot, loadRuntimeConfig, resetRuntimeConfig } from "./config.js";
import { getHealth } from "./health.js";
import { McpHttpGateway } from "./mcp-http.js";
import { getUsageDashboard } from "./usage.js";
import { knowledgeStatus } from "./status.js";
import { summarizeFeedback } from "./feedback.js";
import { listProjects } from "./daemon.js";
import { allocateDashboardPort } from "./port.js";

const WEB_DIR = path.join(getPackageRoot(), "web");

/**
 * @param {{ port?: number|string, host?: string, open?: boolean, watch?: boolean }} [options]
 */
export async function startDashboard(options = {}) {
  const allocated = await allocateDashboardPort({ port: options.port });
  const port = allocated.port;
  const host = options.host || "127.0.0.1";
  const cfg = loadRuntimeConfig();
  const mcpGateway = new McpHttpGateway();
  const ctx = { mcpGateway, port, host, portSource: allocated.source };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);

      if (url.pathname === "/mcp") {
        const body =
          req.method === "POST" || req.method === "DELETE"
            ? await readJsonBody(req)
            : undefined;
        return mcpGateway.handleRequest(req, res, body);
      }

      if (url.pathname === "/api/control" && req.method === "GET") {
        const payload = await getControlStatus(ctx);
        return sendJson(res, 200, payload);
      }

      if (url.pathname === "/api/actions/setup" && req.method === "POST") {
        return sendJson(res, 200, actionSetup());
      }

      if (url.pathname === "/api/actions/restart-mcp" && req.method === "POST") {
        const payload = await actionRestartMcp(ctx);
        return sendJson(res, payload.ok ? 200 : 400, payload);
      }

      if (url.pathname === "/api/actions/ingest" && req.method === "POST") {
        const body = (await readJsonBody(req)) || {};
        const payload = await actionStartIngest({ full: body.full === true });
        return sendJson(res, payload.ok ? 200 : 409, payload);
      }

      if (url.pathname === "/api/actions/feedback" && req.method === "POST") {
        const body = (await readJsonBody(req)) || {};
        return sendJson(res, 200, actionFeedback(body));
      }

      if (url.pathname === "/api/health" && req.method === "GET") {
        return sendJson(res, 200, await getHealth(ctx));
      }

      if (url.pathname === "/api/projects" && req.method === "GET") {
        return sendJson(res, 200, { ok: true, projects: listProjects() });
      }

      if (url.pathname === "/api/feedback" && req.method === "GET") {
        return sendJson(res, 200, {
          ok: true,
          ...summarizeFeedback({ days: url.searchParams.get("days") || 30 }),
        });
      }

      if (url.pathname === "/api/memory" && req.method === "GET") {
        const q = url.searchParams.get("q");
        if (q) {
          return sendJson(
            res,
            200,
            actionMemorySearch({
              query: q,
              tag: url.searchParams.get("tag") || undefined,
              limit: url.searchParams.get("limit") || 20,
              includeExpired: url.searchParams.get("includeExpired") === "1",
            }),
          );
        }
        return sendJson(
          res,
          200,
          actionMemoryList({
            limit: url.searchParams.get("limit") || 50,
            includeExpired: url.searchParams.get("includeExpired"),
          }),
        );
      }

      if (url.pathname === "/api/actions/memory-put" && req.method === "POST") {
        const body = (await readJsonBody(req)) || {};
        const payload = actionMemoryPut(body);
        return sendJson(res, payload.ok ? 200 : 400, payload);
      }

      if (url.pathname === "/api/actions/memory-delete" && req.method === "POST") {
        const body = (await readJsonBody(req)) || {};
        const payload = actionMemoryDelete(body);
        return sendJson(res, payload.ok ? 200 : 404, payload);
      }

      if (url.pathname === "/api/actions/memory-prune" && req.method === "POST") {
        return sendJson(res, 200, actionMemoryPrune());
      }

      if (url.pathname === "/api/actions/restart-server" && req.method === "POST") {
        const payload = actionRestartServer(ctx);
        sendJson(res, 200, payload);
        return;
      }

      if (url.pathname === "/api/usage") {
        const days = url.searchParams.get("days") || "7";
        const recent = url.searchParams.get("recent") || "50";
        const payload = getUsageDashboard({ days, recent });
        return sendJson(res, 200, payload);
      }

      if (url.pathname === "/api/status") {
        const payload = await knowledgeStatus();
        return sendJson(res, 200, payload);
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return sendFile(res, path.join(WEB_DIR, "index.html"), "text/html; charset=utf-8");
      }
      if (url.pathname === "/app.js") {
        return sendFile(res, path.join(WEB_DIR, "app.js"), "application/javascript; charset=utf-8");
      }
      if (url.pathname === "/style.css") {
        return sendFile(res, path.join(WEB_DIR, "style.css"), "text/css; charset=utf-8");
      }

      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const url = `http://${host}:${port}/`;

  let setupSync = null;
  try {
    const { syncDashboardPortBindings } = await import("./setup.js");
    const synced = syncDashboardPortBindings(port, {
      quiet: true,
      startDir: cfg.workspaceRoot,
    });
    resetRuntimeConfig();
    setupSync = {
      ok: synced.ok !== false,
      dashboardPort: synced.dashboardPort ?? port,
      mcpPath: synced.mcpPath || null,
      mcpUrl: `http://127.0.0.1:${port}/mcp`,
    };
  } catch (err) {
    setupSync = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  process.stderr.write(
    `workspace-kb dashboard\n  ${url}\n  mcp:     ${url}mcp\n  port: ${port} (source=${allocated.source}${allocated.auto ? ", auto" : ""})\n  workspace: ${cfg.workspaceRoot}\n  data: ${cfg.dataDir}\n`,
  );
  if (setupSync?.ok) {
    process.stderr.write(
      `  synced:  setup.dashboardPort=${setupSync.dashboardPort} · ${setupSync.mcpPath || "mcp.json"}\n`,
    );
  }

  const noWatch =
    options.watch === false ||
    process.env.WORKSPACE_KB_AUTO_INGEST === "0" ||
    process.env.WORKSPACE_KB_AUTO_INGEST === "false";
  let autoIngest = { enabled: false };
  if (!noWatch) {
    try {
      const { startAutoIngest } = await import("./watch.js");
      autoIngest = startAutoIngest({ enabled: true });
    } catch (err) {
      process.stderr.write(
        `  auto-ingest failed: ${err instanceof Error ? err.message : err}\n`,
      );
    }
  }

  return {
    server,
    url,
    port,
    host,
    mcpGateway,
    portSource: allocated.source,
    setupSync,
    autoIngest,
  };
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function sendFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    sendJson(res, 404, { ok: false, error: `missing ${path.basename(filePath)}` });
    return;
  }
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirect) {
  let port;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") port = argv[++i];
  }
  await startDashboard({ port });
}
