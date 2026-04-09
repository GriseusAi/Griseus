/**
 * Cross-Product Optimization Engine — Palantir Octopus Brain
 *
 * Ortak bileşenleri paylaşan ürünler arasında akıllı tahsis.
 * Hiçbir insanın yapamayacağı çapraz optimizasyon.
 *
 * Algoritma:
 *   1. findSharedComponents() — hangi bileşenler kaç üründe ortak
 *   2. crossProductDemandProjection(months) — her ortak bileşen için toplam çapraz talep
 *   3. allocateSharedStock() — mevsimsel talep ağırlığına göre bileşen tahsisi
 *   Priority = (ürünün önümüzdeki N ay talebi × mevsimsel index) / mevcut stok
 */

import { db } from "../db";
import { bomItems, componentStock, products, salesHistory } from "@shared/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { getMonthlyDemandForSku } from "./seasonal-constants";
import { LEAD_TIME_DAYS } from "./constants";

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export interface SharedComponent {
  componentCode: string;
  componentName: string;
  unit: string;
  currentStock: number;
  /** Hangi ürünlerde kullanılıyor */
  usedIn: Array<{
    productSku: string;
    productName: string;
    requiredQtyPerUnit: number;
  }>;
  /** Kaç üründe ortak */
  productCount: number;
}

export interface DemandProjection {
  componentCode: string;
  componentName: string;
  currentStock: number;
  unit: string;
  /** Ürün bazında önümüzdeki N ay talep projeksiyonu */
  perProduct: Array<{
    productSku: string;
    productName: string;
    projectedDemandUnits: number;   // ürün adet talebi
    projectedComponentNeed: number;  // bileşen ihtiyacı (talep × requiredQty)
    avgMonthlyDemand: number;
  }>;
  /** Toplam çapraz bileşen ihtiyacı */
  totalComponentNeed: number;
  /** Stok / ihtiyaç oranı (< 1 = eksik) */
  coverageRatio: number;
  /** Kaç ay yeter */
  monthsCovered: number;
  /** Eksik miktar (negatifse fazla var) */
  deficit: number;
}

export interface AllocationResult {
  componentCode: string;
  componentName: string;
  currentStock: number;
  totalNeed: number;
  deficit: number;
  /** Ürün bazında tahsis */
  allocations: Array<{
    productSku: string;
    productName: string;
    need: number;
    allocated: number;
    priority: number;
    allocationPercent: number;
    shortfall: number;
  }>;
  /** Aciliyet */
  severity: "critical" | "warning" | "ok";
  recommendation: string;
}

export interface CrossProductAnalysis {
  timestamp: string;
  projectionMonths: number;
  sharedComponents: SharedComponent[];
  demandProjections: DemandProjection[];
  allocations: AllocationResult[];
  summary: {
    totalSharedComponents: number;
    criticalCount: number;
    warningCount: number;
    okCount: number;
    topBottleneck: string | null;
    topBottleneckDeficit: number;
  };
}

// ══════════════════════════════════════════════════════════
// 1. FIND SHARED COMPONENTS
// ══════════════════════════════════════════════════════════

export async function findSharedComponents(): Promise<SharedComponent[]> {
  // Hangi component_code birden fazla parent_product_sku'da geçiyor?
  const rows = await db.execute(sql`
    SELECT
      b.component_code,
      b.component_name,
      b.unit,
      b.parent_product_sku,
      b.required_quantity,
      p.name as product_name,
      COALESCE(cs.current_stock, 0) as current_stock
    FROM bom_items b
    LEFT JOIN products p ON p.sku = b.parent_product_sku
    LEFT JOIN component_stock cs ON cs.component_code = b.component_code
    WHERE b.component_code IN (
      SELECT component_code
      FROM bom_items
      WHERE tier = 1 OR tier = 2
      GROUP BY component_code
      HAVING COUNT(DISTINCT parent_product_sku) > 1
    )
    AND (b.tier = 1 OR b.tier = 2)
    ORDER BY b.component_code, b.parent_product_sku
  `);

  // Group by component
  const map = new Map<string, SharedComponent>();
  for (const row of rows.rows as any[]) {
    const code = row.component_code;
    if (!map.has(code)) {
      map.set(code, {
        componentCode: code,
        componentName: row.component_name,
        unit: row.unit,
        currentStock: Number(row.current_stock) || 0,
        usedIn: [],
        productCount: 0,
      });
    }
    const comp = map.get(code)!;
    // Aynı ürünü tekrar ekleme
    if (!comp.usedIn.find(u => u.productSku === row.parent_product_sku)) {
      comp.usedIn.push({
        productSku: row.parent_product_sku,
        productName: row.product_name || row.parent_product_sku,
        requiredQtyPerUnit: Number(row.required_quantity) || 0,
      });
    }
  }

  const result = Array.from(map.values());
  for (const comp of result) {
    comp.productCount = comp.usedIn.length;
  }

  return result.sort((a, b) => b.productCount - a.productCount);
}

// ══════════════════════════════════════════════════════════
// 2. CROSS-PRODUCT DEMAND PROJECTION
// ══════════════════════════════════════════════════════════

export async function crossProductDemandProjection(
  months: number = 3,
  sharedComponents?: SharedComponent[],
): Promise<DemandProjection[]> {
  const shared = sharedComponents ?? await findSharedComponents();
  if (shared.length === 0) return [];

  // Tüm ilgili SKU'ları topla
  const skuSet: Record<string, boolean> = {};
  for (const comp of shared) {
    for (const u of comp.usedIn) {
      skuSet[u.productSku] = true;
    }
  }
  const allSkus = Object.keys(skuSet);

  // Her SKU için aylık talep çek
  const demandCache = new Map<string, { demand: number[]; annual: number }>();
  for (const sku of allSkus) {
    demandCache.set(sku, await getMonthlyDemandForSku(sku));
  }

  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed

  const projections: DemandProjection[] = [];

  for (const comp of shared) {
    const perProduct: DemandProjection["perProduct"] = [];
    let totalComponentNeed = 0;

    for (const usage of comp.usedIn) {
      const skuDemand = demandCache.get(usage.productSku);
      if (!skuDemand) continue;

      // Önümüzdeki N ay ürün talebi toplamı
      let projectedDemandUnits = 0;
      for (let i = 0; i < months; i++) {
        const monthIdx = (currentMonth + i) % 12;
        projectedDemandUnits += skuDemand.demand[monthIdx];
      }

      const componentNeed = projectedDemandUnits * usage.requiredQtyPerUnit;
      totalComponentNeed += componentNeed;

      const avgMonthlyDemand = skuDemand.annual / 12;

      perProduct.push({
        productSku: usage.productSku,
        productName: usage.productName,
        projectedDemandUnits,
        projectedComponentNeed: componentNeed,
        avgMonthlyDemand,
      });
    }

    // Sort by need descending
    perProduct.sort((a, b) => b.projectedComponentNeed - a.projectedComponentNeed);

    const coverageRatio = totalComponentNeed > 0
      ? comp.currentStock / totalComponentNeed
      : Infinity;

    // Aylık toplam tüketim hızı → kaç ay yeter
    const monthlyBurn = totalComponentNeed / months;
    const monthsCovered = monthlyBurn > 0
      ? comp.currentStock / monthlyBurn
      : Infinity;

    projections.push({
      componentCode: comp.componentCode,
      componentName: comp.componentName,
      currentStock: comp.currentStock,
      unit: comp.unit,
      perProduct,
      totalComponentNeed,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      monthsCovered: Math.round(monthsCovered * 10) / 10,
      deficit: Math.max(0, totalComponentNeed - comp.currentStock),
    });
  }

  // Sort by coverage ratio ascending (most critical first)
  projections.sort((a, b) => a.coverageRatio - b.coverageRatio);

  return projections;
}

// ══════════════════════════════════════════════════════════
// 3. ALLOCATE SHARED STOCK
// ══════════════════════════════════════════════════════════

export async function allocateSharedStock(
  months: number = 3,
): Promise<AllocationResult[]> {
  const shared = await findSharedComponents();
  if (shared.length === 0) return [];

  const projections = await crossProductDemandProjection(months, shared);

  const now = new Date();
  const currentMonth = now.getMonth();

  // Her SKU için aylık talep — seasonal index hesabı
  const demandCache = new Map<string, { demand: number[]; annual: number }>();
  const skuSet: Record<string, boolean> = {};
  for (const comp of shared) {
    for (const u of comp.usedIn) skuSet[u.productSku] = true;
  }
  for (const sku of Object.keys(skuSet)) {
    demandCache.set(sku, await getMonthlyDemandForSku(sku));
  }

  const results: AllocationResult[] = [];

  for (const proj of projections) {
    const stock = proj.currentStock;
    const totalNeed = proj.totalComponentNeed;

    // Priority skoru: (önümüzdeki N ay talebi × mevsimsel ağırlık) / mevcut stok
    const allocations: AllocationResult["allocations"] = [];
    let totalPriority = 0;

    for (const pp of proj.perProduct) {
      const skuDemand = demandCache.get(pp.productSku);
      // Mevsimsel yoğunluk: önümüzdeki ayların ortalaması vs yıllık ortalama
      let seasonalWeight = 1;
      if (skuDemand && skuDemand.annual > 0) {
        let upcomingTotal = 0;
        for (let i = 0; i < months; i++) {
          upcomingTotal += skuDemand.demand[(currentMonth + i) % 12];
        }
        const upcomingAvg = upcomingTotal / months;
        const yearlyAvg = skuDemand.annual / 12;
        seasonalWeight = yearlyAvg > 0 ? upcomingAvg / yearlyAvg : 1;
      }

      const priority = pp.projectedComponentNeed * seasonalWeight;
      totalPriority += priority;

      allocations.push({
        productSku: pp.productSku,
        productName: pp.productName,
        need: pp.projectedComponentNeed,
        allocated: 0, // hesaplanacak
        priority,
        allocationPercent: 0,
        shortfall: 0,
      });
    }

    // Oransal tahsis: her ürüne priority ağırlığına göre stok dağıt
    for (const alloc of allocations) {
      if (totalPriority > 0) {
        const share = alloc.priority / totalPriority;
        alloc.allocationPercent = Math.round(share * 100);
        alloc.allocated = Math.round(stock * share);
      }
      alloc.shortfall = Math.max(0, alloc.need - alloc.allocated);
    }

    // Sort by shortfall descending
    allocations.sort((a, b) => b.shortfall - a.shortfall);

    const deficit = Math.max(0, totalNeed - stock);

    // Severity
    let severity: AllocationResult["severity"] = "ok";
    if (proj.coverageRatio < 0.5) severity = "critical";
    else if (proj.coverageRatio < 1.0) severity = "warning";

    // Recommendation
    let recommendation: string;
    if (severity === "critical") {
      recommendation = `ACİL: ${proj.componentCode} stoku ${stock} adet, ama ${months} aylık toplam ihtiyaç ${totalNeed}. `
        + `${deficit} adet eksik. Hemen sipariş verilmeli (tedarik süresi: ${LEAD_TIME_DAYS} gün).`;
    } else if (severity === "warning") {
      recommendation = `DİKKAT: ${proj.componentCode} stoku ${months} aylık ihtiyacı karşılamıyor. `
        + `Stok: ${stock}, ihtiyaç: ${totalNeed}, eksik: ${deficit}. Sipariş planlanmalı.`;
    } else {
      recommendation = `${proj.componentCode} stoku yeterli. ${proj.monthsCovered} ay yeter.`;
    }

    results.push({
      componentCode: proj.componentCode,
      componentName: proj.componentName,
      currentStock: stock,
      totalNeed,
      deficit,
      allocations,
      severity,
      recommendation,
    });
  }

  // Critical first
  const sevOrder = { critical: 0, warning: 1, ok: 2 };
  results.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return results;
}

// ══════════════════════════════════════════════════════════
// 4. FULL ANALYSIS (Orchestrator)
// ══════════════════════════════════════════════════════════

export async function runCrossProductAnalysis(
  months: number = 3,
): Promise<CrossProductAnalysis> {
  const shared = await findSharedComponents();
  const demandProjections = await crossProductDemandProjection(months, shared);
  const allocations = await allocateSharedStock(months);

  const criticalCount = allocations.filter(a => a.severity === "critical").length;
  const warningCount = allocations.filter(a => a.severity === "warning").length;
  const okCount = allocations.filter(a => a.severity === "ok").length;

  const topBottleneck = allocations.length > 0 && allocations[0].severity !== "ok"
    ? allocations[0]
    : null;

  return {
    timestamp: new Date().toISOString(),
    projectionMonths: months,
    sharedComponents: shared,
    demandProjections,
    allocations,
    summary: {
      totalSharedComponents: shared.length,
      criticalCount,
      warningCount,
      okCount,
      topBottleneck: topBottleneck ? `${topBottleneck.componentCode} — ${topBottleneck.componentName}` : null,
      topBottleneckDeficit: topBottleneck?.deficit ?? 0,
    },
  };
}
