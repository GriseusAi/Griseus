import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { salesHistory, productionPlans, bomItems, componentStock, seasonalIndices } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import multer from "multer";
import XLSX from "xlsx";
import { getBomWithStock, computeProductionCapacity } from "./bom";
import { MAIN_SKU } from "../lib/constants";
import { recordLineage } from "./foundry";
import { broadcastEntityChanged } from "../ws";
import { bulkUpdateFromSalesHistory } from "../lib/dynamic-seasonality";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PLAN_COLORS = {
  ok: "#238551",
  warn: "#C87619",
  err: "#CD4246",
  blue: "#2D72D2",
  accent: "#D97757",
};

type PlanningLineInput = {
  id?: string;
  customer?: string;
  sku?: string;
  quantity?: number;
  deadline?: string;
  fromWarehouse?: number;
  toProduce?: number;
  maxProducible?: number | null;
};

type SupplyLineInput = {
  id?: string;
  componentCode?: string;
  quantity?: number | null;
  eta?: string;
  leadDays?: number | null;
  label?: string;
};

function parseDateYmd(v: string | undefined): Date | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDayMonth(d: Date) {
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }).replace(".", "");
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function taskPct(startDay: number, durationDays: number, totalDays: number) {
  return {
    startPct: clamp((startDay / totalDays) * 100, 0, 100),
    widthPct: clamp((durationDays / totalDays) * 100, 4, 100),
  };
}

function cleanCode(v: unknown) {
  return String(v ?? "").trim().toUpperCase();
}

// POST /api/planning/compute — selected canvas lines -> deterministic digital-twin plan
router.post("/compute", async (req: Request, res: Response) => {
  try {
    const lines = Array.isArray(req.body?.lines) ? req.body.lines as PlanningLineInput[] : [];
    const supplyLines = Array.isArray(req.body?.supplyLines) ? req.body.supplyLines as SupplyLineInput[] : [];
    const normalized = lines
      .map((line) => {
        const quantity = Math.max(0, Number(line.quantity ?? 0));
        const fromWarehouse = Math.max(0, Math.min(quantity, Number(line.fromWarehouse ?? 0)));
        const toProduce = Math.max(0, Number(line.toProduce ?? quantity - fromWarehouse));
        return {
          id: String(line.id ?? ""),
          customer: String(line.customer ?? "Müşteri"),
          sku: String(line.sku ?? "").trim(),
          quantity,
          deadline: String(line.deadline ?? ""),
          fromWarehouse,
          toProduce,
        };
      })
      .filter(line => line.sku && line.quantity > 0);
    const normalizedSupply = supplyLines
      .map((line) => ({
        id: String(line.id ?? ""),
        componentCode: cleanCode(line.componentCode),
        quantity: line.quantity === null || line.quantity === undefined ? null : Math.max(0, Number(line.quantity)),
        eta: String(line.eta ?? ""),
        leadDays: line.leadDays === null || line.leadDays === undefined ? null : Math.max(0, Number(line.leadDays)),
        label: String(line.label ?? ""),
      }))
      .filter(line => line.componentCode);

    if (normalized.length === 0) {
      return res.status(400).json({ error: "En az bir üretim hattı gerekli" });
    }

    const today = startOfToday();
    const capacityBySku = new Map<string, ReturnType<typeof computeProductionCapacity>>();
    for (const sku of Array.from(new Set(normalized.map(line => line.sku)))) {
      const bom = await getBomWithStock(sku);
      if (bom.length > 0) {
        capacityBySku.set(sku, computeProductionCapacity(bom, sku));
      }
    }

    const deadlines = normalized.map(line => parseDateYmd(line.deadline)).filter((d): d is Date => !!d);
    const latestDeadline = deadlines.length > 0
      ? new Date(Math.max(...deadlines.map(d => d.getTime())))
      : new Date(today.getTime() + 30 * 86400000);
    const horizonEnd = new Date(Math.max(latestDeadline.getTime(), today.getTime() + 30 * 86400000));
    const totalDays = Math.max(1, daysBetween(today, horizonEnd));
    const tickMid = new Date(today.getTime() + Math.round(totalDays / 2) * 86400000);
    const data: Record<string, any>[] = [{
      kind: "ticks",
      ticks: [
        { label: formatDayMonth(today), pct: 0 },
        { label: formatDayMonth(tickMid), pct: 50 },
        { label: formatDayMonth(horizonEnd), pct: 100 },
      ],
    }];
    const bullets: string[] = [];

    for (const line of normalized) {
      const capacity = capacityBySku.get(line.sku);
      const maxProducible = capacity?.maxProducible ?? line.toProduce;
      const bottlenecks = capacity?.bottlenecks ?? [];
      const producibleNow = Math.max(0, Math.min(line.toProduce, maxProducible));
      const blockedQty = Math.max(0, line.toProduce - producibleNow);
      const deadline = parseDateYmd(line.deadline) ?? horizonEnd;
      const daysToDeadline = Math.max(1, daysBetween(today, deadline));
      const lane = `${line.sku} x${line.quantity}`;
      const dailyCapacity = Math.max(8, Math.floor(Math.max(producibleNow, maxProducible, 30) / 8));
      const nowProductionDays = producibleNow > 0
        ? clamp(Math.ceil(producibleNow / dailyCapacity), 1, Math.max(1, daysToDeadline))
        : 0;
      const procurementDays = blockedQty > 0
        ? clamp(Math.ceil(blockedQty / dailyCapacity) + 7, 7, 21)
        : 0;
      const laterProductionDays = blockedQty > 0
        ? clamp(Math.ceil(blockedQty / dailyCapacity), 1, Math.max(1, daysToDeadline))
        : 0;
      const deliveryDay = Math.min(daysToDeadline, totalDays);
      let blockedResolved = false;
      let resolutionNote = "";

      if (line.fromWarehouse > 0) {
        const pct = taskPct(Math.max(0, deliveryDay - 2), 1, totalDays);
        data.push({
          kind: "task",
          lane,
          customer: line.customer,
          label: `x${line.fromWarehouse} depodan`,
          durationLabel: "hazır",
          color: PLAN_COLORS.blue,
          risk: false,
          note: `${line.sku}: ${line.fromWarehouse} adet bitmiş stoktan teslim edilebilir`,
          row: 0,
          ...pct,
        });
      }

      if (producibleNow > 0) {
        const pct = taskPct(0, nowProductionDays, totalDays);
        data.push({
          kind: "task",
          lane,
          customer: line.customer,
          label: `x${producibleNow} üretilebilir`,
          durationLabel: `${nowProductionDays} gün`,
          color: PLAN_COLORS.ok,
          risk: false,
          note: `${line.sku}: canlı BOM kapasitesiyle hemen üretilebilir miktar`,
          row: 0,
          ...pct,
        });
      }

      if (blockedQty > 0) {
        const critical = bottlenecks[0];
        const shortageUnits = critical
          ? Math.max(0, Math.ceil((line.toProduce - critical.maxProducts) * critical.required))
          : blockedQty;
        const matchingSupply = critical
          ? normalizedSupply.find(s => s.componentCode === cleanCode(critical.code) && (s.quantity ?? 0) > 0 && !!parseDateYmd(s.eta))
          : undefined;
        const supplyEta = parseDateYmd(matchingSupply?.eta);
        const supplyReadyDay = supplyEta ? Math.max(0, daysBetween(today, supplyEta) + 1) : null;
        const supplyCoversShortage = !!matchingSupply && (matchingSupply.quantity ?? 0) >= shortageUnits && supplyReadyDay !== null;
        const waitDays = supplyReadyDay ?? 0;
        const pct = taskPct(0, supplyCoversShortage ? Math.max(1, waitDays) : Math.max(1, Math.min(10, daysToDeadline)), totalDays);
        blockedResolved = supplyCoversShortage && waitDays + laterProductionDays <= deliveryDay;
        resolutionNote = supplyCoversShortage
          ? blockedResolved
            ? `${critical?.code ?? line.sku} tedariki teslimden önce kapanıyor`
            : `${critical?.code ?? line.sku} tedariki var ama teslim tarihine yetişmeyebilir`
          : "";
        data.push({
          kind: "task",
          lane,
          customer: line.customer,
          label: supplyCoversShortage ? `x${blockedQty} tedarik bekliyor` : `x${blockedQty} bloke · PO gerekli`,
          durationLabel: supplyCoversShortage ? `ETA ${formatDayMonth(supplyEta!)}` : "aksiyon gerekli",
          color: PLAN_COLORS.err,
          risk: true,
          note: critical
            ? supplyCoversShortage
              ? `${critical.code}: ${shortageUnits} adet açık; seçili PO ${matchingSupply!.quantity} adet, ETA ${matchingSupply!.eta}`
              : `${critical.code}: ${shortageUnits} adet açık; seçili ve yeterli PO/ETA yok`
            : `${line.sku}: ${blockedQty} adet kapasite dışında`,
          row: 1,
          ...pct,
        });

        if (supplyCoversShortage) {
          const laterStart = Math.min(waitDays, Math.max(0, deliveryDay - laterProductionDays - 1));
          const laterPct = taskPct(laterStart, laterProductionDays, totalDays);
          data.push({
            kind: "task",
            lane,
            customer: line.customer,
            label: `x${blockedQty} ikinci faz`,
            durationLabel: `${laterProductionDays} gün`,
            color: PLAN_COLORS.warn,
            risk: true,
            note: critical
              ? `${critical.code} tedariki ${matchingSupply!.eta} tarihinde kapanırsa üretime açılır`
              : "Eksik kapasite kapanırsa ikinci üretim fazı açılır",
            row: 2,
            ...laterPct,
          });
        }
      }

      data.push({
        kind: "task",
        lane,
        customer: line.customer,
        label: `teslim ${line.customer}`,
        startPct: clamp((deliveryDay / totalDays) * 100, 0, 100),
        widthPct: 3,
        durationLabel: formatDayMonth(deadline),
        color: blockedQty > 0 && !blockedResolved ? PLAN_COLORS.err : PLAN_COLORS.accent,
        risk: blockedQty > 0 && !blockedResolved,
        row: blockedQty > 0 ? 2 : 1,
        note: blockedQty > 0 && !blockedResolved
          ? `${line.sku}: ${blockedQty} adet bloke kaldığı için teslim riskli`
          : blockedQty > 0
            ? `${line.sku}: ${resolutionNote}; teslim planı kapasite içinde`
          : `${line.sku}: teslim planı kapasite içinde`,
      });

      if (blockedQty > 0) {
        const critical = bottlenecks[0];
        bullets.push(critical
          ? blockedResolved
            ? `${line.customer} · ${line.sku} x${line.quantity}: ${producibleNow} adet şimdi üretilebilir, ${blockedQty} adet ${critical.code} tedarikiyle ikinci faza alınır. Teslim riski kapandı.`
            : `${line.customer} · ${line.sku} x${line.quantity}: ${producibleNow} adet şimdi üretilebilir, ${blockedQty} adet ${critical.code} (${critical.name}) nedeniyle bloke. Limit ${critical.maxProducts}, gerekli üretim ${line.toProduce}.`
          : `${line.customer} · ${line.sku} x${line.quantity}: ${producibleNow} adet şimdi üretilebilir, ${blockedQty} adet kapasite dışında.`);
      } else if (line.toProduce === 0) {
        bullets.push(`${line.customer} · ${line.sku} x${line.quantity}: talebin tamamı depodan karşılanır.`);
      } else {
        bullets.push(`${line.customer} · ${line.sku} x${line.quantity}: ${line.toProduce} adet üretim canlı kapasite içinde.`);
      }
    }

    res.json({
      chartSpec: {
        type: "timeline",
        title: "Maksimum Kapasite Üretim Planı",
        xKey: "day",
        yLabel: "Hat",
        series: [],
        data,
      },
      plan: {
        title: "Digital-Twin Aksiyon Planı",
        bullets,
      },
    });
  } catch (error: any) {
    console.error("[planning/compute]", error);
    res.status(500).json({ error: error?.message ?? "planning compute failed" });
  }
});

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

    const productSku = req.body.product_sku as string;
    if (!productSku) {
      return res.status(400).json({ error: "product_sku gerekli" });
    }
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
// SINGLE POINT SALES EDIT — cihaz mini-chart drag-to-edit için
// ═══════════════════════════════════════════════════════════

// POST /api/planning/point — tek (sku, year, month) satış değeri upsert
router.post("/point", async (req: Request, res: Response) => {
  try {
    const { sku, year, month, quantity, source } = req.body ?? {};
    // Validation
    if (!sku || typeof sku !== "string") {
      return res.status(400).json({ error: "sku gerekli (string)" });
    }
    const y = parseInt(String(year));
    const m = parseInt(String(month));
    const q = parseInt(String(quantity));
    if (isNaN(y) || y < 2018 || y > 2035) {
      return res.status(400).json({ error: "year 2018-2035 arası olmalı" });
    }
    if (isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: "month 1-12 arası olmalı" });
    }
    if (isNaN(q) || q < 0) {
      return res.status(400).json({ error: "quantity >= 0 olmalı" });
    }

    // Upsert
    const existing = await db
      .select()
      .from(salesHistory)
      .where(
        and(
          eq(salesHistory.productSku, sku),
          eq(salesHistory.year, y),
          eq(salesHistory.month, m),
        ),
      );

    const previousValue = existing[0]?.quantitySold ?? null;
    let status: "inserted" | "updated";

    if (existing.length > 0) {
      await db
        .update(salesHistory)
        .set({
          quantitySold: q,
          source: (source as string) ?? "manual",
          importedAt: new Date(),
        })
        .where(eq(salesHistory.id, existing[0].id));
      status = "updated";
    } else {
      await db.insert(salesHistory).values({
        productSku: sku,
        year: y,
        month: m,
        quantitySold: q,
        source: (source as string) ?? "manual",
      });
      status = "inserted";
    }

    // Lineage
    recordLineage({
      entity: "sales_history",
      entityId: `${sku}-${y}-${m}`,
      field: "quantitySold",
      previousValue: previousValue !== null ? String(previousValue) : null,
      newValue: String(q),
      sourceType: "manual",
      sourceId: "ui_drag_edit",
      sourceName: `Canvas mini-chart edit: ${sku} ${m}/${y}`,
      actor: "user",
    }).catch(err => console.error("[planning/point] lineage error:", err));

    // WS broadcast — cache invalidation + orchestrator data_trigger
    broadcastEntityChanged({
      event: "entity_changed",
      entities: ["sales_history"],
      scope: sku,
      count: 1,
      source: "ui_drag_edit",
    });

    // DSE async recompute (sezonsal indeksler + urgency zinciri)
    bulkUpdateFromSalesHistory("cukurova", sku).catch(err =>
      console.error("[planning/point] DSE error:", err)
    );

    res.json({ ok: true, status, sku, year: y, month: m, quantity: q, previousValue });
  } catch (err: any) {
    console.error("[planning/point] error:", err);
    res.status(500).json({ error: err.message });
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
    const capacity = computeProductionCapacity(bomData, sku);

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

// DELETE /api/planning/history/:sku — satış geçmişini + DSE state'i temizle (re-import için)
// EWMA zehirlenmesi: seasonal_indices tablosu eski dynamicDemand'ı saklar; sales DELETE tek başına yeterli değil.
// Bu yüzden seasonal_indices kayıtlarını da siliyoruz ki bulkUpdateFromSalesHistory fresh başlasın.
router.delete("/history/:sku", async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku as string;
    const deleted = await db
      .delete(salesHistory)
      .where(eq(salesHistory.productSku, sku))
      .returning();

    const deletedSeasonal = await db
      .delete(seasonalIndices)
      .where(eq(seasonalIndices.productSku, sku))
      .returning();

    res.json({
      success: true,
      deleted: deleted.length,
      deletedSeasonal: deletedSeasonal.length,
      message: `${sku}: ${deleted.length} sales + ${deletedSeasonal.length} seasonal_indices silindi`,
    });
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
