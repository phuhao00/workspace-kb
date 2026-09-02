# workspace-kb

> 中文文档 · [English](./README.md)

面向 **Agent 工作流** 的本地 [LanceDB](https://github.com/lancedb/lancedb) 知识库。

只索引精选的文档 / Skill / Wiki，**不是**全仓源码。Agent 通过 **MCP**（`kb_search` → `kb_read`）检索；脚本用 **CLI**。搜索返回短摘要，阅读只打开单个标题节。

| | |
|---|---|
| 版本 | **1.5** |
| 协议 | MIT |
| 仓库 | https://github.com/phuhao00/workspace-kb |

## 解决什么问题

- **省 Token**：Agent 拿到摘要 + 单节内容，而不是整本手册。
- **多仓路由**：先定位到正确的文档/子仓，再在该目录 `rg`。
- **项目记忆**：运维/排查结论可跨 Cursor · Codex · CLI 共享，带标签、脱敏、TTL，看板可审计。
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
npx workspace-kb memory list
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

  init [--force] [--name 应用名] [--port <n>]
  setup [--port <n>]            # 写入 MCP / 规则 / Skill；端口可任意
  ingest [--full]               # 默认增量；--full 全量重建
  search "<查询>" [--limit 6] [--kind skill] [--repo 子仓名]
  read <路径> [标题]
  status | health | stats [--days 7]
  start | stop | serve [--port <1-65535|auto>]
  projects                      # 列出 ~/.workspace-kb/registry.json
  feedback [--bad] <备注>
  memory put|search|list|delete|prune   # 项目运维事实（见下文）
```

端口解析：`--port` → `WORKSPACE_KB_PORT` → `setup.dashboardPort` → registry → 默认 `8787`（仅缺省值，**任意空闲端口均可**）。

示例：

```bash
npx workspace-kb ingest --full
npx workspace-kb search "充值未到账" --limit 8
npx workspace-kb memory put "测服 hallapi HTTP :8080" --key fish37-hallapi --tags ops,test-env
npx workspace-kb start --port 19090
npx workspace-kb stop                 # 按配置端口停止，不必写死 8787
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
| **项目记忆** | 写入 / 按 key·id 删除 / 清理过期；列表可审计 |
| **多项目** | 本机已注册实例与端口 |
| **指标** | 调用次数 · 命中率 · 估算返回/节省 Token |
| **最近事件** | 👍/👎 反馈 → 影响路径加权检索 |

**HTTP MCP：** `http://127.0.0.1:<端口>/mcp` — Cursor / Continue 需要保持 `start`/`serve` 运行。

### 本地 HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 + 命中率摘要 |
| GET | `/api/control` | 状态、项目列表、反馈、ingest 任务、记忆预览 |
| GET | `/api/memory` | 项目记忆列表 |
| GET | `/api/usage?days=7` | Token 代理指标 |
| GET | `/api/projects` | 多项目注册表 |
| GET | `/api/feedback` | 反馈汇总 |
| POST | `/api/actions/restart-mcp` | 断开 MCP 会话（客户端会重连） |
| POST | `/api/actions/setup` | 重新跑自动配置 |
| POST | `/api/actions/ingest` | Body 可选 `{ "full": true }` |
| POST | `/api/actions/feedback` | `{ useful, query, path, heading }` |
| POST | `/api/actions/memory-put` | `{ text, key?, tags?, ttlDays?, source? }` |
| POST | `/api/actions/memory-delete` | `{ id? }` 或 `{ key? }` |
| POST | `/api/actions/memory-prune` | 从磁盘删除已过期条目 |
| POST | `/api/actions/restart-server` | 重启看板进程 |
| * | `/mcp` | Streamable HTTP MCP |

## 项目记忆（v1.5）

跨 **Cursor + Codex + CLI** 共享的**项目运维事实**（环境拓扑、测服端口、脱敏后的排查结论）。  
**不是** IDE 个人 Memories，也**不替代** `AGENTS.md` / 文档索引。

### 该存什么 / 不该存什么

| 存哪 | 用途 | 示例 |
|------|------|------|
| Cursor / Codex Memories | 个人偏好、编码习惯 | 「我喜欢用 TypeScript」 |
| `AGENTS.md` / `.cursor/rules` | 团队硬性规范（可 git 提交） | 分支模型、禁止改生产配置 |
| `kb_search` / `kb_read` | 文档 · Skill · Wiki | 支付回调手册某一节 |
| `kb_memory_*` | 共享运维结论（脱敏、可过期、看板审计） | 「测服 hallapi HTTP :8080」 |

适合写入：测服机器与端口、某次故障的**脱敏**结论与责任仓、临时开关状态。  
不要写入：密码 / API Key / Token、身份证等 PII、纯个人偏好。

### CLI

```bash
# 写入（同 key 覆盖 upsert；默认 TTL 90 天；--ttl 0 = 永不过期）
npx workspace-kb memory put "测服 hallapi HTTP :8080" \
  --key fish37-hallapi --tags ops,test-env --ttl 90

npx workspace-kb memory search "hallapi"
npx workspace-kb memory list
npx workspace-kb memory delete --key fish37-hallapi
# 或：npx workspace-kb memory delete --id <uuid>
npx workspace-kb memory prune          # 清理已过期行
```

| 子命令 | 说明 |
|--------|------|
| `put` | `--key` 稳定键（省略则从正文生成）；`--tags a,b`；`--ttl 天数` |
| `search` | 按 key / 正文 / 标签关键词打分 |
| `list` | 最近未过期条目（默认最多 50） |
| `delete` | `--key` 或 `--id` |
| `prune` | 从 `facts.jsonl` 删除已过期行 |

### MCP 工具

| 工具 | 作用 |
|------|------|
| `kb_memory_put` | 写入；`text` 必填；可选 `key` / `tags` / `ttlDays` / `source` |
| `kb_memory_search` | 检索；可选 `query` / `tag` / `limit` |
| `kb_memory_list` | 列表；可选 `limit` / `includeExpired` |
| `kb_memory_delete` | 按 `id` 或 `key` 删除 |

`kb_search` 命中文档时会附带 `relatedMemories`（最多约 3 条相关运维事实）。  
`kb_status` 会带一小段最近记忆预览。

### 校验与 TTL

写入前默认校验（看板 / CLI / MCP 相同）：

- 正文非空，最长 **2000** 字符
- 疑似个人偏好（如「我喜欢…」「prefer…」）→ **拒绝**，请改用 IDE Memories
- 疑似密钥 / Bearer / 私钥 / 身份证号等 → **拒绝**，请脱敏后再写
- **TTL**：默认 **90** 天；`0` = 永不过期；上限 3650 天
- 同 `key` **upsert**（覆盖旧条目）

### 数据格式

路径：`.workspace-kb/memory/facts.jsonl`（一行一条 JSON，请 gitignore `dataDir`）。

```json
{
  "id": "uuid",
  "ts": "2026-09-02T09:00:00.000Z",
  "key": "fish37-hallapi",
  "text": "测服 hallapi HTTP :8080",
  "tags": ["ops", "test-env"],
  "source": "cli",
  "ttlDays": 90,
  "expiresAt": "2026-12-01T09:00:00.000Z"
}
```

`expiresAt` 为 `null` 表示永久。过期条目默认不出现在 search/list；用 `prune` 或看板「清理过期」从磁盘删除。

### Agent 推荐流程

1. 重复排查前先 `kb_memory_search`（或看 `kb_search` 的 `relatedMemories`）。
2. 得到可复用、已脱敏的结论后 `kb_memory_put`（打上 `ops` / 服务名 / 环境等 tags）。
3. 过时事实在看板 **项目记忆** 删除，或设短 TTL 后 `prune`。

## 功能一览（v1.4+）

| 能力 | 行为 |
|------|------|
| 混合检索 | 向量 + 词法（含 CJK 双字）+ kind 加权 + 反馈加权 |
| 查询改写 | 内置中英同义词；可用配置 `synonyms` 扩展 |
| 增量 ingest | 文件指纹 + 向量缓存；未变更文件跳过 embed；`--full` 全量 |
| **项目记忆** | `.workspace-kb/memory/`；MCP + CLI + 看板；TTL / 脱敏 / 标签 |
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
    "dashboardPort": 19090,
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
  memory/
    facts.jsonl      # 项目运维记忆（跨工具共享）
```

### MCP 模式

| `setup.mcpMode` | `.cursor/mcp.json` | 说明 |
|-----------------|--------------------|------|
| `http`（默认） | `{ "url": "http://127.0.0.1:<dashboardPort>/mcp" }` | 需 `start`/`serve`；看板可 **重启 MCP** |
| `stdio` | `command` + `env.WORKSPACE_KB_CONFIG` | 不依赖看板；务必钉死配置路径（Cursor 常忽略 `cwd`） |

## 同机多项目

每个工作区各自一份配置与 `.workspace-kb/`，**端口任意**（`1–65535`），只要不冲突即可。`8787` / `8788` 只是示例，不是限制。

解析顺序：`--port` → `WORKSPACE_KB_PORT` → `setup.dashboardPort` → 本机 registry → 默认 `8787`。

```bash
# 配置里写死任意端口
# "setup": { "dashboardPort": 19090 }

npx workspace-kb start                  # 用配置端口（并同步 MCP URL）
npx workspace-kb start --port 19091     # 覆盖端口，同时写回 config + `.cursor/mcp.json`
npx workspace-kb start --port auto      # 系统分配空闲端口并同步配置
npx workspace-kb stop                   # 停配置/registry 对应端口
npx workspace-kb setup --port 19090     # 仅重写 MCP URL 并写回 config（不启动）
npx workspace-kb projects
```

`start` / `serve` 在选定端口后会自动同步：`workspace-kb.config.json` → `setup.dashboardPort`、`.cursor/mcp.json`、`.continue/workspace-kb.mcp.json`。

优先使用**项目内** `.cursor/mcp.json`。示例：[`examples/multi-a`](examples/multi-a)、[`examples/multi-b`](examples/multi-b)、[`examples/multi-project.mcp.json`](examples/multi-project.mcp.json)。

## Cursor / Agent 使用建议

1. 保持 `npx workspace-kb start` 运行（HTTP MCP）。
2. 问架构、路由、运维症状类问题——规则与 Skill 应触发 `kb_search`。
3. 重复排查前先 `kb_memory_search`；落结论后 `kb_memory_put`（脱敏 + tags + TTL）。
4. 确认是否真调用：看板「最近事件」或 `Get-Content .workspace-kb\usage.jsonl`。
5. 若 `kb_status` 的 `workspaceRoot` 落在用户主目录，说明 MCP 绑错目录——改用 HTTP 模式或钉死 `WORKSPACE_KB_CONFIG`。

## 故障排查

| 现象 | 处理 |
|------|------|
| `EADDRINUSE :<port>` | 该端口已有实例；直接用，或 `stop --port <n>` / 换 `setup.dashboardPort` |
| 看板仍是旧 UI / 无「项目记忆」/ `/api/health` 404 | 杀掉旧进程，安装 `#master`（≥1.5）后重新 `start` |
| `No usage.jsonl` | 只有 **search/read/MCP** 会写；仅 `ingest` 不会产生 |
| 搜不到 / 命中率低 | 跑 `ingest`、看 `health`、补 `synonyms`、核对 MCP 根目录 |
| `memory put` 被拒（preference / secret） | 偏好写 IDE Memories；密钥脱敏后再 put |
| 记忆搜不到但文件有行 | 可能已过期：`memory list` 看 `expiredCount`，或 `prune` / 看板清理 |
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
| `WORKSPACE_KB_PORT` | 看板端口（任意 `1–65535`，或 `auto`；未设置时用 `setup.dashboardPort`） |
| `WORKSPACE_KB_SKIP_SETUP` | `1` 跳过 postinstall 自动配置 |

## 许可证

MIT
