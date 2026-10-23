import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CLIENTS } from "./clients.js";
import { DEFAULT_DASHBOARD_PORT, resolveDashboardPort } from "./port.js";
import { ensureDir } from "./config.js";
import { runSetup } from "./setup.js";

const DEFAULT_CONFIG = {
  workspaceRoot: ".",
  dataDir: ".workspace-kb",
  model: "bge-m3",
  embedDim: 1024,
  paths: [".agents", "docs", "openwiki", "*.md", ".cursor/skills"],
  childRepos: [],
  childGlobs: ["README*.md", "docs/**/*.md"],
  skipDirs: ["node_modules", "vendor", ".git", ".next", "Library", "logs", ".workspace-kb"],
  setup: {
    mcpMode: "http",
    dashboardPort: DEFAULT_DASHBOARD_PORT,
    agentsMd: true,
    cursorSkill: true,
    continueConfig: true,
    /** Cursor · Codex · WorkBuddy · Continue — install-clients / up sync these */
    clients: [...DEFAULT_CLIENTS],
  },
};

/**
 * Scaffold a new workspace-kb project.
 * @param {{ cwd?: string, force?: boolean, name?: string, port?: number }} [opts]
 */
export function initWorkspace(opts = {}) {
  const root = path.resolve(opts.cwd || process.cwd());
  const configPath = path.join(root, "workspace-kb.config.json");
  const created = [];

  if (fs.existsSync(configPath) && !opts.force) {
    const setup = runSetup({ startDir: root, quiet: true });
    return {
      ok: true,
      existed: true,
      configPath,
      setup,
      message: "config exists — ran setup only (pass --force to overwrite scaffold)",
    };
  }

  const cfg = {
    ...DEFAULT_CONFIG,
    setup: {
      ...DEFAULT_CONFIG.setup,
      mcpServerId: `${slug(opts.name || path.basename(root))}-kb`,
      dashboardPort: resolveDashboardPort({
        port: opts.port !== undefined ? opts.port : DEFAULT_DASHBOARD_PORT,
      }).port,
    },
  };
  fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  created.push("workspace-kb.config.json");

  const docsDir = path.join(root, "docs");
  ensureDir(docsDir);
  const sample = path.join(docsDir, "kb-getting-started.md");
  if (!fs.existsSync(sample) || opts.force) {
    fs.writeFileSync(
      sample,
      `# Getting started with workspace-kb

Index curated markdown (docs / skills / wiki), not your full source tree.

## One-shot (Cursor · Codex · WorkBuddy)

\`\`\`bash
npm install
npx workspace-kb up --port 8700 --ingest
# reload MCP in each client — same URL: http://127.0.0.1:8700/mcp
\`\`\`

\`init\` already scaffolds \`setup.clients\` and wires project configs. \`up\` syncs the port into Cursor / Codex / WorkBuddy / Continue.

## Tips

- Keep \`up\`/\`start\`/\`serve\` running for HTTP MCP.
- Re-wire after a port change: \`npx workspace-kb install-clients --port <n>\`
- Dashboard health → **clients** shows which files match the MCP URL.
`,
      "utf8",
    );
    created.push("docs/kb-getting-started.md");
  }

  const zhGuide = path.join(docsDir, "kb-getting-started.zh-CN.md");
  if (!fs.existsSync(zhGuide) || opts.force) {
    fs.writeFileSync(
      zhGuide,
      `# workspace-kb 快速开始

索引精选 Markdown（docs / skills / wiki），不要扫全仓源码。

## 一步到位（Cursor · Codex · WorkBuddy）

\`\`\`bash
npm install
npx workspace-kb up --port 8700 --ingest
# 各客户端重载 MCP — 同一 URL：http://127.0.0.1:8700/mcp
\`\`\`

\`init\` 默认写入 \`setup.clients\` 并完成项目级接线；\`up\` 会把实际端口同步到三端配置。

## 中文索引建议

- 根配置 \`paths\` 保留 \`*.md\`，可收录 \`README.md\` / \`README.zh-CN.md\`
- 文档用清晰的中文 \`##\` 标题，便于按节 \`kb_read\`
- 在 \`synonyms\` 里补充业务口语（如「登不进」「充值未到账」）

## 提示

- HTTP MCP 需保持 \`up\`/\`serve\`/\`start\` 运行
- 改端口后：\`npx workspace-kb install-clients --port <n>\`
- 看板健康检查 → **clients** 可核对各端文件是否指向当前 URL
`,
      "utf8",
    );
    created.push("docs/kb-getting-started.zh-CN.md");
  }

  const gitignore = path.join(root, ".gitignore");
  const giLine = ".workspace-kb/";
  if (fs.existsSync(gitignore)) {
    const text = fs.readFileSync(gitignore, "utf8");
    if (!text.includes(giLine)) {
      fs.appendFileSync(gitignore, `\n${giLine}\n`, "utf8");
      created.push(".gitignore (+.workspace-kb/)");
    }
  } else {
    fs.writeFileSync(gitignore, `${giLine}\nnode_modules/\n`, "utf8");
    created.push(".gitignore");
  }

  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(
      pkgPath,
      `${JSON.stringify(
        {
          name: slug(opts.name || path.basename(root)),
          private: true,
          type: "module",
          scripts: {
            "kb:ingest": "workspace-kb ingest",
            "kb:up": "workspace-kb up",
            "kb:start": "workspace-kb start",
            "kb:search": "workspace-kb search",
            "kb:setup": "workspace-kb setup",
            "kb:install-clients": "workspace-kb install-clients",
            "kb:health": "workspace-kb health",
          },
          dependencies: {
            "workspace-kb": "github:phuhao00/workspace-kb#master",
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    created.push("package.json");
  }

  const setup = runSetup({ startDir: root, quiet: true });
  return {
    ok: true,
    existed: false,
    root,
    configPath,
    created,
    setup,
    next: [
      "npm install",
      "npx workspace-kb up --port <n> --ingest",
      "reload MCP in Cursor / Codex / WorkBuddy (same /mcp URL)",
      "npx workspace-kb health   # clients row should show wired",
    ],
  };
}

function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}
