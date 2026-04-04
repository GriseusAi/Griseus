/**
 * Smart Data Import Engine
 * Excel/CSV dosyalarını otomatik ayrıştırır, kolon eşler, doğrular ve anomali tespit eder.
 *
 * Desteklenen veri tipleri:
 * - sales_history: Aylık satış verileri (yıl, ay, adet, ciro)
 * - component_stock: Bileşen stok güncellemesi (kod, stok miktarı)
 * - bom_update: BOM reçete güncellemesi (kod, ad, miktar, birim, tier)
 */
import * as XLSX from "xlsx";
import { db } from "../db";
import { salesHistory, componentStock, bomItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { MAIN_SKU } from "./constants";

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export type ImportType = "sales_history" | "component_stock" | "bom_update" | "auto";

export interface ImportResult {
  success: boolean;
  detectedType: ImportType;
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
  anomalies: Anomaly[];
  columnMapping: Record<string, string>;
  preview: Record<string, any>[];
  message: string;
}

export interface ImportError {
  row: number;
  column?: string;
  value?: any;
  reason: string;
}

export interface Anomaly {
  row: number;
  column: string;
  value: any;
  expected: string;
  severity: "warning" | "critical";
  reason: string;
}

// ══════════════════════════════════════════════════════════
// COLUMN MAPPING — Akıllı kolon eşleme
// ══════════════════════════════════════════════════════════

const COLUMN_ALIASES: Record<string, string[]> = {
  // Sales history
  year: ["yil", "yıl", "year", "sene", "YIL", "Year", "YEAR"],
  month: ["ay", "month", "AY", "Month", "MONTH"],
  quantity: ["adet", "miktar", "quantity", "satış", "satis", "ADET", "Quantity", "QTY", "qty"],
  revenue: ["ciro", "gelir", "revenue", "tutar", "Revenue", "CIRO"],
  // Component stock
  componentCode: ["kod", "code", "bileşen", "bilesen", "component", "parca", "parça", "KOD", "Code"],
  stock: ["stok", "stock", "miktar", "adet", "STOK", "Stock", "envanter"],
  // BOM
  name: ["ad", "isim", "name", "bileşen_adı", "bilesen_adi", "Name", "AD"],
  requiredQty: ["gerekli", "required", "miktar_gerekli", "adet_gerekli", "qty"],
  unit: ["birim", "unit", "BIRIM", "Unit"],
  tier: ["tier", "seviye", "kademe", "TIER"],
};

function mapColumns(headers: string[]): { mapping: Record<string, string>; type: ImportType } {
  const mapping: Record<string, string> = {};
  const lowerHeaders = headers.map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (let i = 0; i < headers.length; i++) {
      const header = lowerHeaders[i];
      if (aliases.some(a => a.toLowerCase() === header || header.includes(a.toLowerCase()))) {
        mapping[canonical] = headers[i];
        break;
      }
    }
  }

  // Tip tespiti
  if (mapping.year && mapping.month && (mapping.quantity || mapping.revenue)) {
    return { mapping, type: "sales_history" };
  }
  if (mapping.componentCode && mapping.stock) {
    return { mapping, type: "component_stock" };
  }
  if (mapping.componentCode && mapping.name && (mapping.requiredQty || mapping.unit)) {
    return { mapping, type: "bom_update" };
  }

  return { mapping, type: "auto" };
}

// ══════════════════════════════════════════════════════════
// ANOMALİ TESPİTİ
// ══════════════════════════════════════════════════════════

const MONTHLY_DEMAND_EXPECTED = [340, 278, 131, 222, 162, 234, 108, 269, 98, 169, 22, 325];

function detectAnomalies(rows: Record<string, any>[], type: ImportType, mapping: Record<string, string>): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (type === "sales_history") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const qty = Number(row[mapping.quantity]);
      const month = Number(row[mapping.month]);

      if (!isNaN(qty) && !isNaN(month) && month >= 1 && month <= 12) {
        const expected = MONTHLY_DEMAND_EXPECTED[month - 1];
        const ratio = qty / expected;

        // %200'den fazla veya %20'den az — anomali
        if (ratio > 2) {
          anomalies.push({
            row: i + 2, column: mapping.quantity, value: qty,
            expected: `~${expected} (3 yıl ortalaması)`,
            severity: "warning",
            reason: `Satış miktarı (${qty}) beklenen ortalamanın ${ratio.toFixed(1)}x üstünde`,
          });
        } else if (ratio < 0.2 && qty > 0) {
          anomalies.push({
            row: i + 2, column: mapping.quantity, value: qty,
            expected: `~${expected} (3 yıl ortalaması)`,
            severity: "warning",
            reason: `Satış miktarı (${qty}) beklenen ortalamanın çok altında`,
          });
        }
      }

      // Negatif değer
      if (!isNaN(qty) && qty < 0) {
        anomalies.push({
          row: i + 2, column: mapping.quantity, value: qty,
          expected: "≥ 0", severity: "critical",
          reason: "Negatif satış miktarı",
        });
      }
    }
  }

  if (type === "component_stock") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const stock = Number(row[mapping.stock]);
      const code = row[mapping.componentCode];

      if (!isNaN(stock) && stock < 0) {
        anomalies.push({
          row: i + 2, column: mapping.stock, value: stock,
          expected: "≥ 0", severity: "critical",
          reason: `${code} negatif stok değeri`,
        });
      }
      if (!isNaN(stock) && stock > 50000) {
        anomalies.push({
          row: i + 2, column: mapping.stock, value: stock,
          expected: "< 50000", severity: "warning",
          reason: `${code} stok değeri çok yüksek — doğruluğunu kontrol edin`,
        });
      }
    }
  }

  return anomalies;
}

// ══════════════════════════════════════════════════════════
// ANA IMPORT FONKSİYONU
// ══════════════════════════════════════════════════════════

export async function smartImport(
  buffer: Buffer,
  options?: { type?: ImportType; productSku?: string; dryRun?: boolean }
): Promise<ImportResult> {
  const type = options?.type || "auto";
  const productSku = options?.productSku || MAIN_SKU;
  const dryRun = options?.dryRun ?? false;

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

  if (rawData.length === 0) {
    return {
      success: false, detectedType: type, totalRows: 0,
      imported: 0, updated: 0, skipped: 0,
      errors: [{ row: 0, reason: "Dosya boş veya okunamadı" }],
      anomalies: [], columnMapping: {}, preview: [],
      message: "Dosya boş veya geçerli veri bulunamadı",
    };
  }

  // Kolon eşleme
  const headers = Object.keys(rawData[0]);
  const { mapping, type: detectedType } = mapColumns(headers);
  const finalType = type === "auto" ? detectedType : type;

  if (finalType === "auto") {
    return {
      success: false, detectedType: "auto", totalRows: rawData.length,
      imported: 0, updated: 0, skipped: 0,
      errors: [{ row: 0, reason: `Kolon isimleri tanınamadı. Bulunan kolonlar: ${headers.join(", ")}` }],
      anomalies: [], columnMapping: mapping,
      preview: rawData.slice(0, 3),
      message: "Dosya tipi otomatik tespit edilemedi. Lütfen tip belirtin.",
    };
  }

  // Anomali tespiti
  const anomalies = detectAnomalies(rawData, finalType, mapping);
  const criticalAnomalies = anomalies.filter(a => a.severity === "critical");

  // Preview (ilk 5 satır)
  const preview = rawData.slice(0, 5);

  // Dry run — sadece analiz, import yapma
  if (dryRun) {
    return {
      success: true, detectedType: finalType, totalRows: rawData.length,
      imported: 0, updated: 0, skipped: 0,
      errors: [], anomalies, columnMapping: mapping, preview,
      message: `${rawData.length} satır analiz edildi. ${anomalies.length} anomali tespit edildi. ${criticalAnomalies.length} kritik.`,
    };
  }

  // Gerçek import
  const errors: ImportError[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  switch (finalType) {
    case "sales_history": {
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const year = parseInt(String(row[mapping.year]));
        const month = parseInt(String(row[mapping.month]));
        const qty = parseInt(String(row[mapping.quantity]));
        const rev = mapping.revenue ? row[mapping.revenue] : null;

        if (isNaN(year) || isNaN(month) || isNaN(qty) || month < 1 || month > 12) {
          errors.push({ row: i + 2, reason: `Geçersiz veri: yıl=${row[mapping.year]}, ay=${row[mapping.month]}, adet=${row[mapping.quantity]}` });
          skipped++;
          continue;
        }

        const [existing] = await db.select().from(salesHistory)
          .where(and(eq(salesHistory.productSku, productSku), eq(salesHistory.year, year), eq(salesHistory.month, month)));

        if (existing) {
          await db.update(salesHistory)
            .set({ quantitySold: qty, revenue: rev ? String(rev) : null, source: "excel", importedAt: new Date() })
            .where(eq(salesHistory.id, existing.id));
          updated++;
        } else {
          await db.insert(salesHistory).values({ productSku, year, month, quantitySold: qty, revenue: rev ? String(rev) : null, source: "excel" });
          imported++;
        }
      }
      break;
    }
    case "component_stock": {
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const code = String(row[mapping.componentCode]).trim();
        const stock = parseFloat(String(row[mapping.stock]));

        if (!code || isNaN(stock)) {
          errors.push({ row: i + 2, reason: `Geçersiz veri: kod=${row[mapping.componentCode]}, stok=${row[mapping.stock]}` });
          skipped++;
          continue;
        }

        const [existing] = await db.select().from(componentStock)
          .where(eq(componentStock.componentCode, code));

        if (existing) {
          await db.update(componentStock)
            .set({ currentStock: String(stock), updatedAt: new Date() })
            .where(eq(componentStock.componentCode, code));
          updated++;
        } else {
          errors.push({ row: i + 2, column: mapping.componentCode, value: code, reason: `Bileşen kodu bulunamadı: ${code}` });
          skipped++;
        }
      }
      break;
    }
    case "bom_update": {
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const code = String(row[mapping.componentCode]).trim();
        const name = mapping.name ? String(row[mapping.name]) : undefined;
        const qty = mapping.requiredQty ? parseFloat(String(row[mapping.requiredQty])) : undefined;

        if (!code) {
          errors.push({ row: i + 2, reason: "Bileşen kodu eksik" });
          skipped++;
          continue;
        }

        const [existing] = await db.select().from(bomItems)
          .where(eq(bomItems.componentCode, code));

        if (existing && qty !== undefined && !isNaN(qty)) {
          await db.update(bomItems)
            .set({ requiredQuantity: String(qty), ...(name ? { componentName: name } : {}) })
            .where(eq(bomItems.componentCode, code));
          updated++;
        } else if (!existing) {
          errors.push({ row: i + 2, value: code, reason: `BOM'da bulunamadı: ${code}` });
          skipped++;
        }
      }
      break;
    }
  }

  return {
    success: errors.length === 0 || imported + updated > 0,
    detectedType: finalType,
    totalRows: rawData.length,
    imported, updated, skipped,
    errors, anomalies, columnMapping: mapping, preview,
    message: `${imported} yeni kayıt, ${updated} güncelleme, ${skipped} atlandı. ${anomalies.length} anomali, ${errors.length} hata.`,
  };
}

// ══════════════════════════════════════════════════════════
// DOSYA ANALİZİ (dry-run)
// ══════════════════════════════════════════════════════════

export async function analyzeFile(buffer: Buffer): Promise<ImportResult> {
  return smartImport(buffer, { dryRun: true });
}
