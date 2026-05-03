import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { bomItems, componentStock, products } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { broadcastStockUpdate, broadcastProactiveAlert, broadcastImpactPropagation } from "../ws";
import { broadcastEntityChanged } from "../ws";
import { evaluateRules } from "../rules-engine";
import { computeImpactPropagation, takePreSnapshot } from "../lib/impact-engine";
import { isBHVariableComponent } from "@shared/octopus-chain-config";
import { createSnapshot, recordLineage } from "./foundry";

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
  allItems: BomRow[],
  sku?: string
): { producible: number; bottleneck: string; parts: Array<{ code: string; name: string; stock: number; required: number; maxProducts: number | null }> } {
  const parts = allItems.filter((i) => i.parentComponentCode === subAssemblyCode);
  if (parts.length === 0) return { producible: 0, bottleneck: "alt bileşen yok", parts: [] };

  const isBH = sku?.startsWith("BH.") ?? false;
  // BH ailesi on-demand: alt bileşen stoku 0 ise siparişe tabi, bottleneck sayılmaz
  const measurableParts = parts.filter((p) => p.requiredQty > 0);
  const considered = isBH ? measurableParts.filter((p) => p.currentStock > 0) : measurableParts;

  if (measurableParts.length === 0) {
    return {
      producible: 0,
      bottleneck: "alt bileşen reçete miktarı tanımsız",
      parts: parts.map((p) => ({
        code: p.code, name: p.name, stock: p.currentStock, required: p.requiredQty, maxProducts: null,
      })),
    };
  }

  if (considered.length === 0) {
    // Tüm alt bileşenler on-demand → alt montaj sınırlanmaz (Number.MAX_SAFE_INTEGER ile Infinity simülasyonu)
    return {
      producible: Number.MAX_SAFE_INTEGER,
      bottleneck: "tüm alt bileşenler on-demand (BH ailesi kuralı)",
      parts: parts.map((p) => ({
        code: p.code, name: p.name, stock: p.currentStock, required: p.requiredQty, maxProducts: Number.MAX_SAFE_INTEGER,
      })),
    };
  }

  const partDetails = considered.map((p) => {
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

function computeProductionCapacity(allItems: BomRow[], sku?: string) {
  // Top-level bilesenler (parentComponentCode=null) uretim darbogazi olabilir.
  // Child'lar (parent'i olan) sub-assembly capacity'de hesaba giriyor, burada
  // ayrica saymak CIFT SAYIM'dir. Aileler arasi tier tutarsizligi: BH yari-mamul
  // tier=1, ELT yari-mamul tier=2. Her iki durumda da parent'siz olan top-level.
  //
  // BH ailesi on-demand kurali: BH BOM'undaki efektif stoku 0 olan bilesenler
  // surekli tutulmuyor, ihtiyac uzerine siparis veriliyor. Bu yuzden bunlar
  // uretilebilirligi sinirlamaz — bottleneck listesinden ayri bir onDemand
  // listesine tasiniyor.
  const isBH = sku?.startsWith("BH.") ?? false;
  const tier1 = allItems.filter((i) => !i.parentComponentCode);
  const bottlenecks: Array<{
    code: string; name: string; tier: number; stock: number;
    required: number; maxProducts: number; note?: string;
    reasoning?: Array<{ order: number; cause: string; data?: Record<string, number | string> }>;
  }> = [];
  const onDemandComponents: Array<{
    code: string; name: string; tier: number; requiredQty: number;
    hasChildren: boolean; reason: string;
  }> = [];
  const variableComponents: Array<{
    code: string; name: string; tier: number; requiredQty: number;
    currentStock: number; reason: string;
  }> = [];

  const subAssemblyStatus: Record<string, any> = {};
  let maxProducible = Infinity;

  for (const item of tier1) {
    let effectiveStock = item.currentStock;
    let note: string | undefined;

    // Yari-mamul mu? Bu tier=1 bilesenin alt bileseni var mi?
    const hasChildren = allItems.some(i => i.parentComponentCode === item.code);
    if (hasChildren) {
      const sub = computeSubAssemblyCapacity(item.code, allItems, sku);
      effectiveStock = item.currentStock + sub.producible;
      note = `YARI MAMÜL — hazır stok: ${item.currentStock} + alt bileşenlerden: ${sub.producible}`;
      subAssemblyStatus[item.code] = {
        name: item.name,
        currentStock: item.currentStock,
        producibleFromParts: sub.producible,
        partBottleneck: sub.bottleneck,
        parts: sub.parts,
      };
    }

    // BH on-demand: efektif stok = 0 → darbogazdan dis, siparis uzerine tedarik
    if (isBH && effectiveStock === 0) {
      onDemandComponents.push({
        code: item.code,
        name: item.name,
        tier: item.tier,
        requiredQty: item.requiredQty,
        hasChildren,
        reason: hasChildren
          ? "yarı-mamül + alt bileşen stokları 0 → ihtiyaç üzerine tedarik (BH ailesi kuralı)"
          : "stok=0 → ihtiyaç üzerine tedarik (BH ailesi kuralı)",
      });
      continue;
    }

    // BH variable: user-işaretlenmiş opsiyonel bileşenler (stok>0 ama bazen kullanılan)
    // darbogaz sayılmaz, variableComponents listesine taşınır
    if (isBH && isBHVariableComponent(sku ?? "", item.code)) {
      variableComponents.push({
        code: item.code,
        name: item.name,
        tier: item.tier,
        requiredQty: item.requiredQty,
        currentStock: effectiveStock,
        reason: "DEĞİŞKEN — bazen kullanılan opsiyonel bileşen (BH ailesi)",
      });
      continue;
    }

    const maxProducts = item.requiredQty > 0
      ? Math.floor(effectiveStock / item.requiredQty)
      : Infinity;

    const reasoning: Array<{ order: number; cause: string; data?: Record<string, number | string> }> = [
      { order: 1, cause: `${item.code} ${item.name} analiz edildi`, data: { tier: item.tier } },
      { order: 2, cause: `Efektif stok: ${effectiveStock} adet${effectiveStock !== item.currentStock ? ` (hazır: ${item.currentStock} + alt bileşenden monte: ${effectiveStock - item.currentStock})` : ""}`, data: { effectiveStock, rawStock: item.currentStock } },
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
    onDemandComponents,
    variableComponents,
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
    productName: await db.select({ name: products.name }).from(products).where(eq(products.sku, sku)).then(r => r[0]?.name || sku),
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

  // Dashboard flat stok goruntusu: top-level bilesenler (parentComponentCode=null) gorunur.
  // Aileler arasi veri tutarsizligi: BH ailesi yari-mamul tier=1 (children tier=2),
  // ELT ailesi yari-mamul tier=2 (children tier=3). Ikisi de top-level — parent'siz
  // olanlari al, tier'dan bagimsiz. Children[] rekursif olarak dallanir.
  const tier1Items = items.filter(i => !i.parentComponentCode);

  // Recursive child-tree builder: tier>=2 satirlari parent'a bagla
  function buildChildren(parentCode: string): any[] {
    return items
      .filter(x => x.parentComponentCode === parentCode)
      .map(c => {
        const grandChildren = buildChildren(c.code);
        const cMax = c.requiredQty > 0 ? Math.floor(c.currentStock / c.requiredQty) : null;
        return {
          code: c.code,
          name: c.name,
          requiredPerUnit: c.requiredQty,
          unit: c.unit,
          tier: c.tier,
          parentComponentCode: c.parentComponentCode,
          currentStock: c.currentStock,
          maxProducts: cMax,
          status:
            c.currentStock === 0 ? "critical" :
            c.currentStock < 50 ? "critical" :
            c.currentStock < 150 ? "warning" :
            c.currentStock < 400 ? "ok" : "abundant",
          children: grandChildren,
        };
      });
  }

  res.json({
    product: sku,
    components: tier1Items.map((i) => {
      // Efektif stok: yari-mamul ise (alt bileseni VAR) hazir + alt bilesenden monte
      const hasChildren = items.some(x => x.parentComponentCode === i.code);
      let effectiveStock = i.currentStock;
      if (hasChildren) {
        const sub = computeSubAssemblyCapacity(i.code, items, sku);
        effectiveStock = i.currentStock + sub.producible;
      }
      const maxProducts = i.requiredQty > 0 ? Math.floor(effectiveStock / i.requiredQty) : null;

      // "Variable" status SADECE config'te işaretlenmiş kodlar için (VA-pattern — Aaco fan).
      // Kod pattern'inden belli bileşen, stok=0 ile karıştırılmamalı.
      const isVariable = isBHVariableComponent(sku, i.code);

      // Status — tüm sistemde aynı kural (ürün çeşidine göre değil, efektif stoka göre):
      //   critical=kırmızı, warning=sarı, ok=mavi, abundant=yeşil
      //   variable=koyu turuncu (opsiyonel kod pattern'inden belli)
      let status: string;
      if (isVariable) status = "variable";
      else if (effectiveStock < 0) status = "critical";
      else if (maxProducts === null) status = "N/A";
      else if (maxProducts === 0) status = "critical";
      else if (maxProducts < 50) status = "critical";
      else if (maxProducts < 150) status = "warning";
      else if (maxProducts < 400) status = "ok";
      else status = "abundant";

      return {
        code: i.code,
        name: i.name,
        requiredPerUnit: i.requiredQty,
        unit: i.unit,
        tier: i.tier,
        parentComponentCode: i.parentComponentCode,
        currentStock: effectiveStock,
        rawStock: i.currentStock,
        maxProducts,
        status,
        isSubAssembly: hasChildren,
        children: hasChildren ? buildChildren(i.code) : [],
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

  const capacity = computeProductionCapacity(items, sku);

  res.json({
    product: sku,
    maxProducible: capacity.maxProducible,
    bottlenecks: capacity.bottlenecks,
    subAssemblyStatus: capacity.subAssemblyStatus,
    onDemandComponents: capacity.onDemandComponents,
    variableComponents: capacity.variableComponents,
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

  // Look up parent product SKU for this component
  const [bomRow] = await db.select({ parentProductSku: bomItems.parentProductSku })
    .from(bomItems)
    .where(eq(bomItems.componentCode, code))
    .limit(1);

  // Proactive rules evaluation (fire-and-forget)
  evaluateRules({ type: "component_stock_update", componentCode: code, sku: bomRow?.parentProductSku || undefined })
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

// ── PATCH /api/bom/:sku/components/:code/required-quantity ──
// Gerçek BOM reçete adedini değiştirir. Snapshot + lineage + Octopus Chain gate.
router.patch("/:sku/components/:code/required-quantity", async (req: Request, res: Response) => {
  const sku = req.params.sku as string;
  const code = req.params.code as string;
  const requiredQuantity = Number(req.body?.requiredQuantity);
  const actor = req.body?.actor || "strategy_canvas";

  if (!sku || !code || !Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
    return res.status(400).json({ error: "sku, component code ve pozitif requiredQuantity gerekli" });
  }

  const existing = await db
    .select()
    .from(bomItems)
    .where(and(eq(bomItems.parentProductSku, sku), eq(bomItems.componentCode, code)))
    .limit(1);

  if (existing.length === 0) {
    return res.status(404).json({ error: `BOM satırı bulunamadı: ${sku} / ${code}` });
  }

  const before = existing[0];
  const previousQuantity = String(before.requiredQuantity);
  const nextQuantity = String(requiredQuantity);

  if (previousQuantity === nextQuantity) {
    return res.json({
      success: true,
      unchanged: true,
      sku,
      componentCode: code,
      requiredQuantity,
    });
  }

  const snapshotId = await createSnapshot(
    `BOM adet güncelleme öncesi: ${sku} / ${code}`,
    "auto_pre_bom_required_quantity",
    ["bom_items", "component_stock"],
    actor,
  );

  await db
    .update(bomItems)
    .set({ requiredQuantity: nextQuantity })
    .where(and(eq(bomItems.parentProductSku, sku), eq(bomItems.componentCode, code)));

  const lineageId = await recordLineage({
    entity: "bom_items",
    entityId: `${sku}:${code}`,
    field: "required_quantity",
    previousValue: previousQuantity,
    newValue: nextQuantity,
    sourceType: "strategy_canvas_component_quantity",
    sourceId: String(snapshotId),
    sourceName: `Canvas BOM adet güncellemesi: ${sku} / ${code}`,
    actor,
    metadata: { snapshotId, sku, componentCode: code, bomItemId: before.id },
  });

  broadcastEntityChanged({
    event: "entity_changed",
    entities: ["bom_items"],
    scope: sku,
    count: 1,
    source: "strategy_canvas_component_quantity",
  });

  const { runOctopusChainAudit } = await import("../lib/orchestrator");
  const audit = await runOctopusChainAudit(
    "data_ingestion",
    `BOM required_quantity update: ${sku}/${code} ${previousQuantity} -> ${nextQuantity}`,
    { changedCodes: [code], skuHint: sku },
  );

  if (audit.redCount > 0) {
    await db
      .update(bomItems)
      .set({ requiredQuantity: previousQuantity })
      .where(and(eq(bomItems.parentProductSku, sku), eq(bomItems.componentCode, code)));

    await recordLineage({
      entity: "bom_items",
      entityId: `${sku}:${code}`,
      field: "required_quantity",
      previousValue: nextQuantity,
      newValue: previousQuantity,
      sourceType: "octopus_chain_rollback",
      sourceId: String(audit.id),
      sourceName: `Octopus Chain RED rollback: run #${audit.id}`,
      parentLineageId: lineageId,
      actor: "octopus_chain",
      metadata: { snapshotId, auditId: audit.id, sku, componentCode: code },
    });

    broadcastEntityChanged({
      event: "entity_changed",
      entities: ["bom_items"],
      scope: sku,
      count: 1,
      source: "octopus_chain_rollback",
    });

    return res.status(409).json({
      success: false,
      rolledBack: true,
      error: "Octopus Chain RED döndü; BOM adet değişikliği geri alındı.",
      sku,
      componentCode: code,
      attemptedQuantity: requiredQuantity,
      restoredQuantity: Number(previousQuantity),
      snapshotId,
      audit,
    });
  }

  res.json({
    success: true,
    sku,
    componentCode: code,
    previousQuantity: Number(previousQuantity),
    requiredQuantity,
    snapshotId,
    lineageId,
    audit,
  });
});

// ── GET /api/bom/:sku/simulate?quantity=100 — üretim simülasyonu ──

router.get("/:sku/simulate", async (req: Request, res: Response) => {
  const sku = req.params.sku as string;
  const quantity = parseInt(req.query.quantity as string) || 100;
  const items = await getBomWithStock(sku);

  if (items.length === 0) {
    return res.status(404).json({ error: `BOM bulunamadı: ${sku}` });
  }

  const capacity = computeProductionCapacity(items, sku);
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
