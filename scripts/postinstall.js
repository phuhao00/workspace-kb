#!/usr/bin/env node
import { formatClientsSummary } from "../src/clients.js";
import { runSetup } from "../src/setup.js";

if (process.env.WORKSPACE_KB_SKIP_SETUP === "1") {
  process.exit(0);
}

try {
  const result = runSetup({ quiet: true, preferInitCwd: true });
  if (result.ok) {
    process.stdout.write(`${formatClientsSummary(result)}\n`);
    if (result.agentsMd && !["skipped", "unchanged", "skipped-custom"].includes(result.agentsMd)) {
      process.stdout.write(`workspace-kb: AGENTS.md ${result.agentsMd}\n`);
    }
  }
} catch (err) {
  process.stderr.write(
    `workspace-kb setup skipped: ${err instanceof Error ? err.message : err}\n`,
  );
}
