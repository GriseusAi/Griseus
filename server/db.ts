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
    console.log("[db] validation_alerts tablosu hazır");
  } catch (err) {
    console.error("[db] Tablo oluşturma hatası:", err);
  }
}
