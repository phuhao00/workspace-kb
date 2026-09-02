import fs from "node:fs";
import path from "node:path";
import { loadRuntimeConfig, toPosix } from "./config.js";

export function collectSourceFiles() {
  const cfg = loadRuntimeConfig();
  const files = [];
  const root = cfg.workspaceRoot;

  for (const pattern of cfg.paths) {
    addPathPattern(root, pattern, files, cfg);
  }

  for (const repo of cfg.childRepos) {
    const repoDir = path.join(root, repo);
    if (!fs.existsSync(repoDir)) {
      continue;
    }
    for (const glob of cfg.childGlobs) {
      addChildGlob(repoDir, repo, glob, files, cfg);
    }
  }

  return files.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

export function classify(relPath) {
  const cfg = loadRuntimeConfig();
  const posix = toPosix(relPath);
  const repo = inferRepo(posix, cfg.childRepos);
  let kind = "docs";

  if (posix.startsWith(".agents/skills/")) {
    kind = "skill";
  } else if (posix.startsWith(".agents/")) {
    kind = "agents";
  } else if (posix.startsWith("openwiki/") || posix.includes("/wiki/")) {
    kind = "wiki";
  } else if (posix.startsWith("docs/") || posix.includes("/docs/")) {
    kind = "docs";
  } else if (/^[^/]+\.md$/i.test(posix)) {
    kind = /architecture|design|guide|impl|架构|链路|技术方案|需求落地/i.test(posix)
      ? "architecture"
      : "root";
  } else if (/readme/i.test(path.basename(posix))) {
    kind = "readme";
  }
  return { repo, kind };
}

function inferRepo(posix, childRepos) {
  const first = posix.split("/")[0];
  if (childRepos.includes(first)) {
    return first;
  }
  return "workspace";
}

function addPathPattern(root, pattern, files, cfg) {
  const normalized = pattern.replace(/\\/g, "/");
  if (normalized === "*.md") {
    addRootMarkdown(root, files, cfg);
    return;
  }
  if (normalized.endsWith("/**/*.md")) {
    const base = normalized.slice(0, -"/**/*.md".length);
    walkMarkdown(path.join(root, base), files, cfg);
    return;
  }
  if (normalized.endsWith("/*.md")) {
    const base = normalized.slice(0, -"/*.md".length);
    addMarkdownInDir(path.join(root, base), files, cfg, false);
    return;
  }
  // directory or single file
  const abs = path.join(root, normalized);
  if (!fs.existsSync(abs)) {
    return;
  }
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    walkMarkdown(abs, files, cfg);
  } else if (stat.isFile() && abs.toLowerCase().endsWith(".md")) {
    pushFile(abs, files, cfg);
  }
}

function addChildGlob(repoDir, repoName, glob, files, cfg) {
  const g = glob.replace(/\\/g, "/");
  if (/^readme\*\.md$/i.test(g) || /^readme\.md$/i.test(g)) {
    addRepoReadmes(repoDir, files, cfg);
    return;
  }
  if (g === "docs/**/*.md" || g === "docs") {
    walkMarkdown(path.join(repoDir, "docs"), files, cfg);
    return;
  }
  if (g.endsWith("/**/*.md")) {
    const base = g.slice(0, -"/**/*.md".length);
    walkMarkdown(path.join(repoDir, base), files, cfg);
    return;
  }
  const abs = path.join(repoDir, g);
  if (fs.existsSync(abs) && abs.toLowerCase().endsWith(".md")) {
    pushFile(abs, files, cfg);
  }
}

function addRootMarkdown(root, files, cfg) {
  if (!fs.existsSync(root)) {
    return;
  }
  for (const name of fs.readdirSync(root)) {
    if (!name.toLowerCase().endsWith(".md")) {
      continue;
    }
    pushFile(path.join(root, name), files, cfg);
  }
}

function addRepoReadmes(repoDir, files, cfg) {
  for (const name of fs.readdirSync(repoDir)) {
    if (/^readme.*\.md$/i.test(name)) {
      pushFile(path.join(repoDir, name), files, cfg);
    }
  }
}

function addMarkdownInDir(dir, files, cfg, recursive) {
  if (!fs.existsSync(dir)) {
    return;
  }
  if (recursive) {
    walkMarkdown(dir, files, cfg);
    return;
  }
  for (const name of fs.readdirSync(dir)) {
    if (name.toLowerCase().endsWith(".md")) {
      pushFile(path.join(dir, name), files, cfg);
    }
  }
}

function walkMarkdown(dir, files, cfg) {
  if (!fs.existsSync(dir)) {
    return;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (cfg.skipDirs.has(entry.name)) {
        continue;
      }
      walkMarkdown(path.join(dir, entry.name), files, cfg);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      pushFile(path.join(dir, entry.name), files, cfg);
    }
  }
}

function pushFile(absPath, files, cfg) {
  try {
    const stat = fs.statSync(absPath);
    if (stat.size === 0 || stat.size > cfg.maxFileBytes) {
      return;
    }
  } catch {
    return;
  }
  const relPath = toPosix(path.relative(cfg.workspaceRoot, absPath));
  if (!relPath || relPath.startsWith("..")) {
    return;
  }
  if (files.some((f) => f.relPath === relPath)) {
    return;
  }
  files.push({ absPath, relPath });
}
