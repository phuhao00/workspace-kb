import fs from "node:fs";
import path from "node:path";
import { chunkMarkdown } from "./chunk.js";
import { loadRuntimeConfig } from "./config.js";
import { openTable, readMeta, replaceTable, writeMeta } from "./db.js";
import { embedTexts, probeEmbedding } from "./embed.js";
import {
  fileFingerprint,
  loadFingerprints,
  loadVectorCache,
  saveFingerprints,
  saveVectorCache,
} from "./fingerprint.js";
import { classify, collectSourceFiles } from "./sources.js";

/** Shared lock so dashboard button + auto-watch never overlap. */
export const ingestLock = { running: false };

/**
 * @param {{ full?: boolean }} [options]
 */
export async function ingest(options = {}) {
  if (ingestLock.running) {
    const err = new Error("ingest already running");
    /** @type {any} */
    (err).code = "INGEST_BUSY";
    throw err;
  }
  ingestLock.running = true;
  try {
    return await ingestUnsafe(options);
  } finally {
    ingestLock.running = false;
  }
}

/**
 * @param {{ full?: boolean }} [options]
 */
async function ingestUnsafe(options = {}) {
  const cfg = loadRuntimeConfig();
  const full = options.full === true || cfg.incremental === false;
  const files = collectSourceFiles();
  process.stderr.write(`Scanning ${files.length} markdown files...\n`);

  const prevFp = full ? {} : loadFingerprints();
  const nextFp = {};
  const changed = [];
  const unchanged = [];

  for (const file of files) {
    const fp = fileFingerprint(file.absPath);
    nextFp[file.relPath] = fp;
    const prev = prevFp[file.relPath];
    if (!full && prev && prev.hash === fp.hash) {
      unchanged.push(file);
    } else {
      changed.push(file);
    }
  }

  const deletedPaths = Object.keys(prevFp).filter((p) => !nextFp[p]);
  const incremental =
    !full &&
    Object.keys(prevFp).length > 0 &&
    changed.length + deletedPaths.length > 0 &&
    unchanged.length > 0;

  if (
    !full &&
    Object.keys(prevFp).length > 0 &&
    changed.length === 0 &&
    deletedPaths.length === 0
  ) {
    const meta = {
      ingestedAt: new Date().toISOString(),
      modelId: cfg.modelId,
      embedDim: cfg.embedDim,
      fileCount: files.length,
      chunkCount: (await safeChunkCount()) || 0,
      skipped: true,
      incremental: { changed: 0, unchanged: unchanged.length, deleted: 0 },
      workspaceRoot: cfg.workspaceRoot,
      configPath: cfg.configPath,
    };
    process.stderr.write("No file changes — skip embed\n");
    const existing = readMeta() || {};
    writeMeta({ ...existing, ...meta });
    await maybeSetup();
    return meta;
  }

  const filesToChunk = incremental ? changed : files;
  process.stderr.write(
    incremental
      ? `Incremental: ${changed.length} changed, ${unchanged.length} cached, ${deletedPaths.length} deleted\n`
      : `Full ingest: ${filesToChunk.length} files\n`,
  );

  const chunks = [];
  for (const file of filesToChunk) {
    const content = fs.readFileSync(file.absPath, "utf8");
    const fallback = path.basename(file.relPath, ".md");
    const { repo, kind } = classify(file.relPath);
    for (const part of chunkMarkdown(content, fallback)) {
      chunks.push({
        id: `${file.relPath}#${part.startLine}`,
        path: file.relPath,
        repo,
        kind,
        heading: part.heading,
        start_line: part.startLine,
        text: part.text,
        contentHash: nextFp[file.relPath]?.hash,
      });
    }
  }

  const vectorCache = loadVectorCache();
  const needEmbed = [];
  const needEmbedIdx = [];
  const vectorsForNew = new Array(chunks.length);

  for (let i = 0; i < chunks.length; i++) {
    const key = `${chunks[i].id}@${chunks[i].contentHash}`;
    const cached = vectorCache[key];
    if (Array.isArray(cached) && cached.length) {
      vectorsForNew[i] = cached;
    } else {
      needEmbed.push(`${chunks[i].heading}\n${chunks[i].text}`);
      needEmbedIdx.push(i);
    }
  }

  const probe = await probeEmbedding();
  const dim = probe.dim || cfg.embedDim;
  process.stderr.write(
    `Embedding ${needEmbed.length} new chunks (${chunks.length - needEmbed.length} cache hits) via ${probe.provider || "ollama"} ${probe.modelId} (${dim}d)...\n`,
  );

  if (needEmbed.length) {
    const fresh = await embedTexts(needEmbed);
    for (let j = 0; j < needEmbedIdx.length; j++) {
      const i = needEmbedIdx[j];
      vectorsForNew[i] = fresh[j];
      const key = `${chunks[i].id}@${chunks[i].contentHash}`;
      vectorCache[key] = fresh[j];
    }
  }

  let rows = chunks.map((chunk, i) => {
    const vector = vectorsForNew[i];
    if (!vector || vector.length !== dim) {
      throw new Error(`Unexpected embedding size for ${chunk.id}: ${vector?.length}`);
    }
    const { contentHash: _h, ...rest } = chunk;
    return { ...rest, vector };
  });

  if (incremental) {
    const kept = await loadRowsExcept(new Set([...changed.map((f) => f.relPath), ...deletedPaths]));
    // reuse vectors already in table for unchanged
    rows = [...kept, ...rows];
    process.stderr.write(`Merged table rows: ${rows.length}\n`);
  }

  if (rows.length === 0) {
    throw new Error("No markdown chunks found to ingest");
  }

  await replaceTable(rows);
  saveFingerprints(nextFp);
  saveVectorCache(vectorCache);

  const byKind = {};
  const byRepo = {};
  for (const row of rows) {
    byKind[row.kind] = (byKind[row.kind] || 0) + 1;
    byRepo[row.repo] = (byRepo[row.repo] || 0) + 1;
  }

  const meta = {
    ingestedAt: new Date().toISOString(),
    modelId: probe.modelId,
    embedDim: dim,
    embedProvider: probe.provider || cfg.embedProvider,
    fileCount: files.length,
    chunkCount: rows.length,
    byKind,
    byRepo,
    incremental: {
      mode: incremental ? "incremental" : "full",
      changed: changed.length,
      unchanged: unchanged.length,
      deleted: deletedPaths.length,
      embedded: needEmbed.length,
      cacheHits: chunks.length - needEmbed.length,
    },
    workspaceRoot: cfg.workspaceRoot,
    configPath: cfg.configPath,
  };
  writeMeta(meta);
  await maybeSetup();
  return meta;
}

async function loadRowsExcept(dropPaths) {
  try {
    const table = await openTable();
    const all = await table.query().toArray();
    return all
      .filter((r) => !dropPaths.has(r.path))
      .map((r) => ({
        id: r.id,
        path: r.path,
        repo: r.repo,
        kind: r.kind,
        heading: r.heading,
        start_line: r.start_line,
        text: r.text,
        vector: Array.from(r.vector || []),
      }))
      .filter((r) => Array.isArray(r.vector) && r.vector.length > 0);
  } catch {
    return [];
  }
}

async function safeChunkCount() {
  try {
    const table = await openTable();
    return table.countRows();
  } catch {
    return 0;
  }
}

async function maybeSetup() {
  try {
    const { runSetup } = await import("./setup.js");
    const setup = runSetup({ quiet: true });
    if (setup.ok) {
      process.stderr.write(
        `workspace-kb: auto-configured MCP "${setup.serverId}"\n`,
      );
    }
  } catch {
    // ignore
  }
}
