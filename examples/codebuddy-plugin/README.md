# workspace-kb CodeBuddy / WorkBuddy plugin (example)

This folder is a **template**. Prefer generating a project-local copy:

```bash
npx workspace-kb up --port 8787
npx workspace-kb install-clients
# writes ./plugins/workspace-kb with the correct MCP URL + server id
```

## Install into WorkBuddy / CodeBuddy

```bash
codebuddy plugin install ./plugins/workspace-kb --scope project
```

Or open **Settings → MCP** and paste:

```text
http://127.0.0.1:<dashboardPort>/mcp
```

## Prerequisite

The plugin does **not** embed LanceDB. Keep the engine running:

```bash
npx workspace-kb up
```

Then Cursor, Codex, and WorkBuddy all share the same index and `kb_memory_*`.
