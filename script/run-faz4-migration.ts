import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "0010_ops_alerts.sql"), "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    console.log("Running FAZ 4 migration...");
    await pool.query(sql);
    const r = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='ops_alerts'`);
    console.log(`✓ ops_alerts table: ${r.rows.length === 1 ? "created" : "missing"}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
