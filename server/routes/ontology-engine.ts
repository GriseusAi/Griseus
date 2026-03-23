import { Router } from "express";
import { ontologyService } from "../ontology/OntologyService";
import { bomService } from "../ontology/BomService";
import { computeEngine } from "../ontology/ComputeEngine";
import { excelImporter } from "../pipeline/ExcelImporter";
import { db } from "../db";
import { rawImports } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ══════════════════════════════════════════════════════════════════════
// OBJECT TYPES
// ══════════════════════════════════════════════════════════════════════

router.get("/types", async (_req, res) => {
  try {
    const types = await ontologyService.getObjectTypes();
    res.json(types);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/types/:apiName/objects", async (req, res) => {
  try {
    const { apiName } = req.params;
    const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;
    const objects = await ontologyService.getObjectsByType(apiName, filters);
    res.json(objects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// OBJECTS CRUD
// ══════════════════════════════════════════════════════════════════════

router.get("/objects/:id", async (req, res) => {
  try {
    const obj = await ontologyService.getObject(req.params.id);
    if (!obj) return res.status(404).json({ error: "Object not found" });
    res.json(obj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/objects/:id/links", async (req, res) => {
  try {
    const linkType = req.query.linkType as string | undefined;
    const direction = (req.query.direction as "outgoing" | "incoming" | "both") || "both";
    const linked = await ontologyService.getLinkedObjects(req.params.id, linkType, direction);
    res.json(linked);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/objects", async (req, res) => {
  try {
    const { objectType, externalId, title, properties } = req.body;
    if (!objectType || !externalId || !title) {
      return res.status(400).json({ error: "objectType, externalId, and title are required" });
    }
    const obj = await ontologyService.createObject(objectType, externalId, title, properties || {});
    res.status(201).json(obj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/objects/:id", async (req, res) => {
  try {
    const { title, properties, computedProperties } = req.body;
    const obj = await ontologyService.updateObject(req.params.id, { title, properties, computedProperties });
    if (!obj) return res.status(404).json({ error: "Object not found" });
    res.json(obj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/objects/:id", async (req, res) => {
  try {
    const deleted = await ontologyService.deleteObject(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Object not found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// LINKS
// ══════════════════════════════════════════════════════════════════════

router.post("/links", async (req, res) => {
  try {
    const { linkType, sourceObjectId, targetObjectId, properties } = req.body;
    if (!linkType || !sourceObjectId || !targetObjectId) {
      return res.status(400).json({ error: "linkType, sourceObjectId, and targetObjectId are required" });
    }
    const link = await ontologyService.createLink(linkType, sourceObjectId, targetObjectId, properties || {});
    res.status(201).json(link);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/links/:id", async (req, res) => {
  try {
    const deleted = await ontologyService.deleteLink(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Link not found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════════════════════

router.get("/search", async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: "q parameter required" });
    const results = await ontologyService.searchObjects(q);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// PIPELINE — Excel Import
// ══════════════════════════════════════════════════════════════════════

router.post("/pipeline/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const result = await excelImporter.importFile(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/pipeline/batches", async (_req, res) => {
  try {
    const batches = await db.execute(sql`
      SELECT batch_id, source_file, COUNT(*) as total_rows,
        SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errored,
        MIN(created_at) as started_at
      FROM ge_raw_imports
      GROUP BY batch_id, source_file
      ORDER BY MIN(created_at) DESC
    `);
    res.json(batches.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/pipeline/batches/:id", async (req, res) => {
  try {
    const rows = await db.select().from(rawImports).where(eq(rawImports.batchId, req.params.id));
    const processed = rows.filter(r => r.status === "processed").length;
    const errored = rows.filter(r => r.status === "error").length;
    res.json({
      batchId: req.params.id,
      totalRows: rows.length,
      processed,
      errored,
      errors: rows.filter(r => r.status === "error").map(r => ({
        row: r.rowNumber,
        errors: r.errors,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// COMPUTE ENGINE
// ══════════════════════════════════════════════════════════════════════

router.post("/compute/refresh", async (_req, res) => {
  try {
    const result = await computeEngine.refreshAll();
    await computeEngine.computeAbcClassification();
    res.json({ ...result, abc_classification: "updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compute/dashboard", async (_req, res) => {
  try {
    const dashboard = await computeEngine.getDashboard();
    res.json(dashboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// INTELLIGENCE ENDPOINTS
// ══════════════════════════════════════════════════════════════════════

router.get("/intelligence/stock-status", async (_req, res) => {
  try {
    const status = await computeEngine.getStockStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/intelligence/overstock-report", async (_req, res) => {
  try {
    const report = await computeEngine.getOverstockReport();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/intelligence/seasonal-forecast", async (_req, res) => {
  try {
    const forecast = await computeEngine.getSeasonalForecast();
    res.json(forecast);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/intelligence/capital-exposure", async (_req, res) => {
  try {
    const exposure = await computeEngine.getCapitalExposure();
    res.json(exposure);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/intelligence/reorder-alerts", async (_req, res) => {
  try {
    const alerts = await computeEngine.getReorderAlerts();
    res.json(alerts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// BOM
// ══════════════════════════════════════════════════════════════════════

router.get("/bom/:productId/tree", async (req, res) => {
  try {
    const tree = await bomService.getBomTree(req.params.productId);
    if (!tree) return res.status(404).json({ error: "Product not found" });
    res.json(tree);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bom/:productId/cost", async (req, res) => {
  try {
    const cost = await bomService.computeBomCost(req.params.productId);
    res.json(cost);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bom/:productId/requirements", async (req, res) => {
  try {
    const quantity = parseInt(req.query.quantity as string) || 1;
    const requirements = await bomService.getMaterialRequirements(req.params.productId, quantity);
    res.json(requirements);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
