/**
 * Smart Data Import API
 * Excel/CSV dosyalarını akıllı ayrıştırma, anomali tespiti ve import.
 * Bulk JSON import: 1000 ürüne ölçekleme için toplu veri yükleme.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { smartImport, analyzeFile, type ImportType } from "../lib/smart-import";
import { bulkUpdateFromSalesHistory } from "../lib/dynamic-seasonality";
import { db } from "../db";
import { products, bomItems, componentStock, salesHistory } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { recordLineage, createSnapshot } from "./foundry";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/import/analyze — dosyayı analiz et (dry-run, veri değiştirmez)
router.post("/analyze", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi" });
    const result = await analyzeFile(req.file.buffer);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/execute — dosyayı import et
router.post("/execute", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi" });
    const type = (req.body.type as ImportType) || "auto";
    const productSku = req.body.product_sku as string;
    if (!productSku) return res.status(400).json({ error: "product_sku gerekli" });
    // Snapshot before import (fire-and-forget, non-blocking)
    const snapshotTables = type === "sales_history" ? ["component_stock"] : ["component_stock", "bom_items"];
    createSnapshot(
      `Import oncesi: ${req.file.originalname || "dosya"} (${type})`,
      "auto_pre_import",
      snapshotTables,
      `import_${type}`,
    ).catch(() => {});

    const result = await smartImport(req.file.buffer, { type, productSku });

    // Record lineage for this import
    recordLineage({
      entity: type === "sales_history" ? "sales_history" : "component_stock",
      entityId: productSku,
      sourceType: "import",
      sourceName: `Excel import: ${req.file.originalname || "dosya"}`,
      actor: "import",
      metadata: { type, productSku, rowCount: result.imported || 0 },
    }).catch(() => {});

    // DSE — Satış verisi import edildiyse mevsimsel indeksleri güncelle (fire-and-forget)
    if (type === "sales_history" || type === "auto") {
      bulkUpdateFromSalesHistory("cukurova", productSku).catch(err =>
        console.error("[import] DSE update error:", err));
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// BULK JSON IMPORT — 1000 ürüne ölçekleme
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /api/import/bulk/products
 * Body: { products: [{ sku, name, category? }] }
 */
router.post("/bulk/products", async (req: Request, res: Response) => {
  try {
    const items = req.body.products as Array<{ sku: string; name: string; category?: string }>;
    if (!items?.length) return res.status(400).json({ error: "products dizisi gerekli" });

    let created = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.sku || !item.name) { skipped++; continue; }

      const [existing] = await db.select().from(products).where(eq(products.sku, item.sku));
      if (existing) { skipped++; continue; }

      await db.insert(products).values({
        tenantId: "cukurova",
        sku: item.sku,
        name: item.name,
        category: item.category || null,
      });
      created++;
    }

    // Lineage
    if (created > 0) {
      recordLineage({
        entity: "product", entityId: "bulk",
        sourceType: "import", sourceName: "Bulk product import",
        actor: "import", metadata: { created, skipped, total: items.length },
      }).catch(() => {});
    }

    res.json({ success: true, created, skipped, total: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/import/bulk/bom
 * Body: { sku: "PRODUCT-SKU", items: [{ code, name, qty, unit, tier, parentCode? }] }
 *
 * Bir ürünün BOM reçetesini toplu yükler.
 * Mevcut BOM varsa önce siler ve yeniden yazar (replace mode).
 */
router.post("/bulk/bom", async (req: Request, res: Response) => {
  try {
    const { sku, items } = req.body as {
      sku: string;
      items: Array<{ code: string; name: string; qty: number; unit: string; tier: number; parentCode?: string }>;
    };
    if (!sku) return res.status(400).json({ error: "sku gerekli" });
    if (!items?.length) return res.status(400).json({ error: "items dizisi gerekli" });

    // Ürün var mı kontrol
    const [product] = await db.select().from(products).where(eq(products.sku, sku));
    if (!product) return res.status(404).json({ error: `Ürün bulunamadı: ${sku}. Önce /bulk/products ile oluşturun.` });

    // Mevcut BOM'u sil (replace)
    await db.delete(bomItems).where(eq(bomItems.parentProductSku, sku));

    // Yeni BOM'u yaz
    let created = 0;
    for (const item of items) {
      if (!item.code || !item.name || !item.qty || !item.unit) continue;

      await db.insert(bomItems).values({
        parentProductSku: sku,
        componentCode: item.code,
        componentName: item.name,
        requiredQuantity: String(item.qty),
        unit: item.unit,
        tier: item.tier || 1,
        parentComponentCode: item.parentCode || null,
      });
      created++;
    }

    // Lineage — batch trace (Palantir Foundry continuous write-back principle)
    if (created > 0) {
      recordLineage({
        entity: "bom_items", entityId: sku,
        sourceType: "import", sourceName: `Bulk BOM import: ${sku}`,
        actor: "import", metadata: { sku, created, total: items.length, tiers: Array.from(new Set(items.map(i => i.tier))) },
      }).catch(() => {});
    }

    res.json({ success: true, sku, created, total: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/import/bulk/stock
 * Body: { items: [{ code, stock, unit }] }
 *
 * Bileşen stok değerlerini toplu günceller. Mevcut bileşen varsa günceller, yoksa oluşturur.
 */
router.post("/bulk/stock", async (req: Request, res: Response) => {
  try {
    const items = req.body.items as Array<{ code: string; stock: number; unit: string }>;
    if (!items?.length) return res.status(400).json({ error: "items dizisi gerekli" });

    let created = 0;
    let updated = 0;

    for (const item of items) {
      if (!item.code || item.stock === undefined || !item.unit) continue;

      const [existing] = await db.select().from(componentStock).where(eq(componentStock.componentCode, item.code));
      if (existing) {
        await db.update(componentStock).set({
          currentStock: String(item.stock),
          lastCountedAt: new Date(),
          lastCountedBy: "bulk_import",
          updatedAt: new Date(),
        }).where(eq(componentStock.componentCode, item.code));
        updated++;
      } else {
        await db.insert(componentStock).values({
          componentCode: item.code,
          currentStock: String(item.stock),
          unit: item.unit,
          lastCountedBy: "bulk_import",
        });
        created++;
      }
    }

    // Lineage — cross-product pool update (Octopus Y.2 binding)
    if (created + updated > 0) {
      recordLineage({
        entity: "component_stock", entityId: "pool",
        sourceType: "import", sourceName: "Bulk stock import (shared pool)",
        actor: "import", metadata: { created, updated, total: items.length, uniqueCodes: items.length },
      }).catch(() => {});
    }

    res.json({ success: true, created, updated, total: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/import/bulk/sales
 * Body: { sku: "PRODUCT-SKU", data: [{ year, month, qty, revenue? }] }
 *
 * Bir ürünün satış geçmişini toplu yükler. Mevcut veri varsa üzerine yazar.
 */
router.post("/bulk/sales", async (req: Request, res: Response) => {
  try {
    const { sku, data } = req.body as {
      sku: string;
      data: Array<{ year: number; month: number; qty: number; revenue?: number }>;
    };
    if (!sku) return res.status(400).json({ error: "sku gerekli" });
    if (!data?.length) return res.status(400).json({ error: "data dizisi gerekli" });

    let created = 0;
    let updated = 0;

    for (const row of data) {
      if (!row.year || !row.month || row.qty === undefined) continue;

      // Mevcut kayıt var mı?
      const [existing] = await db.select().from(salesHistory)
        .where(and(
          eq(salesHistory.productSku, sku),
          eq(salesHistory.year, row.year),
          eq(salesHistory.month, row.month),
        ));

      if (existing) {
        await db.update(salesHistory).set({
          quantitySold: row.qty,
          revenue: row.revenue ? String(row.revenue) : null,
          source: "bulk_import",
        }).where(eq(salesHistory.id, existing.id));
        updated++;
      } else {
        await db.insert(salesHistory).values({
          productSku: sku,
          year: row.year,
          month: row.month,
          quantitySold: row.qty,
          revenue: row.revenue ? String(row.revenue) : null,
          source: "bulk_import",
        });
        created++;
      }
    }

    // DSE güncelle (fire-and-forget)
    bulkUpdateFromSalesHistory("cukurova", sku).catch(err =>
      console.error("[bulk/sales] DSE update error:", err));

    res.json({ success: true, sku, created, updated, total: data.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
