import fs from "node:fs";
import path from "node:path";
import { ensureDir, loadRuntimeConfig } from "./config.js";

/** Rough token estimate for mixed CN/EN prose (proxy, not billable). */
export function estimateTokens(chars) {
  const n = Number(chars);
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return Math.ceil(n / 4);
}

export function workspaceFileChars(relPath) {
  if (!relPath) {
    return 0;
  }
  const cfg = loadRuntimeConfig();
  const normalized = String(relPath).replace(/\\/g, "/");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return 0;
  }
  const abs = path.resolve(cfg.workspaceRoot, normalized);
  const root = path.resolve(cfg.workspaceRoot);
  const prefix = root.toLowerCase() + path.sep;
  if (!abs.toLowerCase().startsWith(prefix) && abs.toLowerCase() !== root.toLowerCase()) {
    return 0;
  }
  try {
    return fs.statSync(abs).size;
  } catch {
    return 0;
  }
}

/**
 * Append one usage event. Never throws.
 * @param {Record<string, unknown>} event
 */
export function appendUsage(event) {
  try {
    const cfg = loadRuntimeConfig();
    ensureDir(path.dirname(cfg.usagePath));
    const returned = Number(event.returned_chars) || 0;
    const full = Number(event.full_file_chars) || 0;
    const estReturned = estimateTokens(returned);
    const estFull = estimateTokens(full);
    const { returned_chars: _r, full_file_chars: _f, ...rest } = event;
    const row = {
      ...rest,
      ts: new Date().toISOString(),
      ok: event.ok !== false,
      op: event.op || "unknown",
      returned_chars: returned,
      full_file_chars: full,
      est_tokens_returned: estReturned,
      est_tokens_full: estFull,
      est_tokens_saved: Math.max(0, estFull - estReturned),
    };
    fs.appendFileSync(cfg.usagePath, `${JSON.stringify(row)}\n`, "utf8");
  } catch {
    // swallow
  }
}

/**
 * @param {{ days?: number }} [options]
 */
export function summarizeUsage(options = {}) {
  const cfg = loadRuntimeConfig();
  const days = clampDays(options.days, 7);
  const cutoff = Date.now() - days * 86400_000;
  const rows = readUsageRows(cfg.usagePath).filter((r) => {
    const t = Date.parse(r.ts);
    return Number.isFinite(t) && t >= cutoff;
  });

  let searchCount = 0;
  let readCount = 0;
  let okCount = 0;
  let failCount = 0;
  let hitSum = 0;
  let returnedTokens = 0;
  let fullTokens = 0;
  let savedTokens = 0;
  let latencySum = 0;
  let latencyN = 0;
  const queryCounts = new Map();

  for (const r of rows) {
    if (r.ok === false) {
      failCount += 1;
    } else {
      okCount += 1;
    }
    if (r.op === "search") {
      searchCount += 1;
      hitSum += Number(r.hit_count) || 0;
      const q = String(r.query || "").trim();
      if (q) {
        queryCounts.set(q, (queryCounts.get(q) || 0) + 1);
      }
    } else if (r.op === "read") {
      readCount += 1;
    }
    returnedTokens += Number(r.est_tokens_returned) || 0;
    fullTokens += Number(r.est_tokens_full) || 0;
    savedTokens += Number(r.est_tokens_saved) || 0;
    const lat = Number(r.latency_ms);
    if (Number.isFinite(lat) && lat >= 0) {
      latencySum += lat;
      latencyN += 1;
    }
  }

  const topQueries = [...queryCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }));

  return {
    note: "Proxy metrics (chars/4). Not LLM billing tokens.",
    days,
    logPath: path.relative(cfg.workspaceRoot, cfg.usagePath) || cfg.usagePath,
    logExists: fs.existsSync(cfg.usagePath),
    events: rows.length,
    searchCount,
    readCount,
    okCount,
    failCount,
    avgHits: searchCount === 0 ? 0 : Number((hitSum / searchCount).toFixed(2)),
    estTokensReturned: returnedTokens,
    estTokensFull: fullTokens,
    estTokensSaved: savedTokens,
    avgLatencyMs: latencyN === 0 ? null : Math.round(latencySum / latencyN),
    topQueries,
  };
}

/**
 * @param {{ days?: number, recent?: number }} [options]
 */
export function getUsageDashboard(options = {}) {
  const cfg = loadRuntimeConfig();
  const days = clampDays(options.days, 7);
  const recentLimit = Math.min(100, Math.max(1, Number(options.recent) || 40));
  const allRows = readUsageRows(cfg.usagePath);
  const cutoff = Date.now() - days * 86400_000;
  const filtered = allRows.filter((r) => {
    const t = Date.parse(r.ts);
    return Number.isFinite(t) && t >= cutoff;
  });
  const recent = [...filtered]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, recentLimit);

  let meta = null;
  try {
    if (fs.existsSync(cfg.metaPath)) {
      meta = JSON.parse(fs.readFileSync(cfg.metaPath, "utf8"));
    }
  } catch {
    meta = null;
  }

  return {
    ok: true,
    summary: summarizeUsage({ days }),
    trend: buildDailyTrend(allRows, days),
    recent,
    meta: meta
      ? {
          exists: true,
          modelId: meta.modelId,
          embedDim: meta.embedDim,
          ingestedAt: meta.ingestedAt,
          chunkCount: meta.chunkCount,
          fileCount: meta.fileCount,
          byKind: meta.byKind || {},
        }
      : { exists: false },
    workspaceRoot: cfg.workspaceRoot,
    dataDir: cfg.dataDir,
    configPath: cfg.configPath,
  };
}

function buildDailyTrend(rows, days) {
  const dayKeys = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    dayKeys.push(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d),
    );
  }
  const map = new Map();
  for (const day of dayKeys) {
    map.set(day, {
      day,
      search: 0,
      read: 0,
      fail: 0,
      estTokensReturned: 0,
      estTokensSaved: 0,
    });
  }
  const cutoff = Date.now() - days * 86400_000;
  for (const r of rows) {
    const t = Date.parse(r.ts);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const day = beijingDay(String(r.ts));
    if (!day || !map.has(day)) continue;
    const point = map.get(day);
    if (r.op === "search") point.search += 1;
    else if (r.op === "read") point.read += 1;
    if (r.ok === false) point.fail += 1;
    point.estTokensReturned += Number(r.est_tokens_returned) || 0;
    point.estTokensSaved += Number(r.est_tokens_saved) || 0;
  }
  return dayKeys.map((d) => map.get(d));
}

function beijingDay(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function readUsageRows(usageFile) {
  try {
    if (!fs.existsSync(usageFile)) {
      return [];
    }
    const text = fs.readFileSync(usageFile, "utf8");
    const out = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        // skip
      }
    }
    return out;
  } catch {
    return [];
  }
}

function clampDays(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.min(90, Math.max(1, Math.round(n)));
}
