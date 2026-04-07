/**
 * Database seed — ensures all products exist with BOM, stock & sales data.
 * Runs automatically on server start.
 */
import { db } from "./db";
import { products, bomItems, componentStock, salesHistory, stockLevels } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  // ── ELT.7-11 ──
  const [existing] = await db.select().from(products).where(eq(products.sku, "ELT.7-11"));
  if (!existing) {
    await db.insert(products).values({
      tenantId: "cukurova",
      sku: "ELT.7-11",
      name: "Goldsun Elite - Seramik Plakalı Camlı Radyant Isıtıcı - 7/9/11 KW Üç kademeli",
      category: "Radyant Isıtıcı",
    });
    console.log("  ✓ ELT.7-11 product seeded");
  }

  // ── GSS20P ──
  await seedGSS20P();
}

async function seedGSS20P() {
  const SKU = "GSS20P";

  // 1. Ensure product record
  const [existing] = await db.select().from(products).where(eq(products.sku, SKU));
  if (!existing) {
    await db.insert(products).values({
      tenantId: "cukurova",
      sku: SKU,
      name: "Goldsun Supra Plus 2000W - Siyah",
      category: "Elektrikli Radyant Isitici",
    });
    console.log("  ✓ GSS20P product seeded");
  }

  // 2. BOM — check if already seeded
  const [existingBom] = await db.select().from(bomItems).where(eq(bomItems.parentProductSku, SKU));
  if (!existingBom) {
    const BOM_DATA = [
      { code: "25.018", name: "PG-9 Kablo Rakoru", qty: 1, unit: "AD" },
      { code: "25.054", name: "EPDM Sizdirmazlik Contasi", qty: 1, unit: "AD" },
      { code: "25.069", name: "Kablo 3x1.5mm² 2.5m Toprakli Fis - Gri", qty: 1, unit: "AD" },
      { code: "25.075", name: "Ambalaj Seperator Kopuk Sungeri", qty: 1, unit: "AD" },
      { code: "25.104", name: "Ampul Su Gecirmez 2000W Dr. Fischer", qty: 1, unit: "AD" },
      { code: "25.114", name: "AQUA-SUPRA-NOVA 15-20 Aski Kolu", qty: 1, unit: "AD" },
      { code: "25.117", name: "Supra Plus On Panel Etiketi", qty: 1, unit: "AD" },
      { code: "25.160", name: "Aski Ayagi", qty: 1, unit: "AD" },
      { code: "25.164", name: "Ampul Kafasi Sogutma Kapagi", qty: 1, unit: "AD" },
      { code: "25.172", name: "Supra Yan Reflektor", qty: 1, unit: "AD" },
      { code: "25.173", name: "Supra Izgara", qty: 1, unit: "AD" },
      { code: "25.178", name: "Supra Reflektor", qty: 1, unit: "AD" },
      { code: "25.192", name: "Ampul Kafasi Sogutma Tabani", qty: 1, unit: "AD" },
      { code: "25.226", name: "Supra Plus On Plastik Panel", qty: 1, unit: "AD" },
      { code: "25.227", name: "Supra Plus Ic Plastik Buat", qty: 1, unit: "AD" },
      { code: "25.228", name: "Supra Plus Plastik Conta ve Buton", qty: 1, unit: "AD" },
      { code: "25.229", name: "Supra Duz Yan Kapak (Siyah)", qty: 1, unit: "AD" },
      { code: "25.230", name: "Plus Kablo Gecis Profili (9mm)", qty: 1, unit: "AD" },
      { code: "25.231", name: "Supra Plus Kumanda Kasasi (115mm)", qty: 1, unit: "AD" },
      { code: "25.232", name: "Supra Plus Tekli Ambalaj Kutusu", qty: 1, unit: "AD" },
      { code: "25.234", name: "Supra - Supra Plus Seperator", qty: 1, unit: "AD" },
      { code: "25.247", name: "Supra Yan Kapak - Siyah", qty: 1, unit: "AD" },
      { code: "25.248", name: "Supra On Kapak 50mm - Siyah", qty: 1, unit: "AD" },
      { code: "25.249", name: "Supra Tekli Kasa (40cm) Galmak - Siyah", qty: 1, unit: "AD" },
      { code: "25.397", name: "IR Dimmer Uzaktan Kumanda H Tipi 3 Tuslu", qty: 1, unit: "AD" },
      { code: "25.430", name: "IR Dimmer Modulu 4000W H Tipi IRHCR3", qty: 1, unit: "AD" },
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

    for (const item of BOM_DATA) {
      await db.insert(bomItems).values({
        parentProductSku: SKU,
        componentCode: item.code,
        componentName: item.name,
        requiredQuantity: String(item.qty),
        unit: item.unit,
        tier: 1,
        parentComponentCode: null,
      }).onConflictDoUpdate({
        target: bomItems.componentCode,
        set: {
          componentName: item.name,
          requiredQuantity: String(item.qty),
          unit: item.unit,
          tier: 1,
          parentProductSku: SKU,
        },
      });
    }
    console.log(`  ✓ GSS20P: ${BOM_DATA.length} BOM items seeded`);

    for (const [code, stock] of Object.entries(STOCK_DATA)) {
      await db.insert(componentStock).values({
        componentCode: code,
        currentStock: String(stock),
        unit: "AD",
        lastCountedBy: "netsis_import",
      }).onConflictDoUpdate({
        target: componentStock.componentCode,
        set: { currentStock: String(stock), updatedAt: new Date() },
      });
    }
    console.log(`  ✓ GSS20P: ${Object.keys(STOCK_DATA).length} stock records seeded`);
  }

  // 3. Sales history
  const [existingSales] = await db.select().from(salesHistory).where(eq(salesHistory.productSku, SKU));
  if (!existingSales) {
    const MONTHLY = [397, 507, 139, 315, 216, 69, 42, 863, 390, 609, 555, 566];
    for (const year of [2023, 2024, 2025]) {
      for (let m = 0; m < 12; m++) {
        await db.insert(salesHistory).values({
          productSku: SKU, year, month: m + 1,
          quantitySold: MONTHLY[m], source: "manual_import",
        });
      }
    }
    console.log("  ✓ GSS20P: 36 months sales history seeded");
  }

  // 4. Stock levels (sıfırdan başla — depoya transfer yapılmadı)
  const [productRow] = await db.select().from(products).where(eq(products.sku, SKU));
  if (productRow) {
    const [existingLevel] = await db.select().from(stockLevels).where(eq(stockLevels.productId, productRow.id));
    if (!existingLevel) {
      await db.insert(stockLevels).values({
        productId: productRow.id, inProduction: 0, inWarehouse: 0, totalSold: 0,
      });
      console.log("  ✓ GSS20P: stock levels seeded (0 — clean start)");
    }

    // Fix existing record if it has wrong initial values (e.g. 203 from old seed)
    if (existingLevel && existingLevel.inWarehouse === 203 && existingLevel.totalSold === 0) {
      await db.update(stockLevels)
        .set({ inWarehouse: 0 })
        .where(eq(stockLevels.productId, productRow.id));
      console.log("  ✓ GSS20P: fixed initial stock 203 → 0");
    }
  }
}
