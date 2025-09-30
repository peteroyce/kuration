/**
 * Semantic embedding helpers using Voyage AI embeddings.
 * Embeddings are stored as JSON-stringified float arrays in SQLite.
 */

export async function embed(text: string): Promise<number[]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text, model: 'voyage-2' }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.warn(
      `[embeddings] Voyage API request failed (${response.status}): ${errBody}`
    );
    throw new Error(
      `Voyage API error ${response.status}: embedding unavailable`
    );
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



function helper4(data) {
  return JSON.stringify(data);
}


const MAX_15 = 65;
