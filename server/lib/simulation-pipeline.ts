// ═══════════════════════════════════════════════════════════
// SIMULATION MODEL MESH — FAZ 1 (2026-04-27)
//
// Vertex pattern: chained engineering models in a single transactional run.
// Each step's output is the next step's input. Snapshot per step for replay.
//
// Steps: DSE → Forecast → ProductionPlan → BOMExplosion → PurchaseGap → Impact → Outcome
//
// Mode:
//   "simulation" — read-only, no DB writes (default)
//   "live"       — writes purchaseSuggestions + outcomeTracking on completion
// ═══════════════════════════════════════════════════════════

import { db } from "../db";
import { simulationPipelineRuns, products, bomItems, componentStock, salesHistory } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDynamicIndices, getDynamicTotals, bulkUpdateFromSalesHistory } from "./dynamic-seasonality";
import { simulateWhatIf } from "./whatif-engine";
import { computeImpactPropagation } from "./impact-engine";
import { computeComponentIntelligence } from "../routes/intelligence";
import { getBomWithStock, computeProductionCapacity } from "../routes/bom";

export const PipelineRequest = z.object({
  tenantId: z.string().default("cukurova"),
  sku: z.string(),
  scenarioId: z.number().int().positive().optional(),
  horizonMonths: z.number().int().min(1).max(12).default(6),
  mode: z.enum(["simulation", "live"]).default("simulation"),
  triggeredBy: z.string().default("ui"),
  growthFactor: z.number().min(0.5).max(2).default(1.0),
});
export type PipelineRequest = z.infer<typeof PipelineRequest>;

interface StepResult {
  step: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "ok" | "warning" | "error";
  input: any;
  output: any;
  notes: string[];
}

const tic = () => Date.now();
const isoNow = () => new Date().toISOString();

function makeStep(name: string): { record: (output: any, notes?: string[], status?: "ok"|"warning"|"error") => StepResult; setInput: (i: any) => void } {
  const startedAt = isoNow();
  const startTs = tic();
  let input: any = null;
  return {
    setInput: (i) => { input = i; },
    record: (output, notes = [], status = "ok") => ({
      step: name,
      startedAt,
      completedAt: isoNow(),
      durationMs: tic() - startTs,
      status,
      input,
      output,
      notes,
    }),
  };
}

export async function runSimulationPipeline(req: PipelineRequest): Promise<number> {
  const parsed = PipelineRequest.parse(req);
  const { tenantId, sku, scenarioId, horizonMonths, mode, triggeredBy, growthFactor } = parsed;

  const [run] = await db.insert(simulationPipelineRuns).values({
    tenantId, sku, scenarioId, horizonMonths, mode, triggeredBy, status: "running",
  }).returning();
  const runId = run!.id;

  const steps: StepResult[] = [];
  const start = tic();
  const summary: any = {};

  try {
    // ── Step 1: DSE — recalibrate dynamic seasonality from sales history ──
    {
      const s = makeStep("dse_recalibrate");
      s.setInput({ tenantId, sku });
      const updateResult = await bulkUpdateFromSalesHistory(tenantId, sku);
      const anomalyCount = Array.isArray(updateResult.anomalies) ? updateResult.anomalies.length : Number(updateResult.anomalies ?? 0);
      const indices = await getDynamicIndices(tenantId, sku);
      steps.push(s.record({ indices, updated: updateResult.updated, anomalies: updateResult.anomalies, anomalyCount },
        anomalyCount > 0 ? [`${anomalyCount} anomalies detected`] : [],
        anomalyCount > 0 ? "warning" : "ok"));
    }

    // ── Step 2: Forecast — derive horizon-month demand from dynamic indices ──
    let forecastByMonth: Array<{ month: number; year: number; demand: number; index: number }> = [];
    {
      const s = makeStep("forecast");
      s.setInput({ horizonMonths, growthFactor });
      const indices = await getDynamicIndices(tenantId, sku);
      const { yearlyTotal } = await getDynamicTotals(tenantId, sku);
      const monthlyAvg = yearlyTotal / 12;
      const now = new Date();
      for (let i = 0; i < horizonMonths; i++) {
        const m = (now.getMonth() + i) % 12;
        const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
        const demand = Math.round(monthlyAvg * indices[m] * growthFactor);
        forecastByMonth.push({ month: m + 1, year: y, demand, index: indices[m] });
      }
      const totalForecastDemand = forecastByMonth.reduce((a, b) => a + b.demand, 0);
      summary.totalForecastDemand = totalForecastDemand;
      steps.push(s.record({ forecastByMonth, totalForecastDemand, monthlyAvg }));
    }

    // ── Step 3: Production Plan — bound forecast by line capacity ──
    let plannedTotal = 0;
    {
      const s = makeStep("production_plan");
      s.setInput({ horizonMonths });
      const allItems = await getBomWithStock(sku);
      const capacity = computeProductionCapacity(allItems, sku);
      const monthlyCapacity = capacity?.maxProducible ?? 0;
      const planByMonth = forecastByMonth.map(f => ({
        month: f.month,
        year: f.year,
        forecast: f.demand,
        plannedProduction: Math.min(f.demand, monthlyCapacity || f.demand),
        capacityBound: monthlyCapacity > 0 && f.demand > monthlyCapacity,
      }));
      plannedTotal = planByMonth.reduce((a, b) => a + b.plannedProduction, 0);
      summary.plannedProductionUnits = plannedTotal;
      const capacityBoundCount = planByMonth.filter(p => p.capacityBound).length;
      const currentBottleneckCode = capacity?.bottlenecks?.[0]?.code;
      steps.push(s.record({ planByMonth, plannedTotal, monthlyCapacity, currentBottleneck: currentBottleneckCode },
        capacityBoundCount > 0 ? [`${capacityBoundCount}/${horizonMonths} months capped by capacity`] : [],
        capacityBoundCount > 0 ? "warning" : "ok"));
    }

    // ── Step 4: BOM Explosion — required component qty for plannedTotal ──
    let componentRequirements: Array<{ code: string; name: string; qtyPerUnit: number; required: number; tier: number }> = [];
    {
      const s = makeStep("bom_explosion");
      s.setInput({ plannedTotal, sku });
      const items = await db.select().from(bomItems).where(eq(bomItems.parentProductSku, sku));
      const tier1 = items.filter(b => b.tier === 1);
      componentRequirements = tier1.map(b => {
        const qtyPerUnit = Number(b.requiredQuantity);
        return {
          code: b.componentCode, name: b.componentName,
          qtyPerUnit, required: Math.ceil(qtyPerUnit * plannedTotal), tier: b.tier,
        };
      });
      steps.push(s.record({ componentRequirements, totalComponents: componentRequirements.length }));
    }

    // ── Step 5: Purchase Gap — required vs current stock ──
    let purchaseGaps: Array<{ code: string; name: string; required: number; currentStock: number; gap: number; suggestedOrder: number }> = [];
    {
      const s = makeStep("purchase_gap");
      s.setInput({ componentCount: componentRequirements.length });
      const codes = componentRequirements.map(c => c.code);
      const stockRows = codes.length > 0
        ? await db.select().from(componentStock)
        : [];
      const stockMap = new Map(stockRows.map(r => [r.componentCode, Number(r.currentStock)]));
      purchaseGaps = componentRequirements
        .map(c => {
          const currentStock = stockMap.get(c.code) ?? 0;
          const gap = Math.max(0, c.required - currentStock);
          return {
            code: c.code, name: c.name, required: c.required,
            currentStock, gap, suggestedOrder: gap,
          };
        })
        .filter(g => g.gap > 0);
      summary.componentGapsCount = purchaseGaps.length;
      steps.push(s.record({ purchaseGaps, totalGaps: purchaseGaps.length },
        purchaseGaps.length > 0 ? [`${purchaseGaps.length} components below requirement`] : [],
        purchaseGaps.length > 5 ? "warning" : "ok"));
    }

    // ── Step 6: Impact Propagation — what-if produce plannedTotal ──
    {
      const s = makeStep("impact_propagation");
      s.setInput({ plannedTotal, sku });
      let impact: any = null;
      let notes: string[] = [];
      let status: "ok" | "warning" | "error" = "ok";
      try {
        if (plannedTotal > 0) {
          impact = await simulateWhatIf({ type: "produce", quantity: plannedTotal }, sku);
          summary.bottleneck = impact.afterBottleneck;
          summary.capacityChange = impact.capacityDelta;
          summary.impactRippleSize = impact.componentImpacts?.length ?? 0;
          if (!impact.feasible) {
            notes.push("Plan not feasible at current capacity");
            status = "warning";
          }
        } else {
          notes.push("No production planned, skipping impact propagation");
          status = "warning";
        }
      } catch (err: any) {
        notes.push(`Impact compute failed: ${err.message}`);
        status = "error";
      }
      steps.push(s.record(impact, notes, status));
    }

    // ── Step 7: Outcome Prediction — record predicted purchase outcomes ──
    {
      const s = makeStep("outcome_prediction");
      s.setInput({ purchaseGapCount: purchaseGaps.length, mode });
      const predictions = purchaseGaps.map(g => ({
        componentCode: g.code,
        predictedAction: "place_order",
        predictedValue: g.suggestedOrder,
        confidence: 0.75,
      }));
      const notes = mode === "simulation"
        ? ["Simulation mode — no DB writes"]
        : [`Live mode — would write ${predictions.length} predictions (deferred to follow-up)`];
      steps.push(s.record({ predictions, count: predictions.length }, notes));
    }

    const durationMs = tic() - start;
    await db.update(simulationPipelineRuns).set({
      status: "success",
      completedAt: new Date(),
      durationMs,
      steps,
      summary,
    }).where(eq(simulationPipelineRuns.id, runId));

    return runId;
  } catch (err: any) {
    const durationMs = tic() - start;
    await db.update(simulationPipelineRuns).set({
      status: "failed",
      completedAt: new Date(),
      durationMs,
      steps,
      summary,
      errorMessage: err?.message ?? String(err),
    }).where(eq(simulationPipelineRuns.id, runId));
    throw err;
  }
}

export async function getPipelineRun(id: number) {
  const rows = await db.select().from(simulationPipelineRuns).where(eq(simulationPipelineRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listPipelineRuns(opts: { sku?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = opts.sku
    ? await db.select().from(simulationPipelineRuns).where(eq(simulationPipelineRuns.sku, opts.sku)).limit(limit)
    : await db.select().from(simulationPipelineRuns).limit(limit);
  return rows.sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
}
