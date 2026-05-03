# 02 — Architecture

## Tek Cümle

Griseus = **3 katmanlı stack** (AIP + Ontology + Foundry) üzerine **Octopus mimarisi** (1 beyin + bağımsız kollar). Yeni ürün eklemek **sıfır kod değişikliği** demek olmalı.

## Stack

```
React 18 + TypeScript + Wouter + TanStack Query
            │
            ▼
Express + Drizzle ORM + PostgreSQL + pgvector
            │
            ▼
Anthropic Claude API (Sonnet/Opus, extended thinking)
```

Deploy: Vercel auto-deploy on `main` push.

## 3 Katmanlı Stack (Palantir Paraleli)

```
┌─────────────────────────────────────────────────────────────┐
│ AIP LAYER — Multi-agent v2 + 4 mod                          │
│   • CEO Agent: Tükenme / Yapı / Risk / Aksiyon sub-agents   │
│   • Modes: fast(Sonnet) / normal(Sonnet) / research(Opus +  │
│     extended thinking) / visual(Mermaid)                    │
│   • Chat history DB persistence, fullscreen modal           │
│   • Endpoint: POST /api/v1/agent/multi/v2/chat              │
├─────────────────────────────────────────────────────────────┤
│ ONTOLOGY LAYER — Formal types                               │
│   • Object types, Link types, Action types, Function types  │
│   • Bileşen × Miktar × Süre üçgeni axiomatik                │
│   • Auto-seed on boot                                       │
│   • Endpoint: GET /api/ontology/graph                       │
├─────────────────────────────────────────────────────────────┤
│ FOUNDRY LAYER — Data + operation                            │
│   • Data Lineage (parent chain DAG, otomatik audit)         │
│   • Pipeline Scheduling (cron 60s tick)                     │
│   • Data Versioning (auto snapshot pre-import, diff,        │
│     rollback)                                               │
│   • Scenario Branching (named what-if, simulate, apply)     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  PostgreSQL (single source)
```

## Octopus — Beyin + Kollar

### Beyin (Central Brain)

- **PostgreSQL DB** — tek kaynak: `products`, `bom_items`, `component_stock`, `sales_history`, `seasonal_indices`, `stock_levels`, `validation_alerts`, `outcome_tracking`, ve FAZ 0+ atom tabloları
- `server/lib/constants.ts` — merkezi sabitler
- `server/lib/seasonal-constants.ts` — mevsimsel sabitler + `getMonthlyDemandForSku()` (DB'den dinamik)

### Kollar (Independent Arms)

| Kol | Dosya | Görev |
|-----|-------|-------|
| Intelligence Engine | `server/routes/intelligence.ts` | `computeComponentIntelligence(sku)` — burn rate, stockout, urgency |
| Rules Engine | `server/rules-engine.ts` | `evaluateRules({sku})` — 10 kural, proaktif uyarı |
| Dynamic Seasonality | `server/lib/dynamic-seasonality.ts` | EWMA (λ=0.3), mevsimsel indeksler, `initAllProducts()` |
| Adaptive Thresholds | `server/lib/adaptive-thresholds.ts` | Bayesian davranış öğrenme, dinamik eşikler |
| What-If Engine | `server/lib/whatif-engine.ts` | `simulateWhatIf(scenario, sku)` — sanal simülasyon |
| Outcome Learning | `server/lib/outcome-engine.ts` | Bayesian güven skoru, tahmin doğrulama |
| Impact Propagation | `server/lib/impact-engine.ts` | Ring buffer, before/after snapshot, cascade chain |
| Token Value Tracker | `server/lib/token-value-tracker.ts` | V/T ratio, OAR |
| CEO Agent | `server/routes/agent.ts` | 35+ tool, product-agnostic prompt, `buildLiveSnapshot()` |
| Correction Propagation | `server/lib/correction-propagation.ts` | Stok değişimi → tüm kollar güncellenir |
| Pipeline Scheduler | `server/lib/pipeline-scheduler.ts` | 60s interval, cron, auto-start on boot |
| Simulation Pipeline | `server/lib/simulation-pipeline.ts` | Vertex 7-step orchestrator (DSE → Forecast → Plan → BOM → Gap → Impact → Outcome) |
| Twin Health | `server/lib/twin-health.ts` | 5 metric collector, drift detection |
| Decision Loop | `server/lib/decision-loop.ts` | Decision → Opportunity → WorkOrder → Outcome closed-loop |
| Ops Monitoring | `server/lib/ops-monitoring.ts` | Tier alerts (operator → supervisor → plant_manager) |
| SDDI Connector | `server/lib/sddi-connector.ts` | Auto-mapping (levenshtein + TR/EN alias) |
| Workshop | `server/lib/workshop.ts` | Workspace + 5 widget type, ALLOWED_TABLES whitelist |

### Kritik API Endpoint'ler

**Stok / BOM / Intelligence:**
- `GET /api/products` — kayıtlı ürünler
- `GET /api/bom/:sku/stock` — BOM + stok (tier-aware)
- `GET /api/bom/:sku/production-capacity` — kapasite + darboğaz
- `GET /api/bom/:sku/intelligence` — bileşen istihbaratı
- `GET /api/bom/:sku/simulate?quantity=N` — üretim simülasyonu

**Planlama:**
- `GET /api/planning/forecast/:sku` — aylık ortalamalar
- `GET /api/planning/predict/:sku` — ileriye dönük tahmin

**Agent:**
- `POST /api/v1/agent/chat` — CEO Agent (v0)
- `POST /api/v1/agent/multi/v2/chat` — Multi-agent v2 (default)

**Ontology:**
- `GET /api/ontology/graph` — full type registry
- `GET /api/ontology/object-types/:id/objects` — atomları listele

**Foundry:**
- `GET /api/foundry/lineage/:entity/:entityId`
- `POST /api/foundry/snapshots` (pre-mutation snapshot)
- `POST /api/foundry/scenarios/:id/simulate` / `apply` / `compare`

**Pipeline:**
- `POST /api/pipeline/run` — Vertex 7-step
- `GET /api/pipeline/runs` / `runs/:id`

**Twin / Loop / Ops / SDDI / Workshop:**
- `/api/twin-health/{compute,dashboard,heatmap,drift-alerts}`
- `/api/loop/{decisions,opportunities,work-orders,report}`
- `/api/ops/{alerts,dashboard,plant-summary,process-flow}`
- `/api/connectors/{run,suggest-field-mappings}`
- `/api/workspaces`

## Frontend Sayfalar

| Route | Sayfa | Notlar |
|-------|-------|--------|
| `/` | Stok Durumu | ProductSelector, sadece tier=1 |
| `/stok/urun/:sku` | Ürün İstihbaratı | URL param + global SKU context |
| `/sihir` | Intelligence Engine | ProductSelector |
| `/ontology` | Strategy Canvas | Slash komut bar, overlay panel YASAK |
| `/bh-ontology` | BH Hierarchy | Tier 1→2→2C drill-down referans implementasyon |
| `/planlama` | Prediktif Planlama | Excel import |
| `/pipeline` | Pipeline Runs | Vertex timeline UI |
| `/twin-health` | Digital Twin Health | Heatmap + drift alerts |
| `/loop` | Decision Loop | 4 sekme: Decisions / Opportunity Kanban / Work Orders / Loop Report |
| `/operations` | Ops Monitoring | Tier dashboard + alarm panel |
| `/sddi` | SDDI Connector | Auto-mapping UI |
| `/workshop` | Workspace Builder | Drag-drop widget |

## Yeni Ürün Ekleme Prosedürü

**KURAL: Sadece veri. Sıfır kod değişikliği.**

1. `server/seed.ts`'e yeni fonksiyon ekle (ör. `seedXYZ123`)
2. `BOM_DATA` dizisi (kod, ad, miktar, birim, tier)
3. `STOCK_DATA` objesi (kod → stok)
4. `MONTHLY` satış dizisi (12 ay × 3 yıl)
5. `seedDatabase()` içinden çağır
6. `git push origin main` → Vercel deploy → otomatik seed → tüm sayfalar otomatik çalışır
7. Mevsimsel indeksler `initAllProducts()` ile otomatik hesaplanır

**Mevcut path daha uygunsa:** `script/onboard-batch.ts --dir=<excel_klasoru> --base=https://griseus.io`

### YASAK

- Hardcoded SKU ekleme (MAIN_SKU dışında)
- Ürüne özel kod yolu yazma
- Motor dosyalarını (intelligence, rules, whatif vb.) ürün için modifiye etme
- Agent prompt'una ürün bilgisi hardcode etme
- Yeni motor eklemek isterken mevcut motorlardan birinin kapsamını ürün-spesifik yapmak

## DB Tabloları (kategori bazlı)

**Stok temel:** products, bom_items, component_stock, sales_history, seasonal_indices, stock_levels, stock_movements

**Validation/Rules:** validation_alerts, custom_rules, rule_evaluations

**Foundry:** data_lineage, audit_log, pipeline_definitions, pipeline_runs, data_snapshots, scenarios, scenario_overrides

**Ontology:** ontology_object_types, ontology_link_types, ontology_action_types, ontology_function_types

**Agent:** chat_sessions, chat_messages, agent_memory (pgvector), outcome_tracking, token_metrics, tenant_profiles, alert_interactions

**FAZ 0+ atom layer (operational):** plants, lines, work_centers, machines, operators, shifts, batches, production_runs, scrap_reasons, energy_meters, simulation_pipeline_runs, digital_twin_divergence, drift_alerts, decisions, opportunities, **griseus_work_orders** (namespaced — bkz. 08_deploy_safety.md), ops_alerts, connectors, connector_runs, field_mappings, workspaces, workspace_widgets

> **Çakışma çözümü:** Legacy bir `work_orders` tablosu vardı. Foundry konvansiyonu: legacy tablo dokunulmaz, yeni tablo `griseus_` prefix alır. Drizzle export ismi (`workOrders`) ve canvas apiName (`WorkOrder`) korunur — sadece `pgTable("griseus_work_orders", {...})` backing'i değişir.
