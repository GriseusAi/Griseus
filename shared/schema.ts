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
