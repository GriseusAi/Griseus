/**
 * Dynamic Seasonality Engine (DSE)
 *
 * Statik mevsimsel indeksler → EWMA ile öğrenen dinamik indeksler.
 *
 * Matematik:
 *   S(ay, t+1) = λ × actual_demand(ay, t) / μ + (1 - λ) × S(ay, t)
 *   λ = 0.3 (son yılı %30 ağırlıkla al)
 *
 * Anomali tespiti:
 *   |actual - predicted| > 2σ → "yeni trend mi?" flag
 *
 * ATE ile birlikte çalışır: ATE eşikleri, DSE tahminleri adapte eder.
 */
import { db } from "../db";
import { seasonalIndices, salesHistory } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logAudit } from "./audit";
import {
  MONTHLY_DEMAND, SEASONAL_INDICES as STATIC_INDICES,
  YEARLY_TOTAL, MONTHLY_AVG, MONTH_LABELS,
  getMonthlyDemandForSku,
} from "./seasonal-constants";
import { MAIN_SKU } from "./constants";
import { products, bomItems as bomItemsTable } from "@shared/schema";

// ══════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════

/** EWMA learning rate — son yılı %30 ağırlıkla al */
const EWMA_LAMBDA = 0.3;

/** Anomali tespiti — kaç sigma üstü anormal? */
const ANOMALY_SIGMA = 2.0;

/** Hızlı adaptasyon lambda'sı — kullanıcı onayladığında */
const FAST_LAMBDA = 0.5;

/** Minimum sample count for dynamic indices to be trusted */
const MIN_SAMPLES_FOR_DYNAMIC = 1;

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export interface DynamicSeasonalData {
  month: number;
  monthLabel: string;
  baselineDemand: number;
  baselineIndex: number;
  dynamicDemand: number;
  dynamicIndex: number;
  sampleCount: number;
  stdDev: number;
  lastActualDemand: number | null;
  lastActualYear: number | null;
  anomalyDetected: boolean;
  anomalyReason: string | null;
  drift: number; // dynamic vs baseline farkı (%)
}

export interface SeasonalDashboard {
  productSku: string;
  yearlyTotalBaseline: number;
  yearlyTotalDynamic: number;
  monthlyAvgDynamic: number;
  months: DynamicSeasonalData[];
  anomalies: DynamicSeasonalData[];
  driftSummary: {
    maxPositiveDrift: { month: string; drift: number } | null;
    maxNegativeDrift: { month: string; drift: number } | null;
    avgAbsDrift: number;
    isSignificantShift: boolean; // ortalama drift > %15
  };
}

// ══════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ══════════════════════════════════════════════════════════

/** Cache: tenantId:sku → 12 dinamik indeks */
const indexCache = new Map<string, number[]>();

function cacheKey(tenantId: string, sku: string): string {
  return `${tenantId}:${sku}`;
}

// ══════════════════════════════════════════════════════════
// CORE: DİNAMİK İNDEKS GETİRME
// ══════════════════════════════════════════════════════════

/**
 * Dinamik mevsimsel indeksleri getir — tüm sistem bunu çağırır.
 * Cache'de varsa direkt döner, yoksa DB'den çeker, DB'de yoksa statik fallback.
 */
export async function getDynamicIndices(
  tenantId: string = "cukurova",
  sku: string = MAIN_SKU,
): Promise<number[]> {
  const key = cacheKey(tenantId, sku);
  const cached = indexCache.get(key);
  if (cached) return cached;

  try {
    const rows = await db.select()
      .from(seasonalIndices)
      .where(and(
        eq(seasonalIndices.tenantId, tenantId),
        eq(seasonalIndices.productSku, sku),
      ))
      .orderBy(seasonalIndices.month);

    if (rows.length === 12) {
      const indices = rows.map(r => Number(r.dynamicIndex));
      indexCache.set(key, indices);
      return indices;
    }
  } catch (err) {
    console.error("[DSE] Index fetch error:", err);
  }

  // Fallback: for MAIN_SKU use static indices, for others compute from sales_history
  if (sku !== MAIN_SKU) {
    try {
      const { demand, annual } = await getMonthlyDemandForSku(sku);
      if (annual > 0) {
        const avg = annual / 12;
        const computed = demand.map(d => d / avg);
        indexCache.set(key, computed);
        return computed;
      }
    } catch (err) {
      console.error("[DSE] Fallback index computation error for", sku, err);
    }
  }
  return [...STATIC_INDICES];
}

/**
 * Dinamik aylık talebi getir — MONTHLY_DEMAND yerine kullanılır.
 */
export async function getDynamicDemand(
  tenantId: string = "cukurova",
  sku: string = MAIN_SKU,
): Promise<number[]> {
  try {
    const rows = await db.select()
      .from(seasonalIndices)
      .where(and(
        eq(seasonalIndices.tenantId, tenantId),
        eq(seasonalIndices.productSku, sku),
      ))
      .orderBy(seasonalIndices.month);

    if (rows.length === 12) {
      return rows.map(r => Number(r.dynamicDemand));
    }
  } catch (err) {
    console.error("[DSE] Demand fetch error:", err);
  }

  return [...MONTHLY_DEMAND];
}

/**
 * Dinamik yıllık toplam ve aylık ortalama.
 */
export async function getDynamicTotals(
  tenantId: string = "cukurova",
  sku: string = MAIN_SKU,
): Promise<{ yearlyTotal: number; monthlyAvg: number }> {
  const demand = await getDynamicDemand(tenantId, sku);
  const yearlyTotal = demand.reduce((a, b) => a + b, 0);
  return { yearlyTotal, monthlyAvg: yearlyTotal / 12 };
}

// ══════════════════════════════════════════════════════════
// CORE: EWMA GÜNCELLEME
// ══════════════════════════════════════════════════════════

/**
 * Yeni satış verisi geldiğinde mevsimsel indeksi güncelle.
 *
 * EWMA: S(t+1) = λ × actual/μ + (1-λ) × S(t)
 *
 * @param month 0-indexed (Oca=0)
 * @param actualDemand gerçek talep miktarı
 * @param year hangi yılın verisi
 * @param useFastLambda anomali onaylandıysa hızlı adaptasyon
 */
export async function updateSeasonalIndex(
  month: number,
  actualDemand: number,
  year: number,
  tenantId: string = "cukurova",
  sku: string = MAIN_SKU,
  useFastLambda: boolean = false,
): Promise<{ anomalyDetected: boolean; anomalyReason: string | null }> {
  const lambda = useFastLambda ? FAST_LAMBDA : EWMA_LAMBDA;

  // Mevcut indeksi çek veya oluştur
  const [existing] = await db.select()
    .from(seasonalIndices)
    .where(and(
      eq(seasonalIndices.tenantId, tenantId),
      eq(seasonalIndices.productSku, sku),
      eq(seasonalIndices.month, month),
    ))
    .limit(1);

  const baselineDemand = MONTHLY_DEMAND[month];
  const baselineIndex = STATIC_INDICES[month];

  if (!existing) {
    // İlk kez — baseline'dan başlat
    const newIndex = actualDemand / MONTHLY_AVG;
    await db.insert(seasonalIndices).values({
      tenantId,
      productSku: sku,
      month,
      baselineDemand: String(baselineDemand),
      baselineIndex: String(baselineIndex),
      dynamicDemand: String(actualDemand),
      dynamicIndex: String(newIndex),
      sampleCount: 1,
      stdDev: "0",
      lastActualDemand: String(actualDemand),
      lastActualYear: year,
    });

    invalidateCache(tenantId, sku);
    return { anomalyDetected: false, anomalyReason: null };
  }

  const oldDynamic = Number(existing.dynamicDemand);
  const oldIndex = Number(existing.dynamicIndex);
  const oldStdDev = Number(existing.stdDev);
  const sampleCount = (existing.sampleCount ?? 0) + 1;

  // EWMA güncelleme
  const newDynamic = lambda * actualDemand + (1 - lambda) * oldDynamic;
  const currentAvg = await computeCurrentAvg(tenantId, sku, newDynamic, month);
  const newIndex = currentAvg > 0 ? newDynamic / currentAvg : baselineIndex;

  // Running std dev güncelleme (Welford's algorithm simplified)
  const diff = actualDemand - oldDynamic;
  const newStdDev = Math.sqrt(
    (oldStdDev * oldStdDev * Math.max(1, sampleCount - 2) + diff * diff) / Math.max(1, sampleCount - 1)
  );

  // Anomali tespiti
  let anomalyDetected = false;
  let anomalyReason: string | null = null;

  if (sampleCount >= 2 && oldStdDev > 0) {
    const zScore = Math.abs(actualDemand - oldDynamic) / oldStdDev;
    if (zScore > ANOMALY_SIGMA) {
      anomalyDetected = true;
      const direction = actualDemand > oldDynamic ? "üstünde" : "altında";
      anomalyReason = `${MONTH_LABELS[month]} ${year}: gerçek talep (${actualDemand}) beklentinin ${zScore.toFixed(1)}σ ${direction} (beklenen: ${Math.round(oldDynamic)}, σ: ${Math.round(oldStdDev)})`;

      logAudit({
        entity: "seasonal_index",
        entityId: `${sku}:${month}`,
        action: "update",
        field: "anomaly",
        previousValue: Math.round(oldDynamic),
        newValue: actualDemand,
        reason: anomalyReason,
        actor: "dse_engine",
        metadata: { zScore, sigma: oldStdDev, month, year },
      });
    }
  }

  // DB güncelle
  await db.update(seasonalIndices).set({
    dynamicDemand: String(Math.round(newDynamic * 10) / 10),
    dynamicIndex: String(Math.round(newIndex * 1000) / 1000),
    sampleCount,
    stdDev: String(Math.round(newStdDev * 10) / 10),
    lastActualDemand: String(actualDemand),
    lastActualYear: year,
    anomalyDetected,
    anomalyReason,
    updatedAt: new Date(),
  }).where(eq(seasonalIndices.id, existing.id));

  // Cache invalidate
  invalidateCache(tenantId, sku);

  // Audit log (her güncelleme)
  if (Math.abs(newIndex - oldIndex) > 0.05) {
    logAudit({
      entity: "seasonal_index",
      entityId: `${sku}:${month}`,
      action: "update",
      field: "dynamicIndex",
      previousValue: oldIndex,
      newValue: Math.round(newIndex * 1000) / 1000,
      reason: `EWMA güncelleme: ${MONTH_LABELS[month]} ${year} gerçek talep ${actualDemand} (λ=${lambda})`,
      actor: "dse_engine",
      metadata: { oldDemand: oldDynamic, newDemand: newDynamic, lambda },
    });
  }

  console.log(`[DSE] ${MONTH_LABELS[month]} ${year}: ${Math.round(oldDynamic)} → ${Math.round(newDynamic)} (idx: ${oldIndex.toFixed(3)} → ${newIndex.toFixed(3)})${anomalyDetected ? " ⚠️ ANOMALY" : ""}`);

  return { anomalyDetected, anomalyReason };
}

/** Toplu güncelleme — satış verisi importu sonrası */
export async function bulkUpdateFromSalesHistory(
  tenantId: string = "cukurova",
  sku: string = MAIN_SKU,
): Promise<{ updated: number; anomalies: string[] }> {
  // salesHistory'den tüm veriyi çek, yıl+ay bazında
  const rows = await db.select({
    year: salesHistory.year,
    month: salesHistory.month,
    qty: salesHistory.quantitySold,
  })
    .from(salesHistory)
    .where(eq(salesHistory.productSku, sku))
    .orderBy(salesHistory.year, salesHistory.month);

  let updated = 0;
  const anomalies: string[] = [];

  for (const row of rows) {
    const monthIdx = row.month - 1; // salesHistory 1-indexed, biz 0-indexed
    if (monthIdx < 0 || monthIdx > 11) continue;

    const result = await updateSeasonalIndex(monthIdx, row.qty, row.year, tenantId, sku);
    updated++;
    if (result.anomalyDetected && result.anomalyReason) {
      anomalies.push(result.anomalyReason);
    }
  }

  return { updated, anomalies };
}

// ══════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════

export async function getSeasonalDashboard(
  tenantId: string = "cukurova",
  sku: string = MAIN_SKU,
): Promise<SeasonalDashboard> {
  const rows = await db.select()
    .from(seasonalIndices)
    .where(and(
      eq(seasonalIndices.tenantId, tenantId),
      eq(seasonalIndices.productSku, sku),
    ))
    .orderBy(seasonalIndices.month);

  // Eğer DB'de yoksa statik baseline'dan oluştur
  const months: DynamicSeasonalData[] = Array.from({ length: 12 }, (_, i) => {
    const dbRow = rows.find(r => r.month === i);
    const bl = MONTHLY_DEMAND[i];
    const blIdx = STATIC_INDICES[i];

    if (dbRow) {
      const dynDemand = Number(dbRow.dynamicDemand);
      const dynIdx = Number(dbRow.dynamicIndex);
      const drift = blIdx > 0 ? ((dynIdx - blIdx) / blIdx) * 100 : 0;
      return {
        month: i,
        monthLabel: MONTH_LABELS[i],
        baselineDemand: bl,
        baselineIndex: Math.round(blIdx * 1000) / 1000,
        dynamicDemand: Math.round(dynDemand),
        dynamicIndex: Math.round(dynIdx * 1000) / 1000,
        sampleCount: dbRow.sampleCount ?? 0,
        stdDev: Math.round(Number(dbRow.stdDev)),
        lastActualDemand: dbRow.lastActualDemand ? Number(dbRow.lastActualDemand) : null,
        lastActualYear: dbRow.lastActualYear,
        anomalyDetected: dbRow.anomalyDetected ?? false,
        anomalyReason: dbRow.anomalyReason,
        drift: Math.round(drift * 10) / 10,
      };
    }

    return {
      month: i,
      monthLabel: MONTH_LABELS[i],
      baselineDemand: bl,
      baselineIndex: Math.round(blIdx * 1000) / 1000,
      dynamicDemand: bl,
      dynamicIndex: Math.round(blIdx * 1000) / 1000,
      sampleCount: 0,
      stdDev: 0,
      lastActualDemand: null,
      lastActualYear: null,
      anomalyDetected: false,
      anomalyReason: null,
      drift: 0,
    };
  });

  const yearlyDynamic = months.reduce((s, m) => s + m.dynamicDemand, 0);
  const anomalies = months.filter(m => m.anomalyDetected);

  // Drift analizi
  const drifts = months.map(m => ({ month: m.monthLabel, drift: m.drift }));
  const absDrifts = drifts.map(d => Math.abs(d.drift));
  const maxPos = drifts.reduce((best, d) => d.drift > (best?.drift ?? -Infinity) ? d : best, drifts[0]);
  const maxNeg = drifts.reduce((best, d) => d.drift < (best?.drift ?? Infinity) ? d : best, drifts[0]);
  const avgAbsDrift = absDrifts.reduce((a, b) => a + b, 0) / 12;

  return {
    productSku: sku,
    yearlyTotalBaseline: YEARLY_TOTAL,
    yearlyTotalDynamic: Math.round(yearlyDynamic),
    monthlyAvgDynamic: Math.round(yearlyDynamic / 12),
    months,
    anomalies,
    driftSummary: {
      maxPositiveDrift: maxPos.drift > 0 ? { month: maxPos.month, drift: maxPos.drift } : null,
      maxNegativeDrift: maxNeg.drift < 0 ? { month: maxNeg.month, drift: maxNeg.drift } : null,
      avgAbsDrift: Math.round(avgAbsDrift * 10) / 10,
      isSignificantShift: avgAbsDrift > 15,
    },
  };
}

// ══════════════════════════════════════════════════════════
// INIT — sunucu başlangıcı
// ══════════════════════════════════════════════════════════

/** Statik baseline'dan seed et (DB boşsa) */
export async function initDSE(
  tenantId: string = "cukurova",
  sku: string = MAIN_SKU,
): Promise<void> {
  try {
    const existing = await db.select({ count: sql<number>`COUNT(*)` })
      .from(seasonalIndices)
      .where(and(
        eq(seasonalIndices.tenantId, tenantId),
        eq(seasonalIndices.productSku, sku),
      ));

    if (Number(existing[0].count) >= 12) {
      console.log("[DSE] Seasonal indices already seeded");
      // Cache'i doldur
      await getDynamicIndices(tenantId, sku);
      return;
    }

    // Statik baseline'dan seed
    const values = MONTHLY_DEMAND.map((demand, month) => ({
      tenantId,
      productSku: sku,
      month,
      baselineDemand: String(demand),
      baselineIndex: String(STATIC_INDICES[month]),
      dynamicDemand: String(demand),
      dynamicIndex: String(STATIC_INDICES[month]),
      sampleCount: 3, // 3 yıl ortalamasından başlıyoruz
      stdDev: String(Math.round(demand * 0.2)), // %20 başlangıç volatilitesi
    }));

    await db.insert(seasonalIndices).values(values);

    // Eğer salesHistory varsa, onlardan da EWMA geçir
    const salesCount = await db.select({ count: sql<number>`COUNT(*)` })
      .from(salesHistory)
      .where(eq(salesHistory.productSku, sku));

    if (Number(salesCount[0].count) > 0) {
      const result = await bulkUpdateFromSalesHistory(tenantId, sku);
      console.log(`[DSE] Initialized from salesHistory: ${result.updated} updates, ${result.anomalies.length} anomalies`);
    } else {
      console.log("[DSE] Initialized with static baseline (no sales data yet)");
    }

    // Cache'i doldur
    await getDynamicIndices(tenantId, sku);
  } catch (err) {
    console.error("[DSE] Init error:", err);
  }
}

/**
 * Initialize seasonal indices for ALL products that have BOM items.
 * For MAIN_SKU: seeds from static MONTHLY_DEMAND.
 * For other SKUs: seeds from sales_history via getMonthlyDemandForSku.
 */
export async function initAllProducts(tenantId: string = "cukurova"): Promise<void> {
  // Always init MAIN_SKU first (uses static baseline)
  await initDSE(tenantId, MAIN_SKU);

  try {
    // Find all product SKUs that have BOM items (excluding MAIN_SKU, already done)
    const rows = await db.selectDistinct({ sku: bomItemsTable.parentProductSku })
      .from(bomItemsTable);

    const skus = rows
      .map(r => r.sku)
      .filter(s => s && s !== MAIN_SKU);

    for (const sku of skus) {
      await initDSEForProduct(tenantId, sku);
    }

    console.log(`[DSE] initAllProducts complete: MAIN_SKU + ${skus.length} additional products`);
  } catch (err) {
    console.error("[DSE] initAllProducts error:", err);
  }
}

/**
 * Initialize seasonal indices for a non-MAIN product.
 * Seeds baseline from sales_history instead of static MONTHLY_DEMAND.
 */
async function initDSEForProduct(tenantId: string, sku: string): Promise<void> {
  try {
    const existing = await db.select({ count: sql<number>`COUNT(*)` })
      .from(seasonalIndices)
      .where(and(
        eq(seasonalIndices.tenantId, tenantId),
        eq(seasonalIndices.productSku, sku),
      ));

    if (Number(existing[0].count) >= 12) {
      console.log(`[DSE] Seasonal indices already seeded for ${sku}`);
      await getDynamicIndices(tenantId, sku);
      return;
    }

    // Get demand from sales_history
    const { demand, annual } = await getMonthlyDemandForSku(sku);
    const avg = annual > 0 ? annual / 12 : 1;

    const values = demand.map((d, month) => ({
      tenantId,
      productSku: sku,
      month,
      baselineDemand: String(d),
      baselineIndex: String(avg > 0 ? d / avg : 1),
      dynamicDemand: String(d),
      dynamicIndex: String(avg > 0 ? d / avg : 1),
      sampleCount: annual > 0 ? 3 : 0,
      stdDev: String(Math.round(d * 0.2)),
    }));

    await db.insert(seasonalIndices).values(values);

    // Run EWMA over existing sales history
    const salesCount = await db.select({ count: sql<number>`COUNT(*)` })
      .from(salesHistory)
      .where(eq(salesHistory.productSku, sku));

    if (Number(salesCount[0].count) > 0) {
      const result = await bulkUpdateFromSalesHistory(tenantId, sku);
      console.log(`[DSE] ${sku}: initialized from salesHistory — ${result.updated} updates, ${result.anomalies.length} anomalies`);
    } else {
      console.log(`[DSE] ${sku}: initialized with sales_history baseline (no raw sales data)`);
    }

    await getDynamicIndices(tenantId, sku);
  } catch (err) {
    console.error(`[DSE] initDSEForProduct error for ${sku}:`, err);
  }
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

/** Güncel ortalama hesapla — EWMA sonrası */
async function computeCurrentAvg(
  tenantId: string,
  sku: string,
  updatedDemand: number,
  updatedMonth: number,
): Promise<number> {
  try {
    const rows = await db.select({
      month: seasonalIndices.month,
      demand: seasonalIndices.dynamicDemand,
    })
      .from(seasonalIndices)
      .where(and(
        eq(seasonalIndices.tenantId, tenantId),
        eq(seasonalIndices.productSku, sku),
      ));

    let total = 0;
    let count = 0;
    for (const r of rows) {
      if (r.month === updatedMonth) {
        total += updatedDemand;
      } else {
        total += Number(r.demand);
      }
      count++;
    }

    // Eksik aylar için baseline kullan
    for (let m = 0; m < 12; m++) {
      if (!rows.find(r => r.month === m)) {
        total += MONTHLY_DEMAND[m];
        count++;
      }
    }

    return count > 0 ? total / count : MONTHLY_AVG;
  } catch {
    return MONTHLY_AVG;
  }
}

/** Cache invalidate */
function invalidateCache(tenantId: string, sku: string): void {
  indexCache.delete(cacheKey(tenantId, sku));
}
