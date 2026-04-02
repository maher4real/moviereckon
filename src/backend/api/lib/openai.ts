/**
 * OpenAI API client — embeddings and chat completions.
 * Used by the AI recommendation engine.
 */

function getOpenAIKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

export function isOpenAIConfigured(): boolean {
  return getOpenAIKey().length > 0;
}

const OPENAI_API = "https://api.openai.com/v1";
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o-mini";

async function openAIFetch(path: string, body: unknown): Promise<Response> {
  return fetch(`${OPENAI_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Generate embeddings for a batch of texts.
 * Returns float32 vectors in the same order as input.
 * Max 2048 inputs per call.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const response = await openAIFetch("/embeddings", {
    model: EMBEDDING_MODEL,
    input: texts,
    encoding_format: "float",
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embeddings failed: ${response.status} ${err}`);
  }

  const data = await response.json() as {
    data: { index: number; embedding: number[] }[];
  };

  // Re-order by index to guarantee order matches input
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/**
 * Cosine similarity between two equal-length vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Average a list of embedding vectors into a single centroid vector.
 * Weights are optional; defaults to equal weight.
 */
export function averageEmbeddings(
  embeddings: number[][],
  weights?: number[],
): number[] {
  if (!embeddings.length) return [];

  const dim = embeddings[0].length;
  const result = new Array<number>(dim).fill(0);
  const totalWeight = weights
    ? weights.reduce((s, w) => s + w, 0)
    : embeddings.length;

  for (let i = 0; i < embeddings.length; i++) {
    const w = weights ? weights[i] : 1;
    for (let d = 0; d < dim; d++) {
      result[d] += (embeddings[i][d] * w) / totalWeight;
    }
  }

  return result;
}

/**
 * Generate short one-sentence explanations for a list of movies
 * based on the user's taste profile description.
 */
export async function generateExplanations(
  tasteProfile: string,
  movies: { id: number; type: "movie" | "tv"; title: string; overview: string }[],
): Promise<Record<string, string>> {
  if (!movies.length) return {};

  const movieList = movies
    .map((m, i) => `${i + 1}. [${m.id}:${m.type}] "${m.title}": ${m.overview.slice(0, 120)}`)
    .join("\n");

  const prompt = `You are a movie recommendation assistant. Based on the viewer's taste, write one short sentence (max 12 words) explaining why each title fits them. Be specific and personal, not generic.

Viewer taste: ${tasteProfile}

Titles:
${movieList}

Respond with a JSON object mapping each "[id:type]" key to the explanation string. Example:
{"123:movie": "Matches your love of slow-burn sci-fi thrillers.", "456:tv": "Same dark humour as your top picks."}`;

  const response = await openAIFetch("/chat/completions", {
    model: CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 1200,
    response_format: { type: "json_object" },
  });

  if (!response.ok) {
    return {};
  }

  try {
    const data = await response.json() as {
      choices: { message: { content: string } }[];
    };
    const content = data.choices[0]?.message?.content || "{}";
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}
