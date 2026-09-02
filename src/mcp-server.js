import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resetRuntimeConfig } from "./config.js";
import {
  deleteMemory,
  listMemory,
  putMemory,
  relatedMemories,
  searchMemory,
} from "./memory.js";
import { readKnowledge } from "./read.js";
import { searchKnowledge } from "./search.js";
import { knowledgeStatus } from "./status.js";

/** @returns {McpServer} */
export function createMcpServer() {
  const server = new McpServer({
    name: "workspace-kb",
    version: "1.5.0",
  });

  server.registerTool(
    "kb_search",
    {
      description:
        "Search the local workspace LanceDB knowledge base (skills, docs, architecture markdown). Use before reading large guides or scanning every repo. Returns 5–8 short hits with path, heading, repo, and a snippet. Also returns relatedMemories (project ops facts). Not for personal preferences — use IDE Memories. Not a source-code index — use rg in the returned repo for code.",
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
      result.relatedMemories = relatedMemories(query, 3);
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
      result.memory = listMemory({ limit: 5 });
      return asJson(result);
    },
  );

  server.registerTool(
    "kb_memory_put",
    {
      description:
        "Store a PROJECT ops/investigation fact shared across Cursor, Codex, and CLI (ports, env topology, triage conclusions). Do NOT store personal preferences (use Cursor/Codex Memories) or AGENTS.md team rules. Redact secrets/PII. Optional ttlDays (default 90, 0=never).",
      inputSchema: {
        text: z.string().describe("Fact text, redacted"),
        key: z.string().optional().describe("Stable key for upsert"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags e.g. ops, payapi, test-env"),
        ttlDays: z.number().optional().describe("Expiry in days; 0 = never"),
        source: z.string().optional().describe("Who/what wrote this"),
      },
    },
    async ({ text, key, tags, ttlDays, source }) => {
      resetRuntimeConfig();
      return asJson(putMemory({ text, key, tags, ttlDays, source: source || "mcp" }));
    },
  );

  server.registerTool(
    "kb_memory_search",
    {
      description:
        "Search project ops facts in .workspace-kb/memory (shared Cursor+Codex+CLI). For docs/skills use kb_search instead.",
      inputSchema: {
        query: z.string().optional().describe("Keywords"),
        tag: z.string().optional().describe("Filter by tag"),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ query, tag, limit }) => {
      resetRuntimeConfig();
      return asJson(searchMemory({ query, tag, limit }));
    },
  );

  server.registerTool(
    "kb_memory_list",
    {
      description: "List recent project memory facts (non-expired by default).",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        includeExpired: z.boolean().optional(),
      },
    },
    async ({ limit, includeExpired }) => {
      resetRuntimeConfig();
      return asJson(listMemory({ limit, includeExpired }));
    },
  );

  server.registerTool(
    "kb_memory_delete",
    {
      description: "Delete a project memory fact by id or key (ops audit).",
      inputSchema: {
        id: z.string().optional(),
        key: z.string().optional(),
      },
    },
    async ({ id, key }) => {
      resetRuntimeConfig();
      return asJson(deleteMemory({ id, key }));
    },
  );

  return server;
}

function asJson(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}
