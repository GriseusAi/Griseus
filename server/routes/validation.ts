/**
 * Validation API — Continuous Validation Pipeline
 * Uyarı geçmişi, doğrulama ve metrik endpoint'leri.
 */
import { Router, type Request, type Response } from "express";
import { getValidationAlerts, updateAlertValidation, getValidationMetrics } from "../lib/alert-persistence";

const router = Router();

// GET /api/validation/alerts — filtreli uyarı listesi
router.get("/alerts", async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const severity = req.query.severity as string | undefined;
    const validated = req.query.validated as string | undefined;
    const limit = req.query.limit as string | undefined;
    const alerts = await getValidationAlerts({
      type,
      severity,
      validated: validated !== undefined ? validated === "true" : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ alerts, count: alerts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/validation/alerts/:id — doğrulama güncelle
router.patch("/alerts/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { validated, validationNote, outcome } = req.body;
    if (typeof validated !== "boolean") {
      return res.status(400).json({ error: "validated (boolean) gerekli" });
    }
    const updated = await updateAlertValidation(id, { validated, validationNote, outcome });
    if (!updated) return res.status(404).json({ error: "Alert bulunamadı" });
    res.json({ alert: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/validation/metrics — doğrulama metrikleri
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const metrics = await getValidationMetrics();
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
