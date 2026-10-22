---
name: query-workspace-kb
description: >-
  Search workspace-kb docs (kb_search) and shared project ops memory
  (kb_memory_*). Use for architecture, symptoms, env facts, and triage
  across Cursor / Codex / WorkBuddy / CLI. Not for personal preferences.
---

# Query workspace knowledge (`workspace-kb`)

## Where to look

| Need | Tool |
|------|------|
| Docs / skills / wiki | `kb_search` → `kb_read` |
| Shared ops facts / prior triage | `kb_memory_search` / `kb_memory_put` |
| Personal preference | Cursor / Codex / WorkBuddy Memories (not kb_memory) |
| Team hard rules | `AGENTS.md` / rules (not memory) |

## Docs flow

1. `kb_search` (limit 6–8). Note `relatedMemories` in the response.
2. `kb_read` one cited heading; then `rg` only in that repo.
3. CLI fallback: `npx workspace-kb search -- "<query>"`.

## Memory flow (cross Cursor + Codex + WorkBuddy + CLI)

1. Before repeating an investigation: `kb_memory_search`.
2. After a durable, redacted conclusion: `kb_memory_put` with tags + optional `ttlDays` (default 90).
3. Audit/delete on the dashboard **项目记忆** panel.

Engine must be running: `npx workspace-kb up` (HTTP MCP on the dashboard port).

## Examples

```text
kb_search query="充值未到账"
kb_memory_search query="fish37 hallapi"
kb_memory_put text="测服 hallapi HTTP 在 fish37:8080" tags=["ops","test-env"] ttlDays=90
npx workspace-kb memory list
```
