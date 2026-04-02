-- ═══════════════════════════════════════════════════════════
-- Performance Indexes for Griseus
-- Targets: frequently queried columns, foreign keys, composite lookups
-- ═══════════════════════════════════════════════════════════

-- Stock movements: query by product + type + time
CREATE INDEX IF NOT EXISTS "idx_stock_movements_product_id" ON "stock_movements_v2" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_type" ON "stock_movements_v2" ("movement_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_created_at" ON "stock_movements_v2" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_product_type" ON "stock_movements_v2" ("product_id", "movement_type", "created_at" DESC);
--> statement-breakpoint

-- Component stock: lookup by component code
CREATE INDEX IF NOT EXISTS "idx_component_stock_code" ON "component_stock" ("component_code");
--> statement-breakpoint

-- BOM items: lookup by parent product + tier
CREATE INDEX IF NOT EXISTS "idx_bom_items_parent_sku" ON "bom_items" ("parent_product_sku");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bom_items_component_code" ON "bom_items" ("component_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bom_items_parent_component" ON "bom_items" ("parent_component_code");
--> statement-breakpoint

-- Sales history: forecast queries by product + month
CREATE INDEX IF NOT EXISTS "idx_sales_history_product_sku" ON "sales_history" ("product_sku");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sales_history_product_month" ON "sales_history" ("product_sku", "year", "month");
--> statement-breakpoint

-- Purchase suggestions: status filter
CREATE INDEX IF NOT EXISTS "idx_purchase_suggestions_status" ON "purchase_suggestions" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchase_suggestions_component" ON "purchase_suggestions" ("component_code", "status");
--> statement-breakpoint

-- Production plans: lookup by product + period
CREATE INDEX IF NOT EXISTS "idx_production_plans_sku" ON "production_plans" ("product_sku");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_production_plans_period" ON "production_plans" ("product_sku", "target_year", "target_month");
--> statement-breakpoint

-- Knowledge chunks: category filter for RAG
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_category" ON "knowledge_chunks" ("category");
--> statement-breakpoint

-- Products: SKU lookup
CREATE INDEX IF NOT EXISTS "idx_products_sku" ON "products" ("sku");
--> statement-breakpoint

-- Password reset codes: lookup by user
CREATE INDEX IF NOT EXISTS "idx_password_reset_user" ON "password_reset_codes" ("user_id", "used", "expires_at");
