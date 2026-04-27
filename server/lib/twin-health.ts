// ═══════════════════════════════════════════════════════════
// DIGITAL TWIN HEALTH — FAZ 2 (2026-04-27)
//
// Vertex pattern: planned (engineering model) vs actual (sensor) divergence.
// Metrics: throughput, scrap, cycle_time, energy, stock_burn.
//
// Drift rules:
//   |variance%| <= 5  → ok
//   |variance%| 5-15  → warning (1-day)
//   |variance%| > 15  → critical (and 3+ consecutive days = drift_alert)
//
// Daily compute: aggregate yesterday's production_runs/energy_readings
// per entity (line/machine/sku) per metric and write digital_twin_divergence rows.
// ═══════════════════════════════════════════════════════════

import { db } from "../db";
import {
  digitalTwinDivergence, driftAlerts,
  productionRuns, machines, energyReadings, productionLines,
  stockMovementsV2, products, salesHistory,
} from "@shared/schema";
import { sql, eq, and, gte, lt, desc } from "drizzle-orm";

const DRIFT_WARN_PCT = 5;
const DRIFT_CRIT_PCT = 15;
const DRIFT_ALERT_CONSECUTIVE_DAYS = 3;

export type Metric = "throughput" | "scrap" | "cycle_time" | "energy" | "stock_burn";
export type EntityType = "line" | "machine" | "product";

interface VarianceRow {
  entityType: EntityType;
  entityId: string;
  metric: Metric;
  bucketDate: Date;
  plannedValue: number | null;
  actualValue: number | null;
  unit: string;
  sourceRunIds: number[];
}

function startOfDayUTC(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function variancePct(planned: number | null, actual: number | null): number | null {
  if (planned == null || actual == null) return null;
  if (planned === 0) return actual === 0 ? 0 : 100;
  return Number((((actual - planned) / planned) * 100).toFixed(2));
}

function classifyDrift(variancePct: number | null): "ok" | "warning" | "critical" {
  if (variancePct == null) return "ok";
  const abs = Math.abs(variancePct);
  if (abs > DRIFT_CRIT_PCT) return "critical";
  if (abs > DRIFT_WARN_PCT) return "warning";
  return "ok";
}

// ── Metric collectors (per-day aggregation) ──

async function collectThroughput(day: Date): Promise<VarianceRow[]> {
  const dayStart = startOfDayUTC(day);
  const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const runs = await db.select().from(productionRuns)
    .where(and(gte(productionRuns.startAt, dayStart), lt(productionRuns.startAt, dayEnd)));

  // Per-machine aggregation
  const byMachine = new Map<number, { planned: number; actual: number; ids: number[] }>();
  for (const r of runs) {
    if (!r.machineId) continue;
    const cur = byMachine.get(r.machineId) ?? { planned: 0, actual: 0, ids: [] };
    cur.planned += Number(r.plannedOutput ?? 0);
    cur.actual += Number(r.actualOutput ?? 0);
    cur.ids.push(r.id);
    byMachine.set(r.machineId, cur);
  }

  return Array.from(byMachine.entries()).map(([machineId, agg]) => ({
    entityType: "machine" as const,
    entityId: String(machineId),
    metric: "throughput" as const,
    bucketDate: dayStart,
    plannedValue: agg.planned,
    actualValue: agg.actual,
    unit: "adet",
    sourceRunIds: agg.ids,
  }));
}

async function collectScrap(day: Date): Promise<VarianceRow[]> {
  const dayStart = startOfDayUTC(day);
  const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const runs = await db.select().from(productionRuns)
    .where(and(gte(productionRuns.startAt, dayStart), lt(productionRuns.startAt, dayEnd)));

  const byMachine = new Map<number, { planned: number; actualScrap: number; produced: number; ids: number[] }>();
  for (const r of runs) {
    if (!r.machineId) continue;
    const cur = byMachine.get(r.machineId) ?? { planned: 0, actualScrap: 0, produced: 0, ids: [] };
    // Plan = expected scrap rate 2% of plannedOutput (hardcoded heuristic; tunable per machine)
    cur.planned += Number(r.plannedOutput ?? 0) * 0.02;
    cur.actualScrap += Number(r.scrapCount ?? 0);
    cur.produced += Number(r.actualOutput ?? 0);
    cur.ids.push(r.id);
    byMachine.set(r.machineId, cur);
  }

  return Array.from(byMachine.entries()).map(([machineId, agg]) => ({
    entityType: "machine" as const,
    entityId: String(machineId),
    metric: "scrap" as const,
    bucketDate: dayStart,
    plannedValue: agg.planned,
    actualValue: agg.actualScrap,
    unit: "adet",
    sourceRunIds: agg.ids,
  }));
}

async function collectCycleTime(day: Date): Promise<VarianceRow[]> {
  const dayStart = startOfDayUTC(day);
  const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const runs = await db.select().from(productionRuns)
    .where(and(gte(productionRuns.startAt, dayStart), lt(productionRuns.startAt, dayEnd)));
  const machineList = await db.select().from(machines);
  const machineMap = new Map(machineList.map(m => [m.id, m]));

  const out: VarianceRow[] = [];
  const byMachine = new Map<number, { actualCycleSum: number; runs: number; ids: number[] }>();
  for (const r of runs) {
    if (!r.machineId) continue;
    const cur = byMachine.get(r.machineId) ?? { actualCycleSum: 0, runs: 0, ids: [] };
    if (r.cycleTimeAvgSec != null) {
      cur.actualCycleSum += Number(r.cycleTimeAvgSec);
      cur.runs += 1;
    }
    cur.ids.push(r.id);
    byMachine.set(r.machineId, cur);
  }
  for (const [machineId, agg] of Array.from(byMachine.entries())) {
    const m = machineMap.get(machineId);
    const planned = m?.expectedCycleTimeSec ? Number(m.expectedCycleTimeSec) : null;
    const actual = agg.runs > 0 ? agg.actualCycleSum / agg.runs : null;
    out.push({
      entityType: "machine", entityId: String(machineId), metric: "cycle_time",
      bucketDate: dayStart, plannedValue: planned, actualValue: actual,
      unit: "sn", sourceRunIds: agg.ids,
    });
  }
  return out;
}

async function collectEnergy(day: Date): Promise<VarianceRow[]> {
  const dayStart = startOfDayUTC(day);
  const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const readings = await db.select().from(energyReadings)
    .where(and(gte(energyReadings.recordedAt, dayStart), lt(energyReadings.recordedAt, dayEnd)));

  const byMeter = new Map<number, { actualSum: number; ids: number[] }>();
  for (const r of readings) {
    const cur = byMeter.get(r.meterId) ?? { actualSum: 0, ids: [] };
    cur.actualSum += Number(r.delta ?? 0);
    if (r.productionRunId) cur.ids.push(r.productionRunId);
    byMeter.set(r.meterId, cur);
  }

  return Array.from(byMeter.entries()).map(([meterId, agg]) => ({
    entityType: "machine" as const,
    entityId: `meter:${meterId}`,
    metric: "energy" as const,
    bucketDate: dayStart,
    plannedValue: agg.actualSum * 0.95,  // baseline = 95% of measured (placeholder; tune per profile)
    actualValue: agg.actualSum,
    unit: "kWh",
    sourceRunIds: agg.ids,
  }));
}

async function collectStockBurn(day: Date): Promise<VarianceRow[]> {
  const dayStart = startOfDayUTC(day);
  const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const movements = await db.select().from(stockMovementsV2)
    .where(and(gte(stockMovementsV2.createdAt, dayStart), lt(stockMovementsV2.createdAt, dayEnd)));
  const productList = await db.select().from(products);
  const productMap = new Map(productList.map(p => [p.id, p]));

  // Forecasted daily burn = annual / 365 (rough; refines via DSE in FAZ 1 pipeline)
  const salesByProduct = await db.execute(sql`
    SELECT product_sku, SUM(quantity_sold) AS total
    FROM sales_history WHERE year >= EXTRACT(YEAR FROM NOW())::int - 1
    GROUP BY product_sku
  `);
  const annualByProduct = new Map<string, number>();
  for (const row of (salesByProduct.rows as any[])) {
    annualByProduct.set(row.product_sku, Number(row.total));
  }

  const byProduct = new Map<number, { actual: number; ids: number[] }>();
  for (const m of movements) {
    if (m.movementType !== "produced") continue;
    const cur = byProduct.get(m.productId) ?? { actual: 0, ids: [] };
    cur.actual += Number(m.quantity);
    byProduct.set(m.productId, cur);
  }

  const out: VarianceRow[] = [];
  for (const [productId, agg] of Array.from(byProduct.entries())) {
    const p = productMap.get(productId);
    if (!p?.sku) continue;
    const annual = annualByProduct.get(p.sku) ?? 0;
    const dailyExpected = annual / 365;
    out.push({
      entityType: "product", entityId: p.sku, metric: "stock_burn",
      bucketDate: dayStart, plannedValue: dailyExpected, actualValue: agg.actual,
      unit: "adet/gün", sourceRunIds: [],
    });
  }
  return out;
}

// ── Trend computation (lookback) ──

async function computeTrendForEntity(
  entityType: string, entityId: string, metric: Metric, bucketDate: Date
): Promise<{ trend7d: number | null; trend30d: number | null; consecutiveDriftDays: number }> {
  const day7Ago = new Date(bucketDate); day7Ago.setUTCDate(day7Ago.getUTCDate() - 7);
  const day30Ago = new Date(bucketDate); day30Ago.setUTCDate(day30Ago.getUTCDate() - 30);

  const recent = await db.select().from(digitalTwinDivergence)
    .where(and(
      eq(digitalTwinDivergence.entityType, entityType),
      eq(digitalTwinDivergence.entityId, entityId),
      eq(digitalTwinDivergence.metric, metric),
      gte(digitalTwinDivergence.bucketDate, day30Ago),
      lt(digitalTwinDivergence.bucketDate, bucketDate),
    ))
    .orderBy(desc(digitalTwinDivergence.bucketDate));

  const last7 = recent.filter(r => r.bucketDate >= day7Ago);
  const avg7 = last7.length > 0 ? last7.reduce((s, r) => s + Number(r.variancePercent ?? 0), 0) / last7.length : null;
  const avg30 = recent.length > 0 ? recent.reduce((s, r) => s + Number(r.variancePercent ?? 0), 0) / recent.length : null;

  // consecutive drift days going backwards
  let consecutive = 0;
  for (const r of recent) {
    if (Math.abs(Number(r.variancePercent ?? 0)) > DRIFT_CRIT_PCT) consecutive++;
    else break;
  }

  return {
    trend7d: avg7 != null ? Number(avg7.toFixed(2)) : null,
    trend30d: avg30 != null ? Number(avg30.toFixed(2)) : null,
    consecutiveDriftDays: consecutive,
  };
}

// ── Main public entry: compute one day's variances + alerts ──

export interface ComputeResult {
  day: string;
  rowsWritten: number;
  alertsRaised: number;
  byMetric: Record<string, number>;
}

export async function computeDailyVariance(opts: { day?: Date } = {}): Promise<ComputeResult> {
  const day = opts.day ?? (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d; })();
  const dayStart = startOfDayUTC(day);

  const collectors = [
    collectThroughput(dayStart),
    collectScrap(dayStart),
    collectCycleTime(dayStart),
    collectEnergy(dayStart),
    collectStockBurn(dayStart),
  ];
  const allRows: VarianceRow[] = (await Promise.all(collectors)).flat();

  const byMetric: Record<string, number> = {};
  let alertsRaised = 0;

  for (const r of allRows) {
    const vPct = variancePct(r.plannedValue, r.actualValue);
    const trend = await computeTrendForEntity(r.entityType, r.entityId, r.metric, dayStart);
    const consecutive = (vPct != null && Math.abs(vPct) > DRIFT_CRIT_PCT) ? trend.consecutiveDriftDays + 1 : 0;
    const drift = classifyDrift(vPct);

    await db.insert(digitalTwinDivergence).values({
      entityType: r.entityType, entityId: r.entityId, metric: r.metric,
      bucketDate: dayStart,
      plannedValue: r.plannedValue?.toString(), actualValue: r.actualValue?.toString(),
      unit: r.unit,
      variancePercent: vPct?.toString(),
      trend7d: trend.trend7d?.toString(),
      trend30d: trend.trend30d?.toString(),
      driftStatus: drift, consecutiveDriftDays: consecutive,
      sourceRunIds: r.sourceRunIds,
    }).onConflictDoUpdate({
      target: [digitalTwinDivergence.entityType, digitalTwinDivergence.entityId,
               digitalTwinDivergence.metric, digitalTwinDivergence.bucketDate],
      set: {
        plannedValue: r.plannedValue?.toString(), actualValue: r.actualValue?.toString(),
        variancePercent: vPct?.toString(),
        trend7d: trend.trend7d?.toString(), trend30d: trend.trend30d?.toString(),
        driftStatus: drift, consecutiveDriftDays: consecutive,
        sourceRunIds: r.sourceRunIds, computedAt: new Date(),
      },
    });

    byMetric[r.metric] = (byMetric[r.metric] ?? 0) + 1;

    // Raise drift alert if 3+ consecutive critical days
    if (consecutive >= DRIFT_ALERT_CONSECUTIVE_DAYS && drift === "critical") {
      const direction = (vPct ?? 0) > 0 ? "yüksek" : "düşük";
      await db.insert(driftAlerts).values({
        entityType: r.entityType, entityId: r.entityId, metric: r.metric,
        severity: "critical", variancePercent: vPct?.toString() ?? "0",
        consecutiveDriftDays: consecutive,
        message: `${r.entityType} ${r.entityId} ${r.metric} ${consecutive} gündür planlanandan ${direction} (variance ${vPct?.toFixed(1)}%)`,
        recommendedAction: r.metric === "scrap" ? "Hat denetimi + setup gözden geçirilsin" :
                          r.metric === "throughput" ? "Kapasite analizi + bottleneck inceleme" :
                          r.metric === "cycle_time" ? "Makine kalibrasyonu + operatör eğitimi" :
                          r.metric === "energy" ? "Enerji verimliliği denetimi" :
                          "Talep planı yeniden değerlendirilsin",
      });
      alertsRaised++;
    }
  }

  return {
    day: dayStart.toISOString().slice(0, 10),
    rowsWritten: allRows.length,
    alertsRaised,
    byMetric,
  };
}

// ── Read-side helpers ──

export async function getDashboard(opts: { metric?: Metric; entityType?: EntityType; days?: number } = {}) {
  const days = Math.min(opts.days ?? 30, 90);
  const since = new Date(); since.setUTCDate(since.getUTCDate() - days);

  const conditions: any[] = [gte(digitalTwinDivergence.bucketDate, since)];
  if (opts.metric) conditions.push(eq(digitalTwinDivergence.metric, opts.metric));
  if (opts.entityType) conditions.push(eq(digitalTwinDivergence.entityType, opts.entityType));

  const rows = await db.select().from(digitalTwinDivergence)
    .where(and(...conditions))
    .orderBy(desc(digitalTwinDivergence.bucketDate));

  const summary = {
    totalRows: rows.length,
    okCount: rows.filter(r => r.driftStatus === "ok").length,
    warningCount: rows.filter(r => r.driftStatus === "warning").length,
    criticalCount: rows.filter(r => r.driftStatus === "critical").length,
  };

  return { rows, summary };
}

export async function getOpenAlerts() {
  const alerts = await db.select().from(driftAlerts)
    .where(eq(driftAlerts.status, "open"))
    .orderBy(desc(driftAlerts.raisedAt));
  return alerts;
}

export async function acknowledgeAlert(id: number, by: string) {
  await db.update(driftAlerts).set({
    status: "acknowledged", acknowledgedBy: by,
  }).where(eq(driftAlerts.id, id));
}
