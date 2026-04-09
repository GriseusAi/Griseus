/**
 * Smart Data Import API
 * Excel/CSV dosyalarını akıllı ayrıştırma, anomali tespiti ve import.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { smartImport, analyzeFile, type ImportType } from "../lib/smart-import";
import { MAIN_SKU } from "../lib/constants";
import { bulkUpdateFromSalesHistory } from "../lib/dynamic-seasonality";

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
    const result = await smartImport(req.file.buffer, { type, productSku });

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

export default router;
