import fs from "node:fs";
import * as lancedb from "@lancedb/lancedb";
import { ensureDir, loadRuntimeConfig } from "./config.js";

export async function connectDb() {
  const cfg = loadRuntimeConfig();
  ensureDir(cfg.dbDir);
  return lancedb.connect(cfg.dbDir);
}

export async function replaceTable(rows) {
  const cfg = loadRuntimeConfig();
  const db = await connectDb();
  const names = await db.tableNames();
  if (names.includes(cfg.tableName)) {
    await db.dropTable(cfg.tableName);
  }
  return db.createTable(cfg.tableName, rows);
}

export async function openTable() {
  const cfg = loadRuntimeConfig();
  const db = await connectDb();
  const names = await db.tableNames();
  if (!names.includes(cfg.tableName)) {
    throw new Error(
      "Knowledge base is empty. Run: npx workspace-kb ingest  (or npm run ingest)",
    );
  }
  return db.openTable(cfg.tableName);
}

export function writeMeta(meta) {
  const cfg = loadRuntimeConfig();
  ensureDir(pathDir(cfg.metaPath));
  fs.writeFileSync(cfg.metaPath, JSON.stringify(meta, null, 2), "utf8");
}

export function readMeta() {
  const cfg = loadRuntimeConfig();
  if (!fs.existsSync(cfg.metaPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(cfg.metaPath, "utf8"));
}

function pathDir(filePath) {
  return filePath.replace(/[\\/][^\\/]+$/, "");
}
