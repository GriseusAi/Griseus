import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "0007_twin_health.sql"), "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    console.log("Running FAZ 2 migration...");
    await pool.query(sql);
    const r = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('digital_twin_divergence','drift_alerts')
      ORDER BY table_name
    `);
    console.log(`✓ Created ${r.rows.length}/2 twin-health tables:`);
    r.rows.forEach((row: any) => console.log(`  - ${row.table_name}`));
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
