import fs from "node:fs";
import path from "node:path";
import { ensureDir, loadRuntimeConfig } from "./config.js";

export function appendFeedback(event) {
  const cfg = loadRuntimeConfig();
  ensureDir(path.dirname(cfg.feedbackPath));
  const row = {
    ts: new Date().toISOString(),
    useful: event.useful !== false,
    query: event.query || null,
    path: event.path || null,
    heading: event.heading || null,
    score: event.score ?? null,
    note: event.note || null,
  };
  fs.appendFileSync(cfg.feedbackPath, `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

export function summarizeFeedback(options = {}) {
  const cfg = loadRuntimeConfig();
  const days = Math.min(90, Math.max(1, Number(options.days) || 30));
  const cutoff = Date.now() - days * 86400_000;
  const rows = readJsonl(cfg.feedbackPath).filter((r) => {
    const t = Date.parse(r.ts);
    return Number.isFinite(t) && t >= cutoff;
  });
  let useful = 0;
  let useless = 0;
  const byPath = new Map();
  for (const r of rows) {
    if (r.useful) useful += 1;
    else useless += 1;
    const p = r.path || "(unknown)";
    const cur = byPath.get(p) || { path: p, useful: 0, useless: 0 };
    if (r.useful) cur.useful += 1;
    else cur.useless += 1;
    byPath.set(p, cur);
  }
  const top = [...byPath.values()]
    .sort((a, b) => b.useful + b.useless - (a.useful + a.useless))
    .slice(0, 12);
  return {
    days,
    total: rows.length,
    useful,
    useless,
    usefulRate: rows.length ? Number((useful / rows.length).toFixed(3)) : null,
    topPaths: top,
    recent: rows.slice(-20).reverse(),
  };
}

/** Path boost from feedback: useful - useless, clamped. */
export function feedbackPathBoost(relPath) {
  const cfg = loadRuntimeConfig();
  const rows = readJsonl(cfg.feedbackPath);
  let score = 0;
  for (const r of rows) {
    if (r.path !== relPath) continue;
    score += r.useful ? 1 : -1;
  }
  return Math.max(-0.15, Math.min(0.2, score * 0.02));
}

function readJsonl(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
