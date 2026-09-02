import { loadRuntimeConfig } from "./config.js";

const BUILTIN = {
  登不进: ["登录", "login", "auth", "token", "鉴权"],
  登录失败: ["login", "token", "鉴权", "认证"],
  充值未到账: ["支付", "pay", "订单", "callback", "发货", "recharge"],
  充值: ["支付", "pay", "订单", "shop"],
  进房失败: ["进房", "房间", "gateway", "game-fish", "匹配"],
  进房: ["房间", "room", "入座"],
  邮件: ["mail", "站内信", "mailsvr"],
  支付: ["pay", "payapi", "订单", "callback"],
  架构: ["architecture", "topology", "拓扑", "链路"],
  拓扑: ["architecture", "谁调谁", "链路"],
  token: ["登录", "鉴权", "auth", "TokenHelper"],
  502: ["gateway", "网关", "upstream", "超时"],
};

/**
 * Expand query with synonyms (builtin + config).
 * @param {string} query
 * @returns {{ query: string, expanded: string, terms: string[], rewritten: boolean }}
 */
export function rewriteQuery(query) {
  const cfg = loadRuntimeConfig();
  const map = { ...BUILTIN, ...(cfg.synonyms || {}) };
  const original = String(query || "").trim();
  const extras = new Set();
  const lower = original.toLowerCase();

  for (const [key, values] of Object.entries(map)) {
    if (!key) continue;
    if (original.includes(key) || lower.includes(String(key).toLowerCase())) {
      for (const v of values || []) {
        if (v && !original.includes(v)) extras.add(v);
      }
    }
  }

  const expanded = extras.size
    ? `${original} ${[...extras].slice(0, 8).join(" ")}`
    : original;

  return {
    query: original,
    expanded,
    terms: [...extras],
    rewritten: extras.size > 0,
  };
}
