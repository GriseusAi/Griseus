/**
 * Run FAZ 0 migration directly via pg client (bypasses drizzle-kit interactive prompt)
 * Usage: npx tsx script/run-faz0-migration.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "0005_palantir_atoms.sql"), "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    console.log("Running FAZ 0 migration...");
    await pool.query(sql);
    console.log("✓ FAZ 0 migration applied (17 new tables)");

    const r = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'plants','work_centers','machines','operators',
        'shifts','batches','production_runs','downtime_episodes',
        'scrap_reasons','quality_events',
        'suppliers','supplier_lots',
        'opportunities','work_orders',
        'energy_meters','energy_readings'
      )
      ORDER BY table_name
    `);
    console.log(`✓ Verified ${r.rows.length}/16 atom tables exist:`);
    r.rows.forEach(row => console.log(`  - ${row.table_name}`));
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
