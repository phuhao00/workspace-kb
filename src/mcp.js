#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resetRuntimeConfig } from "./config.js";
import { readKnowledge } from "./read.js";
import { searchKnowledge } from "./search.js";
import { knowledgeStatus } from "./status.js";

const server = new McpServer({
  name: "workspace-kb",
  version: "1.0.0",
});

server.registerTool(
  "kb_search",
  {
    description:
      "Search the local workspace LanceDB knowledge base (skills, docs, architecture markdown). Use before reading large guides or scanning every repo. Returns 5–8 short hits with path, heading, repo, and a snippet. Then call kb_read or open only those files. Not a source-code index — use rg in the returned repo for code.",
    inputSchema: {
      query: z
        .string()
        .describe("Task nouns: symptom, service, API, hop, or skill terms"),
      limit: z.number().int().min(1).max(12).optional(),
      kind: z
        .string()
        .optional()
        .describe(
          "Optional filter: skill | wiki | docs | agents | architecture | readme | root",
        ),
      repo: z
        .string()
        .optional()
        .describe("Optional child repo filter from your config childRepos"),
    },
  },
  async ({ query, limit, kind, repo }) => {
    resetRuntimeConfig();
    const result = await searchKnowledge(query, { limit, kind, repo });
    return asJson(result);
  },
);

server.registerTool(
  "kb_read",
  {
    description:
      "Read one markdown heading from a workspace-relative path returned by kb_search. Does not dump the whole file.",
    inputSchema: {
      path: z.string().describe("Workspace-relative markdown path"),
      heading: z.string().optional().describe("Section title from kb_search"),
    },
  },
  async ({ path, heading }) => {
    resetRuntimeConfig();
    const result = readKnowledge(path, heading);
    return asJson(result);
  },
);

server.registerTool(
  "kb_status",
  {
    description:
      "Show whether the local LanceDB knowledge base is ingested, chunk counts by kind/repo, and recent usage proxy metrics (search/read counts and estimated token savings vs full files — not LLM billing).",
    inputSchema: {},
  },
  async () => {
    resetRuntimeConfig();
    const result = await knowledgeStatus();
    return asJson(result);
  },
);

function asJson(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
