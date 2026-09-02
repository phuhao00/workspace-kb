import fs from "node:fs";
import path from "node:path";
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
    dashboardPort: 8787,
    agentsMd: true,
    cursorSkill: true,
    continueConfig: true,
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
      dashboardPort: Number(opts.port) || 8787,
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

## Workflow

1. \`npx workspace-kb ingest\`
2. \`npx workspace-kb start\` (background dashboard + HTTP MCP)
3. Ask Cursor architecture questions — it should call \`kb_search\` first.

## Tips

- Keep \`serve\`/\`start\` running for HTTP MCP.
- Use the dashboard control panel to restart MCP or re-ingest.
`,
      "utf8",
    );
    created.push("docs/kb-getting-started.md");
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
            "kb:start": "workspace-kb start",
            "kb:search": "workspace-kb search",
            "kb:setup": "workspace-kb setup",
          },
          dependencies: {
            "workspace-kb": "github:phuhao00/workspace-kb",
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
      "npx workspace-kb ingest",
      "npx workspace-kb start",
      "open dashboard URL and restart MCP if needed",
    ],
  };
}

function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}
