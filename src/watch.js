import fs from "node:fs";
import path from "node:path";
import { loadRuntimeConfig } from "./config.js";
import { ingest, ingestLock } from "./ingest.js";

/**
 * @typedef {{
 *   enabled: boolean,
 *   roots: string[],
 *   debounceMs: number,
 *   lastEventAt?: string,
 *   lastIngestAt?: string,
 *   lastMeta?: unknown,
 *   lastError?: string,
 *   running: boolean,
 *   pending: boolean,
 * }} AutoIngestState
 */

/** @type {AutoIngestState} */
export const autoIngestState = {
  enabled: false,
  roots: [],
  debounceMs: 2000,
  running: false,
  pending: false,
};

/**
 * Watch configured markdown roots and run incremental ingest on change.
 * Uses Node fs.watch (no extra deps). Debounced; skips concurrent runs.
 *
 * @param {{
 *   enabled?: boolean,
 *   debounceMs?: number,
 *   quiet?: boolean,
 * }} [options]
 */
export function startAutoIngest(options = {}) {
  stopAutoIngest();

  const cfg = loadRuntimeConfig();
  const envOff =
    process.env.WORKSPACE_KB_AUTO_INGEST === "0" ||
    process.env.WORKSPACE_KB_AUTO_INGEST === "false";
  const cfgOff = cfg.autoIngest === false;
  const enabled =
    options.enabled === true
      ? true
      : options.enabled === false
        ? false
        : !envOff && !cfgOff;

  if (!enabled) {
    autoIngestState.enabled = false;
    autoIngestState.roots = [];
    return { ok: true, enabled: false, reason: "autoIngest disabled" };
  }

  const debounceMs = Math.max(
    500,
    Number(options.debounceMs || cfg.watchDebounceMs || 2000),
  );
  const roots = collectWatchRoots(cfg);
  /** @type {fs.FSWatcher[]} */
  const watchers = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  const schedule = (reason) => {
    autoIngestState.lastEventAt = new Date().toISOString();
    if (!options.quiet) {
      process.stderr.write(`[auto-ingest] change detected (${reason})\n`);
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void runIngest();
    }, debounceMs);
  };

  const runIngest = async () => {
    if (autoIngestState.running || ingestLock.running) {
      autoIngestState.pending = true;
      return;
    }
    autoIngestState.running = true;
    autoIngestState.pending = false;
    autoIngestState.lastError = undefined;
    try {
      const meta = await ingest({ full: false });
      autoIngestState.lastMeta = meta;
      autoIngestState.lastIngestAt = new Date().toISOString();
      if (!options.quiet) {
        const inc = /** @type {any} */ (meta).incremental || {};
        process.stderr.write(
          meta.skipped
            ? `[auto-ingest] no content change\n`
            : `[auto-ingest] done · changed ${inc.changed ?? "?"} · chunks ${meta.chunkCount ?? "?"}\n`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/** @type {any} */ (err).code === "INGEST_BUSY") {
        autoIngestState.pending = true;
      } else {
        autoIngestState.lastError = msg;
        process.stderr.write(`[auto-ingest] error: ${msg}\n`);
      }
    } finally {
      autoIngestState.running = false;
      if (autoIngestState.pending) {
        autoIngestState.pending = false;
        schedule("pending");
      }
    }
  };

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (!isInterestingChange(filename, cfg)) return;
        schedule(filename || root);
      });
      watcher.on("error", (err) => {
        process.stderr.write(
          `[auto-ingest] watch error ${root}: ${err instanceof Error ? err.message : err}\n`,
        );
      });
      watchers.push(watcher);
    } catch (err) {
      process.stderr.write(
        `[auto-ingest] cannot watch ${root}: ${err instanceof Error ? err.message : err}\n`,
      );
    }
  }

  autoIngestState.enabled = true;
  autoIngestState.roots = roots;
  autoIngestState.debounceMs = debounceMs;
  /** @type {any} */
  globalThis.__workspaceKbWatchers = watchers;

  if (!options.quiet) {
    process.stderr.write(
      `[auto-ingest] watching ${roots.length} root(s), debounce ${debounceMs}ms\n`,
    );
  }

  return {
    ok: true,
    enabled: true,
    roots,
    debounceMs,
    stop: () => stopAutoIngest(),
  };
}

export function stopAutoIngest() {
  /** @type {fs.FSWatcher[] | undefined} */
  const watchers = globalThis.__workspaceKbWatchers;
  if (Array.isArray(watchers)) {
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
  }
  globalThis.__workspaceKbWatchers = [];
  autoIngestState.enabled = false;
  autoIngestState.roots = [];
}

export function getAutoIngestStatus() {
  return { ...autoIngestState, lock: ingestLock.running };
}

/**
 * @param {ReturnType<typeof loadRuntimeConfig>} cfg
 */
function collectWatchRoots(cfg) {
  const roots = new Set();
  roots.add(cfg.workspaceRoot);

  for (const pattern of cfg.paths || []) {
    const normalized = String(pattern).replace(/\\/g, "/");
    if (normalized === "*.md") continue;
    const base = normalized
      .replace(/\/\*\*\/\*\.md$/i, "")
      .replace(/\/\*\.md$/i, "")
      .replace(/\/\*\*$/i, "");
    if (!base || base.includes("*")) continue;
    const abs = path.join(cfg.workspaceRoot, base);
    if (fs.existsSync(abs)) roots.add(abs);
  }

  for (const repo of cfg.childRepos || []) {
    const abs = path.join(cfg.workspaceRoot, repo);
    if (fs.existsSync(abs)) roots.add(abs);
  }

  return [...roots];
}

/**
 * @param {string | Buffer | null | undefined} filename
 * @param {ReturnType<typeof loadRuntimeConfig>} cfg
 */
function isInterestingChange(filename, cfg) {
  if (!filename) return true;
  const name = String(filename).replace(/\\/g, "/");
  const parts = name.split("/");
  for (const part of parts) {
    if (cfg.skipDirs.has(part)) return false;
  }
  if (name.includes(".workspace-kb/")) return false;
  // Only markdown (and bare dir notifications that often precede new .md files)
  if (/\.(md|mdx|markdown)$/i.test(name)) return true;
  if (!name.includes(".") && /(^|\/)(docs|openwiki|\.agents)(\/|$)/i.test(name)) {
    return true;
  }
  return false;
}
