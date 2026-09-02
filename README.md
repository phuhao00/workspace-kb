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
