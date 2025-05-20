/**
 * Semantic embedding helpers using Anthropic's voyage embeddings via the API.
 * Embeddings are stored as JSON-stringified float arrays in SQLite.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function embed(text: string): Promise<number[]> {
  // Use Claude's text embedding via the messages API with a structured prompt
  // In production, swap for a dedicated embedding model (voyage-2, text-embedding-3-small, etc.)
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text, model: 'voyage-2' }),
  });

  if (!response.ok) {
    // Fallback: simple TF-IDF-style bag-of-words as 128-dim vector for dev
    return naiveEmbed(text);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/** Cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

/** Deterministic fallback embedding (no API call). */
function naiveEmbed(text: string, dims = 128): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const vec = new Array(dims).fill(0);
  for (const word of words) {
    let h = 5381;
    for (let i = 0; i < word.length; i++) h = ((h << 5) + h) + word.charCodeAt(i);
    vec[Math.abs(h) % dims] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}
