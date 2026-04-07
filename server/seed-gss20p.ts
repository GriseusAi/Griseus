/**
 * Seed script for BOM, Component Stock & Sales History
 * Product: GSS20P — Goldsun Supra Plus 2000W (Siyah)
 *
 * Usage: npx tsx server/seed-gss20p.ts
 */
import { db } from "./db";
import { bomItems, componentStock, salesHistory, products, stockLevels } from "@shared/schema";
import { eq } from "drizzle-orm";

const SKU = "GSS20P";
const PRODUCT_NAME = "Goldsun Supra Plus 2000W - Siyah";

const BOM_DATA: Array<{
  code: string; name: string; qty: number; unit: string;
  tier: number; parent?: string;
}> = [
  // TIER 1 — Tum bilesen direkt malzeme (alt montaj yok)
  { code: "25.018", name: "PG-9 Kablo Rakoru", qty: 1, unit: "AD", tier: 1 },
  { code: "25.054", name: "EPDM Sizdirmazlik Contasi", qty: 1, unit: "AD", tier: 1 },
  { code: "25.069", name: "Kablo 3x1.5mm² 2.5m Toprakli Fis - Gri", qty: 1, unit: "AD", tier: 1 },
  { code: "25.075", name: "Ambalaj Seperator Kopuk Sungeri", qty: 1, unit: "AD", tier: 1 },
  { code: "25.104", name: "Ampul Su Gecirmez 2000W Dr. Fischer", qty: 1, unit: "AD", tier: 1 },
  { code: "25.114", name: "AQUA-SUPRA-NOVA 15-20 Aski Kolu", qty: 1, unit: "AD", tier: 1 },
  { code: "25.117", name: "Supra Plus On Panel Etiketi", qty: 1, unit: "AD", tier: 1 },
  { code: "25.160", name: "Aski Ayagi", qty: 1, unit: "AD", tier: 1 },
  { code: "25.164", name: "Ampul Kafasi Sogutma Kapagi", qty: 1, unit: "AD", tier: 1 },
  { code: "25.172", name: "Supra Yan Reflektor", qty: 1, unit: "AD", tier: 1 },
  { code: "25.173", name: "Supra Izgara", qty: 1, unit: "AD", tier: 1 },
  { code: "25.178", name: "Supra Reflektor", qty: 1, unit: "AD", tier: 1 },
  { code: "25.192", name: "Ampul Kafasi Sogutma Tabani", qty: 1, unit: "AD", tier: 1 },
  { code: "25.226", name: "Supra Plus On Plastik Panel", qty: 1, unit: "AD", tier: 1 },
  { code: "25.227", name: "Supra Plus Ic Plastik Buat", qty: 1, unit: "AD", tier: 1 },
  { code: "25.228", name: "Supra Plus Plastik Conta ve Buton", qty: 1, unit: "AD", tier: 1 },
  { code: "25.229", name: "Supra Duz Yan Kapak (Siyah)", qty: 1, unit: "AD", tier: 1 },
  { code: "25.230", name: "Plus Kablo Gecis Profili (9mm)", qty: 1, unit: "AD", tier: 1 },
  { code: "25.231", name: "Supra Plus Kumanda Kasasi (115mm)", qty: 1, unit: "AD", tier: 1 },
  { code: "25.232", name: "Supra Plus Tekli Ambalaj Kutusu", qty: 1, unit: "AD", tier: 1 },
  { code: "25.234", name: "Supra - Supra Plus Seperator", qty: 1, unit: "AD", tier: 1 },
  { code: "25.247", name: "Supra Yan Kapak - Siyah", qty: 1, unit: "AD", tier: 1 },
  { code: "25.248", name: "Supra On Kapak 50mm - Siyah", qty: 1, unit: "AD", tier: 1 },
  { code: "25.249", name: "Supra Tekli Kasa (40cm) Galmak - Siyah", qty: 1, unit: "AD", tier: 1 },
  { code: "25.397", name: "IR Dimmer Uzaktan Kumanda H Tipi 3 Tuslu", qty: 1, unit: "AD", tier: 1 },
  { code: "25.430", name: "IR Dimmer Modulu 4000W H Tipi IRHCR3", qty: 1, unit: "AD", tier: 1 },
];

const STOCK_DATA: Record<string, number> = {
  "25.018": 4610, "25.054": 3758, "25.069": 8314, "25.075": 3646,
  "25.104": 3735, "25.114": 1452, "25.117": 5476, "25.160": 2412,
  "25.164": 83039, "25.172": 10747, "25.173": 997, "25.178": 5483,
  "25.192": 7775, "25.226": 2233, "25.227": 6046, "25.228": 7592,
  "25.229": 931, "25.230": 233, "25.231": 6234, "25.232": 2728,
  "25.234": 11074, "25.247": 3736, "25.248": 6333, "25.249": 1872,
  "25.397": 800, "25.430": 733,
};

// 3 yil ortalamasi — aylik satis verisi (2023, 2024, 2025 ayni dagilim)
const MONTHLY_SALES = [
  { month: 1, qty: 397 },
  { month: 2, qty: 507 },
  { month: 3, qty: 139 },
  { month: 4, qty: 315 },
  { month: 5, qty: 216 },
  { month: 6, qty: 69 },
  { month: 7, qty: 42 },
  { month: 8, qty: 863 },
  { month: 9, qty: 390 },
  { month: 10, qty: 609 },
  { month: 11, qty: 555 },
  { month: 12, qty: 566 },
];

async function seed() {
  console.log("Seeding GSS20P — Goldsun Supra Plus 2000W...");

  // 1. Ensure product record exists
  const [existing] = await db.select().from(products).where(eq(products.sku, SKU));
  if (!existing) {
    await db.insert(products).values({
      sku: SKU,
      name: PRODUCT_NAME,
      category: "Elektrikli Radyant Isitici",
      tenantId: "cukurova",
    });
    console.log("  ✓ Product record created");
  } else {
    console.log("  ✓ Product record already exists");
  }

  // 2. Insert BOM items
  for (const item of BOM_DATA) {
    await db.insert(bomItems).values({
      parentProductSku: SKU,
      componentCode: item.code,
      componentName: item.name,
      requiredQuantity: String(item.qty),
      unit: item.unit,
      tier: item.tier,
      parentComponentCode: item.parent || null,
    }).onConflictDoUpdate({
      target: bomItems.componentCode,
      set: {
        componentName: item.name,
        requiredQuantity: String(item.qty),
        unit: item.unit,
        tier: item.tier,
        parentComponentCode: item.parent || null,
        parentProductSku: SKU,
      },
    });
  }
  console.log(`  ✓ ${BOM_DATA.length} BOM items inserted/updated`);

  // 3. Insert stock data
  for (const [code, stock] of Object.entries(STOCK_DATA)) {
    const bomItem = BOM_DATA.find(b => b.code === code);
    const unit = bomItem?.unit || "AD";
    await db.insert(componentStock).values({
      componentCode: code,
      currentStock: String(stock),
      unit,
      lastCountedBy: "netsis_import",
    }).onConflictDoUpdate({
      target: componentStock.componentCode,
      set: {
        currentStock: String(stock),
        updatedAt: new Date(),
      },
    });
  }
  console.log(`  ✓ ${Object.keys(STOCK_DATA).length} stock records inserted/updated`);

  // 4. Insert sales history (3 years: 2023, 2024, 2025)
  // Check if already seeded
  const [existingSales] = await db.select().from(salesHistory).where(eq(salesHistory.productSku, SKU));
  if (!existingSales) {
    for (const year of [2023, 2024, 2025]) {
      for (const { month, qty } of MONTHLY_SALES) {
        await db.insert(salesHistory).values({
          productSku: SKU,
          year,
          month,
          quantitySold: qty,
          source: "manual_import",
        });
      }
    }
    console.log("  ✓ 36 months of sales history inserted (2023-2025)");
  } else {
    console.log("  ✓ Sales history already exists, skipping");
  }

  // 5. Ensure stock_levels record exists (203 mamul stok from PDF)
  const [productRow] = await db.select().from(products).where(eq(products.sku, SKU));
  if (productRow) {
    const [existingStock] = await db.select().from(stockLevels).where(eq(stockLevels.productId, productRow.id));
    if (!existingStock) {
      await db.insert(stockLevels).values({
        productId: productRow.id,
        inProduction: 0,
        inWarehouse: 203,
        totalSold: 0,
      });
      console.log("  ✓ Stock levels created (203 in warehouse)");
    } else {
      console.log("  ✓ Stock levels already exist");
    }
  }

  console.log("Done! GSS20P is ready.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
