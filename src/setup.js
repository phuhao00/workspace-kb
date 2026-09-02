import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerProject } from "./daemon.js";
import { resolveDashboardPort } from "./port.js";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER_START = "<!-- WORKSPACE-KB:START -->";
const MARKER_END = "<!-- WORKSPACE-KB:END -->";

/**
 * @param {{ startDir?: string, quiet?: boolean, preferInitCwd?: boolean, port?: unknown }} [options]
 */
export function runSetup(options = {}) {
  const resolved = resolveWorkspaceForSetup(options.startDir, {
    preferInitCwd: options.preferInitCwd === true,
  });
  if (!resolved) {
    return { ok: false, reason: "no workspace-kb.config.json found" };
  }

  const { workspaceRoot, configPath, fileCfg } = resolved;
  const setupCfg = fileCfg.setup && typeof fileCfg.setup === "object" ? { ...fileCfg.setup } : {};
  if (setupCfg.enabled === false) {
    return { ok: false, reason: "setup disabled in config" };
  }

  const portResolved = resolveDashboardPort({
    port: options.port !== undefined ? options.port : setupCfg.dashboardPort,
  });
  if (portResolved.auto) {
    return {
      ok: false,
      reason: "setup needs a concrete port — set setup.dashboardPort or pass --port <1-65535>",
    };
  }
  const dashboardPort = portResolved.port;
  setupCfg.dashboardPort = dashboardPort;

  const prevPort = Number(fileCfg.setup?.dashboardPort);
  const shouldPersist =
    options.port !== undefined ||
    !Number.isInteger(prevPort) ||
    prevPort !== dashboardPort;
  if (shouldPersist) {
    try {
      const next = { ...fileCfg, setup: { ...(fileCfg.setup || {}), dashboardPort } };
      fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    } catch {
      // non-fatal
    }
  }

  const serverId =
    String(setupCfg.mcpServerId || "").trim() || serverIdFromRoot(workspaceRoot);
  const mcpScript = path.join(PKG_ROOT, "src", "mcp.js");

  const mcpResult = writeCursorMcp(
    workspaceRoot,
    configPath,
    mcpScript,
    serverId,
    setupCfg,
  );
  const ruleResult = writeCursorRule(workspaceRoot, serverId, setupCfg);
  const skillResult = writeCursorSkill(workspaceRoot, serverId, setupCfg);
  const continueResult = writeContinueConfig(
    workspaceRoot,
    configPath,
    serverId,
    dashboardPort,
    setupCfg,
  );

  let agentsResult = { agentsMd: "skipped" };
  if (setupCfg.agentsMd !== false) {
    agentsResult = patchAgentsMd(workspaceRoot, serverId, dashboardPort);
  }

  try {
    registerProject({ port: dashboardPort });
  } catch {
    // optional
  }

  const result = {
    ok: true,
    workspaceRoot,
    configPath,
    serverId,
    mcpPath: mcpResult.mcpPath,
    mcpMode: mcpResult.mcpMode,
    cursorRule: ruleResult.cursorRule,
    cursorSkill: skillResult.cursorSkill,
    continueConfig: continueResult.continueConfig,
    agentsMd: agentsResult.agentsMd,
    dashboardPort,
    portSource: portResolved.source,
  };

  if (!options.quiet) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

/**
 * Align config + Cursor/Continue MCP URLs with the port actually in use
 * (called from `start` / `serve` after a concrete port is chosen).
 * @param {unknown} port
 * @param {{ quiet?: boolean, startDir?: string }} [options]
 */
export function syncDashboardPortBindings(port, options = {}) {
  const spec = resolveDashboardPort({ port });
  if (spec.auto) {
    return {
      ok: false,
      reason: "sync needs a concrete port after listen/auto allocation",
    };
  }
  return runSetup({
    port: spec.port,
    quiet: options.quiet !== false,
    startDir: options.startDir,
  });
}

/**
 * @param {string} [startDir]
 * @param {{ preferInitCwd?: boolean }} [options]
 */
export function resolveWorkspaceForSetup(startDir, options = {}) {
  const initCwd = (process.env.INIT_CWD || "").trim();
  const start = path.resolve(
    options.preferInitCwd && initCwd ? initCwd : startDir || process.cwd(),
  );
  let dir = start;
  for (;;) {
    const configPath = path.join(dir, "workspace-kb.config.json");
    if (fs.existsSync(configPath)) {
      let fileCfg = {};
      try {
        fileCfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch {
        fileCfg = {};
      }
      const workspaceRoot = path.resolve(
        dir,
        process.env.WORKSPACE_ROOT || fileCfg.workspaceRoot || ".",
      );
      return { workspaceRoot, configPath, fileCfg };
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

function serverIdFromRoot(workspaceRoot) {
  const base = path.basename(workspaceRoot);
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "workspace"}-kb`;
}

function toJsonPath(absPath) {
  return path.resolve(absPath).split(path.sep).join("/");
}

function writeCursorMcp(workspaceRoot, configPath, mcpScript, serverId, setupCfg = {}) {
  const cursorDir = path.join(workspaceRoot, ".cursor");
  fs.mkdirSync(cursorDir, { recursive: true });
  const mcpPath = path.join(cursorDir, "mcp.json");
  const dashboardPort = resolveDashboardPort({
    port: setupCfg.dashboardPort,
  }).port;
  const mcpMode = String(setupCfg.mcpMode || "http").toLowerCase();

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

  if (mcpMode === "stdio") {
    /** @type {Record<string, string>} */
    const env = {
      WORKSPACE_KB_CONFIG: toJsonPath(configPath),
      WORKSPACE_ROOT: toJsonPath(workspaceRoot),
    };
    doc.mcpServers[serverId] = {
      command: "node",
      args: [toJsonPath(mcpScript)],
      cwd: toJsonPath(workspaceRoot),
      env,
      type: "stdio",
    };
  } else {
    doc.mcpServers[serverId] = {
      url: `http://127.0.0.1:${dashboardPort}/mcp`,
    };
  }

  fs.writeFileSync(mcpPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return { mcpPath, serverId, mcpMode, mcpUrl: `http://127.0.0.1:${dashboardPort}/mcp` };
}

function writeCursorRule(workspaceRoot, serverId, setupCfg) {
  if (setupCfg.cursorRule === false) {
    return { cursorRule: "skipped" };
  }
  const rulesDir = path.join(workspaceRoot, ".cursor", "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  const rulePath = path.join(rulesDir, "workspace-kb-routing.mdc");
  const body = [
    "---",
    "description: >-",
    "  Always call workspace-kb MCP (kb_search) before broad markdown reads or",
    "  multi-repo scans; use kb_memory_* for shared ops facts across Cursor/Codex.",
    "alwaysApply: true",
    "---",
    "",
    `# Workspace knowledge base (\`${serverId}\`)`,
    "",
    "- **Must** call MCP `kb_search` first for architecture, routing, ops runbooks, symptoms, or \"where is X\" — then `kb_read` one heading, then `rg` in the cited repo only.",
    "- For **shared ops facts** (env ports, prior triage): `kb_memory_search` first; after a durable conclusion `kb_memory_put` (redact secrets). Do **not** store personal preferences — use Cursor Memories / Codex Memories.",
    "- Team hard rules stay in `AGENTS.md` / `.cursor/rules` — memory does not replace them.",
    "- Prefer HTTP MCP via `npx workspace-kb start` / dashboard `/mcp`. Restart MCP from the dashboard if `workspaceRoot` looks wrong.",
    "",
  ].join("\n");
  fs.writeFileSync(rulePath, body, "utf8");
  return { cursorRule: "written", rulePath };
}

function writeCursorSkill(workspaceRoot, serverId, setupCfg) {
  if (setupCfg.cursorSkill === false) {
    return { cursorSkill: "skipped" };
  }
  const skillDir = path.join(workspaceRoot, ".cursor", "skills", "query-workspace-kb");
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, "SKILL.md");
  const body = [
    "---",
    "name: query-workspace-kb",
    "description: >-",
    "  Search workspace-kb docs (kb_search) and shared project ops memory",
    "  (kb_memory_*). Use for architecture, symptoms, env facts, and triage",
    "  conclusions across Cursor/Codex/CLI. Not for personal preferences.",
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
    "| Personal preference | Cursor Memories or Codex Memories (not kb_memory) |",
    "| Team hard rules | `AGENTS.md` / rules (not memory) |",
    "",
    "## Docs flow",
    "",
    "1. `kb_search` (limit 6–8). Note `relatedMemories` in the response.",
    "2. `kb_read` one cited heading; then `rg` only in that repo.",
    "3. CLI fallback: `npx workspace-kb search -- \"<query>\"`.",
    "",
    "## Memory flow (cross Cursor + Codex + CLI)",
    "",
    "1. Before repeating an investigation: `kb_memory_search`.",
    "2. After a durable, redacted conclusion: `kb_memory_put` with tags + optional `ttlDays` (default 90).",
    "3. Audit/delete on the dashboard **项目记忆** panel.",
    "",
    "Empty index: `npx workspace-kb ingest`. Dashboard: `npx workspace-kb start`.",
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
  fs.writeFileSync(skillPath, body, "utf8");
  return { cursorSkill: "written", skillPath };
}

function writeContinueConfig(workspaceRoot, configPath, serverId, dashboardPort, setupCfg) {
  if (setupCfg.continueConfig === false) {
    return { continueConfig: "skipped" };
  }
  const contDir = path.join(workspaceRoot, ".continue");
  fs.mkdirSync(contDir, { recursive: true });
  const mcpMode = String(setupCfg.mcpMode || "http").toLowerCase();
  const mcpServers =
    mcpMode === "stdio"
      ? {
          [serverId]: {
            command: "node",
            args: [toJsonPath(path.join(PKG_ROOT, "src", "mcp.js"))],
            env: {
              WORKSPACE_KB_CONFIG: toJsonPath(configPath),
              WORKSPACE_ROOT: toJsonPath(workspaceRoot),
            },
          },
        }
      : {
          [serverId]: {
            url: `http://127.0.0.1:${dashboardPort}/mcp`,
          },
        };
  const doc = {
    // Continue.dev MCP-style snippet (merge into your config as needed)
    name: "workspace-kb",
    mcpServers,
    docs: [
      "Install Continue, then merge mcpServers into ~/.continue/config.json",
      "Keep `npx workspace-kb start` running when using HTTP MCP",
    ],
  };
  const outPath = path.join(contDir, "workspace-kb.mcp.json");
  fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return { continueConfig: "written", path: outPath };
}

function renderAgentsBlock(serverId, dashboardPort) {
  return `${MARKER_START}
## 知识库（workspace-kb）

本地 LanceDB 索引（文档 / Skill / Wiki），**不是**全仓源码搜索。

- **何时用**：架构、路由、运维手册、「X 在哪」—— 全仓盲扫之前先 \`kb_search\`。
- **怎么用**：MCP \`kb_search\` → \`kb_read\`（单节），再到对应目录 \`rg\`；源码仍以代码为准。
- **CLI**：\`npx workspace-kb search "<query>"\` · 看板：\`npx workspace-kb serve --port ${dashboardPort}\`（MCP HTTP：\`http://127.0.0.1:${dashboardPort}/mcp\`）
- **配置**：\`workspace-kb.config.json\` · **数据**：\`.workspace-kb/\`（gitignore）

本仓 MCP：\`.cursor/mcp.json\` → \`${serverId}\`（默认 HTTP，看板可点「重启 MCP」）。需先 \`npx workspace-kb serve\` 保持运行。
${MARKER_END}`;
}

function patchAgentsMd(workspaceRoot, serverId, dashboardPort) {
  const agentsPath = path.join(workspaceRoot, "AGENTS.md");
  const block = renderAgentsBlock(serverId, dashboardPort);
  const markerRe = new RegExp(
    `${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`,
  );

  if (fs.existsSync(agentsPath)) {
    let content = fs.readFileSync(agentsPath, "utf8");
    if (content.includes(MARKER_START)) {
      if (content.includes(MARKER_END)) {
        content = content.replace(markerRe, block);
      } else {
        content = content.replace(/<!-- WORKSPACE-KB:START -->[\s\S]*$/, block);
      }
      fs.writeFileSync(agentsPath, content, "utf8");
      return { agentsMd: "updated", path: agentsPath };
    }
    if (/\bkb_search\b/.test(content)) {
      return { agentsMd: "skipped-custom", path: agentsPath };
    }
    content = removeLegacyKbSection(content);
    content = `${content.trimEnd()}\n\n${block}\n`;
    fs.writeFileSync(agentsPath, content, "utf8");
    return { agentsMd: "appended", path: agentsPath };
  }

  fs.writeFileSync(agentsPath, `${block}\n`, "utf8");
  return { agentsMd: "created", path: agentsPath };
}

/** Drop hand-written one-liner 知识库 sections before managed block. */
function removeLegacyKbSection(content) {
  return content.replace(
    /## 知识库[^\n]*\n(?:(?!## |<!-- WORKSPACE-KB:START -->)[^\n]*\n)+/g,
    "",
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
