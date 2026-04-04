import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

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
    console.log("[db] validation_alerts + custom_rules + audit_log tabloları hazır");
  } catch (err) {
    console.error("[db] Tablo oluşturma hatası:", err);
  }
}
