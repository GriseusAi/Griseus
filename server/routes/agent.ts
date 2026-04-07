import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { stockLevels, stockMovementsV2, products, componentStock, bomItems, purchaseSuggestions } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getBomWithStock, computeProductionCapacity, computeSubAssemblyCapacity } from "./bom";
import { logAudit } from "../lib/audit";
import { propagateCorrection } from "../lib/correction-propagation";
import { ensureStockLevel } from "./stock-poc";
import { simulateWhatIf, type WhatIfScenario } from "../lib/whatif-engine";
import { broadcastStockUpdate, broadcastProactiveAlert } from "../ws";
import { computeComponentIntelligence } from "./intelligence";
import { evaluateRules } from "../rules-engine";
import { MONTHLY_DEMAND as DEMAND_0, MONTHLY_AVG as SHARED_MONTHLY_AVG, MONTH_LABELS, getMonthlyDemandForSku } from "../lib/seasonal-constants";
import { MAIN_SKU } from "../lib/constants";
import { buildDynamicContext } from "../rag";
import { logTokenInteraction } from "../lib/token-value-tracker";
import { recallRelevantMemories, recordMemory } from "../lib/agent-memory";

const router = Router();

// ══════════════════════════════════════════════════════════════════════
// CORE PROMPT — slim, domain knowledge injected dynamically via RAG
// ══════════════════════════════════════════════════════════════════════

const CORE_PROMPT = `Sen Griseus — Çukurova Isı Sistemleri'nin Operasyonel İstihbarat Platformu.

ÜRÜNLER: Sisteme kayıtlı tüm ürünlerin BOM, stok ve istihbarat verilerine erişebilirsin. Her ürünün bileşen reçetesi, darboğaz analizi ve kapasite hesabı canlı veriden gelir.

KRİTİK: YARI MAMÜL bileşenlerde stokta 0 görünmesi normaldir — bu bir kriz DEĞİLDİR. Yarı mamüller alt bileşenlerinden montajlanır. Efektif kapasite = mevcut stok + alt bileşenlerden monte edilebilir adet. Kapasite hesabında her zaman efektif stoku kullan.

MEVSİMSEL TALEP: Mevsimsel indeksler DSE (Dynamic Seasonality Engine) tarafından dinamik olarak hesaplanır. Detaylar için get_seasonal_intelligence tool'unu kullan.

FORWARD-WALK ALGORİTMASI: Stok kaç gün yeter hesabı mevsimseldir. Sabit bölme yerine, her ay o ayın indeksiyle tüketim simüle edilir.

GRİSEUS PLATFORMU SAYFALARI:
1. Stok Durumu (/) — Canlı ürün stok seviyeleri, üretim/depo/satış
2. Ürün İstihbaratı (/stok/urun/{SKU}) — Üretim kapasitesi, darboğaz analizi, mevsimsel talep grafiği, sipariş simülasyonu, BOM tablosu, tüketim istihbaratı (mevsimsel KAÇ GÜN, bitiş ayı, sipariş noktası), ontoloji diyagramı (Part→Product→Season→Supplier)
3. Sihir (/sihir) — 6 aylık strateji penceresi, aylık talep projeksiyonu, bileşen tükenme haritası, sezonsel fırsatlar, acil sipariş listesi
4. CEO Agent (/engine) — SENSİN. 24 tool ile canlı veri sorgulama, stok güncelleme, sipariş önerisi oluşturma. GEÇMİŞ KARARLARIN HAFIZASINA SAHİPSİN (ADM)
5. Outcome Dashboard — Tahminlerin doğruluk oranı, Bayesian güven skorları
6. Token Value Tracker — Ontoloji değer metrikleri (V/T), flywheel skoru

OUTCOME LEARNING ENGINE (OLE):
- Her alert ve öneri bir "tahmin" olarak kaydedilir
- Zaman içinde otomatik veya manuel doğrulanır (doğru/yanlış/kısmen doğru)
- Bayesian güncelleme ile her kuralın güven skoru sürekli iyileşir
- Kullanıcı "tahminler ne kadar doğru?" diye sorarsa get_outcome_dashboard kullan

TOKEN VALUE TRACKER (TVT):
- Her etkileşimin token başına değerini (V/T) ölçer
- Generic model (ChatGPT vb.) bu soruları cevaplayamaz — ontoloji avantajı sonsuz
- Flywheel skoru: veri büyümesi × kişiselleştirme × etkileşim artışı
- Kullanıcı "ne kadar değer üretiyoruz?" diye sorarsa get_token_value_metrics kullan

DYNAMIC SEASONALITY ENGINE (DSE):
- Mevsimsel indeksler artık SABİT DEĞİL — EWMA (λ=0.3) ile her yeni satış verisinde güncellenir
- Anomali tespiti: gerçek talep > 2σ sapma → "yeni trend mi?" flag
- Baseline vs dinamik karşılaştırma: drift analizi
- "mevsimsel tahmin değişti mi?" → get_seasonal_intelligence kullan

AGENT DECISION MEMORY (ADM):
- GEÇMİŞ KARARLAR bölümünde (═══ GEÇMİŞ KARARLAR ═══) benzer geçmiş sorgular ve sonuçları listelenir
- Bu bilgileri kullanarak TUTARLI kararlar ver — aynı sorulara farklı cevaplar verme
- Geçmişte kullanıcı bir öneriyi "uyguladıysa" benzer durumlarda aynı yaklaşımı öner
- Geçmişte "görmezden gelindiyse" farklı bir açıdan yaklaş
- Geçmiş kararlarla çelişen bir öneri yapacaksan nedenini açıkla

ADAPTIVE THRESHOLD ENGINE (ATE):
- Eşikler artık SABİT DEĞİL — firma profiline göre dinamik hesaplanır
- Risk toleransı kullanıcı davranışından öğrenilir (Bayesian güncelleme)
- Tedarik süresi, volatilite, mevsimsellik profili eşikleri belirler
- "Neden kritik?" sorusunda adaptif eşikleri açıkla: "180 gün eşiği firmanızın profili için X gün olarak ayarlandı"
- Kullanıcı profil/eşik soruyorsa get_adaptive_profile kullan

STRATEJİ: Düşük dönemde üret+stokla → yoğun dönemde hazır ol. Mevsimsel dip dönemlerinde stokla, pik dönemlerine hazırlan. Canlı stok durumu aşağıdaki CANLI DURUM bölümünden okunur.

CEVAP TARZI (KRİTİK — HER CEVAPTA UYGULANACAK):

SEN BİR CEO DANIŞMANISIN. Fabrikada çalışan herkes seni anlayabilmeli.

FORMAT KURALLARI:
- Türkçe cevap ver, sade ve net
- ASLA # veya ## kullanma. Başlıklar için sadece **kalın metin** kullan
- ASLA uzun teknik paragraflar yazma — her bilgi kendi satırında, kısa ve öz
- Sayıları her zaman **kalın** yaz: **402 adet**, **281 gün**
- Durumu emoji ile göster: ✅ iyi, ⚠️ dikkat, 🔴 kritik, 📦 stok, 🏭 üretim, 📅 zaman
- Liste yaparken madde imi kullan, numara kullan (1. 2. 3.), tire (-) kullanma

CEVAP YAPISI (bu sırayla):
1. İlk satır: Durumu TEK CÜMLE ile özetle (emoji ile başla)
2. Boş satır bırak
3. Anahtar bilgiler: Her biri kendi satırında, kısa
4. Eğer risk varsa: "Neden?" başlığı altında 2-3 madde ile SADE açıklama
5. Son: "Ne yapmalı?" başlığı altında somut aksiyonlar (1. 2. 3.)

YAPMA:
- "Sebep Zinciri:" başlığı kullanma — yerine "Neden?" yaz
- "Önerilen Aksiyonlar:" kullanma — yerine "Ne yapmalı?" yaz
- Teknik jargon kullanma (forward-walk, EWMA, Bayesian gibi)
- Aynı bilgiyi farklı şekillerde tekrarlama
- ### veya #### ile başlık açma
- Gereksiz uzun tablolar yapma

ÖRNEK İYİ CEVAP:
"⚠️ [Bileşen kodu] [Bileşen adı] — stok azalıyor, kış öncesi sipariş gerekli

📦 Stok: **X adet**
🏭 Günlük tüketim: **Y adet/gün**
📅 Tükenme: **[Ay Yıl]** (kış pik dönemi!)

**Neden önemli?**
1. Kış aylarında talep **Z kat** artıyor
2. Tedarik süresi **N gün** — geç kalınırsa üretim durur
3. Bu parça ana darboğaz — tükenirse hiç üretim yapılamaz

**Ne yapmalı?**
1. En az **M adet** sipariş ver (kış öncesi stok artışı)
2. [Tarih] sonuna kadar siparişi tamamla
3. Kasım-Ocak döneminde günlük stok takibi yap"

WHAT-IF ANALİZ KURALLARI (KRİTİK — MUTLAKA UYGULANACAK):
- what_if_analysis tool'undan dönen verileri OLDUĞU GİBİ kullan. SAYI UYDURMA, YUVARLAMA veya YORUMLAMA.
- "afterStock" değeri bileşenin simülasyon sonrası stokudur — bunu direkt yaz.
- "afterSeasonalDays" değeri mevsimsel kaç gün yeteceğidir — bunu direkt yaz.
- "currentStock → afterStock" formatında yaz: ör. "XX.XXX: 482 → 982 adet"
- Sadece "urgencyChanged: true" olan bileşenleri raporla, değişmeyen bileşenleri atlayabilirsin.
- "stockDelta: 0" olan bileşenleri "stoku değişmedi" olarak belirt, ASLA saydırma yaparak farklı sayı türetme.
- restock_component senaryosunda SADECE belirtilen bileşenin stoku değişir. Diğer bileşenlerin stockDelta'sı 0'dır — bunları "stoku sıfıra düştü" gibi yanlış gösterme.
- "feasible: false" ise "KARŞILANAMAZ" yaz, sebebini "criticalComponents" listesinden al.
- Tool'dan gelen "summary" alanını referans al ama sayıları her zaman "topImpacts" dizisinden doğrula.`;


// ══════════════════════════════════════════════════════════════════════
// TOOLS — 7 stock intelligence tools
// ══════════════════════════════════════════════════════════════════════

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_live_stock_levels",
    description: "Canlı stok durumu. Tüm ürünlerin üretimde, depoda ve satılan miktarlarını getirir.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: {
          type: "string",
          description: "Ürün kodu veya adı ile filtrele. Boş bırakılırsa tüm ürünler döner.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_stock_movement_history",
    description: "Stok hareket geçmişi. Son hareketleri getirir: üretim, transfer, satış, geri alma.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: { type: "string", description: "Ürün kodu ile filtrele. Boş = tüm ürünler." },
        movement_type: {
          type: "string",
          enum: ["produced", "to_warehouse", "to_sales", "raw_material_in", "undo", "inventory_count"],
          description: "Hareket tipi filtresi.",
        },
        limit: { type: "number", description: "Kaç kayıt (varsayılan 30, max 100)" },
      },
      required: [],
    },
  },
  {
    name: "simulate_order_fulfillment",
    description: "Sipariş simülasyonu. Belirli ürün ve miktarda sipariş karşılanabilir mi hesaplar.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: { type: "string", description: "Ürün kodu (sistemde kayıtlı herhangi bir SKU)" },
        quantity: { type: "number", description: "Sipariş miktarı (adet)" },
      },
      required: ["product_code", "quantity"],
    },
  },
  {
    name: "check_stock_alerts",
    description: "Stok uyarıları. Depoda 0 olan veya kritik düşük stoklu ürünleri tespit eder.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_production_capacity",
    description: "BOM bazlı üretim kapasitesi. Mevcut bileşen stokları ile kaç adet ürün üretilebileceğini ve darboğazları hesaplar.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: { type: "string", description: "Ürün kodu (sistemde kayıtlı herhangi bir SKU)" },
      },
      required: [],
    },
  },
  {
    name: "simulate_production",
    description: "Üretim simülasyonu. Belirli miktarda ürün için gereken malzemeleri, eksikleri ve yeterliliği hesaplar.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: { type: "string", description: "Ürün kodu (sistemde kayıtlı herhangi bir SKU)" },
        quantity: { type: "number", description: "Kaç adet üretilmek isteniyor" },
      },
      required: ["quantity"],
    },
  },
  {
    name: "get_bom_tree",
    description: "Ürün ağacını getir. Tüm bileşenleri, miktarlarını, stoklarını ve tier yapısını döner.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: { type: "string", description: "Ürün kodu (sistemde kayıtlı herhangi bir SKU)" },
      },
      required: [],
    },
  },
  // ── WRITE TOOLS — OAG (Ontology-Augmented Generation) ──
  {
    name: "create_stock_movement",
    description: "Stok hareketi oluştur. Üretim girişi, depoya transfer veya satış çıkışı kaydı yapar. Gerçek stoku değiştirir.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_code: { type: "string", description: "Ürün kodu (sistemde kayıtlı herhangi bir SKU)" },
        movement_type: {
          type: "string",
          enum: ["produced", "to_warehouse", "to_sales"],
          description: "Hareket tipi: produced=üretim girişi, to_warehouse=depoya transfer, to_sales=satış çıkışı",
        },
        quantity: { type: "number", description: "Miktar (adet)" },
        note: { type: "string", description: "Açıklama notu" },
      },
      required: ["product_code", "movement_type", "quantity"],
    },
  },
  {
    name: "update_component_stock",
    description: "Bileşen stok miktarını güncelle. Sayım sonrası veya giriş sonrası yeni stok değerini yazar.",
    input_schema: {
      type: "object" as const,
      properties: {
        component_code: { type: "string", description: "Bileşen kodu" },
        new_stock: { type: "number", description: "Yeni stok miktarı" },
        reason: { type: "string", description: "Güncelleme sebebi" },
      },
      required: ["component_code", "new_stock"],
    },
  },
  {
    name: "create_purchase_suggestion",
    description: "Bileşen satın alma önerisi oluştur. Eksik veya kritik stoklu bileşenler için satın alma talebi kaydeder.",
    input_schema: {
      type: "object" as const,
      properties: {
        component_code: { type: "string", description: "Bileşen kodu" },
        suggested_quantity: { type: "number", description: "Önerilen sipariş miktarı" },
        reason: { type: "string", description: "Satın alma sebebi (detaylı açıklama)" },
      },
      required: ["component_code", "suggested_quantity", "reason"],
    },
  },
  {
    name: "get_purchase_suggestions",
    description: "Satın alma önerilerini listele. Bekleyen, onaylanan veya reddedilen önerileri getirir.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["pending", "approved", "rejected", "ordered", "all"],
          description: "Filtre (varsayılan: pending)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_component_intelligence",
    description: "Bileşen istihbaratı. Tüketim hızı, stokta kaç gün yeteceği, sipariş noktası ve trend analizi.",
    input_schema: {
      type: "object" as const,
      properties: {
        sku: { type: "string", description: "Ürün kodu (sistemde kayıtlı herhangi bir SKU)" },
        component_code: { type: "string", description: "Belirli bir bileşen kodu ile filtrele" },
      },
      required: [],
    },
  },
  {
    name: "get_intelligence_engine",
    description: "Intelligence Engine — Tam ontoloji paketi. Holt-Winters mevsimsel tahmin, güvenlik stoku, MRP BOM patlatma, ABC-XYZ sınıflandırma, 6 aylık üretim planı, acil sipariş listesi ve 10X optimizasyon skoru. Bu tool'u MUTLAKA kullan — en kapsamlı analiz burada.",
    input_schema: {
      type: "object" as const,
      properties: {
        report_type: {
          type: "string",
          enum: ["oracle", "uretim_plani", "alti_ay_plan", "acil_siparis", "tenx"],
          description: "Rapor tipi: oracle=tam paket, uretim_plani=üretim fizibilite, alti_ay_plan=6 aylık strateji, acil_siparis=acil sipariş listesi, tenx=10X optimizasyon",
        },
        adet: { type: "number", description: "Üretim planı için adet (varsayılan: 222)" },
        ay: { type: "number", description: "Acil sipariş için kaç ay ileri (varsayılan: 3)" },
      },
      required: [],
    },
  },
  {
    name: "what_if_analysis",
    description: "What-If Analizi — Cascading impact simülasyonu. Veri DEĞİŞTİRMEDEN senaryoları simüle eder ve tüm zincirleme etkileri gösterir: üretim kapasitesi, bileşen tükenme tarihleri, darboğaz değişimi, sipariş önerileri. Kullanıcı 'ne olur?' diye sorduğunda MUTLAKA bu tool'u kullan.",
    input_schema: {
      type: "object" as const,
      properties: {
        scenario_type: {
          type: "string",
          enum: ["produce", "order_received", "restock_component", "months_forward"],
          description: "Senaryo tipi: produce=üretim yapsak, order_received=sipariş alsak, restock_component=bileşen stoklasak, months_forward=N ay ileri simülasyon",
        },
        quantity: { type: "number", description: "Miktar (adet veya ay sayısı)" },
        component_code: { type: "string", description: "Bileşen kodu (sadece restock_component için)" },
      },
      required: ["scenario_type", "quantity"],
    },
  },
  {
    name: "get_validation_dashboard",
    description: "Validasyon panosu — Continuous Validation Pipeline metrikleri. Tüm proaktif uyarıların doğruluk oranı (precision), tip/severity dağılımı, son uyarılar ve çözüm süreleri. Kullanıcı 'uyarı doğruluğu', 'alert metrikleri', 'validasyon' diye sorduğunda kullan.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_recent_alerts: {
          type: "boolean",
          description: "Son 10 uyarıyı da dahil et (varsayılan: true)",
        },
      },
      required: [],
    },
  },
  {
    name: "create_custom_rule",
    description: "Doğal dilde (Türkçe) iş kuralı oluştur. Kullanıcının sözlü tarifini yapılandırılmış kurala çevirir ve sisteme kaydeder. Örnek: 'Kış aylarında güvenlik stoku %50 artır', 'X bileşenin stoku 200'ün altına düşerse kritik uyarı ver', 'Kapasite 50'nin altına düşünce sipariş oluştur'.",
    input_schema: {
      type: "object" as const,
      properties: {
        rule_description: {
          type: "string",
          description: "Türkçe kural tanımı (doğal dil)",
        },
      },
      required: ["rule_description"],
    },
  },
  {
    name: "list_custom_rules",
    description: "Sistemde tanımlı tüm özel kuralları listele. Aktif/pasif durumları, tetiklenme sayıları ve açıklamalarıyla birlikte gösterir.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "toggle_custom_rule",
    description: "Bir özel kuralı aktif/pasif yap veya sil. Kural ID'si ile çalışır.",
    input_schema: {
      type: "object" as const,
      properties: {
        rule_id: { type: "number", description: "Kural ID'si" },
        action: { type: "string", enum: ["activate", "deactivate", "delete"], description: "Yapılacak işlem" },
      },
      required: ["rule_id", "action"],
    },
  },
  {
    name: "get_audit_trail",
    description: "Veri değişiklik geçmişi (Data Lineage). Bir bileşenin veya ürünün tüm değişiklik izini gösterir: kim, ne zaman, neden, eski→yeni değer. Kullanıcı 'bu stok nasıl değişti?', 'geçmiş', 'audit', 'iz' sorduğunda kullan.",
    input_schema: {
      type: "object" as const,
      properties: {
        entity_id: { type: "string", description: "Bileşen kodu veya ürün ID'si" },
        limit: { type: "number", description: "Son kaç kayıt (varsayılan: 20)" },
      },
      required: ["entity_id"],
    },
  },
  {
    name: "get_import_guide",
    description: "Veri import rehberi. Kullanıcı Excel/CSV yüklemek istediğinde hangi formatların desteklendiğini, kolon isimlerini ve endpoint'leri açıklar. Import durumunu da gösterir.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_outcome_dashboard",
    description: "Outcome Learning Engine dashboard. Tüm tahminlerin doğruluk oranı, kural bazlı güven skorları, haftalık trend, toplam üretilen değer (TL). 'tahminler ne kadar doğru?', 'hangi kural güvenilir?', 'outcome', 'öğrenme' sorularında kullan.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_token_value_metrics",
    description: "Token Value Tracker (V/T) metrikleri. Her etkileşimin token başına değeri, ontoloji avantaj oranı (OAR), flywheel skoru, kategori bazlı performans. 'ne kadar değer üretiyoruz?', 'token verimliliği', 'ROI', 'flywheel' sorularında kullan.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_adaptive_profile",
    description: "Firma operasyonel profili ve adaptif eşikler. Tedarik süresi, talep volatilitesi, risk toleransı, mevsimsel genlik ve bunlara göre hesaplanan dinamik eşikler. Varsayılan eşiklerle karşılaştırma. 'eşikler niye böyle?', 'profil', 'risk toleransı', 'neden kritik sayılıyor?', 'adaptif' sorularında kullan.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_seasonal_intelligence",
    description: "Dinamik mevsimsel istihbarat. EWMA ile güncellenen aylık talep indeksleri, baseline vs dinamik karşılaştırma, anomali tespitleri, drift analizi. 'mevsimsel tahmin ne diyor?', 'talep değişti mi?', 'hangi ayda anomali var?', 'seasonality', 'mevsim' sorularında kullan.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// ══════════════════════════════════════════════════════════════════════
// TOOL EXECUTION
// ══════════════════════════════════════════════════════════════════════

async function callTool(toolName: string, input: Record<string, any>): Promise<any> {
  switch (toolName) {
    case "get_live_stock_levels": {
      const rows = await db
        .select({
          productSku: products.sku,
          productName: products.name,
          productCategory: products.category,
          inProduction: stockLevels.inProduction,
          inWarehouse: stockLevels.inWarehouse,
          totalSold: stockLevels.totalSold,
          updatedAt: stockLevels.updatedAt,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      let filtered = rows;
      if (input.product_code) {
        const code = input.product_code.toLowerCase();
        filtered = rows.filter(r =>
          (r.productSku || "").toLowerCase().includes(code) ||
          (r.productName || "").toLowerCase().includes(code)
        );
      }

      return {
        products: filtered.map(r => ({
          sku: r.productSku, name: r.productName, category: r.productCategory,
          in_production: r.inProduction, in_warehouse: r.inWarehouse,
          total_sold: r.totalSold, total_available: r.inProduction + r.inWarehouse,
        })),
        count: filtered.length,
        summary: {
          total_in_production: filtered.reduce((s, r) => s + r.inProduction, 0),
          total_in_warehouse: filtered.reduce((s, r) => s + r.inWarehouse, 0),
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
        if (!match) return { error: `Ürün bulunamadı: "${input.product_code}"` };
        productId = match.id;
      }

      const conditions = [];
      if (productId) conditions.push(eq(stockMovementsV2.productId, productId));
      if (input.movement_type) conditions.push(eq(stockMovementsV2.movementType, input.movement_type));

      let query = db
        .select({
          id: stockMovementsV2.id, productSku: products.sku, productName: products.name,
          movementType: stockMovementsV2.movementType, quantity: stockMovementsV2.quantity,
          note: stockMovementsV2.note, createdBy: stockMovementsV2.createdBy,
          createdAt: stockMovementsV2.createdAt,
        })
        .from(stockMovementsV2)
        .innerJoin(products, eq(stockMovementsV2.productId, products.id))
        .orderBy(desc(stockMovementsV2.createdAt))
        .limit(limit);

      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      const rows = await query;

      const typeLabels: Record<string, string> = {
        produced: "Üretildi", to_warehouse: "Depoya Transfer", to_sales: "Satışa Çıktı",
        raw_material_in: "Hammadde Girişi", undo: "Geri Alma", inventory_count: "Sayım",
      };

      return {
        movements: rows.map(r => ({
          sku: r.productSku, product_name: r.productName,
          type: r.movementType, type_label: typeLabels[r.movementType] || r.movementType,
          quantity: r.quantity, note: r.note, created_by: r.createdBy, created_at: r.createdAt,
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
          productSku: products.sku, productName: products.name,
          inProduction: stockLevels.inProduction, inWarehouse: stockLevels.inWarehouse,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      const match = rows.find(r =>
        (r.productSku || "").toLowerCase().includes(code) ||
        (r.productName || "").toLowerCase().includes(code)
      );
      if (!match) return { error: `Ürün bulunamadı: "${input.product_code}"` };

      const canFromWarehouse = match.inWarehouse >= orderQty;
      const deficit = Math.max(0, orderQty - match.inWarehouse);
      const canWithProduction = (match.inWarehouse + match.inProduction) >= orderQty;
      const totalDeficit = Math.max(0, orderQty - match.inWarehouse - match.inProduction);

      return {
        product: { sku: match.productSku, name: match.productName },
        order_quantity: orderQty,
        warehouse_stock: match.inWarehouse, production_stock: match.inProduction,
        can_fulfill_from_warehouse: canFromWarehouse,
        can_fulfill_with_production_transfer: canWithProduction,
        warehouse_deficit: deficit, total_deficit: totalDeficit,
        recommendation: canFromWarehouse
          ? `Sipariş karşılanabilir. Depoda ${match.inWarehouse} adet mevcut.`
          : canWithProduction
            ? `Depo yetersiz (${match.inWarehouse}). Üretimden ${deficit} adet transfer edilirse karşılanır.`
            : `Karşılanamaz. Toplam: ${match.inWarehouse + match.inProduction}, eksik: ${totalDeficit}. Yeni üretim gerekli.`,
      };
    }

    case "check_stock_alerts": {
      const rows = await db
        .select({
          productSku: products.sku, productName: products.name,
          inProduction: stockLevels.inProduction, inWarehouse: stockLevels.inWarehouse,
        })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id));

      const alerts: any[] = [];
      for (const r of rows) {
        if (r.inWarehouse === 0 && r.inProduction === 0) {
          alerts.push({ sku: r.productSku, name: r.productName, severity: "critical",
            message: `${r.productSku} — Stok yok! Acil üretim gerekli.` });
        } else if (r.inWarehouse === 0 && r.inProduction > 0) {
          alerts.push({ sku: r.productSku, name: r.productName, severity: "high",
            message: `${r.productSku} — Depoda 0, üretimde ${r.inProduction} bekliyor. Transfer et.` });
        } else if (r.inWarehouse > 0 && r.inWarehouse <= 5) {
          alerts.push({ sku: r.productSku, name: r.productName, severity: "medium",
            message: `${r.productSku} — Depoda sadece ${r.inWarehouse} adet. Takviye önerilir.` });
        }
      }
      const sev: Record<string, number> = { critical: 0, high: 1, medium: 2 };
      alerts.sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3));

      return { alerts, alert_count: alerts.length,
        summary: { critical: alerts.filter(a => a.severity === "critical").length,
          high: alerts.filter(a => a.severity === "high").length,
          medium: alerts.filter(a => a.severity === "medium").length } };
    }

    case "get_production_capacity": {
      const sku = input.sku || MAIN_SKU;
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      const capacity = computeProductionCapacity(items);
      return {
        product: sku, maxProducible: capacity.maxProducible,
        bottlenecks: capacity.bottlenecks.slice(0, 10),
        subAssemblyStatus: capacity.subAssemblyStatus, total_components: items.length,
      };
    }

    case "simulate_production": {
      const sku = input.sku || MAIN_SKU;
      const quantity = input.quantity || 100;
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      const capacity = computeProductionCapacity(items);
      const canProduce = capacity.maxProducible >= quantity;
      const shortages: any[] = [];
      const materialsNeeded: any[] = [];
      for (const item of items.filter(i => i.tier === 1 || i.tier === 2)) {
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
      return { product: sku, requestedQuantity: quantity, canProduce,
        maxProducible: capacity.maxProducible, shortages,
        materialsNeeded: materialsNeeded.slice(0, 15), subAssemblyStatus: capacity.subAssemblyStatus };
    }

    case "get_bom_tree": {
      const sku = input.sku || MAIN_SKU;
      const items = await getBomWithStock(sku);
      if (items.length === 0) return { error: `BOM bulunamadı: ${sku}` };
      return {
        product: sku, totalComponents: items.length,
        directMaterials: items.filter(i => i.tier === 1).map(i => ({
          code: i.code, name: i.name, requiredQty: i.requiredQty, unit: i.unit, stock: i.currentStock,
        })),
        subAssemblies: items.filter(i => i.tier === 2).map(sa => ({
          code: sa.code, name: sa.name, requiredQty: sa.requiredQty, unit: sa.unit, stock: sa.currentStock,
          children: items.filter(i => i.parentComponentCode === sa.code).map(c => ({
            code: c.code, name: c.name, requiredQty: c.requiredQty, unit: c.unit, stock: c.currentStock,
          })),
        })),
      };
    }

    // ── WRITE TOOLS — OAG ──

    case "create_stock_movement": {
      const code = (input.product_code || "").toLowerCase();
      const movementType = input.movement_type;
      const quantity = input.quantity;
      if (!code || !movementType || !quantity || quantity <= 0) {
        return { error: "product_code, movement_type ve quantity (>0) gerekli" };
      }

      const allProducts = await db.select().from(products);
      const match = allProducts.find(p =>
        (p.sku || "").toLowerCase().includes(code) ||
        (p.name || "").toLowerCase().includes(code)
      );
      if (!match) return { error: `Ürün bulunamadı: "${input.product_code}"` };

      const currentLevel = await ensureStockLevel(match.id);

      // Validate
      if (movementType === "to_warehouse" && currentLevel.inProduction < quantity) {
        return { error: `Üretimde yeterli stok yok. Üretimde: ${currentLevel.inProduction}, İstenen: ${quantity}` };
      }
      if (movementType === "to_sales" && currentLevel.inWarehouse < quantity) {
        return { error: `Depoda yeterli stok yok. Depoda: ${currentLevel.inWarehouse}, İstenen: ${quantity}` };
      }

      const previousState = { ...currentLevel };
      let newInProduction = currentLevel.inProduction;
      let newInWarehouse = currentLevel.inWarehouse;
      let newTotalSold = currentLevel.totalSold;

      switch (movementType) {
        case "produced": newInProduction += quantity; break;
        case "to_warehouse": newInProduction -= quantity; newInWarehouse += quantity; break;
        case "to_sales": newInWarehouse -= quantity; newTotalSold += quantity; break;
      }

      await db.transaction(async (tx) => {
        await tx.insert(stockMovementsV2).values({
          productId: match.id,
          movementType,
          quantity,
          previousState,
          note: input.note || `AI Agent tarafından oluşturuldu`,
          createdBy: "ai_agent",
        });
        await tx.update(stockLevels).set({
          inProduction: newInProduction, inWarehouse: newInWarehouse,
          totalSold: newTotalSold, updatedAt: new Date(),
        }).where(eq(stockLevels.productId, match.id));
      });

      broadcastStockUpdate({
        event: "stock_update",
        productId: match.id,
        productSku: match.sku || "?",
        movementType,
        quantity,
        stockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
      });

      // Proactive rules (fire-and-forget)
      evaluateRules({ type: "stock_movement", productId: match.id, sku: match.sku || undefined })
        .then(alerts => { if (alerts.length > 0) broadcastProactiveAlert({ event: "proactive_alert", alerts }); })
        .catch(err => console.error("[rules-engine]", err));

      const typeLabels: Record<string, string> = {
        produced: "Üretim girişi", to_warehouse: "Depoya transfer", to_sales: "Satış çıkışı",
      };
      return {
        success: true,
        action: typeLabels[movementType],
        product: { sku: match.sku, name: match.name },
        quantity,
        newStockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
        message: `${typeLabels[movementType]}: ${quantity} adet ${match.sku}. Yeni durum — Üretimde: ${newInProduction}, Depoda: ${newInWarehouse}, Satılan: ${newTotalSold}`,
      };
    }

    case "update_component_stock": {
      const code = input.component_code;
      const newStock = input.new_stock;
      if (!code || newStock === undefined || newStock < 0) {
        return { error: "component_code ve new_stock (>=0) gerekli" };
      }

      const [existing] = await db.select().from(componentStock).where(eq(componentStock.componentCode, code));
      if (!existing) return { error: `Bileşen bulunamadı: ${code}` };

      const oldStock = parseFloat(existing.currentStock as string);
      await db.update(componentStock).set({
        currentStock: String(newStock),
        lastCountedAt: new Date(),
        lastCountedBy: "ai_agent",
        updatedAt: new Date(),
      }).where(eq(componentStock.componentCode, code));

      // Data Lineage
      logAudit({
        entity: "component_stock", entityId: code, action: "update",
        field: "currentStock", previousValue: oldStock, newValue: newStock,
        reason: input.reason || "CEO Agent tarafından güncellendi",
        actor: "ceo_agent",
      });

      broadcastStockUpdate({
        event: "stock_update", productId: 0, productSku: code,
        movementType: "component_stock_update", quantity: newStock,
        stockLevel: { inProduction: 0, inWarehouse: newStock, totalSold: 0 },
      });

      // Look up parent product SKU for this component
      const [bomRef] = await db.select({ parentProductSku: bomItems.parentProductSku })
        .from(bomItems).where(eq(bomItems.componentCode, code)).limit(1);

      // Correction Propagation — stok düzeltmesi tüm kolları re-evaluate eder
      propagateCorrection({
        type: "stock_corrected",
        entityId: code,
        detail: `${code} stok düzeltme: ${oldStock} → ${newStock}`,
        actor: "ceo_agent",
        sku: bomRef?.parentProductSku || undefined,
      }).catch(err => console.error("[correction-propagation]", err));

      return {
        success: true, componentCode: code, oldStock, newStock,
        message: `${code} stoku güncellendi: ${oldStock} → ${newStock} ${existing.unit}`,
        reason: input.reason || "AI Agent tarafından güncellendi",
      };
    }

    case "create_purchase_suggestion": {
      const code = input.component_code;
      const qty = input.suggested_quantity;
      const reason = input.reason;
      if (!code || !qty || !reason) {
        return { error: "component_code, suggested_quantity ve reason gerekli" };
      }

      // Look up component info from BOM
      const [bomItem] = await db.select().from(bomItems).where(eq(bomItems.componentCode, code));
      if (!bomItem) return { error: `Bileşen BOM'da bulunamadı: ${code}` };

      const [created] = await db.insert(purchaseSuggestions).values({
        componentCode: code,
        componentName: bomItem.componentName,
        suggestedQuantity: String(qty),
        unit: bomItem.unit,
        reason,
        createdBy: "ai_agent",
      }).returning();

      return {
        success: true,
        suggestion: {
          id: created.id, componentCode: code, componentName: bomItem.componentName,
          quantity: qty, unit: bomItem.unit, reason, status: "pending",
        },
        message: `Satın alma önerisi oluşturuldu: ${qty} ${bomItem.unit} ${bomItem.componentName} (${code}) — "${reason}"`,
      };
    }

    case "get_purchase_suggestions": {
      const statusFilter = input.status || "pending";
      let query = db.select().from(purchaseSuggestions).orderBy(desc(purchaseSuggestions.createdAt));
      if (statusFilter !== "all") {
        query = query.where(eq(purchaseSuggestions.status, statusFilter)) as any;
      }
      const rows = await query;
      return {
        suggestions: rows.map(r => ({
          id: r.id, componentCode: r.componentCode, componentName: r.componentName,
          quantity: parseFloat(r.suggestedQuantity as string), unit: r.unit,
          reason: r.reason, status: r.status,
          createdBy: r.createdBy, createdAt: r.createdAt,
        })),
        count: rows.length,
        filter: statusFilter,
      };
    }

    case "get_component_intelligence": {
      const sku = input.sku || MAIN_SKU;
      const result = await computeComponentIntelligence(sku);
      if (input.component_code) {
        result.components = result.components.filter(c => c.code === input.component_code);
      }
      return result;
    }

    case "get_intelligence_engine": {
      const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
      const reportType = input.report_type || "oracle";

      try {
        let url: string;
        switch (reportType) {
          case "uretim_plani":
            url = `${baseUrl}/api/palantir/demo/uretim-plani?adet=${input.adet || 222}`;
            break;
          case "alti_ay_plan":
            url = `${baseUrl}/api/palantir/demo/6-ay-plan`;
            break;
          case "acil_siparis":
            url = `${baseUrl}/api/palantir/demo/acil-siparis?ay=${input.ay || 3}`;
            break;
          case "tenx":
            url = `${baseUrl}/api/palantir/demo/10x`;
            break;
          default:
            url = `${baseUrl}/api/palantir/oracle`;
        }
        const resp = await fetch(url);
        const data = await resp.json();
        return data;
      } catch (err: any) {
        return { error: `Intelligence Engine erişim hatası: ${err.message}` };
      }
    }

    case "what_if_analysis": {
      try {
        const scenarioType = input.scenario_type as string;
        const quantity = input.quantity as number;
        const componentCode = input.component_code as string | undefined;

        let scenario: WhatIfScenario;
        switch (scenarioType) {
          case "produce":
            scenario = { type: "produce", quantity };
            break;
          case "order_received":
            scenario = { type: "order_received", quantity };
            break;
          case "restock_component":
            if (!componentCode) return { error: "restock_component için component_code gerekli" };
            scenario = { type: "restock_component", componentCode, quantity };
            break;
          case "months_forward":
            scenario = { type: "months_forward", months: quantity };
            break;
          default:
            return { error: `Bilinmeyen senaryo tipi: ${scenarioType}` };
        }

        const result = await simulateWhatIf(scenario);
        return {
          scenario: result.scenario,
          feasible: result.feasible,
          summary: result.summary,
          currentCapacity: result.currentCapacity,
          afterCapacity: result.afterCapacity,
          capacityDelta: result.capacityDelta,
          bottleneckChanged: result.bottleneckChanged,
          currentBottleneck: result.currentBottleneck,
          afterBottleneck: result.afterBottleneck,
          criticalCount: result.criticalComponents.length,
          warningCount: result.warningComponents.length,
          actions: result.actions.slice(0, 8),
          topImpacts: result.componentImpacts.slice(0, 10).map(c => ({
            code: c.code, name: c.name,
            currentStock: c.currentStock,
            afterStock: c.afterStock,
            stockDelta: c.stockDelta,
            stockChanged: c.stockDelta !== 0,
            currentDays: c.currentSeasonalDays,
            afterDays: c.afterSeasonalDays,
            urgency: c.urgencyChanged ? `${c.currentUrgency} → ${c.afterUrgency}` : c.afterUrgency,
            urgencyChanged: c.urgencyChanged,
            winterStress: c.winterStress,
            action: c.actionNeeded,
          })),
        };
      } catch (err: any) {
        return { error: `What-If analiz hatası: ${err.message}` };
      }
    }

    case "get_validation_dashboard": {
      try {
        const { getValidationMetrics, getValidationAlerts } = await import("../lib/alert-persistence");
        const metrics = await getValidationMetrics();
        const recentAlerts = input.include_recent_alerts !== false
          ? await getValidationAlerts({ limit: 10 })
          : [];
        return {
          metrics,
          recentAlerts: recentAlerts.map(a => ({
            id: a.id,
            type: a.type,
            severity: a.severity,
            title: a.title,
            message: a.message,
            rootCause: a.rootCause,
            validated: a.validated,
            outcome: a.outcome,
            createdAt: a.createdAt,
          })),
        };
      } catch (err: any) {
        return { error: `Validasyon panosu hatası: ${err.message}` };
      }
    }

    case "get_audit_trail": {
      try {
        const { auditLog } = await import("@shared/schema");
        const { eq, desc } = await import("drizzle-orm");
        const entityId = String(input.entity_id);
        const limit = input.limit || 20;
        const logs = await db.select().from(auditLog)
          .where(eq(auditLog.entityId, entityId))
          .orderBy(desc(auditLog.createdAt))
          .limit(limit);
        return {
          entityId,
          entries: logs.map(l => ({
            action: l.action,
            field: l.field,
            previousValue: l.previousValue,
            newValue: l.newValue,
            reason: l.reason,
            actor: l.actor,
            timestamp: l.createdAt,
          })),
          total: logs.length,
        };
      } catch (err: any) {
        return { error: `Audit trail hatası: ${err.message}` };
      }
    }

    case "get_import_guide": {
      return {
        title: "Smart Data Import Rehberi",
        description: "Excel veya CSV dosyalarını otomatik ayrıştırır, kolon eşler, anomali tespit eder ve veriyi güvenli şekilde import eder.",
        supportedTypes: [
          {
            type: "sales_history",
            description: "Aylık satış verileri",
            requiredColumns: ["yil/year", "ay/month", "adet/miktar/quantity"],
            optionalColumns: ["ciro/revenue"],
            example: "Yil | Ay | Adet | Ciro\n2025 | 1 | 340 | 150000",
          },
          {
            type: "component_stock",
            description: "Bileşen stok güncellemesi",
            requiredColumns: ["kod/code/bileşen", "stok/stock/miktar"],
            example: "Kod | Stok\nXX.XXX | 500\nXX.XXX | 250",
          },
          {
            type: "bom_update",
            description: "BOM reçete güncellemesi",
            requiredColumns: ["kod/code", "ad/name"],
            optionalColumns: ["gerekli/required", "birim/unit", "tier"],
            example: "Kod | Ad | Gerekli\nXX.XXX | Bileşen Adı | 2",
          },
        ],
        endpoints: {
          analyze: "POST /api/import/analyze — dosyayı analiz et (veri değiştirmez)",
          execute: "POST /api/import/execute — dosyayı import et",
          legacy: "POST /api/planning/import — eski satış import'u",
        },
        features: [
          "Otomatik kolon eşleme (Türkçe/İngilizce)",
          "Veri tipi otomatik tespiti",
          "Anomali tespiti (beklenen değerlerle karşılaştırma)",
          "Dry-run modu (önce analiz, sonra import)",
          "Satır bazlı hata raporlama",
        ],
        howToUse: "Planlama sayfasındaki 'Veri Import' sekmesinden Excel/CSV yükleyin, veya /api/import/analyze endpoint'ine POST yapın.",
      };
    }

    case "create_custom_rule": {
      try {
        const { parseNaturalLanguageRule } = await import("../lib/nl-rules-parser");
        const nlText = input.rule_description as string;
        const result = await parseNaturalLanguageRule(nlText);
        if (!result.success || !result.parsed) {
          return { error: result.error || "Kural ayrıştırılamadı" };
        }
        const { customRules } = await import("@shared/schema");
        const [saved] = await db.insert(customRules).values({
          nlDescription: nlText,
          parsedRule: result.parsed,
          ruleType: result.parsed.type,
          severity: result.parsed.action.severity,
          createdBy: "ceo_agent",
        }).returning();
        return {
          success: true,
          rule: {
            id: saved.id,
            description: nlText,
            type: result.parsed.type,
            severity: result.parsed.action.severity,
            explanation: result.parsed.explanation,
            condition: result.parsed.condition,
            action: result.parsed.action,
          },
          message: `Kural #${saved.id} oluşturuldu ve aktif edildi.`,
        };
      } catch (err: any) {
        return { error: `Kural oluşturma hatası: ${err.message}` };
      }
    }

    case "list_custom_rules": {
      try {
        const { customRules } = await import("@shared/schema");
        const rules = await db.select().from(customRules).orderBy(customRules.createdAt);
        return {
          rules: rules.map(r => ({
            id: r.id,
            description: r.nlDescription,
            type: r.ruleType,
            severity: r.severity,
            isActive: r.isActive,
            triggerCount: r.triggerCount,
            lastTriggered: r.lastTriggered,
            explanation: (r.parsedRule as any)?.explanation,
            createdAt: r.createdAt,
          })),
          total: rules.length,
          active: rules.filter(r => r.isActive).length,
        };
      } catch (err: any) {
        return { error: `Kural listeleme hatası: ${err.message}` };
      }
    }

    case "toggle_custom_rule": {
      try {
        const { customRules } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const ruleId = input.rule_id as number;
        const action = input.action as string;

        if (action === "delete") {
          await db.delete(customRules).where(eq(customRules.id, ruleId));
          return { success: true, message: `Kural #${ruleId} silindi.` };
        }

        const [updated] = await db.update(customRules)
          .set({ isActive: action === "activate", updatedAt: new Date() })
          .where(eq(customRules.id, ruleId))
          .returning();

        if (!updated) return { error: `Kural #${ruleId} bulunamadı` };
        return {
          success: true,
          message: `Kural #${ruleId} ${action === "activate" ? "aktif edildi" : "pasif edildi"}.`,
          rule: { id: updated.id, description: updated.nlDescription, isActive: updated.isActive },
        };
      } catch (err: any) {
        return { error: `Kural güncelleme hatası: ${err.message}` };
      }
    }

    case "get_outcome_dashboard": {
      try {
        const { getOutcomeDashboard } = await import("../lib/outcome-engine");
        const dashboard = await getOutcomeDashboard();
        return {
          title: "Outcome Learning Engine — Tahmin Doğruluk Raporu",
          summary: {
            totalPredictions: dashboard.totalPredictions,
            pendingVerification: dashboard.pendingVerification,
            overallAccuracy: dashboard.overallAccuracy != null
              ? `%${(dashboard.overallAccuracy * 100).toFixed(1)}`
              : "Henüz yeterli veri yok",
            totalValueGenerated: `${dashboard.totalValueGenerated.toLocaleString("tr-TR")} TL`,
          },
          breakdown: {
            verifiedCorrect: dashboard.verifiedCorrect,
            verifiedIncorrect: dashboard.verifiedIncorrect,
            partiallyCorrect: dashboard.partiallyCorrect,
            expired: dashboard.expired,
          },
          ruleConfidence: dashboard.byRule.map(r => ({
            rule: r.ruleType,
            component: r.componentCode,
            confidence: `%${(r.confidence * 100).toFixed(0)}`,
            predictions: r.totalPredictions,
            correct: r.correctPredictions,
            avgValueTL: Math.round(r.avgValueGenerated),
            trend: r.trend,
          })),
          weeklyTrend: dashboard.weeklyTrend,
          recentOutcomes: dashboard.recentOutcomes.slice(0, 10),
        };
      } catch (err: any) {
        return { error: `Outcome dashboard hatası: ${err.message}` };
      }
    }

    case "get_seasonal_intelligence": {
      try {
        const { getSeasonalDashboard } = await import("../lib/dynamic-seasonality");
        const dashboard = await getSeasonalDashboard();
        return {
          title: "Dynamic Seasonality Engine — Mevsimsel İstihbarat",
          summary: {
            yıllıkTalepBaseline: `${dashboard.yearlyTotalBaseline} adet`,
            yıllıkTalepDinamik: `${dashboard.yearlyTotalDynamic} adet`,
            aylıkOrtDinamik: `${dashboard.monthlyAvgDynamic} adet`,
            anomaliSayısı: dashboard.anomalies.length,
            ortDrift: `%${dashboard.driftSummary.avgAbsDrift}`,
            önemliKayma: dashboard.driftSummary.isSignificantShift ? "EVET — mevsimsel pattern değişiyor" : "Hayır — kararlı",
          },
          months: dashboard.months.map(m => ({
            ay: m.monthLabel,
            baselineTalep: m.baselineDemand,
            dinamikTalep: m.dynamicDemand,
            baselineIndex: m.baselineIndex,
            dinamikIndex: m.dynamicIndex,
            drift: `${m.drift > 0 ? "+" : ""}${m.drift}%`,
            örnekSayısı: m.sampleCount,
            sonGerçekTalep: m.lastActualDemand,
            sonGerçekYıl: m.lastActualYear,
            anomali: m.anomalyDetected ? m.anomalyReason : null,
          })),
          driftAnalizi: {
            enBüyükArtış: dashboard.driftSummary.maxPositiveDrift
              ? `${dashboard.driftSummary.maxPositiveDrift.month}: +%${dashboard.driftSummary.maxPositiveDrift.drift}`
              : "Yok",
            enBüyükDüşüş: dashboard.driftSummary.maxNegativeDrift
              ? `${dashboard.driftSummary.maxNegativeDrift.month}: %${dashboard.driftSummary.maxNegativeDrift.drift}`
              : "Yok",
          },
          explanation: "İndeksler EWMA (λ=0.3) ile her yeni satış verisinde güncellenir. Anomali: gerçek talep > 2σ sapma. Drift: dinamik vs baseline farkı (%).",
        };
      } catch (err: any) {
        return { error: `DSE dashboard hatası: ${err.message}` };
      }
    }

    case "get_adaptive_profile": {
      try {
        const { getTenantFingerprint, getDefaultThresholds } = await import("../lib/adaptive-thresholds");
        const fingerprint = await getTenantFingerprint();
        const defaults = getDefaultThresholds();
        if (!fingerprint) return { error: "Firma profili bulunamadı" };

        const T = fingerprint.thresholds;
        return {
          title: "Adaptive Threshold Engine — Firma Profili",
          profile: {
            firma: fingerprint.companyName,
            tedariSüresi: `${fingerprint.avgLeadTimeDays} gün (±${fingerprint.leadTimeStdDev} gün)`,
            talepVolatilitesi: `${(fingerprint.demandVolatility * 100).toFixed(0)}% (CV)`,
            mevsimselGenlik: `${fingerprint.seasonalAmplitude.toFixed(1)}x (max/min)`,
            riskTolerası: `${(fingerprint.riskTolerance * 100).toFixed(0)}% (0=temkinli, 100=risk sever)`,
            alertTepkiOranı: `${(fingerprint.alertResponseRate * 100).toFixed(0)}%`,
            ortKararSüresi: `${fingerprint.avgDecisionTimeMin} dakika`,
          },
          adaptiveThresholds: {
            aciliyetKritik: `${T.urgencyCriticalDays} gün (varsayılan: ${defaults.urgencyCriticalDays})`,
            aciliyetUyarı: `${T.urgencyWarningDays} gün (varsayılan: ${defaults.urgencyWarningDays})`,
            aciliyetYeterli: `${T.urgencyOkDays} gün (varsayılan: ${defaults.urgencyOkDays})`,
            lineerKritik: `${T.linearCriticalDays} gün (varsayılan: ${defaults.linearCriticalDays})`,
            lineerUyarı: `${T.linearWarningDays} gün (varsayılan: ${defaults.linearWarningDays})`,
            tedariSüresi: `${T.leadTimeDays} gün (varsayılan: ${defaults.leadTimeDays})`,
            kapasiteKritik: `${T.capacityCriticalThreshold} adet (varsayılan: ${defaults.capacityCriticalThreshold})`,
            mevsimselSpike: `${T.seasonalSpikeRatio}x (varsayılan: ${defaults.seasonalSpikeRatio})`,
            kaskadEşik: `${T.cascadeFailureThreshold} bileşen (varsayılan: ${defaults.cascadeFailureThreshold})`,
            talepAnomali: `${T.demandAnomalyRatio}x (varsayılan: ${defaults.demandAnomalyRatio})`,
          },
          explanation: "Eşikler firma profiline göre otomatik hesaplanır. Risk toleransı kullanıcı davranışından (alert tepkileri) Bayesian güncelleme ile öğrenilir.",
        };
      } catch (err: any) {
        return { error: `ATE profil hatası: ${err.message}` };
      }
    }

    case "get_token_value_metrics": {
      try {
        const { getTVTDashboard } = await import("../lib/token-value-tracker");
        const tvt = await getTVTDashboard();
        return {
          title: "Token Value Tracker — Ontoloji Değer Raporu",
          summary: {
            totalInteractions: tvt.totalInteractions,
            totalTokensConsumed: tvt.totalTokensConsumed.toLocaleString("tr-TR"),
            totalEstimatedValueTL: `${tvt.totalEstimatedValueTL.toLocaleString("tr-TR")} TL`,
            totalActualValueTL: `${tvt.totalActualValueTL.toLocaleString("tr-TR")} TL`,
            avgValuePerToken: tvt.avgValuePerToken != null
              ? `${tvt.avgValuePerToken.toFixed(2)} TL/token`
              : "Hesaplanıyor",
            ontologyAdvantageRatio: tvt.avgOntologyAdvantageRatio != null
              ? `${tvt.avgOntologyAdvantageRatio.toFixed(1)}x`
              : "∞ (generic model cevaplayamaz)",
          },
          flywheel: {
            dataGrowthRate: `${(tvt.flywheel.dataGrowthRate * 100).toFixed(1)}%`,
            personalizationDepth: `${(tvt.flywheel.personalizationDepth * 100).toFixed(1)}%`,
            engagementTrend: `${(tvt.flywheel.engagementTrend * 100).toFixed(1)}%`,
            velocityScore: tvt.flywheel.velocityScore.toFixed(3),
            explanation: "Flywheel: veri büyümesi × kişiselleştirme × etkileşim artışı. Pozitif velocity = flywheel dönüyor.",
          },
          weeklyVPT: tvt.weeklyVPT,
          byCategory: tvt.byCategory,
          topTools: tvt.topTools,
        };
      } catch (err: any) {
        return { error: `TVT dashboard hatası: ${err.message}` };
      }
    }

    default:
      return { error: `Bilinmeyen tool: ${toolName}` };
  }
}

/** Agent cevabından öneri özetini çıkar — ADM hafızası için */
function extractRecommendation(responseText: string): string | undefined {
  // "Önerilen Aksiyonlar:" bloğunu bul
  const actionIdx = responseText.indexOf("Önerilen Aksiyonlar:");
  if (actionIdx !== -1) {
    const block = responseText.slice(actionIdx, actionIdx + 300);
    return block.split("\n").slice(0, 4).join(" ").trim();
  }

  // "Öneri:" veya "Tavsiye:" ile başlayan satırları bul
  const lines = responseText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Öneri:") || trimmed.startsWith("Tavsiye:") || trimmed.startsWith("⚠️")) {
      return trimmed.slice(0, 200);
    }
  }

  return undefined;
}

/** Kullanıcı sorgusunu kategorize et — TVT değer tahmini için */
function classifyQuery(
  message: string,
  toolsUsed: string[]
): "stock_check" | "forecast" | "planning" | "alert_response" | "operational" {
  const msg = message.toLowerCase();

  if (toolsUsed.includes("what_if_analysis") || toolsUsed.includes("get_intelligence_engine")) return "forecast";
  if (toolsUsed.includes("get_validation_dashboard") || toolsUsed.includes("check_stock_alerts") ||
    msg.includes("uyarı") || msg.includes("alert") || msg.includes("kritik")) return "alert_response";
  if (toolsUsed.includes("simulate_order_fulfillment") || msg.includes("plan") ||
    msg.includes("üret") || msg.includes("sipariş")) return "planning";
  if (toolsUsed.includes("get_live_stock_levels") || toolsUsed.includes("get_component_intelligence") ||
    msg.includes("stok") || msg.includes("durum") || msg.includes("kaç")) return "stock_check";

  return "operational";
}

// ══════════════════════════════════════════════════════════════════════
// LIVE SNAPSHOT — Pre-compute system state so agent already knows
// ══════════════════════════════════════════════════════════════════════

async function buildLiveSnapshot(): Promise<string> {
  try {
    const today = new Date();

    // Lightweight: just list products and their capacity — no heavy computation
    const allProducts = await db.execute(sql`
      SELECT DISTINCT p.sku, p.name,
        (SELECT COUNT(*) FROM bom_items WHERE parent_product_sku = p.sku) as bom_count
      FROM products p
      WHERE p.sku IN (SELECT DISTINCT parent_product_sku FROM bom_items)
      ORDER BY p.sku
    `);
    const productList = allProducts.rows as Array<{ sku: string; name: string; bom_count: string }>;

    // Stock levels
    const stockRows = await db
      .select({ sku: products.sku, inProd: stockLevels.inProduction, inWh: stockLevels.inWarehouse })
      .from(stockLevels).innerJoin(products, eq(stockLevels.productId, products.id));

    let snapshot = `\n═══ CANLI DURUM (${today.toLocaleDateString("tr-TR")}) ═══\n`;
    snapshot += `KAYITLI ÜRÜNLER:\n`;

    for (const prod of productList) {
      const stk = stockRows.find(r => r.sku === prod.sku);
      const mamul = stk ? stk.inProd + stk.inWh : 0;
      snapshot += `  ${prod.sku} — ${prod.name} | Mamül: ${mamul} adet | ${prod.bom_count} bileşen\n`;
    }

    // Only compute capacity for main product (fast path)
    try {
      const mainBom = await getBomWithStock(MAIN_SKU);
      if (mainBom.length > 0) {
        const cap = computeProductionCapacity(mainBom);
        snapshot += `\n${MAIN_SKU} kapasite: ${cap.maxProducible} (darboğaz: ${cap.bottlenecks[0]?.name || "-"})\n`;
      }
    } catch {}

    snapshot += `\nNOT: Herhangi bir ürün hakkında detay için tool'ları kullan (get_production_capacity, get_component_intelligence vb.) — sku parametresi ile ürün belirt.\n`;
    snapshot += `═══════════════════════════════════\n`;

    return snapshot;
  } catch (err) {
    console.warn("[agent/snapshot] Failed:", err);
    return "";
  }
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

    const { message, history } = req.body as {
      message: string;
      history?: { role: string; content: string }[];
    };

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message alanı gereklidir." });
    }

    const client = new Anthropic({ apiKey });

    // Filter out empty/invalid history entries and ensure alternating roles
    const cleanHistory = (history || []).filter(
      (h) => h.content && typeof h.content === "string" && h.content.trim().length > 0
    );
    const messages: Anthropic.MessageParam[] = [
      ...cleanHistory.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    const toolsUsed: string[] = [];

    // ── Live snapshot + RAG: Dynamic context injection ──
    let systemPrompt = CORE_PROMPT;

    // 1. Live snapshot (fast DB queries — agent knows current state without tool calls)
    const snapshot = await buildLiveSnapshot();
    if (snapshot) systemPrompt += snapshot;

    // 2. RAG (semantic search for domain knowledge)
    try {
      const ragContext = await buildDynamicContext(message);
      if (ragContext) {
        systemPrompt += "\n" + ragContext;
        console.log(`[agent/rag] Injected dynamic context (${ragContext.length} chars)`);
      }
    } catch (ragErr: any) {
      console.warn("[agent/rag] RAG failed, using core prompt only:", ragErr.message);
    }

    // 3. ADM (Agent Decision Memory — benzer geçmiş kararlar)
    let admMemories: Awaited<ReturnType<typeof recallRelevantMemories>> | null = null;
    try {
      admMemories = await recallRelevantMemories(message);
      if (admMemories.contextBlock) {
        systemPrompt += "\n" + admMemories.contextBlock;
        console.log(`[agent/adm] Injected ${admMemories.memories.length} past decisions`);
      }
    } catch (admErr: any) {
      console.warn("[agent/adm] ADM failed, continuing without memory:", admErr.message);
    }

    // All tools: custom ontology tools + Anthropic built-in web search
    const allTools: any[] = [
      ...TOOLS,
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      },
    ];

    let response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools: allTools,
      messages,
    });

    // Helper: extract best text from response content
    const extractText = (content: any[]) => {
      const texts = content.filter((b: any) => b.type === "text").map((b: any) => b.text);
      return texts.join("\n") || null;
    };

    // Tool-use loop (max 5 iterations, with rate limit protection)
    let iterations = 0;
    let lastGoodText = extractText(response.content);

    while (response.stop_reason === "tool_use" && iterations < 3) {
      iterations++;
      const assistantContent = response.content;

      // Collect custom tool calls (not web_search — that's server-side)
      const toolUseBlocks = assistantContent.filter(
        (b: any) => b.type === "tool_use" && b.name !== "web_search"
      );

      // Track all tool names used
      for (const b of assistantContent.filter((b: any) => b.type === "tool_use" || b.type === "server_tool_use")) {
        toolsUsed.push((b as any).name);
      }

      // If only web_search was called (no custom tools), no need to loop — server handled it
      if (toolUseBlocks.length === 0) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        const block = toolBlock as any;
        try {
          const result = await callTool(block.name, block.input as Record<string, any>);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (err: any) {
          toolResults.push({ type: "tool_result", tool_use_id: block.id,
            content: JSON.stringify({ error: err.message || "Tool execution failed" }), is_error: true });
        }
      }

      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });

      try {
        response = await client.messages.create({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          tools: allTools,
          messages,
        });
        const newText = extractText(response.content);
        if (newText) lastGoodText = newText;
      } catch (loopErr: any) {
        // Rate limit in loop — return whatever text we have so far
        console.error("[agent/chat] Loop error:", loopErr.status, loopErr.message);
        if (lastGoodText) {
          return res.json({ response: lastGoodText + "\n\n⚠️ *Analiz kısmen tamamlandı (rate limit)*", tools_used: toolsUsed, rag_injected: systemPrompt.length > CORE_PROMPT.length });
        }
        throw loopErr; // re-throw if we have nothing
      }
    }

    const responseText = extractText(response.content) || lastGoodText || "Cevap üretilemedi.";

    // TVT — Token Value Tracker: her etkileşimi logla
    const usage = response.usage;
    const category = classifyQuery(message, toolsUsed);
    if (usage) {
      logTokenInteraction({
        interactionType: "agent_chat",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        queryCategory: category,
        actor: "ceo_agent",
      });
    }

    // ADM — Etkileşimi hafızaya kaydet (fire-and-forget)
    recordMemory({
      queryText: message,
      queryCategory: category,
      toolsUsed,
      recommendationMade: extractRecommendation(responseText),
      responseLength: responseText.length,
    }).catch(err => console.warn("[agent/adm] Memory record failed:", err.message));

    res.json({ response: responseText, tools_used: toolsUsed, rag_injected: systemPrompt.length > CORE_PROMPT.length });
  } catch (err: any) {
    console.error("[agent/chat] Error:", err.status, err.message, err.error?.message);
    if (err.status === 429) {
      return res.json({
        response: "⏳ **Yoğunluk** — API limiti aşıldı. 30 saniye bekleyip tekrar deneyin.",
        tools_used: [],
      });
    }
    const msg = err.error?.message || err.message || "AI Agent hatası";
    res.status(err.status || 500).json({ error: msg });
  }
});

export default router;
