import fs from "node:fs";
import path from "node:path";
import { extractSection, listHeadings } from "./chunk.js";
import { loadRuntimeConfig } from "./config.js";
import { appendUsage } from "./usage.js";

export function readKnowledge(relPath, heading) {
  const started = Date.now();
  const cfg = loadRuntimeConfig();
  try {
    if (!relPath) {
      throw new Error("path is required");
    }
    const normalized = relPath.replace(/\\/g, "/");
    if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
      throw new Error("path must be a workspace-relative markdown file");
    }

    const root = path.resolve(cfg.workspaceRoot);
    const absPath = path.resolve(root, normalized);
    const rootPrefix = root.toLowerCase() + path.sep;
    if (
      !absPath.toLowerCase().startsWith(rootPrefix) &&
      absPath.toLowerCase() !== root.toLowerCase()
    ) {
      throw new Error("path must stay inside the workspace");
    }
    if (!fs.existsSync(absPath)) {
      throw new Error(`file not found: ${normalized}`);
    }

    const content = fs.readFileSync(absPath, "utf8");
    const fullFileChars = content.length;
    const fallback = path.basename(normalized, ".md");
    const section = extractSection(content, heading, fallback);
    if (!section) {
      const result = {
        path: normalized,
        error: heading ? `heading not found: ${heading}` : "empty file",
        headings: listHeadings(content, fallback),
      };
      appendUsage({
        op: "read",
        ok: false,
        path: normalized,
        heading: heading || null,
        hit_count: 0,
        returned_chars: JSON.stringify(result.headings || []).length,
        full_file_chars: fullFileChars,
        latency_ms: Date.now() - started,
        error: result.error,
      });
      return result;
    }

    const text =
      section.text.length > cfg.readMaxChars
        ? `${section.text.slice(0, cfg.readMaxChars - 1)}…`
        : section.text;

    appendUsage({
      op: "read",
      ok: true,
      path: normalized,
      heading: section.heading,
      hit_count: 1,
      returned_chars: text.length,
      full_file_chars: fullFileChars,
      latency_ms: Date.now() - started,
      truncated: section.text.length > cfg.readMaxChars,
    });

    return {
      path: normalized,
      heading: section.heading,
      start_line: section.startLine,
      truncated: section.text.length > cfg.readMaxChars,
      text,
    };
  } catch (err) {
    appendUsage({
      op: "read",
      ok: false,
      path: relPath || null,
      heading: heading || null,
      hit_count: 0,
      returned_chars: 0,
      full_file_chars: 0,
      latency_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
