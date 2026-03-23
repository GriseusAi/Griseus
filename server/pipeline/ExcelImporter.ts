import { db } from "../db";
import { rawImports } from "@shared/schema";
import { normalizeProductCode, detectOrderType } from "./ProductCodeNormalizer";
import { ontologyService } from "../ontology/OntologyService";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import crypto from "crypto";

interface ParsedRow {
  stokKodu: string;
  seriNo: string;
  isEmriNo: string;
  fisNo: string;
  imalatTarihi: string;
  adet: number;
  aciklamalar: string;
  orderType: "stock" | "order";
  normalizedCode: string;
}

export class ExcelImporter {
  /**
   * Parse an Excel file buffer and import into the ontology
   */
  async importFile(buffer: Buffer, filename: string): Promise<{
    batchId: string;
    totalRows: number;
    imported: number;
    errors: { row: number; error: string }[];
  }> {
    const batchId = crypto.randomUUID();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const errors: { row: number; error: string }[] = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, plus header

      try {
        const parsed = this.parseRow(row);

        // Store raw import
        await db.insert(rawImports).values({
          batchId,
          sourceFile: filename,
          rowNumber: rowNum,
          rawData: row,
          status: "processed",
        });

        // Create production_order object in ontology
        await ontologyService.createObject(
          "production_order",
          parsed.isEmriNo || `${parsed.normalizedCode}-${rowNum}`,
          `İmalat: ${parsed.normalizedCode} x${parsed.adet}`,
          {
            stok_kodu: parsed.normalizedCode,
            seri_no: parsed.seriNo,
            is_emri_no: parsed.isEmriNo,
            fis_no: parsed.fisNo,
            imalat_tarihi: parsed.imalatTarihi,
            adet: parsed.adet,
            aciklamalar: parsed.aciklamalar,
            order_type: parsed.orderType,
            batch_id: batchId,
          }
        );

        imported++;
      } catch (err: any) {
        errors.push({ row: rowNum, error: err.message });
        await db.insert(rawImports).values({
          batchId,
          sourceFile: filename,
          rowNumber: rowNum,
          rawData: row,
          status: "error",
          errors: { message: err.message },
        });
      }
    }

    return { batchId, totalRows: rows.length, imported, errors };
  }

  private parseRow(row: any): ParsedRow {
    // Try multiple column name variants (Turkish headers)
    const stokKodu = row["STOK KODU"] || row["Stok Kodu"] || row["stok_kodu"] || "";
    const seriNo = row["SERİ NO"] || row["Seri No"] || row["seri_no"] || "";
    const isEmriNo = row["İŞ EMRİ NO"] || row["İş Emri No"] || row["is_emri_no"] || "";
    const fisNo = row["FİŞNO"] || row["Fiş No"] || row["fis_no"] || "";
    const imalatTarihi = row["İMALAT TARİHİ"] || row["İmalat Tarihi"] || row["imalat_tarihi"] || "";
    const adet = parseInt(row["ADET"] || row["Adet"] || row["adet"] || "0", 10);
    const aciklamalar = row["AÇIKLAMALAR"] || row["Açıklamalar"] || row["aciklamalar"] || "";

    if (!stokKodu) throw new Error("Missing STOK KODU");

    const normalizedCode = normalizeProductCode(stokKodu);
    const orderType = detectOrderType(aciklamalar);

    return {
      stokKodu,
      seriNo: String(seriNo),
      isEmriNo: String(isEmriNo),
      fisNo: String(fisNo),
      imalatTarihi: String(imalatTarihi),
      adet: isNaN(adet) ? 0 : adet,
      aciklamalar: String(aciklamalar),
      orderType,
      normalizedCode,
    };
  }

  /**
   * Get import batch status
   */
  async getBatchStatus(batchId: string) {
    const rows = await db.select().from(rawImports).where(
      eq(rawImports.batchId, batchId)
    );
    const processed = rows.filter(r => r.status === "processed").length;
    const errored = rows.filter(r => r.status === "error").length;
    const pending = rows.filter(r => r.status === "pending").length;

    return {
      batchId,
      totalRows: rows.length,
      processed,
      errored,
      pending,
      errors: rows.filter(r => r.status === "error").map(r => ({
        row: r.rowNumber,
        errors: r.errors,
        rawData: r.rawData,
      })),
    };
  }
}

export const excelImporter = new ExcelImporter();
