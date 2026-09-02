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
      const meta = await ingest();
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
    case "stats": {
      const days = parseDays(args);
      const result = summarizeUsage({ days });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "serve":
    case "dashboard": {
      const { startDashboard } = await import("./dashboard.js");
      const port = parsePort(args);
      await startDashboard({ port });
      // keep process alive
      await new Promise(() => {});
      return;
    }
    default:
      throw new Error(
        "usage: workspace-kb <ingest|search|read|status|stats|serve>\n" +
          '  search "<query>" [--limit 6] [--kind skill] [--repo my-service]\n' +
          "  read <path> [heading]\n" +
          "  stats [--days 7]\n" +
          "  serve [--port 8787]",
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
