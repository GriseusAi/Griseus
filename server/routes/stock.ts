import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { products, stockStates, stockMovements } from "@shared/schema";
import { stockReconciliation } from "../ontology/StockReconciliation";
import * as XLSX from "xlsx";
import multer from "multer";

const stockRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Validation Schemas ──────────────────────────────────────────────

const productionSchema = z.object({
  product_code: z.string().min(1),
  quantity: z.number().int().positive(),
  entered_by: z.string().optional(),
  reference_id: z.string().optional(),
  notes: z.string().optional(),
});

const saleSchema = z.object({
  product_code: z.string().min(1),
  quantity: z.number().int().positive(),
  entered_by: z.string().optional(),
  customer_ref: z.string().optional(),
  notes: z.string().optional(),
});

const syncSchema = z.object({
  product_code: z.string().min(1),
  netsis_quantity: z.number().int().min(0),
});

// ── Helper: resolve product code to ID ──────────────────────────────

async function resolveProductId(productCode: string): Promise<{ id: number; name: string } | null> {
  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.sku, productCode));
  return product || null;
}

// ── POST /api/ontology/stock/production ─────────────────────────────
stockRouter.post("/production", async (req, res) => {
  try {
    const data = productionSchema.parse(req.body);
    const product = await resolveProductId(data.product_code);
    if (!product) return res.status(404).json({ error: `Ürün bulunamadı: ${data.product_code}` });

    await stockReconciliation.ensureStockState(product.id);
    await stockReconciliation.recordProduction(
      product.id,
      data.quantity,
      data.entered_by,
      data.reference_id,
      data.notes,
    );

    const state = await stockReconciliation.computePredictedStock(product.id);
    res.json({ success: true, product: product.name, ...state });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/ontology/stock/sale ───────────────────────────────────
stockRouter.post("/sale", async (req, res) => {
  try {
    const data = saleSchema.parse(req.body);
    const product = await resolveProductId(data.product_code);
    if (!product) return res.status(404).json({ error: `Ürün bulunamadı: ${data.product_code}` });

    await stockReconciliation.ensureStockState(product.id);
    await stockReconciliation.recordSale(
      product.id,
      data.quantity,
      data.entered_by,
      data.customer_ref,
      data.notes,
    );

    const state = await stockReconciliation.computePredictedStock(product.id);

    // Warn if predicted drops below 0
    const warning = state.predicted < 0 ? "DİKKAT: Tahmini stok negatife düştü!" : undefined;

    res.json({ success: true, product: product.name, warning, ...state });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/ontology/stock/sync ───────────────────────────────────
stockRouter.post("/sync", async (req, res) => {
  try {
    const data = syncSchema.parse(req.body);
    const product = await resolveProductId(data.product_code);
    if (!product) return res.status(404).json({ error: `Ürün bulunamadı: ${data.product_code}` });

    await stockReconciliation.ensureStockState(product.id);
    const result = await stockReconciliation.syncFromNetsis(product.id, data.netsis_quantity);

    res.json({ success: true, product: product.name, ...result });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/ontology/stock/:productCode ────────────────────────────
stockRouter.get("/:productCode", async (req, res) => {
  try {
    const product = await resolveProductId(req.params.productCode);
    if (!product) return res.status(404).json({ error: `Ürün bulunamadı: ${req.params.productCode}` });

    await stockReconciliation.ensureStockState(product.id);
    const state = await stockReconciliation.computePredictedStock(product.id);
    const stockState = await stockReconciliation.getStockState(product.id);

    res.json({
      product: { id: product.id, name: product.name, sku: req.params.productCode },
      stock: state,
      confirmedUpdatedAt: stockState?.confirmedUpdatedAt,
      predictedUpdatedAt: stockState?.predictedUpdatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/ontology/stock/:productCode/movements ──────────────────
stockRouter.get("/:productCode/movements", async (req, res) => {
  try {
    const product = await resolveProductId(req.params.productCode);
    if (!product) return res.status(404).json({ error: `Ürün bulunamadı: ${req.params.productCode}` });

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const movements = await stockReconciliation.getMovements(product.id, limit);

    res.json({ product: product.name, movements });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/ontology/stock-blind-spots ─────────────────────────────
stockRouter.get("/", async (req, res) => {
  try {
    // If no query params, return all stock states with product info
    const allStates = await db
      .select({
        productId: stockStates.productId,
        productName: products.name,
        productSku: products.sku,
        productCategory: products.category,
        confirmedQuantity: stockStates.confirmedQuantity,
        predictedQuantity: stockStates.predictedQuantity,
        pendingProduction: stockStates.pendingProduction,
        pendingSales: stockStates.pendingSales,
        blindSpotHours: stockStates.blindSpotHours,
        confidenceScore: stockStates.confidenceScore,
        status: stockStates.status,
        confirmedUpdatedAt: stockStates.confirmedUpdatedAt,
        updatedAt: stockStates.updatedAt,
      })
      .from(stockStates)
      .innerJoin(products, eq(stockStates.productId, products.id))
      .orderBy(desc(stockStates.blindSpotHours));

    res.json(allStates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/ontology/stock-blind-spots (dedicated route) ───────────
// Mounted separately in main routes

// ── POST /api/ontology/stock/bulk-import ────────────────────────────
stockRouter.post("/bulk-import", upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return res.status(400).json({ error: "Boş dosya" });

    const rows = XLSX.utils.sheet_to_json(ws) as Record<string, any>[];
    if (rows.length === 0) return res.status(400).json({ error: "Veri bulunamadı" });

    // Detect column names (Turkish-aware)
    const headers = Object.keys(rows[0]).map((h) => h.toUpperCase().trim());
    const normalize = (h: string) =>
      h.replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ç/g, "C").replace(/Ö/g, "O").replace(/Ü/g, "U").replace(/Ğ/g, "G");

    const normalizedHeaders = headers.map(normalize);

    // Detect document type
    const hasStokKodu = normalizedHeaders.some((h) => h.includes("STOK") && h.includes("KOD"));
    const hasAdet = normalizedHeaders.some((h) => h.includes("ADET") || h.includes("MIKTAR") || h.includes("QTY"));
    const hasBom = normalizedHeaders.some((h) => h.includes("BOM") || h.includes("URUN AGACI"));
    const hasSevk = normalizedHeaders.some((h) => h.includes("SEVK") || h.includes("SATIS"));
    const hasDepo = normalizedHeaders.some((h) => h.includes("DEPO") || h.includes("WAREHOUSE"));

    if (!hasStokKodu) {
      return res.status(400).json({
        error: "STOK KODU sütunu bulunamadı",
        detected_headers: headers,
        supported_formats: ["Stok Seviyesi (STOK KODU + ADET + DEPO)", "Satış Verisi (STOK KODU + SEVK/SATIŞ)", "BOM (STOK KODU + ÜRÜN AĞACI)"],
      });
    }

    // Find the actual column names (original case)
    const originalHeaders = Object.keys(rows[0]);
    const findCol = (keyword: string) =>
      originalHeaders.find((h) => normalize(h.toUpperCase().trim()).includes(keyword));

    const skuCol = findCol("STOK") || findCol("KOD") || findCol("SKU");
    const qtyCol = findCol("ADET") || findCol("MIKTAR") || findCol("QTY");

    let imported = 0;
    let skipped = 0;
    let docType = "unknown";

    if (hasStokKodu && hasAdet && (hasDepo || !hasBom)) {
      // Stock level import → sync from Netsis
      docType = "stok_seviyesi";
      for (const row of rows) {
        const sku = String(row[skuCol!] || "").trim();
        const qty = parseInt(String(row[qtyCol!] || "0"), 10);
        if (!sku || isNaN(qty)) { skipped++; continue; }

        const product = await resolveProductId(sku);
        if (!product) { skipped++; continue; }

        await stockReconciliation.ensureStockState(product.id);
        await stockReconciliation.syncFromNetsis(product.id, qty);
        imported++;
      }
    } else if (hasStokKodu && hasSevk) {
      // Sales data import
      docType = "satis_verisi";
      for (const row of rows) {
        const sku = String(row[skuCol!] || "").trim();
        const qty = parseInt(String(row[qtyCol!] || "0"), 10);
        if (!sku || isNaN(qty)) { skipped++; continue; }

        const product = await resolveProductId(sku);
        if (!product) { skipped++; continue; }

        await stockReconciliation.ensureStockState(product.id);
        await stockReconciliation.recordSale(product.id, qty, "excel_import");
        imported++;
      }
    } else {
      return res.status(400).json({
        error: "Dosya formatı tanınamadı",
        detected_headers: headers,
      });
    }

    res.json({
      success: true,
      document_type: docType,
      records_imported: imported,
      records_skipped: skipped,
      total_rows: rows.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default stockRouter;
