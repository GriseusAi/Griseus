/**
 * Agent Decision Memory (ADM)
 *
 * gix'in karar hafızası — geçmiş etkileşimlerden öğrenir.
 *
 * Her sohbet:
 *   1. Sorgu embedding'i çıkarılır (Voyage AI)
 *   2. Benzer geçmiş kararlar bulunur (pgvector cosine similarity)
 *   3. Kalite filtresi uygulanır (tool kullanımı, outcome bağlantısı, decay)
 *   4. En iyi eşleşmeler system prompt'a enjekte edilir
 *
 * Kalite skoru:
 *   quality = tool_weight × outcome_weight × recency_weight
 *   - tool_weight: 0 tool = 0.1, 1-2 tool = 0.5, 3+ tool = 1.0
 *   - outcome_weight: outcome bağlı + doğru = 1.0, bağlı + yanlış = 0.2, bağsız = 0.5
 *   - recency_weight: decay_weight (zamanla azalır)
 */
import { db } from "../db";
import { agentMemory } from "@shared/schema";
import { eq, sql, desc, and, gt } from "drizzle-orm";
import { embedQuery } from "../rag";

// ══════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════

/** Minimum tool sayısı — bunun altındaki etkileşimler düşük kaliteli */
const MIN_TOOLS_FOR_QUALITY = 1;

/** Minimum kalite skoru — bunun altındakiler context'e enjekte edilmez */
const MIN_QUALITY_FOR_INJECTION = 0.3;

/** Kaç benzer hafıza enjekte edilsin */
const TOP_K_MEMORIES = 3;

/** Minimum benzerlik eşiği (cosine similarity) */
const MIN_SIMILARITY = 0.45;

/** Decay half-life (gün) — bu kadar gün sonra ağırlık yarıya düşer */
const DECAY_HALF_LIFE_DAYS = 30;

/** Maximum context injection uzunluğu (karakter) */
const MAX_CONTEXT_LENGTH = 1500;

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export interface MemoryRecord {
  queryText: string;
  queryCategory?: string;
  toolsUsed: string[];
  recommendationMade?: string;
  responseLength: number;
  tenantId?: string;
}

export interface RelevantMemory {
  memoryId: string;
  queryText: string;
  queryCategory: string | null;
  toolsUsed: string[];
  recommendationMade: string | null;
  userAction: string | null;
  qualityScore: number;
  similarity: number;
  daysAgo: number;
}

// ══════════════════════════════════════════════════════════
// CORE: HAFIZA KAYIT
// ══════════════════════════════════════════════════════════

/** Yeni etkileşimi hafızaya kaydet — her agent chat sonrası çağrılır */
export async function recordMemory(record: MemoryRecord): Promise<string | null> {
  const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Kalite filtresi: çok kısa veya tool kullanılmayan sohbetlere düşük skor
  const qualityScore = computeQualityScore(record.toolsUsed.length, record.responseLength);

  // Çok düşük kaliteli etkileşimleri kaydetme bile
  if (qualityScore < 0.1) return null;

  try {
    // Embedding çıkar (fire-and-forget değil — bekle)
    const embedding = await embedQuery(record.queryText);
    const vectorStr = `[${embedding.join(",")}]`;

    await db.execute(sql`
      INSERT INTO agent_memory (
        memory_id, tenant_id, query_text, query_category,
        query_embedding, tools_used, tool_count,
        recommendation_made, response_length, quality_score
      ) VALUES (
        ${memoryId}, ${record.tenantId ?? "cukurova"}, ${record.queryText},
        ${record.queryCategory ?? null},
        ${vectorStr}::vector, ${JSON.stringify(record.toolsUsed)}::jsonb,
        ${record.toolsUsed.length},
        ${record.recommendationMade ?? null}, ${record.responseLength},
        ${qualityScore}
      )
    `);

    return memoryId;
  } catch (err) {
    console.error("[ADM] Record memory error:", err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// CORE: BENZER HAFIZA GETİRME
// ══════════════════════════════════════════════════════════

/**
 * Mevcut sorguya en benzer kaliteli hafızaları getir.
 * System prompt'a enjekte edilecek context üretir.
 */
export async function recallRelevantMemories(
  query: string,
  tenantId: string = "cukurova",
): Promise<{ memories: RelevantMemory[]; contextBlock: string }> {
  try {
    const queryEmbedding = await embedQuery(query);
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    // pgvector cosine similarity + kalite filtresi + decay
    const rows = await db.execute(sql`
      SELECT
        memory_id,
        query_text,
        query_category,
        tools_used,
        recommendation_made,
        user_action,
        quality_score,
        decay_weight,
        created_at,
        1 - (query_embedding <=> ${vectorStr}::vector) as similarity,
        EXTRACT(DAY FROM NOW() - created_at) as days_ago
      FROM agent_memory
      WHERE tenant_id = ${tenantId}
        AND query_embedding IS NOT NULL
        AND quality_score >= ${MIN_QUALITY_FOR_INJECTION}
        AND 1 - (query_embedding <=> ${vectorStr}::vector) >= ${MIN_SIMILARITY}
      ORDER BY
        (1 - (query_embedding <=> ${vectorStr}::vector)) * quality_score::float * decay_weight::float DESC
      LIMIT ${TOP_K_MEMORIES}
    `);

    const memories: RelevantMemory[] = (rows.rows as any[]).map(r => ({
      memoryId: r.memory_id,
      queryText: r.query_text,
      queryCategory: r.query_category,
      toolsUsed: r.tools_used ?? [],
      recommendationMade: r.recommendation_made,
      userAction: r.user_action,
      qualityScore: parseFloat(r.quality_score),
      similarity: parseFloat(r.similarity),
      daysAgo: Math.round(parseFloat(r.days_ago ?? "0")),
    }));

    // Context block oluştur
    const contextBlock = buildContextBlock(memories);

    return { memories, contextBlock };
  } catch (err) {
    console.error("[ADM] Recall error:", err);
    return { memories: [], contextBlock: "" };
  }
}

// ══════════════════════════════════════════════════════════
// KULLANICI AKSİYONU GÜNCELLEME
// ══════════════════════════════════════════════════════════

/** Kullanıcı bir öneriye ne yaptı? */
export async function updateUserAction(
  memoryId: string,
  action: "applied" | "ignored" | "modified" | "asked_more",
): Promise<void> {
  // Kalite skorunu aksiyona göre güncelle
  const actionMultiplier: Record<string, number> = {
    applied: 1.5,    // uygulandı → kalite artır
    modified: 1.2,   // değiştirildi → biraz artır
    asked_more: 1.0, // daha fazla sordu → nötr
    ignored: 0.5,    // görmezden geldi → kalite düşür
  };

  const multiplier = actionMultiplier[action] ?? 1.0;

  await db.execute(sql`
    UPDATE agent_memory
    SET user_action = ${action},
        action_timestamp = NOW(),
        quality_score = LEAST(1.0, quality_score::float * ${multiplier})
    WHERE memory_id = ${memoryId}
  `).catch(err => console.error("[ADM] Update action error:", err));
}

// ══════════════════════════════════════════════════════════
// DECAY — zamanla ağırlık azaltma
// ══════════════════════════════════════════════════════════

/** Tüm hafızaların decay_weight'ini güncelle — periyodik çağrılır */
export async function applyDecay(): Promise<void> {
  try {
    // decay = 0.5 ^ (days_since_creation / half_life)
    await db.execute(sql`
      UPDATE agent_memory
      SET decay_weight = POWER(0.5, EXTRACT(DAY FROM NOW() - created_at) / ${DECAY_HALF_LIFE_DAYS})
      WHERE decay_weight > 0.01
    `);
  } catch (err) {
    console.error("[ADM] Decay error:", err);
  }
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

/** Kalite skoru hesapla */
function computeQualityScore(toolCount: number, responseLength: number): number {
  // Tool ağırlığı: operasyonel derinlik
  const toolWeight = toolCount === 0 ? 0.1
    : toolCount <= 2 ? 0.5
    : 1.0;

  // Cevap uzunluğu ağırlığı: çok kısa → test/selamlama
  const lengthWeight = responseLength < 50 ? 0.1
    : responseLength < 200 ? 0.3
    : responseLength < 500 ? 0.7
    : 1.0;

  return Math.round(toolWeight * lengthWeight * 100) / 100;
}

/** Hafızalardan context block oluştur */
function buildContextBlock(memories: RelevantMemory[]): string {
  if (memories.length === 0) return "";

  const parts: string[] = [];
  let totalLen = 0;

  for (const mem of memories) {
    const actionLabel = mem.userAction
      ? ` → kullanıcı: ${mem.userAction}`
      : "";
    const tools = mem.toolsUsed.length > 0
      ? ` [${mem.toolsUsed.slice(0, 3).join(", ")}]`
      : "";

    let entry = `• ${mem.daysAgo}g önce benzer soru: "${truncate(mem.queryText, 80)}"${tools}`;
    if (mem.recommendationMade) {
      entry += `\n  Öneri: ${truncate(mem.recommendationMade, 120)}${actionLabel}`;
    }

    if (totalLen + entry.length > MAX_CONTEXT_LENGTH) break;
    parts.push(entry);
    totalLen += entry.length;
  }

  if (parts.length === 0) return "";

  return `\n═══ GEÇMİŞ KARARLAR (ADM) ═══\n${parts.join("\n")}\n═══════════════════════════════`;
}

/** Metni kırp */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
