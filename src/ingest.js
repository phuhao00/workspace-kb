import fs from "node:fs";
import path from "node:path";
import { chunkMarkdown } from "./chunk.js";
import { loadRuntimeConfig } from "./config.js";
import { replaceTable, writeMeta } from "./db.js";
import { embedTexts, probeEmbedding } from "./embed.js";
import { classify, collectSourceFiles } from "./sources.js";

export async function ingest() {
  const cfg = loadRuntimeConfig();
  const files = collectSourceFiles();
  process.stderr.write(`Scanning ${files.length} markdown files...\n`);

  const chunks = [];
  for (const file of files) {
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
      });
    }
  }

  if (chunks.length === 0) {
    throw new Error("No markdown chunks found to ingest");
  }

  const probe = await probeEmbedding();
  const dim = probe.dim || cfg.embedDim;
  process.stderr.write(
    `Embedding ${chunks.length} chunks with Ollama ${probe.modelId} (${dim}d @ ${probe.host})...\n`,
  );
  const vectors = await embedTexts(chunks.map((c) => `${c.heading}\n${c.text}`));

  const rows = chunks.map((chunk, i) => {
    const vector = vectors[i];
    if (!vector || vector.length !== dim) {
      throw new Error(`Unexpected embedding size for ${chunk.id}: ${vector?.length}`);
    }
    return { ...chunk, vector };
  });

  await replaceTable(rows);

  const byKind = {};
  const byRepo = {};
  for (const chunk of chunks) {
    byKind[chunk.kind] = (byKind[chunk.kind] || 0) + 1;
    byRepo[chunk.repo] = (byRepo[chunk.repo] || 0) + 1;
  }

  const meta = {
    ingestedAt: new Date().toISOString(),
    modelId: probe.modelId,
    embedDim: dim,
    fileCount: files.length,
    chunkCount: chunks.length,
    byKind,
    byRepo,
    workspaceRoot: cfg.workspaceRoot,
    configPath: cfg.configPath,
  };
  writeMeta(meta);

  try {
    const { runSetup } = await import("./setup.js");
    const setup = runSetup({ quiet: true });
    if (setup.ok) {
      process.stderr.write(
        `workspace-kb: auto-configured MCP "${setup.serverId}" (restart Cursor MCP to apply)\n`,
      );
    }
  } catch {
    // setup must not fail ingest
  }

  return meta;
}
