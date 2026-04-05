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

  const data = (await response.json()) as {
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
 * Generate concise, personalised explanations for each recommendation.
 * Ultra-optimized for speed: reduced context, fewer tokens, simpler format.
 * Uses gpt-4.1-mini with a minimal prompt.
 */
export async function generateExplanations(
  profile: UserTasteProfile,
  movies: {
    id: number;
    type: "movie" | "tv";
    title: string;
    overview: string;
    genres: string;
    year: string;
  }[],
): Promise<Record<string, string>> {
  if (!movies.length) return {};

  // Minimize context: top 3 liked titles, top 3 genres only
  const likedContext =
    profile.likedTitles.slice(0, 3).join(", ") || "top picks";
  const genreContext = profile.topGenres.slice(0, 3).join(", ") || "mixed";

  // Compact movie list: only title, year, genre
  const movieList = movies
    .map((m) => `[${m.id}:${m.type}] ${m.title} (${m.year}) — ${m.genres}`)
    .join("\n");

  // Ultra-compact system prompt: only essential info
  const systemPrompt = `You match movies to viewers. Liked: ${likedContext}. Genres: ${genreContext}. 
For each title, write ONE short reason (max 10 words). Format: "[id:type]": "reason"`;

  const response = await openAIFetch("/chat/completions", {
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: movieList },
    ],
    temperature: 0.2,
    max_tokens: 300,
    response_format: { type: "json_object" },
  });

  if (!response.ok) return {};

  try {
    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = data.choices[0]?.message?.content || "{}";
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}
