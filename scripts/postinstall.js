#!/usr/bin/env node
import { runSetup } from "../src/setup.js";

if (process.env.WORKSPACE_KB_SKIP_SETUP === "1") {
  process.exit(0);
}

try {
  const result = runSetup({ quiet: true });
  if (result.ok) {
    process.stdout.write(
      `workspace-kb: auto-configured MCP "${result.serverId}" → ${result.mcpPath}\n`,
    );
    if (result.agentsMd && result.agentsMd !== "skipped") {
      process.stdout.write(`workspace-kb: AGENTS.md ${result.agentsMd}\n`);
    }
  }
} catch (err) {
  process.stderr.write(
    `workspace-kb setup skipped: ${err instanceof Error ? err.message : err}\n`,
  );
}
