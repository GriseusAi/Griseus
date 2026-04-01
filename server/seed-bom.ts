/**
 * Seed script for BOM (Ürün Ağacı) and Component Stock data
 * Product: ELT.7-11 — Goldsun Elite Seramik Plakalı Camlı Radyant Isıtıcı
 *
 * Usage: npx tsx server/seed-bom.ts
 */
import { db } from "./db";
import { bomItems, componentStock } from "@shared/schema";

const SKU = "ELT.7-11";

const BOM_DATA: Array<{
  code: string; name: string; qty: number; unit: string;
  tier: number; parent?: string;
}> = [
  // TIER 1 — Direkt hammaddeler
  { code: "27.004", name: "Isı Kalkanı - Alüminize Şapka", qty: 1, unit: "AD", tier: 1 },
  { code: "27.009", name: "Buji Kablosu", qty: 1, unit: "AD", tier: 1 },
  { code: "27.013", name: "3'lü Klemens", qty: 1, unit: "AD", tier: 1 },
  { code: "27.018", name: "Askı Konsolu", qty: 1, unit: "AD", tier: 1 },
  { code: "27.021", name: "Gaz Flexi Bağlantı Nipeli", qty: 1, unit: "AD", tier: 1 },
  { code: "27.023", name: "Büyük Koli", qty: 1, unit: "AD", tier: 1 },
  { code: "27.025", name: "İç Koli Seperatörü", qty: 5, unit: "AD", tier: 1 },
  { code: "27.026", name: "İç Koli Boru Seperatör", qty: 1, unit: "AD", tier: 1 },
  { code: "27.029", name: "Siyah Alüminyum Buat", qty: 1, unit: "AD", tier: 1 },
  { code: "27.030", name: "H Tipi İyonizasyon Kablosu", qty: 1, unit: "AD", tier: 1 },
  { code: "27.031", name: "Paslanmaz Reflektör Tutucu", qty: 2, unit: "AD", tier: 1 },
  { code: "27.060", name: "Elektrot Buji", qty: 1, unit: "AD", tier: 1 },
  { code: "27.061", name: "Elektrot Tutucu", qty: 1, unit: "AD", tier: 1 },
  { code: "27.062", name: "PG 9 Rakor Siyah", qty: 1, unit: "AD", tier: 1 },
  { code: "27.067", name: "3x1mm² TTR Kablo", qty: 1, unit: "AD", tier: 1 },
  { code: "27.072", name: "Alümize Sac 0.90mm", qty: 5.89, unit: "KG", tier: 1 },
  { code: "27.080", name: "Konsol U Bağlantı Parçası", qty: 1, unit: "AD", tier: 1 },
  { code: "27.082", name: "100mm Doğal Gaz Bağlantı Borusu", qty: 1, unit: "AD", tier: 1 },
  { code: "27.089", name: "Manşon Redüksiyon 3/8-1/2", qty: 1, unit: "AD", tier: 1 },
  { code: "27.090", name: "Gaz Memesi Bağlantı Nipeli", qty: 1, unit: "AD", tier: 1 },
  { code: "27.092", name: "7/11 Kasası", qty: 1, unit: "AD", tier: 1 },
  { code: "27.094", name: "Elite Cam 7/11", qty: 1, unit: "AD", tier: 1 },
  { code: "27.096", name: "Cam Tutucu Çıta 7/11", qty: 1, unit: "AD", tier: 1 },
  { code: "27.101", name: "İç Konsol 7/11", qty: 1, unit: "AD", tier: 1 },
  { code: "27.103", name: "Reflektör 7/11", qty: 1, unit: "AD", tier: 1 },
  { code: "27.106", name: "Selenoid Koruyucu Kalkanı", qty: 1, unit: "AD", tier: 1 },
  { code: "27.111", name: "Fark Laması", qty: 2, unit: "AD", tier: 1 },
  { code: "27.114", name: "Brülör Ateşleme ve Kontrol Modülü H Tipi", qty: 1, unit: "AD", tier: 1 },
  { code: "27.116", name: "Kablo Takımı H Tipi", qty: 1, unit: "AD", tier: 1 },
  { code: "27.119", name: "Gazflex 1/2''", qty: 1, unit: "AD", tier: 1 },
  { code: "27.120", name: "Ekran Tutucu", qty: 1, unit: "AD", tier: 1 },
  { code: "27.127", name: "Gaz Enjektörü", qty: 1, unit: "AD", tier: 1 },
  { code: "27.130", name: "Selenoid Tutucu", qty: 1, unit: "AD", tier: 1 },
  { code: "27.131", name: "Buton", qty: 1, unit: "AD", tier: 1 },
  { code: "27.152", name: "Boru Sabitleme Parçası", qty: 1, unit: "AD", tier: 1 },
  { code: "27.157", name: "Dirsek Grup 3/4-1/2 Segmanlı", qty: 1, unit: "AD", tier: 1 },
  { code: "27.167", name: "SIT Sigma 845 Selenoid Valf", qty: 1, unit: "AD", tier: 1 },
  // TIER 2 — Yarı mamül
  { code: "27.125", name: "Brülör (Yerli Malzeme)", qty: 1, unit: "AD", tier: 2 },
  // TIER 3 — Brülör alt bileşenleri
  { code: "27.123", name: "Seramik Taş", qty: 6, unit: "AD", tier: 3, parent: "27.125" },
  { code: "27.160", name: "Yanma Odası Paslanmaz Çıta", qty: 1, unit: "TK", tier: 3, parent: "27.125" },
  { code: "27.161", name: "Yanma Odası Galvaniz Tel", qty: 1, unit: "AD", tier: 3, parent: "27.125" },
  { code: "27.162", name: "Yanma Odası Gövde", qty: 1, unit: "AD", tier: 3, parent: "27.125" },
  { code: "27.164", name: "Enjektör Yıldız Tutucu", qty: 1, unit: "AD", tier: 3, parent: "27.125" },
];

const STOCK_DATA: Record<string, number> = {
  "27.004": 809, "27.009": 857, "27.013": 1889, "27.018": 3148,
  "27.021": 919, "27.023": 749, "27.025": 3384, "27.026": 308,
  "27.029": 1387, "27.030": 981, "27.031": 482, "27.060": 774,
  "27.061": 260, "27.062": 2230, "27.067": 996, "27.072": 2211.66,
  "27.080": 2442, "27.082": 1850, "27.089": 1924, "27.090": 1925,
  "27.092": 353, "27.094": 1342, "27.096": 388, "27.101": 631,
  "27.103": 631, "27.106": 2783, "27.111": 3740, "27.114": 464,
  "27.116": 768, "27.119": 885, "27.120": 1175, "27.125": 0,
  "27.123": 5594, "27.160": 1692, "27.161": 390, "27.162": 526,
  "27.164": 373, "27.127": 5605, "27.130": 2082, "27.131": 813,
  "27.152": 423, "27.157": 1727, "27.167": 1963,
};

async function seed() {
  console.log("Seeding BOM data for ELT.7-11...");

  // Insert BOM items
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
      },
    });
  }
  console.log(`  ✓ ${BOM_DATA.length} BOM items inserted/updated`);

  // Insert stock data
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

  console.log("Done!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
