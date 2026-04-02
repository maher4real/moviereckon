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

// gpt-4.1-mini — smarter, faster, cheaper than gpt-4o-mini.
// If OpenAI releases gpt-5-mini, swap this string.
const CHAT_MODEL = "gpt-4.1-mini";

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
 * Weighted average of embedding vectors into a centroid.
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

export interface UserTasteProfile {
  // Titles the user explicitly liked (highest signal)
  likedTitles: string[];
  // Titles the user watched (medium signal)
  watchedTitles: string[];
  // Titles marked must_watch or give_it_a_go feedback
  positiveFeedbackTitles: string[];
  // Top genre names
  topGenres: string[];
  // Top languages
  topLanguages: string[];
  // Inferred taste summary for prompt context
  tasteSummary: string;
}

/**
 * Generate rich, specific, personalised explanations for each recommendation.
 * Uses gpt-4.1-mini with a structured prompt that references the user's
 * actual liked titles, genres, and languages for maximum specificity.
 */
export async function generateExplanations(
  profile: UserTasteProfile,
  movies: { id: number; type: "movie" | "tv"; title: string; overview: string; genres: string; year: string }[],
): Promise<Record<string, string>> {
  if (!movies.length) return {};

  const likedContext = profile.likedTitles.slice(0, 8).join(", ") || "none yet";
  const watchedContext = profile.watchedTitles.slice(0, 6).join(", ") || "none yet";
  const genreContext = profile.topGenres.slice(0, 5).join(", ") || "various";
  const langContext = profile.topLanguages.slice(0, 3).join(", ") || "various";

  const movieList = movies
    .map((m) => `[${m.id}:${m.type}] "${m.title}" (${m.year}) — ${m.genres} — ${m.overview.slice(0, 100)}`)
    .join("\n");

  const systemPrompt = `You are a deeply personal movie recommendation assistant. You know this viewer intimately:
- Liked titles: ${likedContext}
- Recently watched: ${watchedContext}
- Favourite genres: ${genreContext}
- Preferred languages: ${langContext}
- Taste summary: ${profile.tasteSummary}

Your job: write ONE sentence (max 14 words) per title explaining WHY it fits THIS specific viewer.
Rules:
- Reference their actual liked titles or genres when relevant ("Like Inception, this...")
- Be specific about the emotional/thematic connection, not just genre labels
- Never say "based on your preferences" or "you might like" — just state the connection directly
- If it's a language match, mention it ("Another gripping Hindi thriller like...")
- Vary your sentence structures`;

  const userPrompt = `For each title below, write the explanation. Respond as JSON mapping "[id:type]" → explanation string.

${movieList}`;

  const response = await openAIFetch("/chat/completions", {
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.5,
    max_tokens: 1800,
    response_format: { type: "json_object" },
  });

  if (!response.ok) return {};

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
