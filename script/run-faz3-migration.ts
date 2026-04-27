import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "0008_decision_loop.sql"), "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    console.log("Running FAZ 3 migration...");
    await pool.query(sql);
    const r = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'decisions'
    `);
    const c = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'opportunities' AND column_name = 'linked_decision_id'
    `);
    console.log(`✓ decisions table: ${r.rows.length === 1 ? "created" : "missing"}`);
    console.log(`✓ opportunities.linked_decision_id: ${c.rows.length === 1 ? "added" : "missing"}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
