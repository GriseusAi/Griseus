import * as XLSX from "xlsx";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  operations, schedules, productionLines, capacityMetrics,
  geWorkers, workerCapabilities, kpiDefinitions, kpiRecords,
  facilities, products,
} from "@shared/schema";

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */

export interface IngestResult {
  success: boolean;
  file_name: string;
  parser_used: string;
  records_processed: number;
  records_inserted: number;
  records_updated: number;
  tables_affected: string[];
  summary: string;
}

interface IngestError {
  success: false;
  error: string;
  supported_formats: string[];
}

const SUPPORTED = ["Elektrikli İmalat", "Gazlı İmalat", "Kapasite", "Personel", "KPI", "İş Akış"];

/* ═══════════════════════════════════════════════════════════════════════
   PARSER DETECTION
   ═══════════════════════════════════════════════════════════════════════ */

type ParserFn = (wb: XLSX.WorkBook, fileName: string) => Promise<IngestResult>;

/** Filename-based hint (used as tiebreaker, not required) */
function detectParserByName(fileName: string): { name: string; fn: ParserFn } | null {
  const f = fileName.toUpperCase();
  if (f.includes("ELEKT")) return { name: "ElektrikliParser", fn: parseElektrikli };
  if (f.includes("GAZL")) return { name: "GazliParser", fn: parseGazli };
  if (f.includes("KAPAS")) return { name: "KapasiteParser", fn: parseKapasite };
  if (f.includes("PERSON")) return { name: "PersonelParser", fn: parsePersonel };
  if (f.includes("KPI")) return { name: "KPIParser", fn: parseKPI };
  if (f.includes("AKIS") || f.includes("NETSIS")) return { name: "IsAkisParser", fn: parseIsAkis };
  return null;
}

/** Content-based parser detection — examines sheet names and cell contents */
export function detectParserFromContent(wb: XLSX.WorkBook, fileName: string): { name: string; fn: ParserFn } | null {
  // 1. Filename hint takes priority when available
  const byName = detectParserByName(fileName);
  if (byName) return byName;

  // 2. Analyse sheet names
  const sheetsUpper = wb.SheetNames.map(s => s.toUpperCase()).join(" ");

  // Weekly sheets (e.g. "44.HAFTA") → production data → need to check if elektrikli or gazlı
  const hasWeeklySheets = wb.SheetNames.some(n => /\d+\.?\s*HAFTA/i.test(n));

  // KPI sheets
  if (/KPI|GÖSTERGE|GOSTERGE|PERFORMANS/.test(sheetsUpper)) return { name: "KPIParser", fn: parseKPI };

  // Capability matrix / iş akış
  if (/KİŞİLER|KISILER|YETKİ|YETKI|MATRİS|MATRIS/.test(sheetsUpper)) return { name: "IsAkisParser", fn: parseIsAkis };

  // Personel
  if (/PERSONEL|ÇALIŞAN|CALISAN/.test(sheetsUpper)) return { name: "PersonelParser", fn: parsePersonel };

  // Kapasite
  if (/KAPASİTE|KAPASITE|CAPACITY/.test(sheetsUpper)) return { name: "KapasiteParser", fn: parseKapasite };

  // 3. Scan cell contents of first sheet (first 50 rows) to detect type
  const firstSheet = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheet];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  const sampleText = rows.slice(0, 50).flat().map(c => String(c || "").toUpperCase()).join(" ");

  // Production data with weekly sheets → check for line type
  if (hasWeeklySheets || /HAFTA/.test(sampleText)) {
    if (/ELEKTRİKLİ|ELEKTRIKLI/.test(sampleText)) return { name: "ElektrikliParser", fn: parseElektrikli };
    if (/GAZLI|GAZ\b/.test(sampleText)) return { name: "GazliParser", fn: parseGazli };
    // Has weekly sheets but can't determine line → default to elektrikli (more common)
    return { name: "ElektrikliParser", fn: parseElektrikli };
  }

  // KPI-like content
  if (/KPI|HEDEF.*GERÇEK|TARGET.*ACTUAL/.test(sampleText)) return { name: "KPIParser", fn: parseKPI };

  // Kapasite content
  if (/KAPASİTE|KAPASITE|TEORİK|TEORIK|BİRİM SÜRE|BIRIM SURE/.test(sampleText)) return { name: "KapasiteParser", fn: parseKapasite };

  // Personel content
  if (/SİCİL|SICIL|PERSONEL|TC KİMLİK|DEPARTMAN/.test(sampleText)) return { name: "PersonelParser", fn: parsePersonel };

  // Capability matrix — header row has many short column names and body has 1/X/✓ values
  const headerRow = rows[0] || [];
  if (headerRow.length > 5) {
    const bodyValues = rows.slice(1, 10).flat().map(c => String(c || "").trim().toUpperCase());
    const markerCount = bodyValues.filter(v => ["1", "X", "✓", "✔", "EVET", "VAR"].includes(v)).length;
    if (markerCount > bodyValues.length * 0.15) return { name: "IsAkisParser", fn: parseIsAkis };
  }

  // Production data without weekly sheets
  if (/TOPLAM|DEPOYA|SEVK|ÜRETİM|URETIM/.test(sampleText)) {
    if (/ELEKTRİKLİ|ELEKTRIKLI/.test(sampleText)) return { name: "ElektrikliParser", fn: parseElektrikli };
    if (/GAZLI|GAZ\b/.test(sampleText)) return { name: "GazliParser", fn: parseGazli };
    return { name: "ElektrikliParser", fn: parseElektrikli };
  }

  return null;
}

/** AI-powered parser detection — sends column headers to Claude */
export async function detectParserWithAI(wb: XLSX.WorkBook): Promise<{ name: string; fn: ParserFn } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Collect headers: sheet names + first 3 rows of each sheet (max 3 sheets)
  const sheetSamples: string[] = [];
  for (const sName of wb.SheetNames.slice(0, 3)) {
    const ws = wb.Sheets[sName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
    const sample = rows.slice(0, 3).map(r => r.map(c => String(c || "").substring(0, 40)).join(" | ")).join("\n");
    sheetSamples.push(`Sheet "${sName}":\n${sample}`);
  }

  const prompt = `Asagidaki Excel dosyasinin sheet isimleri ve kolon basliklarini inceleyerek dosya turunu belirle.
Sadece su turlerden birini yaz, baska hicbir sey yazma:
elektrikli, gazli, kapasite, personel, kpi, isakis, bilinmiyor

Sheet listesi: ${wb.SheetNames.join(", ")}

Icerik ornekleri:
${sheetSamples.join("\n\n")}

Dosya turu:`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 20, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await resp.json();
    const answer = (data.content?.[0]?.text || "").trim().toLowerCase();
    console.log("[Ingest AI] Claude response:", answer);

    const map: Record<string, { name: string; fn: ParserFn } | null> = {
      elektrikli: { name: "ElektrikliParser", fn: parseElektrikli },
      gazli: { name: "GazliParser", fn: parseGazli },
      kapasite: { name: "KapasiteParser", fn: parseKapasite },
      personel: { name: "PersonelParser", fn: parsePersonel },
      kpi: { name: "KPIParser", fn: parseKPI },
      isakis: { name: "IsAkisParser", fn: parseIsAkis },
    };

    return map[answer] || null;
  } catch (err: any) {
    console.error("[Ingest AI] Detection failed:", err.message);
    return null;
  }
}

/** Resolve parser by manual type string from frontend dropdown */
export function getParserByType(type: string): { name: string; fn: ParserFn } | null {
  const map: Record<string, { name: string; fn: ParserFn }> = {
    elektrikli: { name: "ElektrikliParser", fn: parseElektrikli },
    gazli: { name: "GazliParser", fn: parseGazli },
    kapasite: { name: "KapasiteParser", fn: parseKapasite },
    personel: { name: "PersonelParser", fn: parsePersonel },
    kpi: { name: "KPIParser", fn: parseKPI },
    isakis: { name: "IsAkisParser", fn: parseIsAkis },
  };
  return map[type.toLowerCase()] || null;
}

/** @deprecated Use detectParserFromContent instead */
export function detectParser(fileName: string): { name: string; fn: ParserFn } | null {
  return detectParserByName(fileName);
}

export function getIngestError(fileName: string): IngestError {
  return { success: false, error: `Dosya içeriği tanınamadı: "${fileName}". İçerikte üretim, kapasite, personel, KPI veya yetki matrisi verisi bulunamadı.`, supported_formats: SUPPORTED };
}

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Normalize Turkish text for flexible matching.
 * Strips diacritics so "İMALAT TARİHİ" and "IMALAT TARIHI" match,
 * "GERÇEKLEŞEN" and "GERCEKLESEN" match, etc.
 */
function normalizeTR(text: string): string {
  return text
    .toUpperCase()
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/ı/gi, "I")
    .replace(/ş/gi, "S")
    .replace(/ç/gi, "C")
    .replace(/ğ/gi, "G")
    .replace(/ü/gi, "U")
    .replace(/ö/gi, "O");
}

/** Normalize a row of cells into a single searchable string */
function rowToNorm(row: any[]): string {
  return normalizeTR(row.map((c: any) => String(c || "")).join(" "));
}

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): any[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
}

function findSheetByPattern(wb: XLSX.WorkBook, pattern: RegExp): string | null {
  // Match against both original and normalized sheet names
  return wb.SheetNames.find(n => pattern.test(n) || pattern.test(normalizeTR(n))) || null;
}

function findWeeklySheets(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames.filter(n => {
    const norm = normalizeTR(n);
    // "44.HAFTA", "44 HAFTA", "44. HAFTA"
    if (/\d+\.?\s*HAFTA/i.test(norm)) return true;
    // "2026-W11", "W11", "W-11"
    if (/W-?\d+/i.test(n)) return true;
    // "Week 11", "Week11"
    if (/WEEK\s*\d+/i.test(n)) return true;
    return false;
  });
}

/** Extract week number from sheet name */
function extractWeekNum(sheetName: string): string {
  // "2026-W11" → "11", "W-11" → "11", "W11" → "11"
  let m = sheetName.match(/W-?(\d+)/i);
  if (m) return m[1];
  // "Week 11" → "11"
  m = sheetName.match(/WEEK\s*(\d+)/i);
  if (m) return m[1];
  // "44.HAFTA" → "44"
  m = sheetName.match(/(\d+)/);
  return m ? m[1] : sheetName;
}

async function getLineId(type: "elektrikli" | "gazli"): Promise<number | null> {
  const lines = await db.select().from(productionLines);
  const line = lines.find(l => (l.type || "").toLowerCase() === type);
  return line ? line.id : null;
}

/* ═══════════════════════════════════════════════════════════════════════
   ELEKTRIKLI PARSER
   ═══════════════════════════════════════════════════════════════════════ */

async function parseElektrikli(wb: XLSX.WorkBook, fileName: string): Promise<IngestResult> {
  const lineId = await getLineId("elektrikli");
  if (!lineId) throw new Error("Elektrikli hat bulunamadı");

  // Önce bu hat'ın mevcut verilerini toptan sil
  console.log("[ElektrikliParser] Deleting all existing data for lineId:", lineId);
  await db.delete(operations).where(eq(operations.lineId, lineId));
  await db.delete(schedules).where(eq(schedules.lineId, lineId));
  console.log("[ElektrikliParser] Cleared operations + schedules for lineId:", lineId);

  let processed = 0, inserted = 0, updated = 0;
  const tables: Set<string> = new Set();

  // ── DETAYLI sheet: aylık üretim verisi
  const detaySheet = findSheetByPattern(wb, /DETAYLI|DETAY|GENEL/i) || wb.SheetNames[0];
  const rows = sheetToRows(wb, detaySheet);

  // Parse monthly totals from TOPLAM rows
  const monthlyTotals: { month: string; qty: number }[] = [];
  // Normalized month names (no diacritics) for matching
  const monthNamesNorm = ["OCAK", "SUBAT", "MART", "NISAN", "MAYIS", "HAZIRAN", "TEMMUZ", "AGUSTOS", "EYLUL", "EKIM", "KASIM", "ARALIK"];
  // Display names for notes
  const monthNamesDisplay = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowStr = rowToNorm(row);

    // Look for TOPLAM rows that contain month totals
    if (rowStr.includes("TOPLAM")) {
      for (let j = row.length - 1; j >= 0; j--) {
        const val = Number(row[j]);
        if (val > 0 && val < 100000) {
          let monthIdx = -1;
          // Check row itself for month name
          for (let m = 0; m < monthNamesNorm.length; m++) {
            if (rowStr.includes(monthNamesNorm[m])) { monthIdx = m; break; }
          }
          // Check preceding rows for month context
          if (monthIdx < 0) {
            for (let k = Math.max(0, i - 30); k < i; k++) {
              const prevStr = rowToNorm(rows[k]);
              for (let m = 0; m < monthNamesNorm.length; m++) {
                if (prevStr.includes(monthNamesNorm[m])) monthIdx = m;
              }
            }
          }
          if (monthIdx >= 0) {
            monthlyTotals.push({ month: monthNamesDisplay[monthIdx], qty: val });
            processed++;
          }
          break;
        }
      }
    }
  }

  // Write operations (monthly aggregates)
  for (const mt of monthlyTotals) {
    const monthIdx = monthNamesDisplay.indexOf(mt.month);
    const periodDate = `2025-${String(monthIdx + 1).padStart(2, "0")}-01`;

    await db.insert(operations).values({
      lineId, actualQty: mt.qty, plannedDate: periodDate,
      status: "completed", notes: `Excel import: ${mt.month}`,
    });
    inserted++;
    tables.add("operations");
  }

  // ── Weekly sheets: haftalık plan vs gerçek
  const weeklySheets = findWeeklySheets(wb);
  for (const wsName of weeklySheets) {
    const wRows = sheetToRows(wb, wsName);
    const weekNum = extractWeekNum(wsName);
    const periodValue = `H${weekNum}`;

    let plannedQty = 0, actualQty = 0;

    for (const row of wRows) {
      const rowStr = rowToNorm(row);

      // "DEPOYA SEVK EDİLEN TOPLAM" or similar
      if ((rowStr.includes("DEPOYA") && rowStr.includes("TOPLAM")) || (rowStr.includes("SEVK") && rowStr.includes("TOPLAM"))) {
        for (let j = 0; j < row.length; j++) {
          const val = Number(row[j]);
          if (val > 0 && val < 10000) {
            if (!plannedQty) plannedQty = val;
            else if (!actualQty) actualQty = val;
          }
        }
      }

      // Plan/hedef/imalat keywords
      if (rowStr.includes("PLAN") || rowStr.includes("HEDEF") || rowStr.includes("IMALAT")) {
        for (let j = row.length - 1; j >= 0; j--) {
          const val = Number(row[j]);
          if (val > 0 && val < 10000) { plannedQty = val; break; }
        }
      }
      // Gerçekleşen/fiili/actual keywords — all normalized
      if (rowStr.includes("GERCEKLESEN") || rowStr.includes("GERCEKLESMIS") || rowStr.includes("FIILI") || rowStr.includes("ACTUAL")) {
        for (let j = row.length - 1; j >= 0; j--) {
          const val = Number(row[j]);
          if (val > 0 && val < 10000) { actualQty = val; break; }
        }
      }
    }

    if (plannedQty > 0 || actualQty > 0) {
      processed++;
      const deviationPct = plannedQty > 0 ? String(Math.round(((actualQty - plannedQty) / plannedQty) * 100)) : "0";

      await db.insert(schedules).values({ lineId, periodType: "weekly", periodValue, plannedQty, actualQty, deviationPct });
      inserted++;
      tables.add("schedules");
    }
  }

  // ── GENEL/DETAYLI sheet: rows containing "ELEKTRIKLI" or "ELT." with production data
  for (let i = 0; i < rows.length; i++) {
    const rowStr = rowToNorm(rows[i]);
    // Match rows that reference this line type
    if (!(rowStr.includes("ELEKTRIKLI") || rowStr.includes("ELT."))) continue;
    // Skip if already captured via TOPLAM logic
    if (rowStr.includes("TOPLAM")) continue;

    // Try to extract plan and actual quantities from the row
    const nums: number[] = [];
    for (const cell of rows[i]) {
      const v = Number(cell);
      if (v > 0 && v < 100000) nums.push(v);
    }
    if (nums.length === 0) continue;

    // If row has a week/period reference, treat as schedule data
    const weekRef = rowStr.match(/H(\d+)|W-?(\d+)|HAFTA\s*(\d+)/);
    if (weekRef && nums.length >= 1) {
      const wn = weekRef[1] || weekRef[2] || weekRef[3];
      const pv = `H${wn}`;
      const pQty = nums[0];
      const aQty = nums.length >= 2 ? nums[1] : 0;
      const devPct = pQty > 0 ? String(Math.round(((aQty - pQty) / pQty) * 100)) : "0";

      await db.insert(schedules).values({ lineId, periodType: "weekly", periodValue: pv, plannedQty: pQty, actualQty: aQty, deviationPct: devPct });
      inserted++;
      processed++;
      tables.add("schedules");
    } else if (nums.length >= 1) {
      // No week ref — treat as a production operation row
      await db.insert(operations).values({
        lineId, actualQty: nums[0], status: "completed",
        notes: `Excel import: GENEL sheet satır ${i + 1}`,
      });
      inserted++;
      processed++;
      tables.add("operations");
    }
  }

  return {
    success: true, file_name: fileName, parser_used: "ElektrikliParser",
    records_processed: processed, records_inserted: inserted, records_updated: updated,
    tables_affected: [...tables],
    summary: `Elektrikli hat: ${monthlyTotals.length} aylık üretim ve ${weeklySheets.length} haftalık çizelge güncellendi`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   GAZLI PARSER
   ═══════════════════════════════════════════════════════════════════════ */

async function parseGazli(wb: XLSX.WorkBook, fileName: string): Promise<IngestResult> {
  const lineId = await getLineId("gazli");
  if (!lineId) throw new Error("Gazlı hat bulunamadı");

  // Önce bu hat'ın mevcut verilerini toptan sil
  console.log("[GazliParser] Deleting all existing data for lineId:", lineId);
  await db.delete(operations).where(eq(operations.lineId, lineId));
  await db.delete(schedules).where(eq(schedules.lineId, lineId));
  console.log("[GazliParser] Cleared operations + schedules for lineId:", lineId);

  let processed = 0, inserted = 0, updated = 0;
  const tables: Set<string> = new Set();

  // GENEL sheet: aylık toplamlar
  const genelSheet = findSheetByPattern(wb, /GENEL|DETAYLI|DETAY/i) || wb.SheetNames[0];
  const rows = sheetToRows(wb, genelSheet);

  const monthlyTotals: { month: string; qty: number }[] = [];
  const monthNamesNorm = ["OCAK", "SUBAT", "MART", "NISAN", "MAYIS", "HAZIRAN", "TEMMUZ", "AGUSTOS", "EYLUL", "EKIM", "KASIM", "ARALIK"];
  const monthNamesDisplay = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowStr = rowToNorm(row);

    if (rowStr.includes("TOPLAM")) {
      for (let j = row.length - 1; j >= 0; j--) {
        const val = Number(row[j]);
        if (val > 0 && val < 100000) {
          let monthIdx = -1;
          for (let m = 0; m < monthNamesNorm.length; m++) {
            if (rowStr.includes(monthNamesNorm[m])) { monthIdx = m; break; }
          }
          if (monthIdx < 0) {
            for (let k = Math.max(0, i - 30); k < i; k++) {
              const prevStr = rowToNorm(rows[k]);
              for (let m = 0; m < monthNamesNorm.length; m++) { if (prevStr.includes(monthNamesNorm[m])) monthIdx = m; }
            }
          }
          if (monthIdx >= 0) {
            monthlyTotals.push({ month: monthNamesDisplay[monthIdx], qty: val });
            processed++;
          }
          break;
        }
      }
    }
  }

  // Write operations (monthly aggregates)
  for (const mt of monthlyTotals) {
    const monthIdx = monthNamesDisplay.indexOf(mt.month);
    const periodDate = `2025-${String(monthIdx + 1).padStart(2, "0")}-01`;

    await db.insert(operations).values({
      lineId, actualQty: mt.qty, plannedDate: periodDate,
      status: "completed", notes: `Excel import: ${mt.month}`,
    });
    inserted++;
    tables.add("operations");
  }

  // Haftalık sheets
  const weeklySheets = findWeeklySheets(wb);
  for (const wsName of weeklySheets) {
    const wRows = sheetToRows(wb, wsName);
    const weekMatch = wsName.match(/(\d+)/);
    const weekNum = weekMatch ? weekMatch[1] : wsName;
    const periodValue = `H${weekNum}`;

    let plannedQty = 0, actualQty = 0;

    for (const row of wRows) {
      const rowStr = rowToNorm(row);
      if ((rowStr.includes("DEPOYA") && rowStr.includes("TOPLAM")) || (rowStr.includes("SEVK") && rowStr.includes("TOPLAM"))) {
        for (let j = 0; j < row.length; j++) {
          const val = Number(row[j]);
          if (val > 0 && val < 10000) {
            if (!plannedQty) plannedQty = val;
            else if (!actualQty) actualQty = val;
          }
        }
      }
      if (rowStr.includes("PLAN") || rowStr.includes("HEDEF") || rowStr.includes("IMALAT")) {
        for (let j = row.length - 1; j >= 0; j--) {
          const val = Number(row[j]); if (val > 0 && val < 10000) { plannedQty = val; break; }
        }
      }
      if (rowStr.includes("GERCEKLESEN") || rowStr.includes("GERCEKLESMIS") || rowStr.includes("FIILI") || rowStr.includes("ACTUAL")) {
        for (let j = row.length - 1; j >= 0; j--) {
          const val = Number(row[j]); if (val > 0 && val < 10000) { actualQty = val; break; }
        }
      }
    }

    if (plannedQty > 0 || actualQty > 0) {
      processed++;
      const deviationPct = plannedQty > 0 ? String(Math.round(((actualQty - plannedQty) / plannedQty) * 100)) : "0";

      await db.insert(schedules).values({ lineId, periodType: "weekly", periodValue, plannedQty, actualQty, deviationPct });
      inserted++;
      tables.add("schedules");
    }
  }

  return {
    success: true, file_name: fileName, parser_used: "GazliParser",
    records_processed: processed, records_inserted: inserted, records_updated: updated,
    tables_affected: [...tables],
    summary: `Gazlı hat: ${monthlyTotals.length} aylık üretim ve ${weeklySheets.length} haftalık çizelge güncellendi`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   KAPASITE PARSER
   ═══════════════════════════════════════════════════════════════════════ */

async function parseKapasite(wb: XLSX.WorkBook, fileName: string): Promise<IngestResult> {
  let processed = 0, inserted = 0, updated = 0;
  const tables: Set<string> = new Set();

  const sheet = findSheetByPattern(wb, /KAPASİTE|KAPASITE|CAPACITY/i) || wb.SheetNames[0];
  const rows = sheetToRows(wb, sheet);

  // Look for lines and their capacity data — normalized patterns
  const lineTypes: Array<{ type: "elektrikli" | "gazli"; pattern: string }> = [
    { type: "elektrikli", pattern: "ELEKTRIKLI" },
    { type: "gazli", pattern: "GAZLI" },
  ];

  for (const lt of lineTypes) {
    const lineId = await getLineId(lt.type);
    if (!lineId) continue;

    let workerCount: number | null = null;
    let capacityUnitTime: number | null = null;
    let currentUnitTime: number | null = null;
    let dailyHours: number | null = null;

    for (const row of rows) {
      const rowStr = rowToNorm(row);
      if (!rowStr.includes(lt.pattern)) continue;

      processed++;

      // Extract numeric values based on normalized keywords
      if (rowStr.includes("KISI") || rowStr.includes("PERSONEL") || rowStr.includes("WORKER")) {
        for (const cell of row) { const v = Number(cell); if (v > 0 && v < 100) { workerCount = v; break; } }
      }
      if (rowStr.includes("TEORIK") || (rowStr.includes("KAPASITE") && rowStr.includes("BIRIM"))) {
        for (const cell of row) { const v = Number(cell); if (v > 0 && v < 120) { capacityUnitTime = v; break; } }
      }
      if (rowStr.includes("MEVCUT") || rowStr.includes("GUNCEL")) {
        for (const cell of row) { const v = Number(cell); if (v > 0 && v < 120) { currentUnitTime = v; break; } }
      }
      if (rowStr.includes("SAAT") || rowStr.includes("MESAI")) {
        for (const cell of row) { const v = Number(cell); if (v > 0 && v <= 24) { dailyHours = v; break; } }
      }
    }

    const updateData: Record<string, any> = {};
    if (workerCount !== null) updateData.workerCount = workerCount;
    if (capacityUnitTime !== null) updateData.capacityUnitTimeMin = String(capacityUnitTime);
    if (currentUnitTime !== null) updateData.currentUnitTimeMin = String(currentUnitTime);
    if (dailyHours !== null) updateData.dailyHours = String(dailyHours);

    if (Object.keys(updateData).length > 0) {
      await db.update(productionLines).set(updateData).where(eq(productionLines.id, lineId));
      updated++;
      tables.add("production_lines");
    }
  }

  return {
    success: true, file_name: fileName, parser_used: "KapasiteParser",
    records_processed: processed, records_inserted: inserted, records_updated: updated,
    tables_affected: [...tables],
    summary: `Kapasite verileri güncellendi (${updated} hat)`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   PERSONEL PARSER
   ═══════════════════════════════════════════════════════════════════════ */

async function parsePersonel(wb: XLSX.WorkBook, fileName: string): Promise<IngestResult> {
  let processed = 0, inserted = 0, updated = 0;
  const tables: Set<string> = new Set();

  // Try first sheet or "Personel" sheet
  const sheet = findSheetByPattern(wb, /PERSONEL|ÇALIŞAN|CALISAN|İSİM/i) || wb.SheetNames[0];
  const rows = sheetToRows(wb, sheet);

  // Get existing workers for dedup
  const existingWorkers = await db.select().from(geWorkers);
  const existingNames = new Set(existingWorkers.map(w => w.name.toUpperCase().trim()));

  // Skip header row, read names
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // First non-empty cell that looks like a name
    let name = "";
    let department = "";

    for (let j = 0; j < Math.min(row.length, 5); j++) {
      const cell = String(row[j] || "").trim();
      if (!cell || !isNaN(Number(cell))) continue;

      if (!name) {
        name = cell;
      } else if (!department) {
        department = cell;
      }
    }

    if (!name || name.length < 3) continue;
    processed++;

    // Dedup
    if (existingNames.has(name.toUpperCase().trim())) {
      continue; // skip duplicate
    }

    await db.insert(geWorkers).values({
      tenantId: "cukurova", name, department: department || null,
      status: "active",
    });
    existingNames.add(name.toUpperCase().trim());
    inserted++;
    tables.add("ge_workers");
  }

  return {
    success: true, file_name: fileName, parser_used: "PersonelParser",
    records_processed: processed, records_inserted: inserted, records_updated: updated,
    tables_affected: [...tables],
    summary: `${inserted} yeni personel eklendi (${processed - inserted} mevcut atlandı)`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   KPI PARSER
   ═══════════════════════════════════════════════════════════════════════ */

async function parseKPI(wb: XLSX.WorkBook, fileName: string): Promise<IngestResult> {
  let processed = 0, inserted = 0, updated = 0;
  const tables: Set<string> = new Set();

  const sheet = findSheetByPattern(wb, /KPI|GÖSTERGE|GOSTERGE|PERFORMANS/i) || wb.SheetNames[0];
  const rows = sheetToRows(wb, sheet);

  // Get existing KPI definitions
  const existingDefs = await db.select().from(kpiDefinitions);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const kpiName = String(row[0] || "").trim();
    if (!kpiName || kpiName.length < 2) continue;
    processed++;

    // Find or create KPI definition
    let kpiDef = existingDefs.find(d => d.name.toUpperCase() === kpiName.toUpperCase());
    if (!kpiDef) {
      const [newDef] = await db.insert(kpiDefinitions).values({
        tenantId: "cukurova", name: kpiName,
        unit: String(row[1] || ""), category: String(row[2] || ""),
      }).returning();
      kpiDef = newDef;
      tables.add("kpi_definitions");
    }

    // Try to read target and actual values from remaining columns
    const target = Number(row[3]) || null;
    const actual = Number(row[4]) || null;
    const period = String(row[5] || row[2] || "");

    if (target || actual) {
      const achievementPct = target && actual ? String(Math.round((actual / target) * 100)) : null;

      // Delete existing records for this KPI + period
      if (period) {
        await db.delete(kpiRecords)
          .where(and(eq(kpiRecords.kpiId, kpiDef.id), eq(kpiRecords.period, period)));
      }

      await db.insert(kpiRecords).values({
        kpiId: kpiDef.id, period,
        target: target ? String(target) : null,
        actual: actual ? String(actual) : null,
        achievementPct,
      });
      inserted++;
      tables.add("kpi_records");
    }
  }

  return {
    success: true, file_name: fileName, parser_used: "KPIParser",
    records_processed: processed, records_inserted: inserted, records_updated: updated,
    tables_affected: [...tables],
    summary: `${inserted} KPI kaydı eklendi`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   İŞ AKIŞ PARSER
   ═══════════════════════════════════════════════════════════════════════ */

async function parseIsAkis(wb: XLSX.WorkBook, fileName: string): Promise<IngestResult> {
  let processed = 0, inserted = 0, updated = 0;
  const tables: Set<string> = new Set();

  // Find "Kişiler" sheet or first sheet
  const sheet = findSheetByPattern(wb, /KİŞİLER|KISILER|PERSONEL|YETKİ/i) || wb.SheetNames[0];
  const rows = sheetToRows(wb, sheet);
  if (rows.length < 2) {
    return {
      success: true, file_name: fileName, parser_used: "IsAkisParser",
      records_processed: 0, records_inserted: 0, records_updated: 0,
      tables_affected: [], summary: "Dosyada veri bulunamadı",
    };
  }

  // Header row: first column is name, remaining are capability names
  const headerRow = rows[0];
  const capabilityNames: string[] = [];
  for (let j = 1; j < headerRow.length; j++) {
    const name = String(headerRow[j] || "").trim();
    if (name) capabilityNames.push(name);
    else capabilityNames.push(""); // placeholder
  }

  // Get existing workers
  const existingWorkers = await db.select().from(geWorkers);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const workerName = String(row[0] || "").trim();
    if (!workerName || workerName.length < 3) continue;
    processed++;

    // Find worker by name
    let worker = existingWorkers.find(w => w.name.toUpperCase().trim() === workerName.toUpperCase().trim());
    if (!worker) {
      // Create worker if not exists
      const [newWorker] = await db.insert(geWorkers).values({
        tenantId: "cukurova", name: workerName, status: "active",
      }).returning();
      worker = newWorker;
      existingWorkers.push(worker);
    }

    // Delete existing capabilities for this worker to replace with new matrix
    await db.delete(workerCapabilities).where(eq(workerCapabilities.workerId, worker.id));

    // Read capability matrix (1/X/✓ = has capability)
    let capCount = 0;
    for (let j = 1; j < row.length && j - 1 < capabilityNames.length; j++) {
      const cell = String(row[j] || "").trim().toUpperCase();
      const hasCap = cell === "1" || cell === "X" || cell === "✓" || cell === "✔" || cell === "EVET" || cell === "VAR";

      if (hasCap && capabilityNames[j - 1]) {
        await db.insert(workerCapabilities).values({
          workerId: worker.id, capabilityName: capabilityNames[j - 1],
          capabilityType: "authorization", level: 1,
        });
        capCount++;
        inserted++;
      }
    }
    if (capCount > 0) tables.add("worker_capabilities");
  }

  return {
    success: true, file_name: fileName, parser_used: "IsAkisParser",
    records_processed: processed, records_inserted: inserted, records_updated: updated,
    tables_affected: [...tables],
    summary: `${processed} kişi için yetki matrisi güncellendi (${inserted} yetki)`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   RESET TO SEED
   ═══════════════════════════════════════════════════════════════════════ */

export async function resetToSeed(): Promise<{ operations: number; schedules: number }> {
  // Clear tables
  await db.delete(operations);
  await db.delete(schedules);

  // Get line IDs
  const lines = await db.select().from(productionLines);
  const elek = lines.find(l => (l.type || "").toLowerCase() === "elektrikli");
  const gaz = lines.find(l => (l.type || "").toLowerCase() === "gazli");
  if (!elek || !gaz) throw new Error("Production lines not found");

  // Seed operations — monthly 2025
  const elektrikliMonthly = [1104, 1343, 979, 733, 1179, 817, 813, 1811, 1415, 2144, 1350, 717];
  const gazliMonthly = [528, 390, 617, 215, 351, 602, 319, 545, 445, 662, 296, 121];

  await db.insert(operations).values(
    elektrikliMonthly.map((qty, i) => ({
      lineId: elek.id, workOrderNo: `ELK-2025-${String(i + 1).padStart(2, "0")}`,
      plannedDate: `2025-${String(i + 1).padStart(2, "0")}-01`, actualQty: qty, status: "completed",
    }))
  );
  await db.insert(operations).values(
    gazliMonthly.map((qty, i) => ({
      lineId: gaz.id, workOrderNo: `GAZ-2025-${String(i + 1).padStart(2, "0")}`,
      plannedDate: `2025-${String(i + 1).padStart(2, "0")}-01`, actualQty: qty, status: "completed",
    }))
  );

  // Seed schedules — weekly plan vs actual
  const devPct = (p: number, a: number) => p === 0 ? "0" : String(Math.round(((a - p) / p) * 100));

  const elektrikliWeekly: [string, number, number][] = [
    ["H40", 539, 539], ["H41", 550, 550], ["H42", 598, 598],
    ["H43", 635, 572], ["H44", 275, 237], ["H45", 530, 476],
    ["H46", 457, 357], ["H47", 436, 156], ["H48", 510, 220],
    ["H49", 440, 403], ["H50", 437, 67], ["H51", 140, 140],
  ];
  const gazliWeekly: [string, number, number][] = [
    ["H40", 189, 189], ["H41", 165, 134], ["H42", 168, 168],
    ["H43", 177, 132], ["H44", 178, 118], ["H45", 130, 102],
    ["H46", 146, 134], ["H47", 155, 135], ["H48", 100, 80],
    ["H49", 120, 90], ["H50", 111, 1],
  ];

  await db.insert(schedules).values(
    elektrikliWeekly.map(([week, planned, actual]) => ({
      lineId: elek.id, periodType: "weekly", periodValue: week,
      plannedQty: planned, actualQty: actual, deviationPct: devPct(planned, actual),
    }))
  );
  await db.insert(schedules).values(
    gazliWeekly.map(([week, planned, actual]) => ({
      lineId: gaz.id, periodType: "weekly", periodValue: week,
      plannedQty: planned, actualQty: actual, deviationPct: devPct(planned, actual),
    }))
  );

  return { operations: elektrikliMonthly.length + gazliMonthly.length, schedules: elektrikliWeekly.length + gazliWeekly.length };
}
