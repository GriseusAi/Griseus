/**
 * GRISEUS Proactive Rules Engine
 * Evaluates business rules after stock events and generates alerts.
 * Implements the DECIDE phase of the OODA loop.
 */
import { db } from "./db";
import { stockLevels, products, purchaseSuggestions, componentStock, bomItems } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { computeComponentIntelligence } from "./routes/intelligence";
import { computeProductionCapacity, getBomWithStock } from "./routes/bom";

export interface ProactiveAlert {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  componentCode?: string;
  productSku?: string;
  suggestedAction?: string;
  timestamp: string;
}

let alertCounter = 0;
function makeAlertId(): string {
  return `alert_${Date.now()}_${++alertCounter}`;
}

export async function evaluateRules(trigger: {
  type: "stock_movement" | "component_stock_update";
  productId?: number;
  componentCode?: string;
}): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];
  const now = new Date().toISOString();

  try {
    // ── Rule 1: Transfer Needed ──
    // If a product has items in production but zero in warehouse
    if (trigger.type === "stock_movement" && trigger.productId) {
      const [level] = await db.select({
        inProduction: stockLevels.inProduction,
        inWarehouse: stockLevels.inWarehouse,
        productSku: products.sku,
        productName: products.name,
      })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id))
        .where(eq(stockLevels.productId, trigger.productId));

      if (level && level.inWarehouse === 0 && level.inProduction > 0) {
        alerts.push({
          id: makeAlertId(),
          type: "transfer_recommended",
          severity: "warning",
          title: "Transfer Gerekli",
          message: `${level.productSku} — Depoda 0 adet, üretimde ${level.inProduction} adet bekliyor. Depoya transfer önerilir.`,
          productSku: level.productSku || undefined,
          suggestedAction: `${level.inProduction} adet depoya transfer et`,
          timestamp: now,
        });
      }
    }

    // ── Rule 1b: Negative Component Stock ──
    // After production, some components may have gone negative — critical alert
    // Tier 2 (YARI MAMÜL) bileşenler hariç — onlar alt bileşenlerden monte edilir, stok 0 normaldir
    if (trigger.type === "stock_movement") {
      try {
        const negatives = await db.select({
          code: componentStock.componentCode,
          stock: componentStock.currentStock,
          tier: bomItems.tier,
        })
          .from(componentStock)
          .innerJoin(bomItems, eq(bomItems.componentCode, componentStock.componentCode))
          .where(and(
            lt(componentStock.currentStock, "0"),
            sql`${bomItems.tier} != 2`
          ));

        for (const comp of negatives) {
          alerts.push({
            id: makeAlertId(),
            type: "negative_stock",
            severity: "critical",
            title: "Negatif Stok!",
            message: `${comp.code} stoku ${comp.stock} adete düştü! Gerçek stok ekside — acil tedarik gerekli.`,
            componentCode: comp.code,
            suggestedAction: `${comp.code} için acil sipariş oluştur`,
            timestamp: now,
          });
        }
      } catch { /* skip */ }
    }

    // ── Rule 2: Production Capacity Critical ──
    // Check if max producible units dropped below threshold
    if (trigger.type === "component_stock_update" || trigger.type === "stock_movement") {
      try {
        const items = await getBomWithStock("ELT.7-11");
        if (items.length > 0) {
          const capacity = computeProductionCapacity(items);
          if (capacity.maxProducible < 10) {
            const topBottleneck = capacity.bottlenecks[0];
            alerts.push({
              id: makeAlertId(),
              type: "production_capacity_critical",
              severity: "critical",
              title: "Üretim Durma Riski",
              message: `ELT.7-11 üretim kapasitesi ${capacity.maxProducible} adete düştü! Darboğaz: ${topBottleneck?.name || "?"} (${topBottleneck?.stock || 0} adet stok)`,
              productSku: "ELT.7-11",
              componentCode: topBottleneck?.code,
              suggestedAction: `${topBottleneck?.code} için acil tedarik başlat`,
              timestamp: now,
            });
          }
        }
      } catch { /* BOM not available, skip */ }
    }

    // ── Rule 3: Component Critically Low (days-to-stockout < 7) ──
    // ── Rule 4: Auto Purchase Suggestion ──
    if (trigger.type === "component_stock_update") {
      try {
        const intel = await computeComponentIntelligence("ELT.7-11");
        for (const comp of intel.components) {
          if (comp.urgency === "critical" && comp.daysToStockout !== null) {
            alerts.push({
              id: makeAlertId(),
              type: "critical_stockout_warning",
              severity: "critical",
              title: "Stok Tükenme Uyarısı",
              message: `${comp.code} ${comp.name} — Mevcut tüketim hızıyla ${comp.daysToStockout} gün içinde tükenecek! Stok: ${comp.currentStock}, Günlük tüketim: ${comp.dailyBurnRate}`,
              componentCode: comp.code,
              productSku: "ELT.7-11",
              suggestedAction: `${comp.suggestedOrderQty} ${comp.unit} sipariş ver`,
              timestamp: now,
            });

            // Rule 4: Auto-create purchase suggestion if none pending
            const [existing] = await db.select().from(purchaseSuggestions)
              .where(and(
                eq(purchaseSuggestions.componentCode, comp.code),
                eq(purchaseSuggestions.status, "pending"),
              ));

            if (!existing && comp.suggestedOrderQty > 0) {
              await db.insert(purchaseSuggestions).values({
                componentCode: comp.code,
                componentName: comp.name,
                suggestedQuantity: String(comp.suggestedOrderQty),
                unit: comp.unit,
                reason: `Otomatik: ${comp.daysToStockout} gün sonra tükenecek. Günlük tüketim: ${comp.dailyBurnRate} ${comp.unit}`,
                createdBy: "rules_engine",
              });

              alerts.push({
                id: makeAlertId(),
                type: "auto_purchase_suggestion",
                severity: "info",
                title: "Satın Alma Önerisi Oluşturuldu",
                message: `${comp.code} ${comp.name} için ${comp.suggestedOrderQty} ${comp.unit} satın alma önerisi otomatik oluşturuldu.`,
                componentCode: comp.code,
                timestamp: now,
              });
            }
          }
        }
      } catch { /* Intelligence computation failed, skip */ }
    }
  } catch (err) {
    console.error("[rules-engine] Error evaluating rules:", err);
  }

  return alerts;
}
