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
import { getMonthlyDemandForSku } from "./seasonal-constants";

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export type ImportType = "sales_history" | "component_stock" | "bom_update" | "cukurova_bom_stock" | "auto";

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
  stock: ["stok", "stock", "STOK", "Stock", "envanter"],
  // BOM
  name: ["ad", "isim", "name", "bileşen_adı", "bilesen_adi", "Name", "AD"],
  requiredQty: ["gerekli", "required", "miktar_gerekli", "adet_gerekli", "qty"],
  unit: ["birim", "unit", "BIRIM", "Unit"],
  tier: ["tier", "seviye", "kademe", "TIER"],
};

// ══════════════════════════════════════════════════════════
// ÇUKUROVA FORMAT TESPİTİ
// Çukurova ERP'sinden gelen XLS: Stok Kodu | Stok İsmi | Sıra No | Miktar | Br | Br.Maliyet | T.Maliyet | Stok Sevi.
// Bu dosya hem BOM (Miktar = adet/ürün) hem Stok (Stok Sevi. = mevcut stok) içerir
// ══════════════════════════════════════════════════════════

interface CukurovaMapping {
  stokKodu: string;
  stokIsmi: string;
  siraNo: string;
  miktar: string;
  birim: string;
  stokSeviyesi: string;
  variant: "bom_stock" | "stock_only";  // bom_stock = full BOM+stok, stock_only = sadece stok bakiye
}

// Turkish character normalization helper
function turkishNorm(h: string): string {
  return h.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/gi, "i").replace(/ı/g, "i")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/ç/g, "c").replace(/ğ/g, "g")
    .replace(/\s+/g, "_").replace(/\./g, "");
}

function detectCukurovaFormat(headers: string[]): CukurovaMapping | null {
  const normalized = headers.map(turkishNorm);

  const stokKoduIdx = normalized.findIndex(h => h === "stok_kodu");
  const stokIsmiIdx = normalized.findIndex(h => h.startsWith("stok_ism"));
  const miktarIdx = normalized.findIndex(h => h === "miktar");
  const stokSeviIdx = normalized.findIndex(h => h.startsWith("stok_sevi"));
  const stokBakiyeIdx = normalized.findIndex(h => h.startsWith("stok_bakiye"));
  const brIdx = normalized.findIndex(h => h === "br" || h === "birim");
  const siraNoIdx = normalized.findIndex(h => h === "sira_no" || h === "sira" || h.startsWith("sira_no"));

  // Variant 1: Full BOM+Stok (Stok Kodu + Stok İsmi + Miktar + Stok Sevi.)
  if (stokKoduIdx >= 0 && stokIsmiIdx >= 0 && miktarIdx >= 0 && stokSeviIdx >= 0) {
    return {
      stokKodu: headers[stokKoduIdx],
      stokIsmi: headers[stokIsmiIdx],
      siraNo: siraNoIdx >= 0 ? headers[siraNoIdx] : "",
      miktar: headers[miktarIdx],
      birim: brIdx >= 0 ? headers[brIdx] : "",
      stokSeviyesi: headers[stokSeviIdx],
      variant: "bom_stock",
    };
  }

  // Variant 2: Stock-only (Stok Kodu + Stok İsmi + Stok Bakiyesi) — GSS20P gibi
  if (stokKoduIdx >= 0 && stokIsmiIdx >= 0 && stokBakiyeIdx >= 0) {
    return {
      stokKodu: headers[stokKoduIdx],
      stokIsmi: headers[stokIsmiIdx],
      siraNo: "",
      miktar: "",       // yok bu formatta
      birim: "",
      stokSeviyesi: headers[stokBakiyeIdx],
      variant: "stock_only",
    };
  }

  return null;
}

// Yarı mamül tespiti: indent seviyesine göre parent-child ilişkisi
// Çukurova ERP'de child bileşenler daha fazla leading space ile gelir (9+ vs 5)
function detectIndentLevel(rawCode: string): number {
  const leadingSpaces = rawCode.length - rawCode.trimStart().length;
  // 0 spaces = ürün satırı, ~5 = tier 1, ~9+ = tier 2 (child)
  if (leadingSpaces >= 8) return 2;
  if (leadingSpaces >= 1) return 1;
  return 0;  // ürünün kendisi
}

function mapColumns(headers: string[]): { mapping: Record<string, string>; type: ImportType; cukurovaMapping?: CukurovaMapping } {
  // 1. Çukurova format kontrolü — öncelikli (daha spesifik)
  const cukurova = detectCukurovaFormat(headers);
  if (cukurova) {
    const mapping: Record<string, string> = {
      componentCode: cukurova.stokKodu,
      name: cukurova.stokIsmi,
      stock: cukurova.stokSeviyesi,
    };
    if (cukurova.miktar) mapping.requiredQty = cukurova.miktar;
    if (cukurova.birim) mapping.unit = cukurova.birim;
    return {
      mapping,
      type: "cukurova_bom_stock",
      cukurovaMapping: cukurova,
    };
  }

  // 2. Genel alias eşleme
  const mapping: Record<string, string> = {};
  const lowerHeaders = headers.map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (let i = 0; i < headers.length; i++) {
      const header = lowerHeaders[i];
      // Exact match first, then includes — avoid "stok_kodu" matching "stok" alias
      if (aliases.some(a => a.toLowerCase() === header)) {
        mapping[canonical] = headers[i];
        break;
      }
    }
    // Fallback: includes match (only if no exact match found)
    if (!mapping[canonical]) {
      for (let i = 0; i < headers.length; i++) {
        if (mapping[canonical]) break;
        const header = lowerHeaders[i];
        if (aliases.some(a => header.includes(a.toLowerCase()) && !Object.values(mapping).includes(headers[i]))) {
          mapping[canonical] = headers[i];
          break;
        }
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

function detectAnomalies(rows: Record<string, any>[], type: ImportType, mapping: Record<string, string>, monthlyDemandExpected?: number[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (type === "sales_history" && monthlyDemandExpected && monthlyDemandExpected.some(d => d > 0)) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const qty = Number(row[mapping.quantity]);
      const month = Number(row[mapping.month]);

      if (!isNaN(qty) && !isNaN(month) && month >= 1 && month <= 12) {
        const expected = monthlyDemandExpected[month - 1];
        if (!expected || expected <= 0) continue;
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

  if (type === "component_stock" || type === "cukurova_bom_stock") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const stock = Number(row[mapping.stock]);
      const code = row[mapping.componentCode];
      const rawCode = String(code ?? "").trim();

      // Skip non-component rows (product line, totals)
      if (!rawCode || rawCode.toLowerCase().includes("toplam")) continue;

      if (!isNaN(stock) && stock < 0) {
        anomalies.push({
          row: i + 2, column: mapping.stock, value: stock,
          expected: "≥ 0", severity: "critical",
          reason: `${rawCode} negatif stok değeri`,
        });
      }
      if (!isNaN(stock) && stock > 50000) {
        anomalies.push({
          row: i + 2, column: mapping.stock, value: stock,
          expected: "< 50000", severity: "warning",
          reason: `${rawCode} stok değeri çok yüksek — doğruluğunu kontrol edin`,
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
  const productSku = options?.productSku;
  if (!productSku) throw new Error("productSku gerekli — hangi ürün için import yapılıyor?");
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
  const { mapping, type: detectedType, cukurovaMapping } = mapColumns(headers);
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

  // Anomali tespiti — fetch expected demand dynamically for the product
  let monthlyDemandExpected: number[] | undefined;
  try {
    const demandData = await getMonthlyDemandForSku(productSku);
    if (demandData.annual > 0) {
      monthlyDemandExpected = demandData.demand;
    }
  } catch {
    // No sales history yet — skip anomaly detection
  }
  const anomalies = detectAnomalies(rawData, finalType, mapping, monthlyDemandExpected);
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
          .where(and(eq(bomItems.componentCode, code), eq(bomItems.parentProductSku, productSku)));

        if (existing && qty !== undefined && !isNaN(qty)) {
          await db.update(bomItems)
            .set({ requiredQuantity: String(qty), ...(name ? { componentName: name } : {}) })
            .where(and(eq(bomItems.componentCode, code), eq(bomItems.parentProductSku, productSku)));
          updated++;
        } else if (!existing) {
          errors.push({ row: i + 2, value: code, reason: `BOM'da bulunamadı: ${code}` });
          skipped++;
        }
      }
      break;
    }
    case "cukurova_bom_stock": {
      // Çukurova ERP formatı — 2 varyant:
      // A) bom_stock: BOM + Stok hibrit (Stok Kodu/İsmi/Miktar/Stok Sevi.)
      // B) stock_only: Sadece stok bakiye (Stok Kodu/İsmi/Stok Bakiyesi)
      //
      // Yarı mamül tespiti: indent >= 8 → child (tier 2), parent = son tier-1 satır
      // İlk satır = ürünün kendisi (indent=0), son satırlar = toplamlar → skip
      if (!cukurovaMapping) break;

      const isStockOnly = cukurovaMapping.variant === "stock_only";
      let bomUpdated = 0;
      let stockUpdated = 0;
      let subAssemblyCount = 0;
      let currentParentCode: string | null = null;

      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const rawCodeField = String(row[cukurovaMapping.stokKodu] ?? "");
        const rawCode = rawCodeField.trim();
        const name = String(row[cukurovaMapping.stokIsmi] ?? "").trim();
        const stokSeviyesi = parseFloat(String(row[cukurovaMapping.stokSeviyesi] ?? ""));
        const birim = cukurovaMapping.birim ? String(row[cukurovaMapping.birim] ?? "").trim() : "AD";

        // Skip: boş satır
        if (!rawCode) { skipped++; continue; }

        // Skip: toplam/maliyet satırları
        const rawCodeLower = rawCode.toLowerCase();
        if (rawCodeLower.includes("toplam") || rawCodeLower.includes("toplami") ||
            rawCodeLower.includes("maliyet") || rawCodeLower.includes("malzeme")) {
          skipped++;
          continue;
        }

        // Indent seviyesi — yarı mamül tespiti
        const indentLevel = detectIndentLevel(rawCodeField);

        // Skip: ürünün kendisi (indent=0, ilk satır genelde)
        if (indentLevel === 0) {
          skipped++;
          continue;
        }

        // Tier belirleme
        const isChild = indentLevel >= 2;
        const tier = isChild ? 2 : 1;

        if (!isChild) {
          currentParentCode = rawCode;
        }
        if (isChild) {
          subAssemblyCount++;
        }

        // --- BOM güncelleme (sadece bom_stock varyantında) ---
        if (!isStockOnly && cukurovaMapping.miktar) {
          const miktar = parseFloat(String(row[cukurovaMapping.miktar] ?? ""));
          if (!isNaN(miktar)) {
            const [bomExisting] = await db.select().from(bomItems)
              .where(and(eq(bomItems.componentCode, rawCode), eq(bomItems.parentProductSku, productSku)));

            if (bomExisting) {
              const updateData: Record<string, any> = {
                requiredQuantity: String(miktar),
                tier,
              };
              if (name) updateData.componentName = name;
              if (isChild && currentParentCode) {
                updateData.parentComponentCode = currentParentCode;
              }
              await db.update(bomItems)
                .set(updateData)
                .where(and(eq(bomItems.componentCode, rawCode), eq(bomItems.parentProductSku, productSku)));
              bomUpdated++;
            }
          }
        }

        // --- Stok güncelleme ---
        if (!isNaN(stokSeviyesi)) {
          const [stockExisting] = await db.select().from(componentStock)
            .where(eq(componentStock.componentCode, rawCode));

          if (stockExisting) {
            await db.update(componentStock)
              .set({
                currentStock: String(stokSeviyesi),
                unit: birim || stockExisting.unit,
                lastCountedAt: new Date(),
                lastCountedBy: "cukurova_import",
                updatedAt: new Date(),
              })
              .where(eq(componentStock.componentCode, rawCode));
            stockUpdated++;
          } else {
            await db.insert(componentStock).values({
              componentCode: rawCode,
              currentStock: String(stokSeviyesi),
              unit: birim || "AD",
              lastCountedBy: "cukurova_import",
            });
            imported++;
          }
        }

        updated++;
      }

      const variantLabel = isStockOnly ? "Stok Bakiye" : "BOM+Stok";
      const subNote = subAssemblyCount > 0
        ? ` ${subAssemblyCount} yarı mamül alt bileşeni tespit edildi (tier 2).`
        : "";
      return {
        success: true,
        detectedType: finalType,
        totalRows: rawData.length,
        imported, updated, skipped,
        errors, anomalies, columnMapping: mapping, preview,
        message: `Çukurova ${variantLabel}: ${bomUpdated} BOM, ${stockUpdated} stok güncellendi, ${imported} yeni kayıt, ${skipped} atlandı.${subNote}`,
      };
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
  return smartImport(buffer, { dryRun: true, productSku: "__analyze__" });
}
