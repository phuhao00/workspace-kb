#!/usr/bin/env node
/**
 * Lightweight smoke: Codex TOML upsert + setup idempotency (no Ollama/LanceDB).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CLIENTS,
  formatClientsSummary,
  resolveClients,
  upsertCodexMcpSection,
  writeFileIfChanged,
} from "../src/clients.js";
import { initWorkspace } from "../src/init.js";
import { runSetup } from "../src/setup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function section(title) {
  process.stdout.write(`\n— ${title}\n`);
}

section("resolveClients defaults");
assert(
  JSON.stringify(resolveClients(undefined)) === JSON.stringify(DEFAULT_CLIENTS),
  "undefined → DEFAULT_CLIENTS",
);
assert(resolveClients("cursor,workbuddy").join(",") === "cursor,workbuddy", "csv parse");
assert(resolveClients(false).length === 0, "false → []");

section("upsertCodexMcpSection");
{
  let text = upsertCodexMcpSection("", "demo-kb", "http://127.0.0.1:8700/mcp");
  assert(text.includes('[mcp_servers.demo-kb]'), "insert header");
  assert(text.includes('url = "http://127.0.0.1:8700/mcp"'), "insert url");
  assert(text.includes("enabled = true"), "insert enabled");

  const once = upsertCodexMcpSection(text, "demo-kb", "http://127.0.0.1:8700/mcp");
  assert(once === text || once.trim() === text.trim(), "idempotent same url");

  const updated = upsertCodexMcpSection(text, "demo-kb", "http://127.0.0.1:9999/mcp");
  assert(updated.includes('url = "http://127.0.0.1:9999/mcp"'), "port update");
  assert(!updated.includes('url = "http://127.0.0.1:8700/mcp"'), "old url gone");
  assert((updated.match(/\[mcp_servers\.demo-kb\]/g) || []).length === 1, "single section");

  const withOther = upsertCodexMcpSection(
    `[mcp_servers.other]\nurl = "http://127.0.0.1:1/mcp"\n\n${text}`,
    "demo-kb",
    "http://127.0.0.1:8888/mcp",
  );
  assert(withOther.includes("[mcp_servers.other]"), "preserve neighbor");
  assert(withOther.includes('url = "http://127.0.0.1:8888/mcp"'), "update target");
}

section("writeFileIfChanged");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wkb-smoke-write-"));
  const file = path.join(dir, "a.txt");
  assert(writeFileIfChanged(file, "hello\n") === "written", "first write");
  assert(writeFileIfChanged(file, "hello\n") === "unchanged", "second write unchanged");
  assert(writeFileIfChanged(file, "hello2\n") === "written", "content change");
  fs.rmSync(dir, { recursive: true, force: true });
}

section("init + setup idempotency");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wkb-smoke-init-"));
  const init = initWorkspace({ cwd: root, name: "smoke-demo", port: 18787 });
  assert(init.ok === true, "init ok");
  assert(init.setup?.ok !== false, "init setup ok");

  const cfgPath = path.join(root, "workspace-kb.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  assert(Array.isArray(cfg.setup?.clients) && cfg.setup.clients.length >= 3, "setup.clients present");
  assert(cfg.setup.clients.includes("cursor"), "clients includes cursor");
  assert(cfg.setup.clients.includes("codex"), "clients includes codex");
  assert(cfg.setup.clients.includes("workbuddy"), "clients includes workbuddy");

  const first = runSetup({ startDir: root, quiet: true, port: 18787 });
  assert(first.ok === true, "setup #1 ok");
  assert(first.mcpUrl === "http://127.0.0.1:18787/mcp", "mcp url");

  const cursorMcp = path.join(root, ".cursor", "mcp.json");
  const codexToml = path.join(root, ".codex", "config.toml");
  const wbMcp = path.join(root, ".mcp.json");
  assert(fs.existsSync(cursorMcp), "cursor mcp");
  assert(fs.existsSync(codexToml), "codex toml");
  assert(fs.existsSync(wbMcp), "workbuddy mcp");
  assert(fs.existsSync(path.join(root, ".agents", "skills", "query-workspace-kb", "SKILL.md")), "agents skill");
  assert(fs.existsSync(path.join(root, ".cursor", "skills", "query-workspace-kb", "SKILL.md")), "cursor skill");

  const mtime1 = fs.statSync(cursorMcp).mtimeMs;
  const second = runSetup({ startDir: root, quiet: true, port: 18787 });
  assert(second.ok === true, "setup #2 ok");
  assert(second.cursorSkill === "unchanged" || second.cursorSkill === "written", "cursor skill status");
  const mtime2 = fs.statSync(cursorMcp).mtimeMs;
  assert(mtime2 === mtime1, "idempotent: cursor mcp mtime unchanged");

  const portShift = runSetup({ startDir: root, quiet: true, port: 18788 });
  assert(portShift.ok === true, "port shift ok");
  assert(portShift.mcpUrl === "http://127.0.0.1:18788/mcp", "port sync url");
  const cursorDoc = JSON.parse(fs.readFileSync(cursorMcp, "utf8"));
  const serverId = portShift.serverId;
  assert(cursorDoc.mcpServers?.[serverId]?.url === "http://127.0.0.1:18788/mcp", "cursor url synced");
  const toml = fs.readFileSync(codexToml, "utf8");
  assert(toml.includes('url = "http://127.0.0.1:18788/mcp"'), "codex url synced");

  const summary = formatClientsSummary(portShift);
  assert(summary.includes("workspace-kb clients"), "summary header");
  assert(summary.includes("18788"), "summary port");
  assert(!summary.includes("FAILED"), "summary not failed");

  fs.rmSync(root, { recursive: true, force: true });
}

section("done");
if (failures.length) {
  process.stderr.write(`FAIL ${failures.length}\n${failures.map((f) => ` - ${f}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`OK smoke-clients (${path.relative(process.cwd(), __dirname)})\n`);
