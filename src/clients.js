import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @typedef {"cursor" | "codex" | "workbuddy" | "continue"} ClientId */

export const DEFAULT_CLIENTS = /** @type {ClientId[]} */ ([
  "cursor",
  "codex",
  "workbuddy",
  "continue",
]);

/**
 * @param {unknown} raw
 * @returns {ClientId[]}
 */
export function resolveClients(raw) {
  if (raw === false || raw === "none") return [];
  if (Array.isArray(raw) && raw.length > 0) {
    return normalizeClientList(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    return normalizeClientList(raw.split(/[,，\s]+/));
  }
  return [...DEFAULT_CLIENTS];
}

/**
 * @param {unknown[]} list
 * @returns {ClientId[]}
 */
function normalizeClientList(list) {
  /** @type {Set<ClientId>} */
  const out = new Set();
  for (const item of list) {
    const id = String(item || "")
      .trim()
      .toLowerCase();
    if (id === "cursor") out.add("cursor");
    else if (id === "codex") out.add("codex");
    else if (id === "workbuddy" || id === "codebuddy" || id === "wb") out.add("workbuddy");
    else if (id === "continue") out.add("continue");
  }
  return [...out];
}

/**
 * @param {string[]} args
 * @returns {{ clients?: ClientId[], global?: boolean }}
 */
export function parseClientsCliArgs(args) {
  /** @type {{ clients?: ClientId[], global?: boolean }} */
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--clients" && args[i + 1]) {
      out.clients = resolveClients(args[++i]);
      continue;
    }
    if (args[i] === "--global") {
      out.global = true;
    }
  }
  return out;
}

/**
 * Probe which client config files already exist for this workspace.
 * @param {string} workspaceRoot
 * @param {string} serverId
 * @param {number} dashboardPort
 */
export function detectConfiguredClients(workspaceRoot, serverId, dashboardPort) {
  const mcpUrl = `http://127.0.0.1:${dashboardPort}/mcp`;
  const items = [];

  const cursorMcp = path.join(workspaceRoot, ".cursor", "mcp.json");
  items.push(clientProbe("cursor", cursorMcp, () => jsonHasServerUrl(cursorMcp, serverId, mcpUrl)));

  const codexToml = path.join(workspaceRoot, ".codex", "config.toml");
  items.push(
    clientProbe("codex", codexToml, () => tomlHasMcpUrl(codexToml, serverId, mcpUrl)),
  );

  const wbMcp = path.join(workspaceRoot, ".mcp.json");
  items.push(clientProbe("workbuddy", wbMcp, () => jsonHasServerUrl(wbMcp, serverId, mcpUrl)));

  const pluginMcp = path.join(workspaceRoot, "plugins", "workspace-kb", ".mcp.json");
  items.push(
    clientProbe("workbuddy-plugin", pluginMcp, () =>
      jsonHasServerUrl(pluginMcp, serverId, mcpUrl),
    ),
  );

  const continueSnippet = path.join(workspaceRoot, ".continue", "workspace-kb.mcp.json");
  items.push(
    clientProbe("continue", continueSnippet, () =>
      jsonHasServerUrl(continueSnippet, serverId, mcpUrl),
    ),
  );

  return {
    mcpUrl,
    serverId,
    clients: items,
  };
}

/**
 * @param {string} id
 * @param {string} configPath
 * @param {() => boolean} matches
 */
function clientProbe(id, configPath, matches) {
  const exists = fs.existsSync(configPath);
  let ok = false;
  if (exists) {
    try {
      ok = matches();
    } catch {
      ok = false;
    }
  }
  return { id, path: configPath, exists, ok };
}

/**
 * @param {string} filePath
 * @param {string} serverId
 * @param {string} mcpUrl
 */
function jsonHasServerUrl(filePath, serverId, mcpUrl) {
  const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const servers = doc.mcpServers || doc.mcp || {};
  const entry = servers[serverId];
  if (!entry || typeof entry !== "object") return false;
  return String(entry.url || "") === mcpUrl;
}

/**
 * @param {string} filePath
 * @param {string} serverId
 * @param {string} mcpUrl
 */
function tomlHasMcpUrl(filePath, serverId, mcpUrl) {
  const text = fs.readFileSync(filePath, "utf8");
  const section = `[mcp_servers.${serverId}]`;
  const idx = text.indexOf(section);
  if (idx < 0) return false;
  const rest = text.slice(idx + section.length);
  const next = rest.search(/\n\[/);
  const body = next >= 0 ? rest.slice(0, next) : rest;
  return body.includes(`url = "${mcpUrl}"`) || body.includes(`url = '${mcpUrl}'`);
}

/**
 * Write Codex project (or global) MCP HTTP entry.
 * @param {{
 *   workspaceRoot: string,
 *   serverId: string,
 *   mcpUrl: string,
 *   global?: boolean,
 *   tryCli?: boolean,
 * }} opts
 */
export function writeCodexMcp(opts) {
  const { workspaceRoot, serverId, mcpUrl, global: useGlobal = false, tryCli = true } = opts;
  const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const projectDir = path.join(workspaceRoot, ".codex");
  const targetPath = useGlobal
    ? path.join(home, "config.toml")
    : path.join(projectDir, "config.toml");

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  let text = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  text = upsertCodexMcpSection(text, serverId, mcpUrl);
  fs.writeFileSync(targetPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");

  /** @type {{ codex: string, path: string, cli?: string }} */
  const result = { codex: "written", path: targetPath };

  if (tryCli && useGlobal) {
    try {
      execFileSync("codex", ["mcp", "add", serverId, "--url", mcpUrl], {
        stdio: "ignore",
        windowsHide: true,
      });
      result.cli = "codex mcp add ok";
    } catch {
      result.cli = "skipped";
    }
  }

  return result;
}

/**
 * @param {string} text
 * @param {string} serverId
 * @param {string} mcpUrl
 */
export function upsertCodexMcpSection(text, serverId, mcpUrl) {
  const header = `[mcp_servers.${serverId}]`;
  const block = `${header}\nurl = "${mcpUrl}"\nenabled = true\n`;
  const re = new RegExp(
    `\\[mcp_servers\\.${escapeRegExp(serverId)}\\][\\s\\S]*?(?=\\n\\[|$)`,
  );
  if (re.test(text)) {
    return text.replace(re, block.trimEnd() + "\n");
  }
  const trimmed = text.trimEnd();
  if (!trimmed) return `${block}\n`;
  return `${trimmed}\n\n${block}\n`;
}

/**
 * Project-root .mcp.json for WorkBuddy / CodeBuddy Settings → MCP.
 * @param {{
 *   workspaceRoot: string,
 *   serverId: string,
 *   mcpUrl: string,
 *   configPath?: string,
 *   mcpMode?: string,
 * }} opts
 */
export function writeWorkbuddyMcp(opts) {
  const { workspaceRoot, serverId, mcpUrl, configPath, mcpMode = "http" } = opts;
  const mcpPath = path.join(workspaceRoot, ".mcp.json");
  /** @type {{ mcpServers?: Record<string, unknown> }} */
  let doc = { mcpServers: {} };
  if (fs.existsSync(mcpPath)) {
    try {
      doc = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    } catch {
      doc = { mcpServers: {} };
    }
  }
  if (!doc.mcpServers || typeof doc.mcpServers !== "object") {
    doc.mcpServers = {};
  }

  if (String(mcpMode).toLowerCase() === "stdio" && configPath) {
    doc.mcpServers[serverId] = {
      command: "node",
      args: [toJsonPath(path.join(PKG_ROOT, "src", "mcp.js"))],
      cwd: toJsonPath(workspaceRoot),
      env: {
        WORKSPACE_KB_CONFIG: toJsonPath(configPath),
        WORKSPACE_ROOT: toJsonPath(workspaceRoot),
      },
    };
  } else {
    doc.mcpServers[serverId] = { url: mcpUrl };
  }

  fs.writeFileSync(mcpPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return { workbuddy: "written", path: mcpPath };
}

/**
 * Generate installable CodeBuddy/WorkBuddy plugin (wiring only; engine via up).
 * @param {{
 *   workspaceRoot: string,
 *   serverId: string,
 *   mcpUrl: string,
 *   dashboardPort: number,
 * }} opts
 */
export function writeCodebuddyPlugin(opts) {
  const { workspaceRoot, serverId, mcpUrl, dashboardPort } = opts;
  const pluginRoot = path.join(workspaceRoot, "plugins", "workspace-kb");
  fs.mkdirSync(pluginRoot, { recursive: true });

  const pluginJson = {
    name: "workspace-kb",
    version: "1.0.0",
    description:
      "Local LanceDB knowledge base for agents (Cursor/Codex/WorkBuddy). Requires `npx workspace-kb up` on this machine.",
    author: { name: "workspace-kb" },
  };
  fs.writeFileSync(
    path.join(pluginRoot, "plugin.json"),
    `${JSON.stringify(pluginJson, null, 2)}\n`,
    "utf8",
  );

  const mcpDoc = {
    mcpServers: {
      [serverId]: { url: mcpUrl },
    },
  };
  fs.writeFileSync(
    path.join(pluginRoot, ".mcp.json"),
    `${JSON.stringify(mcpDoc, null, 2)}\n`,
    "utf8",
  );

  const skillDir = path.join(pluginRoot, "skills", "query-workspace-kb");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), renderSharedSkillMd(serverId), "utf8");

  const readme = [
    "# workspace-kb (CodeBuddy / WorkBuddy plugin)",
    "",
    "This plugin only **wires MCP + Skill**. The vector index runs in the local engine:",
    "",
    "```bash",
    "npx workspace-kb up --port " + dashboardPort,
    "```",
    "",
    `MCP URL: \`${mcpUrl}\``,
    "",
    "Install (example):",
    "",
    "```bash",
    "codebuddy plugin install ./plugins/workspace-kb --scope project",
    "```",
    "",
    "Or paste the MCP URL in WorkBuddy **Settings → MCP**.",
    "",
    "Keep the dashboard running while agents call `kb_search` / `kb_memory_*`.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(pluginRoot, "README.md"), readme, "utf8");

  return { codebuddyPlugin: "written", path: pluginRoot };
}

/**
 * Shared agents skill under `.agents/skills` (Codex / multi-host).
 * @param {string} workspaceRoot
 * @param {string} serverId
 */
export function writeAgentsSkill(workspaceRoot, serverId) {
  const skillDir = path.join(workspaceRoot, ".agents", "skills", "query-workspace-kb");
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, "SKILL.md");
  fs.writeFileSync(skillPath, renderSharedSkillMd(serverId), "utf8");
  return { agentsSkill: "written", path: skillPath };
}

/**
 * @param {string} serverId
 */
export function renderSharedSkillMd(serverId) {
  return [
    "---",
    "name: query-workspace-kb",
    "description: >-",
    "  Search workspace-kb docs (kb_search) and shared project ops memory",
    "  (kb_memory_*). Use for architecture, symptoms, env facts, and triage",
    "  across Cursor / Codex / WorkBuddy / CLI. Not for personal preferences.",
    "---",
    "",
    `# Query workspace knowledge (\`${serverId}\`)`,
    "",
    "## Where to look",
    "",
    "| Need | Tool |",
    "|------|------|",
    "| Docs / skills / wiki | `kb_search` → `kb_read` |",
    "| Shared ops facts / prior triage | `kb_memory_search` / `kb_memory_put` |",
    "| Personal preference | Cursor / Codex / WorkBuddy Memories (not kb_memory) |",
    "| Team hard rules | `AGENTS.md` / rules (not memory) |",
    "",
    "## Docs flow",
    "",
    "1. `kb_search` (limit 6–8). Note `relatedMemories` in the response.",
    "2. `kb_read` one cited heading; then `rg` only in that repo.",
    "3. CLI fallback: `npx workspace-kb search -- \"<query>\"`.",
    "",
    "## Memory flow (cross Cursor + Codex + WorkBuddy + CLI)",
    "",
    "1. Before repeating an investigation: `kb_memory_search`.",
    "2. After a durable, redacted conclusion: `kb_memory_put` with tags + optional `ttlDays` (default 90).",
    "3. Audit/delete on the dashboard **项目记忆** panel.",
    "",
    "Engine must be running: `npx workspace-kb up` (HTTP MCP on the dashboard port).",
    "",
    "## Examples",
    "",
    "```text",
    'kb_search query="充值未到账"',
    'kb_memory_search query="fish37 hallapi"',
    'kb_memory_put text="测服 hallapi HTTP 在 fish37:8080" tags=["ops","test-env"] ttlDays=90',
    "npx workspace-kb memory list",
    "```",
    "",
  ].join("\n");
}

function toJsonPath(absPath) {
  return path.resolve(absPath).split(path.sep).join("/");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
