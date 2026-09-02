#!/usr/bin/env node
import { ingest } from "./ingest.js";
import { readKnowledge } from "./read.js";
import { searchKnowledge } from "./search.js";
import { knowledgeStatus } from "./status.js";
import { summarizeUsage } from "./usage.js";

const [command, ...rest] = process.argv.slice(2);

try {
  await main(command, rest);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
}

async function main(cmd, args) {
  switch (cmd) {
    case "ingest": {
      const full = args.includes("--full");
      const meta = await ingest({ full });
      process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
      return;
    }
    case "search": {
      const { query, options } = parseSearch(args);
      if (!query) {
        throw new Error(
          'usage: workspace-kb search "<query>" [--limit 6] [--kind wiki] [--repo my-service]',
        );
      }
      const result = await searchKnowledge(query, options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "read": {
      const [relPath, ...headingParts] = args;
      if (!relPath) {
        throw new Error("usage: workspace-kb read <path> [heading]");
      }
      const result = readKnowledge(relPath, headingParts.join(" ") || undefined);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "status": {
      const result = await knowledgeStatus();
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "health": {
      const { getHealth } = await import("./health.js");
      const result = await getHealth();
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    case "stats": {
      const days = parseDays(args);
      const result = summarizeUsage({ days });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "serve":
    case "dashboard": {
      const { startDashboard } = await import("./dashboard.js");
      const { registerProject } = await import("./daemon.js");
      const port = parsePort(args);
      await startDashboard({ port });
      try {
        registerProject({ port });
      } catch {
        // ignore
      }
      await new Promise(() => {});
      return;
    }
    case "start": {
      const { startDaemon } = await import("./daemon.js");
      const port = parsePort(args);
      const result = startDaemon({ port });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "stop": {
      const { stopDaemon } = await import("./daemon.js");
      const port = parsePort(args);
      const result = stopDaemon({ port });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    case "projects": {
      const { listProjects } = await import("./daemon.js");
      process.stdout.write(`${JSON.stringify({ projects: listProjects() }, null, 2)}\n`);
      return;
    }
    case "setup": {
      const { runSetup } = await import("./setup.js");
      runSetup();
      return;
    }
    case "init": {
      const { initWorkspace } = await import("./init.js");
      const force = args.includes("--force");
      const port = parsePort(args);
      const nameIdx = args.indexOf("--name");
      const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
      const result = initWorkspace({ force, port, name });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "feedback": {
      const { appendFeedback, summarizeFeedback } = await import("./feedback.js");
      if (args[0] === "list" || args.length === 0) {
        process.stdout.write(`${JSON.stringify(summarizeFeedback({ days: parseDays(args) }), null, 2)}\n`);
        return;
      }
      const useful = !args.includes("--bad");
      const query = args.filter((a) => !a.startsWith("--") && a !== "list").join(" ");
      const row = appendFeedback({ useful, query, note: "cli" });
      process.stdout.write(`${JSON.stringify(row, null, 2)}\n`);
      return;
    }
    default:
      throw new Error(
        "usage: workspace-kb <ingest|search|read|status|health|stats|serve|start|stop|projects|setup|init|feedback>\n" +
          "  ingest [--full]\n" +
          '  search "<query>" [--limit 6] [--kind skill] [--repo my-service]\n' +
          "  read <path> [heading]\n" +
          "  start|stop|serve [--port 8787]\n" +
          "  init [--force] [--name my-app] [--port 8787]\n" +
          "  setup   # write .cursor/mcp.json + rules + skill + Continue snippet\n" +
          "  feedback [--bad] <query note>",
      );
  }
}

function parseSearch(args) {
  const options = {};
  const parts = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--limit") {
      options.limit = args[++i];
      continue;
    }
    if (arg === "--kind") {
      options.kind = args[++i];
      continue;
    }
    if (arg === "--repo") {
      options.repo = args[++i];
      continue;
    }
    parts.push(arg);
  }
  return { query: parts.join(" ").trim(), options };
}

function parseDays(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days") {
      return args[++i];
    }
  }
  return 7;
}

function parsePort(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port") {
      return args[++i];
    }
  }
  return undefined;
}
