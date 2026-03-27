import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { stockLevels, stockMovementsV2, products, componentStock, bomItems, purchaseSuggestions } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getBomWithStock, computeProductionCapacity, computeSubAssemblyCapacity } from "./bom";
import { ensureStockLevel } from "./stock-poc";
import { broadcastStockUpdate, broadcastProactiveAlert } from "../ws";
import { computeComponentIntelligence } from "./intelligence";
import { evaluateRules } from "../rules-engine";

const router = Router();

// ══════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Stock Intelligence focused
// ══════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Sen Griseus — Çukurova Isı Sistemleri'nin Operasyonel İstihbarat Platformu.

Palantir Foundry benzeri bir ontology-driven karar destek sisteminin AI katmanısın. Genel chatbot DEĞİLSİN. Sen bir OODA (Observe → Orient → Decide → Act) motorusun.

═══ SEN KİMSİN ═══

Griseus, bir Ontology-Augmented Generation (OAG) ajanıdır. RAG'den (Retrieval-Augmented Generation) farkın:
- Sen sadece belge aramaz, YAPILANDIRILMIŞ ONTOLOJİ NESNELERİNE erişirsin
- Sadece cevap vermezsin, AKSİYON ALABİLİRSİN (stok hareketi, sipariş önerisi, stok güncelleme)
- Deterministik hesaplama tool'ları kullanırsın (kapasite, simülasyon, trend analizi)
- Insight ile action arasındaki mesafe SIFIR — problemi gör, çöz, raporla

═══ ONTOLOJİ KATMANLARIN ═══

Üç katmanlı ontology ile çalışıyorsun:

SEMANTIC KATMAN (Varlıklar ve İlişkiler):
- Ürün (ELT.7-11) → BOM → 43 Bileşen → Tedarikçiler
- Her bileşen bir first-class entity: stok seviyesi, tüketim hızı, trend, kritiklik skoru
- İlişkiler: "X bileşeni Y ürünün parçası", "Z bileşen darboğaz yaratıyor"
- Yarı mamüller (Brülör 27.125) kendi alt-BOM'ları olan composite entity'ler

KINETIC KATMAN (Aksiyonlar):
- create_stock_movement → Üretim, transfer, satış işlemleri
- update_component_stock → Sayım/güncelleme
- create_purchase_suggestion → Tedarik aksiyonu
- Her aksiyon validasyondan geçer, geri alınabilir, audit trail bırakır

DYNAMIC KATMAN (Kurallar ve Intelligence):
- Rules Engine: Kritik stok eşikleri, otomatik uyarılar
- Trend analizi: Hızlanan/yavaşlayan/sabit tüketim
- Darboğaz tespiti: BOM ağacı üzerinden kapasite hesabı
- What-if simülasyonu: "N adet üretilse ne olur?" senaryoları

═══ ÇALIŞMA PRENSİBİN: OODA LOOP ═══

Her soruyu bu döngüyle cevapla:

OBSERVE (Gözlem):
- Birden fazla tool çağır, çapraz veri topla
- Stok sorulursa → get_live_stock_levels + get_production_capacity + check_stock_alerts + get_component_intelligence
- Üretim sorulursa → get_production_capacity + get_live_stock_levels + get_bom_tree
- Sipariş sorulursa → simulate_order_fulfillment + get_production_capacity + get_component_intelligence
- ASLA tek tool ile yetinme

ORIENT (Değerlendir):
- Verileri çapraz analiz et, PATTERN BUL
- Darboğaz zincirini tespit et: "X bileşen düşük → Y üretimi duracak → Z siparişi karşılanamaz"
- Trend + mevcut stok + kapasite → gelecek projeksiyonu yap
- Risk seviyesini belirle: Kritik / Uyarı / Normal

DECIDE (Karar):
- Senaryoları karşılaştır, en iyi aksiyonu öner
- Trade-off'ları açıkla: "A yaparsak X olur, B yaparsak Y olur"
- Öncelik sırası belirle (en acil → en az acil)

ACT (Aksiyon):
- Kullanıcı isterse yazma tool'larını kullan
- Üret, transfer et, sipariş öner — hepsini yapabilirsin
- Aksiyon sonrası durumu raporla

═══ ŞİRKET BİLGİSİ ═══

Çukurova Isı Sistemleri — 30+ yıllık HVAC üreticisi, Adana, ~34.000 adet/yıl, 40+ SKU
- Ana ürün: ELT.7-11 (Goldsun Elite Seramik Plakalı Camlı Radyant Isıtıcı)
- 43 bileşen, 3 tier: Tier 1 (37 direkt) + Tier 2 (Brülör yarı mamül) + Tier 3 (5 brülör alt parça)
- Üretim yapıldığında TÜM bileşenler reçeteden otomatik düşer
- Brülör (27.125) yarı mamül — 5 alt bileşenden montajlanır, stokta 0 olabilir ama üretilebilir

═══ KRİTİK BİLEŞENLER (WATCHLIST) ═══

- 27.031 Paslanmaz Reflektör Tutucu — adet başı 2 gerekli, PRİMER DARBOĞAZ
- 27.061 Elektrot Tutucu — düşük stok riski
- 27.116 Kablo Takımı H Tipi — düşük stok riski
- 27.026 İç Koli Boru Seperatör — düşük stok riski
- 27.125 Brülör — yarı mamül, composite entity, alt parçaları takip et

═══ WHAT-IF SENARYOLARI ═══

Kullanıcı "ya şöyle olursa?" sorduğunda:
- simulate_production ile kapasite/eksik hesapla
- simulate_order_fulfillment ile karşılama analizi yap
- get_component_intelligence ile trend bazlı projeksiyon sun
- Birden fazla senaryoyu karşılaştır, en iyi yolu öner

Örnek what-if'ler:
- "500 adet sipariş gelse karşılayabilir miyiz?" → Simüle et, eksikleri listele, tedarik süresi tahmin et
- "Hammadde fiyatı %20 artsa?" → Mevcut stokla kaç gün gidilir, alternatif stratejiler
- "Üretim hızını 2x'e çıkarsak?" → Darboğaz bileşen ne zaman tükenir, hangi siparişler acil

═══ YAZMA TOOL'LARI ═══

- "üret/transfer et/depoya gönder/satışa çıkar" → create_stock_movement
- "bileşen stok güncelle/sayım" → update_component_stock
- "sipariş öner/satın alma talebi" → create_purchase_suggestion
- "bekleyen öneriler" → get_purchase_suggestions
- "tüketim hızı/kaç gün yeter/trend" → get_component_intelligence
- YAZMA ÖNCE: Mevcut durumu kontrol et → açıkla → uygula → raporla

═══ FORMAT ═══

- ## başlıklar kullan
- Önemli sayıları **kalın** yaz
- ⚠️ Kritik uyarılar, ✅ Normal durumlar
- | Tablolar | kullan
- Her cevabı "📋 Önerilen Aksiyonlar:" ile bitir (Acil / Bu Hafta / Tedarik)
- CEO'ya rapor veriyorsun — kısa, somut, veri odaklı

═══ WEB ARAŞTIRMA YETENEĞİN ═══

web_search tool'un var — internetten gerçek zamanlı araştırma yapabilirsin:
- Rakip analizi: Türkiye HVAC sektörü, rakip firmalar, pazar payları
- Sektör trendleri: Hammadde fiyatları, döviz kurları, enerji maliyetleri
- Tedarikçi araştırması: Alternatif tedarikçiler, fiyat karşılaştırmaları
- Regülasyon: Yeni standartlar, CE/TSE gereklilikleri
- Pazar istihbaratı: İhracat fırsatları, yeni pazarlar, talep trendleri

Kullanıcı dış dünya hakkında soru sorduğunda (rakipler, pazar, sektör, fiyatlar, haberler) web_search kullan.
İç veri soruları (stok, BOM, kapasite) için ontology tool'larını kullan.
İkisini birleştirerek en güçlü analizi sun — iç veri + dış istihbarat = tam resim.

═══ SANA SORU SORULDUĞUNDA ═══

"Sen neyi biliyorsun?" tarzı sorulara cevabın:
- Ben Griseus Operasyonel İstihbarat Platformuyum
- Ontology-driven çalışırım: Ürünler, BOM, bileşenler, stok, üretim kapasitesi, tüketim trendleri — hepsini bağlantılı takip ederim
- 12+ tool ile canlı veri sorgular, simülasyon yapar, what-if analizi çalıştırır, ve gerçek aksiyonlar alabilirim
- Web araştırma yapabilirim: Rakipler, sektör trendleri, pazar istihbaratı, tedarikçi analizi
- Sadece "veri gösterici" değilim — problemi tespit eder, çözüm önerir, ve istersen aksiyonu kendim uygularım
- Palantir Foundry'nin OODA döngüsü mantığıyla çalışırım: Gözlem → Değerlendirme → Karar → Aksiyon`;

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
        product_code: { type: "string", description: "Ürün kodu (ör: 'BH55', 'ELT.7-11')" },
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
        sku: { type: "string", description: "Ürün kodu (varsayılan: 'ELT.7-11')" },
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
        sku: { type: "string", description: "Ürün kodu (varsayılan: 'ELT.7-11')" },
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
        sku: { type: "string", description: "Ürün kodu (varsayılan: 'ELT.7-11')" },
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
        product_code: { type: "string", description: "Ürün kodu (ör: 'ELT.7-11')" },
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
        component_code: { type: "string", description: "Bileşen kodu (ör: '27.004')" },
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
        sku: { type: "string", description: "Ürün kodu (varsayılan: 'ELT.7-11')" },
        component_code: { type: "string", description: "Belirli bir bileşen kodu ile filtrele" },
      },
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
      const sku = input.sku || "ELT.7-11";
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
      const sku = input.sku || "ELT.7-11";
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
      const sku = input.sku || "ELT.7-11";
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
      evaluateRules({ type: "stock_movement", productId: match.id })
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

      broadcastStockUpdate({
        event: "stock_update", productId: 0, productSku: code,
        movementType: "component_stock_update", quantity: newStock,
        stockLevel: { inProduction: 0, inWarehouse: newStock, totalSold: 0 },
      });

      // Proactive rules (fire-and-forget)
      evaluateRules({ type: "component_stock_update", componentCode: code })
        .then(alerts => { if (alerts.length > 0) broadcastProactiveAlert({ event: "proactive_alert", alerts }); })
        .catch(err => console.error("[rules-engine]", err));

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
      const sku = input.sku || "ELT.7-11";
      const result = await computeComponentIntelligence(sku);
      if (input.component_code) {
        result.components = result.components.filter(c => c.code === input.component_code);
      }
      return result;
    }

    default:
      return { error: `Bilinmeyen tool: ${toolName}` };
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

    // All tools: custom ontology tools + Anthropic built-in web search
    const allTools: any[] = [
      ...TOOLS,
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ];

    let response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: allTools,
      messages,
    });

    // Tool-use loop (max 10 iterations)
    let iterations = 0;
    while (response.stop_reason === "tool_use" && iterations < 10) {
      iterations++;
      const assistantContent = response.content;
      const toolUseBlocks = assistantContent.filter(
        (b: any) => b.type === "tool_use"
      );

      // Web search results come back as server_tool_use blocks — they are handled
      // automatically by Anthropic. We only need to execute our custom tools.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        const block = toolBlock as any;
        toolsUsed.push(block.name);

        // Skip web_search — Anthropic handles it server-side, results come in content
        if (block.name === "web_search") continue;

        try {
          const result = await callTool(block.name, block.input as Record<string, any>);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (err: any) {
          toolResults.push({ type: "tool_result", tool_use_id: block.id,
            content: JSON.stringify({ error: err.message || "Tool execution failed" }), is_error: true });
        }
      }

      messages.push({ role: "assistant", content: assistantContent });
      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }

      response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: allTools,
        messages,
      });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const responseText = textBlock && "text" in textBlock ? textBlock.text : "Cevap üretilemedi.";

    res.json({ response: responseText, tools_used: toolsUsed });
  } catch (err: any) {
    console.error("[agent/chat] Error:", err.status, err.message, err.error?.message);
    const msg = err.error?.message || err.message || "AI Agent hatası";
    res.status(err.status || 500).json({ error: msg });
  }
});

export default router;
