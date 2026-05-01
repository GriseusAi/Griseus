/**
 * POST /api/strategy/reaction-equation
 *
 * Tepkime Denklemi — read-only senaryo motoru.
 * Mutation yok, lineage yok, WS broadcast yok. Saf hesap.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { products, stockLevels, componentStock, bomItems } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  generateScenarios,
  type SchedulerInput,
  type SchedulerCtx,
  type DeviceContext,
  type ComponentContext,
} from "../lib/strategy-scheduler";

const router = Router();

const deviceSchema = z.object({
  sku: z.string().min(1),
  qty: z.number().int().positive(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  productionDaysPerUnit: z.number().positive().optional(),
  color: z.string().optional(),
});

const supplySchema = z.object({
  componentCode: z.string().min(1),
  qty: z.number().positive(),
  leadDays: z.number().int().positive(),
});

const bomEntrySchema = z.object({
  code: z.string().min(1),
  requiredPerUnit: z.number().positive(),
  tier: z.number().int().nonnegative(),
  parentCode: z.string().nullable(),
});

const contextOverrideSchema = z.object({
  devices: z.array(
    z.object({
      sku: z.string().min(1),
      inWarehouse: z.number().int().nonnegative(),
      bom: z.array(bomEntrySchema),
    }),
  ),
  components: z.array(
    z.object({
      code: z.string().min(1),
      currentStock: z.number().nonnegative(),
    }),
  ),
});

const inputSchema = z.object({
  devices: z.array(deviceSchema).min(1).max(10),
  supplyOrders: z.array(supplySchema).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  horizonDays: z.number().int().positive().max(365).optional(),
  contextOverride: contextOverrideSchema.optional(),
});

// POST /api/strategy/reaction-equation
router.post("/reaction-equation", async (req: Request, res: Response) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "geçersiz girdi", details: parsed.error.flatten() });
  }

  const input: SchedulerInput = parsed.data;
  const ctxOverride = parsed.data.contextOverride;
  const skus = input.devices.map((d) => d.sku);

  // ── Bypass DB if caller provides full context (used by demo/senaryo page) ──
  if (ctxOverride) {
    const ctx: SchedulerCtx = {
      devices: ctxOverride.devices,
      components: ctxOverride.components,
    };
    const result = generateScenarios(input, ctx);
    const contextSummary = ctxOverride.devices.map((d) => {
      const req = input.devices.find((x) => x.sku === d.sku);
      return {
        sku: d.sku,
        requested: req?.qty ?? 0,
        inWarehouse: d.inWarehouse,
        toProduce: Math.max(0, (req?.qty ?? 0) - d.inWarehouse),
      };
    });
    return res.json({ ...result, contextSummary });
  }

  // 1) Read product → stock_levels.inWarehouse
  const productRows = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(inArray(products.sku, skus));

  const stockRows = await db
    .select({ productId: stockLevels.productId, inWarehouse: stockLevels.inWarehouse })
    .from(stockLevels)
    .where(
      productRows.length > 0
        ? inArray(
            stockLevels.productId,
            productRows.map((p) => p.id),
          )
        : eq(stockLevels.productId, -1),
    );

  const inWarehouseMap: Record<string, number> = {};
  for (const p of productRows) {
    if (!p.sku) continue;
    const lvl = stockRows.find((s) => s.productId === p.id);
    inWarehouseMap[p.sku] = lvl?.inWarehouse ?? 0;
  }

  // 2) Read BOM (tier-1 items) for each SKU
  const bomRows = await db
    .select({
      sku: bomItems.parentProductSku,
      code: bomItems.componentCode,
      requiredQty: bomItems.requiredQuantity,
      tier: bomItems.tier,
      parentCode: bomItems.parentComponentCode,
    })
    .from(bomItems)
    .where(inArray(bomItems.parentProductSku, skus));

  const deviceCtx: DeviceContext[] = skus.map((sku) => ({
    sku,
    inWarehouse: inWarehouseMap[sku] ?? 0,
    bom: bomRows
      .filter((b) => b.sku === sku)
      .map((b) => ({
        code: b.code,
        requiredPerUnit: parseFloat(b.requiredQty as string),
        tier: b.tier,
        parentCode: b.parentCode,
      })),
  }));

  // 3) Read componentStock for codes referenced in any BOM
  const codes = Array.from(new Set(bomRows.map((b) => b.code)));
  const stockComp = codes.length
    ? await db
        .select({ code: componentStock.componentCode, current: componentStock.currentStock })
        .from(componentStock)
        .where(inArray(componentStock.componentCode, codes))
    : [];

  const componentsCtx: ComponentContext[] = codes.map((code) => {
    const r = stockComp.find((s) => s.code === code);
    return { code, currentStock: r ? parseFloat(r.current as string) : 0 };
  });

  const ctx: SchedulerCtx = { devices: deviceCtx, components: componentsCtx };

  const result = generateScenarios(input, ctx);

  // Append context summary so UI can render "stok=50 → üret 100" narrative
  const contextSummary = deviceCtx.map((d) => {
    const req = input.devices.find((x) => x.sku === d.sku);
    return {
      sku: d.sku,
      requested: req?.qty ?? 0,
      inWarehouse: d.inWarehouse,
      toProduce: Math.max(0, (req?.qty ?? 0) - d.inWarehouse),
    };
  });

  return res.json({
    ...result,
    contextSummary,
  });
});

export default router;
