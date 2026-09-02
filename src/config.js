import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_SKIP = [
  "node_modules",
  "vendor",
  ".git",
  ".next",
  "Library",
  "logs",
  ".gocache",
  "feishu-project",
  ".workspace-kb",
];

let _resolved = null;

export function getPackageRoot() {
  return PKG_ROOT;
}

export function resetRuntimeConfig() {
  _resolved = null;
}

/**
 * Resolve workspace root + user config.
 * Looks for WORKSPACE_KB_CONFIG or workspace-kb.config.json walking up from cwd.
 */
export function loadRuntimeConfig() {
  if (_resolved) {
    return _resolved;
  }

  const cwd = process.cwd();
  const configPath = resolveConfigPath(cwd);
  const fileCfg = configPath ? readJson(configPath) : {};
  const configDir = configPath ? path.dirname(configPath) : cwd;

  const workspaceRoot = path.resolve(
    configDir,
    process.env.WORKSPACE_ROOT || fileCfg.workspaceRoot || ".",
  );

  const dataDirName = fileCfg.dataDir || ".workspace-kb";
  const dataDir = path.isAbsolute(dataDirName)
    ? dataDirName
    : path.join(workspaceRoot, dataDirName);

  const modelId =
    process.env.WORKSPACE_KB_MODEL ||
    process.env.BUYU_KB_MODEL ||
    fileCfg.model ||
    "bge-m3";

  const setup =
    fileCfg.setup && typeof fileCfg.setup === "object" ? fileCfg.setup : {};

  _resolved = {
    configPath: configPath || null,
    workspaceRoot,
    dataDir,
    dbDir: path.join(dataDir, "lancedb"),
    metaPath: path.join(dataDir, "meta.json"),
    usagePath: path.join(dataDir, "usage.jsonl"),
    feedbackPath: path.join(dataDir, "feedback.jsonl"),
    cacheDir: path.join(dataDir, "cache"),
    tableName: "chunks",
    setup,
    ollamaHost:
      process.env.OLLAMA_HOST || fileCfg.ollamaHost || "http://127.0.0.1:11434",
    embedProvider:
      process.env.WORKSPACE_KB_EMBED_PROVIDER ||
      fileCfg.embedProvider ||
      "ollama",
    openaiApiKey:
      process.env.OPENAI_API_KEY || fileCfg.openaiApiKey || "",
    openaiBaseUrl:
      process.env.OPENAI_BASE_URL ||
      fileCfg.openaiBaseUrl ||
      "https://api.openai.com/v1",
    modelId,
    embedDim: Number(
      process.env.WORKSPACE_KB_DIM ||
        process.env.BUYU_KB_DIM ||
        fileCfg.embedDim ||
        1024,
    ),
    embedBatch: Number(fileCfg.embedBatch || 8),
    maxChunkChars: Number(fileCfg.maxChunkChars || 2000),
    minChunkChars: Number(fileCfg.minChunkChars || 40),
    maxFileBytes: Number(fileCfg.maxFileBytes || 500 * 1024),
    snippetChars: Number(fileCfg.snippetChars || 400),
    readMaxChars: Number(fileCfg.readMaxChars || 4000),
    defaultSearchLimit: Number(fileCfg.defaultSearchLimit || 6),
    vectorCandidates: Number(fileCfg.vectorCandidates || 24),
    hybridVectorWeight: Number(fileCfg.hybridVectorWeight ?? 0.65),
    hybridLexicalWeight: Number(fileCfg.hybridLexicalWeight ?? 0.35),
    kindBoost: fileCfg.kindBoost || {
      skill: 0.08,
      agents: 0.06,
      architecture: 0.05,
      wiki: 0.03,
    },
    synonyms:
      fileCfg.synonyms && typeof fileCfg.synonyms === "object"
        ? fileCfg.synonyms
        : {},
    rewriteQuery: fileCfg.rewriteQuery !== false,
    incremental: fileCfg.incremental !== false,
    paths: Array.isArray(fileCfg.paths)
      ? fileCfg.paths
      : [".agents", "docs", "openwiki", "*.md"],
    childRepos: Array.isArray(fileCfg.childRepos) ? fileCfg.childRepos : [],
    childGlobs: Array.isArray(fileCfg.childGlobs)
      ? fileCfg.childGlobs
      : ["README*.md", "docs/**/*.md"],
    skipDirs: new Set(
      Array.isArray(fileCfg.skipDirs) ? fileCfg.skipDirs : DEFAULT_SKIP,
    ),
  };
  return _resolved;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

function resolveConfigPath(startDir) {
  const fromEnv = (process.env.WORKSPACE_KB_CONFIG || "").trim();
  if (fromEnv) {
    const abs = path.resolve(fromEnv);
    if (fs.existsSync(abs)) {
      return abs;
    }
    throw new Error(`WORKSPACE_KB_CONFIG not found: ${abs}`);
  }

  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, "workspace-kb.config.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`Invalid config JSON ${filePath}: ${err.message}`);
  }
}
