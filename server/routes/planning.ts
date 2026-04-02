import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { salesHistory, productionPlans, bomItems, componentStock } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import multer from "multer";
import XLSX from "xlsx";
import { getBomWithStock, computeProductionCapacity } from "./bom";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ═══════════════════════════════════════════════════════════
// FORECASTING ENGINE — Aylık Ortalama + Trend + Tahmin
// ═══════════════════════════════════════════════════════════

interface MonthlyAverage {
  month: number;
  monthName: string;
  avgQuantity: number;
  years: { year: number; quantity: number }[];
  trend: "increasing" | "stable" | "decreasing";
}

const MONTH_NAMES_TR = [
  "", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function calculateTrend(values: number[]): "increasing" | "stable" | "decreasing" {
  if (values.length < 2) return "stable";
  const first = values[0];
  const last = values[values.length - 1];
  const change = ((last - first) / (first || 1)) * 100;
  if (change > 15) return "increasing";
  if (change < -15) return "decreasing";
  return "stable";
}

function calculateForecast(avg: number, trend: "increasing" | "stable" | "decreasing"): number {
  // Trend'e göre ağırlıklı tahmin
  const multiplier = trend === "increasing" ? 1.1 : trend === "decreasing" ? 0.9 : 1.0;
  return Math.round(avg * multiplier);
}

// ═══════════════════════════════════════════════════════════
// EXCEL IMPORT — Satış belgelerini parse et
// ═══════════════════════════════════════════════════════════

// POST /api/planning/import — Excel dosyası yükle
router.post("/import", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Dosya yüklenmedi" });
    }

    const productSku = (req.body.product_sku as string) || "ELT.7-11";
    const source = (req.body.source as string) || "excel";

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const results: Array<{ year: number; month: number; quantity: number; status: string }> = [];
    let totalImported = 0;
    let totalSkipped = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      for (const row of data) {
        // Esnek kolon isimleri — yıl/ay/adet veya year/month/quantity
        const year = row.yil || row.yıl || row.year || row.Year || row.YIL;
        const month = row.ay || row.month || row.Month || row.AY;
        const quantity = row.adet || row.miktar || row.quantity || row.Quantity || row.ADET || row.satış || row.satis;
        const revenue = row.ciro || row.gelir || row.revenue || row.Revenue;
        const notes = row.not || row.notes || row.Notes;

        if (!year || !month || quantity === undefined) {
          totalSkipped++;
          continue;
        }

        const yearNum = parseInt(String(year));
        const monthNum = parseInt(String(month));
        const quantityNum = parseInt(String(quantity));

        if (isNaN(yearNum) || isNaN(monthNum) || isNaN(quantityNum)) {
          totalSkipped++;
          continue;
        }

        if (monthNum < 1 || monthNum > 12) {
          totalSkipped++;
          continue;
        }

        // Upsert — aynı yıl/ay varsa güncelle
        const existing = await db
          .select()
          .from(salesHistory)
          .where(
            and(
              eq(salesHistory.productSku, productSku),
              eq(salesHistory.year, yearNum),
              eq(salesHistory.month, monthNum),
            ),
          );

        if (existing.length > 0) {
          await db
            .update(salesHistory)
            .set({
              quantitySold: quantityNum,
              revenue: revenue ? String(revenue) : null,
              source,
              notes: notes ? String(notes) : null,
              importedAt: new Date(),
            })
            .where(eq(salesHistory.id, existing[0].id));
        } else {
          await db.insert(salesHistory).values({
            productSku,
            year: yearNum,
            month: monthNum,
            quantitySold: quantityNum,
            revenue: revenue ? String(revenue) : null,
            source,
            notes: notes ? String(notes) : null,
          });
        }

        results.push({ year: yearNum, month: monthNum, quantity: quantityNum, status: existing.length > 0 ? "updated" : "inserted" });
        totalImported++;
      }
    }

    res.json({
      success: true,
      totalImported,
      totalSkipped,
      details: results,
      message: `${totalImported} kayıt import edildi, ${totalSkipped} satır atlandı`,
    });
  } catch (error: any) {
    console.error("[planning/import]", error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// FORECASTING — Aylık ortalamalar + tahminler
// ═══════════════════════════════════════════════════════════

// GET /api/planning/forecast/:sku — tüm ayların ortalaması + tahmin
router.get("/forecast/:sku", async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku as string;

    const rows = await db
      .select()
      .from(salesHistory)
      .where(eq(salesHistory.productSku, sku))
      .orderBy(salesHistory.year, salesHistory.month);

    if (rows.length === 0) {
      return res.status(404).json({ error: `${sku} için satış verisi bulunamadı` });
    }

    // Aylara göre grupla
    const monthlyData: Record<number, { year: number; quantity: number }[]> = {};
    for (let m = 1; m <= 12; m++) monthlyData[m] = [];

    for (const row of rows) {
      monthlyData[row.month].push({ year: row.year, quantity: row.quantitySold });
    }

    // Aylık ortalamalar ve trendler
    const monthlyAverages: MonthlyAverage[] = [];
    for (let m = 1; m <= 12; m++) {
      const entries = monthlyData[m];
      const quantities = entries.map((e) => e.quantity);
      const avg = quantities.length > 0
        ? Math.round(quantities.reduce((a, b) => a + b, 0) / quantities.length)
        : 0;
      const trend = calculateTrend(quantities);

      monthlyAverages.push({
        month: m,
        monthName: MONTH_NAMES_TR[m],
        avgQuantity: avg,
        years: entries,
        trend,
      });
    }

    // Yıllık toplam ve genel trend
    const yearlyTotals: Record<number, number> = {};
    for (const row of rows) {
      yearlyTotals[row.year] = (yearlyTotals[row.year] || 0) + row.quantitySold;
    }

    res.json({
      product: sku,
      dataRange: {
        years: Array.from(new Set(rows.map((r) => r.year))).sort(),
        totalRecords: rows.length,
      },
      monthlyAverages,
      yearlyTotals,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PREDIKTIF PLANLAMA — 2-3 ay ileri bakış + BOM gap analizi
// ═══════════════════════════════════════════════════════════

// GET /api/planning/predict/:sku?months_ahead=2 — ileri tahmin + stok eksik analizi
router.get("/predict/:sku", async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku as string;
    const monthsAheadParam = Array.isArray(req.query.months_ahead) ? req.query.months_ahead[0] : req.query.months_ahead;
    const monthsAhead = parseInt(monthsAheadParam as string) || 2;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    // Tarihsel verileri çek
    const rows = await db
      .select()
      .from(salesHistory)
      .where(eq(salesHistory.productSku, sku));

    if (rows.length === 0) {
      return res.status(404).json({ error: `${sku} için satış verisi bulunamadı. Önce Excel import yapın.` });
    }

    // BOM verilerini çek
    const bomData = await getBomWithStock(sku);
    const capacity = computeProductionCapacity(bomData);

    // Her hedef ay için tahmin
    const predictions: Array<{
      targetYear: number;
      targetMonth: number;
      targetMonthName: string;
      forecastedDemand: number;
      historicalData: { year: number; quantity: number }[];
      trend: string;
      componentAnalysis: {
        totalComponentsNeeded: number;
        shortages: Array<{
          code: string;
          name: string;
          required: number;
          currentStock: number;
          shortage: number;
          unit: string;
        }>;
        sufficient: Array<{
          code: string;
          name: string;
          required: number;
          currentStock: number;
          surplus: number;
          unit: string;
        }>;
      };
      canProduce: boolean;
      maxProducibleWithCurrentStock: number;
    }> = [];

    for (let i = 1; i <= monthsAhead; i++) {
      let targetMonth = currentMonth + i;
      let targetYear = currentYear;
      if (targetMonth > 12) {
        targetMonth -= 12;
        targetYear += 1;
      }

      // O ay için tarihsel veriler
      const monthData = rows
        .filter((r) => r.month === targetMonth)
        .map((r) => ({ year: r.year, quantity: r.quantitySold }))
        .sort((a, b) => a.year - b.year);

      const quantities = monthData.map((d) => d.quantity);
      const avg = quantities.length > 0
        ? Math.round(quantities.reduce((a, b) => a + b, 0) / quantities.length)
        : 0;

      const trend = calculateTrend(quantities);
      const forecastedDemand = calculateForecast(avg, trend);

      // BOM × tahmin = gereken komponentler
      const shortages: typeof predictions[0]["componentAnalysis"]["shortages"] = [];
      const sufficient: typeof predictions[0]["componentAnalysis"]["sufficient"] = [];

      for (const item of bomData) {
        // Sadece tier 1 ve 2 (direkt malzeme + yarı mamül)
        if (item.tier > 2) continue;

        const required = Math.ceil(item.requiredQty * forecastedDemand);
        const stock = item.currentStock;

        if (stock < required) {
          shortages.push({
            code: item.code,
            name: item.name,
            required,
            currentStock: stock,
            shortage: required - stock,
            unit: item.unit,
          });
        } else {
          sufficient.push({
            code: item.code,
            name: item.name,
            required,
            currentStock: stock,
            surplus: stock - required,
            unit: item.unit,
          });
        }
      }

      // Shortages'ı shortage miktarına göre sırala (en kritik önce)
      shortages.sort((a, b) => b.shortage - a.shortage);

      predictions.push({
        targetYear,
        targetMonth,
        targetMonthName: MONTH_NAMES_TR[targetMonth],
        forecastedDemand,
        historicalData: monthData,
        trend,
        componentAnalysis: {
          totalComponentsNeeded: shortages.length + sufficient.length,
          shortages,
          sufficient,
        },
        canProduce: shortages.length === 0,
        maxProducibleWithCurrentStock: capacity.maxProducible,
      });
    }

    // Tüm aylar için toplam eksikler (satın alma listesi)
    const purchaseList: Record<string, { code: string; name: string; totalShortage: number; unit: string; months: string[] }> = {};

    for (const pred of predictions) {
      for (const shortage of pred.componentAnalysis.shortages) {
        if (!purchaseList[shortage.code]) {
          purchaseList[shortage.code] = {
            code: shortage.code,
            name: shortage.name,
            totalShortage: 0,
            unit: shortage.unit,
            months: [],
          };
        }
        purchaseList[shortage.code].totalShortage = Math.max(
          purchaseList[shortage.code].totalShortage,
          shortage.shortage,
        );
        purchaseList[shortage.code].months.push(pred.targetMonthName);
      }
    }

    res.json({
      product: sku,
      currentDate: `${currentYear}-${String(currentMonth).padStart(2, "0")}`,
      planningHorizon: `${monthsAhead} ay ileri`,
      predictions,
      purchaseSummary: {
        totalItemsToOrder: Object.keys(purchaseList).length,
        items: Object.values(purchaseList).sort((a, b) => b.totalShortage - a.totalShortage),
      },
      currentProductionCapacity: {
        maxProducible: capacity.maxProducible,
        topBottlenecks: capacity.bottlenecks.slice(0, 5),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SALES HISTORY CRUD
// ═══════════════════════════════════════════════════════════

// GET /api/planning/history/:sku — tüm satış geçmişi
router.get("/history/:sku", async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku as string;
    const rows = await db
      .select()
      .from(salesHistory)
      .where(eq(salesHistory.productSku, sku))
      .orderBy(desc(salesHistory.year), desc(salesHistory.month));

    res.json({ product: sku, totalRecords: rows.length, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/planning/history/:sku — satış geçmişini temizle (re-import için)
router.delete("/history/:sku", async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku as string;
    const deleted = await db
      .delete(salesHistory)
      .where(eq(salesHistory.productSku, sku))
      .returning();

    res.json({ success: true, deleted: deleted.length, message: `${sku} için ${deleted.length} kayıt silindi` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/planning/plans/:sku — üretim planları
router.get("/plans/:sku", async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku as string;
    const rows = await db
      .select()
      .from(productionPlans)
      .where(eq(productionPlans.productSku, sku))
      .orderBy(desc(productionPlans.targetYear), desc(productionPlans.targetMonth));

    res.json({ product: sku, plans: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/planning/plans — yeni üretim planı oluştur
router.post("/plans", async (req: Request, res: Response) => {
  try {
    const { product_sku, target_year, target_month, forecasted_demand, planned_production, component_gaps } = req.body;

    if (!product_sku || !target_year || !target_month || !forecasted_demand || !planned_production) {
      return res.status(400).json({ error: "product_sku, target_year, target_month, forecasted_demand, planned_production zorunlu" });
    }

    const [plan] = await db.insert(productionPlans).values({
      productSku: product_sku,
      targetYear: target_year,
      targetMonth: target_month,
      forecastedDemand: forecasted_demand,
      plannedProduction: planned_production,
      componentGaps: component_gaps || null,
    }).returning();

    res.json({ success: true, plan });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
