// ═══════════════════════════════════════════════════════════
// WHAT-IF ENGINE — Cascading Impact Simulation
//
// Veri DEĞIŞTIRMEDEN senaryoları simüle eder:
// "100 adet üretim yapsak ne olur?"
// "200 adet 27.031 sipariş versek kapasite ne olur?"
// "Kış sezonunda darboğaz nerede?"
// ═══════════════════════════════════════════════════════════

import { getBomWithStock, computeProductionCapacity, computeSubAssemblyCapacity } from "../routes/bom";
import { computeComponentIntelligence } from "../routes/intelligence";
import { SEASONAL_INDICES, MONTH_LABELS, YEARLY_TOTAL, DAYS_IN_MONTH } from "./seasonal-constants";
import { MAIN_SKU, LEAD_TIME_DAYS } from "./constants";

const SKU = MAIN_SKU;

// Forward-walk (same as intelligence.ts but standalone for virtual stock)
function virtualForwardWalk(stock: number, dailyRate: number): {
  days: number; depletionMonth: number; depletionYear: number;
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
    const daysThisMonth = isFirstMonth ? DAYS_IN_MONTH[monthIndex] - currentDay + 1 : DAYS_IN_MONTH[monthIndex];
    const consumption = adjustedRate * daysThisMonth;

    if (consumption >= remainingStock) {
      const daysUntilEmpty = adjustedRate > 0 ? remainingStock / adjustedRate : daysThisMonth;
      totalDays += Math.ceil(daysUntilEmpty);
      return { days: totalDays, depletionMonth: monthIndex, depletionYear: now.getFullYear() + yearOffset };
    }

    remainingStock -= consumption;
    totalDays += daysThisMonth;
    isFirstMonth = false;
    if (monthIndex === 11) yearOffset++;
    monthIndex = (monthIndex + 1) % 12;
  }

  return { days: totalDays, depletionMonth: monthIndex, depletionYear: now.getFullYear() + yearOffset };
}

export type WhatIfScenario =
  | { type: "produce"; quantity: number }
  | { type: "order_received"; quantity: number }
  | { type: "restock_component"; componentCode: string; quantity: number }
  | { type: "months_forward"; months: number };

interface ComponentImpact {
  code: string;
  name: string;
  currentStock: number;
  afterStock: number;
  stockDelta: number;
  currentSeasonalDays: number | null;
  afterSeasonalDays: number | null;
  currentUrgency: string;
  afterUrgency: string;
  urgencyChanged: boolean;
  depletionMonth: string | null;
  depletionYear: number | null;
  winterStress: boolean;
  actionNeeded: string | null;
  orderQuantity: number | null;
  orderDeadline: string | null;
}

export interface WhatIfResult {
  scenario: string;
  feasible: boolean;
  currentCapacity: number;
  afterCapacity: number;
  capacityDelta: number;
  currentBottleneck: string;
  afterBottleneck: string;
  bottleneckChanged: boolean;
  componentImpacts: ComponentImpact[];
  criticalComponents: ComponentImpact[];
  warningComponents: ComponentImpact[];
  summary: string;
  actions: Array<{
    priority: "immediate" | "soon" | "planned";
    description: string;
    componentCode?: string;
    quantity?: number;
  }>;
}

export async function simulateWhatIf(scenario: WhatIfScenario): Promise<WhatIfResult> {
  // Get current state
  const [intel, bomItems] = await Promise.all([
    computeComponentIntelligence(SKU),
    getBomWithStock(SKU),
  ]);

  const currentCapacity = computeProductionCapacity(bomItems);
  const now = new Date();
  const currentMonthIdx = now.getMonth();

  // Build virtual stock map
  // Tier 2 (YARI MAMÜL) bileşenler için efektif stok kullan (current + alt bileşenlerden üretilebilir)
  const virtualStocks = new Map<string, number>();
  const bomMap = new Map<string, { requiredQty: number; name: string; tier: number }>();

  for (const item of bomItems) {
    let effectiveStock = item.currentStock;
    if (item.tier === 2) {
      const sub = computeSubAssemblyCapacity(item.code, bomItems);
      effectiveStock = item.currentStock + sub.producible;
    }
    virtualStocks.set(item.code, effectiveStock);
    bomMap.set(item.code, { requiredQty: item.requiredQty, name: item.name, tier: item.tier });
  }

  // Apply scenario to virtual stocks
  let scenarioDesc = "";
  let feasible = true;

  switch (scenario.type) {
    case "produce": {
      scenarioDesc = `${scenario.quantity} adet ELT 7-11 üretilse`;
      for (const [code, info] of bomMap) {
        if (info.tier === 1 || info.tier === 2) {
          const current = virtualStocks.get(code) ?? 0;
          const deduction = info.requiredQty * scenario.quantity;
          virtualStocks.set(code, current - deduction);
          if (current - deduction < 0) feasible = false;
        }
      }
      break;
    }
    case "order_received": {
      scenarioDesc = `${scenario.quantity} adet sipariş alınsa (üretim + sevk)`;
      for (const [code, info] of bomMap) {
        if (info.tier === 1 || info.tier === 2) {
          const current = virtualStocks.get(code) ?? 0;
          const deduction = info.requiredQty * scenario.quantity;
          virtualStocks.set(code, current - deduction);
          if (current - deduction < 0) feasible = false;
        }
      }
      break;
    }
    case "restock_component": {
      const info = bomMap.get(scenario.componentCode);
      scenarioDesc = `${scenario.componentCode} ${info?.name ?? ""} bileşenine ${scenario.quantity} adet eklense`;
      const current = virtualStocks.get(scenario.componentCode) ?? 0;
      virtualStocks.set(scenario.componentCode, current + scenario.quantity);
      break;
    }
    case "months_forward": {
      scenarioDesc = `${scenario.months} ay ileri simülasyon (mevsimsel tüketim)`;
      const dailyRate = YEARLY_TOTAL / 365;
      for (const [code, info] of bomMap) {
        if (info.tier === 1 || info.tier === 2) {
          const current = virtualStocks.get(code) ?? 0;
          let consumed = 0;
          let mIdx = currentMonthIdx;
          for (let m = 0; m < scenario.months; m++) {
            consumed += dailyRate * info.requiredQty * SEASONAL_INDICES[mIdx] * DAYS_IN_MONTH[mIdx];
            mIdx = (mIdx + 1) % 12;
          }
          virtualStocks.set(code, Math.max(0, current - consumed));
        }
      }
      break;
    }
  }

  // Compute virtual capacity
  const virtualBomItems = bomItems.map(item => ({
    ...item,
    currentStock: virtualStocks.get(item.code) ?? item.currentStock,
  }));
  const afterCapacity = computeProductionCapacity(virtualBomItems);

  // Compute component-level impacts
  const componentImpacts: ComponentImpact[] = [];
  const dailyBaseRate = YEARLY_TOTAL / 365;

  for (const comp of intel.components) {
    const afterStock = virtualStocks.get(comp.code) ?? comp.currentStock;
    const stockDelta = afterStock - comp.currentStock;

    // Virtual forward-walk
    const effectiveDailyRate = comp.dailyBurnRate > 0 ? comp.dailyBurnRate : dailyBaseRate * comp.requiredPerUnit;
    const afterWalk = virtualForwardWalk(afterStock, effectiveDailyRate);

    const afterUrgency =
      afterStock <= 0 ? "critical"
      : afterWalk.days <= 180 ? "critical"
      : afterWalk.days <= 365 ? "warning"
      : afterWalk.days <= 730 ? "ok"
      : "abundant";

    const winterMonths = [10, 11, 0, 1];
    const winterStress = afterStock > 0 && winterMonths.includes(afterWalk.depletionMonth) && afterWalk.days <= 365;

    // Action needed?
    let actionNeeded: string | null = null;
    let orderQuantity: number | null = null;
    let orderDeadline: string | null = null;

    if (afterUrgency === "critical" || afterUrgency === "warning") {
      const neededDays = 90; // 3 month buffer
      orderQuantity = Math.ceil(effectiveDailyRate * neededDays);
      const deadlineDays = Math.max(0, afterWalk.days - LEAD_TIME_DAYS - 30);
      orderDeadline = new Date(now.getTime() + deadlineDays * 86400000).toISOString().split("T")[0];
      actionNeeded = afterUrgency === "critical"
        ? `ACİL: ${orderQuantity} adet sipariş ver (son tarih: ${orderDeadline})`
        : `${orderQuantity} adet sipariş planla (hedef: ${orderDeadline})`;
    }

    componentImpacts.push({
      code: comp.code,
      name: comp.name,
      currentStock: comp.currentStock,
      afterStock: Math.round(afterStock * 100) / 100,
      stockDelta: Math.round(stockDelta * 100) / 100,
      currentSeasonalDays: comp.seasonalDays,
      afterSeasonalDays: afterStock > 0 ? afterWalk.days : 0,
      currentUrgency: comp.urgency,
      afterUrgency,
      urgencyChanged: comp.urgency !== afterUrgency,
      depletionMonth: afterStock > 0 ? MONTH_LABELS[afterWalk.depletionMonth] : null,
      depletionYear: afterStock > 0 ? afterWalk.depletionYear : null,
      winterStress,
      actionNeeded,
      orderQuantity,
      orderDeadline,
    });
  }

  // Sort by afterSeasonalDays ascending (most critical first)
  componentImpacts.sort((a, b) => (a.afterSeasonalDays ?? 0) - (b.afterSeasonalDays ?? 0));

  const criticalComponents = componentImpacts.filter(c => c.afterUrgency === "critical");
  const warningComponents = componentImpacts.filter(c => c.afterUrgency === "warning");

  // Build actions list
  const actions = componentImpacts
    .filter(c => c.actionNeeded)
    .map(c => ({
      priority: c.afterUrgency === "critical" ? "immediate" as const : "soon" as const,
      description: c.actionNeeded!,
      componentCode: c.code,
      quantity: c.orderQuantity ?? undefined,
    }));

  // Build summary
  const urgencyChanges = componentImpacts.filter(c => c.urgencyChanged);
  let summary = `**Senaryo:** ${scenarioDesc}\n\n`;

  if (!feasible) {
    summary += `⛔ **KARŞILANAMAZ** — Yeterli bileşen stoku yok.\n\n`;
  }

  summary += `**Üretim kapasitesi:** ${currentCapacity.maxProducible} → ${afterCapacity.maxProducible} adet`;
  if (afterCapacity.maxProducible !== currentCapacity.maxProducible) {
    const delta = afterCapacity.maxProducible - currentCapacity.maxProducible;
    summary += ` (${delta > 0 ? "+" : ""}${delta})`;
  }
  summary += `\n`;

  if (currentCapacity.bottlenecks[0]?.code !== afterCapacity.bottlenecks[0]?.code) {
    summary += `**Darboğaz değişti:** ${currentCapacity.bottlenecks[0]?.code ?? "—"} → ${afterCapacity.bottlenecks[0]?.code ?? "—"}\n`;
  }

  if (criticalComponents.length > 0) {
    summary += `\n🔴 **${criticalComponents.length} bileşen KRİTİK seviyeye düşer:**\n`;
    for (const c of criticalComponents.slice(0, 5)) {
      summary += `- ${c.code} ${c.name}: ${c.currentStock} → ${c.afterStock} adet (${c.afterSeasonalDays ?? 0} gün)${c.winterStress ? " ❄️ KIŞ RİSKİ" : ""}\n`;
    }
  }

  if (warningComponents.length > 0) {
    summary += `\n🟡 **${warningComponents.length} bileşen DİKKAT seviyesine düşer:**\n`;
    for (const c of warningComponents.slice(0, 5)) {
      summary += `- ${c.code} ${c.name}: ${c.afterSeasonalDays ?? 0} gün kaldı\n`;
    }
  }

  if (actions.length > 0) {
    summary += `\n📋 **Gerekli aksiyonlar:**\n`;
    for (const a of actions.slice(0, 5)) {
      summary += `- ${a.description}\n`;
    }
  }

  const stableCount = componentImpacts.filter(c => c.afterUrgency === "abundant" || c.afterUrgency === "ok").length;
  if (stableCount > 0) {
    summary += `\n✅ ${stableCount} bileşen stabil durumda.\n`;
  }

  return {
    scenario: scenarioDesc,
    feasible,
    currentCapacity: currentCapacity.maxProducible,
    afterCapacity: afterCapacity.maxProducible,
    capacityDelta: afterCapacity.maxProducible - currentCapacity.maxProducible,
    currentBottleneck: currentCapacity.bottlenecks[0]?.code ?? "",
    afterBottleneck: afterCapacity.bottlenecks[0]?.code ?? "",
    bottleneckChanged: currentCapacity.bottlenecks[0]?.code !== afterCapacity.bottlenecks[0]?.code,
    componentImpacts: componentImpacts.slice(0, 15), // top 15
    criticalComponents,
    warningComponents,
    summary,
    actions,
  };
}
