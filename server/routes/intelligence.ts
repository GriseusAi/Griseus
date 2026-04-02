import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { stockMovementsV2, products, componentStock } from "@shared/schema";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { getBomWithStock } from "./bom";
import { asyncHandler, NotFoundError } from "../errors";
import { requireAuth, requirePermission } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

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
  // Palantir Ontology — Seasonal Fields
  seasonalDays: number | null;
  seasonalDifference: number | null;
  depletionMonth: string | null;
  depletionYear: number | null;
  depletionRisk: "KRİTİK" | "YÜKSEK" | "ORTA" | "DÜŞÜK" | null;
  winterStress: boolean;
  seasonalReorderPoint: number;
  currentSeasonalRate: number;
  peakSeasonalRate: number;
}

// ═══════════════════════════════════════════════════════════
// PALANTIR ONTOLOGY — Seasonal Forward-Walk Engine
// ═══════════════════════════════════════════════════════════
const MONTHLY_DEMAND = [340, 278, 131, 222, 162, 234, 108, 269, 98, 169, 22, 325]; // Oca-Ara (PDF kaynak)
const YEARLY_TOTAL = 2358;
const MONTHLY_AVG = YEARLY_TOTAL / 12; // 196.5
const SEASONAL_INDICES = MONTHLY_DEMAND.map(m => m / MONTHLY_AVG);
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_LABELS = ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];

function seasonalForwardWalk(stock: number, dailyRate: number): {
  days: number;
  depletionMonth: number;
  depletionYear: number;
} {
  if (stock <= 0 || dailyRate <= 0) return { days: 0, depletionMonth: new Date().getMonth(), depletionYear: new Date().getFullYear() };

  const now = new Date();
  let monthIndex = now.getMonth();
  const currentDay = now.getDate();
  let remainingStock = stock;
  let totalDays = 0;
  let isFirstMonth = true;
  let yearOffset = 0;

  for (let i = 0; i < 200; i++) {
    const idx = SEASONAL_INDICES[monthIndex];
    const adjustedRate = dailyRate * idx;
    const daysThisMonth = isFirstMonth
      ? DAYS_IN_MONTH[monthIndex] - currentDay + 1
      : DAYS_IN_MONTH[monthIndex];
    const consumption = adjustedRate * daysThisMonth;

    if (consumption >= remainingStock) {
      const daysUntilEmpty = adjustedRate > 0 ? remainingStock / adjustedRate : daysThisMonth;
      totalDays += Math.ceil(daysUntilEmpty);
      return {
        days: totalDays,
        depletionMonth: monthIndex,
        depletionYear: now.getFullYear() + yearOffset,
      };
    }

    remainingStock -= consumption;
    totalDays += daysThisMonth;
    isFirstMonth = false;
    if (monthIndex === 11) yearOffset++;
    monthIndex = (monthIndex + 1) % 12;
  }

  return { days: totalDays, depletionMonth: monthIndex, depletionYear: now.getFullYear() + yearOffset };
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

      // Palantir Ontology — Seasonal calculations
      const effectiveDailyRate = dailyBurn > 0 ? dailyBurn : (item.currentStock > 0 ? YEARLY_TOTAL / 365 * item.requiredQty : 0);
      const seasonal = seasonalForwardWalk(item.currentStock, effectiveDailyRate);
      const currentMonthIdx = new Date().getMonth();
      const currentSeasonalRate = effectiveDailyRate * SEASONAL_INDICES[currentMonthIdx];
      const peakSeasonalRate = effectiveDailyRate * Math.max(...SEASONAL_INDICES);
      const seasonalReorderPt = Math.ceil(reorderPoint * SEASONAL_INDICES[currentMonthIdx]);

      // Depletion risk based on HOW SOON stock runs out (not which month)
      const depRisk = item.currentStock <= 0 ? "KRİTİK" as const
        : seasonal.days <= 180 ? "KRİTİK" as const
        : seasonal.days <= 365 ? "YÜKSEK" as const
        : seasonal.days <= 730 ? "ORTA" as const
        : "DÜŞÜK" as const;

      const winterMonths = [10, 11, 0, 1];
      const winterStress = item.currentStock > 0 && winterMonths.includes(seasonal.depletionMonth) && seasonal.days <= 365;

      return {
        code: item.code, name: item.name, tier: item.tier, unit: item.unit,
        currentStock: item.currentStock, requiredPerUnit: item.requiredQty,
        dailyBurnRate: Math.round(dailyBurn * 100) / 100,
        weeklyBurnRate: Math.round(weeklyBurn * 100) / 100,
        daysToStockout, reorderPoint,
        isAboveReorderPoint: item.currentStock > reorderPoint,
        trend, trendRatio, suggestedOrderQty, urgency,
        // Seasonal fields
        seasonalDays: item.currentStock > 0 ? seasonal.days : 0,
        seasonalDifference: daysToStockout !== null && item.currentStock > 0 ? seasonal.days - daysToStockout : null,
        depletionMonth: item.currentStock > 0 ? MONTH_LABELS[seasonal.depletionMonth] : null,
        depletionYear: item.currentStock > 0 ? seasonal.depletionYear : null,
        depletionRisk: item.currentStock > 0 ? depRisk : "KRİTİK",
        winterStress,
        seasonalReorderPoint: seasonalReorderPt,
        currentSeasonalRate: Math.round(currentSeasonalRate * 100) / 100,
        peakSeasonalRate: Math.round(peakSeasonalRate * 100) / 100,
      };
    })
    .sort((a, b) => (a.seasonalDays ?? 9999) - (b.seasonalDays ?? 9999));

  // Ontology summary
  const winterRiskCount = components.filter(c => c.winterStress).length;
  const seasonalDiffs = components.filter(c => c.seasonalDifference !== null).map(c => c.seasonalDifference!);
  const avgDiff = seasonalDiffs.length > 0 ? Math.round(seasonalDiffs.reduce((a, b) => a + b, 0) / seasonalDiffs.length) : 0;
  const currentMonthIdx = new Date().getMonth();

  return {
    product: sku,
    salesLast30Days: salesLast30,
    dailySalesRate: Math.round(dailySalesRate * 100) / 100,
    leadTimeDays: LEAD_TIME_DAYS,
    components,
    criticalCount: components.filter(c => c.urgency === "critical").length,
    warningCount: components.filter(c => c.urgency === "warning").length,
    topRisks: components.filter(c => c.urgency === "critical" || c.urgency === "warning").slice(0, 5),
    // Palantir Ontology Summary
    ontology: {
      currentMonth: MONTH_LABELS[currentMonthIdx],
      currentSeasonalIndex: Math.round(SEASONAL_INDICES[currentMonthIdx] * 100) / 100,
      winterRiskCount,
      avgDaysDifference: avgDiff,
      seasonalIndices: SEASONAL_INDICES.map((v, i) => ({ month: MONTH_LABELS[i], index: Math.round(v * 100) / 100 })),
      monthlyDemand: MONTHLY_DEMAND.map((v, i) => ({ month: MONTH_LABELS[i], demand: v })),
    },
  };
}

// ── GET /api/bom/:sku/intelligence ──

router.get("/:sku/intelligence", requirePermission("component:read"), asyncHandler(async (req: Request, res: Response) => {
  const sku = req.params.sku as string;
  const result = await computeComponentIntelligence(sku);
  res.json(result);
}));

export default router;
