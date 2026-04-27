import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "0009_namespace_workorders.sql"), "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    console.log("Running FAZ 3 namespace fix...");
    await pool.query(sql);
    const r = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'griseus_work_orders'
    `);
    const o = await pool.query(`
      SELECT id, backing_table FROM ontology_object_types WHERE id = 'work_order'
    `);
    console.log(`✓ griseus_work_orders: ${r.rows.length === 1 ? "created" : "missing"}`);
    if (o.rows.length) console.log(`✓ ontology registry: ${o.rows[0].id} → backing_table=${o.rows[0].backing_table}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
