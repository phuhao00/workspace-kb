const state = { days: 7 };

const els = {
  daysSeg: document.getElementById("daysSeg"),
  refreshBtn: document.getElementById("refreshBtn"),
  btnRestartMcp: document.getElementById("btnRestartMcp"),
  btnSetup: document.getElementById("btnSetup"),
  btnIngest: document.getElementById("btnIngest"),
  btnIngestFull: document.getElementById("btnIngestFull"),
  btnRestartServer: document.getElementById("btnRestartServer"),
  controlStatus: document.getElementById("controlStatus"),
  controlMsg: document.getElementById("controlMsg"),
  healthBadge: document.getElementById("healthBadge"),
  healthList: document.getElementById("healthList"),
  projectsList: document.getElementById("projectsList"),
  feedbackSummary: document.getElementById("feedbackSummary"),
  banner: document.getElementById("banner"),
  metaLine: document.getElementById("metaLine"),
  metrics: document.getElementById("metrics"),
  chartCalls: document.getElementById("chartCalls"),
  chartTokens: document.getElementById("chartTokens"),
  topQueries: document.getElementById("topQueries"),
  eventsBody: document.getElementById("eventsBody"),
  footPath: document.getElementById("footPath"),
};

els.daysSeg.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-days]");
  if (!btn) return;
  state.days = Number(btn.dataset.days);
  for (const b of els.daysSeg.querySelectorAll("button")) {
    b.classList.toggle("active", b === btn);
  }
  void load();
});

els.refreshBtn.addEventListener("click", () => {
  void load();
  void loadControl();
});
els.btnRestartMcp.addEventListener("click", () => void runAction("restart-mcp"));
els.btnSetup.addEventListener("click", () => void runAction("setup"));
els.btnIngest.addEventListener("click", () => void runAction("ingest", { full: false }));
els.btnIngestFull.addEventListener("click", () => void runAction("ingest", { full: true }));
els.btnRestartServer.addEventListener("click", () => void runAction("restart-server"));

els.eventsBody.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-fb]");
  if (!btn) return;
  void sendFeedback({
    useful: btn.dataset.fb === "up",
    query: btn.dataset.query || "",
    path: btn.dataset.path || "",
    heading: btn.dataset.heading || "",
  });
});

async function runAction(name, body = {}) {
  setControlMsg("执行中…");
  const buttons = [
    els.btnRestartMcp,
    els.btnSetup,
    els.btnIngest,
    els.btnIngestFull,
    els.btnRestartServer,
  ];
  for (const btn of buttons) btn.disabled = true;
  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    if (name === "restart-server") {
      setControlMsg(`${data.message} — 页面 2 秒后刷新`, false);
      setTimeout(() => location.reload(), 2000);
      return;
    }
    setControlMsg(data.message || "完成", false);
    await loadControl();
    if (name === "ingest") pollIngest();
    else void load();
  } catch (err) {
    setControlMsg(err instanceof Error ? err.message : String(err), true);
  } finally {
    for (const btn of buttons) btn.disabled = false;
  }
}

async function sendFeedback(payload) {
  try {
    const res = await fetch("/api/actions/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || "feedback failed");
    setControlMsg(payload.useful ? "已标记有用" : "已标记没用", false);
    await loadControl();
  } catch (err) {
    setControlMsg(err instanceof Error ? err.message : String(err), true);
  }
}

function setControlMsg(text, isError = false) {
  els.controlMsg.hidden = false;
  els.controlMsg.textContent = text;
  els.controlMsg.classList.toggle("error", isError);
}

async function loadControl() {
  const res = await fetch("/api/control", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) return;
  const kb = data.kb || {};
  const mcp = data.mcp || {};
  const setup = data.setup || {};
  const ingest = data.ingest || {};
  const health = data.health || {};
  const usage = health.usage || {};

  els.controlStatus.innerHTML = [
    stat("MCP 会话", String(mcp.sessions ?? "—"), ""),
    stat("索引", kb.ready ? `${kb.chunkCount || 0} chunks` : "未就绪", kb.ready ? "ok" : "bad"),
    stat("Workspace", kb.workspaceRoot || setup.workspaceRoot || "—", kb.ready ? "ok" : "bad"),
    stat(
      "命中率",
      usage.hitRate == null ? "—" : `${Math.round(usage.hitRate * 100)}%`,
      usage.hitRate == null ? "" : usage.hitRate >= 0.3 ? "ok" : "bad",
    ),
    stat(
      "Ingest",
      ingest.running ? "运行中…" : ingest.error ? `失败: ${ingest.error}` : "空闲",
      ingest.running ? "" : ingest.error ? "bad" : "ok",
    ),
    stat("重启次数", String(mcp.restartCount ?? 0), ""),
  ].join("");

  els.btnIngest.disabled = Boolean(ingest.running);
  els.btnIngestFull.disabled = Boolean(ingest.running);

  renderHealth(health);
  renderProjects(data.projects || []);
  const fb = data.feedback || {};
  els.feedbackSummary.textContent = fb.total
    ? `有用 ${fb.useful} · 没用 ${fb.useless} · 好评率 ${
        fb.usefulRate == null ? "—" : `${Math.round(fb.usefulRate * 100)}%`
      }`
    : "尚无反馈 — 在 Recent events 右侧点 👍/👎";
}

function renderHealth(health) {
  const ok = health.ok;
  els.healthBadge.textContent = ok ? "HEALTHY" : "CHECK";
  els.healthBadge.className = `badge-health ${ok ? "ok" : "bad"}`;
  const checks = health.checks || [];
  els.healthList.innerHTML = checks.length
    ? checks
        .map(
          (c) => `<div class="health-row ${c.ok ? "ok" : "bad"}">
            <strong>${escapeHtml(c.id)}</strong>
            <span>${escapeHtml(c.detail || "")}</span>
            ${c.hint ? `<em>${escapeHtml(c.hint)}</em>` : ""}
          </div>`,
        )
        .join("")
    : `<div class="empty">No health data</div>`;
}

function renderProjects(projects) {
  els.projectsList.innerHTML = projects.length
    ? projects
        .map((p) => {
          const badge = p.running ? "running" : "stopped";
          return `<li>
            <span title="${escapeAttr(p.workspaceRoot || "")}">${escapeHtml(p.name || p.id)}</span>
            <span>
              <a href="${escapeAttr(p.dashboardUrl || "#")}" target="_blank" rel="noreferrer">:${p.port}</a>
              · <span class="badge ${badge === "running" ? "search" : "fail"}">${badge}</span>
            </span>
          </li>`;
        })
        .join("")
    : `<li class="empty" style="display:block;background:transparent">暂无注册项目 — serve/start 后自动登记</li>`;
}

function pollIngest() {
  const timer = setInterval(async () => {
    await loadControl();
    const res = await fetch("/api/control", { cache: "no-store" });
    const data = await res.json();
    if (!data.ingest?.running) {
      clearInterval(timer);
      void load();
      setControlMsg(
        data.ingest?.error ? `索引失败: ${data.ingest.error}` : "索引完成",
        Boolean(data.ingest?.error),
      );
    }
  }, 2000);
}

function stat(label, value, tone) {
  return `<div class="control-stat"><div class="k">${escapeHtml(label)}</div><div class="v ${tone}">${escapeHtml(value)}</div></div>`;
}

function fmt(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString();
}

function shortDay(day) {
  return String(day).slice(5);
}

function formatTs(iso) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

function detailOf(ev) {
  if (ev.op === "search") return String(ev.query || ev.error || "—");
  if (ev.op === "read") {
    const h = ev.heading ? ` · ${ev.heading}` : "";
    return `${ev.path || "—"}${h}`;
  }
  return ev.error || "—";
}

function metricCard(label, value, hint, color) {
  return `<div class="metric"><div class="label">${label}</div><div class="value" style="color:${color}">${value}</div><div class="hint">${hint}</div></div>`;
}

function renderCalls(trend) {
  const max = Math.max(1, ...trend.map((p) => p.search + p.read));
  if (!trend.some((p) => p.search + p.read > 0)) {
    els.chartCalls.innerHTML = `<div class="empty">No call data yet — run search/read first.</div>`;
    return;
  }
  els.chartCalls.innerHTML = trend
    .map((p) => {
      const total = p.search + p.read;
      const sw = (p.search / max) * 100;
      const rw = (p.read / max) * 100;
      return `<div class="bar-row"><span>${shortDay(p.day)}</span><div class="bar-track"><div class="bar-seg search" style="width:${sw}%"></div><div class="bar-seg read" style="width:${rw}%"></div></div><span>${total}</span></div>`;
    })
    .join("");
}

function renderTokens(trend) {
  const max = Math.max(
    1,
    ...trend.map((p) => Math.max(p.estTokensReturned, p.estTokensSaved)),
  );
  if (!trend.some((p) => p.estTokensReturned + p.estTokensSaved > 0)) {
    els.chartTokens.innerHTML = `<div class="empty">No token proxy data yet.</div>`;
    return;
  }
  els.chartTokens.innerHTML = trend
    .map((p) => {
      const rw = (p.estTokensReturned / max) * 100;
      const sw = (p.estTokensSaved / max) * 100;
      return `<div class="bar-row"><span>${shortDay(p.day)}</span><div class="bar-track"><div class="bar-seg returned" style="width:${rw}%" title="returned"></div></div><span>${fmt(p.estTokensReturned)}</span></div>
      <div class="bar-row"><span></span><div class="bar-track"><div class="bar-seg saved" style="width:${sw}%" title="saved"></div></div><span class="saved">${fmt(p.estTokensSaved)}</span></div>`;
    })
    .join("");
}

async function load() {
  els.banner.hidden = true;
  els.refreshBtn.disabled = true;
  try {
    const res = await fetch(`/api/usage?days=${state.days}&recent=50`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const s = data.summary || {};
    const meta = data.meta || {};

    if (!s.logExists) {
      els.banner.hidden = false;
      els.banner.textContent =
        "No usage.jsonl yet. Run workspace-kb search/read (or MCP tools), then refresh.";
    }

    els.metaLine.textContent = meta.exists
      ? `Index ${fmt(meta.chunkCount)} chunks · ${meta.modelId || "—"} · ingest ${
          meta.ingestedAt ? formatTs(meta.ingestedAt) : "—"
        }`
      : "Index meta not found — run workspace-kb ingest";

    const hitPct =
      s.hitRate == null ? "—" : `${Math.round(Number(s.hitRate) * 100)}%`;

    els.metrics.innerHTML = [
      metricCard(
        "Calls",
        fmt(s.events),
        `search ${s.searchCount || 0} · read ${s.readCount || 0}`,
        "var(--accent)",
      ),
      metricCard(
        "Hit rate",
        hitPct,
        `empty ${s.emptySearchCount || 0} · hit ${s.hitSearchCount || 0}`,
        "var(--orange)",
      ),
      metricCard(
        "Est. returned tokens",
        fmt(s.estTokensReturned),
        `vs full ${fmt(s.estTokensFull)}`,
        "var(--purple)",
      ),
      metricCard(
        "Est. saved tokens",
        fmt(s.estTokensSaved),
        `avg ${s.avgHits ?? "—"} hits · ${s.avgLatencyMs ?? "—"}ms`,
        "var(--green)",
      ),
    ].join("");

    renderCalls(data.trend || []);
    renderTokens(data.trend || []);

    const queries = s.topQueries || [];
    els.topQueries.innerHTML = queries.length
      ? queries
          .map(
            (q) =>
              `<li><span title="${escapeAttr(q.query)}">${escapeHtml(
                q.query,
              )}</span><span>${q.count}</span></li>`,
          )
          .join("")
      : `<li class="empty" style="display:block;background:transparent">No searches yet</li>`;

    const recent = data.recent || [];
    els.eventsBody.innerHTML = recent.length
      ? recent
          .map((ev) => {
            const badge =
              ev.ok === false ? "fail" : ev.op === "read" ? "read" : "search";
            const label = ev.ok === false ? "fail" : ev.op || "?";
            const q = escapeAttr(ev.query || "");
            const p = escapeAttr(ev.path || "");
            const h = escapeAttr(ev.heading || "");
            return `<tr>
              <td>${formatTs(ev.ts)}</td>
              <td><span class="badge ${badge}">${label}</span></td>
              <td title="${escapeAttr(detailOf(ev))}">${escapeHtml(detailOf(ev))}</td>
              <td>${fmt(ev.est_tokens_returned)}</td>
              <td class="saved">${fmt(ev.est_tokens_saved)}</td>
              <td>${ev.latency_ms ?? "—"}</td>
              <td class="fb-cell">
                <button type="button" class="fb" data-fb="up" data-query="${q}" data-path="${p}" data-heading="${h}" title="有用">👍</button>
                <button type="button" class="fb" data-fb="down" data-query="${q}" data-path="${p}" data-heading="${h}" title="没用">👎</button>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" class="empty">No events</td></tr>`;

    els.footPath.textContent = `${s.logPath || ""} · ${data.dataDir || ""}`;
  } catch (err) {
    els.banner.hidden = false;
    els.banner.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    els.refreshBtn.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", "&#39;");
}

void load();
void loadControl();
setInterval(() => {
  void load();
  void loadControl();
}, 15000);
