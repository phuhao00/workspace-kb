import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, loadRuntimeConfig } from "./config.js";

const PREFERENCE_HINT =
  /^(我喜欢|我习惯|prefer|preference|always use|never use|coding style)/i;

const SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/i,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  /\b-----BEGIN (?:RSA )?PRIVATE KEY-----/,
  /\b(?:身份证|idcard|id_card)\s*[:=]?\s*\d{15,18}[Xx]?\b/i,
];

/**
 * @param {string} text
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateMemoryText(text) {
  const t = String(text || "").trim();
  if (!t) return { ok: false, reason: "empty text" };
  if (t.length > 2000) return { ok: false, reason: "text too long (max 2000)" };
  if (PREFERENCE_HINT.test(t)) {
    return {
      ok: false,
      reason:
        "Looks like a personal preference - use Cursor Memories or Codex Memories instead of kb_memory",
    };
  }
  for (const re of SECRET_PATTERNS) {
    if (re.test(t)) {
      return {
        ok: false,
        reason:
          "Possible secret/PII detected - redact before put (no passwords, tokens, id cards)",
      };
    }
  }
  return { ok: true };
}

function memoryDir() {
  const cfg = loadRuntimeConfig();
  return path.join(cfg.dataDir, "memory");
}

function factsPath() {
  return path.join(memoryDir(), "facts.jsonl");
}

function readAllFacts() {
  const file = factsPath();
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip
    }
  }
  return out;
}

function writeAllFacts(rows) {
  ensureDir(memoryDir());
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(factsPath(), body ? `${body}\n` : "", "utf8");
}

function isExpired(row, now = Date.now()) {
  if (!row.expiresAt) return false;
  const t = Date.parse(row.expiresAt);
  return Number.isFinite(t) && t <= now;
}

/**
 * @param {{
 *   key?: string,
 *   text: string,
 *   tags?: string[],
 *   source?: string,
 *   ttlDays?: number,
 *   force?: boolean,
 * }} input
 */
export function putMemory(input) {
  const text = String(input.text || "").trim();
  const check = input.force ? { ok: true } : validateMemoryText(text);
  if (!check.ok) {
    return { ok: false, error: check.reason };
  }

  const key = String(input.key || "").trim() || slugKey(text);
  const tags = normalizeTags(input.tags);
  const ttlDays = clampTtl(input.ttlDays, 90);
  const now = new Date();
  const expiresAt =
    ttlDays > 0
      ? new Date(now.getTime() + ttlDays * 86400_000).toISOString()
      : null;

  let rows = readAllFacts().filter((r) => !isExpired(r, now.getTime()));
  // upsert by key
  rows = rows.filter((r) => r.key !== key);
  const row = {
    id: crypto.randomUUID(),
    ts: now.toISOString(),
    key,
    text,
    tags,
    source: String(input.source || "api").slice(0, 120),
    ttlDays,
    expiresAt,
  };
  rows.push(row);
  writeAllFacts(rows);
  return { ok: true, fact: row, count: rows.length };
}

/**
 * @param {{ query?: string, tag?: string, limit?: number, includeExpired?: boolean }} [opts]
 */
export function searchMemory(opts = {}) {
  const now = Date.now();
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 10));
  const query = String(opts.query || "").trim().toLowerCase();
  const tag = String(opts.tag || "").trim().toLowerCase();
  let rows = readAllFacts();
  if (!opts.includeExpired) {
    rows = rows.filter((r) => !isExpired(r, now));
  }

  const terms = query
    ? query.split(/[\s,，、]+/).filter((t) => t.length >= 1)
    : [];

  const scored = rows
    .map((r) => {
      let score = 0;
      const blob = `${r.key} ${r.text} ${(r.tags || []).join(" ")}`.toLowerCase();
      if (tag) {
        const tags = (r.tags || []).map((t) => String(t).toLowerCase());
        if (!tags.includes(tag)) return null;
        score += 2;
      }
      if (terms.length) {
        for (const t of terms) {
          if (String(r.key).toLowerCase() === t) score += 5;
          else if (String(r.key).toLowerCase().includes(t)) score += 3;
          if (blob.includes(t)) score += 1;
        }
        if (score === 0) return null;
      } else {
        score = 1;
      }
      return { ...r, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, limit);

  return {
    ok: true,
    query: opts.query || null,
    tag: opts.tag || null,
    count: scored.length,
    facts: scored,
  };
}

/**
 * @param {{ limit?: number, includeExpired?: boolean }} [opts]
 */
export function listMemory(opts = {}) {
  const now = Date.now();
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  let rows = readAllFacts();
  const expired = rows.filter((r) => isExpired(r, now)).length;
  if (!opts.includeExpired) {
    rows = rows.filter((r) => !isExpired(r, now));
  }
  rows = [...rows].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit);
  return {
    ok: true,
    count: rows.length,
    expiredCount: expired,
    facts: rows,
    path: factsPath(),
  };
}

/**
 * @param {{ id?: string, key?: string }} sel
 */
export function deleteMemory(sel) {
  const id = String(sel.id || "").trim();
  const key = String(sel.key || "").trim();
  if (!id && !key) {
    return { ok: false, error: "id or key required" };
  }
  const before = readAllFacts();
  const after = before.filter((r) => {
    if (id && r.id === id) return false;
    if (key && r.key === key) return false;
    return true;
  });
  if (after.length === before.length) {
    return { ok: false, error: "not found" };
  }
  writeAllFacts(after);
  return { ok: true, removed: before.length - after.length, count: after.length };
}

/** Drop expired rows from disk. */
export function pruneExpiredMemory() {
  const now = Date.now();
  const before = readAllFacts();
  const after = before.filter((r) => !isExpired(r, now));
  writeAllFacts(after);
  return { ok: true, removed: before.length - after.length, count: after.length };
}

/**
 * Attach a few related facts for a search query (no throw).
 * @param {string} query
 * @param {number} [limit]
 */
export function relatedMemories(query, limit = 3) {
  try {
    const result = searchMemory({ query, limit });
    return result.facts || [];
  } catch {
    return [];
  }
}

function normalizeTags(tags) {
  if (!tags) return [];
  const arr = Array.isArray(tags) ? tags : String(tags).split(/[,，\s]+/);
  return [...new Set(arr.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12);
}

function clampTtl(value, fallback) {
  if (value === 0 || value === "0") return 0; // never expire
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(3650, Math.round(n));
}

function slugKey(text) {
  const base = text
    .slice(0, 48)
    .toLowerCase()
    .replace(/[^\u4e00-\u9fffa-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return base || `fact-${Date.now().toString(36)}`;
}
