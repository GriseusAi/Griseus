// ═══════════════════════════════════════════════════════════
// IMPACT PROPAGATION ENGINE — Palantir AIP "Octopus Brain"
//
// Her veri değişikliğinin dalga etkisini hesaplar:
// Stok değişti → BOM kapasitesi etkilendi → mevsimsel tükenme kaydı
// → darboğaz değişti → sipariş önerisi üretildi
// ═══════════════════════════════════════════════════════════

import type { ImpactEvent, ImpactNode, ReasoningStep, ImpactAction } from "./impact-types";
import { computeComponentIntelligence, type ComponentIntelligence } from "../routes/intelligence";
import { getBomWithStock, computeProductionCapacity } from "../routes/bom";
import { SEASONAL_INDICES, MONTH_LABELS, YEARLY_TOTAL } from "./seasonal-constants";
import { MAIN_SKU, LEAD_TIME_DAYS, IMPACT_BUFFER_SIZE } from "./constants";

// Impact engine artık SKU'yu parametre olarak almalı
const SKU = process.env.MAIN_PRODUCT_SKU || "ELT.7-11"; // legacy default

// In-memory ring buffer for recent impacts
const impactBuffer: ImpactEvent[] = [];
const MAX_BUFFER = IMPACT_BUFFER_SIZE;

export function getRecentImpacts(limit = 10): ImpactEvent[] {
  return impactBuffer.slice(-limit);
}

function pushImpact(event: ImpactEvent) {
  impactBuffer.push(event);
  if (impactBuffer.length > MAX_BUFFER) impactBuffer.shift();
}

// ── Snapshot type for before/after comparison ──
interface SystemSnapshot {
  maxProducible: number;
  bottleneckCode: string;
  bottleneckName: string;
  components: Map<string, {
    code: string;
    name: string;
    stock: number;
    seasonalDays: number | null;
    urgency: string;
    depletionMonth: string | null;
    depletionYear: number | null;
    depletionRisk: string | null;
    winterStress: boolean;
    dailyBurnRate: number;
  }>;
}

async function takeSnapshot(): Promise<SystemSnapshot> {
  const [intel, bomItems] = await Promise.all([
    computeComponentIntelligence(SKU).catch(() => null),
    getBomWithStock(SKU),
  ]);

  const capacity = computeProductionCapacity(bomItems);
  const components = new Map<string, SystemSnapshot["components"] extends Map<string, infer V> ? V : never>();

  if (intel) {
    for (const c of intel.components) {
      components.set(c.code, {
        code: c.code,
        name: c.name,
        stock: c.currentStock,
        seasonalDays: c.seasonalDays,
        urgency: c.urgency,
        depletionMonth: c.depletionMonth,
        depletionYear: c.depletionYear,
        depletionRisk: c.depletionRisk,
        winterStress: c.winterStress,
        dailyBurnRate: c.dailyBurnRate,
      });
    }
  }

  return {
    maxProducible: capacity.maxProducible,
    bottleneckCode: capacity.bottlenecks[0]?.code ?? "",
    bottleneckName: capacity.bottlenecks[0]?.name ?? "",
    components,
  };
}

// ── Main: compute impact propagation ──
export interface ImpactTrigger {
  type: "stock_movement" | "component_stock_update" | "sales_data_import" | "correction";
  actor: string;
  detail: string;
  componentCodes?: string[];  // specific components affected
  productSku?: string;
}

export async function computeImpactPropagation(
  trigger: ImpactTrigger,
  beforeSnapshot?: SystemSnapshot,
): Promise<ImpactEvent[]> {
  try {
    // Take "after" snapshot
    const after = await takeSnapshot();
    const before = beforeSnapshot ?? after; // if no before, just analyze current state

    const impacts: ImpactEvent[] = [];
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const seasonalIdx = SEASONAL_INDICES[currentMonthIdx];

    // 1. Check each component for changes
    const urgencyShifts: Array<{
      code: string; name: string;
      oldUrgency: string; newUrgency: string;
      oldDays: number | null; newDays: number | null;
      newStock: number;
      depletionMonth: string | null; depletionYear: number | null;
      depletionRisk: string | null; winterStress: boolean;
      dailyBurnRate: number;
    }> = [];

    for (const [code, afterComp] of after.components) {
      const beforeComp = before.components.get(code);
      if (!beforeComp) continue;

      // Stock changed or urgency shifted
      const stockChanged = beforeComp.stock !== afterComp.stock;
      const urgencyChanged = beforeComp.urgency !== afterComp.urgency;
      const daysChanged = beforeComp.seasonalDays !== afterComp.seasonalDays;

      if (stockChanged || urgencyChanged) {
        urgencyShifts.push({
          code, name: afterComp.name,
          oldUrgency: beforeComp.urgency, newUrgency: afterComp.urgency,
          oldDays: beforeComp.seasonalDays, newDays: afterComp.seasonalDays,
          newStock: afterComp.stock,
          depletionMonth: afterComp.depletionMonth,
          depletionYear: afterComp.depletionYear,
          depletionRisk: afterComp.depletionRisk,
          winterStress: afterComp.winterStress,
          dailyBurnRate: afterComp.dailyBurnRate,
        });
      }
    }

    // 2. Production capacity change
    const capacityChanged = before.maxProducible !== after.maxProducible;
    const bottleneckChanged = before.bottleneckCode !== after.bottleneckCode;

    // 3. Build impact events for critical/warning shifts
    const criticalShifts = urgencyShifts.filter(s =>
      s.newUrgency === "critical" || s.newUrgency === "warning" || s.winterStress
    );

    // Group into one consolidated impact event
    if (criticalShifts.length > 0 || capacityChanged) {
      const reasoning: ReasoningStep[] = [];
      const affectedNodes: ImpactNode[] = [];
      const actions: ImpactAction[] = [];
      let order = 1;

      // Trigger description
      reasoning.push({
        order: order++,
        cause: trigger.detail,
      });

      // Component impacts
      for (const shift of urgencyShifts.slice(0, 8)) { // top 8 most impacted
        const stockDelta = shift.newStock - (before.components.get(shift.code)?.stock ?? shift.newStock);
        if (stockDelta !== 0) {
          reasoning.push({
            order: order++,
            cause: `${shift.code} ${shift.name}: stok ${before.components.get(shift.code)?.stock ?? "?"} → ${shift.newStock} (${stockDelta > 0 ? "+" : ""}${stockDelta})`,
            data: { code: shift.code, oldStock: before.components.get(shift.code)?.stock ?? 0, newStock: shift.newStock },
          });
        }

        if (shift.newDays !== null) {
          const seasonalInfo = shift.depletionMonth && shift.depletionYear
            ? `${shift.depletionMonth} ${shift.depletionYear}` : "belirsiz";
          reasoning.push({
            order: order++,
            cause: `${shift.code} mevsimsel tükenme: ${shift.newDays} gün → ${seasonalInfo}${shift.winterStress ? " (KIŞ RİSKİ!)" : ""}`,
            data: { seasonalDays: shift.newDays, depletionRisk: shift.depletionRisk ?? "DÜŞÜK" },
          });
        }

        affectedNodes.push({
          entity: "component",
          code: shift.code,
          name: shift.name,
          field: "seasonalDays",
          previousValue: shift.oldDays,
          newValue: shift.newDays,
        });

        // Generate order action for critical/warning
        if (shift.newUrgency === "critical" || shift.newUrgency === "warning") {
          const dailyRate = shift.dailyBurnRate > 0 ? shift.dailyBurnRate : YEARLY_TOTAL / 365; // fallback: gerçek burn rate yoksa yıllık ortalamadan
          const orderQty = Math.ceil(dailyRate * 90); // 3 months buffer
          const deadlineDays = Math.max(0, (shift.newDays ?? 180) - LEAD_TIME_DAYS - 30);
          const deadlineDate = new Date(now.getTime() + deadlineDays * 86400000);

          actions.push({
            type: "order",
            priority: shift.newUrgency === "critical" ? "immediate" : "soon",
            description: `${shift.code} ${shift.name}: ${orderQty} adet sipariş ver`,
            componentCode: shift.code,
            quantity: orderQty,
            deadline: deadlineDate.toISOString().split("T")[0],
          });
        }
      }

      // Capacity impact
      if (capacityChanged) {
        reasoning.push({
          order: order++,
          cause: `Üretim kapasitesi: ${before.maxProducible} → ${after.maxProducible} adet`,
          data: { oldCapacity: before.maxProducible, newCapacity: after.maxProducible },
        });

        affectedNodes.push({
          entity: "production",
          code: SKU,
          name: `${SKU} Üretim Kapasitesi`,
          field: "maxProducible",
          previousValue: before.maxProducible,
          newValue: after.maxProducible,
        });
      }

      if (bottleneckChanged) {
        reasoning.push({
          order: order++,
          cause: `Darboğaz değişti: ${before.bottleneckCode || "—"} → ${after.bottleneckCode} (${after.bottleneckName})`,
        });
      }

      // Determine overall severity
      const hasCritical = criticalShifts.some(s => s.newUrgency === "critical");
      const hasWinterStress = criticalShifts.some(s => s.winterStress);
      const severity: ImpactEvent["severity"] = hasCritical ? "critical"
        : (hasWinterStress || capacityChanged) ? "warning" : "info";

      // Build headline
      const topShift = criticalShifts[0] || urgencyShifts[0];
      let headline: string;
      if (hasCritical && topShift) {
        headline = `${topShift.code} kritik seviyede — ${topShift.newDays ?? 0} günde tükenir`;
      } else if (capacityChanged && after.maxProducible < before.maxProducible) {
        headline = `Üretim kapasitesi ${before.maxProducible} → ${after.maxProducible} adete düştü`;
      } else if (hasWinterStress && topShift) {
        headline = `${topShift.code} kış sezonunda risk altında — ${topShift.depletionMonth} ${topShift.depletionYear}`;
      } else if (urgencyShifts.length > 0) {
        headline = `${urgencyShifts.length} bileşen etkilendi — sistem güncellendi`;
      } else {
        headline = `Stok hareketi işlendi — sistem stabil`;
      }

      const impact: ImpactEvent = {
        id: `impact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now.toISOString(),
        trigger: {
          type: trigger.type,
          actor: trigger.actor,
          detail: trigger.detail,
        },
        severity,
        headline,
        reasoning,
        affectedNodes,
        actions,
      };

      pushImpact(impact);
      impacts.push(impact);
    } else {
      // No critical shifts — info event
      const impact: ImpactEvent = {
        id: `impact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now.toISOString(),
        trigger: { type: trigger.type, actor: trigger.actor, detail: trigger.detail },
        severity: "info",
        headline: `Stok hareketi işlendi — tüm bileşenler stabil`,
        reasoning: [{ order: 1, cause: trigger.detail }],
        affectedNodes: [],
        actions: [],
      };
      pushImpact(impact);
      impacts.push(impact);
    }

    return impacts;
  } catch (err) {
    console.error("[ImpactEngine] Error:", err);
    return [];
  }
}

// Pre-mutation snapshot helper — call BEFORE the mutation
export async function takePreSnapshot(): Promise<SystemSnapshot> {
  return takeSnapshot();
}
