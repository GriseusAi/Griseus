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

export function detectParser(fileName: string): { name: string; fn: ParserFn } | null {
  const f = fileName.toUpperCase();
  const lo = fileName.toLowerCase();
  if (f.includes("ELEKT") || lo.includes("elekt")) return { name: "ElektrikliParser", fn: parseElektrikli };
  if (f.includes("GAZL") || lo.includes("gazl")) return { name: "GazliParser", fn: parseGazli };
  if (f.includes("KAPAS") || lo.includes("kapas")) return { name: "KapasiteParser", fn: parseKapasite };
  if (f.includes("PERSON") || lo.includes("person")) return { name: "PersonelParser", fn: parsePersonel };
  if (f.includes("KPI") || lo.includes("kpi")) return { name: "KPIParser", fn: parseKPI };
  if (f.includes("AKIS") || lo.includes("akis") || f.includes("NETSIS") || lo.includes("netsis")) return { name: "IsAkisParser", fn: parseIsAkis };
  return null;
}

export function getIngestError(fileName: string): IngestError {
  return { success: false, error: `Dosya formatı tanınamadı: "${fileName}"`, supported_formats: SUPPORTED };
}

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): any[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
}

function findSheetByPattern(wb: XLSX.WorkBook, pattern: RegExp): string | null {
  return wb.SheetNames.find(n => pattern.test(n)) || null;
}

function findWeeklySheets(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames.filter(n => /\d+\.?\s*HAFTA/i.test(n));
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
  const monthNames = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowStr = row.map((c: any) => String(c || "").toUpperCase()).join(" ");

    // Look for TOPLAM rows that contain month totals
    if (rowStr.includes("TOPLAM")) {
      // Try to find a quantity value in the row
      for (let j = row.length - 1; j >= 0; j--) {
        const val = Number(row[j]);
        if (val > 0 && val < 100000) {
          // Try to determine which month this is
          let monthFound = "";
          // Check nearby rows or the row itself for month name
          for (const mn of monthNames) {
            if (rowStr.includes(mn)) { monthFound = mn; break; }
          }
          // Check preceding rows for month context
          if (!monthFound) {
            for (let k = Math.max(0, i - 30); k < i; k++) {
              const prevStr = rows[k].map((c: any) => String(c || "").toUpperCase()).join(" ");
              for (const mn of monthNames) {
                if (prevStr.includes(mn)) monthFound = mn;
              }
            }
          }
          if (monthFound) {
            monthlyTotals.push({ month: monthFound, qty: val });
            processed++;
          }
          break;
        }
      }
    }
  }

  // Write operations (monthly aggregates)
  for (const mt of monthlyTotals) {
    const monthIdx = monthNames.indexOf(mt.month);
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
    const weekMatch = wsName.match(/(\d+)/);
    const weekNum = weekMatch ? weekMatch[1] : wsName;
    const periodValue = `H${weekNum}`;

    let plannedQty = 0, actualQty = 0;

    for (const row of wRows) {
      const rowStr = row.map((c: any) => String(c || "").toUpperCase()).join(" ");

      // "DEPOYA SEVK EDİLEN TOPLAM" or similar
      if (rowStr.includes("DEPOYA") && rowStr.includes("TOPLAM") || rowStr.includes("SEVK") && rowStr.includes("TOPLAM")) {
        for (let j = 0; j < row.length; j++) {
          const val = Number(row[j]);
          if (val > 0 && val < 10000) {
            if (!plannedQty) plannedQty = val;
            else if (!actualQty) actualQty = val;
          }
        }
      }

      // Also look for plan/actual headers
      if (rowStr.includes("PLAN") || rowStr.includes("HEDEF")) {
        for (let j = row.length - 1; j >= 0; j--) {
          const val = Number(row[j]);
          if (val > 0 && val < 10000) { plannedQty = val; break; }
        }
      }
      if (rowStr.includes("GERÇEKLEŞEN") || rowStr.includes("GERCEKLESEN") || rowStr.includes("FİİLİ")) {
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
  const monthNames = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowStr = row.map((c: any) => String(c || "").toUpperCase()).join(" ");

    if (rowStr.includes("TOPLAM")) {
      for (let j = row.length - 1; j >= 0; j--) {
        const val = Number(row[j]);
        if (val > 0 && val < 100000) {
          let monthFound = "";
          for (const mn of monthNames) {
            if (rowStr.includes(mn)) { monthFound = mn; break; }
          }
          if (!monthFound) {
            for (let k = Math.max(0, i - 30); k < i; k++) {
              const prevStr = rows[k].map((c: any) => String(c || "").toUpperCase()).join(" ");
              for (const mn of monthNames) { if (prevStr.includes(mn)) monthFound = mn; }
            }
          }
          if (monthFound) {
            monthlyTotals.push({ month: monthFound, qty: val });
            processed++;
          }
          break;
        }
      }
    }
  }

  // Write operations (monthly aggregates)
  for (const mt of monthlyTotals) {
    const monthIdx = monthNames.indexOf(mt.month);
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
      const rowStr = row.map((c: any) => String(c || "").toUpperCase()).join(" ");
      if ((rowStr.includes("DEPOYA") && rowStr.includes("TOPLAM")) || (rowStr.includes("SEVK") && rowStr.includes("TOPLAM"))) {
        for (let j = 0; j < row.length; j++) {
          const val = Number(row[j]);
          if (val > 0 && val < 10000) {
            if (!plannedQty) plannedQty = val;
            else if (!actualQty) actualQty = val;
          }
        }
      }
      if (rowStr.includes("PLAN") || rowStr.includes("HEDEF")) {
        for (let j = row.length - 1; j >= 0; j--) {
          const val = Number(row[j]); if (val > 0 && val < 10000) { plannedQty = val; break; }
        }
      }
      if (rowStr.includes("GERÇEKLEŞEN") || rowStr.includes("GERCEKLESEN") || rowStr.includes("FİİLİ")) {
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

  // Look for lines and their capacity data
  const lineTypes: Array<{ type: "elektrikli" | "gazli"; patterns: string[] }> = [
    { type: "elektrikli", patterns: ["ELEKTRİKLİ", "ELEKTRIKLI"] },
    { type: "gazli", patterns: ["GAZLI", "GAZ"] },
  ];

  for (const lt of lineTypes) {
    const lineId = await getLineId(lt.type);
    if (!lineId) continue;

    let workerCount: number | null = null;
    let capacityUnitTime: number | null = null;
    let currentUnitTime: number | null = null;
    let dailyHours: number | null = null;

    for (const row of rows) {
      const rowStr = row.map((c: any) => String(c || "").toUpperCase()).join(" ");
      const matchesLine = lt.patterns.some(p => rowStr.includes(p));
      if (!matchesLine) continue;

      processed++;

      // Extract numeric values based on keywords
      if (rowStr.includes("KİŞİ") || rowStr.includes("KISI") || rowStr.includes("PERSONEL") || rowStr.includes("WORKER")) {
        for (const cell of row) { const v = Number(cell); if (v > 0 && v < 100) { workerCount = v; break; } }
      }
      if (rowStr.includes("TEORİK") || rowStr.includes("TEORIK") || rowStr.includes("KAPASİTE") && rowStr.includes("BİRİM")) {
        for (const cell of row) { const v = Number(cell); if (v > 0 && v < 120) { capacityUnitTime = v; break; } }
      }
      if (rowStr.includes("MEVCUT") || rowStr.includes("GÜNCEL") || rowStr.includes("GUNCEL")) {
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
