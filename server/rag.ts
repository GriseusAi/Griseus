import { db } from "./db";
import { sql } from "drizzle-orm";

// ══════════════════════════════════════════════════════════════════════
// RAG Pipeline — Voyage AI Embeddings + pgvector Similarity Search
// ══════════════════════════════════════════════════════════════════════

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";

async function getVoyageKey(): Promise<string> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  return key;
}

// ── Embed text(s) via Voyage AI ──

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = await getVoyageKey();
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: "document",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data.map((d) => d.embedding);
}

export async function embedQuery(query: string): Promise<number[]> {
  const apiKey = await getVoyageKey();

  // Retry with backoff for rate limits
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: [query],
        model: VOYAGE_MODEL,
        input_type: "query",
      }),
    });

    if (response.status === 429 && attempt < 2) {
      const wait = (attempt + 1) * 5000;
      console.warn(`[rag] Rate limited, retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Voyage API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      data: { embedding: number[] }[];
    };
    return data.data[0].embedding;
  }

  throw new Error("Voyage API: max retries exceeded");
}

// ── Similarity search via pgvector ──

interface ChunkResult {
  id: number;
  content: string;
  category: string;
  metadata: Record<string, any> | null;
  similarity: number;
}

export async function searchKnowledge(
  query: string,
  topK: number = 6,
  categoryFilter?: string
): Promise<ChunkResult[]> {
  const queryEmbedding = await embedQuery(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  let result;
  if (categoryFilter) {
    result = await db.execute(sql`
      SELECT id, content, category, metadata,
             1 - (embedding <=> ${vectorStr}::vector) as similarity
      FROM knowledge_chunks
      WHERE category = ${categoryFilter}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${topK}
    `);
  } else {
    result = await db.execute(sql`
      SELECT id, content, category, metadata,
             1 - (embedding <=> ${vectorStr}::vector) as similarity
      FROM knowledge_chunks
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${topK}
    `);
  }

  return (result.rows as any[]).map((row) => ({
    id: row.id,
    content: row.content,
    category: row.category,
    metadata: row.metadata,
    similarity: parseFloat(row.similarity),
  }));
}

// ── Build dynamic context from search results ──

export async function buildDynamicContext(userQuery: string): Promise<string> {
  const chunks = await searchKnowledge(userQuery, 6);

  if (chunks.length === 0) return "";

  const contextParts = chunks
    .filter((c) => c.similarity > 0.3)
    .map((c) => `[${c.category.toUpperCase()}] ${c.content}`);

  if (contextParts.length === 0) return "";

  return `\n═══ İLGİLİ BİLGİ (RAG) ═══\n${contextParts.join("\n\n")}\n═══════════════════════════`;
}

// ── Upsert chunks (for seeding) ──

export async function upsertChunks(
  chunks: { content: string; category: string; metadata?: Record<string, any> }[]
): Promise<number> {
  const batchSize = 3; // small batches — Voyage free tier: 3 RPM
  let inserted = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.content);

    // Rate limit: wait 25s between batches (3 RPM = 1 req per 20s, +5s buffer)
    if (i > 0) {
      console.log(`[rag] Waiting 25s for rate limit...`);
      await new Promise((r) => setTimeout(r, 25000));
    }

    const embeddings = await embedTexts(texts);

    for (let j = 0; j < batch.length; j++) {
      const vectorStr = `[${embeddings[j].join(",")}]`;
      await db.execute(sql`
        INSERT INTO knowledge_chunks (content, category, metadata, embedding)
        VALUES (${batch[j].content}, ${batch[j].category}, ${JSON.stringify(batch[j].metadata || {})}::jsonb, ${vectorStr}::vector)
      `);
      inserted++;
    }

    console.log(`[rag] Seeded ${inserted}/${chunks.length} chunks`);
  }

  return inserted;
}
