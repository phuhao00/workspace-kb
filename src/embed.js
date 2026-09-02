import { loadRuntimeConfig } from "./config.js";

export async function embedTexts(texts) {
  const cfg = loadRuntimeConfig();
  const vectors = [];
  for (let i = 0; i < texts.length; i += cfg.embedBatch) {
    const batch = texts
      .slice(i, i + cfg.embedBatch)
      .map((text) => String(text).slice(0, 2000));
    const embeddings = await embedRequest(batch, cfg);
    vectors.push(...embeddings);
    process.stderr.write(
      `embedded ${Math.min(i + cfg.embedBatch, texts.length)}/${texts.length}\n`,
    );
  }
  return vectors;
}

export async function embedQuery(query) {
  const [vector] = await embedTexts([query]);
  return vector;
}

export async function probeEmbedding() {
  const cfg = loadRuntimeConfig();
  const [vector] = await embedRequest(["probe"], cfg);
  return {
    modelId: cfg.modelId,
    dim: vector.length,
    host: cfg.embedProvider === "ollama" ? cfg.ollamaHost : cfg.openaiBaseUrl,
    provider: cfg.embedProvider || "ollama",
  };
}

async function embedRequest(input, cfg) {
  const provider = cfg.embedProvider || "ollama";
  if (provider === "openai" || provider === "openai-compatible") {
    return embedOpenAI(input, cfg);
  }
  return embedOllama(input, cfg);
}

async function embedOllama(input, cfg) {
  let response;
  try {
    response = await fetch(`${cfg.ollamaHost}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.modelId, input }),
    });
  } catch {
    throw new Error(
      `Ollama unreachable at ${cfg.ollamaHost}. Ensure ollama is running and: ollama pull ${cfg.modelId}`,
    );
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama embed ${response.status}: ${body}`);
  }
  const data = await response.json();
  const embeddings = data.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== input.length) {
    throw new Error("Ollama embed returned unexpected batch size");
  }
  return embeddings;
}

/** OpenAI / compatible embeddings API (no local Ollama required). */
async function embedOpenAI(input, cfg) {
  const key = cfg.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "embedProvider is openai but OPENAI_API_KEY / openaiApiKey is missing",
    );
  }
  const base = String(cfg.openaiBaseUrl || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  let response;
  try {
    response = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: cfg.modelId || "text-embedding-3-small",
        input,
      }),
    });
  } catch (err) {
    throw new Error(
      `OpenAI-compatible embed unreachable at ${base}: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embed ${response.status}: ${body}`);
  }
  const data = await response.json();
  const rows = data.data || [];
  if (!Array.isArray(rows) || rows.length !== input.length) {
    throw new Error("OpenAI embed returned unexpected batch size");
  }
  return rows
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((r) => r.embedding);
}
