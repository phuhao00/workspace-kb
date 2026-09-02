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
  return { modelId: cfg.modelId, dim: vector.length, host: cfg.ollamaHost };
}

async function embedRequest(input, cfg) {
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
