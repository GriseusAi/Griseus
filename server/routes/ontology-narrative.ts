/**
 * L4 Narratives — Canlı Ekosistem Açıklama Katmanı
 *
 * Her ontology object'i (bileşen/yarı mamül/alt parça/cihaz) için 2-3 TR
 * cümlelik durum açıklaması. Opus 4.6 synthesizer olarak kullanılır.
 * In-memory cache 10 dk TTL; API key yoksa deterministik template fallback.
 *
 * GET  /api/ontology/narrative/:code?sku=BH.50ST.SV
 * POST /api/ontology/narrative/:code/regenerate  → force refresh
 */

import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getBomWithStock } from "./bom";
import { db } from "../db";
import { componentStock, bomItems } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

const router = Router();

interface NarrativePayload {
  text: string;
  generatedAt: string;
  source: "ai" | "template" | "cache";
  model?: string;
}

const NARRATIVE_TTL_MS = 10 * 60 * 1000; // 10 dk
const cache = new Map<string, NarrativePayload>();

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}

/* ── Context collection — Narrative için gerekli tüm veri ── */
async function collectContext(code: string, sku?: string) {
  // Component stock + genel bilgi
  const [stockRow] = await db
    .select()
    .from(componentStock)
    .where(eq(componentStock.componentCode, code))
    .limit(1);

  // Bu kod hangi BH/ürünlerde kullanılıyor
  const bomRows = await db
    .select({
      parentSku: bomItems.parentProductSku,
      requiredQty: bomItems.requiredQuantity,
      tier: bomItems.tier,
      name: bomItems.componentName,
    })
    .from(bomItems)
    .where(eq(bomItems.componentCode, code));

  // Stock movement history (son 7 giriş/çıkış)
  const movements = await db.execute(sql`
    SELECT movement_type, quantity, created_at
    FROM stock_movements_v2
    WHERE component_code = ${code}
    ORDER BY created_at DESC
    LIMIT 7
  `);

  // Eğer sku verilmişse, o SKU'nun BOM context'inde bulma
  let contextSku = sku;
  let siblingBhStatus: Array<{ sku: string; max: number }> = [];
  if (!contextSku && bomRows.length > 0) {
    contextSku = bomRows[0].parentSku;
  }

  // BH ailesi için 4 cihazın durumunu topla (cross-product context)
  if (contextSku?.startsWith("BH.")) {
    const BH_SKUS = ["BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV"];
    for (const bhSku of BH_SKUS) {
      try {
        const items = await getBomWithStock(bhSku);
        const targetItem = items.find(i => i.code === code);
        if (targetItem) {
          // Bu bileşenden kaç BH üretilebilir?
          const maxProducts = targetItem.requiredQty > 0
            ? Math.floor(targetItem.currentStock / targetItem.requiredQty)
            : 0;
          siblingBhStatus.push({ sku: bhSku, max: maxProducts });
        }
      } catch {}
    }
  }

  return {
    code,
    name: bomRows[0]?.name || stockRow?.componentCode || code,
    currentStock: stockRow ? parseFloat(stockRow.currentStock as any) : 0,
    unit: stockRow?.unit || "AD",
    usedInProducts: bomRows.map(r => ({
      sku: r.parentSku,
      tier: r.tier,
      requiredQty: parseFloat(r.requiredQty as any),
    })),
    recentMovements: (movements.rows as any[]).map(r => ({
      type: r.movement_type,
      qty: r.quantity,
      at: r.created_at,
    })),
    siblingBhStatus,
    lastCountedAt: stockRow?.lastCountedAt,
  };
}

/* ── Deterministic template (fallback) ── */
function buildTemplateNarrative(ctx: Awaited<ReturnType<typeof collectContext>>): string {
  const usedByCount = ctx.usedInProducts.length;
  const usedBySkus = ctx.usedInProducts.map(p => p.sku).slice(0, 3).join(", ");
  const minBh = ctx.siblingBhStatus.length > 0
    ? ctx.siblingBhStatus.reduce((a, b) => a.max < b.max ? a : b)
    : null;

  const parts: string[] = [];

  // Cümle 1: stok + kullanım
  parts.push(
    `${ctx.code} (${ctx.name}) şu an ${ctx.currentStock} ${ctx.unit} stokta. ` +
    `${usedByCount} üründe${usedByCount > 0 ? ` (${usedBySkus}${usedByCount > 3 ? "…" : ""})` : ""} kullanılıyor.`
  );

  // Cümle 2: darboğaz varsa
  if (minBh && minBh.max < 20) {
    parts.push(
      `Bu stok seviyesi ${minBh.sku} cihazı için kritik: sadece ${minBh.max} adet üretilebilir durumda.`
    );
  } else if (minBh) {
    parts.push(
      `Bu bileşen şu an BH ailesi için darboğaz değil; en kısıtlı cihaz ${minBh.sku} max ${minBh.max} adet üretebiliyor.`
    );
  }

  // Cümle 3: son hareket
  if (ctx.recentMovements.length > 0) {
    const last = ctx.recentMovements[0];
    parts.push(`Son hareket: ${last.type} ${last.qty} ${ctx.unit}.`);
  }

  return parts.join(" ");
}

/* ── AI narrative (Opus 4.6) ── */
async function buildAiNarrative(ctx: Awaited<ReturnType<typeof collectContext>>): Promise<string | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;

  const contextJson = JSON.stringify(ctx, null, 2);
  const prompt = `Aşağıdaki HVAC üretim bileşeni için 2-3 cümlelik Türkçe operasyonel durum açıklaması yaz.

VERİ:
${contextJson}

KURALLAR:
- Türkçe, fabrika/saha dilinde (teknik ama anlaşılır)
- Önce durum (stok + günlük tüketim), sonra sonuç (hangi BH'yi nasıl etkiliyor), varsa öneri
- Sayıları veriden AYNEN kullan, uydurmak YASAK
- Maksimum 3 kısa cümle, toplam 300 karakteri aşma
- Hiçbir şekilde "bu bileşen önemlidir" gibi içi boş cümle kurma
- Varsa kritik darboğaz/paylaşım durumunu vurgula

SADECE narrative metnini döndür, başlık/açıklama/JSON yok.`;

  try {
    const model = process.env.NARRATIVE_MODEL ?? "claude-opus-4-6";
    const response = await anthropic.messages.create({
      model,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b: any) => b.type === "text") as { type: "text"; text: string } | undefined;
    return textBlock?.text.trim() || null;
  } catch (err: any) {
    console.error("[narrative] Opus call failed:", err.message);
    return null;
  }
}

/* ── GET /api/ontology/narrative/:code ── */
router.get("/narrative/:code", async (req: Request, res: Response) => {
  const code = String(req.params.code);
  const sku = (req.query.sku as string) || undefined;
  const cacheKey = `${code}::${sku || "_"}`;

  // Cache check
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - new Date(cached.generatedAt).getTime() < NARRATIVE_TTL_MS) {
    return res.json({ ...cached, source: "cache" });
  }

  try {
    const ctx = await collectContext(code, sku);

    // AI first, fallback to template
    let text = await buildAiNarrative(ctx);
    let source: "ai" | "template" = "ai";
    let model: string | undefined = process.env.NARRATIVE_MODEL ?? "claude-opus-4-6";

    if (!text) {
      text = buildTemplateNarrative(ctx);
      source = "template";
      model = undefined;
    }

    const payload: NarrativePayload = {
      text,
      generatedAt: new Date().toISOString(),
      source,
      model,
    };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err: any) {
    console.error("[narrative] error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/ontology/narrative/:code/regenerate — cache bypass ── */
router.post("/narrative/:code/regenerate", async (req: Request, res: Response) => {
  const code = String(req.params.code);
  const sku = (req.query.sku as string) || (req.body?.sku as string) || undefined;
  const cacheKey = `${code}::${sku || "_"}`;
  cache.delete(cacheKey);

  try {
    const ctx = await collectContext(code, sku);
    let text = await buildAiNarrative(ctx);
    let source: "ai" | "template" = "ai";
    let model: string | undefined = process.env.NARRATIVE_MODEL ?? "claude-opus-4-6";

    if (!text) {
      text = buildTemplateNarrative(ctx);
      source = "template";
      model = undefined;
    }

    const payload: NarrativePayload = {
      text,
      generatedAt: new Date().toISOString(),
      source,
      model,
    };
    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err: any) {
    console.error("[narrative] regen error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
