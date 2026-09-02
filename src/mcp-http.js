import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp-server.js";

/**
 * Streamable HTTP MCP mounted on dashboard `/mcp`.
 * Restart closes all sessions so Cursor reconnects with fresh config.
 */
export class McpHttpGateway {
  constructor() {
    /** @type {Map<string, StreamableHTTPServerTransport>} */
    this.sessions = new Map();
    this.startedAt = new Date().toISOString();
    this.restartCount = 0;
    this.lastRestartAt = null;
  }

  getStatus() {
    return {
      mode: "http",
      endpoint: "/mcp",
      sessions: this.sessions.size,
      startedAt: this.startedAt,
      restartCount: this.restartCount,
      lastRestartAt: this.lastRestartAt,
    };
  }

  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   * @param {unknown} [parsedBody]
   */
  async handleRequest(req, res, parsedBody) {
    const sessionId = req.headers["mcp-session-id"];
    let transport;

    if (sessionId && this.sessions.has(String(sessionId))) {
      transport = this.sessions.get(String(sessionId));
    } else if (
      !sessionId &&
      req.method === "POST" &&
      parsedBody &&
      isInitializeRequest(parsedBody)
    ) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          if (sid && transport) {
            this.sessions.set(sid, transport);
          }
        },
      });
      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid) {
          this.sessions.delete(sid);
        }
      };
      const server = createMcpServer();
      await server.connect(transport);
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: no valid MCP session — restart MCP in dashboard",
          },
          id: null,
        }),
      );
      return;
    }

    await transport.handleRequest(req, res, parsedBody);
  }

  async restart() {
    const closing = [...this.sessions.values()].map(async (transport) => {
      try {
        transport.closeStandaloneSSEStream?.();
        await transport.close();
      } catch {
        // ignore
      }
    });
    await Promise.all(closing);
    this.sessions.clear();
    this.restartCount += 1;
    this.lastRestartAt = new Date().toISOString();
    return this.getStatus();
  }
}
