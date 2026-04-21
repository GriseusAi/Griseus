/**
 * Time Series endpoint — Cockpit'in temel veri kaynağı.
 *
 * Her ontology node için birleşik zaman serisi:
 *  - Cihaz (SKU)  → aylık satış geçmişi (sales_history)
 *  - Bileşen      → data_snapshots'tan türetilen stok tarihi
 *  - Her ikisi için burn rate + seasonalDays (anlık intelligence)
 *
 * GET /api/ontology/timeseries/:code?sku=BH.50ST.SV
 */

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { salesHistory, dataSnapshots, componentStock, bomItems } from "@shared/schema";
import { sql, eq, desc, asc } from "drizzle-orm";

const router = Router();

const BH_SKUS = ["BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV"];

interface TimeSeriesResponse {
  code: string;
  kind: "device" | "component";
  salesMonthly: Array<{ year: number; month: number; units: number; label: string }>;
  stockHistory: Array<{ date: string; stock: number }>;
  current: {
    stock: number | null;
    unit: string | null;
    dailyBurnRate: number | null;
    seasonalDays: number | null;
    daysToStockout: number | null;
    depletionMonth: string | null;
  };
  meta: {
    snapshotPointCount: number;
    salesMonthCount: number;
    usedBySkus: string[];
  };
}

router.get("/timeseries/:code", async (req: Request, res: Response) => {
  try {
    const code = decodeURIComponent(String(req.params.code));
    const skuQuery = (req.query.sku as string) || "";

    const isDevice = BH_SKUS.includes(code) || code.includes(".");
    const kind: "device" | "component" = isDevice ? "device" : "component";

    const out: TimeSeriesResponse = {
      code,
      kind,
      salesMonthly: [],
      stockHistory: [],
      current: { stock: null, unit: null, dailyBurnRate: null, seasonalDays: null, daysToStockout: null, depletionMonth: null },
      meta: { snapshotPointCount: 0, salesMonthCount: 0, usedBySkus: [] },
    };

    // Sales: if device → sales for that SKU; if component → aggregate sales of products using it
    if (kind === "device") {
      const rows = await db
        .select({
          year: salesHistory.year,
          month: salesHistory.month,
          units: salesHistory.quantitySold,
        })
        .from(salesHistory)
        .where(eq(salesHistory.productSku, code))
        .orderBy(asc(salesHistory.year), asc(salesHistory.month));
      out.salesMonthly = rows.map(r => ({
        year: r.year,
        month: r.month,
        units: r.units,
        label: `${String(r.month).padStart(2, "0")}/${String(r.year).slice(-2)}`,
      }));
    } else {
      const parentSkus = await db
        .select({ sku: bomItems.parentProductSku })
        .from(bomItems)
        .where(eq(bomItems.componentCode, code));
      const skuSet = new Set(parentSkus.map(r => r.sku));
      out.meta.usedBySkus = Array.from(skuSet);
      if (skuSet.size > 0) {
        const agg = await db.execute(sql`
          SELECT year, month, SUM(quantity_sold)::int AS units
          FROM sales_history
          WHERE product_sku = ANY(${Array.from(skuSet)})
          GROUP BY year, month
          ORDER BY year ASC, month ASC
        `);
        out.salesMonthly = (agg.rows as any[]).map(r => ({
          year: Number(r.year),
          month: Number(r.month),
          units: Number(r.units),
          label: `${String(r.month).padStart(2, "0")}/${String(r.year).slice(-2)}`,
        }));
      }
    }
    out.meta.salesMonthCount = out.salesMonthly.length;

    // Current stock (component only)
    if (kind === "component") {
      const [stockRow] = await db
        .select()
        .from(componentStock)
        .where(eq(componentStock.componentCode, code))
        .limit(1);
      if (stockRow) {
        out.current.stock = parseFloat(String(stockRow.currentStock));
        out.current.unit = stockRow.unit;
      }

      // Stock history from snapshots — scan latest 60 snapshots, extract our code
      const snaps = await db
        .select()
        .from(dataSnapshots)
        .orderBy(desc(dataSnapshots.createdAt))
        .limit(60);
      const series: Array<{ date: string; stock: number }> = [];
      for (const snap of snaps) {
        const rows = (snap.data as any)?.component_stock;
        if (!Array.isArray(rows)) continue;
        const match = rows.find((r: any) => r.component_code === code || r.componentCode === code);
        if (match) {
          const qty = parseFloat(String(match.current_stock ?? match.currentStock ?? 0));
          if (!isNaN(qty)) {
            series.push({
              date: (snap.createdAt instanceof Date ? snap.createdAt : new Date(String(snap.createdAt))).toISOString(),
              stock: qty,
            });
          }
        }
      }
      // Reverse to chronological order (oldest → newest)
      series.reverse();
      out.stockHistory = series;
      out.meta.snapshotPointCount = series.length;
    }

    // Intelligence (burn, seasonal) — compute from recent sales for component; for device skip
    if (kind === "component" && out.salesMonthly.length >= 3) {
      // Burn rate proxy: average consumption across all SKUs using this component, scaled by BOM qty
      const bomRows = await db
        .select({
          sku: bomItems.parentProductSku,
          qty: bomItems.requiredQuantity,
        })
        .from(bomItems)
        .where(eq(bomItems.componentCode, code));
      const qtyBySku = new Map<string, number>();
      for (const r of bomRows) qtyBySku.set(r.sku, parseFloat(String(r.qty)) || 0);

      // Last 12 months total component consumption
      const last12 = out.salesMonthly.slice(-12);
      let componentConsumed = 0;
      for (const m of last12) {
        // We don't have per-SKU breakdown here (aggregated already). Approx with average BOM qty across users.
        const avgQty = Array.from(qtyBySku.values()).reduce((a, b) => a + b, 0) / Math.max(1, qtyBySku.size);
        componentConsumed += m.units * avgQty;
      }
      const daysInPeriod = last12.length * 30;
      out.current.dailyBurnRate = daysInPeriod > 0 ? componentConsumed / daysInPeriod : 0;
      if (out.current.dailyBurnRate && out.current.stock != null && out.current.dailyBurnRate > 0) {
        out.current.daysToStockout = Math.round(out.current.stock / out.current.dailyBurnRate);
      }
    }

    res.json(out);
  } catch (err: any) {
    console.error("[timeseries] error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
