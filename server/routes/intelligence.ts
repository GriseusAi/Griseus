import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { stockMovementsV2, products, componentStock } from "@shared/schema";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { getBomWithStock } from "./bom";

const router = Router();

// ═══════════════════════════════════════════════════════════
// COMPONENT INTELLIGENCE — Consumption rate, days-to-stockout,
// reorder point, trend analysis
// ═══════════════════════════════════════════════════════════

export interface ComponentIntelligence {
  code: string;
  name: string;
  currentStock: number;
  requiredPerUnit: number;
  unit: string;
  tier: number;
  dailyBurnRate: number;
  weeklyBurnRate: number;
  daysToStockout: number | null;
  reorderPoint: number;
  isAboveReorderPoint: boolean;
  trend: "accelerating" | "stable" | "decelerating";
  trendRatio: number;
  suggestedOrderQty: number;
  urgency: "critical" | "warning" | "ok" | "abundant";
}

const LEAD_TIME_DAYS = 14;

export async function computeComponentIntelligence(sku: string): Promise<{
  product: string;
  salesLast30Days: number;
  dailySalesRate: number;
  leadTimeDays: number;
  components: ComponentIntelligence[];
  criticalCount: number;
  warningCount: number;
  topRisks: ComponentIntelligence[];
}> {
  const items = await getBomWithStock(sku);
  if (items.length === 0) throw new Error(`BOM bulunamadı: ${sku}`);

  // Find product
  const allProducts = await db.select().from(products);
  const product = allProducts.find(p => (p.sku || "").toLowerCase() === sku.toLowerCase());

  // Get sales data for different periods
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  let salesLast30 = 0;
  let salesLast14 = 0;
  let salesPrev14 = 0; // 14-28 days ago

  if (product) {
    const movements = await db.select({
      quantity: stockMovementsV2.quantity,
      createdAt: stockMovementsV2.createdAt,
    })
      .from(stockMovementsV2)
      .where(and(
        eq(stockMovementsV2.productId, product.id),
        eq(stockMovementsV2.movementType, "to_sales"),
        gte(stockMovementsV2.createdAt, thirtyDaysAgo),
      ));

    for (const m of movements) {
      salesLast30 += m.quantity;
      if (m.createdAt && m.createdAt >= fourteenDaysAgo) {
        salesLast14 += m.quantity;
      } else if (m.createdAt && m.createdAt >= twentyEightDaysAgo) {
        salesPrev14 += m.quantity;
      }
    }
  }

  const dailySalesRate = salesLast30 / 30;

  const components: ComponentIntelligence[] = items
    .filter(i => i.tier === 1 || i.tier === 2)
    .map(item => {
      const dailyBurn = dailySalesRate * item.requiredQty;
      const weeklyBurn = dailyBurn * 7;
      const daysToStockout = dailyBurn > 0 ? Math.floor(item.currentStock / dailyBurn) : null;
      const reorderPoint = Math.ceil(dailyBurn * LEAD_TIME_DAYS);
      const suggestedOrderQty = Math.max(0, Math.ceil(dailyBurn * 30) - Math.floor(item.currentStock));

      // Trend: compare last 14 days vs previous 14 days burn rate
      const burnLast14 = (salesLast14 / 14) * item.requiredQty;
      const burnPrev14 = (salesPrev14 / 14) * item.requiredQty;
      let trendRatio = burnPrev14 > 0 ? burnLast14 / burnPrev14 : 1;
      trendRatio = Math.round(trendRatio * 100) / 100;
      const trend: "accelerating" | "stable" | "decelerating" =
        trendRatio > 1.2 ? "accelerating" : trendRatio < 0.8 ? "decelerating" : "stable";

      const urgency: "critical" | "warning" | "ok" | "abundant" =
        daysToStockout === null ? "abundant"
        : daysToStockout < 7 ? "critical"
        : daysToStockout < 21 ? "warning"
        : daysToStockout < 60 ? "ok" : "abundant";

      return {
        code: item.code, name: item.name, tier: item.tier, unit: item.unit,
        currentStock: item.currentStock, requiredPerUnit: item.requiredQty,
        dailyBurnRate: Math.round(dailyBurn * 100) / 100,
        weeklyBurnRate: Math.round(weeklyBurn * 100) / 100,
        daysToStockout, reorderPoint,
        isAboveReorderPoint: item.currentStock > reorderPoint,
        trend, trendRatio, suggestedOrderQty, urgency,
      };
    })
    .sort((a, b) => (a.daysToStockout ?? 9999) - (b.daysToStockout ?? 9999));

  return {
    product: sku,
    salesLast30Days: salesLast30,
    dailySalesRate: Math.round(dailySalesRate * 100) / 100,
    leadTimeDays: LEAD_TIME_DAYS,
    components,
    criticalCount: components.filter(c => c.urgency === "critical").length,
    warningCount: components.filter(c => c.urgency === "warning").length,
    topRisks: components.filter(c => c.urgency === "critical" || c.urgency === "warning").slice(0, 5),
  };
}

// ── GET /api/bom/:sku/intelligence ──

router.get("/:sku/intelligence", async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku as string;
    const result = await computeComponentIntelligence(sku);
    res.json(result);
  } catch (err: any) {
    res.status(err.message?.includes("bulunamadı") ? 404 : 500).json({ error: err.message });
  }
});

export default router;
