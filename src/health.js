import fs from "node:fs";
import path from "node:path";
import { loadRuntimeConfig, resetRuntimeConfig } from "./config.js";
import { readMeta } from "./db.js";
import { summarizeUsage } from "./usage.js";

/**
 * Dashboard / CLI health probe.
 * @param {{ mcpGateway?: { getStatus: () => object } }} [ctx]
 */
export async function getHealth(ctx = {}) {
  resetRuntimeConfig();
  const cfg = loadRuntimeConfig();
  const meta = readMeta();
  const usage = summarizeUsage({ days: 7 });
  const checks = [];

  const configOk = Boolean(cfg.configPath && fs.existsSync(cfg.configPath));
  checks.push({
    id: "config",
    ok: configOk,
    detail: configOk ? cfg.configPath : "workspace-kb.config.json not found",
  });

  const home = path.resolve(process.env.USERPROFILE || process.env.HOME || "");
  const rootOk =
    Boolean(cfg.workspaceRoot) &&
    path.resolve(cfg.workspaceRoot).toLowerCase() !== home.toLowerCase();
  checks.push({
    id: "workspaceRoot",
    ok: rootOk,
    detail: cfg.workspaceRoot,
    hint: rootOk
      ? null
      : "MCP may be reading the wrong folder — pin WORKSPACE_KB_CONFIG or use HTTP MCP via serve",
  });

  const indexOk = Boolean(meta?.chunkCount > 0);
  checks.push({
    id: "index",
    ok: indexOk,
    detail: indexOk
      ? `${meta.chunkCount} chunks · ${meta.modelId || cfg.modelId} · ${meta.ingestedAt || "?"}`
      : "empty — run workspace-kb ingest",
  });

  const embed = await probeEmbedProvider(cfg);
  checks.push({
    id: "embed",
    ok: embed.ok,
    detail: embed.detail,
    provider: embed.provider,
  });

  const mcp = ctx.mcpGateway?.getStatus?.() || { mode: "off", sessions: 0 };
  checks.push({
    id: "mcpHttp",
    ok: mcp.mode === "http",
    detail:
      mcp.mode === "http"
        ? `sessions ${mcp.sessions} · restarts ${mcp.restartCount || 0}`
        : "dashboard HTTP MCP not attached",
  });

  const emptySearches = usage.emptySearchCount || 0;
  const searchCount = usage.searchCount || 0;
  const hitRate =
    searchCount === 0 ? null : Number((1 - emptySearches / searchCount).toFixed(3));
  checks.push({
    id: "hitRate",
    ok: searchCount === 0 ? true : hitRate >= 0.3,
    detail:
      searchCount === 0
        ? "no searches yet — run kb_search or CLI search"
        : `hitRate ${(hitRate * 100).toFixed(0)}% · empty ${emptySearches}/${searchCount}`,
    hint:
      searchCount > 0 && hitRate < 0.3
        ? "Many empty results — check ingest coverage, synonyms, or MCP workspaceRoot"
        : null,
  });

  const ok = checks
    .filter((c) => c.id !== "mcpHttp" || c.detail?.includes("sessions"))
    .every((c) => c.ok);
  // mcpHttp only required when dashboard attached it
  const requiredOk = checks
    .filter((c) => !["mcpHttp", "hitRate"].includes(c.id))
    .every((c) => c.ok);
  return {
    ok: requiredOk,
    ready: indexOk && configOk && rootOk,
    checks,
    workspaceRoot: cfg.workspaceRoot,
    dataDir: cfg.dataDir,
    configPath: cfg.configPath,
    modelId: cfg.modelId,
    embedProvider: cfg.embedProvider,
    mcp,
    usage: {
      searchCount,
      readCount: usage.readCount,
      emptySearchCount: emptySearches,
      hitSearchCount: usage.hitSearchCount || 0,
      hitRate,
      failCount: usage.failCount,
    },
    meta: meta
      ? {
          chunkCount: meta.chunkCount,
          fileCount: meta.fileCount,
          ingestedAt: meta.ingestedAt,
          modelId: meta.modelId,
          incremental: meta.incremental || null,
        }
      : null,
  };
}

async function probeEmbedProvider(cfg) {
  const provider = cfg.embedProvider || "ollama";
  if (provider === "openai" || provider === "openai-compatible") {
    const key = cfg.openaiApiKey || process.env.OPENAI_API_KEY || "";
    if (!key) {
      return {
        ok: false,
        provider,
        detail: "OPENAI_API_KEY / openaiApiKey missing",
      };
    }
    return {
      ok: true,
      provider,
      detail: `${cfg.openaiBaseUrl || "https://api.openai.com/v1"} · model ${cfg.modelId}`,
    };
  }
  try {
    const res = await fetch(`${cfg.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return { ok: false, provider: "ollama", detail: `HTTP ${res.status} @ ${cfg.ollamaHost}` };
    }
    const data = await res.json();
    const names = (data.models || []).map((m) => m.name || m.model || "");
    const has = names.some((n) => n === cfg.modelId || n.startsWith(`${cfg.modelId}:`));
    return {
      ok: has,
      provider: "ollama",
      detail: has
        ? `${cfg.modelId} available @ ${cfg.ollamaHost}`
        : `model ${cfg.modelId} not pulled — ollama pull ${cfg.modelId}`,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "ollama",
      detail: `unreachable ${cfg.ollamaHost}: ${err instanceof Error ? err.message : err}`,
    };
  }
}
