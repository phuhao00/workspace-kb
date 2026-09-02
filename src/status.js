import { loadRuntimeConfig } from "./config.js";
import { openTable, readMeta } from "./db.js";
import { summarizeUsage } from "./usage.js";

export async function knowledgeStatus(options = {}) {
  const cfg = loadRuntimeConfig();
  const usageDays = options.usageDays ?? 7;
  const usage = summarizeUsage({ days: usageDays });
  const meta = readMeta();
  let chunkCount = meta?.chunkCount ?? 0;
  try {
    const table = await openTable();
    chunkCount = await table.countRows();
  } catch (err) {
    return {
      ready: false,
      table: cfg.tableName,
      modelId: cfg.modelId,
      error: err instanceof Error ? err.message : String(err),
      workspaceRoot: cfg.workspaceRoot,
      dataDir: cfg.dataDir,
      configPath: cfg.configPath,
      meta,
      usage,
    };
  }
  return {
    ready: true,
    table: cfg.tableName,
    modelId: meta?.modelId ?? cfg.modelId,
    embedDim: meta?.embedDim ?? cfg.embedDim,
    ingestedAt: meta?.ingestedAt ?? null,
    chunkCount,
    fileCount: meta?.fileCount ?? null,
    byKind: meta?.byKind ?? {},
    byRepo: meta?.byRepo ?? {},
    workspaceRoot: cfg.workspaceRoot,
    dataDir: cfg.dataDir,
    configPath: cfg.configPath,
    usage,
  };
}
