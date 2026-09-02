#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionRestartMcp,
  actionRestartServer,
  actionSetup,
  actionStartIngest,
  getControlStatus,
} from "./actions.js";
import { getPackageRoot, loadRuntimeConfig } from "./config.js";
import { McpHttpGateway } from "./mcp-http.js";
import { getUsageDashboard } from "./usage.js";
import { knowledgeStatus } from "./status.js";

const WEB_DIR = path.join(getPackageRoot(), "web");

/**
 * @param {{ port?: number, host?: string, open?: boolean }} [options]
 */
export async function startDashboard(options = {}) {
  const port = Number(options.port) || Number(process.env.WORKSPACE_KB_PORT) || 8787;
  const host = options.host || "127.0.0.1";
  const cfg = loadRuntimeConfig();
  const mcpGateway = new McpHttpGateway();
  const ctx = { mcpGateway, port, host };

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
        const payload = await actionStartIngest();
        return sendJson(res, payload.ok ? 200 : 409, payload);
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
  process.stderr.write(
    `workspace-kb dashboard\n  ${url}\n  mcp:     ${url}mcp\n  workspace: ${cfg.workspaceRoot}\n  data: ${cfg.dataDir}\n`,
  );
  return { server, url, port, host, mcpGateway };
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
  const port = parsePort(process.argv.slice(2));
  await startDashboard({ port });
}

function parsePort(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port") return args[++i];
  }
  return undefined;
}
