import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, loadRuntimeConfig } from "./config.js";

export function fingerprintPath() {
  const cfg = loadRuntimeConfig();
  return path.join(cfg.dataDir, "fingerprints.json");
}

export function vectorCachePath() {
  const cfg = loadRuntimeConfig();
  return path.join(cfg.cacheDir, "vectors.json");
}

export function fileFingerprint(absPath) {
  const buf = fs.readFileSync(absPath);
  const hash = crypto.createHash("sha1").update(buf).digest("hex");
  const st = fs.statSync(absPath);
  return { hash, size: st.size, mtimeMs: st.mtimeMs };
}

export function loadFingerprints() {
  const fp = fingerprintPath();
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return {};
  }
}

export function saveFingerprints(map) {
  const cfg = loadRuntimeConfig();
  ensureDir(cfg.dataDir);
  fs.writeFileSync(fingerprintPath(), JSON.stringify(map, null, 2), "utf8");
}

export function loadVectorCache() {
  const p = vectorCachePath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

export function saveVectorCache(map) {
  const cfg = loadRuntimeConfig();
  ensureDir(cfg.cacheDir);
  // keep cache bounded
  const entries = Object.entries(map);
  const trimmed =
    entries.length > 20000 ? Object.fromEntries(entries.slice(-15000)) : map;
  fs.writeFileSync(vectorCachePath(), JSON.stringify(trimmed), "utf8");
}
