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
- **Project memory**: share ops/triage facts across Cursor · Codex · CLI — tags, redaction, TTL, dashboard audit.
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
npx workspace-kb memory list
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

  init [--force] [--name app] [--port <n>]
  setup [--port <n>]            # MCP + rules + skill; any port
  ingest [--full]               # incremental by default
  search "<query>" [--limit 6] [--kind skill] [--repo my-service]
  read <path> [heading]
  status | health | stats [--days 7]
  start | stop | serve [--port <1-65535|auto>]
  projects                      # list ~/.workspace-kb/registry.json
  feedback [--bad] <note>
  memory put|search|list|delete|prune   # project ops facts (see below)
```

Port resolution: `--port` → `WORKSPACE_KB_PORT` → `setup.dashboardPort` → registry → default `8787` (fallback only — **any free port works**).

Examples:

```bash
npx workspace-kb ingest --full
npx workspace-kb search "充值未到账" --limit 8
npx workspace-kb memory put "staging hallapi HTTP :8080" --key staging-hallapi --tags ops,test-env
npx workspace-kb start --port 19090
npx workspace-kb stop                 # uses config/registry port
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
| **控制** | Restart MCP · re-setup · incremental/full ingest · restart server |
| **健康检查** | config · workspaceRoot · index · embed · MCP · hit rate |
| **项目记忆** | Put / delete by key·id / prune expired; audit list |
| **多项目** | Local registered instances + ports |
| **Metrics** | calls · hit rate · est. returned/saved tokens |
| **Recent events** | 👍/👎 feedback → path boost in search |

**HTTP MCP:** `http://127.0.0.1:<port>/mcp` — Cursor/Continue need `start`/`serve` running.

### Local HTTP APIs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | Health checks + hit-rate summary |
| GET | `/api/control` | Status, projects, feedback, ingest job, memory preview |
| GET | `/api/memory` | List project memory facts |
| GET | `/api/usage?days=7` | Token proxy dashboard payload |
| GET | `/api/projects` | Multi-project registry |
| GET | `/api/feedback` | Feedback summary |
| POST | `/api/actions/restart-mcp` | Drop MCP sessions (clients reconnect) |
| POST | `/api/actions/setup` | Re-run auto-setup |
| POST | `/api/actions/ingest` | Body `{ "full": true }` optional |
| POST | `/api/actions/feedback` | `{ useful, query, path, heading }` |
| POST | `/api/actions/memory-put` | `{ text, key?, tags?, ttlDays?, source? }` |
| POST | `/api/actions/memory-delete` | `{ id? }` or `{ key? }` |
| POST | `/api/actions/memory-prune` | Remove expired rows from disk |
| POST | `/api/actions/restart-server` | Respawn dashboard |
| * | `/mcp` | Streamable HTTP MCP |

## Project memory (v1.5)

Shared **project ops facts** across Cursor + Codex + CLI (env topology, staging ports, redacted triage conclusions).  
**Not** IDE personal Memories, and **not** a substitute for `AGENTS.md` or the doc index.

### What belongs where

| Store | Use for | Example |
|-------|---------|---------|
| Cursor / Codex Memories | Personal preferences | “I prefer TypeScript” |
| `AGENTS.md` / `.cursor/rules` | Team hard rules (git-committed) | Branch model, no prod config edits |
| `kb_search` / `kb_read` | Docs · skills · wiki | One section of a payment runbook |
| `kb_memory_*` | Shared ops facts (redacted, TTL, dashboard audit) | “Staging hallapi HTTP :8080” |

Good writes: staging hosts/ports, **redacted** incident conclusions, temporary feature flags.  
Never write: passwords / API keys / tokens, ID numbers / PII, pure personal preferences.

### CLI

```bash
# upsert by --key; default TTL 90 days; --ttl 0 = never expire
npx workspace-kb memory put "staging hallapi HTTP :8080" \
  --key staging-hallapi --tags ops,test-env --ttl 90

npx workspace-kb memory search "hallapi"
npx workspace-kb memory list
npx workspace-kb memory delete --key staging-hallapi
# or: npx workspace-kb memory delete --id <uuid>
npx workspace-kb memory prune          # drop expired rows
```

| Subcommand | Notes |
|------------|-------|
| `put` | `--key` stable upsert key (else derived from text); `--tags a,b`; `--ttl days` |
| `search` | Score against key / text / tags |
| `list` | Recent non-expired (default limit 50) |
| `delete` | `--key` or `--id` |
| `prune` | Remove expired lines from `facts.jsonl` |

### MCP tools

| Tool | Role |
|------|------|
| `kb_memory_put` | Write; required `text`; optional `key` / `tags` / `ttlDays` / `source` |
| `kb_memory_search` | Search; optional `query` / `tag` / `limit` |
| `kb_memory_list` | List; optional `limit` / `includeExpired` |
| `kb_memory_delete` | Delete by `id` or `key` |

`kb_search` also returns `relatedMemories` (up to ~3 matching ops facts).  
`kb_status` includes a short recent-memory peek.

### Validation and TTL

Same checks for dashboard / CLI / MCP:

- Non-empty text, max **2000** characters
- Looks like a preference (“I prefer…”, “我喜欢…”) → **rejected** — use IDE Memories
- Looks like secrets / Bearer / private key / ID card → **rejected** — redact first
- **TTL**: default **90** days; `0` = never; max 3650 days
- Same `key` **upserts** (replaces the previous row)

### Data shape

Path: `.workspace-kb/memory/facts.jsonl` (one JSON object per line; git-ignore `dataDir`).

```json
{
  "id": "uuid",
  "ts": "2026-09-02T09:00:00.000Z",
  "key": "staging-hallapi",
  "text": "staging hallapi HTTP :8080",
  "tags": ["ops", "test-env"],
  "source": "cli",
  "ttlDays": 90,
  "expiresAt": "2026-12-01T09:00:00.000Z"
}
```

`expiresAt: null` means never. Expired rows are hidden from search/list by default; use `prune` or the dashboard button to delete them from disk.

### Agent workflow

1. Before re-investigating: `kb_memory_search` (or check `relatedMemories` on `kb_search`).
2. After a durable, redacted conclusion: `kb_memory_put` with tags (`ops`, service, env).
3. Drop stale facts on the **项目记忆** panel, or use a short TTL then `prune`.

## Features (v1.4+)

| Area | Behavior |
|------|----------|
| Hybrid search | Vector + lexical (incl. CJK bigrams) + kind boost + feedback boost |
| Query rewrite | Builtin CN/EN synonyms; extend via `synonyms` in config |
| Incremental ingest | File fingerprints + vector cache; unchanged files skip embed; `--full` rebuilds |
| **Project memory** | `.workspace-kb/memory/`; MCP + CLI + dashboard; TTL / redact / tags |
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
    "dashboardPort": 19090,
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
  memory/
    facts.jsonl      # project ops memory (shared across tools)
```

### MCP modes

| `setup.mcpMode` | `.cursor/mcp.json` | Notes |
|-----------------|--------------------|-------|
| `http` (default) | `{ "url": "http://127.0.0.1:<dashboardPort>/mcp" }` | Needs `start`/`serve`; dashboard can **重启 MCP** |
| `stdio` | `command` + `env.WORKSPACE_KB_CONFIG` | No dashboard required; pin config path (Cursor often ignores `cwd`) |

## Multiple projects on one machine

Each workspace has its **own** config + `.workspace-kb/`. Use **any free TCP port** (`1–65535`). `8787` / `8788` are examples only — not a hard limit.

Resolution order: `--port` → `WORKSPACE_KB_PORT` → `setup.dashboardPort` → local registry → default `8787`.

```bash
# pin any port in config:
# "setup": { "dashboardPort": 19090 }

npx workspace-kb start                  # config port (also syncs MCP URL)
npx workspace-kb start --port 19091     # override + rewrite config + `.cursor/mcp.json`
npx workspace-kb start --port auto      # OS free port + sync bindings
npx workspace-kb stop                   # stops config/registry port
npx workspace-kb setup --port 19090     # rewrite MCP URL + persist config only
npx workspace-kb projects
```

`start` / `serve` sync after the listen port is chosen: `setup.dashboardPort`, `.cursor/mcp.json`, and `.continue/workspace-kb.mcp.json`.

Prefer **project-local** `.cursor/mcp.json`. Examples: [`examples/multi-a`](examples/multi-a), [`examples/multi-b`](examples/multi-b), [`examples/multi-project.mcp.json`](examples/multi-project.mcp.json).

### Indexing Chinese docs

- Keep `"*.md"` in `paths` so root `README.md` / `README.zh-CN.md` are ingested.
- Prefer clear Chinese `##` headings under `docs/` for `kb_read`.
- Add spoken symptoms to `synonyms` (e.g. 登不进, 充值未到账). Full guide: [README.zh-CN.md](./README.zh-CN.md).

## Cursor / agent tips

1. Keep `npx workspace-kb start` running (HTTP MCP).
2. Ask architecture/ops questions — rule + skill should trigger `kb_search`.
3. Before re-triage: `kb_memory_search`; after a durable conclusion: `kb_memory_put` (redact + tags + TTL).
4. Confirm usage: `Get-Content .workspace-kb/usage.jsonl` or dashboard Recent events.
5. If `kb_status` shows `workspaceRoot` under your home directory, MCP is mis-bound — use HTTP mode or pin `WORKSPACE_KB_CONFIG`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EADDRINUSE :<port>` | Instance already on that port — use it, `stop --port <n>`, or change `setup.dashboardPort` |
| Dashboard old UI / no **项目记忆** / 404 `/api/health` | Kill old node on that port; reinstall `#master` (≥1.5) and `start` again |
| `No usage.jsonl` | Only **search/read/MCP** write usage — `ingest` alone does not |
| Empty search / low hit rate | `ingest`, check `health`, extend `synonyms`, verify MCP root |
| `memory put` rejected (preference / secret) | Preferences → IDE Memories; redact secrets then put |
| Memory file has lines but search is empty | Likely expired — check `expiredCount` on `memory list`, then `prune` |
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
| `WORKSPACE_KB_PORT` | Dashboard port (any `1–65535`, or `auto`; else `setup.dashboardPort`) |
| `WORKSPACE_KB_SKIP_SETUP` | `1` skips postinstall setup |

## License

MIT
