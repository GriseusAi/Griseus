# 03 — Ontology & Agents

## First Principles — Bileşen × Miktar × Süre Üçgeni

Çukurova Isı'nın matematiksel indirgemesi:

```
       Bileşen (X)
           ●
          / \
         /   \
   AI Agent  AI Agent
       /       \
      /         \
     ●───────────●
   Miktar (Y)  Süre (Z)
        AI Agent

    [Orchestrator merkezde]
```

**Bir cihaz** = Bileşenler × Her bileşenin miktarı × Her bileşenin (sezonsal) tükenme süresi

Üç eksen, her sorun bu üç boyutun kesişiminde bir nokta. AI agent'lar köşeler arasında, boyutlar arası ilişkileri modelliyor:

- **Miktar ↔ Süre** Agent: "Bu kadar stok ne kadar yeter?" (forward-walk / depletion)
- **Süre ↔ Bileşen** Agent: "Bu tarihe kadar hangi bileşen biter?"
- **Bileşen ↔ Miktar** Agent: "Bu bileşenden kaç lazım?" (BOM math)

**Orchestrator** merkezde — hangi ilişki sorulduğunu okur, ilgili agent'ı tetikler, sentezler.

> **Why:** Bu organizasyon şeması (kim ne yapar) DEĞİL, fizik (problem hangi boyutta yaşıyor) modeli. Soruyu indirger, rolleri bölmüyor. Cross-product genelleme doğal: aynı üçgen tüm ürünler için.

## Harf Eşleşmesi (KİLİTLİ — 2026-04-14)

- **X = Bileşen** (üst köşe) — reçete/BOM
- **Y = Miktar** (sol-alt) — stok seviyesi
- **Z = Süre** (sağ-alt) — sezonsallık/zaman

Eski (X=Miktar, Y=Süre, Z=Bileşen) **GEÇERSİZ**. Yeni rollout planları yeni harflerle anlatılır.

### Z'nin Kavramsal Güncellemesi (KRİTİK)

Z artık "ürün sezonsallığı" değil, **"bileşen-bazlı dinamik tükenme süresi"**.

Plus Kablo 50 cihazda kullanılıyorsa, Plus Kablo'nun tükenme tarihi = 50 cihazın aylık talep çarpanlarının BİLEŞKESİ. Tek cihazın sezonsallığı değil, havuzun toplam yükü.

Geleneksel ERP (Netsis, SAP) bunu YAPAMAZ — lookup tablo statiktir, runtime'da 50-cihaz çarpan toplamı hesaplayamaz, ters yön (bileşen→hangi cihazlar) yoktur. **Griseus'un asıl moat'ı tam burası.**

## Multi-Agent v2 (Tükenme / Yapı / Risk / Aksiyon)

`agent-multi-v2.ts` — `/api/v1/agent/multi/v2/chat`. v0 (`/agent/chat`) ve v1 (`/agent/multi/chat`) escape hatch olarak yan yana yaşar.

### Tool bölüşümü v2 (35+)

| Domain | Eksen | Tool sayısı | Örnek tool'lar |
|--------|-------|-------------|----------------|
| **Tükenme** | Y × Z | 6 | `get_seasonal_intelligence`, `simulate_production`, `what_if_analysis`, `check_stock_alerts`, `simulate_order_fulfillment`, `get_stock_movement_history` |
| **Yapı** | Y × X | 6 | `get_bom_tree`, `get_production_capacity`, `get_live_stock_levels`, `get_component_intelligence`, `get_cross_product_analysis`, `list_products` |
| **Risk** | Z × X | 5+ | `get_intelligence_engine`, `get_validation_dashboard`, `get_outcome_dashboard`, `get_adaptive_profile`, `get_token_value_metrics`, `get_twin_health_dashboard`, `list_drift_alerts` |
| **Aksiyon** | üçgen DIŞI | 9+ | `create_stock_movement`, `update_component_stock`, `create_purchase_suggestion`, `create_custom_rule`, `list_custom_rules`, `toggle_custom_rule`, `get_audit_trail`, `get_import_guide`, `create_decision`, `promote_to_opportunity`, `promote_to_work_order`, `complete_work_order`, `run_simulation_pipeline` |

### Mode System

| Mod | Model | Thinking | Iter | Wall-clock | Self-critique |
|-----|-------|----------|------|------------|---------------|
| fast | Sonnet | Yok | 2 | 30s | Yok |
| normal | Sonnet | Yok | 3+4 | 60s | Yok |
| research | Opus | 4K+12K | 5+6 | 180s | Var (conditional, kritik regex) |
| visual | Sonnet | Yok | 3+4 | 60s | Yok (Mermaid prompt) |

**Default: normal.**

### Manyak Mode (research) Detayları

- Model: `claude-opus-4-20250514` (sabit, env override yok)
- Extended thinking budgets: sub-agent 4K, orchestrator 12K, self-critique 16K
- Iter caps: SUBAGENT_MAX_ITER=5, ORCHESTRATOR_MAX_ITER=6, WALL_CLOCK=180s
- max_tokens: sub-agent 8K, orchestrator 16K
- Sub-agent prompts "DERİN ANALİZ" — karakter limiti yok
- Orchestrator stratejist kimliği: çelişki bul, örtük risk yakala, NEDEN ve EĞER OLMAZSA NE OLUR boyutları
- Conditional self-critique: `CRITICAL_QUERY_REGEX` (kritik|acil|risk|tehlike|tüken|...) tetikleyince ikinci Opus çağrısı
- Prompt caching: system blocks array-form, cache_control ephemeral on static prompts + last tool — input cost ~%70 azalır
- `createMsg()` helper: `messages.stream()` altında — 10dk non-streaming SLA bypass

## ZEKA SEVİYESİ (Agent Cevap Standardı)

CEO Agent "stokta X var, Y üretilebilir" gibi sığ rapor vermeMEli. Her stok sorusunda en az 4-5 tool kullanmalı:

1. **Mevsimsel bağlam** — hangi ay, pik ne zaman
2. **Darboğaz derinliği** — tükenme tarihi, tedarik süresi
3. **Zamanlama stratejisi** — tarih + miktar bazlı üretim planı
4. **Finansal etki** — maliyet, opportunity cost
5. **Karşılaştırmalı analiz** — diğer ürünlerle

**Doğru örnek:** "Mayıs'ta 15 adet/gün üret, Haziran'da 12'ye düşür, Ağustos pikine 450 adetle gir" — tarih, miktar, neden, hepsi var.

**RAG/ADM context'e ASLA karakter limiti koyma** — domain knowledge agent'ın zekasının kaynağı. System prompt kısa (800 token), RAG/ADM dolu kalır.

## Cross-Product Octopus (1000-Cihaz Rollout)

Aynı bileşen (vida, o-ring, reflektör vb.) birden fazla üründe kullanılıyor. 1000 cihaza ölçeklendiğinde:
- Bileşen A hem Cihaz X hem Cihaz Y'de gerekli
- Önümüzdeki ay X pik yapıyorsa A ona öncelik vermeli
- Ama Y'yi de tamamen görmezden gelmemeli
- Bu permütasyon + kombinasyon problemi — insan yapamaz

### Rollout Sırası (her batch)

1. **X yatay** — her cihazın BOM'u sırayla Griseus'a döşenir
2. **Y.1 yatay** — her cihazın stok durumu cihaz-bazlı girilir (Çukurova zihinsel modeline saygı)
3. **Y.2 cross-binding** — aynı bileşen N cihazda kullanılıyorsa Griseus'ta TEK havuzda birleştirilir (örn. Plus Kablo 50 cihazda → tek stok kaydı, 50 referans). **Octopus'un kalbi.**
4. **Z dikey** — her cihaz için son 3 yıl satış verisi referans alınarak EWMA çarpanları hesaplanır. **Z YATAY GENELLENEMEZ** — her cihazın sezonsallığı kendine özel.
5. **Validation** — batch'i "tamam" demeden önce 5 kontrol:
   - Cross-product audit (Y.2 doğrulaması)
   - Tükenme matematiği (havuz toplam yük, tek cihaz değil)
   - Kapasite hesabı (yeni cihaz `/sihir` darboğaz göstermeli)
   - BOM tree render (`/stok/urun/:sku`)
   - Sezonsallık çarpanı (1.0 değil, gerçek aylık değerler)
   - 1 tane bile geçmezse → batch DURUR, root cause bul

### Bileşen Normalizasyonu

Çukurova'da kodlama disiplini var — aynı bileşen kaç cihazda olursa olsun aynı kodla geçer. Y.2 cross-binding **otomatik SQL JOIN** ile çalışır, fuzzy matching gerekmez.

`bom_items.component_code` UNIQUE constraint **KALDIRILDI**, `UNIQUE(parent_product_sku, component_code)` aktif. Octopus'un teknik şartı.

### Cold-Start Yan Etkisi

Yeni cihaz eklendiğinde, bileşenlerinin %80'i havuzda zaten varsa Z'leri "bedava" gelir (transfer). Onboarding süresi dramatik kısalır.
