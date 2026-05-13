import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

type AppliedMigration = {
  checksum: string;
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const baseline = args.has("--baseline");
const allowProduction = args.has("--allow-production") || process.env.ALLOW_PRODUCTION_MIGRATIONS === "1";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for migrations");
}

const envName = (
  process.env.APP_ENV ||
  process.env.RAILWAY_ENVIRONMENT_NAME ||
  process.env.NODE_ENV ||
  "development"
).toLowerCase();
const isProduction = envName === "production";

if (isProduction && !dryRun && !baseline && !allowProduction) {
  throw new Error(
    "Refusing to apply production migrations without ALLOW_PRODUCTION_MIGRATIONS=1 or --allow-production. Run a backup first.",
  );
}

const migrationsDir = path.resolve(process.cwd(), "migrations");
const sqlFiles = fs
  .readdirSync(migrationsDir)
  .filter(file => /^\d+_.+\.sql$/.test(file))
  .sort();

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl });

function checksum(sql: string) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS griseus_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        execution_ms integer NOT NULL DEFAULT 0,
        mode text NOT NULL DEFAULT 'apply'
      );
    `);

    const appliedRows = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM griseus_migrations",
    );
    const applied = new Map<string, AppliedMigration>(
      appliedRows.rows.map(row => [row.filename, { checksum: row.checksum }]),
    );

    const pending: Array<{ filename: string; sql: string; checksum: string }> = [];

    for (const filename of sqlFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
      const hash = checksum(sql);
      const existing = applied.get(filename);

      if (existing) {
        if (existing.checksum !== hash) {
          throw new Error(`Migration checksum mismatch: ${filename}`);
        }
        continue;
      }

      pending.push({ filename, sql, checksum: hash });
    }

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    if (dryRun) {
      console.log("Pending migrations:");
      pending.forEach(migration => console.log(`- ${migration.filename}`));
      return;
    }

    if (baseline) {
      for (const migration of pending) {
        await client.query(
          `INSERT INTO griseus_migrations (filename, checksum, mode)
           VALUES ($1, $2, 'baseline')`,
          [migration.filename, migration.checksum],
        );
      }
      console.log(`Baselined ${pending.length} migration(s) without executing SQL.`);
      return;
    }

    for (const migration of pending) {
      const started = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO griseus_migrations (filename, checksum, execution_ms, mode)
           VALUES ($1, $2, $3, 'apply')`,
          [migration.filename, migration.checksum, Date.now() - started],
        );
        await client.query("COMMIT");
        console.log(`Applied ${migration.filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
