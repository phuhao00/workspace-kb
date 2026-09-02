import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER_START = "<!-- WORKSPACE-KB:START -->";
const MARKER_END = "<!-- WORKSPACE-KB:END -->";

/**
 * @param {{ startDir?: string, quiet?: boolean }} [options]
 */
export function runSetup(options = {}) {
  const resolved = resolveWorkspaceForSetup(options.startDir, {
    preferInitCwd: options.preferInitCwd === true,
  });
  if (!resolved) {
    return { ok: false, reason: "no workspace-kb.config.json found" };
  }

  const { workspaceRoot, configPath, fileCfg } = resolved;
  const setupCfg = fileCfg.setup && typeof fileCfg.setup === "object" ? fileCfg.setup : {};
  if (setupCfg.enabled === false) {
    return { ok: false, reason: "setup disabled in config" };
  }

  const serverId =
    String(setupCfg.mcpServerId || "").trim() || serverIdFromRoot(workspaceRoot);
  const dashboardPort = Number(setupCfg.dashboardPort) || 8787;
  const mcpScript = path.join(PKG_ROOT, "src", "mcp.js");

  const mcpResult = writeCursorMcp(workspaceRoot, configPath, mcpScript, serverId);
  const ruleResult = writeCursorRule(workspaceRoot, serverId, setupCfg);

  let agentsResult = { agentsMd: "skipped" };
  if (setupCfg.agentsMd !== false) {
    agentsResult = patchAgentsMd(workspaceRoot, serverId, dashboardPort);
  }

  const result = {
    ok: true,
    workspaceRoot,
    configPath,
    serverId,
    mcpPath: mcpResult.mcpPath,
    cursorRule: ruleResult.cursorRule,
    agentsMd: agentsResult.agentsMd,
    dashboardPort,
  };

  if (!options.quiet) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
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

function writeCursorMcp(workspaceRoot, configPath, mcpScript, serverId) {
  const cursorDir = path.join(workspaceRoot, ".cursor");
  fs.mkdirSync(cursorDir, { recursive: true });
  const mcpPath = path.join(cursorDir, "mcp.json");

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

  fs.writeFileSync(mcpPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return { mcpPath, serverId };
}

function writeCursorRule(workspaceRoot, serverId, setupCfg) {
  if (setupCfg.cursorRule === false) {
    return { cursorRule: "skipped" };
  }
  const rulesDir = path.join(workspaceRoot, ".cursor", "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  const rulePath = path.join(rulesDir, "workspace-kb-routing.mdc");
  const body = `---
description: >-
  Always call workspace-kb MCP (kb_search) before broad markdown reads or
  multi-repo scans in this workspace.
alwaysApply: true
---

# Workspace knowledge base (\`${serverId}\`)

- **Must** call MCP \`kb_search\` first for architecture, routing, ops runbooks, symptoms, or "where is X" — then \`kb_read\` one heading, then \`rg\` in the cited repo only.
- Do **not** open large guides or scan every child repo before searching the KB index.
- Source code beats stale docs; KB is for finding the right doc/repo quickly.
- MCP env pins \`WORKSPACE_KB_CONFIG\`; if \`kb_status\` shows wrong \`workspaceRoot\`, restart MCP in Cursor Settings.
`;
  fs.writeFileSync(rulePath, body, "utf8");
  return { cursorRule: "written", rulePath };
}

function renderAgentsBlock(serverId, dashboardPort) {
  return `${MARKER_START}
## 知识库（workspace-kb）

本地 LanceDB 索引（文档 / Skill / Wiki），**不是**全仓源码搜索。

- **何时用**：架构、路由、运维手册、「X 在哪」—— 全仓盲扫之前先 \`kb_search\`。
- **怎么用**：MCP \`kb_search\` → \`kb_read\`（单节），再到对应目录 \`rg\`；源码仍以代码为准。
- **CLI**：\`npx workspace-kb search "<query>"\` · 看板：\`npx workspace-kb serve --port ${dashboardPort}\`
- **配置**：\`workspace-kb.config.json\` · **数据**：\`.workspace-kb/\`（gitignore）

本仓 MCP：\`.cursor/mcp.json\` → \`${serverId}\`。安装/更新/ingest 后会自动写入；**请在 Cursor 里重启 MCP** 后对话才会调用 \`kb_search\`。
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
