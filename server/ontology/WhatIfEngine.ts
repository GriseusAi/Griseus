import { ontologyService } from "./OntologyService";
import { computeEngine } from "./ComputeEngine";

/**
 * WhatIfEngine — Simulation functions for the AI Agent.
 * Returns structured text that can be injected into the AI response context.
 */

export class WhatIfEngine {

  /**
   * Simulate stopping production for a product for N months.
   * Returns: capital saved, stockout risk, capacity freed.
   */
  async simulateProductionStop(productExternalId: string, months: number = 2): Promise<string> {
    const products = await ontologyService.getObjectsByType("product");
    const product = products.find(p => p.externalId?.toLowerCase() === productExternalId.toLowerCase()
      || p.title.toLowerCase().includes(productExternalId.toLowerCase()));

    if (!product) return `Ürün bulunamadı: ${productExternalId}`;

    const props = product.properties as any;
    const computed = product.computedProperties as any;
    const monthlyProd = props.monthly_production || [];
    const avgMonthly = monthlyProd.length > 0
      ? monthlyProd.reduce((a: number, b: number) => a + b, 0) / monthlyProd.length
      : 0;
    const unitCost = props.unit_cost || 150;
    const currentStock = computed?.current_stock || props.current_stock || 0;
    const avgMonthlyDemand = computed?.avg_monthly_demand || Math.round(avgMonthly * (props.order_percent || 0) / 100);

    const productionSaved = Math.round(avgMonthly * months);
    const capitalSaved = Math.round(productionSaved * unitCost);
    const stockAfterMonths = Math.max(0, currentStock - (avgMonthlyDemand * months));
    const monthsUntilStockout = avgMonthlyDemand > 0 ? Math.round(currentStock / avgMonthlyDemand) : 999;

    // Capacity freed estimate (assuming equal share of line)
    const productionLines = await ontologyService.getObjectsByType("production_line");
    let capacityFreedPct = 0;
    if (productionLines.length > 0) {
      const totalCapacity = productionLines.reduce((sum, pl) => {
        const plProps = pl.properties as any;
        return sum + ((plProps.daily_capacity || 0) * 22);
      }, 0);
      if (totalCapacity > 0) {
        capacityFreedPct = Math.round((avgMonthly / totalCapacity) * 100 * 10) / 10;
      }
    }

    return `## ${product.title} (${product.externalId}) — ${months} Ay Üretim Durdurma Simülasyonu

- **Mevcut stok:** ${currentStock} adet
- **Ortalama aylık talep:** ~${avgMonthlyDemand} adet
- **Ortalama aylık üretim:** ~${Math.round(avgMonthly)} adet
- **${months} ayda üretilmeyecek miktar:** ${productionSaved} adet
- **Sermaye tasarrufu:** ${capitalSaved.toLocaleString("tr-TR")}₺
- **${months} ay sonra kalan stok:** ${stockAfterMonths} adet
- **Stoksuz kalma süresi:** ${monthsUntilStockout > 24 ? ">24 ay (güvenli)" : `~${monthsUntilStockout} ay`}
- **Serbest kalan kapasite:** %${capacityFreedPct} hat kapasitesi
- **Öneri:** ${monthsUntilStockout > months * 2 ? "Durdurun — mevcut stok yeterli, sermaye serbest kalır." : monthsUntilStockout > months ? "Dikkatli ilerleyin — stok azalıyor ama yeterli." : "Riskli — stoğunuz eriyebilir, kısmi üretim yapın."}`;
  }

  /**
   * Simulate seasonal preparation — what to produce now for target month demand.
   */
  async simulateSeasonalPrep(targetMonth: number): Promise<string> {
    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const products = await computeEngine.getStockStatus();

    const recommendations: string[] = [];
    let totalRequired = 0;
    let totalDeficit = 0;

    for (const p of products) {
      const props = p.properties || {};
      const computed = p.computed || {};
      const monthlyProd: number[] = (props as any).monthly_production || [];
      const monthIdx = targetMonth - 1;
      const demandInTarget = monthlyProd[monthIdx] || computed.avg_monthly_demand || 0;
      const currentStock = computed.current_stock || 0;
      const safetyStock = computed.safety_stock || 0;
      const required = Math.max(0, demandInTarget + safetyStock - currentStock);

      totalRequired += demandInTarget;
      if (required > 0) {
        totalDeficit += required;
        recommendations.push(
          `  - **${p.title}** (${p.sku}): Hedef talep=${demandInTarget}, Stok=${currentStock}, Emniyet=${safetyStock} → **${required} adet üretilmeli**`
        );
      }
    }

    return `## ${months[targetMonth - 1]} Ayı Hazırlık Simülasyonu

### Toplam Hedef Talep: ${totalRequired} adet
### Toplam Üretim Açığı: ${totalDeficit} adet

### Ürün Bazlı Üretim Gereksinimleri:
${recommendations.length > 0 ? recommendations.join("\n") : "  Tüm ürünlerde yeterli stok var."}

### Öneri:
${targetMonth >= 10 || targetMonth <= 1
  ? "⚠ Yüksek sezon dönemi — şimdiden stok biriktirmeye başlayın. Ağustos-Eylül kritik hazırlık dönemi."
  : targetMonth >= 4 && targetMonth <= 7
  ? "📉 Düşük sezon — üretimi yavaşlatın, stok eritmeye odaklanın."
  : "🔄 Geçiş dönemi — talep değişkenliği yüksek, esnek planlama yapın."}`;
  }

  /**
   * Simulate raw material price increase impact.
   */
  async simulatePriceIncrease(materialType: string, percentIncrease: number): Promise<string> {
    const rawMaterials = await ontologyService.getObjectsByType("raw_material");
    const material = rawMaterials.find(rm =>
      rm.title.toLowerCase().includes(materialType.toLowerCase()) ||
      (rm.externalId || "").toLowerCase().includes(materialType.toLowerCase())
    );

    if (!material) {
      const available = rawMaterials.map(rm => rm.title).join(", ");
      return `Hammadde bulunamadı: "${materialType}". Mevcut hammaddeler: ${available}`;
    }

    const matProps = material.properties as any;
    const currentPrice = matProps.unit_cost || 0;
    const newPrice = Math.round(currentPrice * (1 + percentIncrease / 100));
    const priceIncrease = newPrice - currentPrice;

    // Find which products use this material
    const products = await ontologyService.getObjectsByType("product");
    const impactLines: string[] = [];
    let totalImpact = 0;

    for (const product of products) {
      const pProps = product.properties as any;
      const totalProd = pProps.total_production || 0;
      // Estimate material usage per unit (simplified)
      const estimatedUsagePerUnit = 1; // Simplified; real BOM would give exact
      const annualImpact = Math.round(totalProd * estimatedUsagePerUnit * priceIncrease);
      if (annualImpact > 0) {
        totalImpact += annualImpact;
        impactLines.push(`  - ${product.title}: ~${annualImpact.toLocaleString("tr-TR")}₺/yıl maliyet artışı`);
      }
    }

    return `## ${material.title} — %${percentIncrease} Fiyat Artışı Simülasyonu

- **Mevcut fiyat:** ${currentPrice}₺/${matProps.unit || "birim"}
- **Yeni fiyat:** ${newPrice}₺/${matProps.unit || "birim"} (+${priceIncrease}₺)
- **Tedarikçi:** ${matProps.supplier || "Bilinmiyor"}

### Ürün Bazlı Etki:
${impactLines.length > 0 ? impactLines.join("\n") : "  Doğrudan etkilenen ürün bulunamadı."}

### Toplam Tahmini Yıllık Maliyet Artışı: ${totalImpact.toLocaleString("tr-TR")}₺`;
  }

  /**
   * Simulate capacity shift between production lines.
   */
  async simulateCapacityShift(fromLineKeyword: string, toLineKeyword: string, workerCount: number): Promise<string> {
    const prodLines = await ontologyService.getObjectsByType("production_line");

    const fromLine = prodLines.find(pl => pl.title.toLowerCase().includes(fromLineKeyword.toLowerCase()));
    const toLine = prodLines.find(pl => pl.title.toLowerCase().includes(toLineKeyword.toLowerCase()));

    if (!fromLine) return `Kaynak hat bulunamadı: "${fromLineKeyword}". Hatlar: ${prodLines.map(p => p.title).join(", ")}`;
    if (!toLine) return `Hedef hat bulunamadı: "${toLineKeyword}". Hatlar: ${prodLines.map(p => p.title).join(", ")}`;

    const fromProps = fromLine.properties as any;
    const toProps = toLine.properties as any;

    const fromWorkers = fromProps.worker_count || 0;
    const toWorkers = toProps.worker_count || 0;
    const fromCapacity = fromProps.daily_capacity || 0;
    const toCapacity = toProps.daily_capacity || 0;
    const fromUtil = fromProps.utilization_rate || 0;
    const toUtil = toProps.utilization_rate || 0;

    if (workerCount > fromWorkers) {
      return `⚠ ${fromLine.title}'da sadece ${fromWorkers} çalışan var, ${workerCount} kişi aktarılamaz.`;
    }

    // Estimate capacity change proportional to worker ratio
    const fromCapacityLoss = Math.round((workerCount / fromWorkers) * fromCapacity);
    const toCapacityGain = Math.round((workerCount / (toWorkers + workerCount)) * toCapacity * 0.8); // 80% efficiency for new workers

    const newFromCapacity = fromCapacity - fromCapacityLoss;
    const newToCapacity = toCapacity + toCapacityGain;

    return `## Kapasite Kaydırma: ${fromLine.title} → ${toLine.title} (${workerCount} çalışan)

### ${fromLine.title} (KAYNAK)
- Mevcut: ${fromWorkers} çalışan, ${fromCapacity}/gün kapasite, %${Math.round(fromUtil * 100)} verimlilik
- Sonra: ${fromWorkers - workerCount} çalışan, ~${newFromCapacity}/gün kapasite
- Kapasite kaybı: ${fromCapacityLoss}/gün

### ${toLine.title} (HEDEF)
- Mevcut: ${toWorkers} çalışan, ${toCapacity}/gün kapasite, %${Math.round(toUtil * 100)} verimlilik
- Sonra: ${toWorkers + workerCount} çalışan, ~${newToCapacity}/gün kapasite
- Kapasite kazanımı: ~${toCapacityGain}/gün (%80 verimlilik varsayımı — yeni çalışan adaptasyonu)

### Net Etki
- Toplam günlük kapasite değişimi: ${toCapacityGain - fromCapacityLoss > 0 ? "+" : ""}${toCapacityGain - fromCapacityLoss}/gün
- Aylık (22 iş günü): ${((toCapacityGain - fromCapacityLoss) * 22) > 0 ? "+" : ""}${(toCapacityGain - fromCapacityLoss) * 22} adet

### Öneri:
${toCapacityGain - fromCapacityLoss > 0
  ? "Net pozitif — kaynak hattın yükü azalır, hedef hat güçlenir."
  : "Net negatif — yeni çalışanların adaptasyon süresi toplam kapasiteyi düşürür. Geçici bir kayıp beklenir."}`;
  }
}

export const whatIfEngine = new WhatIfEngine();

/**
 * Detect what-if questions and run simulations.
 * Returns simulation result or null if not a what-if question.
 */
export async function detectAndRunWhatIf(message: string): Promise<string | null> {
  const lower = message.toLowerCase();

  // Pattern: "X üretimini durdursak" or "stop producing X"
  const stopMatch = lower.match(/(\S+(?:\s+\S+)?)\s+(?:üretimini?\s+durdur|üretimi(?:ni)?\s+(?:dur|stop)|durdursak|stop\s+produc)/);
  const monthsMatch = lower.match(/(\d+)\s*ay/);
  if (stopMatch) {
    const productId = stopMatch[1].replace(/['"]/g, "").trim().toUpperCase();
    const months = monthsMatch ? parseInt(monthsMatch[1]) : 2;
    return whatIfEngine.simulateProductionStop(productId, months);
  }

  // Pattern: "X ayına hazırlık" or "prepare for month X"
  const prepMatch = lower.match(/(?:ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s*(?:ayı|için|hazırlık)/);
  if (prepMatch) {
    const monthMap: Record<string, number> = {
      "ocak": 1, "şubat": 2, "mart": 3, "nisan": 4, "mayıs": 5, "haziran": 6,
      "temmuz": 7, "ağustos": 8, "eylül": 9, "ekim": 10, "kasım": 11, "aralık": 12,
    };
    const monthName = prepMatch[0].split(/\s/)[0];
    const month = monthMap[monthName] || 10;
    return whatIfEngine.simulateSeasonalPrep(month);
  }

  // Pattern: "fiyat artarsa" or "maliyet artışı"
  const priceMatch = lower.match(/(?:fiyat|maliyet)\s*(?:artarsa|artışı|artar|yükselir|yükselirse).*?%?\s*(\d+)/);
  const materialMatch = lower.match(/(çelik|bakır|galvaniz|brülör|rezistans|termostat|boya|izolasyon)/i);
  if (priceMatch && materialMatch) {
    const pct = parseInt(priceMatch[1]);
    return whatIfEngine.simulatePriceIncrease(materialMatch[1], pct);
  }

  // Pattern: "çalışan kaydır" or "worker shift"
  const shiftMatch = lower.match(/(\d+)\s*(?:çalışan|kişi|işçi)\s*(?:kaydır|aktar|taşı)/);
  const fromTo = lower.match(/(gazlı|elektrikli|gaz|elektrik)\s*(?:hat|hatt).*?(gazlı|elektrikli|gaz|elektrik)/i);
  if (shiftMatch && fromTo) {
    const count = parseInt(shiftMatch[1]);
    return whatIfEngine.simulateCapacityShift(fromTo[1], fromTo[2], count);
  }

  return null;
}
