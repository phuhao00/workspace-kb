#!/usr/bin/env node
import { ingest } from "./ingest.js";
import { readKnowledge } from "./read.js";
import { searchKnowledge } from "./search.js";
import { knowledgeStatus } from "./status.js";
import { summarizeUsage } from "./usage.js";
import { pinConfigToCwd } from "./config.js";

const [command, ...rest] = process.argv.slice(2);

// Always bind to the project you `cd` into, even if the shell still has
// WORKSPACE_KB_CONFIG / WORKSPACE_ROOT from another repo.
pinConfigToCwd(process.cwd());

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
      const watch = !args.includes("--no-watch");
      const started = await startDashboard({ port, watch });
      try {
        registerProject({ port: started.port });
      } catch {
        // ignore
      }
      await new Promise(() => {});
      return;
    }
    case "watch": {
      const { startAutoIngest } = await import("./watch.js");
      const result = startAutoIngest({ enabled: true });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.enabled) {
        process.exitCode = 1;
        return;
      }
      process.stderr.write(
        "auto-ingest running — edit markdown under watched roots; Ctrl+C to stop\n",
      );
      await new Promise(() => {});
      return;
    }
    case "start": {
      const { startDaemon } = await import("./daemon.js");
      const port = parsePort(args);
      const watch = !args.includes("--no-watch");
      const result = await startDaemon({ port, watch });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    case "up": {
      // One-shot: sync MCP/config to port → background dashboard (+ auto-ingest)
      const port = parsePort(args);
      const ingestFirst = args.includes("--ingest") || args.includes("--full");
      const full = args.includes("--full");
      const noWatch = args.includes("--no-watch");
      if (ingestFirst) {
        const meta = await ingest({ full });
        process.stderr.write(
          `ingest: ${meta.chunkCount || 0} chunks · ${meta.fileCount || 0} files\n`,
        );
      }
      const { runSetup } = await import("./setup.js");
      const { resetRuntimeConfig } = await import("./config.js");
      const setup = runSetup({ port, quiet: true });
      resetRuntimeConfig();
      if (setup.ok === false) {
        process.stdout.write(`${JSON.stringify({ ok: false, step: "setup", setup }, null, 2)}\n`);
        process.exitCode = 1;
        return;
      }
      const { startDaemon } = await import("./daemon.js");
      const started = await startDaemon({
        port: port !== undefined ? port : setup.dashboardPort,
        watch: !noWatch,
      });
      const out = {
        ok: Boolean(started.ok),
        command: "up",
        port: started.port,
        dashboardUrl: started.dashboardUrl,
        mcpUrl: started.mcpUrl,
        alreadyRunning: started.alreadyRunning,
        autoIngest: noWatch ? false : true,
        setup: {
          ok: setup.ok,
          dashboardPort: setup.dashboardPort,
          mcpPath: setup.mcpPath,
          serverId: setup.serverId,
        },
        hint: "Docs changes auto-ingest while dashboard runs. Reload Cursor MCP if port changed.",
      };
      process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      if (!out.ok) process.exitCode = 1;
      return;
    }
    case "stop":
    case "down": {
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
      runSetup({ port: parsePort(args) });
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
    case "memory": {
      const { putMemory, searchMemory, listMemory, deleteMemory, pruneExpiredMemory } =
        await import("./memory.js");
      const sub = args[0] || "list";
      const restArgs = args.slice(1);
      if (sub === "put") {
        const tagsIdx = restArgs.indexOf("--tags");
        const ttlIdx = restArgs.indexOf("--ttl");
        const keyIdx = restArgs.indexOf("--key");
        const tags =
          tagsIdx >= 0 ? String(restArgs[tagsIdx + 1] || "").split(/[,，]/) : [];
        const ttlDays = ttlIdx >= 0 ? Number(restArgs[ttlIdx + 1]) : undefined;
        const key = keyIdx >= 0 ? restArgs[keyIdx + 1] : undefined;
        const text = restArgs
          .filter((a, i, arr) => {
            if (a.startsWith("--")) return false;
            if (i > 0 && ["--tags", "--ttl", "--key"].includes(arr[i - 1])) return false;
            return true;
          })
          .join(" ")
          .trim();
        if (!text) throw new Error('usage: workspace-kb memory put "text" [--key k] [--tags a,b] [--ttl 90]');
        const result = putMemory({ text, key, tags, ttlDays, source: "cli" });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        if (!result.ok) process.exitCode = 1;
        return;
      }
      if (sub === "search") {
        const q = restArgs.join(" ").trim();
        process.stdout.write(`${JSON.stringify(searchMemory({ query: q }), null, 2)}\n`);
        return;
      }
      if (sub === "delete") {
        const idIdx = restArgs.indexOf("--id");
        const keyIdx = restArgs.indexOf("--key");
        const result = deleteMemory({
          id: idIdx >= 0 ? restArgs[idIdx + 1] : undefined,
          key: keyIdx >= 0 ? restArgs[keyIdx + 1] : restArgs[0],
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        if (!result.ok) process.exitCode = 1;
        return;
      }
      if (sub === "prune") {
        process.stdout.write(`${JSON.stringify(pruneExpiredMemory(), null, 2)}\n`);
        return;
      }
      process.stdout.write(`${JSON.stringify(listMemory({ limit: 50 }), null, 2)}\n`);
      return;
    }
    default:
      throw new Error(
        "usage: workspace-kb <up|down|ingest|search|…>\n" +
          "\n" +
          "Everyday (one command):\n" +
          "  up   [--port <n|auto>] [--ingest|--full] [--no-watch]\n" +
          "       sync MCP+config, start dashboard, auto incremental ingest on doc changes\n" +
          "  down [--port <n>]                         # stop\n" +
          "  watch                                     # foreground auto-ingest only\n" +
          "\n" +
          "Also: start|stop|serve|setup|init|projects|health|status|stats|search|read|memory|feedback\n" +
          "Disable auto-ingest: --no-watch | autoIngest:false | WORKSPACE_KB_AUTO_INGEST=0\n" +
          "Upgrade if commands missing: npm i github:phuhao00/workspace-kb#master",
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
