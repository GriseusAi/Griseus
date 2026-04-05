/**
 * GRISEUS Proactive Rules Engine — Continuous Validation Pipeline
 * 10 kural: 4 reaktif + 6 proaktif/tahmine dayalı
 * Her uyarı root cause chain ile açıklanır.
 */
import { db } from "./db";
import { stockLevels, products, purchaseSuggestions, componentStock, bomItems } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { computeComponentIntelligence, type ComponentIntelligence } from "./routes/intelligence";
import { computeProductionCapacity, getBomWithStock } from "./routes/bom";
import { type ReasoningStep } from "./lib/impact-types";
import { SEASONAL_INDICES, MONTH_LABELS, MONTHLY_DEMAND } from "./lib/seasonal-constants";
import { persistAlerts } from "./lib/alert-persistence";
import { trackAlertsAsOutcomes } from "./lib/outcome-engine";
import { evaluateCustomRules } from "./lib/nl-rules-evaluator";
import { adjustSeverity, refreshSuppression } from "./lib/feedback-loop";
import { MAIN_SKU, CAPACITY_HISTORY_SIZE, WINTER_MONTHS } from "./lib/constants";
import { getThresholds } from "./lib/adaptive-thresholds";

export interface ProactiveAlert {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  rootCause?: ReasoningStep[];
  componentCode?: string;
  productSku?: string;
  suggestedAction?: string;
  timestamp: string;
}

let alertCounter = 0;
function makeAlertId(): string {
  return `alert_${Date.now()}_${++alertCounter}`;
}

// Kapasite takibi — Rule 10 için
const capacityHistory: Array<{ ts: number; capacity: number }> = [];

export async function evaluateRules(trigger: {
  type: "stock_movement" | "component_stock_update";
  productId?: number;
  componentCode?: string;
}): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];
  const now = new Date().toISOString();
  const currentMonthIdx = new Date().getMonth();
  const nextMonthIdx = (currentMonthIdx + 1) % 12;

  // ATE — Adaptif eşikleri çek
  const T = await getThresholds();

  // Ortak veriyi bir kez hesapla
  let intel: { components: ComponentIntelligence[]; criticalCount: number } | null = null;
  let bomItems_data: Awaited<ReturnType<typeof getBomWithStock>> | null = null;
  let capacity: ReturnType<typeof computeProductionCapacity> | null = null;

  try {
    [intel, bomItems_data] = await Promise.all([
      computeComponentIntelligence(MAIN_SKU).catch(() => null),
      getBomWithStock(MAIN_SKU).catch(() => null),
    ]);
    if (bomItems_data && bomItems_data.length > 0) {
      capacity = computeProductionCapacity(bomItems_data);
    }
  } catch (err) { console.error("[rules-engine] Rule evaluation error:", err); }

  try {
    // ══════════════════════════════════════════════════════════
    // REAKTIF KURALLAR (mevcut olaylardan tetiklenen)
    // ══════════════════════════════════════════════════════════

    // ── Rule 1: Transfer Needed ──
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
          rootCause: [
            { order: 1, cause: "Stok hareketi sonrası ürün durumu kontrol edildi", data: { productSku: level.productSku || "?" } },
            { order: 2, cause: `Depoda 0 adet, üretimde ${level.inProduction} adet bekliyor`, data: { inWarehouse: 0, inProduction: level.inProduction } },
            { order: 3, cause: "Üretimi tamamlanmış ürünler depoya aktarılmalı — satış için hazır hale getirilmeli" },
          ],
          timestamp: now,
        });
      }
    }

    // ── Rule 1b: Negative Component Stock (tier 2 hariç) ──
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
            rootCause: [
              { order: 1, cause: `${comp.code} bileşeninin stoku kontrol edildi`, data: { code: comp.code, tier: comp.tier ?? 0 } },
              { order: 2, cause: `Mevcut stok: ${comp.stock} (negatif!)`, data: { currentStock: Number(comp.stock) } },
              { order: 3, cause: "Üretim sırasında tüketilen miktar mevcut stoku aştı — acil tedarik gerekli" },
            ],
            timestamp: now,
          });
        }
      } catch (err) { console.error("[rules-engine] Rule evaluation error:", err); }
    }

    // ── Rule 2: Production Capacity Critical ──
    if (capacity && capacity.maxProducible < T.capacityCriticalThreshold) {
      const topBottleneck = capacity.bottlenecks[0];
      alerts.push({
        id: makeAlertId(),
        type: "production_capacity_critical",
        severity: "critical",
        title: "Üretim Durma Riski",
        message: `ELT.7-11 üretim kapasitesi ${capacity.maxProducible} adete düştü! Darboğaz: ${topBottleneck?.name || "?"} (${topBottleneck?.stock || 0} adet stok)`,
        productSku: MAIN_SKU,
        componentCode: topBottleneck?.code,
        suggestedAction: `${topBottleneck?.code} için acil tedarik başlat`,
        rootCause: [
          { order: 1, cause: "Üretim kapasitesi hesaplandı", data: { maxProducible: capacity.maxProducible } },
          { order: 2, cause: `Darboğaz: ${topBottleneck?.code} ${topBottleneck?.name}`, data: { bottleneckStock: topBottleneck?.stock ?? 0, required: topBottleneck?.required ?? 0 } },
          { order: 3, cause: `Kapasite ${capacity.maxProducible} < ${T.capacityCriticalThreshold} eşik değeri — üretim durma riski` },
        ],
        timestamp: now,
      });
    }

    // ── Rule 3+4: Component Critically Low + Auto Purchase ──
    if (trigger.type === "component_stock_update" && intel) {
      for (const comp of intel.components) {
        if (comp.urgency === "critical" && comp.daysToStockout !== null) {
          alerts.push({
            id: makeAlertId(),
            type: "critical_stockout_warning",
            severity: "critical",
            title: "Stok Tükenme Uyarısı",
            message: `${comp.code} ${comp.name} — Mevcut tüketim hızıyla ${comp.daysToStockout} gün içinde tükenecek! Stok: ${comp.currentStock}, Günlük tüketim: ${comp.dailyBurnRate}`,
            componentCode: comp.code,
            productSku: MAIN_SKU,
            suggestedAction: `${comp.suggestedOrderQty} ${comp.unit} sipariş ver`,
            rootCause: [
              { order: 1, cause: `${comp.code} ${comp.name} bileşeni analiz edildi`, data: { code: comp.code, tier: comp.tier } },
              { order: 2, cause: `Mevcut stok: ${comp.currentStock}, günlük tüketim: ${comp.dailyBurnRate.toFixed(1)}`, data: { stock: comp.currentStock, dailyRate: comp.dailyBurnRate } },
              { order: 3, cause: `Mevsimsel hesaplamayla ${comp.daysToStockout} gün sonra tükenecek`, data: { daysToStockout: comp.daysToStockout } },
              { order: 4, cause: `Önerilen sipariş: ${comp.suggestedOrderQty} ${comp.unit}` },
            ],
            timestamp: now,
          });

          // Rule 4: Auto purchase suggestion
          try {
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
                rootCause: [
                  { order: 1, cause: `${comp.code} kritik stok seviyesinde (${comp.daysToStockout} gün)` },
                  { order: 2, cause: `Bekleyen sipariş önerisi bulunamadı — otomatik oluşturuldu` },
                  { order: 3, cause: `Miktar: ${comp.suggestedOrderQty} ${comp.unit} (90 günlük tampon)` },
                ],
                timestamp: now,
              });
            }
          } catch (err) { console.error("[rules-engine] Rule evaluation error:", err); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════
    // PROAKTİF KURALLAR (tahmine dayalı erken uyarı)
    // ══════════════════════════════════════════════════════════

    if (intel) {
      // ── Rule 5: Mevsimsel Talep Spike Tahmini ──
      const currentIdx = SEASONAL_INDICES[currentMonthIdx];
      const nextIdx = SEASONAL_INDICES[nextMonthIdx];
      if (nextIdx > currentIdx * T.seasonalSpikeRatio) {
        const spikeRatio = (nextIdx / currentIdx).toFixed(2);
        const criticalForSpike = intel.components.filter(c =>
          c.seasonalDays !== null && c.seasonalDays < T.seasonalRiskDays
        );
        if (criticalForSpike.length > 0) {
          alerts.push({
            id: makeAlertId(),
            type: "seasonal_spike_prediction",
            severity: "warning",
            title: "Mevsimsel Talep Artışı Yaklaşıyor",
            message: `${MONTH_LABELS[nextMonthIdx]} ayında talep ${spikeRatio}x artacak (${MONTHLY_DEMAND[currentMonthIdx]} → ${MONTHLY_DEMAND[nextMonthIdx]} adet). ${criticalForSpike.length} bileşen risk altında.`,
            productSku: MAIN_SKU,
            suggestedAction: `Risk altındaki ${criticalForSpike.length} bileşen için stok takviyesi planla`,
            rootCause: [
              { order: 1, cause: `Mevsimsel indeks karşılaştırması: ${MONTH_LABELS[currentMonthIdx]} (${currentIdx.toFixed(2)}) → ${MONTH_LABELS[nextMonthIdx]} (${nextIdx.toFixed(2)})`, data: { currentIndex: currentIdx, nextIndex: nextIdx } },
              { order: 2, cause: `Talep artış oranı: ${spikeRatio}x (eşik: 1.30x)`, data: { ratio: Number(spikeRatio) } },
              { order: 3, cause: `${criticalForSpike.length} bileşenin mevsimsel ömrü 60 günün altında`, data: { atRiskCount: criticalForSpike.length } },
              ...criticalForSpike.slice(0, 3).map((c, i) => ({
                order: 4 + i,
                cause: `${c.code} ${c.name}: ${c.seasonalDays} gün kaldı`,
                data: { code: c.code, seasonalDays: c.seasonalDays ?? 0 },
              })),
            ],
            timestamp: now,
          });
        }
      }

      // ── Rule 6: BOM Cascade Failure ──
      const criticalComps = intel.components.filter(c => c.urgency === "critical");
      if (criticalComps.length >= T.cascadeFailureThreshold) {
        alerts.push({
          id: makeAlertId(),
          type: "bom_cascade_failure",
          severity: "critical",
          title: "Çoklu Bileşen Krizi",
          message: `${criticalComps.length} bileşen aynı anda kritik seviyede! Üretim durma riski yüksek — kurtarma süresi uzar.`,
          productSku: MAIN_SKU,
          suggestedAction: "Acil tedarik toplantısı — tüm kritik bileşenler için koordineli sipariş",
          rootCause: [
            { order: 1, cause: `${criticalComps.length} bileşen aynı anda KRİTİK durumda (eşik: 3)` },
            ...criticalComps.slice(0, 5).map((c, i) => ({
              order: 2 + i,
              cause: `${c.code} ${c.name}: stok ${c.currentStock}, ${c.daysToStockout ?? 0} gün kaldı`,
              data: { code: c.code, stock: c.currentStock, days: c.daysToStockout ?? 0 },
            })),
            { order: 2 + Math.min(criticalComps.length, 5), cause: "Tek bileşen bile üretimi durdurur — çoklu kriz kurtarma süresini katlar" },
          ],
          timestamp: now,
        });
      }

      // ── Rule 7: Lead Time Risk ──
      for (const comp of intel.components) {
        if (
          comp.daysToStockout !== null &&
          comp.daysToStockout > 0 &&
          comp.daysToStockout <= T.leadTimeDays &&
          comp.urgency !== "critical" // critical zaten Rule 3'te yakalanıyor
        ) {
          alerts.push({
            id: makeAlertId(),
            type: "lead_time_risk",
            severity: "warning",
            title: "Tedarik Süresi Riski",
            message: `${comp.code} ${comp.name} — ${comp.daysToStockout} gün sonra tükenecek ama tedarik süresi ${T.leadTimeDays} gün. Bugün sipariş verse bile yetişmez!`,
            componentCode: comp.code,
            productSku: MAIN_SKU,
            suggestedAction: `${comp.code} için ACİL sipariş + alternatif tedarikçi ara`,
            rootCause: [
              { order: 1, cause: `${comp.code} stok ömrü hesaplandı: ${comp.daysToStockout} gün`, data: { daysToStockout: comp.daysToStockout } },
              { order: 2, cause: `Adaptif tedarik süresi: ${T.leadTimeDays} gün`, data: { leadTime: T.leadTimeDays } },
              { order: 3, cause: `Stok ömrü (${comp.daysToStockout}) < tedarik süresi (${T.leadTimeDays}) — sipariş yetişmez`, data: { gap: T.leadTimeDays - comp.daysToStockout } },
            ],
            timestamp: now,
          });
        }
      }

      // ── Rule 8: Talep Anomalisi ──
      const anomalies = intel.components.filter(c => c.trend === "accelerating" && c.trendRatio > T.demandAnomalyRatio);
      for (const comp of anomalies) {
        alerts.push({
          id: makeAlertId(),
          type: "demand_anomaly",
          severity: "warning",
          title: "Anormal Tüketim Hızı",
          message: `${comp.code} ${comp.name} — Tüketim hızı normalin ${comp.trendRatio.toFixed(1)}x üstünde! Beklenmedik talep artışı veya veri hatası olabilir.`,
          componentCode: comp.code,
          productSku: MAIN_SKU,
          suggestedAction: `${comp.code} tüketim kaydını kontrol et + stok takviyesi değerlendir`,
          rootCause: [
            { order: 1, cause: `${comp.code} tüketim trendi: ${comp.trend}`, data: { trend: comp.trend } },
            { order: 2, cause: `Trend oranı: ${comp.trendRatio.toFixed(2)}x (eşik: 1.50x)`, data: { trendRatio: comp.trendRatio } },
            { order: 3, cause: `Günlük tüketim: ${comp.dailyBurnRate.toFixed(1)} — beklenen mevsimsel ortalamanın çok üstünde` },
            { order: 4, cause: "Olası nedenler: sipariş patlaması, hatalı stok çıkışı veya sezonluk öne çekme" },
          ],
          timestamp: now,
        });
      }

      // ── Rule 9: Kış Stresi Tahmini ──
      const winterRisks = intel.components.filter(c =>
        c.winterStress === true && c.urgency !== "critical"
      );
      for (const comp of winterRisks) {
        alerts.push({
          id: makeAlertId(),
          type: "winter_stress_prediction",
          severity: "info",
          title: "Kış Stresi Tahmini",
          message: `${comp.code} ${comp.name} — Stok kış aylarında (${comp.depletionMonth} ${comp.depletionYear}) tükenecek. Kış talebi yüksek olduğundan erken tedarik önerilir.`,
          componentCode: comp.code,
          productSku: MAIN_SKU,
          suggestedAction: `${comp.code} için kış öncesi stok takviyesi planla`,
          rootCause: [
            { order: 1, cause: `${comp.code} mevsimsel forward-walk analizi yapıldı` },
            { order: 2, cause: `Tükenme tahmini: ${comp.depletionMonth} ${comp.depletionYear}`, data: { depletionMonth: comp.depletionMonth ?? "", depletionYear: comp.depletionYear ?? 0 } },
            { order: 3, cause: "Kış ayları (Kas-Şub) talep indeksi yüksek — Oca: 1.73x, Ara: 1.65x" },
            { order: 4, cause: "Erken tedarik ile kış dönemi güvence altına alınmalı" },
          ],
          timestamp: now,
        });
      }
    }

    // ── Rule 10: Kapasite Erozyon Trendi ──
    if (capacity) {
      capacityHistory.push({ ts: Date.now(), capacity: capacity.maxProducible });
      if (capacityHistory.length > CAPACITY_HISTORY_SIZE) capacityHistory.shift();

      if (capacityHistory.length >= 3) {
        const last3 = capacityHistory.slice(-3);
        const isDecreasing = last3[0].capacity > last3[1].capacity && last3[1].capacity > last3[2].capacity;
        if (isDecreasing && capacity.maxProducible > T.capacityCriticalThreshold) { // kapasiteCritical zaten Rule 2'de
          alerts.push({
            id: makeAlertId(),
            type: "capacity_degradation_trend",
            severity: "warning",
            title: "Kapasite Erozyon Trendi",
            message: `Üretim kapasitesi sürekli düşüyor: ${last3.map(h => h.capacity).join(" → ")}. Mevcut darboğaz: ${capacity.bottlenecks[0]?.name || "?"}`,
            productSku: MAIN_SKU,
            suggestedAction: "Darboğaz bileşenlerin tedarik planını gözden geçir",
            rootCause: [
              { order: 1, cause: `Son 3 ölçümde kapasite monoton düşüyor`, data: { readings: last3.map(h => h.capacity).join(", ") } },
              { order: 2, cause: `Kapasite trendi: ${last3[0].capacity} → ${last3[1].capacity} → ${last3[2].capacity}` },
              { order: 3, cause: `Mevcut darboğaz: ${capacity.bottlenecks[0]?.code} ${capacity.bottlenecks[0]?.name}`, data: { bottleneck: capacity.bottlenecks[0]?.code ?? "" } },
              { order: 4, cause: "Eğilim devam ederse üretim durma riski oluşacak — proaktif tedarik gerekli" },
            ],
            timestamp: now,
          });
        }
      }
    }

  } catch (err) {
    console.error("[rules-engine] Error evaluating rules:", err);
  }

  // ══════════════════════════════════════════════════════════
  // ÖZEL KURALLAR (Natural Language Rules)
  // ══════════════════════════════════════════════════════════
  try {
    const customAlerts = await evaluateCustomRules({
      intel,
      capacity,
      currentMonth: currentMonthIdx,
    });
    alerts.push(...customAlerts);
  } catch (err) {
    console.error("[rules-engine] Custom rules error:", err);
  }

  // Feedback Loop — false positive oranı yüksek kuralların severity'sini düşür
  await refreshSuppression().catch(err => console.error("[rules-engine] Feedback refresh error:", err));
  for (const alert of alerts) {
    alert.severity = adjustSeverity(alert.severity, alert.type);
  }

  // Alert'leri DB'ye kaydet (fire-and-forget)
  if (alerts.length > 0) {
    persistAlerts(alerts).catch(err => console.error("[rules-engine] Alert persistence error:", err));
    // OLE — Her alert bir tahmindir, outcome tracking'e kaydet
    trackAlertsAsOutcomes(alerts);
  }

  return alerts;
}
