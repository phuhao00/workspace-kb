const state = { days: 7 };

const els = {
  daysSeg: document.getElementById("daysSeg"),
  refreshBtn: document.getElementById("refreshBtn"),
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

els.refreshBtn.addEventListener("click", () => void load());

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

    els.metrics.innerHTML = [
      metricCard(
        "Calls",
        fmt(s.events),
        `search ${s.searchCount || 0} · read ${s.readCount || 0}`,
        "var(--accent)",
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
        "snippet vs full file",
        "var(--green)",
      ),
      metricCard(
        "Avg hits / latency",
        `${s.avgHits ?? "—"} / ${s.avgLatencyMs ?? "—"}ms`,
        `ok ${s.okCount || 0} · fail ${s.failCount || 0}`,
        "var(--orange)",
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
              ev.ok === false
                ? "fail"
                : ev.op === "read"
                  ? "read"
                  : "search";
            const label = ev.ok === false ? "fail" : ev.op || "?";
            return `<tr>
              <td>${formatTs(ev.ts)}</td>
              <td><span class="badge ${badge}">${label}</span></td>
              <td title="${escapeAttr(detailOf(ev))}">${escapeHtml(detailOf(ev))}</td>
              <td>${fmt(ev.est_tokens_returned)}</td>
              <td class="saved">${fmt(ev.est_tokens_saved)}</td>
              <td>${ev.latency_ms ?? "—"}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="empty">No events</td></tr>`;

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
setInterval(() => void load(), 15000);
