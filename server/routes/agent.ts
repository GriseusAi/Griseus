import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { stockLevels, stockMovementsV2, products } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { getBomWithStock, computeProductionCapacity, computeSubAssemblyCapacity } from "./bom";

const router = Router();

// ══════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Stock Intelligence focused
// ══════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Sen Çukurova Isı Sistemleri'nin Stok İstihbarat Danışmanısın. Griseus platformuna bağlısın.

ÖNEMLI: Sana verilen tool'ları KULLAN. Cevap vermeden önce ilgili veriyi tool ile çek. Tahmini veya genel cevap verme.

TEMEL KURALLAR:
1. Her zaman tool ile GERÇEK VERİ çek, sonra cevap ver. Tahmin yapma.
2. Türkçe konuş, teknik terimleri de Türkçe kullan.
3. Somut rakamlar ver — ürün adı, stok miktarı, bileşen kodu, darboğaz bilgisi.
4. Aksiyon öner — "brülör montajla", "reflektör tutucu sipariş et" gibi somut tavsiyeler.
5. Sorulmadıkça genel bilgi verme, her cevabı Çukurova'ya özel tut.

ŞİRKET PROFİLİ:
- 30+ yıllık HVAC üreticisi, ~34.000 adet/yıl, 40+ SKU
- Şu an ELT.7-11 (Goldsun Elite Radyant Isıtıcı) üzerinde BOM bazlı stok istihbaratı aktif
- 43 bileşen, 1 yarı mamül (Brülör), 5 alt bileşen

TOOL KULLANIM KURALLARI:
- "depoda ne var", "anlık stok", "canlı stok" → get_live_stock_levels kullan
- "hareket geçmişi", "son hareketler", "kim ne yaptı" → get_stock_movement_history kullan
- "sipariş gelse karşılayabilir miyiz", "yeter mi" → simulate_order_fulfillment kullan
- "uyarılar", "kritik stok", "stok alarmı" → check_stock_alerts kullan
- "kaç adet üretebiliriz", "üretim kapasitesi", "darboğaz" → get_production_capacity kullan
- "100 adet üretebilir miyiz", "ne lazım" → simulate_production kullan
- "reçete", "BOM", "bileşenler", "parça listesi" → get_bom_tree kullan
- Birden fazla tool çağırabilirsin — önce veri çek, sonra analiz et.

FORMAT:
- Başlıklar için ## kullan, önemli sayıları **kalın** yaz
- Her cevabın sonunda 1 somut öneri veya soru sor`;

// ══════════════════════════════════════════════════════════════════════
// TOOLS — 7 stock intelligence tools
// ══════════════════════════════════════════════════════════════════════

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_live_stock_levels",
    description: "Canlı stok durumu. Tüm ürünlerin üretimde, depoda ve satılan miktarlarını getirir.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: {
          type: "string",
          description: "Ürün kodu veya adı ile filtrele. Boş bırakılırsa tüm ürünler döner.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_stock_movement_history",
    description: "Stok hareket geçmişi. Son hareketleri getirir: üretim, transfer, satış, geri alma.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: { type: "string", description: "Ürün kodu ile filtrele. Boş = tüm ürünler." },
        movement_type: {
          type: "string",
          enum: ["produced", "to_warehouse", "to_sales", "raw_material_in", "undo", "inventory_count"],
          description: "Hareket tipi filtresi.",
        },
        limit: { type: "number", description: "Kaç kayıt (varsayılan 30, max 100)" },
      },
      required: [],
    },
  },
  {
    name: "simulate_order_fulfillment",
    description: "Sipariş simülasyonu. Belirli ürün ve miktarda sipariş karşılanabilir mi hesaplar.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: { type: "string", description: "Ürün kodu (ör: 'BH55', 'ELT.7-11')" },
        quantity: { type: "number", description: "Sipariş miktarı (adet)" },
      },
      required: ["product_code", "quantity"],
    },
  },
  {
    name: "check_stock_alerts",
    description: "Stok uyarıları. Depoda 0 olan veya kritik düşük stoklu ürünleri tespit eder.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_production_capacity",
    description: "BOM bazlı üretim kapasitesi. Mevcut bileşen stokları ile kaç adet ürün üretilebileceğini ve darboğazları hesaplar.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: { type: "string", description: "Ürün kodu (varsayılan: 'ELT.7-11')" },
      },
      required: [],
    },
  },
  {
    name: "simulate_production",
    description: "Üretim simülasyonu. Belirli miktarda ürün için gereken malzemeleri, eksikleri ve yeterliliği hesaplar.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: { type: "string", description: "Ürün kodu (varsayılan: 'ELT.7-11')" },
        quantity: { type: "number", description: "Kaç adet üretilmek isteniyor" },
      },
      required: ["quantity"],
    },
  },
  {
    name: "get_bom_tree",
    description: "Ürün ağacını getir. Tüm bileşenleri, miktarlarını, stoklarını ve tier yapısını döner.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: { type: "string", description: "Ürün kodu (varsayılan: 'ELT.7-11')" },
      },
      required: [],
    },
  },
];

// ══════════════════════════════════════════════════════════════════════
// TOOL EXECUTION
// ══════════════════════════════════════════════════════════════════════

async function callTool(toolName: string, input: Record<string, any>): Promise<any> {
  switch (toolName) {
    case "get_live_stock_levels": {
      const rows = await db
        .select({
          productSku: products.sku,
          productName: products.name,
          productCategory: products.category,
          inProduction: stockLevels.inProduction,
          inWarehouse: stockLevels.inWarehouse,
          totalSold: stockLevels.totalSold,
          updatedAt: stockLevels.updatedAt,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      let filtered = rows;
      if (input.product_code) {
        const code = input.product_code.toLowerCase();
        filtered = rows.filter(r =>
          (r.productSku || "").toLowerCase().includes(code) ||
          (r.productName || "").toLowerCase().includes(code)
        );
      }

      return {
        products: filtered.map(r => ({
          sku: r.productSku, name: r.productName, category: r.productCategory,
          in_production: r.inProduction, in_warehouse: r.inWarehouse,
          total_sold: r.totalSold, total_available: r.inProduction + r.inWarehouse,
        })),
        count: filtered.length,
        summary: {
          total_in_production: filtered.reduce((s, r) => s + r.inProduction, 0),
          total_in_warehouse: filtered.reduce((s, r) => s + r.inWarehouse, 0),
        },
      };
    }

    case "get_stock_movement_history": {
      const limit = Math.min(input.limit || 30, 100);
      let productId: number | null = null;

      if (input.product_code) {
        const code = input.product_code.toLowerCase();
        const allProducts = await db.select().from(products);
        const match = allProducts.find(p =>
          (p.sku || "").toLowerCase().includes(code) ||
          (p.name || "").toLowerCase().includes(code)
        );
        if (!match) return { error: `Ürün bulunamadı: "${input.product_code}"` };
        productId = match.id;
      }

      const conditions = [];
      if (productId) conditions.push(eq(stockMovementsV2.productId, productId));
      if (input.movement_type) conditions.push(eq(stockMovementsV2.movementType, input.movement_type));

      let query = db
        .select({
          id: stockMovementsV2.id, productSku: products.sku, productName: products.name,
          movementType: stockMovementsV2.movementType, quantity: stockMovementsV2.quantity,
          note: stockMovementsV2.note, createdBy: stockMovementsV2.createdBy,
          createdAt: stockMovementsV2.createdAt,
        })
        .from(stockMovementsV2)
        .innerJoin(products, eq(stockMovementsV2.productId, products.id))
        .orderBy(desc(stockMovementsV2.createdAt))
        .limit(limit);

      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      const rows = await query;

      const typeLabels: Record<string, string> = {
        produced: "Üretildi", to_warehouse: "Depoya Transfer", to_sales: "Satışa Çıktı",
        raw_material_in: "Hammadde Girişi", undo: "Geri Alma", inventory_count: "Sayım",
      };

      return {
        movements: rows.map(r => ({
          sku: r.productSku, product_name: r.productName,
          type: r.movementType, type_label: typeLabels[r.movementType] || r.movementType,
          quantity: r.quantity, note: r.note, created_by: r.createdBy, created_at: r.createdAt,
        })),
        count: rows.length,
      };
    }

    case "simulate_order_fulfillment": {
      const code = (input.product_code || "").toLowerCase();
      const orderQty = input.quantity;
      if (!code || !orderQty) return { error: "product_code ve quantity gerekli" };

      const rows = await db
        .select({
          productSku: products.sku, productName: products.name,
          inProduction: stockLevels.inProduction, inWarehouse: stockLevels.inWarehouse,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      const match = rows.find(r =>
        (r.productSku || "").toLowerCase().includes(code) ||
        (r.productName || "").toLowerCase().includes(code)
      );
      if (!match) return { error: `Ürün bulunamadı: "${input.product_code}"` };

      const canFromWarehouse = match.inWarehouse >= orderQty;
      const deficit = Math.max(0, orderQty - match.inWarehouse);
      const canWithProduction = (match.inWarehouse + match.inProduction) >= orderQty;
      const totalDeficit = Math.max(0, orderQty - match.inWarehouse - match.inProduction);

      return {
        product: { sku: match.productSku, name: match.productName },
        order_quantity: orderQty,
        warehouse_stock: match.inWarehouse, production_stock: match.inProduction,
        can_fulfill_from_warehouse: canFromWarehouse,
        can_fulfill_with_production_transfer: canWithProduction,
        warehouse_deficit: deficit, total_deficit: totalDeficit,
        recommendation: canFromWarehouse
          ? `Sipariş karşılanabilir. Depoda ${match.inWarehouse} adet mevcut.`
          : canWithProduction
            ? `Depo yetersiz (${match.inWarehouse}). Üretimden ${deficit} adet transfer edilirse karşılanır.`
            : `Karşılanamaz. Toplam: ${match.inWarehouse + match.inProduction}, eksik: ${totalDeficit}. Yeni üretim gerekli.`,
      };
    }

    case "check_stock_alerts": {
      const rows = await db
        .select({
          productSku: products.sku, productName: products.name,
          inProduction: stockLevels.inProduction, inWarehouse: stockLevels.inWarehouse,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      const alerts: any[] = [];
      for (const r of rows) {
        if (r.inWarehouse === 0 && r.inProduction === 0) {
          alerts.push({ sku: r.productSku, name: r.productName, severity: "critical",
            message: `${r.productSku} — Stok yok! Acil üretim gerekli.` });
        } else if (r.inWarehouse === 0 && r.inProduction > 0) {
          alerts.push({ sku: r.productSku, name: r.productName, severity: "high",
            message: `${r.productSku} — Depoda 0, üretimde ${r.inProduction} bekliyor. Transfer et.` });
        } else if (r.inWarehouse > 0 && r.inWarehouse <= 5) {
          alerts.push({ sku: r.productSku, name: r.productName, severity: "medium",
            message: `${r.productSku} — Depoda sadece ${r.inWarehouse} adet. Takviye önerilir.` });
        }
      }
      const sev: Record<string, number> = { critical: 0, high: 1, medium: 2 };
      alerts.sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3));

      return { alerts, alert_count: alerts.length,
        summary: { critical: alerts.filter(a => a.severity === "critical").length,
          high: alerts.filter(a => a.severity === "high").length,
          medium: alerts.filter(a => a.severity === "medium").length } };
    }

    case "get_production_capacity": {
      const sku = input.sku || "ELT.7-11";
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      const capacity = computeProductionCapacity(items);
      return {
        product: sku, maxProducible: capacity.maxProducible,
        bottlenecks: capacity.bottlenecks.slice(0, 10),
        subAssemblyStatus: capacity.subAssemblyStatus, total_components: items.length,
      };
    }

    case "simulate_production": {
      const sku = input.sku || "ELT.7-11";
      const quantity = input.quantity || 100;
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      const capacity = computeProductionCapacity(items);
      const canProduce = capacity.maxProducible >= quantity;
      const shortages: any[] = [];
      const materialsNeeded: any[] = [];
      for (const item of items.filter(i => i.tier === 1 || i.tier === 2)) {
        const need = item.requiredQty * quantity;
        let effectiveStock = item.currentStock;
        let mustAssemble: number | undefined;
        if (item.tier === 2) {
          const sub = computeSubAssemblyCapacity(item.code, items);
          effectiveStock = item.currentStock + sub.producible;
          if (item.currentStock < need) mustAssemble = Math.min(need - item.currentStock, sub.producible);
        }
        const remaining = effectiveStock - need;
        materialsNeeded.push({ code: item.code, name: item.name, need, have: effectiveStock, remaining, mustAssemble });
        if (remaining < 0) shortages.push({ code: item.code, name: item.name, need, have: effectiveStock, shortage: Math.abs(remaining) });
      }
      materialsNeeded.sort((a: any, b: any) => a.remaining - b.remaining);
      return { product: sku, requestedQuantity: quantity, canProduce,
        maxProducible: capacity.maxProducible, shortages,
        materialsNeeded: materialsNeeded.slice(0, 15), subAssemblyStatus: capacity.subAssemblyStatus };
    }

    case "get_bom_tree": {
      const sku = input.sku || "ELT.7-11";
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      return {
        product: sku, totalComponents: items.length,
        directMaterials: items.filter(i => i.tier === 1).map(i => ({
          code: i.code, name: i.name, requiredQty: i.requiredQty, unit: i.unit, stock: i.currentStock,
        })),
        subAssemblies: items.filter(i => i.tier === 2).map(sa => ({
          code: sa.code, name: sa.name, requiredQty: sa.requiredQty, unit: sa.unit, stock: sa.currentStock,
          children: items.filter(i => i.parentComponentCode === sa.code).map(c => ({
            code: c.code, name: c.name, requiredQty: c.requiredQty, unit: c.unit, stock: c.currentStock,
          })),
        })),
      };
    }

    default:
      return { error: `Bilinmeyen tool: ${toolName}` };
  }
}

// ══════════════════════════════════════════════════════════════════════
// CHAT ENDPOINT
// ══════════════════════════════════════════════════════════════════════

router.post("/agent/chat", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "API key eksik. ANTHROPIC_API_KEY ortam değişkenini yapılandırın." });
    }

    const { message, history } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
    };

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message alanı gereklidir." });
    }

    const client = new Anthropic({ apiKey });

    // Filter out empty/invalid history entries and ensure alternating roles
    const cleanHistory = (history || []).filter(
      (h) => h.content && typeof h.content === "string" && h.content.trim().length > 0
    );
    const messages: Anthropic.MessageParam[] = [
      ...cleanHistory.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    const toolsUsed: string[] = [];

    let response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Tool-use loop (max 10 iterations)
    let iterations = 0;
    while (response.stop_reason === "tool_use" && iterations < 10) {
      iterations++;
      const assistantContent = response.content;
      const toolUseBlocks = assistantContent.filter(
        (b): b is Anthropic.ContentBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        toolsUsed.push(toolBlock.name);
        try {
          const result = await callTool(toolBlock.name, toolBlock.input as Record<string, any>);
          toolResults.push({ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify(result) });
        } catch (err: any) {
          toolResults.push({ type: "tool_result", tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: err.message || "Tool execution failed" }), is_error: true });
        }
      }

      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const responseText = textBlock && "text" in textBlock ? textBlock.text : "Cevap üretilemedi.";

    res.json({ response: responseText, tools_used: toolsUsed });
  } catch (err: any) {
    console.error("[agent/chat] Error:", err.status, err.message, err.error?.message);
    const msg = err.error?.message || err.message || "AI Agent hatası";
    res.status(err.status || 500).json({ error: msg });
  }
});

export default router;
