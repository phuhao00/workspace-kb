# workspace-kb

Local [LanceDB](https://github.com/lancedb/lancedb) knowledge base for **agent-friendly** markdown workspaces.

Index curated docs / skills / wiki — not your full source tree. Cursor talks over **MCP**; scripts and Codex use the **CLI**. Search returns short snippets; `kb_read` opens one heading.

## Requirements

- Node.js >= 20
- Embedding backend (one of):
  - **Ollama** (default): `ollama pull bge-m3`
  - **OpenAI / compatible**: set `"embedProvider": "openai"` + `OPENAI_API_KEY`

```bash
ollama pull bge-m3
```

Tighter VRAM: `WORKSPACE_KB_MODEL=nomic-embed-text` (set matching `embedDim` in config).

## Quick start

```bash
npx workspace-kb init
npm install
npx workspace-kb ingest
npx workspace-kb start          # background dashboard + HTTP MCP
# open http://127.0.0.1:8787/
```

## Install / upgrade

```bash
npm install github:phuhao00/workspace-kb
```

**Auto-setup (v1.2+):** on install/update/ingest, if `workspace-kb.config.json` exists, writes:

- `.cursor/mcp.json` — default **HTTP** MCP → `http://127.0.0.1:<port>/mcp`
- `.cursor/rules/workspace-kb-routing.mdc` (`alwaysApply`)
- `.cursor/skills/query-workspace-kb/SKILL.md`
- `.continue/workspace-kb.mcp.json` (Continue.dev snippet)
- `AGENTS.md` managed block (unless `setup.agentsMd: false`)

Disable: `WORKSPACE_KB_SKIP_SETUP=1` or `"setup": { "enabled": false }`.

## CLI

```bash
npx workspace-kb init [--force] [--name app] [--port 8787]
npx workspace-kb ingest [--full]          # incremental by default
npx workspace-kb search "充值未到账"
npx workspace-kb read docs/pay.md "Overview"
npx workspace-kb status
npx workspace-kb health
npx workspace-kb stats --days 7
npx workspace-kb start|stop|serve [--port 8787]
npx workspace-kb projects
npx workspace-kb setup
npx workspace-kb feedback [--bad] "note"
```

## Dashboard (v1.4)

```bash
npx workspace-kb start   # or: serve
# http://127.0.0.1:8787/
```

- **控制**：重启 MCP / 重新配置 / 增量·全量索引 / 重启看板
- **健康检查**：config · workspaceRoot · index · embed · MCP · 命中率
- **多项目**：本机 registry（`~/.workspace-kb/registry.json`）
- **命中率 + Feedback**：Recent events 旁 👍/👎，路径加权进检索

MCP HTTP endpoint: `http://127.0.0.1:8787/mcp` — keep `start`/`serve` running.

## Features (v1.4)

| Area | What |
|------|------|
| Hybrid search | Vector + lexical (CJK bigrams) + kind boost + feedback boost |
| Query rewrite | Builtin CN/EN synonyms (`synonyms` in config) |
| Incremental ingest | Fingerprints + vector cache; `--full` to rebuild |
| Daemon | `start` / `stop` / `projects` |
| No Ollama | `"embedProvider": "openai"` + `OPENAI_API_KEY` (+ optional `openaiBaseUrl`) |
| Continue | `.continue/workspace-kb.mcp.json` + `examples/continue.mcp.json` |

## Configure

```json
{
  "workspaceRoot": ".",
  "dataDir": ".workspace-kb",
  "model": "bge-m3",
  "embedDim": 1024,
  "embedProvider": "ollama",
  "incremental": true,
  "rewriteQuery": true,
  "synonyms": {
    "登不进": ["登录", "login", "token"]
  },
  "paths": [".agents", "docs", "*.md"],
  "childRepos": ["api", "web"],
  "childGlobs": ["README*.md", "docs/**/*.md"],
  "setup": {
    "mcpServerId": "my-project-kb",
    "dashboardPort": 8787,
    "mcpMode": "http",
    "agentsMd": true,
    "cursorSkill": true,
    "continueConfig": true
  }
}
```

OpenAI-compatible example:

```json
{
  "embedProvider": "openai",
  "model": "text-embedding-3-small",
  "embedDim": 1536,
  "openaiBaseUrl": "https://api.openai.com/v1"
}
```

## Multiple projects

```bash
cd E:/project-a && npx workspace-kb start --port 8787
cd E:/project-b && npx workspace-kb start --port 8788
npx workspace-kb projects
```

Dashboard lists both. Prefer project-local `.cursor/mcp.json`.

## Env

| Variable | Meaning |
|----------|---------|
| `WORKSPACE_KB_CONFIG` | Absolute path to config JSON |
| `WORKSPACE_ROOT` | Override workspace root |
| `WORKSPACE_KB_MODEL` | Embedding model id |
| `WORKSPACE_KB_DIM` | Expected dimension |
| `WORKSPACE_KB_EMBED_PROVIDER` | `ollama` \| `openai` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | Cloud embeddings |
| `OLLAMA_HOST` | Default `http://127.0.0.1:11434` |
| `WORKSPACE_KB_PORT` | Dashboard port (default `8787`) |
| `WORKSPACE_KB_SKIP_SETUP` | `1` skips postinstall setup |

## License

MIT
