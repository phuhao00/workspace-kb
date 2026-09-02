# workspace-kb

> 中文文档 · [English](./README.md)

面向 **Agent 工作流** 的本地 [LanceDB](https://github.com/lancedb/lancedb) 知识库。

只索引精选的文档 / Skill / Wiki，**不是**全仓源码。Agent 通过 **MCP**（`kb_search` → `kb_read`）检索；脚本用 **CLI**。搜索返回短摘要，阅读只打开单个标题节。

| | |
|---|---|
| 版本 | **1.4** |
| 协议 | MIT |
| 仓库 | https://github.com/phuhao00/workspace-kb |

## 解决什么问题

- **省 Token**：Agent 拿到摘要 + 单节内容，而不是整本手册。
- **多仓路由**：先定位到正确的文档/子仓，再在该目录 `rg`。
- **可观测**：看板统计代理节省量（`chars/4`）与 MCP 健康状态——**不是** LLM 账单。

## 环境要求

- Node.js **>= 20**
- 任选一种向量后端：
  - **Ollama**（默认）：`ollama pull bge-m3`
  - **OpenAI / 兼容接口**：`"embedProvider": "openai"` + `OPENAI_API_KEY`

```bash
ollama pull bge-m3
# 显存紧张时：
# WORKSPACE_KB_MODEL=nomic-embed-text   # 同时在配置里改 embedDim
```

> 中文检索建议用 **`bge-m3`**（多语向量）。配置里的 `synonyms`、查询改写、CJK 双字切词会进一步提升中文命中率。

## 快速开始

```bash
npx workspace-kb init
npm install
npx workspace-kb ingest
npx workspace-kb start              # 后台看板 + HTTP MCP
# 打开 http://127.0.0.1:8787/
npx workspace-kb search "充值未到账"
npx workspace-kb health
```

已有项目：

```bash
npm install github:phuhao00/workspace-kb
# 确保仓库根目录有 workspace-kb.config.json
npx workspace-kb setup
npx workspace-kb ingest
npx workspace-kb start --port 8787
```

## 安装 / 升级

```bash
npm install github:phuhao00/workspace-kb#master
```

### 自动配置（install · update · ingest · `setup`）

若找到 `workspace-kb.config.json`（当前目录、父目录，或 postinstall 的 `INIT_CWD`），会自动写入：

| 路径 | 作用 |
|------|------|
| `.cursor/mcp.json` | MCP（默认 **HTTP** → `http://127.0.0.1:<端口>/mcp`） |
| `.cursor/rules/workspace-kb-routing.mdc` | `alwaysApply`，要求先 `kb_search` |
| `.cursor/skills/query-workspace-kb/SKILL.md` | Cursor Skill（架构/运维问题） |
| `.continue/workspace-kb.mcp.json` | Continue.dev 配置片段 |
| `AGENTS.md` 中 `<!-- WORKSPACE-KB:… -->` | Agent 路由说明（`agentsMd: false` 或已有自定义 `kb_search` 文档时跳过） |

关闭自动配置：`WORKSPACE_KB_SKIP_SETUP=1` 或 `"setup": { "enabled": false }`。

升级后：**重启 `start`/`serve`**，再在看板点 **重启 MCP**（或在 Cursor 里重载 MCP）。

## CLI 参考

```text
workspace-kb <命令>

  init [--force] [--name 应用名] [--port 8787]
  setup                         # 写入 MCP / 规则 / Skill / Continue
  ingest [--full]               # 默认增量；--full 全量重建
  search "<查询>" [--limit 6] [--kind skill] [--repo 子仓名]
  read <路径> [标题]
  status | health | stats [--days 7]
  start | stop | serve [--port 8787]
  projects                      # 列出 ~/.workspace-kb/registry.json
  feedback [--bad] <备注>
```

示例：

```bash
npx workspace-kb ingest --full
npx workspace-kb search "充值未到账" --limit 8
npx workspace-kb read docs/pay.md "概述"
npx workspace-kb start --port 8787
npx workspace-kb stop --port 8787
npx workspace-kb projects
```

## 看板（Dashboard）

```bash
npx workspace-kb start    # 后台运行（pid 在 ~/.workspace-kb/）
# 或前台：
npx workspace-kb serve --port 8787
```

打开 **http://127.0.0.1:8787/**

| 面板 | 能力 |
|------|------|
| **控制** | 重启 MCP · 重新配置 · 增量/全量索引 · 重启看板 |
| **健康检查** | config · workspaceRoot · 索引 · 向量服务 · MCP · 命中率 |
| **多项目** | 本机已注册实例与端口 |
| **指标** | 调用次数 · 命中率 · 估算返回/节省 Token |
| **最近事件** | 👍/👎 反馈 → 影响路径加权检索 |

**HTTP MCP：** `http://127.0.0.1:<端口>/mcp` — Cursor / Continue 需要保持 `start`/`serve` 运行。

### 本地 HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 + 命中率摘要 |
| GET | `/api/control` | 状态、项目列表、反馈、ingest 任务 |
| GET | `/api/usage?days=7` | Token 代理指标 |
| GET | `/api/projects` | 多项目注册表 |
| GET | `/api/feedback` | 反馈汇总 |
| POST | `/api/actions/restart-mcp` | 断开 MCP 会话（客户端会重连） |
| POST | `/api/actions/setup` | 重新跑自动配置 |
| POST | `/api/actions/ingest` | Body 可选 `{ "full": true }` |
| POST | `/api/actions/feedback` | `{ useful, query, path, heading }` |
| POST | `/api/actions/restart-server` | 重启看板进程 |
| * | `/mcp` | Streamable HTTP MCP |

## 功能一览（v1.4）

| 能力 | 行为 |
|------|------|
| 混合检索 | 向量 + 词法（含 CJK 双字）+ kind 加权 + 反馈加权 |
| 查询改写 | 内置中英同义词；可用配置 `synonyms` 扩展 |
| 增量 ingest | 文件指纹 + 向量缓存；未变更文件跳过 embed；`--full` 全量 |
| 常驻进程 | `start` / `stop` / `projects`；注册表在 `~/.workspace-kb/registry.json` |
| 云端向量 | `embedProvider: "openai"`（可用 `openaiBaseUrl` 接兼容接口） |
| Continue | 自动片段 + [`examples/continue.mcp.json`](examples/continue.mcp.json) |

## 配置

在**工作区根目录**放 `workspace-kb.config.json`（或设置 `WORKSPACE_KB_CONFIG`）：

```json
{
  "workspaceRoot": ".",
  "dataDir": ".workspace-kb",
  "model": "bge-m3",
  "embedDim": 1024,
  "embedProvider": "ollama",
  "incremental": true,
  "rewriteQuery": true,
  "hybridVectorWeight": 0.65,
  "hybridLexicalWeight": 0.35,
  "synonyms": {
    "登不进": ["登录", "login", "token"],
    "充值未到账": ["支付", "pay", "订单", "callback"]
  },
  "paths": [".agents", "docs", "openwiki", "*.md", ".cursor/skills"],
  "childRepos": ["api", "web"],
  "childGlobs": ["README*.md", "docs/**/*.md"],
  "skipDirs": ["node_modules", "vendor", ".git", ".next", "Library", "logs", ".workspace-kb"],
  "setup": {
    "mcpServerId": "my-project-kb",
    "dashboardPort": 8787,
    "mcpMode": "http",
    "agentsMd": true,
    "cursorSkill": true,
    "continueConfig": true
  }
}
```

### 让中文文档被索引到

- 根目录 `paths` 里保留 `"*.md"`，会收录 `README.md`、`README.zh-CN.md` 等。
- 子仓用 `"README*.md"`、`docs/**/*.md`。
- 业务文档优先写在 `docs/`、`.agents/`、`openwiki/`，用清晰的中文标题（`##`），便于 `kb_read` 按节打开。
- 症状类中文词可加到 `synonyms`，例如「进房失败」「邮件补发」。

### OpenAI / 兼容向量

```json
{
  "embedProvider": "openai",
  "model": "text-embedding-3-small",
  "embedDim": 1536,
  "openaiBaseUrl": "https://api.openai.com/v1"
}
```

```bash
set OPENAI_API_KEY=sk-...
npx workspace-kb ingest --full
```

### 数据目录（请 gitignore `dataDir`）

```text
.workspace-kb/
  lancedb/           # LanceDB 表
  meta.json
  usage.jsonl        # search/read 代理指标
  feedback.jsonl     # 👍/👎
  fingerprints.json  # 增量 ingest
  cache/vectors.json # 向量缓存
```

### MCP 模式

| `setup.mcpMode` | `.cursor/mcp.json` | 说明 |
|-----------------|--------------------|------|
| `http`（默认） | `{ "url": "http://127.0.0.1:8787/mcp" }` | 需 `start`/`serve`；看板可 **重启 MCP** |
| `stdio` | `command` + `env.WORKSPACE_KB_CONFIG` | 不依赖看板；务必钉死配置路径（Cursor 常忽略 `cwd`） |

## 同机多项目

每个工作区各自一份配置与 `.workspace-kb/`，端口不要冲突：

```bash
cd E:/project-a && npx workspace-kb start --port 8787
cd E:/project-b && npx workspace-kb start --port 8788
npx workspace-kb projects
```

优先使用**项目内** `.cursor/mcp.json`。示例：[`examples/multi-a`](examples/multi-a)、[`examples/multi-b`](examples/multi-b)、[`examples/multi-project.mcp.json`](examples/multi-project.mcp.json)。

## Cursor / Agent 使用建议

1. 保持 `npx workspace-kb start` 运行（HTTP MCP）。
2. 问架构、路由、运维症状类问题——规则与 Skill 应触发 `kb_search`。
3. 确认是否真调用：看板「最近事件」或 `Get-Content .workspace-kb\usage.jsonl`。
4. 若 `kb_status` 的 `workspaceRoot` 落在用户主目录，说明 MCP 绑错目录——改用 HTTP 模式或钉死 `WORKSPACE_KB_CONFIG`。

## 故障排查

| 现象 | 处理 |
|------|------|
| `EADDRINUSE :8787` | 已有实例在跑，直接用；或 `npx workspace-kb stop --port 8787` |
| 看板仍是旧 UI / `/api/health` 404 | 杀掉旧进程，安装 `#master` 后重新 `start` |
| `No usage.jsonl` | 只有 **search/read/MCP** 会写；仅 `ingest` 不会产生 |
| 搜不到 / 命中率低 | 跑 `ingest`、看 `health`、补 `synonyms`、核对 MCP 根目录 |
| Ollama 报错 | `ollama serve` + `ollama pull <模型>` |
| Agent 从不调 KB | 重启 MCP；确认规则/Skill 存在；明示「先 kb_search」 |

## 环境变量

| 变量 | 含义 |
|------|------|
| `WORKSPACE_KB_CONFIG` | 配置文件绝对路径 |
| `WORKSPACE_ROOT` | 覆盖工作区根目录 |
| `WORKSPACE_KB_MODEL` / `BUYU_KB_MODEL` | 向量模型名 |
| `WORKSPACE_KB_DIM` / `BUYU_KB_DIM` | 向量维度 |
| `WORKSPACE_KB_EMBED_PROVIDER` | `ollama` \| `openai` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | 云端向量 |
| `OLLAMA_HOST` | 默认 `http://127.0.0.1:11434` |
| `WORKSPACE_KB_PORT` | 看板端口（默认 `8787`） |
| `WORKSPACE_KB_SKIP_SETUP` | `1` 跳过 postinstall 自动配置 |

## 许可证

MIT
