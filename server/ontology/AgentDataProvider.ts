import { computeEngine } from "./ComputeEngine";
import { ontologyService } from "./OntologyService";

/**
 * AgentDataProvider — Fetches live ontology data and formats it as context
 * for the AI Agent's system prompt. Calls services directly (no HTTP).
 */

let cachedContext: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getAgentContext(): Promise<string> {
  const now = Date.now();
  if (cachedContext && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedContext;
  }

  try {
    const sections: string[] = [];
    const dateStr = new Date().toLocaleDateString("tr-TR");

    sections.push(`## ÇUKUROVA ISI SİSTEMLERİ — CANLI VERİ (${dateStr})`);

    // 1. Stock status
    const stockStatus = await computeEngine.getStockStatus();
    if (stockStatus.length > 0) {
      const lines: string[] = [];
      for (const p of stockStatus) {
        const c = p.computed || {};
        const props = p.properties || {};
        lines.push(
          `  - ${p.title} (${p.sku}): RAG=${c.rag_status || "?"} | Risk=${c.stock_risk_score || 0}/100 | Stok=${c.current_stock || 0} | Gün=${c.days_of_supply || 0} gün tedarik | ABC=${c.abc_class || "?"} | Stok%=${props.stock_percent || 0} Sipariş%=${props.order_percent || 0} | Birim Maliyet=${props.unit_cost || 0}₺`
        );
      }
      sections.push(`\n### ÜRÜN STOK DURUMU (risk skoruna göre sıralı)\n${lines.join("\n")}`);
    }

    // 2. Risk alerts
    const reorderAlerts = await computeEngine.getReorderAlerts();
    if (reorderAlerts.length > 0) {
      const lines = reorderAlerts.map((a: any) =>
        `  ⚠ ${a.title} (${a.sku}): Stok=${a.current_stock} < Yeniden Sipariş Noktası=${a.reorder_point} | ${a.days_of_supply} gün kaldı | Aciliyet: ${a.urgency}`
      );
      sections.push(`\n### RİSK ALARMLARI\n${lines.join("\n")}`);
    } else {
      sections.push(`\n### RİSK ALARMLARI\nŞu an kritik stok alarmı yok.`);
    }

    // 3. Overstock report
    const overstockReport = await computeEngine.getOverstockReport();
    if (overstockReport.length > 0) {
      const lines = overstockReport.map((p: any) => {
        const c = p.computed || {};
        return `  📦 ${p.title} (${p.sku}): Fazla stok=${c.excess_inventory || 0} adet | Değer=${c.excess_inventory_value || 0}₺ | Ciddiyet: ${p.severity}`;
      });
      sections.push(`\n### FAZLA STOK RAPORU\n${lines.join("\n")}`);
    }

    // 4. Seasonal forecast
    const forecasts = await computeEngine.getSeasonalForecast();
    if (forecasts.length > 0) {
      const lines = forecasts.map((f: any) => {
        const months = f.forecast.map((m: any) => `${m.month}: ${m.predicted_demand}`).join(", ");
        return `  - ${f.title} (${f.sku}): ${months} | Toplam tahmin: ${f.total_forecast} | Aylık ort: ${f.avg_monthly_demand}`;
      });
      sections.push(`\n### MEVSİMSEL TAHMİN (Önümüzdeki 3 ay)\n${lines.join("\n")}`);
    }

    // 5. Capital exposure
    const capital = await computeEngine.getCapitalExposure();
    if (capital) {
      sections.push(`\n### SERMAYE MARUZİYETİ
  - Toplam fazla stok değeri: ${capital.total_capital_exposure || 0}₺
  - Toplam stok değeri: ${capital.total_stock_value || 0}₺
  - Maruziyet oranı: %${capital.exposure_percent || 0}`);
      if (capital.products && capital.products.length > 0) {
        const prodLines = capital.products.map((p: any) =>
          `    → ${p.title} (${p.sku}): ${p.excess_units} adet fazla = ${p.excess_value}₺`
        );
        sections.push(prodLines.join("\n"));
      }
    }

    // 6. Dashboard summary
    const dashboard = await computeEngine.getDashboard();
    if (dashboard) {
      const rag = dashboard.rag_distribution || {};
      sections.push(`\n### GENEL ÖZET
  - Toplam ürün: ${dashboard.total_products || 0}
  - RAG dağılımı: 🔴 Kırmızı=${rag.red || 0}, 🟡 Sarı=${rag.amber || 0}, 🟢 Yeşil=${rag.green || 0}, 🔵 Mavi(fazla stok)=${rag.blue || 0}
  - Sermaye verimliliği: %${dashboard.capital_efficiency || 0}`);
    }

    // 7. Production flow (3-tier)
    const products = await ontologyService.getObjectsByType("product");
    const semiFinished = await ontologyService.getObjectsByType("semi_finished_product");
    const rawMaterials = await ontologyService.getObjectsByType("raw_material");
    const productionLines = await ontologyService.getObjectsByType("production_line");

    sections.push(`\n### ÜRETİM AKIŞ ÖZETİ (3 Katman)
  - TIER 1 MAMÜL (Bitmiş Ürünler): ${products.length} ürün → Depo → Satış
  - TIER 2 YARI MAMÜL (Yarı Mamül): ${semiFinished.length} bileşen → Üretim → Depo → Satış [YENİ TESİS KİRALANDI]
  - TIER 3 HAM MADDE: ${rawMaterials.length} malzeme → Üretim → Depo → Satış
  - Üretim hatları: ${productionLines.length}`);

    if (semiFinished.length > 0) {
      const sfLines = semiFinished.map(sf => {
        const props = sf.properties as any;
        return `    → ${sf.title} (${sf.externalId}): Stok=${props.current_stock || 0}, Aylık kullanım=${props.monthly_usage || 0}${props.requires_new_facility ? " [YENİ TESİS]" : ""}`;
      });
      sections.push(`  Yarı mamül detay:\n${sfLines.join("\n")}`);
    }

    if (rawMaterials.length > 0) {
      const rmLines = rawMaterials.map(rm => {
        const props = rm.properties as any;
        return `    → ${rm.title}: Tedarikçi=${props.supplier || "?"}, Stok=${props.current_stock || 0} ${props.unit || ""}, Teslim=${props.lead_time_days || 0} gün`;
      });
      sections.push(`  Hammadde detay:\n${rmLines.join("\n")}`);
    }

    if (productionLines.length > 0) {
      const plLines = productionLines.map(pl => {
        const props = pl.properties as any;
        return `    → ${pl.title}: Kapasite=${props.daily_capacity || 0}/gün, Çalışan=${props.worker_count || 0}, Verimlilik=%${Math.round((props.utilization_rate || 0) * 100)}`;
      });
      sections.push(`  Üretim hatları:\n${plLines.join("\n")}`);
    }

    // 8. Seasonality context
    sections.push(`\n### MEVSİMSELLİK BİLGİSİ
  - YÜKSEK SEZON: Ekim, Kasım, Aralık, Ocak (HVAC kış talebi)
  - DÜŞÜK SEZON: Nisan, Mayıs, Haziran, Temmuz
  - GEÇİŞ: Ağustos, Eylül (stok biriktirme dönemi), Şubat, Mart (sezon kapanışı)`);

    const context = sections.join("\n");
    cachedContext = context;
    cacheTimestamp = now;
    return context;
  } catch (err: any) {
    console.error("[AgentDataProvider] Error building context:", err.message);
    return `## ÇUKUROVA ISI — VERİ HATASI\nOntoloji verisi yüklenemedi: ${err.message}`;
  }
}

/**
 * Force-invalidate the cache (e.g., after compute refresh)
 */
export function invalidateAgentCache(): void {
  cachedContext = null;
  cacheTimestamp = 0;
}
