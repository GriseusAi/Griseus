import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, serial, numeric, jsonb, index, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════
// Custom pgvector type for Drizzle
// ═══════════════════════════════════════════════════════════

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value.replace(/[\[\]]/g, "").split(",").map(Number);
  },
});

// ═══════════════════════════════════════════════════════════
// GRISEUS — Minimal Schema (8 tables)
// Only code references — DB tables are NOT dropped
// ═══════════════════════════════════════════════════════════

// --- Auth ---

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(),
  name: text("name"),
  companyName: text("company_name"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const passwordResetCodes = pgTable("password_reset_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
});

// --- Products ---

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  sku: text("sku"),
  name: text("name").notNull(),
  category: text("category"),
  baseUnitTimeMin: numeric("base_unit_time_min"),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// --- Production Lines ---

export const productionLines = pgTable("production_lines", {
  id: serial("id").primaryKey(),
  facilityId: integer("facility_id"),
  name: text("name").notNull(),
  type: text("type"),
  workerCount: integer("worker_count"),
  capacityUnitTimeMin: numeric("capacity_unit_time_min"),
  currentUnitTimeMin: numeric("current_unit_time_min"),
  dailyHours: numeric("daily_hours").default("9"),
  monthlyDays: integer("monthly_days").default(22),
  productionMonths: integer("production_months").default(10),
  status: text("status").default("active"),
});

export type ProductionLine = typeof productionLines.$inferSelect;

// --- Stock (PoC) ---

export const stockLevels = pgTable("stock_levels", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull().unique(),
  inProduction: integer("in_production").notNull().default(0),
  inWarehouse: integer("in_warehouse").notNull().default(0),
  totalSold: integer("total_sold").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type StockLevel = typeof stockLevels.$inferSelect;

export const stockMovementsV2 = pgTable("stock_movements_v2", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  movementType: text("movement_type").notNull(),
  quantity: integer("quantity").notNull(),
  previousState: jsonb("previous_state"),
  note: text("note"),
  createdBy: text("created_by").default("üretim_şefi"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type StockMovementV2 = typeof stockMovementsV2.$inferSelect;

// --- BOM (Ürün Ağacı / Reçete) ---

export const bomItems = pgTable("bom_items", {
  id: serial("id").primaryKey(),
  parentProductSku: text("parent_product_sku").notNull(),
  componentCode: text("component_code").notNull(),
  componentName: text("component_name").notNull(),
  requiredQuantity: numeric("required_quantity").notNull(),
  unit: text("unit").notNull(),
  tier: integer("tier").notNull(),
  parentComponentCode: text("parent_component_code"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("bom_sku_component_idx").on(table.parentProductSku, table.componentCode),
  index("bom_component_idx").on(table.componentCode),
]);

export const insertBomItemSchema = createInsertSchema(bomItems).omit({ id: true, createdAt: true });
export type InsertBomItem = z.infer<typeof insertBomItemSchema>;
export type BomItem = typeof bomItems.$inferSelect;

// --- Bileşen Stokları ---

export const componentStock = pgTable("component_stock", {
  id: serial("id").primaryKey(),
  componentCode: text("component_code").notNull().unique(),
  currentStock: numeric("current_stock").notNull(),
  unit: text("unit").notNull(),
  lastCountedAt: timestamp("last_counted_at").defaultNow(),
  lastCountedBy: text("last_counted_by").default("netsis_import"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertComponentStockSchema = createInsertSchema(componentStock).omit({ id: true, updatedAt: true });
export type InsertComponentStock = z.infer<typeof insertComponentStockSchema>;
export type ComponentStock = typeof componentStock.$inferSelect;

// --- Satın Alma Önerileri (AI Agent tarafından oluşturulur) ---

export const purchaseSuggestions = pgTable("purchase_suggestions", {
  id: serial("id").primaryKey(),
  componentCode: text("component_code").notNull(),
  componentName: text("component_name").notNull(),
  suggestedQuantity: numeric("suggested_quantity").notNull(),
  unit: text("unit").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | ordered
  createdBy: text("created_by").default("ai_agent"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PurchaseSuggestion = typeof purchaseSuggestions.$inferSelect;

// --- Stok Transferleri (L6 ontology action — tier/depo arası hareket) ---

export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  componentCode: text("component_code").notNull(),
  componentName: text("component_name"),
  fromLocation: text("from_location").notNull(),
  toLocation: text("to_location").notNull(),
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull().default("AD"),
  status: text("status").notNull().default("pending"), // pending | in_transit | completed | cancelled
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("stock_transfers_component_idx").on(table.componentCode),
  index("stock_transfers_status_idx").on(table.status),
]);

export type StockTransfer = typeof stockTransfers.$inferSelect;

// --- Satış Geçmişi (Tarihsel Veri — Excel/Netsis import) ---

export const salesHistory = pgTable("sales_history", {
  id: serial("id").primaryKey(),
  productSku: text("product_sku").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  quantitySold: integer("quantity_sold").notNull(),
  revenue: numeric("revenue"), // optional — TL cinsinden
  source: text("source").notNull().default("excel"), // excel | netsis
  importedAt: timestamp("imported_at").defaultNow(),
  notes: text("notes"),
});

export const insertSalesHistorySchema = createInsertSchema(salesHistory).omit({ id: true, importedAt: true });
export type InsertSalesHistory = z.infer<typeof insertSalesHistorySchema>;
export type SalesHistory = typeof salesHistory.$inferSelect;

// --- Üretim Planları (Prediktif Planlama) ---

export const productionPlans = pgTable("production_plans", {
  id: serial("id").primaryKey(),
  productSku: text("product_sku").notNull(),
  targetYear: integer("target_year").notNull(),
  targetMonth: integer("target_month").notNull(), // 1-12
  forecastedDemand: integer("forecasted_demand").notNull(), // aylık ortalamadan hesaplanan tahmin
  plannedProduction: integer("planned_production").notNull(), // üretilecek miktar
  status: text("status").notNull().default("draft"), // draft | approved | in_progress | completed
  componentGaps: jsonb("component_gaps"), // eksik komponentler JSON
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProductionPlanSchema = createInsertSchema(productionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductionPlan = z.infer<typeof insertProductionPlanSchema>;
export type ProductionPlan = typeof productionPlans.$inferSelect;

// --- Knowledge Base (RAG — pgvector) ---

export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  category: text("category").notNull(), // bom, production_rules, supplier, competitor, operator_notes, sales
  metadata: jsonb("metadata"),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;

// --- Demand Forecast (Aylık Satış Ortalamaları) ---

export const demandForecast = pgTable("demand_forecast", {
  id: serial("id").primaryKey(),
  productSku: text("product_sku").notNull(),
  month: integer("month").notNull(),           // 1-12
  avgMonthlySales: numeric("avg_monthly_sales").notNull(),
  yearsAveraged: integer("years_averaged").default(3),
  source: text("source").default("historical"), // historical | adjusted | ml_forecast
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DemandForecast = typeof demandForecast.$inferSelect;

// --- Validation Alerts (Continuous Validation Pipeline) ---

export const validationAlerts = pgTable("validation_alerts", {
  id: serial("id").primaryKey(),
  alertId: varchar("alert_id", { length: 64 }).notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull(), // critical | warning | info
  title: text("title").notNull(),
  message: text("message").notNull(),
  rootCause: jsonb("root_cause"), // ReasoningStep[] as JSON
  componentCode: text("component_code"),
  productSku: text("product_sku"),
  suggestedAction: text("suggested_action"),
  validated: boolean("validated").default(false),
  validationNote: text("validation_note"),
  outcome: text("outcome"), // true_positive | false_positive | unresolved
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export type ValidationAlert = typeof validationAlerts.$inferSelect;

// --- Custom Rules (Natural Language Rules Engine) ---

export const customRules = pgTable("custom_rules", {
  id: serial("id").primaryKey(),
  nlDescription: text("nl_description").notNull(), // "Kış aylarında güvenlik stoku %50 artır"
  parsedRule: jsonb("parsed_rule").notNull(), // Structured rule from NL parsing
  ruleType: text("rule_type").notNull(), // threshold | seasonal_modifier | trigger_action | monitor
  severity: text("severity").notNull().default("warning"), // critical | warning | info
  isActive: boolean("is_active").notNull().default(true),
  lastTriggered: timestamp("last_triggered"),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdBy: text("created_by").notNull().default("ceo_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CustomRule = typeof customRules.$inferSelect;

// --- Audit Log (Data Lineage — her değişikliğin izi) ---

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(), // component_stock | stock_level | bom_item | purchase_suggestion | custom_rule
  entityId: text("entity_id").notNull(), // ilgili kaydın ID'si veya kodu
  action: text("action").notNull(), // create | update | delete | import | undo
  field: text("field"), // değişen alan (ör. "currentStock", "status")
  previousValue: text("previous_value"), // eski değer
  newValue: text("new_value"), // yeni değer
  reason: text("reason"), // neden değişti
  actor: text("actor").notNull().default("system"), // kim yaptı (üretim_şefi, ceo_agent, rules_engine, import)
  metadata: jsonb("metadata"), // ek bağlam (ör. movement_id, rule_id)
  createdAt: timestamp("created_at").defaultNow(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;

// --- Outcome Tracking (OLE — Outcome Learning Engine) ---

export const outcomeTracking = pgTable("outcome_tracking", {
  id: serial("id").primaryKey(),
  predictionId: varchar("prediction_id", { length: 64 }).notNull(),
  source: text("source").notNull(), // alert | purchase_suggestion | what_if | agent_recommendation
  sourceId: text("source_id").notNull(), // alert_id veya suggestion_id
  ruleType: text("rule_type"), // hangi kural tetikledi
  componentCode: text("component_code"),
  productSku: text("product_sku"),
  predictedOutcome: text("predicted_outcome").notNull(), // ne tahmin edildi (Türkçe)
  predictedValue: jsonb("predicted_value"), // { metric, threshold, direction, magnitude }
  confidence: numeric("confidence").notNull().default("0.5"), // başlangıç güven skoru
  deadline: timestamp("deadline").notNull(), // ne zamana kadar gerçekleşmeli
  checkIntervals: jsonb("check_intervals"), // [7, 14, 30] gün sonra kontrol
  actualOutcome: text("actual_outcome"), // gerçekte ne oldu
  actualValue: jsonb("actual_value"), // { metric, measuredValue }
  outcomeStatus: text("outcome_status").notNull().default("pending"), // pending | verified_correct | verified_incorrect | expired | partially_correct
  valueGenerated: numeric("value_generated"), // TL cinsinden üretilen değer
  tokensConsumed: integer("tokens_consumed"), // bu tahmin için harcanan token
  verifiedAt: timestamp("verified_at"),
  verifiedBy: text("verified_by"), // system | user | auto_check
  metadata: jsonb("metadata"), // snapshot of system state at prediction time
  createdAt: timestamp("created_at").defaultNow(),
});

export type OutcomeTrack = typeof outcomeTracking.$inferSelect;

// --- Token Metrics (TVT — Token Value Tracker) ---

export const tokenMetrics = pgTable("token_metrics", {
  id: serial("id").primaryKey(),
  interactionId: varchar("interaction_id", { length: 64 }).notNull(),
  interactionType: text("interaction_type").notNull(), // agent_chat | alert_generated | rule_evaluated | what_if | import
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  toolsUsed: jsonb("tools_used"), // ["get_component_intelligence", "what_if_analysis"]
  queryCategory: text("query_category"), // stock_check | forecast | planning | alert_response | operational
  outcomeLinked: boolean("outcome_linked").notNull().default(false),
  outcomeId: text("outcome_id"), // FK to outcomeTracking.predictionId
  estimatedValueTL: numeric("estimated_value_tl"), // tahmini değer (TL)
  actualValueTL: numeric("actual_value_tl"), // doğrulanmış değer (TL)
  valuePerToken: numeric("value_per_token"), // actualValueTL / totalTokens
  genericBaselineTL: numeric("generic_baseline_tl"), // generic model bu soruyu çözer miydi? 0 = hayır
  ontologyAdvantageRatio: numeric("ontology_advantage_ratio"), // V/T_griseus / V/T_generic
  actor: text("actor").notNull().default("ceo_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TokenMetric = typeof tokenMetrics.$inferSelect;

// --- Tenant Profiles (ATE — Adaptive Threshold Engine) ---

export const tenantProfiles = pgTable("tenant_profiles", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().unique().default("cukurova"),
  companyName: text("company_name").notNull(),
  // Operasyonel parametreler
  avgLeadTimeDays: numeric("avg_lead_time_days").notNull().default("14"),
  leadTimeStdDev: numeric("lead_time_std_dev").notNull().default("3"),
  demandVolatility: numeric("demand_volatility").notNull().default("0.4"), // CV = σ/μ
  seasonalAmplitude: numeric("seasonal_amplitude").notNull().default("1.0"), // max_index / min_index
  // Maliyet parametreleri
  stockoutDailyCostTL: numeric("stockout_daily_cost_tl").notNull().default("2500"),
  holdingCostRate: numeric("holding_cost_rate").notNull().default("0.20"),
  // Davranıştan öğrenilen
  riskTolerance: numeric("risk_tolerance").notNull().default("0.5"), // 0=temkinli 1=risk sever
  alertResponseRate: numeric("alert_response_rate").notNull().default("0.5"), // alert'lere tepki oranı
  avgDecisionTimeMin: numeric("avg_decision_time_min").notNull().default("60"), // karar verme süresi
  // Hesaplanan adaptif eşikler (cache)
  adaptiveThresholds: jsonb("adaptive_thresholds"), // { urgencyCritical, urgencyWarning, ... }
  // Meta
  lastBehaviorUpdate: timestamp("last_behavior_update"),
  lastThresholdCalc: timestamp("last_threshold_calc"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type TenantProfile = typeof tenantProfiles.$inferSelect;

// --- Alert Interactions (ATE — kullanıcı davranış takibi) ---

export const alertInteractions = pgTable("alert_interactions", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("cukurova"),
  alertId: text("alert_id").notNull(),
  alertType: text("alert_type").notNull(),
  alertSeverity: text("alert_severity").notNull(),
  action: text("action").notNull(), // seen | dismissed | acted | escalated
  responseTimeMs: integer("response_time_ms"), // ne kadar sürede tepki verdi
  createdAt: timestamp("created_at").defaultNow(),
});

export type AlertInteraction = typeof alertInteractions.$inferSelect;

// --- Dynamic Seasonal Indices (DSE — Dynamic Seasonality Engine) ---

export const seasonalIndices = pgTable("seasonal_indices", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("cukurova"),
  productSku: text("product_sku").notNull(),
  month: integer("month").notNull(), // 0-11 (Oca=0, Ara=11)
  // Statik baseline (3 yıl ort.)
  baselineDemand: numeric("baseline_demand").notNull(),
  baselineIndex: numeric("baseline_index").notNull(),
  // EWMA dinamik değerler
  dynamicDemand: numeric("dynamic_demand").notNull(),
  dynamicIndex: numeric("dynamic_index").notNull(),
  // İstatistik
  sampleCount: integer("sample_count").notNull().default(0), // kaç yıllık veri
  stdDev: numeric("std_dev").notNull().default("0"), // talep std sapması
  lastActualDemand: numeric("last_actual_demand"), // son gerçek talep
  lastActualYear: integer("last_actual_year"), // hangi yılın verisi
  // Anomali
  anomalyDetected: boolean("anomaly_detected").notNull().default(false),
  anomalyReason: text("anomaly_reason"),
  // Meta
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SeasonalIndex = typeof seasonalIndices.$inferSelect;

// --- Agent Decision Memory (ADM) ---

export const agentMemory = pgTable("agent_memory", {
  id: serial("id").primaryKey(),
  memoryId: varchar("memory_id", { length: 64 }).notNull(),
  tenantId: text("tenant_id").notNull().default("cukurova"),
  // Sorgu
  queryText: text("query_text").notNull(),
  queryCategory: text("query_category"), // stock_check | forecast | planning | alert_response | operational
  queryEmbedding: vector("query_embedding"),
  // Cevap & araçlar
  toolsUsed: jsonb("tools_used"), // ["get_component_intelligence", ...]
  toolCount: integer("tool_count").notNull().default(0),
  recommendationMade: text("recommendation_made"), // özet öneri
  responseLength: integer("response_length").notNull().default(0),
  // Kullanıcı aksiyonu
  userAction: text("user_action"), // applied | ignored | modified | asked_more | null (henüz bilinmiyor)
  actionTimestamp: timestamp("action_timestamp"),
  // Kalite metrikleri
  qualityScore: numeric("quality_score").notNull().default("0"), // 0-1 arası
  outcomeId: text("outcome_id"), // OLE bağlantısı
  outcomeValue: numeric("outcome_value"), // TL
  // Decay
  decayWeight: numeric("decay_weight").notNull().default("1.0"), // zamanla azalır
  // Meta
  createdAt: timestamp("created_at").defaultNow(),
});

export type AgentMemoryEntry = typeof agentMemory.$inferSelect;

// ═══════════════════════════════════════════════════════════
// CHAT HISTORY — persist agent conversations for recall
// ═══════════════════════════════════════════════════════════

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull().default("Yeni Sohbet"),
  mode: varchar("mode", { length: 20 }), // fast | normal | research | visual
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id").notNull().references(() => chatSessions.id),
  role: varchar("role", { length: 10 }).notNull(), // user | assistant
  content: text("content").notNull(),
  mode: varchar("mode", { length: 20 }),
  toolsUsed: jsonb("tools_used").$type<string[]>(),
  agentsUsed: jsonb("agents_used").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// FOUNDRY LAYER 1: DATA LINEAGE — full provenance chain
// "Bu sayı nereden geldi?" sorusuna cevap
// ═══════════════════════════════════════════════════════════

export const dataLineage = pgTable("data_lineage", {
  id: serial("id").primaryKey(),
  // What changed
  entity: varchar("entity", { length: 50 }).notNull(),     // component_stock | bom_item | product | stock_level
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  field: varchar("field", { length: 50 }),                   // quantity | lead_time | price etc.
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  // Chain — where did this come from?
  sourceType: varchar("source_type", { length: 30 }).notNull(), // import | manual | agent | pipeline | rule_engine | correction
  sourceId: varchar("source_id", { length: 100 }),              // import batch ID, pipeline run ID, agent session ID
  sourceName: varchar("source_name", { length: 200 }),          // "Excel import: stok_nisan.xlsx" | "Pipeline: ERP sync" | "Agent: satın alma önerisi"
  // Upstream/downstream chain
  parentLineageId: integer("parent_lineage_id"),                // links to parent data_lineage.id — forms a DAG
  // Who and when
  actor: varchar("actor", { length: 50 }).notNull().default("system"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
});

// ═══════════════════════════════════════════════════════════
// FOUNDRY LAYER 2: PIPELINE SCHEDULING
// Otomatik veri çekme, dönüşüm, health check
// ═══════════════════════════════════════════════════════════

export const pipelineDefinitions = pgTable("pipeline_definitions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  // What does it do?
  pipelineType: varchar("pipeline_type", { length: 30 }).notNull(), // import | transform | health_check | sync
  // Schedule
  cronExpression: varchar("cron_expression", { length: 50 }),       // "0 2 * * *" = every day at 2am
  enabled: boolean("enabled").notNull().default(true),
  // Config
  config: jsonb("config").$type<Record<string, any>>(),            // source URL, file path, mappings, etc.
  // Stats
  lastRunAt: timestamp("last_run_at"),
  lastStatus: varchar("last_status", { length: 20 }),               // success | failed | running
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelineDefinitions.id),
  status: varchar("status", { length: 20 }).notNull().default("running"), // running | success | failed
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  // Results
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  errorMessage: text("error_message"),
  // Lineage link
  lineageIds: jsonb("lineage_ids").$type<number[]>(),              // data_lineage entries created by this run
  metadata: jsonb("metadata").$type<Record<string, any>>(),
});

// ═══════════════════════════════════════════════════════════
// FOUNDRY LAYER 3: DATA VERSIONING — snapshot/rollback
// Veriyi "code gibi" ele al: snapshot → diff → rollback
// ═══════════════════════════════════════════════════════════

export const dataSnapshots = pgTable("data_snapshots", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),                // "Import öncesi snapshot" | "Manual backup"
  snapshotType: varchar("snapshot_type", { length: 30 }).notNull(), // auto_pre_import | auto_pre_pipeline | manual
  // What was captured
  tables: jsonb("tables").$type<string[]>().notNull(),              // ["component_stock", "bom_items"]
  data: jsonb("data").$type<Record<string, any[]>>().notNull(),     // { component_stock: [...rows], bom_items: [...rows] }
  // Context
  triggeredBy: varchar("triggered_by", { length: 100 }),            // pipeline run ID, import session, user
  createdAt: timestamp("created_at").defaultNow(),
  // Stats
  totalRecords: integer("total_records").default(0),
  sizeBytes: integer("size_bytes").default(0),
});

// ═══════════════════════════════════════════════════════════
// FOUNDRY LAYER 4: SCENARIO BRANCHING
// What-if dalları — karşılaştır, birini seç, uygula
// ═══════════════════════════════════════════════════════════

export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | active | applied | archived
  createdBy: varchar("created_by", { length: 50 }).default("user"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Parent scenario for nested branches
  parentScenarioId: integer("parent_scenario_id"),
  // What-if results cached
  simulationResult: jsonb("simulation_result").$type<Record<string, any>>(),
});

export const scenarioOverrides = pgTable("scenario_overrides", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => scenarios.id),
  // What is being overridden
  entity: varchar("entity", { length: 50 }).notNull(),       // component_stock | bom_item | product
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  field: varchar("field", { length: 50 }).notNull(),          // quantity | lead_time | demand
  // Override value
  originalValue: text("original_value"),
  overrideValue: text("override_value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// ONTOLOGY — Formal semantic layer (Palantir-inspired)
// The heart of the system: Objects, Links, Actions, Functions
// Everything builds on top of this metadata graph
// ═══════════════════════════════════════════════════════════

// Object Types — "What exists in our world?"
// Maps to underlying DB tables but adds semantic meaning
export const ontologyObjectTypes = pgTable("ontology_object_types", {
  id: varchar("id", { length: 50 }).primaryKey(),         // "product" | "component" | "supplier"
  displayName: varchar("display_name", { length: 100 }).notNull(),
  displayNameTr: varchar("display_name_tr", { length: 100 }),  // Turkish label
  description: text("description"),
  icon: varchar("icon", { length: 10 }),                    // emoji icon
  // Backing data source
  backingTable: varchar("backing_table", { length: 100 }).notNull(), // DB table name
  primaryKeyField: varchar("primary_key_field", { length: 50 }).notNull(), // which column is the PK
  titleField: varchar("title_field", { length: 50 }),       // which column to show as title
  // Properties schema (JSON Schema for the object's properties)
  properties: jsonb("properties").$type<Record<string, OntologyProperty>>().notNull(),
  // Ontology triangle mapping
  ontologyAxis: varchar("ontology_axis", { length: 20 }),   // miktar | sure | bilesen | null
  // Status
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Link Types — "How are objects related?"
export const ontologyLinkTypes = pgTable("ontology_link_types", {
  id: varchar("id", { length: 50 }).primaryKey(),         // "product_has_component" | "component_in_stock"
  displayName: varchar("display_name", { length: 100 }).notNull(),
  description: text("description"),
  // Source → Target
  sourceObjectType: varchar("source_object_type", { length: 50 }).notNull(),
  targetObjectType: varchar("target_object_type", { length: 50 }).notNull(),
  // How to resolve the link in DB
  joinType: varchar("join_type", { length: 20 }).notNull().default("foreign_key"), // foreign_key | field_match | junction_table
  sourceField: varchar("source_field", { length: 50 }).notNull(),   // field on source table
  targetField: varchar("target_field", { length: 50 }).notNull(),   // field on target table
  junctionTable: varchar("junction_table", { length: 100 }),        // if join_type = junction_table
  // Cardinality
  cardinality: varchar("cardinality", { length: 20 }).notNull().default("one_to_many"), // one_to_one | one_to_many | many_to_many
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Action Types — "What can be done?" (the kinetic layer)
export const ontologyActionTypes = pgTable("ontology_action_types", {
  id: varchar("id", { length: 50 }).primaryKey(),         // "create_stock_movement" | "create_purchase_suggestion"
  displayName: varchar("display_name", { length: 100 }).notNull(),
  displayNameTr: varchar("display_name_tr", { length: 100 }),
  description: text("description"),
  // Which object type does this action affect?
  targetObjectType: varchar("target_object_type", { length: 50 }).notNull(),
  // Action semantics
  actionCategory: varchar("action_category", { length: 20 }).notNull(), // create | update | delete | trigger
  // Parameters schema (what inputs does this action need?)
  parameters: jsonb("parameters").$type<Record<string, OntologyProperty>>().notNull(),
  // Which agent tool implements this?
  agentToolName: varchar("agent_tool_name", { length: 50 }),  // maps to callTool dispatch
  // Safety
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Function Types — "What can be computed?" (derived intelligence)
export const ontologyFunctionTypes = pgTable("ontology_function_types", {
  id: varchar("id", { length: 50 }).primaryKey(),         // "depletion_calc" | "risk_score" | "capacity_calc"
  displayName: varchar("display_name", { length: 100 }).notNull(),
  displayNameTr: varchar("display_name_tr", { length: 100 }),
  description: text("description"),
  // Which object type does this function compute over?
  sourceObjectType: varchar("source_object_type", { length: 50 }).notNull(),
  // What does it return?
  returnType: varchar("return_type", { length: 30 }).notNull(), // number | string | object | array
  // Which agent tool or engine implements this?
  implementation: varchar("implementation", { length: 100 }).notNull(), // agent tool name or engine function
  // Ontology triangle mapping
  ontologyEdge: varchar("ontology_edge", { length: 30 }),   // miktar_sure | sure_bilesen | bilesen_miktar
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orchestrator — autonomous octopus-chain auditor (every ~30 min + on data mutations)
export const orchestratorRuns = pgTable("orchestrator_runs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  trigger: text("trigger").notNull(), // "scheduled" | "data_ingestion" | "manual"
  triggerDetail: text("trigger_detail"),
  durationMs: integer("duration_ms").notNull().default(0),
  // Per-layer: "green" | "yellow" | "red" | "skip"
  layerMutation: text("layer_mutation"),
  layerSelfIntel: text("layer_self_intel"),
  layerCrossProduct: text("layer_cross_product"),
  layerDownstream: text("layer_downstream"),
  layerUiCoherence: text("layer_ui_coherence"),
  layerWsBroadcast: text("layer_ws_broadcast"),
  layerAgent: text("layer_agent"),
  layerOntology: text("layer_ontology"),
  layerValidation: text("layer_validation"),
  layerSeasonal: text("layer_seasonal"),
  // Findings
  greenCount: integer("green_count").notNull().default(0),
  yellowCount: integer("yellow_count").notNull().default(0),
  redCount: integer("red_count").notNull().default(0),
  findings: jsonb("findings").$type<Array<{ layer: string; severity: string; message: string; sku?: string; data?: any }>>().default([]),
  summary: text("summary"),
});

export type OrchestratorRun = typeof orchestratorRuns.$inferSelect;

// TypeScript interface for property definitions
export interface OntologyProperty {
  type: "string" | "number" | "boolean" | "date" | "json";
  displayName: string;
  displayNameTr?: string;
  required?: boolean;
  description?: string;
  unit?: string;           // "adet" | "metre" | "kg" | "gün"
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

// ═══════════════════════════════════════════════════════════
// PALANTIR-LEVEL OPERATIONAL ATOMS — FAZ 0 (2026-04-27)
// Vertex pattern: asset hierarchy + time atom + quality + supplier + decision loop
// Reference: /Users/gurkanduruak/Desktop/GRISEUS_PALANTIR_PLAYBOOK.md
// Existing productionLines reused for "Line" object type
// ═══════════════════════════════════════════════════════════

// --- Asset hierarchy (Plant > Line > WorkCenter > Machine > Operator) ---

export const plants = pgTable("plants", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  city: text("city"),
  address: text("address"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type Plant = typeof plants.$inferSelect;

export const workCenters = pgTable("work_centers", {
  id: serial("id").primaryKey(),
  lineId: integer("line_id").references(() => productionLines.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  stationOrder: integer("station_order"),
  capacityPerHour: numeric("capacity_per_hour"),
  status: text("status").default("active"),
});
export type WorkCenter = typeof workCenters.$inferSelect;

export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  workCenterId: integer("work_center_id").references(() => workCenters.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type"),
  manufacturer: text("manufacturer"),
  installedAt: timestamp("installed_at"),
  expectedCycleTimeSec: numeric("expected_cycle_time_sec"),
  status: text("status").default("active"),
});
export type Machine = typeof machines.$inferSelect;

export const operators = pgTable("operators", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  employeeCode: text("employee_code").notNull(),
  name: text("name").notNull(),
  primaryLineId: integer("primary_line_id").references(() => productionLines.id),
  skill: text("skill"),
  certifications: jsonb("certifications").$type<string[]>().default([]),
  status: text("status").default("active"),
});
export type Operator = typeof operators.$inferSelect;

// --- Time atoms (Shift > Batch > ProductionRun + Downtime) ---

export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  lineId: integer("line_id").references(() => productionLines.id).notNull(),
  shiftCode: text("shift_code").notNull(),  // morning | afternoon | night
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  supervisorId: integer("supervisor_id").references(() => operators.id),
  notes: text("notes"),
});
export type Shift = typeof shifts.$inferSelect;

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  batchCode: text("batch_code").notNull(),
  plannedQuantity: integer("planned_quantity").notNull(),
  status: text("status").default("planned"),  // planned | in_progress | completed | cancelled
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type Batch = typeof batches.$inferSelect;

export const productionRuns = pgTable("production_runs", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => batches.id).notNull(),
  machineId: integer("machine_id").references(() => machines.id),
  operatorId: integer("operator_id").references(() => operators.id),
  shiftId: integer("shift_id").references(() => shifts.id),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  plannedOutput: integer("planned_output"),
  actualOutput: integer("actual_output"),
  scrapCount: integer("scrap_count").default(0),
  setupTimeSec: integer("setup_time_sec"),
  cycleTimeAvgSec: numeric("cycle_time_avg_sec"),
  status: text("status").default("running"),  // running | completed | aborted
});
export type ProductionRun = typeof productionRuns.$inferSelect;

export const downtimeEpisodes = pgTable("downtime_episodes", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").references(() => machines.id),
  productionRunId: integer("production_run_id").references(() => productionRuns.id),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  durationMin: numeric("duration_min"),
  category: text("category"),  // breakdown | changeover | material_wait | quality | planned
  reason: text("reason"),
  resolvedBy: integer("resolved_by").references(() => operators.id),
});
export type DowntimeEpisode = typeof downtimeEpisodes.$inferSelect;

// --- Quality events ---

export const scrapReasons = pgTable("scrap_reasons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),  // material | machine | operator | design
  description: text("description"),
});
export type ScrapReason = typeof scrapReasons.$inferSelect;

export const qualityEvents = pgTable("quality_events", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => batches.id),
  productionRunId: integer("production_run_id").references(() => productionRuns.id),
  scrapReasonId: integer("scrap_reason_id").references(() => scrapReasons.id),
  eventType: text("event_type").notNull(),  // scrap | rework | warranty_return | inspection_fail
  quantity: integer("quantity").notNull().default(1),
  detectedAt: timestamp("detected_at").defaultNow(),
  detectedBy: integer("detected_by").references(() => operators.id),
  notes: text("notes"),
});
export type QualityEvent = typeof qualityEvents.$inferSelect;

// --- Supplier graph ---

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  country: text("country"),
  averageLeadTimeDays: integer("average_lead_time_days"),
  qualityGrade: text("quality_grade"),  // A | B | C
  status: text("status").default("active"),
});
export type Supplier = typeof suppliers.$inferSelect;

export const supplierLots = pgTable("supplier_lots", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  componentCode: text("component_code").notNull(),
  lotNumber: text("lot_number").notNull(),
  quantity: integer("quantity").notNull(),
  receivedAt: timestamp("received_at"),
  qualityCheckResult: text("quality_check_result"),  // passed | failed | conditional
  unitCost: numeric("unit_cost"),
});
export type SupplierLot = typeof supplierLots.$inferSelect;

// --- Decision/execution chain ---

export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").default("cukurova"),
  scenarioId: integer("scenario_id"),  // links to scenarios table (no FK to allow soft ref)
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),  // throughput | scrap_reduction | energy | inventory | quality
  projectedValue: numeric("projected_value"),  // TL
  projectedMetricImpact: jsonb("projected_metric_impact").$type<Record<string, number>>(),
  priority: text("priority").default("medium"),  // low | medium | high | critical
  status: text("status").default("identified"),  // identified | approved | in_progress | completed | verified | rejected
  identifiedAt: timestamp("identified_at").defaultNow(),
  deadline: timestamp("deadline"),
});
export type Opportunity = typeof opportunities.$inferSelect;

export const workOrders = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").references(() => opportunities.id),
  code: text("code").notNull(),
  type: text("type").notNull(),  // production | maintenance | purchase | quality | setup_change
  assigneeId: integer("assignee_id").references(() => operators.id),
  targetMachineId: integer("target_machine_id").references(() => machines.id),
  targetLineId: integer("target_line_id").references(() => productionLines.id),
  description: text("description"),
  dueDate: timestamp("due_date"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  status: text("status").default("open"),  // open | in_progress | completed | cancelled | verified
  actualValue: numeric("actual_value"),  // verified outcome value
  completionProof: text("completion_proof"),  // text or URL
  createdAt: timestamp("created_at").defaultNow(),
});
export type WorkOrder = typeof workOrders.$inferSelect;

// --- Energy/cost meter ---

export const energyMeters = pgTable("energy_meters", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").references(() => machines.id),
  lineId: integer("line_id").references(() => productionLines.id),
  meterType: text("meter_type").notNull(),  // electricity | gas | water | compressed_air
  unit: text("unit").notNull(),  // kWh | m3 | liter
  installedAt: timestamp("installed_at"),
  lastReading: numeric("last_reading"),
  lastReadingAt: timestamp("last_reading_at"),
});
export type EnergyMeter = typeof energyMeters.$inferSelect;

export const energyReadings = pgTable("energy_readings", {
  id: serial("id").primaryKey(),
  meterId: integer("meter_id").references(() => energyMeters.id).notNull(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id),
  reading: numeric("reading").notNull(),
  delta: numeric("delta"),  // since previous reading
  recordedAt: timestamp("recorded_at").defaultNow(),
});
export type EnergyReading = typeof energyReadings.$inferSelect;
