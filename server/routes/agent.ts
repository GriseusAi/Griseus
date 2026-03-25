import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { weeklyPlans, capacityMetrics, productionLines, stockLevels, stockMovementsV2, products, bomItems, componentStock } from "@shared/schema";
import { getBomWithStock, computeProductionCapacity, computeSubAssemblyCapacity } from "./bom";
import { eq, desc, sql, and } from "drizzle-orm";
import { computeEngine } from "../ontology/ComputeEngine";
import { ontologyService } from "../ontology/OntologyService";
import { whatIfEngine } from "../ontology/WhatIfEngine";

const router = Router();

// ══════════════════════════════════════════════════════════════════════
// NORMAL MODE — System Prompt + Legacy Tools (HTTP-based)
// ══════════════════════════════════════════════════════════════════════

const BASE_SYSTEM_PROMPT = `Sen Griseus AI Assistant'sın. Çukurova Isı Sistemleri'nin operasyonel verilerine erişimin var.
Gerçek veritabanı verisiyle cevap ver, tahmin yapma. Türkçe cevap ver.
Kullanıcı sana üretim, kapasite, personel, darboğaz, planlama hakkında sorular soracak.
Her cevabında veriyi kaynak göster.

Cevap formatı:
- Başlıklar için ## veya ### kullan
- Önemli sayıları ve metrikleri **kalın** yaz
- Madde listesi için - kullan
- Verim oranı, kapasite, üretim gibi sonuçları net ve yapılandırılmış göster
- Kısa ve net cevap ver, gereksiz uzatma`;

async function buildContextualSystemPrompt(): Promise<string> {
  const sections: string[] = [BASE_SYSTEM_PROMPT];

  const recentPlans = await db.select().from(weeklyPlans)
    .orderBy(desc(weeklyPlans.createdAt))
    .limit(10);

  if (recentPlans.length > 0) {
    const planLines = recentPlans.map(p => {
      const actual = p.actualQty != null ? `gercek: ${p.actualQty}` : "gercek: -";
      const rate = p.realizationRate ? `gerceklesme: %${Math.round(parseFloat(p.realizationRate) * 100)}` : "";
      const risk = p.riskFlag ? " [RISK]" : "";
      const reason = p.deviationReason ? ` sapma: ${p.deviationReason}` : "";
      return `  - ${p.weekLabel} | hat ${p.lineId} | plan: ${p.plannedQty} | ${actual} | ${rate}${reason}${risk} | durum: ${p.status}`;
    });
    sections.push(`\n--- SON 10 HAFTALIK PLAN ---\n${planLines.join("\n")}`);
  }

  const lines = await db.select().from(productionLines);
  const latestCapacity = await db.select().from(capacityMetrics)
    .orderBy(desc(capacityMetrics.calculatedAt));

  if (latestCapacity.length > 0) {
    const lineMap = new Map(lines.map(l => [l.id, l.name]));
    const seen = new Set<number>();
    const capLines: string[] = [];
    for (const c of latestCapacity) {
      if (c.lineId && !seen.has(c.lineId)) {
        seen.add(c.lineId);
        const lineName = lineMap.get(c.lineId) || `Hat ${c.lineId}`;
        capLines.push(`  - ${lineName}: kapasite %${c.utilizationPct || 0} | teorik maks: ${c.theoreticalMax} | gercek: ${c.actualOutput} | donem: ${c.periodValue}`);
      }
    }
    if (capLines.length > 0) {
      sections.push(`\n--- KAPASITE METRIKLERI ---\n${capLines.join("\n")}`);
    }
  }

  const riskyPlans = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.riskFlag, true))
    .orderBy(desc(weeklyPlans.completedAt));

  if (riskyPlans.length > 0) {
    const riskLines = riskyPlans.map(p => {
      const rate = p.realizationRate ? `gerceklesme: %${Math.round(parseFloat(p.realizationRate) * 100)}` : "";
      const reason = p.deviationReason || "belirtilmemis";
      return `  - ${p.weekLabel} | hat ${p.lineId} | plan: ${p.plannedQty} gercek: ${p.actualQty || "-"} | ${rate} | sapma: ${reason}`;
    });
    sections.push(`\n--- RISKLI PLANLAR (risk_flag=true) ---\n${riskLines.join("\n")}`);
  }

  const completedPlans = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.status, "completed"));

  if (completedPlans.length > 0) {
    const rates = completedPlans
      .filter(p => p.realizationRate)
      .map(p => parseFloat(p.realizationRate!));
    const avgRate = rates.length > 0
      ? (rates.reduce((a, b) => a + b, 0) / rates.length)
      : 0;

    const byMonth = new Map<number, number[]>();
    for (const p of completedPlans) {
      if (p.monthNumber && p.realizationRate) {
        if (!byMonth.has(p.monthNumber)) byMonth.set(p.monthNumber, []);
        byMonth.get(p.monthNumber)!.push(parseFloat(p.realizationRate));
      }
    }
    const seasonalLines: string[] = [];
    const monthNames = ["", "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran", "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"];
    for (const [month, mRates] of Array.from(byMonth.entries()).sort((a, b) => a[0] - b[0])) {
      const avg = mRates.reduce((a, b) => a + b, 0) / mRates.length;
      seasonalLines.push(`  - ${monthNames[month]}: ortalama gerceklesme %${Math.round(avg * 100)} (${mRates.length} plan)`);
    }

    sections.push(`\n--- ORTALAMALAR ---
  Genel gerceklesme orani ortalamasi: %${Math.round(avgRate * 100)} (${rates.length} tamamlanmis plan)
  Tamamlanan plan sayisi: ${completedPlans.length}`);

    if (seasonalLines.length > 0) {
      sections.push(`\n--- SEZONALITE (ay bazli gerceklesme ortalamasi) ---\n${seasonalLines.join("\n")}`);
    }
  }

  return sections.join("\n");
}

// Normal mode tools — legacy HTTP-based
const NORMAL_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_dashboard_summary",
    description: "Toplam üretim, hat bilgileri, aylık veriler, kapasite metrikleri",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "simulate_capacity",
    description: "What-if kapasite simülasyonu. Parametre değiştir, etkiyi gör",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "number", description: "Üretim hattı ID" },
        worker_count: { type: "number", description: "Çalışan sayısı" },
        unit_time_min: { type: "number", description: "Birim üretim süresi (dk)" },
        daily_hours: { type: "number", description: "Günlük çalışma saati" },
      },
      required: ["line_id"],
    },
  },
  {
    name: "analyze_bottleneck",
    description: "Hat bazlı darboğaz analizi. Plan vs gerçek sapma, kritik haftalar, trend",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "number", description: "Üretim hattı ID" },
      },
      required: ["line_id"],
    },
  },
  {
    name: "analyze_workforce_risk",
    description: "Personel bağımlılık riski. Tek kişiye bağlı yetkiler, kritik çalışanlar",
    input_schema: {
      type: "object" as const,
      properties: {
        facility_id: { type: "number", description: "Tesis ID" },
      },
      required: ["facility_id"],
    },
  },
  {
    name: "get_trust_score",
    description: "Çalışan güvenilirlik skoru",
    input_schema: {
      type: "object" as const,
      properties: {
        worker_id: { type: "number", description: "Çalışan ID" },
      },
      required: ["worker_id"],
    },
  },
  {
    name: "forecast_weekly",
    description: "Haftalık üretim tahmini. Plan gir, motor tahmin yap",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "number", description: "Üretim hattı ID" },
        planned_qty: { type: "number", description: "Planlanan miktar" },
      },
      required: ["line_id", "planned_qty"],
    },
  },
  {
    name: "get_workers",
    description: "Çalışan listesi, departmanlar, yetkiler",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_schedules",
    description: "Haftalık plan vs gerçek çizelgeler",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "number", description: "Üretim hattı ID" },
      },
      required: ["line_id"],
    },
  },
];

function getBaseUrl(req: Request): string {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}`;
}

async function callNormalTool(toolName: string, input: Record<string, any>, baseUrl: string): Promise<any> {
  let url: string;
  let method = "GET";
  let body: string | undefined;

  switch (toolName) {
    case "get_dashboard_summary":
      url = `${baseUrl}/api/v1/dashboard/summary`;
      break;
    case "simulate_capacity":
      url = `${baseUrl}/api/v1/simulate/capacity`;
      method = "POST";
      body = JSON.stringify(input);
      break;
    case "analyze_bottleneck":
      url = `${baseUrl}/api/v1/analyze/bottleneck/${input.line_id}`;
      break;
    case "analyze_workforce_risk":
      url = `${baseUrl}/api/v1/analyze/workforce-risk/${input.facility_id}`;
      break;
    case "get_trust_score":
      url = `${baseUrl}/api/v1/score/trust/${input.worker_id}`;
      break;
    case "forecast_weekly":
      url = `${baseUrl}/api/v1/forecast/weekly`;
      method = "POST";
      body = JSON.stringify(input);
      break;
    case "get_workers":
      url = `${baseUrl}/api/v1/workers`;
      break;
    case "get_schedules":
      url = `${baseUrl}/api/v1/schedules?line_id=${input.line_id}`;
      break;
    default:
      return { error: `Unknown tool: ${toolName}` };
  }

  const resp = await fetch(url, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : {},
    body,
  });
  return resp.json();
}

// ══════════════════════════════════════════════════════════════════════
// CEO MODE — Ontology-powered tools (direct service calls, no HTTP)
// ══════════════════════════════════════════════════════════════════════

const CEO_SYSTEM_PROMPT = `Sen Çukurova Isı Sistemleri'nin CEO Yapay Zeka Danışmanısın. Griseus Ontoloji Motoru'na bağlısın.

ÖNEMLI: Sana verilen tool'ları KULLAN. Cevap vermeden önce ilgili veriyi tool ile çek. Tahmini veya genel cevap verme.

TEMEL KURALLAR:
1. Her zaman tool ile GERÇEK VERİ çek, sonra cevap ver. Tahmin yapma.
2. Türkçe konuş, teknik terimleri de Türkçe kullan.
3. Somut rakamlar ver — ürün adı, stok miktarı, risk skoru, bağlı sermaye.
4. Aksiyon öner — "üretimi durdurun", "stoku eritin", "kapasiteyi kaydırın" gibi somut tavsiyeler.
5. Mevsimselliği hesaba kat — HVAC için Ekim-Ocak yüksek sezon, Nisan-Haziran düşük sezon.
6. Sorulmadıkça genel bilgi verme, her cevabı Çukurova'ya özel tut.

ŞİRKET PROFİLİ:
- 30+ yıllık HVAC üreticisi, ~34.000 adet/yıl, 40+ SKU
- 2 üretim hattı (Gazlı + Elektrikli), yeni yarı mamül tesisi kiralandı
- Ürün kodları: ELT (Elektrikli), CC (Combi), BH (Banyo), SSP (Panel), CPH (Pilot), SSE (Endüstriyel), MELT (Mini)

TOOL KULLANIM KURALLARI:
- "stok durumu", "risk", "hangi ürünler" → query_stock_status kullan
- "what-if", "durdursak", "olur", "simülasyon" → run_what_if_simulation kullan
- "tahmin", "forecast", "önümüzdeki aylar" → query_seasonal_forecast kullan
- "fazla stok", "sermaye", "overstock" → query_overstock_report kullan
- "üretim planı", "ne üretmeliyiz" → compute_production_plan kullan
- "kapasite", "hat", "verimlilik" → query_capacity_utilization kullan
- "depoda ne var", "üretimde ne var", "anlık stok", "canlı stok" → get_live_stock_levels kullan
- "hareket geçmişi", "son hareketler", "kim ne yaptı", "stok log" → get_stock_movement_history kullan
- "sipariş gelse", "karşılayabilir miyiz", "yeter mi", "sipariş simülasyonu" → simulate_order_fulfillment kullan
- "uyarılar", "kritik stok", "stok alarmı", "eksik ne var" → check_stock_alerts kullan
- "transfer önerisi", "depoya transfer", "neyi transfer etmeliyiz" → suggest_stock_transfers kullan
- "kaç adet üretebiliriz", "üretim kapasitesi", "darboğaz" → get_production_capacity kullan
- "100 adet üretebilir miyiz", "sipariş karşılama", "yeter mi" (BOM bazlı) → simulate_production kullan
- "reçete", "BOM", "ürün ağacı", "bileşenler" → get_bom_tree kullan
- "bileşen stoku", "parça stoku", "seramik taş kaç var" → get_component_stock kullan
- Birden fazla tool çağırabilirsin — önce veri çek, sonra analiz et.
- Canlı stok verisi için MUTLAKA get_live_stock_levels veya ilgili stok tool'unu kullan — tahmini değer verme.
- BOM/reçete bazlı sorularda MUTLAKA get_production_capacity veya simulate_production kullan.

FORMAT:
- Başlıklar için ## kullan, önemli sayıları **kalın** yaz
- RAG durumlarını emoji ile göster: 🔴 kırmızı, 🟡 sarı, 🟢 yeşil, 🔵 fazla stok
- Her cevabın sonunda 1 somut öneri veya soru sor`;

const CEO_TOOLS: Anthropic.Tool[] = [
  {
    name: "query_stock_status",
    description: "Ürün stok durumunu sorgula. RAG status, risk skoru, days_of_supply, ABC sınıfı, stok miktarı. product_code verilmezse tüm ürünleri getirir.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: {
          type: "string",
          description: "Ürün kodu (ör: 'SSP 40/60', 'ELT.7-11', 'MELT.7-11'). Boş bırakılırsa tüm ürünler döner.",
        },
      },
      required: [],
    },
  },
  {
    name: "run_what_if_simulation",
    description: "What-if simülasyonu çalıştır. Üretim durdurma, sezonsal hazırlık, fiyat artışı etkisi, kapasite kaydırma senaryoları.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["production_stop", "seasonal_prep", "price_increase", "capacity_shift"],
          description: "Simülasyon tipi",
        },
        product_code: {
          type: "string",
          description: "Ürün kodu (production_stop için gerekli, ör: 'SSP 40/60')",
        },
        months: {
          type: "number",
          description: "Kaç ay durdurulacak (production_stop için, varsayılan 2)",
        },
        target_month: {
          type: "number",
          description: "Hedef ay numarası 1-12 (seasonal_prep için, ör: 10=Ekim)",
        },
        material: {
          type: "string",
          description: "Hammadde adı (price_increase için, ör: 'çelik', 'bakır')",
        },
        percentage: {
          type: "number",
          description: "Fiyat artış yüzdesi (price_increase için, ör: 20)",
        },
        from_line: {
          type: "string",
          description: "Kaynak üretim hattı (capacity_shift için, ör: 'gazlı')",
        },
        to_line: {
          type: "string",
          description: "Hedef üretim hattı (capacity_shift için, ör: 'elektrikli')",
        },
        worker_count: {
          type: "number",
          description: "Kaydırılacak çalışan sayısı (capacity_shift için)",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "query_seasonal_forecast",
    description: "Mevsimsel talep tahmini. Holt-Winters modeliyle önümüzdeki aylar için ürün bazlı talep tahmini ve mevsimsel faktörler.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: {
          type: "string",
          description: "Belirli ürün kodu (ör: 'ELT.7-11'). Boş bırakılırsa tüm ürünler.",
        },
        months_ahead: {
          type: "number",
          description: "Kaç ay ilerisi tahmin edilecek (varsayılan 3, max 6)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_overstock_report",
    description: "Fazla stok raporu. Sermaye maruziyeti, fazla stok miktarları, ürün bazlı bağlı sermaye analizi.",
    input_schema: {
      type: "object" as const,
      properties: {
        min_excess_value: {
          type: "number",
          description: "Minimum fazla stok değeri filtresi (TRY). Altındakiler filtrelenir.",
        },
      },
      required: [],
    },
  },
  {
    name: "compute_production_plan",
    description: "Hedef ay için optimal üretim planı hesapla. Mevcut stok, emniyet stoğu ve mevsimsel talebi dikkate alır.",
    input_schema: {
      type: "object" as const,
      properties: {
        target_month: {
          type: "number",
          description: "Hedef ay numarası (1=Ocak, 12=Aralık)",
        },
        budget_limit: {
          type: "number",
          description: "Üretim bütçe limiti (TRY). Belirtilmezse limitsiz.",
        },
      },
      required: ["target_month"],
    },
  },
  {
    name: "query_capacity_utilization",
    description: "Üretim hattı kapasite ve verimlilik bilgisi. Çalışan sayısı, günlük kapasite, kullanım oranı.",
    input_schema: {
      type: "object" as const,
      properties: {
        production_line: {
          type: "string",
          enum: ["gazli", "elektrikli"],
          description: "Belirli hat (boş bırakılırsa tüm hatlar)",
        },
      },
      required: [],
    },
  },
  // ── Canlı Stok Tablosu Tool'ları ──
  {
    name: "get_live_stock_levels",
    description: "Canlı stok durumu. stock_levels tablosundan tüm ürünlerin üretimde (inProduction), depoda (inWarehouse) ve satılan (totalSold) miktarlarını getirir. Belirli ürün kodu verilirse sadece o ürünü döner.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: {
          type: "string",
          description: "Ürün kodu veya adı (ör: 'BH55', 'ELT'). Boş bırakılırsa tüm ürünler döner.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_stock_movement_history",
    description: "Stok hareket geçmişi. stock_movements tablosundan son hareketleri getirir: üretim, depoya transfer, satış, geri alma vb. Filtre: ürün kodu, hareket tipi, limit.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: {
          type: "string",
          description: "Ürün kodu ile filtrele (ör: 'BH55'). Boş = tüm ürünler.",
        },
        movement_type: {
          type: "string",
          enum: ["produced", "to_warehouse", "to_sales", "raw_material_in", "undo", "inventory_count"],
          description: "Hareket tipi filtresi. Boş = tüm tipler.",
        },
        limit: {
          type: "number",
          description: "Kaç kayıt getirilecek (varsayılan 30, max 100)",
        },
      },
      required: [],
    },
  },
  {
    name: "simulate_order_fulfillment",
    description: "Sipariş simülasyonu. Belirli bir ürün için verilen miktarda sipariş geldiğinde depodaki stoktan karşılanıp karşılanamayacağını hesaplar. Eksik varsa üretimdeki stokla birlikte durumu analiz eder.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: {
          type: "string",
          description: "Ürün kodu (ör: 'BH55', 'SSP 40/60')",
        },
        quantity: {
          type: "number",
          description: "Sipariş miktarı (adet)",
        },
      },
      required: ["product_code", "quantity"],
    },
  },
  {
    name: "check_stock_alerts",
    description: "Stok uyarıları. Depoda 0 olan, üretimde bekleyip depoya transfer edilmemiş, veya kritik düşük stoklu ürünleri tespit eder.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "suggest_stock_transfers",
    description: "Transfer önerileri. Üretimde stok varken depoda stok olmayan veya düşük olan ürünleri tespit edip depoya transfer önerileri sunar.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  // ── BOM (Ürün Ağacı / Reçete) Tool'ları ──
  {
    name: "get_production_capacity",
    description: "BOM bazlı üretim kapasitesi hesapla. Mevcut bileşen stokları ile kaç adet ürün üretilebileceğini, darboğazları ve yarı mamül montaj ihtiyaçlarını hesaplar.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: {
          type: "string",
          description: "Ürün kodu (ör: 'ELT.7-11'). Varsayılan: ELT.7-11",
        },
      },
      required: [],
    },
  },
  {
    name: "simulate_production",
    description: "BOM bazlı üretim simülasyonu. Belirli miktarda ürün üretmek için gereken malzemeleri, eksikleri ve yeterliliği hesaplar.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: {
          type: "string",
          description: "Ürün kodu (ör: 'ELT.7-11')",
        },
        quantity: {
          type: "number",
          description: "Kaç adet üretilmek isteniyor",
        },
      },
      required: ["quantity"],
    },
  },
  {
    name: "get_bom_tree",
    description: "Ürün ağacını (reçete/BOM) getir. Tüm bileşenleri, miktarlarını ve tier yapısını döner. Tier 1=hammadde, Tier 2=yarı mamül, Tier 3=yarı mamülün alt bileşeni.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: {
          type: "string",
          description: "Ürün kodu (ör: 'ELT.7-11')",
        },
      },
      required: [],
    },
  },
  {
    name: "get_component_stock",
    description: "Tek bileşenin veya tüm bileşenlerin stok durumunu getir. Bileşen kodu verilmezse tüm bileşen stoklarını döner.",
    input_schema: {
      type: "object" as const,
      properties: {
        component_code: {
          type: "string",
          description: "Bileşen kodu (ör: '27.125', '27.031'). Boş bırakılırsa tüm bileşenler döner.",
        },
      },
      required: [],
    },
  },
];

// ── CEO Tool Execution — Direct service calls (no HTTP) ──

async function callCeoTool(toolName: string, input: Record<string, any>): Promise<any> {
  switch (toolName) {

    case "query_stock_status": {
      const allProducts = await computeEngine.getStockStatus();
      if (input.product_code) {
        const code = input.product_code.toLowerCase();
        const filtered = allProducts.filter((p: any) =>
          (p.sku || "").toLowerCase().includes(code) ||
          (p.title || "").toLowerCase().includes(code)
        );
        if (filtered.length === 0) {
          return { error: `Ürün bulunamadı: "${input.product_code}"`, available_products: allProducts.map((p: any) => p.sku) };
        }
        return {
          products: filtered.map((p: any) => formatStockProduct(p)),
          count: filtered.length,
        };
      }
      return {
        products: allProducts.map((p: any) => formatStockProduct(p)),
        count: allProducts.length,
        summary: {
          rag_distribution: allProducts.reduce((acc: any, p: any) => {
            const rag = p.computed?.rag_status || "unknown";
            acc[rag] = (acc[rag] || 0) + 1;
            return acc;
          }, {}),
        },
      };
    }

    case "run_what_if_simulation": {
      const simType = input.type;
      switch (simType) {
        case "production_stop":
          if (!input.product_code) return { error: "product_code gerekli" };
          return { simulation: await whatIfEngine.simulateProductionStop(input.product_code, input.months || 2) };
        case "seasonal_prep":
          return { simulation: await whatIfEngine.simulateSeasonalPrep(input.target_month || 10) };
        case "price_increase":
          if (!input.material) return { error: "material gerekli (ör: 'çelik', 'bakır')" };
          return { simulation: await whatIfEngine.simulatePriceIncrease(input.material, input.percentage || 10) };
        case "capacity_shift":
          if (!input.from_line || !input.to_line || !input.worker_count)
            return { error: "from_line, to_line ve worker_count gerekli" };
          return { simulation: await whatIfEngine.simulateCapacityShift(input.from_line, input.to_line, input.worker_count) };
        default:
          return { error: `Bilinmeyen simülasyon tipi: ${simType}` };
      }
    }

    case "query_seasonal_forecast": {
      const forecasts = await computeEngine.getSeasonalForecast();
      if (input.product_code) {
        const code = input.product_code.toLowerCase();
        const filtered = forecasts.filter((f: any) =>
          (f.sku || "").toLowerCase().includes(code) ||
          (f.title || "").toLowerCase().includes(code)
        );
        return { forecasts: filtered, count: filtered.length };
      }
      return {
        forecasts: forecasts.map((f: any) => ({
          sku: f.sku,
          title: f.title,
          forecast: f.forecast,
          total_forecast: f.total_forecast,
          avg_monthly_demand: f.avg_monthly_demand,
          seasonal_factors: f.seasonal_factors,
        })),
        count: forecasts.length,
        seasonality_note: "HVAC: Ekim-Ocak yüksek sezon, Nisan-Haziran düşük sezon",
      };
    }

    case "query_overstock_report": {
      const capital = await computeEngine.getCapitalExposure();
      const overstock = await computeEngine.getOverstockReport();

      let items = overstock;
      if (input.min_excess_value && input.min_excess_value > 0) {
        items = overstock.filter((p: any) => (p.computed?.excess_inventory_value || 0) >= input.min_excess_value);
      }

      return {
        summary: {
          total_capital_exposure: capital.total_capital_exposure,
          total_stock_value: capital.total_stock_value,
          exposure_percent: capital.exposure_percent,
        },
        products: items.map((p: any) => ({
          sku: p.sku,
          title: p.title,
          excess_units: p.computed?.excess_inventory || 0,
          excess_value: p.computed?.excess_inventory_value || 0,
          current_stock: p.computed?.current_stock || 0,
          rag_status: p.computed?.rag_status,
          severity: p.severity,
        })),
        count: items.length,
      };
    }

    case "compute_production_plan": {
      const targetMonth = input.target_month;
      const budgetLimit = input.budget_limit;
      const allProducts = await computeEngine.getStockStatus();
      const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

      const plan: any[] = [];
      let totalCost = 0;
      let totalUnits = 0;

      for (const p of allProducts) {
        const props = (p.properties || {}) as any;
        const computed = (p.computed || {}) as any;
        const monthlyProd: number[] = props.monthly_production || [];
        const monthIdx = targetMonth - 1;
        const demandInTarget = monthlyProd[monthIdx] || computed.avg_monthly_demand || 0;
        const currentStock = computed.current_stock || 0;
        const safetyStock = computed.safety_stock || 0;
        const unitCost = props.unit_cost || 150;

        const required = Math.max(0, demandInTarget + safetyStock - currentStock);
        const cost = required * unitCost;

        if (budgetLimit && (totalCost + cost) > budgetLimit && required > 0) {
          const affordableUnits = Math.floor((budgetLimit - totalCost) / unitCost);
          if (affordableUnits > 0) {
            plan.push({
              sku: p.sku, title: p.title, required, capped_to: affordableUnits,
              unit_cost: unitCost, cost: affordableUnits * unitCost,
              reason: "Bütçe limiti aşıldı — kısmi üretim",
              rag_status: computed.rag_status,
            });
            totalCost += affordableUnits * unitCost;
            totalUnits += affordableUnits;
          }
          continue;
        }

        if (required > 0) {
          plan.push({
            sku: p.sku, title: p.title, required, unit_cost: unitCost, cost,
            current_stock: currentStock, target_demand: demandInTarget, safety_stock: safetyStock,
            rag_status: computed.rag_status,
          });
          totalCost += cost;
          totalUnits += required;
        }
      }

      // Sort by RAG urgency: red first, then amber, then green
      const ragOrder: Record<string, number> = { red: 0, amber: 1, green: 2, blue: 3 };
      plan.sort((a, b) => (ragOrder[a.rag_status] ?? 4) - (ragOrder[b.rag_status] ?? 4));

      return {
        target_month: months[targetMonth - 1],
        target_month_number: targetMonth,
        plan,
        total_units: totalUnits,
        total_cost: totalCost,
        budget_limit: budgetLimit || "limitsiz",
        products_requiring_production: plan.length,
        season: targetMonth >= 10 || targetMonth <= 1 ? "YÜKSEK SEZON" : targetMonth >= 4 && targetMonth <= 7 ? "DÜŞÜK SEZON" : "GEÇİŞ DÖNEMİ",
      };
    }

    case "query_capacity_utilization": {
      const prodLines = await ontologyService.getObjectsByType("production_line");
      let filtered = prodLines;
      if (input.production_line) {
        filtered = prodLines.filter(pl =>
          pl.title.toLowerCase().includes(input.production_line.toLowerCase())
        );
      }

      // Also get weekly plan capacity data
      const lines = await db.select().from(productionLines);
      const latestCapacity = await db.select().from(capacityMetrics)
        .orderBy(desc(capacityMetrics.calculatedAt));

      const lineCapacityMap = new Map<string, any>();
      const lineMap = new Map(lines.map(l => [l.id, l.name]));
      const seen = new Set<number>();
      for (const c of latestCapacity) {
        if (c.lineId && !seen.has(c.lineId)) {
          seen.add(c.lineId);
          lineCapacityMap.set(lineMap.get(c.lineId) || `Hat ${c.lineId}`, {
            utilization_pct: c.utilizationPct,
            theoretical_max: c.theoreticalMax,
            actual_output: c.actualOutput,
            period: c.periodValue,
          });
        }
      }

      return {
        production_lines: filtered.map(pl => {
          const props = pl.properties as any;
          const weeklyData = lineCapacityMap.get(pl.title);
          return {
            name: pl.title,
            worker_count: props.worker_count || 0,
            daily_capacity: props.daily_capacity || 0,
            monthly_capacity: (props.daily_capacity || 0) * 22,
            yearly_capacity: (props.daily_capacity || 0) * 250,
            utilization_rate: Math.round((props.utilization_rate || 0) * 100),
            weekly_plan_data: weeklyData || null,
          };
        }),
        total_daily_capacity: filtered.reduce((sum, pl) => sum + ((pl.properties as any).daily_capacity || 0), 0),
        total_workers: filtered.reduce((sum, pl) => sum + ((pl.properties as any).worker_count || 0), 0),
      };
    }

    // ── Canlı Stok Tablosu Tool Implementasyonları ──

    case "get_live_stock_levels": {
      const rows = await db
        .select({
          productId: stockLevels.productId,
          productSku: products.sku,
          productName: products.name,
          productCategory: products.category,
          inProduction: stockLevels.inProduction,
          inWarehouse: stockLevels.inWarehouse,
          totalSold: stockLevels.totalSold,
          updatedAt: stockLevels.updatedAt,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id))
        .orderBy(products.sku);

      let filtered = rows;
      if (input.product_code) {
        const code = input.product_code.toLowerCase();
        filtered = rows.filter(r =>
          (r.productSku || "").toLowerCase().includes(code) ||
          (r.productName || "").toLowerCase().includes(code)
        );
      }

      const totalInProduction = filtered.reduce((s, r) => s + r.inProduction, 0);
      const totalInWarehouse = filtered.reduce((s, r) => s + r.inWarehouse, 0);
      const totalSold = filtered.reduce((s, r) => s + r.totalSold, 0);

      return {
        products: filtered.map(r => ({
          sku: r.productSku,
          name: r.productName,
          category: r.productCategory,
          in_production: r.inProduction,
          in_warehouse: r.inWarehouse,
          total_sold: r.totalSold,
          total_available: r.inProduction + r.inWarehouse,
          updated_at: r.updatedAt,
        })),
        count: filtered.length,
        summary: {
          total_in_production: totalInProduction,
          total_in_warehouse: totalInWarehouse,
          total_sold: totalSold,
          total_available: totalInProduction + totalInWarehouse,
        },
      };
    }

    case "get_stock_movement_history": {
      const limit = Math.min(input.limit || 30, 100);

      let productId: number | null = null;
      if (input.product_code) {
        const code = input.product_code.toLowerCase();
        const allProducts = await db.select().from(products);
        const match = allProducts.find(p =>
          (p.sku || "").toLowerCase().includes(code) ||
          (p.name || "").toLowerCase().includes(code)
        );
        if (!match) return { error: `Ürün bulunamadı: "${input.product_code}"`, available_products: allProducts.map(p => p.sku) };
        productId = match.id;
      }

      const conditions = [];
      if (productId) conditions.push(eq(stockMovementsV2.productId, productId));
      if (input.movement_type) conditions.push(eq(stockMovementsV2.movementType, input.movement_type));

      let query = db
        .select({
          id: stockMovementsV2.id,
          productSku: products.sku,
          productName: products.name,
          movementType: stockMovementsV2.movementType,
          quantity: stockMovementsV2.quantity,
          previousState: stockMovementsV2.previousState,
          note: stockMovementsV2.note,
          createdBy: stockMovementsV2.createdBy,
          createdAt: stockMovementsV2.createdAt,
        })
        .from(stockMovementsV2)
        .innerJoin(products, eq(stockMovementsV2.productId, products.id))
        .orderBy(desc(stockMovementsV2.createdAt))
        .limit(limit);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const rows = await query;

      const typeLabels: Record<string, string> = {
        produced: "Üretildi",
        to_warehouse: "Depoya Transfer",
        to_sales: "Satışa Çıktı",
        raw_material_in: "Hammadde Girişi",
        undo: "Geri Alma",
        inventory_count: "Sayım",
      };

      return {
        movements: rows.map(r => ({
          id: r.id,
          sku: r.productSku,
          product_name: r.productName,
          type: r.movementType,
          type_label: typeLabels[r.movementType] || r.movementType,
          quantity: r.quantity,
          note: r.note,
          created_by: r.createdBy,
          created_at: r.createdAt,
        })),
        count: rows.length,
      };
    }

    case "simulate_order_fulfillment": {
      const code = (input.product_code || "").toLowerCase();
      const orderQty = input.quantity;

      if (!code || !orderQty) return { error: "product_code ve quantity gerekli" };

      const rows = await db
        .select({
          productId: stockLevels.productId,
          productSku: products.sku,
          productName: products.name,
          inProduction: stockLevels.inProduction,
          inWarehouse: stockLevels.inWarehouse,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      const match = rows.find(r =>
        (r.productSku || "").toLowerCase().includes(code) ||
        (r.productName || "").toLowerCase().includes(code)
      );

      if (!match) {
        return { error: `Ürün bulunamadı: "${input.product_code}"`, available_products: rows.map(r => r.productSku) };
      }

      const canFulfillFromWarehouse = match.inWarehouse >= orderQty;
      const warehouseDeficit = Math.max(0, orderQty - match.inWarehouse);
      const canFulfillWithProduction = (match.inWarehouse + match.inProduction) >= orderQty;
      const totalDeficit = Math.max(0, orderQty - match.inWarehouse - match.inProduction);

      return {
        product: { sku: match.productSku, name: match.productName },
        order_quantity: orderQty,
        warehouse_stock: match.inWarehouse,
        production_stock: match.inProduction,
        total_available: match.inWarehouse + match.inProduction,
        can_fulfill_from_warehouse: canFulfillFromWarehouse,
        can_fulfill_with_production_transfer: canFulfillWithProduction,
        warehouse_deficit: warehouseDeficit,
        total_deficit: totalDeficit,
        recommendation: canFulfillFromWarehouse
          ? `✅ Sipariş karşılanabilir. Depoda ${match.inWarehouse} adet mevcut, ${orderQty} adet sipariş karşılanır.`
          : canFulfillWithProduction
            ? `⚠️ Depo yetersiz (${match.inWarehouse} adet). Üretimden ${warehouseDeficit} adet depoya transfer edilirse sipariş karşılanabilir.`
            : `❌ Karşılanamaz. Toplam mevcut: ${match.inWarehouse + match.inProduction} adet, eksik: ${totalDeficit} adet. Yeni üretim gerekli.`,
      };
    }

    case "check_stock_alerts": {
      const rows = await db
        .select({
          productId: stockLevels.productId,
          productSku: products.sku,
          productName: products.name,
          inProduction: stockLevels.inProduction,
          inWarehouse: stockLevels.inWarehouse,
          totalSold: stockLevels.totalSold,
          updatedAt: stockLevels.updatedAt,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      const alerts: any[] = [];

      for (const r of rows) {
        // Depoda 0 olan ürünler
        if (r.inWarehouse === 0 && r.inProduction === 0) {
          alerts.push({
            sku: r.productSku,
            name: r.productName,
            alert_type: "STOK_YOK",
            severity: "critical",
            message: `🔴 ${r.productSku} — Hem depoda hem üretimde stok yok! Acil üretim gerekli.`,
            in_production: r.inProduction,
            in_warehouse: r.inWarehouse,
          });
        }
        // Depoda 0 ama üretimde var — transfer gerekli
        else if (r.inWarehouse === 0 && r.inProduction > 0) {
          alerts.push({
            sku: r.productSku,
            name: r.productName,
            alert_type: "TRANSFER_BEKLIYOR",
            severity: "high",
            message: `🟡 ${r.productSku} — Depoda stok yok ama üretimde ${r.inProduction} adet bekliyor. Depoya transfer edilmeli.`,
            in_production: r.inProduction,
            in_warehouse: r.inWarehouse,
          });
        }
        // Depoda çok düşük stok (5'in altı)
        else if (r.inWarehouse > 0 && r.inWarehouse <= 5) {
          alerts.push({
            sku: r.productSku,
            name: r.productName,
            alert_type: "DUSUK_STOK",
            severity: "medium",
            message: `🟠 ${r.productSku} — Depoda sadece ${r.inWarehouse} adet kaldı. Stok takviyesi önerilir.`,
            in_production: r.inProduction,
            in_warehouse: r.inWarehouse,
          });
        }
      }

      // Sort: critical > high > medium
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
      alerts.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

      return {
        alerts,
        alert_count: alerts.length,
        summary: {
          critical: alerts.filter(a => a.severity === "critical").length,
          high: alerts.filter(a => a.severity === "high").length,
          medium: alerts.filter(a => a.severity === "medium").length,
        },
        total_products_checked: rows.length,
      };
    }

    case "suggest_stock_transfers": {
      const rows = await db
        .select({
          productId: stockLevels.productId,
          productSku: products.sku,
          productName: products.name,
          inProduction: stockLevels.inProduction,
          inWarehouse: stockLevels.inWarehouse,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      const suggestions: any[] = [];

      for (const r of rows) {
        if (r.inProduction > 0 && r.inWarehouse === 0) {
          // Depoda hiç yok, tamamını transfer et
          suggestions.push({
            sku: r.productSku,
            name: r.productName,
            priority: "high",
            in_production: r.inProduction,
            in_warehouse: r.inWarehouse,
            transfer_quantity: r.inProduction,
            reason: `Depoda stok yok. Üretimdeki ${r.inProduction} adedin tamamı depoya transfer edilmeli.`,
          });
        } else if (r.inProduction > 0 && r.inWarehouse > 0 && r.inWarehouse <= 5) {
          // Depoda az var, üretimden takviye
          const transferQty = Math.min(r.inProduction, 10); // Max 10 veya mevcut üretim stoku
          suggestions.push({
            sku: r.productSku,
            name: r.productName,
            priority: "medium",
            in_production: r.inProduction,
            in_warehouse: r.inWarehouse,
            transfer_quantity: transferQty,
            reason: `Depoda sadece ${r.inWarehouse} adet var. Üretimden ${transferQty} adet transfer önerilir.`,
          });
        }
      }

      // Sort by priority
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      suggestions.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

      return {
        suggestions,
        suggestion_count: suggestions.length,
        total_transfer_units: suggestions.reduce((s: number, t: any) => s + t.transfer_quantity, 0),
        total_products_checked: rows.length,
      };
    }

    // ── BOM Tools ──

    case "get_production_capacity": {
      const sku = input.sku || "ELT.7-11";
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      const capacity = computeProductionCapacity(items);
      return {
        product: sku,
        maxProducible: capacity.maxProducible,
        bottlenecks: capacity.bottlenecks.slice(0, 10),
        subAssemblyStatus: capacity.subAssemblyStatus,
        total_components: items.length,
      };
    }

    case "simulate_production": {
      const sku = input.sku || "ELT.7-11";
      const quantity = input.quantity || 100;
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      const capacity = computeProductionCapacity(items);
      const canProduce = capacity.maxProducible >= quantity;
      const shortages: any[] = [];
      const materialsNeeded: any[] = [];
      const tier1and2 = items.filter(i => i.tier === 1 || i.tier === 2);
      for (const item of tier1and2) {
        const need = item.requiredQty * quantity;
        let effectiveStock = item.currentStock;
        let mustAssemble: number | undefined;
        if (item.tier === 2) {
          const sub = computeSubAssemblyCapacity(item.code, items);
          effectiveStock = item.currentStock + sub.producible;
          if (item.currentStock < need) mustAssemble = Math.min(need - item.currentStock, sub.producible);
        }
        const remaining = effectiveStock - need;
        materialsNeeded.push({ code: item.code, name: item.name, need, have: effectiveStock, remaining, mustAssemble });
        if (remaining < 0) shortages.push({ code: item.code, name: item.name, need, have: effectiveStock, shortage: Math.abs(remaining) });
      }
      materialsNeeded.sort((a: any, b: any) => a.remaining - b.remaining);
      return {
        product: sku, requestedQuantity: quantity, canProduce,
        maxProducible: capacity.maxProducible, shortages,
        materialsNeeded: materialsNeeded.slice(0, 15),
        subAssemblyStatus: capacity.subAssemblyStatus,
      };
    }

    case "get_bom_tree": {
      const sku = input.sku || "ELT.7-11";
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      const tier1 = items.filter(i => i.tier === 1).map(i => ({
        code: i.code, name: i.name, requiredQty: i.requiredQty, unit: i.unit, stock: i.currentStock,
      }));
      const tier2 = items.filter(i => i.tier === 2).map(sa => ({
        code: sa.code, name: sa.name, requiredQty: sa.requiredQty, unit: sa.unit, stock: sa.currentStock,
        children: items.filter(i => i.parentComponentCode === sa.code).map(c => ({
          code: c.code, name: c.name, requiredQty: c.requiredQty, unit: c.unit, stock: c.currentStock,
        })),
      }));
      return { product: sku, totalComponents: items.length, directMaterials: tier1, subAssemblies: tier2 };
    }

    case "get_component_stock": {
      if (input.component_code) {
        const rows = await db.select().from(componentStock).where(eq(componentStock.componentCode, input.component_code));
        if (rows.length === 0) return { error: `Bileşen bulunamadı: ${input.component_code}` };
        const bom = await db.select().from(bomItems).where(eq(bomItems.componentCode, input.component_code));
        const bomInfo = bom[0];
        return {
          componentCode: rows[0].componentCode,
          currentStock: parseFloat(rows[0].currentStock as string),
          unit: rows[0].unit,
          lastCountedAt: rows[0].lastCountedAt,
          lastCountedBy: rows[0].lastCountedBy,
          componentName: bomInfo?.componentName,
          requiredPerUnit: bomInfo ? parseFloat(bomInfo.requiredQuantity as string) : null,
          tier: bomInfo?.tier,
        };
      }
      // All components
      const allStock = await db.select({
        code: componentStock.componentCode,
        stock: componentStock.currentStock,
        unit: componentStock.unit,
        lastCounted: componentStock.lastCountedAt,
      }).from(componentStock);
      return {
        total: allStock.length,
        components: allStock.map(s => ({
          code: s.code,
          stock: parseFloat(s.stock as string),
          unit: s.unit,
          lastCounted: s.lastCounted,
        })),
      };
    }

    default:
      return { error: `Unknown CEO tool: ${toolName}` };
  }
}

function formatStockProduct(p: any) {
  const c = p.computed || {};
  const props = p.properties || {};
  return {
    sku: p.sku,
    title: p.title,
    rag_status: c.rag_status || "unknown",
    risk_score: c.stock_risk_score || 0,
    current_stock: c.current_stock || 0,
    days_of_supply: c.days_of_supply || 0,
    safety_stock: c.safety_stock || 0,
    reorder_point: c.reorder_point || 0,
    abc_class: c.abc_class || "?",
    excess_inventory: c.excess_inventory || 0,
    excess_inventory_value: c.excess_inventory_value || 0,
    avg_monthly_demand: c.avg_monthly_demand || 0,
    daily_demand: c.daily_demand || 0,
    stock_percent: props.stock_percent || 0,
    order_percent: props.order_percent || 0,
    unit_cost: props.unit_cost || 0,
    risk_breakdown: {
      overstock_risk: c.overstock_risk || 0,
      stockout_risk: c.stockout_risk || 0,
      capital_risk: c.capital_risk || 0,
    },
    next_3_months_forecast: c.next_3_months_forecast || [],
  };
}

// ══════════════════════════════════════════════════════════════════════
// CHAT ENDPOINT
// ══════════════════════════════════════════════════════════════════════

router.post("/agent/chat", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "API key eksik. ANTHROPIC_API_KEY ortam değişkenini yapılandırın." });
    }

    const { message, history, mode } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
      mode?: string;
    };

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message alanı gereklidir." });
    }

    const client = new Anthropic({ apiKey });
    const isCeo = mode === "ceo";

    // Select tools and system prompt based on mode
    const systemPrompt = isCeo
      ? CEO_SYSTEM_PROMPT
      : await buildContextualSystemPrompt();

    const tools = isCeo ? CEO_TOOLS : NORMAL_TOOLS;

    // Build messages from history + new message
    const messages: Anthropic.MessageParam[] = [
      ...(history || []).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    const toolsUsed: string[] = [];
    const baseUrl = isCeo ? "" : getBaseUrl(req);

    // Initial Claude call
    let response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    // Tool-use loop: keep going while Claude wants to call tools (max 10 iterations for safety)
    let iterations = 0;
    while (response.stop_reason === "tool_use" && iterations < 10) {
      iterations++;
      const assistantContent = response.content;
      const toolUseBlocks = assistantContent.filter(
        (b): b is Anthropic.ContentBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        toolsUsed.push(toolBlock.name);
        try {
          const result = isCeo
            ? await callCeoTool(toolBlock.name, toolBlock.input as Record<string, any>)
            : await callNormalTool(toolBlock.name, toolBlock.input as Record<string, any>, baseUrl);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          });
        } catch (err: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: err.message || "Tool execution failed" }),
            is_error: true,
          });
        }
      }

      // Continue conversation with tool results
      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      });
    }

    // Extract final text response
    const textBlock = response.content.find((b) => b.type === "text");
    const responseText = textBlock && "text" in textBlock ? textBlock.text : "Cevap üretilemedi.";

    res.json({
      response: responseText,
      tools_used: toolsUsed,
    });
  } catch (err: any) {
    console.error("[agent/chat] Error:", err.message || err);
    res.status(500).json({ error: err.message || "AI Agent hatası" });
  }
});

export default router;
