import { loadRuntimeConfig } from "./config.js";
import { openTable } from "./db.js";
import { embedQuery } from "./embed.js";
import { appendUsage, workspaceFileChars } from "./usage.js";

export async function searchKnowledge(query, options = {}) {
  const started = Date.now();
  const cfg = loadRuntimeConfig();
  const limit = clampInt(options.limit, 1, 12, cfg.defaultSearchLimit);
  try {
    const table = await openTable();
    const vector = await embedQuery(query);

    let builder = table.search(vector).limit(cfg.vectorCandidates);
    if (typeof builder.distanceType === "function") {
      builder = builder.distanceType("cosine");
    }
    if (options.kind) {
      builder = builder.where(`kind = '${escapeSql(options.kind)}'`);
    }
    if (options.repo) {
      builder = builder.where(`repo = '${escapeSql(options.repo)}'`);
    }

    const raw = await builder.toArray();
    const terms = queryTerms(query);
    const ranked = raw
      .map((row) => scoreRow(row, terms))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => toHit(item, cfg.snippetChars));

    const returnedChars = ranked.reduce(
      (sum, hit) =>
        sum +
        String(hit.snippet || "").length +
        String(hit.path || "").length +
        String(hit.heading || "").length,
      0,
    );
    const paths = new Set(ranked.map((h) => h.path).filter(Boolean));
    let fullFileChars = 0;
    for (const p of paths) {
      fullFileChars += workspaceFileChars(p);
    }

    appendUsage({
      op: "search",
      ok: true,
      query,
      hit_count: ranked.length,
      returned_chars: returnedChars,
      full_file_chars: fullFileChars,
      latency_ms: Date.now() - started,
      kind: options.kind || null,
      repo: options.repo || null,
    });

    return {
      query,
      count: ranked.length,
      results: ranked,
    };
  } catch (err) {
    appendUsage({
      op: "search",
      ok: false,
      query,
      hit_count: 0,
      returned_chars: 0,
      full_file_chars: 0,
      latency_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      kind: options.kind || null,
      repo: options.repo || null,
    });
    throw err;
  }
}

function scoreRow(row, terms) {
  const distance = Number(row._distance ?? row.distance ?? 0);
  const vectorScore = 1 / (1 + Math.max(distance, 0));
  const path = String(row.path || "").toLowerCase();
  const heading = String(row.heading || "").toLowerCase();
  const text = String(row.text || "").toLowerCase();
  let lexical = 0;
  for (const term of terms) {
    if (path.includes(term)) {
      lexical += 3;
    }
    if (heading.includes(term)) {
      lexical += 2;
    }
    if (text.includes(term)) {
      lexical += 1;
    }
  }
  const lexicalNorm = terms.length === 0 ? 0 : lexical / (terms.length * 6);
  return {
    row,
    score: 0.7 * vectorScore + 0.3 * lexicalNorm,
  };
}

function toHit({ row, score }, snippetLimit) {
  const text = String(row.text || "");
  return {
    score: Number(score.toFixed(4)),
    path: row.path,
    heading: row.heading,
    start_line: row.start_line,
    repo: row.repo,
    kind: row.kind,
    snippet: snippet(text, snippetLimit),
  };
}

function snippet(text, limit) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit - 1)}…`;
}

export function queryTerms(query) {
  const terms = new Set();
  const trimmed = query.trim();
  if (trimmed) {
    terms.add(trimmed.toLowerCase());
  }
  for (const part of trimmed.split(/[\s,，、/|]+/)) {
    if (part.length >= 2) {
      terms.add(part.toLowerCase());
    }
  }
  for (const part of trimmed.split(/[^a-zA-Z0-9._-]+/)) {
    if (part.length >= 2) {
      terms.add(part.toLowerCase());
    }
  }
  return [...terms];
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(n)));
}
