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
  componentCode: text("component_code").notNull().unique(),
  componentName: text("component_name").notNull(),
  requiredQuantity: numeric("required_quantity").notNull(),
  unit: text("unit").notNull(),
  tier: integer("tier").notNull(),
  parentComponentCode: text("parent_component_code"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
