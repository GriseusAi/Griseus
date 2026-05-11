import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

// Startup migration — eksik tabloları oluştur
export async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS validation_alerts (
        id SERIAL PRIMARY KEY,
        alert_id VARCHAR(64) NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        root_cause JSONB,
        component_code TEXT,
        product_sku TEXT,
        suggested_action TEXT,
        validated BOOLEAN DEFAULT false,
        validation_note TEXT,
        outcome TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_rules (
        id SERIAL PRIMARY KEY,
        nl_description TEXT NOT NULL,
        parsed_rule JSONB NOT NULL,
        rule_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'warning',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_triggered TIMESTAMP,
        trigger_count INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL DEFAULT 'ceo_agent',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        field TEXT,
        previous_value TEXT,
        new_value TEXT,
        reason TEXT,
        actor TEXT NOT NULL DEFAULT 'system',
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS outcome_tracking (
        id SERIAL PRIMARY KEY,
        prediction_id VARCHAR(64) NOT NULL,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        rule_type TEXT,
        component_code TEXT,
        product_sku TEXT,
        predicted_outcome TEXT NOT NULL,
        predicted_value JSONB,
        confidence NUMERIC NOT NULL DEFAULT 0.5,
        deadline TIMESTAMP NOT NULL,
        check_intervals JSONB,
        actual_outcome TEXT,
        actual_value JSONB,
        outcome_status TEXT NOT NULL DEFAULT 'pending',
        value_generated NUMERIC,
        tokens_consumed INTEGER,
        verified_at TIMESTAMP,
        verified_by TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_metrics (
        id SERIAL PRIMARY KEY,
        interaction_id VARCHAR(64) NOT NULL,
        interaction_type TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        tools_used JSONB,
        query_category TEXT,
        outcome_linked BOOLEAN NOT NULL DEFAULT false,
        outcome_id TEXT,
        estimated_value_tl NUMERIC,
        actual_value_tl NUMERIC,
        value_per_token NUMERIC,
        generic_baseline_tl NUMERIC,
        ontology_advantage_ratio NUMERIC,
        actor TEXT NOT NULL DEFAULT 'ceo_agent',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_profiles (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL UNIQUE DEFAULT 'cukurova',
        company_name TEXT NOT NULL,
        avg_lead_time_days NUMERIC NOT NULL DEFAULT 14,
        lead_time_std_dev NUMERIC NOT NULL DEFAULT 3,
        demand_volatility NUMERIC NOT NULL DEFAULT 0.4,
        seasonal_amplitude NUMERIC NOT NULL DEFAULT 1.0,
        stockout_daily_cost_tl NUMERIC NOT NULL DEFAULT 2500,
        holding_cost_rate NUMERIC NOT NULL DEFAULT 0.20,
        risk_tolerance NUMERIC NOT NULL DEFAULT 0.5,
        alert_response_rate NUMERIC NOT NULL DEFAULT 0.5,
        avg_decision_time_min NUMERIC NOT NULL DEFAULT 60,
        adaptive_thresholds JSONB,
        last_behavior_update TIMESTAMP,
        last_threshold_calc TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_interactions (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'cukurova',
        alert_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        alert_severity TEXT NOT NULL,
        action TEXT NOT NULL,
        response_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seasonal_indices (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'cukurova',
        product_sku TEXT NOT NULL,
        month INTEGER NOT NULL,
        baseline_demand NUMERIC NOT NULL,
        baseline_index NUMERIC NOT NULL,
        dynamic_demand NUMERIC NOT NULL,
        dynamic_index NUMERIC NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        std_dev NUMERIC NOT NULL DEFAULT 0,
        last_actual_demand NUMERIC,
        last_actual_year INTEGER,
        anomaly_detected BOOLEAN NOT NULL DEFAULT false,
        anomaly_reason TEXT,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, product_sku, month)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_memory (
        id SERIAL PRIMARY KEY,
        memory_id VARCHAR(64) NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT 'cukurova',
        query_text TEXT NOT NULL,
        query_category TEXT,
        query_embedding vector(1024),
        tools_used JSONB,
        tool_count INTEGER NOT NULL DEFAULT 0,
        recommendation_made TEXT,
        response_length INTEGER NOT NULL DEFAULT 0,
        user_action TEXT,
        action_timestamp TIMESTAMP,
        quality_score NUMERIC NOT NULL DEFAULT 0,
        outcome_id TEXT,
        outcome_value NUMERIC,
        decay_weight NUMERIC NOT NULL DEFAULT 1.0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pipeline_definitions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        pipeline_type VARCHAR(30) NOT NULL,
        cron_expression VARCHAR(50),
        enabled BOOLEAN NOT NULL DEFAULT true,
        config JSONB,
        last_run_at TIMESTAMP,
        last_status VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pipeline_definitions_updated
      ON pipeline_definitions(updated_at DESC);
    `);
    // Seed default tenant profile
    await pool.query(`
      INSERT INTO tenant_profiles (tenant_id, company_name)
      VALUES ('cukurova', 'Çukurova Isı Sistemleri')
      ON CONFLICT (tenant_id) DO NOTHING;
    `);
    // Octopus fix: bom_items.component_code UNIQUE constraint KALDIRIL (ayni bilesen birden
    // fazla cihazda kullanilabilmeli — cross-product paylasim mimarisinin temeli). Ayrica
    // ayni bilesen ayni cihazin farkli tier'larinda da gecebiliyor (or. 91409408). Unique
    // yok, (parent_product_sku, component_code) index'i yeterli.
    await pool.query(`ALTER TABLE bom_items DROP CONSTRAINT IF EXISTS bom_items_component_code_unique`);
    console.log("[db] validation_alerts + custom_rules + audit_log + outcome_tracking + token_metrics + tenant_profiles + alert_interactions + pipeline_definitions tabloları hazır");
  } catch (err) {
    console.error("[db] Tablo oluşturma hatası:", err);
  }
}
