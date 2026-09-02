# workspace-kb

Local [LanceDB](https://github.com/lancedb/lancedb) knowledge base for **agent-friendly** markdown workspaces.

Index curated docs / skills / wiki — not your full source tree. Cursor talks over **MCP**; scripts and Codex use the **CLI**. Search returns short snippets; `kb_read` opens one heading.

## Requirements

- Node.js >= 20
- [Ollama](https://ollama.com) with an embedding model (default **`bge-m3`**, 1024-d)

```bash
ollama pull bge-m3
```

Tighter VRAM: `WORKSPACE_KB_MODEL=nomic-embed-text` (set matching `embedDim` in config).

## Install

```bash
npm install github:phuhao00/workspace-kb
```

**Auto-setup (v1.2+):** on `npm install` / `npm update`, if `workspace-kb.config.json` exists in the install directory or a parent folder, the package writes:

- `.cursor/mcp.json` — project-local MCP server (`<folder>-kb`, overridable via config)
- `AGENTS.md` — managed `<!-- WORKSPACE-KB:START -->` block telling agents to call `kb_search` first

Also re-runs after every successful `ingest`. Set `WORKSPACE_KB_SKIP_SETUP=1` to disable postinstall, or `"setup": { "enabled": false }` in config.

After install/update, **restart MCP in Cursor** so `kb_search` / `kb_read` appear in chat.

Optional config overrides:

```json
{
  "setup": {
    "mcpServerId": "my-project-kb",
    "dashboardPort": 8788,
    "agentsMd": true
  }
}
```

Skip rewriting `AGENTS.md` if it already mentions `kb_search` (custom docs preserved). Set `"agentsMd": false` to only write MCP.

## Configure

Put `workspace-kb.config.json` at your **workspace root** (or set `WORKSPACE_KB_CONFIG`):

```json
{
  "workspaceRoot": ".",
  "dataDir": ".workspace-kb",
  "model": "bge-m3",
  "embedDim": 1024,
  "paths": [".agents", "docs", "*.md"],
  "childRepos": ["api", "web"],
  "childGlobs": ["README*.md", "docs/**/*.md"],
  "skipDirs": ["node_modules", "vendor", ".git", ".next", "Library", "logs"]
}
```

Index + `usage.jsonl` live under `dataDir` (git-ignore it).

## CLI

```bash
npx workspace-kb ingest
npx workspace-kb search "payment failure"
npx workspace-kb read docs/pay.md "Overview"
npx workspace-kb status
npx workspace-kb stats --days 7
npx workspace-kb serve --port 8787
```

## Dashboard (token efficiency UI)

Built-in local page — no Monitor / Next.js required:

```bash
npx workspace-kb serve
# open http://127.0.0.1:8787/
```

Shows call counts, estimated returned/saved tokens (`chars/4`), daily trends, top queries, and recent events. Auto-refreshes every 15s.

## Cursor MCP

```json
{
  "mcpServers": {
    "workspace-kb": {
      "command": "node",
      "args": ["node_modules/workspace-kb/src/mcp.js"],
      "cwd": "/absolute/path/to/your/workspace"
    }
  }
}
```

Tools: `kb_search` · `kb_read` · `kb_status`.

## Multiple projects on one machine

Each workspace keeps its **own** config and data. They do not share an index.

```text
E:/project-a/
  workspace-kb.config.json
  .workspace-kb/                 # project-a index + usage.jsonl

E:/project-b/
  workspace-kb.config.json
  .workspace-kb/                 # project-b only
```

### CLI

Run commands **from that project root** (or set `WORKSPACE_KB_CONFIG`):

```bash
cd E:/project-a
npx workspace-kb ingest
npx workspace-kb serve --port 8787

cd E:/project-b
npx workspace-kb ingest
npx workspace-kb serve --port 8788   # different port
```

Or pin the config explicitly:

```bash
set WORKSPACE_KB_CONFIG=E:\project-b\workspace-kb.config.json
npx workspace-kb status
```

### Dashboard ports

Two `serve` processes cannot bind the same port. Use `--port` or `WORKSPACE_KB_PORT`.

| Project   | Example URL                    |
|-----------|--------------------------------|
| project-a | http://127.0.0.1:8787/         |
| project-b | http://127.0.0.1:8788/         |

### Cursor MCP

User-level `mcp.json` is usually global. Register **two servers** with different `cwd` (and optional `env`):

```json
{
  "mcpServers": {
    "kb-project-a": {
      "command": "node",
      "args": ["E:/project-a/node_modules/workspace-kb/src/mcp.js"],
      "cwd": "E:/project-a"
    },
    "kb-project-b": {
      "command": "node",
      "args": ["E:/project-b/node_modules/workspace-kb/src/mcp.js"],
      "cwd": "E:/project-b",
      "env": {
        "WORKSPACE_KB_CONFIG": "E:/project-b/workspace-kb.config.json"
      }
    }
  }
}
```

Prefer a **project-local** `.cursor/mcp.json` inside each repo so opening that folder only loads that KB.

See also [`examples/multi-project.mcp.json`](examples/multi-project.mcp.json) and the twin sample trees [`examples/multi-a`](examples/multi-a) / [`examples/multi-b`](examples/multi-b).

After upgrading the package:

```bash
npm install github:phuhao00/workspace-kb#master
# then restart the MCP servers in Cursor
```

## Env

| Variable | Meaning |
|----------|---------|
| `WORKSPACE_KB_CONFIG` | Absolute path to config JSON |
| `WORKSPACE_ROOT` | Override workspace root |
| `WORKSPACE_KB_MODEL` / `BUYU_KB_MODEL` | Embedding model id |
| `WORKSPACE_KB_DIM` / `BUYU_KB_DIM` | Expected dimension |
| `OLLAMA_HOST` | Default `http://127.0.0.1:11434` |
| `WORKSPACE_KB_PORT` | Dashboard port (default `8787`) |

## License

MIT
