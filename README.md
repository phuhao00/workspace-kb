# workspace-kb

> English · [中文文档](./README.zh-CN.md)

Local [LanceDB](https://github.com/lancedb/lancedb) knowledge base for **agent-friendly** markdown workspaces.

Index curated docs / skills / wiki — **not** your full source tree. Agents use **MCP** (`kb_search` → `kb_read`); scripts use the **CLI**. Search returns short snippets; reads open one heading.

| | |
|---|---|
| Version | **1.5** |
| License | MIT |
| Repo | https://github.com/phuhao00/workspace-kb |

## Why

- Cut token waste: agents get **snippets + one section**, not whole manuals.
- Route multi-repo workspaces: find the right doc/repo first, then `rg` locally.
- Dashboard tracks proxy savings (`chars/4`) and MCP health — not LLM billing.

## Requirements

- Node.js **>= 20**
- One embedding backend:
  - **Ollama** (default): `ollama pull bge-m3`
  - **OpenAI / compatible**: `"embedProvider": "openai"` + `OPENAI_API_KEY`

```bash
ollama pull bge-m3
# low VRAM alternative:
# WORKSPACE_KB_MODEL=nomic-embed-text  # set matching embedDim in config
```

## Quick start

```bash
npx workspace-kb init
npm install
npx workspace-kb ingest
npx workspace-kb start              # background dashboard + HTTP MCP
# open http://127.0.0.1:8787/
npx workspace-kb search "payment failure"
npx workspace-kb health
```

Existing project:

```bash
npm install github:phuhao00/workspace-kb
# ensure workspace-kb.config.json at repo root
npx workspace-kb setup
npx workspace-kb ingest
npx workspace-kb start --port 8787
```

## Install / upgrade

```bash
npm install github:phuhao00/workspace-kb#master
```

### Auto-setup (install · update · ingest · `setup`)

If `workspace-kb.config.json` is found (cwd or parent, or `INIT_CWD` on postinstall), the package writes:

| Path | Purpose |
|------|---------|
| `.cursor/mcp.json` | MCP server (default **HTTP** → `http://127.0.0.1:<port>/mcp`) |
| `.cursor/rules/workspace-kb-routing.mdc` | `alwaysApply` — call `kb_search` first |
| `.cursor/skills/query-workspace-kb/SKILL.md` | Cursor skill for architecture/ops questions |
| `.continue/workspace-kb.mcp.json` | Continue.dev merge snippet |
| `AGENTS.md` `<!-- WORKSPACE-KB:… -->` | Agent routing (skip if `agentsMd: false` or custom `kb_search` docs) |

Disable: `WORKSPACE_KB_SKIP_SETUP=1` or `"setup": { "enabled": false }`.

After upgrade: **restart `start`/`serve`**, then click **重启 MCP** on the dashboard (or reload Cursor MCP).

## CLI reference

```text
workspace-kb <command>

  init [--force] [--name app] [--port 8787]
  setup                         # MCP + rules + skill + Continue
  ingest [--full]               # incremental by default
  search "<query>" [--limit 6] [--kind skill] [--repo my-service]
  read <path> [heading]
  status | health | stats [--days 7]
  start | stop | serve [--port 8787]
  projects                      # list ~/.workspace-kb/registry.json
  feedback [--bad] <note>
```

Examples:

```bash
npx workspace-kb ingest --full
npx workspace-kb search "充值未到账" --limit 8
npx workspace-kb read docs/pay.md "Overview"
npx workspace-kb start --port 8787
npx workspace-kb stop --port 8787
npx workspace-kb projects
```

## Dashboard

```bash
npx workspace-kb start    # detached (pid under ~/.workspace-kb/)
# or foreground:
npx workspace-kb serve --port 8787
```

Open **http://127.0.0.1:8787/**

| Panel | What you can do |
|-------|-----------------|
| **控制** | 重启 MCP · 重新配置 · 增量/全量索引 · 重启看板 |
| **健康检查** | config · workspaceRoot · index · embed · MCP · 命中率 |
| **多项目** | 本机已注册实例与端口 |
| **Metrics** | calls · hit rate · est. returned/saved tokens |
| **Recent events** | 👍/👎 feedback → path boost in search |

**HTTP MCP:** `http://127.0.0.1:<port>/mcp` — Cursor/Continue need `start`/`serve` running.

### Local HTTP APIs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | Health checks + hit-rate summary |
| GET | `/api/control` | Status, projects, feedback, ingest job |
| GET | `/api/usage?days=7` | Token proxy dashboard payload |
| GET | `/api/projects` | Multi-project registry |
| GET | `/api/feedback` | Feedback summary |
| POST | `/api/actions/restart-mcp` | Drop MCP sessions (clients reconnect) |
| POST | `/api/actions/setup` | Re-run auto-setup |
| POST | `/api/actions/ingest` | Body `{ "full": true }` optional |
| POST | `/api/actions/feedback` | `{ useful, query, path, heading }` |
| POST | `/api/actions/restart-server` | Respawn dashboard |
| * | `/mcp` | Streamable HTTP MCP |

## Project memory (v1.5)

Shared **ops facts** for Cursor + Codex + CLI (not IDE personal Memories).

```bash
npx workspace-kb memory put "测服 hallapi HTTP :8080" --key fish37-hallapi --tags ops,test-env --ttl 90
npx workspace-kb memory search "hallapi"
npx workspace-kb memory list
npx workspace-kb memory delete --key fish37-hallapi
npx workspace-kb memory prune
```

MCP: `kb_memory_put` · `kb_memory_search` · `kb_memory_list` · `kb_memory_delete`.  
Dashboard panel **项目记忆** for audit. Data: `.workspace-kb/memory/facts.jsonl`.

| Store | Use for |
|-------|---------|
| Cursor / Codex Memories | Personal preferences |
| AGENTS.md / rules | Team hard rules (committed) |
| `kb_search` | Docs / skills / wiki |
| `kb_memory_*` | Shared ops conclusions (redacted, TTL) |

## Features (v1.4+)

| Area | Behavior |
|------|----------|
| Hybrid search | Vector + lexical (incl. CJK bigrams) + kind boost + feedback boost |
| Query rewrite | Builtin CN/EN synonyms; extend via `synonyms` in config |
| Incremental ingest | File fingerprints + vector cache; unchanged files skip embed; `--full` rebuilds |
| Daemon | `start` / `stop` / `projects`; registry at `~/.workspace-kb/registry.json` |
| Cloud embed | `embedProvider: "openai"` (+ `openaiBaseUrl` for compatible APIs) |
| Continue | Auto snippet + [`examples/continue.mcp.json`](examples/continue.mcp.json) |

## Configure

Put `workspace-kb.config.json` at the **workspace root** (or set `WORKSPACE_KB_CONFIG`):

```json
{
  "workspaceRoot": ".",
  "dataDir": ".workspace-kb",
  "model": "bge-m3",
  "embedDim": 1024,
  "embedProvider": "ollama",
  "incremental": true,
  "rewriteQuery": true,
  "hybridVectorWeight": 0.65,
  "hybridLexicalWeight": 0.35,
  "synonyms": {
    "登不进": ["登录", "login", "token"],
    "充值未到账": ["支付", "pay", "订单", "callback"]
  },
  "paths": [".agents", "docs", "openwiki", "*.md", ".cursor/skills"],
  "childRepos": ["api", "web"],
  "childGlobs": ["README*.md", "docs/**/*.md"],
  "skipDirs": ["node_modules", "vendor", ".git", ".next", "Library", "logs", ".workspace-kb"],
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

### OpenAI / compatible embeddings

```json
{
  "embedProvider": "openai",
  "model": "text-embedding-3-small",
  "embedDim": 1536,
  "openaiBaseUrl": "https://api.openai.com/v1"
}
```

```bash
set OPENAI_API_KEY=sk-...
npx workspace-kb ingest --full
```

### Data layout (git-ignore `dataDir`)

```text
.workspace-kb/
  lancedb/           # LanceDB table
  meta.json
  usage.jsonl        # search/read proxy metrics
  feedback.jsonl     # 👍/👎
  fingerprints.json  # incremental ingest
  cache/vectors.json # embedding cache
```

### MCP modes

| `setup.mcpMode` | `.cursor/mcp.json` | Notes |
|-----------------|--------------------|-------|
| `http` (default) | `{ "url": "http://127.0.0.1:8787/mcp" }` | Needs `start`/`serve`; dashboard can **重启 MCP** |
| `stdio` | `command` + `env.WORKSPACE_KB_CONFIG` | No dashboard required; pin config path (Cursor often ignores `cwd`) |

## Multiple projects on one machine

Each workspace has its **own** config + `.workspace-kb/`. Use **different ports**.

```bash
cd E:/project-a && npx workspace-kb start --port 8787
cd E:/project-b && npx workspace-kb start --port 8788
npx workspace-kb projects
```

Prefer **project-local** `.cursor/mcp.json`. Examples: [`examples/multi-a`](examples/multi-a), [`examples/multi-b`](examples/multi-b), [`examples/multi-project.mcp.json`](examples/multi-project.mcp.json).

### Indexing Chinese docs

- Keep `"*.md"` in `paths` so root `README.md` / `README.zh-CN.md` are ingested.
- Prefer clear Chinese `##` headings under `docs/` for `kb_read`.
- Add spoken symptoms to `synonyms` (e.g. 登不进, 充值未到账). Full guide: [README.zh-CN.md](./README.zh-CN.md).

## Cursor / agent tips

1. Keep `npx workspace-kb start` running (HTTP MCP).
2. Ask architecture/ops questions — rule + skill should trigger `kb_search`.
3. Confirm usage: `Get-Content .workspace-kb/usage.jsonl` or dashboard Recent events.
4. If `kb_status` shows `workspaceRoot` under your home directory, MCP is mis-bound — use HTTP mode or pin `WORKSPACE_KB_CONFIG`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EADDRINUSE :8787` | Another `serve`/`start` is up — use it, or `npx workspace-kb stop --port 8787` |
| Dashboard old UI / 404 `/api/health` | Kill old node on that port; reinstall `#master` and `start` again |
| `No usage.jsonl` | Only **search/read/MCP** write usage — `ingest` alone does not |
| Empty search / low hit rate | `ingest`, check `health`, extend `synonyms`, verify MCP root |
| Ollama errors | `ollama serve` + `ollama pull <model>` |
| Agent never calls KB | Restart MCP; confirm rule/skill exist; ask explicitly “先 kb_search …” |

## Env

| Variable | Meaning |
|----------|---------|
| `WORKSPACE_KB_CONFIG` | Absolute path to config JSON |
| `WORKSPACE_ROOT` | Override workspace root |
| `WORKSPACE_KB_MODEL` / `BUYU_KB_MODEL` | Embedding model id |
| `WORKSPACE_KB_DIM` / `BUYU_KB_DIM` | Expected dimension |
| `WORKSPACE_KB_EMBED_PROVIDER` | `ollama` \| `openai` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | Cloud embeddings |
| `OLLAMA_HOST` | Default `http://127.0.0.1:11434` |
| `WORKSPACE_KB_PORT` | Dashboard port (default `8787`) |
| `WORKSPACE_KB_SKIP_SETUP` | `1` skips postinstall setup |

## License

MIT
