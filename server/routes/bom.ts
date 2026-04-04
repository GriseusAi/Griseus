import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { bomItems, componentStock } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { broadcastStockUpdate, broadcastProactiveAlert, broadcastImpactPropagation } from "../ws";
import { evaluateRules } from "../rules-engine";
import { computeImpactPropagation, takePreSnapshot } from "../lib/impact-engine";

const router = Router();

// ── Helpers ──

interface BomRow {
  code: string;
  name: string;
  requiredQty: number;
  unit: string;
  tier: number;
  parentComponentCode: string | null;
  currentStock: number;
}

async function getBomWithStock(sku: string): Promise<BomRow[]> {
  const rows = await db
    .select({
      code: bomItems.componentCode,
      name: bomItems.componentName,
      requiredQty: bomItems.requiredQuantity,
      unit: bomItems.unit,
      tier: bomItems.tier,
      parentComponentCode: bomItems.parentComponentCode,
      currentStock: componentStock.currentStock,
    })
    .from(bomItems)
    .leftJoin(componentStock, eq(bomItems.componentCode, componentStock.componentCode))
    .where(eq(bomItems.parentProductSku, sku));

  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    requiredQty: parseFloat(r.requiredQty as string),
    unit: r.unit,
    tier: r.tier,
    parentComponentCode: r.parentComponentCode,
    currentStock: r.currentStock ? parseFloat(r.currentStock as string) : 0,
  }));
}

function computeSubAssemblyCapacity(
  subAssemblyCode: string,
  allItems: BomRow[]
): { producible: number; bottleneck: string; parts: Array<{ code: string; name: string; stock: number; required: number; maxProducts: number }> } {
  const parts = allItems.filter((i) => i.parentComponentCode === subAssemblyCode);
  if (parts.length === 0) return { producible: 0, bottleneck: "alt bileşen yok", parts: [] };

  const partDetails = parts.map((p) => {
    const maxProducts = p.requiredQty > 0 ? Math.floor(p.currentStock / p.requiredQty) : Infinity;
    return { code: p.code, name: p.name, stock: p.currentStock, required: p.requiredQty, maxProducts };
  });

  const minPart = partDetails.reduce((a, b) => (a.maxProducts < b.maxProducts ? a : b));
  return {
    producible: minPart.maxProducts,
    bottleneck: `${minPart.code} — ${minPart.name} (${minPart.maxProducts} adet)`,
    parts: partDetails,
  };
}

function computeProductionCapacity(allItems: BomRow[]) {
  const tier1and2 = allItems.filter((i) => i.tier === 1 || i.tier === 2);
  const bottlenecks: Array<{
    code: string; name: string; tier: number; stock: number;
    required: number; maxProducts: number; note?: string;
    reasoning?: Array<{ order: number; cause: string; data?: Record<string, number | string> }>;
  }> = [];

  const subAssemblyStatus: Record<string, any> = {};
  let maxProducible = Infinity;

  for (const item of tier1and2) {
    let effectiveStock = item.currentStock;
    let note: string | undefined;

    if (item.tier === 2) {
      const sub = computeSubAssemblyCapacity(item.code, allItems);
      const totalAvailable = item.currentStock + sub.producible;
      effectiveStock = totalAvailable;
      note = `YARI MAMÜL — alt bileşenlerden ${sub.producible} adet üretilebilir`;
      subAssemblyStatus[item.code] = {
        name: item.name,
        currentStock: item.currentStock,
        producibleFromParts: sub.producible,
        partBottleneck: sub.bottleneck,
        parts: sub.parts,
      };
    }

    const maxProducts = item.requiredQty > 0
      ? Math.floor(effectiveStock / item.requiredQty)
      : Infinity;

    const reasoning: Array<{ order: number; cause: string; data?: Record<string, number | string> }> = [
      { order: 1, cause: `${item.code} ${item.name} analiz edildi`, data: { tier: item.tier } },
      { order: 2, cause: `Efektif stok: ${effectiveStock} adet${item.tier === 2 ? ` (DB: ${item.currentStock} + alt bileşenlerden monte: ${effectiveStock - item.currentStock})` : ""}`, data: { effectiveStock, rawStock: item.currentStock } },
      { order: 3, cause: `Birim başına gerekli: ${item.requiredQty} adet`, data: { required: item.requiredQty } },
      { order: 4, cause: `Maksimum üretilebilir: ${maxProducts} = ⌊${effectiveStock} / ${item.requiredQty}⌋`, data: { maxProducts } },
    ];

    bottlenecks.push({
      code: item.code,
      name: item.name,
      tier: item.tier,
      stock: item.currentStock,
      required: item.requiredQty,
      maxProducts,
      note,
      reasoning,
    });

    if (maxProducts < maxProducible) {
      maxProducible = maxProducts;
    }
  }

  // Sort by maxProducts ascending (worst bottlenecks first)
  bottlenecks.sort((a, b) => a.maxProducts - b.maxProducts);

  return {
    maxProducible: maxProducible === Infinity ? 0 : maxProducible,
    bottlenecks: bottlenecks.slice(0, 10),
    allBottlenecks: bottlenecks,
    subAssemblyStatus,
  };
}

// ── GET /api/bom/:sku — BOM ağacını getir ──

router.get("/:sku", async (req: Request, res: Response) => {
  const sku = req.params.sku as string;
  const items = await db
    .select()
    .from(bomItems)
    .where(eq(bomItems.parentProductSku, sku));

  if (items.length === 0) {
    return res.status(404).json({ error: `BOM bulunamadı: ${sku}` });
  }

  // Build tree structure
  const tier1 = items.filter((i) => i.tier === 1);
  const tier2 = items.filter((i) => i.tier === 2);
  const tier3 = items.filter((i) => i.tier === 3);

  res.json({
    product: sku,
    productName: "Goldsun Elite - Seramik Plakalı Camlı Radyant Isıtıcı - 7/9/11 KW Üç kademeli",
    totalComponents: items.length,
    tree: {
      directMaterials: tier1.map((i) => ({
        code: i.componentCode,
        name: i.componentName,
        quantity: parseFloat(i.requiredQuantity as string),
        unit: i.unit,
      })),
      subAssemblies: tier2.map((sa) => ({
        code: sa.componentCode,
        name: sa.componentName,
        quantity: parseFloat(sa.requiredQuantity as string),
        unit: sa.unit,
        children: tier3
          .filter((c) => c.parentComponentCode === sa.componentCode)
          .map((c) => ({
            code: c.componentCode,
            name: c.componentName,
            quantity: parseFloat(c.requiredQuantity as string),
            unit: c.unit,
          })),
      })),
    },
  });
});

// ── GET /api/bom/:sku/stock — BOM + stok birleşik görünüm ──

router.get("/:sku/stock", async (req: Request, res: Response) => {
  const sku = req.params.sku as string;
  const items = await getBomWithStock(sku);

  if (items.length === 0) {
    return res.status(404).json({ error: `BOM bulunamadı: ${sku}` });
  }

  res.json({
    product: sku,
    components: items.map((i) => {
      // Yarı mamül (tier 2): efektif stok = mevcut + alt bileşenlerden monte edilebilir
      let effectiveStock = i.currentStock;
      if (i.tier === 2) {
        const sub = computeSubAssemblyCapacity(i.code, items);
        effectiveStock = i.currentStock + sub.producible;
      }
      const maxProducts = i.requiredQty > 0 ? Math.floor(effectiveStock / i.requiredQty) : null;
      return {
        code: i.code,
        name: i.name,
        requiredPerUnit: i.requiredQty,
        unit: i.unit,
        tier: i.tier,
        parentComponentCode: i.parentComponentCode,
        currentStock: effectiveStock,
        maxProducts,
        status:
          effectiveStock < 0 ? "critical" :
          maxProducts === null ? "N/A" :
          maxProducts === 0 ? "critical" :
          maxProducts < 50 ? "critical" :
          maxProducts < 150 ? "warning" :
          maxProducts < 400 ? "ok" : "abundant",
      };
    }),
  });
});

// ── GET /api/bom/:sku/production-capacity — kaç ürün üretilebilir + darboğazlar ──

router.get("/:sku/production-capacity", async (req: Request, res: Response) => {
  const sku = req.params.sku as string;
  const items = await getBomWithStock(sku);

  if (items.length === 0) {
    return res.status(404).json({ error: `BOM bulunamadı: ${sku}` });
  }

  const capacity = computeProductionCapacity(items);

  res.json({
    product: sku,
    maxProducible: capacity.maxProducible,
    bottlenecks: capacity.bottlenecks,
    subAssemblyStatus: capacity.subAssemblyStatus,
  });
});

// ── POST /api/component-stock/update — bileşen stok güncelleme ──

router.post("/component-stock/update", async (req: Request, res: Response) => {
  const { componentCode: code, currentStock: stock, countedBy } = req.body;

  if (!code || stock === undefined) {
    return res.status(400).json({ error: "componentCode ve currentStock gerekli" });
  }

  // Impact Engine: snapshot BEFORE mutation
  const preSnapshot = await takePreSnapshot().catch(() => undefined);

  const existing = await db
    .select()
    .from(componentStock)
    .where(eq(componentStock.componentCode, code))
    .limit(1);

  if (existing.length === 0) {
    return res.status(404).json({ error: `Bileşen bulunamadı: ${code}` });
  }

  await db
    .update(componentStock)
    .set({
      currentStock: String(stock),
      lastCountedAt: new Date(),
      lastCountedBy: countedBy || "manual_entry",
      updatedAt: new Date(),
    })
    .where(eq(componentStock.componentCode, code));

  // Broadcast update via WebSocket
  broadcastStockUpdate({
    event: "stock_update",
    productId: 0,
    productSku: code,
    movementType: "component_stock_update",
    quantity: stock,
    stockLevel: { inProduction: 0, inWarehouse: stock, totalSold: 0 },
  });

  // Proactive rules evaluation (fire-and-forget)
  evaluateRules({ type: "component_stock_update", componentCode: code })
    .then(alerts => { if (alerts.length > 0) broadcastProactiveAlert({ event: "proactive_alert", alerts }); })
    .catch(err => console.error("[rules-engine]", err));

  // Impact Propagation (fire-and-forget)
  computeImpactPropagation({
    type: "component_stock_update", actor: "manuel_güncelleme",
    detail: `${code} bileşen stoku: ${stock} adet olarak güncellendi`,
    componentCodes: [code],
  }, preSnapshot)
    .then(impacts => { if (impacts.length > 0) broadcastImpactPropagation({ event: "impact_propagation", impacts }); })
    .catch(err => console.error("[impact-engine]", err));

  res.json({ success: true, componentCode: code, newStock: stock });
});

// ── GET /api/bom/:sku/simulate?quantity=100 — üretim simülasyonu ──

router.get("/:sku/simulate", async (req: Request, res: Response) => {
  const sku = req.params.sku as string;
  const quantity = parseInt(req.query.quantity as string) || 100;
  const items = await getBomWithStock(sku);

  if (items.length === 0) {
    return res.status(404).json({ error: `BOM bulunamadı: ${sku}` });
  }

  const capacity = computeProductionCapacity(items);
  const canProduce = capacity.maxProducible >= quantity;

  const shortages: Array<{ code: string; name: string; need: number; have: number; shortage: number }> = [];
  const materialsNeeded: Array<{
    code: string; name: string; need: number; have: number; remaining: number;
    mustAssemble?: number; tier: number;
  }> = [];

  const tier1and2 = items.filter((i) => i.tier === 1 || i.tier === 2);

  for (const item of tier1and2) {
    const need = item.requiredQty * quantity;
    let effectiveStock = item.currentStock;
    let mustAssemble: number | undefined;

    if (item.tier === 2) {
      const sub = computeSubAssemblyCapacity(item.code, items);
      effectiveStock = item.currentStock + sub.producible;
      if (item.currentStock < need) {
        mustAssemble = Math.min(need - item.currentStock, sub.producible);
      }
    }

    const remaining = effectiveStock - need;

    materialsNeeded.push({
      code: item.code,
      name: item.name,
      need,
      have: effectiveStock,
      remaining,
      mustAssemble,
      tier: item.tier,
    });

    if (remaining < 0) {
      shortages.push({
        code: item.code,
        name: item.name,
        need,
        have: effectiveStock,
        shortage: Math.abs(remaining),
      });
    }
  }

  // Sort materials: shortages first, then by remaining ascending
  materialsNeeded.sort((a, b) => a.remaining - b.remaining);

  res.json({
    product: sku,
    requestedQuantity: quantity,
    canProduce,
    maxProducible: capacity.maxProducible,
    shortages,
    materialsNeeded: materialsNeeded.slice(0, 15),
    subAssemblyStatus: capacity.subAssemblyStatus,
  });
});

export default router;

// Export helpers for agent tools
export { getBomWithStock, computeProductionCapacity, computeSubAssemblyCapacity };
