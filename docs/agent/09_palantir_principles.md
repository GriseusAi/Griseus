# 09 — Palantir Principles (Reference)

> Griseus'un mimari kararlarının kaynağı. Tartışmalı kararlarda buraya geri dön.

## Octopus Architecture (Core)

**1 central brain + independent arms with their own neural processing.**

Brain entire lifecycle boyunca **UNIFIED AWARENESS** sürdürür.

> "Independent arms executing specialized tasks, coordinated by unified intelligence, achieving outcomes impossible through siloed efforts alone."

> "A faster hamster wheel is still a hamster wheel" — linear improvement ≠ transformational change.

### Griseus'a Uyarlama

- Yeni ürün = veri ekleme, kod değişikliği SIFIR
- Tüm motorlar (intelligence, rules, what-if, agent, seasonality) aynı beyin tarafından koordineli
- Stok değişimi → TÜM kollar anında güncellenir (correction propagation)
- Agent tüm ürünleri biliyor, tool'lar SKU-agnostic

## 5 Pillars (PDF: "0 to 1 framework")

### 1. Contextual Architecture

Central brain coordinates all arms. Not siloed teams producing siloed outputs. **Every arm shares context with the brain.**

### 2. Continuous Validation

NOT a binary gate at the end. Validation is a **continuous feedback mechanism integrated THROUGHOUT the lifecycle**. Metrics update continuously.

Griseus: Rules engine 10 kural, validation_alerts kalıcı, octopus-chain 9-katman post-audit, twin-health drift detection.

### 3. Correction Propagation

Bir issue bulunduğunda, fix **TÜM kollara anında yayılır**. "Enterprises get feedback in minutes, not weeks."

Griseus: `server/lib/correction-propagation.ts` — stok değişimi tüm motorlara WS broadcast.

### 4. Deployment Flexibility — AI at Multiple Levels

| Level | Görev | Griseus karşılığı |
|-------|-------|-------------------|
| **Pipeline AI** | Otomatik translation, matching, enrichment | Smart import, SDDI auto-mapping (levenshtein + TR/EN alias) |
| **Function AI** | SME workflows via natural language | Custom rules NL parser, scenario branching |
| **Interpretation AI** | Structured info from unstructured | Excel BOM 3-kategori parser, Excel adapter |
| **Agent AI** | Conversational interface | CEO Agent multi-v2 (Tükenme/Yapı/Risk/Aksiyon) |

### 5. Beyond Migration: Operational Intelligence

Real-time visibility, AI recommendations, **model impact BEFORE execution**.

Griseus: What-if engine, scenario branching (`POST /scenarios/:id/simulate`), simulation pipeline (Vertex 7-step).

## OAG > RAG (Ontology-Augmented Generation)

| | RAG | OAG (Griseus) |
|---|---|---|
| Erişim | Documents | Structured ontology objects |
| Kapasite | Read | Read + Write (action layer) |
| Tools | LLM only | LLM + deterministic logic (forecasters, optimizers) |

Griseus pgvector RAG vardır (agent_memory) AMA esas zeka kaynağı ontology + tool'lar.

## OODA Loop

**Observe → Orient → Decide → Act**

4 fazın hepsi **TEK platformda** (rakipler dashboard/BI/ERP arasında bölüyor).

| Faz | Griseus |
|-----|---------|
| Observe | `/sihir`, `/twin-health`, validation_alerts |
| Orient | Multi-agent v2 analiz, scenario simulate |
| Decide | Decision Loop (`/loop` Decisions sekmesi) |
| Act | Action layer: write-back tools, work orders |

**"Closing the loop = the differentiator vs dashboards."**

## Action Layer

Insight ve action **AYNI INTERFACE'TE**, zero distance between seeing a problem and fixing it.

- Same actions available to humans AND AI agents
- Write-back to source systems via webhooks/exports
- Griseus: `create_stock_movement`, `update_component_stock`, `create_purchase_suggestion`, `create_decision`, `promote_to_opportunity`, `promote_to_work_order`, `complete_work_order`

## 3-Layer Ontology

| Layer | Role |
|-------|------|
| **Semantic** | Real-world objects (SKU, supplier, machine) as first-class entities with properties + relationships |
| **Kinetic** | Actions bound to objects — not just view, but "create PO", "reallocate inventory", write-back to ERP |
| **Dynamic** | Business rules, security policies, lifecycle state transitions |

Griseus: `ontology_object_types` + `ontology_link_types` + `ontology_action_types` + `ontology_function_types` (auto-seed on boot).

## Real Customer Results (Reference)

- Fortune 100: $100M/yr savings, BOM optimization live in 5 days
- Airbus: 33% faster A350 delivery
- BP: 57% production cost reduction
- Wendy's: supply crisis 1 day → minutes
- Global retailer: 50% reduction in stockouts

> Magic değil "showing data" — magic = collapsing distance between insight and action to ZERO.
> Tek SKU = 360° hub: BOM, suppliers, production, quality, finance, demand + action buttons.

## Vertex Pattern (Oil & Gas → HVAC)

Vertex digital twin pattern Çukurova HVAC'a uyarlandı (2026-04-27 onaylı playbook).

8 pillar referansı:
- Asset hierarchy (plant → line → wc → machine → operator)
- Time atom (shifts, batches, production_runs)
- Quality (scrap_reasons, energy_meters)
- Supplier
- Decision chain (decisions → opportunities → work_orders)
- Energy
- Simulation (7-step pipeline)
- Twin health (planned vs actual variance + drift)

Detay: `/Users/gurkanduruak/Desktop/GRISEUS_PALANTIR_PLAYBOOK.md`

## Palantir Foundry Pattern Library

PDF okuma 2026-04-30 — Foundry 5 katman + AIP octopus + Vertex/Workshop/Decision Orchestration patterns.

Reference dosyalar Çukurova özel implementasyonu için adapt edildi:
- **Vertex** → digital twin variance tracking (`/twin-health`)
- **Workshop** → drag-drop widget builder (`/workshop`)
- **Decision Orchestration** → closed-loop (`/loop`)

## 0-to-1 Long-Term Vision

Mevcut iş = 1-to-n (Palantir modelini KOBİ'ye indirgemek).

Uzun vade = 0-to-1: **Soul Layer** — humanoid robotlara cognitive twin (usta sezgisi) aktaran platform. Body=Tesla, Brain=OpenAI, **Soul=Griseus**.

Aile şirketlerinin %70'i ikinci nesil geçişinde başarısız olur — asıl neden tacit knowledge transferinin imkansızlığı. Griseus bunu çözer; ağ etkisi monopoly mekanizmasıdır.

Şu an Çukurova proof-of-concept. Vizyon arka planda.
