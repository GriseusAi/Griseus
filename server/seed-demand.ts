/**
 * Seed script for ELT.7-11 Demand Forecast data
 * Source: 3-year average (2023-2024-2025) monthly sales from Çukurova Isı
 *
 * Usage: npx tsx server/seed-demand.ts
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

const SKU = "ELT.7-11";

// 3-yıl ortalaması aylık satış verileri (2023-24-25)
const MONTHLY_SALES: Record<number, number> = {
  1: 340,   // Ocak
  2: 278,   // Şubat
  3: 131,   // Mart
  4: 222,   // Nisan
  5: 162,   // Mayıs
  6: 234,   // Haziran
  7: 108,   // Temmuz
  8: 269,   // Ağustos
  9: 98,    // Eylül
  10: 169,  // Ekim
  11: 22,   // Kasım
  12: 325,  // Aralık
};
// Yıllık toplam: 2358

async function seed() {
  console.log("Seeding demand forecast data for ELT.7-11...");

  // Create table if not exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS demand_forecast (
      id SERIAL PRIMARY KEY,
      product_sku TEXT NOT NULL,
      month INTEGER NOT NULL,
      avg_monthly_sales NUMERIC NOT NULL,
      years_averaged INTEGER DEFAULT 3,
      source TEXT DEFAULT 'historical',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  for (const [month, sales] of Object.entries(MONTHLY_SALES)) {
    await db.execute(sql`
      INSERT INTO demand_forecast (product_sku, month, avg_monthly_sales, years_averaged, source)
      VALUES (${SKU}, ${parseInt(month)}, ${sales}, 3, 'historical')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  // Delete old entries and re-insert (clean approach)
  await db.execute(sql`DELETE FROM demand_forecast WHERE product_sku = ${SKU}`);

  for (const [month, sales] of Object.entries(MONTHLY_SALES)) {
    await db.execute(sql`
      INSERT INTO demand_forecast (product_sku, month, avg_monthly_sales, years_averaged, source)
      VALUES (${SKU}, ${parseInt(month)}, ${sales}, 3, 'historical')
    `);
  }

  console.log(`  ✓ 12 monthly demand records inserted for ${SKU}`);
  console.log(`  Yıllık toplam satış ortalaması: 2,358 adet`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
