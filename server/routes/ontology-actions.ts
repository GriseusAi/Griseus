/**
 * L6 Ontology Actions — Palantir ActionType execution
 *
 * placeOrder    → purchase_suggestions (status: ordered, createdBy: user)
 * transferStock → stock_transfers (status: pending → completed)
 * history/:code → son N aksiyon (purchase + transfer birleşik)
 *
 * Her execute:
 *   1. DB insert
 *   2. recordLineage (entity + actor + metadata)
 *   3. broadcastEntityChanged (WS → UI invalidation + pulse)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { purchaseSuggestions, stockTransfers, componentStock } from "@shared/schema";
import { eq, desc, sql, or } from "drizzle-orm";
import { recordLineage } from "./foundry";
import { broadcastEntityChanged } from "../ws";

const router = Router();

/* ── Validation schemas ── */
const placeOrderSchema = z.object({
  code: z.string().min(1),
  quantity: z.number().positive(),
  supplier: z.string().optional(),
  deadline: z.string().optional(), // ISO date string
  note: z.string().optional(),
  createdBy: z.string().optional().default("ontology_ui"),
});

const transferStockSchema = z.object({
  code: z.string().min(1),
  fromLocation: z.string().min(1),
  toLocation: z.string().min(1),
  quantity: z.number().positive(),
  note: z.string().optional(),
  createdBy: z.string().optional().default("ontology_ui"),
});

/* ── Helper: component lookup (name + unit) ── */
async function lookupComponent(code: string): Promise<{ name: string; unit: string } | null> {
  const [row] = await db
    .select({ unit: componentStock.unit })
    .from(componentStock)
    .where(eq(componentStock.componentCode, code))
    .limit(1);
  if (!row) return null;
  // name is nullable in component_stock; fetch from bom_items as source of truth
  const nameRes = await db.execute(sql`
    SELECT component_name FROM bom_items WHERE component_code = ${code} LIMIT 1
  `);
  const name = (nameRes.rows[0] as any)?.component_name || code;
  return { name, unit: row.unit };
}

/* ═══════════════════════════════════════════════════════════
   POST /api/ontology/action/place-order
   ═══════════════════════════════════════════════════════════ */
router.post("/action/place-order", async (req: Request, res: Response) => {
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Geçersiz parametre", details: parsed.error.flatten() });
  }
  const { code, quantity, supplier, deadline, note, createdBy } = parsed.data;

  try {
    const comp = await lookupComponent(code);
    if (!comp) return res.status(404).json({ error: `Bileşen bulunamadı: ${code}` });

    const reasonParts: string[] = [];
    if (supplier) reasonParts.push(`Tedarikçi: ${supplier}`);
    if (deadline) reasonParts.push(`Termin: ${deadline}`);
    if (note) reasonParts.push(note);
    const reason = reasonParts.length > 0 ? reasonParts.join(" · ") : "Ontology UI sipariş";

    const [inserted] = await db.insert(purchaseSuggestions).values({
      componentCode: code,
      componentName: comp.name,
      suggestedQuantity: String(quantity),
      unit: comp.unit,
      reason,
      status: "ordered",
      createdBy,
      resolvedBy: createdBy,
      resolvedAt: new Date(),
    }).returning();

    await recordLineage({
      entity: "purchase_suggestions",
      entityId: String(inserted.id),
      sourceType: "action",
      sourceName: `L6 placeOrder: ${code}`,
      actor: createdBy,
      metadata: { code, quantity, supplier, deadline, note, purchaseId: inserted.id },
    }).catch(() => {});

    broadcastEntityChanged({
      event: "entity_changed",
      entities: ["purchase_suggestions"],
      scope: code,
      count: 1,
      source: "ontology_action",
    });

    res.json({
      ok: true,
      action: "placeOrder",
      record: inserted,
      message: `${code} için ${quantity} ${comp.unit} sipariş talebi oluşturuldu`,
    });
  } catch (err: any) {
    console.error("[ontology-actions] placeOrder error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/ontology/action/transfer-stock
   ═══════════════════════════════════════════════════════════ */
router.post("/action/transfer-stock", async (req: Request, res: Response) => {
  const parsed = transferStockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Geçersiz parametre", details: parsed.error.flatten() });
  }
  const { code, fromLocation, toLocation, quantity, note, createdBy } = parsed.data;

  if (fromLocation === toLocation) {
    return res.status(400).json({ error: "Kaynak ve hedef aynı olamaz" });
  }

  try {
    const comp = await lookupComponent(code);
    if (!comp) return res.status(404).json({ error: `Bileşen bulunamadı: ${code}` });

    const [inserted] = await db.insert(stockTransfers).values({
      componentCode: code,
      componentName: comp.name,
      fromLocation,
      toLocation,
      quantity: String(quantity),
      unit: comp.unit,
      status: "pending",
      note: note ?? null,
      createdBy,
    }).returning();

    await recordLineage({
      entity: "stock_transfers",
      entityId: String(inserted.id),
      sourceType: "action",
      sourceName: `L6 transferStock: ${code} ${fromLocation}→${toLocation}`,
      actor: createdBy,
      metadata: { code, fromLocation, toLocation, quantity, note, transferId: inserted.id },
    }).catch(() => {});

    broadcastEntityChanged({
      event: "entity_changed",
      entities: ["stock_transfers"],
      scope: code,
      count: 1,
      source: "ontology_action",
    });

    res.json({
      ok: true,
      action: "transferStock",
      record: inserted,
      message: `${code}: ${quantity} ${comp.unit} "${fromLocation}" → "${toLocation}" transferi oluşturuldu`,
    });
  } catch (err: any) {
    console.error("[ontology-actions] transferStock error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/ontology/actions/history/:code?limit=10
   ═══════════════════════════════════════════════════════════ */
router.get("/actions/history/:code", async (req: Request, res: Response) => {
  const code = String(req.params.code);
  const limit = Math.min(parseInt(String(req.query.limit ?? "10")) || 10, 50);

  try {
    const purchases = await db
      .select()
      .from(purchaseSuggestions)
      .where(eq(purchaseSuggestions.componentCode, code))
      .orderBy(desc(purchaseSuggestions.createdAt))
      .limit(limit);

    const transfers = await db
      .select()
      .from(stockTransfers)
      .where(eq(stockTransfers.componentCode, code))
      .orderBy(desc(stockTransfers.createdAt))
      .limit(limit);

    const merged = [
      ...purchases.map(p => ({
        kind: "placeOrder" as const,
        id: p.id,
        at: p.createdAt,
        status: p.status,
        quantity: parseFloat(p.suggestedQuantity as any),
        unit: p.unit,
        detail: p.reason,
        actor: p.createdBy || p.resolvedBy || "—",
      })),
      ...transfers.map(t => ({
        kind: "transferStock" as const,
        id: t.id,
        at: t.createdAt,
        status: t.status,
        quantity: parseFloat(t.quantity as any),
        unit: t.unit,
        detail: `${t.fromLocation} → ${t.toLocation}${t.note ? ` · ${t.note}` : ""}`,
        actor: t.createdBy || "—",
      })),
    ].sort((a, b) => {
      const at = a.at ? new Date(a.at).getTime() : 0;
      const bt = b.at ? new Date(b.at).getTime() : 0;
      return bt - at;
    }).slice(0, limit);

    res.json({ code, total: merged.length, actions: merged });
  } catch (err: any) {
    console.error("[ontology-actions] history error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
