import { Router } from "express";
import { db } from "../db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { products, stockLevels, stockMovementsV2, bomItems, componentStock } from "@shared/schema";
import { broadcastStockUpdate, broadcastProactiveAlert } from "../ws";
import { evaluateRules } from "../rules-engine";
import { asyncHandler, NotFoundError, InsufficientStockError, ValidationError } from "../errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validate, stockMovementSchema } from "../middleware/validate";
import { stockWriteRateLimit } from "../middleware/rate-limit";
import { createLogger } from "../logger";

const log = createLogger("stock");
const stockPocRouter = Router();

// All stock routes require authentication
stockPocRouter.use(requireAuth);

// ── Lazy stock_levels creation — row created on first movement ──────
export async function ensureStockLevel(productId: number, tx?: any): Promise<{
  inProduction: number; inWarehouse: number; totalSold: number;
}> {
  const d = tx || db;
  const [existing] = await d.select().from(stockLevels).where(eq(stockLevels.productId, productId));
  if (existing) return { inProduction: existing.inProduction, inWarehouse: existing.inWarehouse, totalSold: existing.totalSold };

  const [created] = await d.insert(stockLevels).values({ productId }).returning();
  return { inProduction: created.inProduction, inWarehouse: created.inWarehouse, totalSold: created.totalSold };
}

// Helper: safely evaluate rules and broadcast alerts
function evaluateAndBroadcast(trigger: Parameters<typeof evaluateRules>[0]) {
  evaluateRules(trigger)
    .then(alerts => {
      if (alerts.length > 0) {
        broadcastProactiveAlert({ event: "proactive_alert", alerts });
        log.info(`${alerts.length} proactive alert(s) fired`, { alertCount: alerts.length });
      }
    })
    .catch(err => log.error("Rules engine error", { error: err.message }));
}

// ── GET /api/stock/levels ───────────────────────────────
stockPocRouter.get("/levels", requirePermission("stock:read"), asyncHandler(async (_req, res) => {
  const rows = await db
    .select({
      id: stockLevels.id,
      productId: stockLevels.productId,
      productSku: products.sku,
      productName: products.name,
      productCategory: products.category,
      inProduction: stockLevels.inProduction,
      inWarehouse: stockLevels.inWarehouse,
      totalSold: stockLevels.totalSold,
      updatedAt: stockLevels.updatedAt,
    })
    .from(stockLevels)
    .innerJoin(products, eq(stockLevels.productId, products.id))
    .where(eq(products.sku, "ELT.7-11"));

  res.json(rows);
}));

// ── GET /api/stock/levels/:id ──────────────────────────
stockPocRouter.get("/levels/:id", requirePermission("stock:read"), asyncHandler(async (req, res) => {
  const productId = Number(req.params.id);
  const [row] = await db
    .select({
      id: stockLevels.id,
      productId: stockLevels.productId,
      productSku: products.sku,
      productName: products.name,
      inProduction: stockLevels.inProduction,
      inWarehouse: stockLevels.inWarehouse,
      totalSold: stockLevels.totalSold,
      updatedAt: stockLevels.updatedAt,
    })
    .from(stockLevels)
    .innerJoin(products, eq(stockLevels.productId, products.id))
    .where(eq(stockLevels.productId, productId));

  if (!row) throw new NotFoundError("Ürün stok kaydı", String(productId));
  res.json(row);
}));

// ── GET /api/stock/summary ───────────────────────────
stockPocRouter.get("/summary", requirePermission("stock:read"), asyncHandler(async (_req, res) => {
  const [agg] = await db
    .select({
      totalInProduction: sql<number>`COALESCE(SUM(${stockLevels.inProduction}), 0)`,
      totalInWarehouse: sql<number>`COALESCE(SUM(${stockLevels.inWarehouse}), 0)`,
    })
    .from(stockLevels);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todaySales] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${stockMovementsV2.quantity}), 0)`,
    })
    .from(stockMovementsV2)
    .where(
      and(
        eq(stockMovementsV2.movementType, "to_sales"),
        gte(stockMovementsV2.createdAt, todayStart),
      ),
    );

  const [lastMove] = await db
    .select({ createdAt: stockMovementsV2.createdAt })
    .from(stockMovementsV2)
    .orderBy(desc(stockMovementsV2.createdAt))
    .limit(1);

  res.json({
    totalInProduction: Number(agg?.totalInProduction || 0),
    totalInWarehouse: Number(agg?.totalInWarehouse || 0),
    todaySold: Number(todaySales?.total || 0),
    lastMovementAt: lastMove?.createdAt || null,
  });
}));

// ── GET /api/stock/movements ─────────────────────────
stockPocRouter.get("/movements", requirePermission("stock:read"), asyncHandler(async (req, res) => {
  const productId = req.query.product_id ? Number(req.query.product_id) : null;
  const type = req.query.type as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  let query = db
    .select({
      id: stockMovementsV2.id,
      productId: stockMovementsV2.productId,
      productSku: products.sku,
      productName: products.name,
      movementType: stockMovementsV2.movementType,
      quantity: stockMovementsV2.quantity,
      previousState: stockMovementsV2.previousState,
      note: stockMovementsV2.note,
      createdBy: stockMovementsV2.createdBy,
      createdAt: stockMovementsV2.createdAt,
    })
    .from(stockMovementsV2)
    .innerJoin(products, eq(stockMovementsV2.productId, products.id))
    .orderBy(desc(stockMovementsV2.createdAt))
    .limit(limit);

  const conditions = [];
  if (productId) conditions.push(eq(stockMovementsV2.productId, productId));
  if (type) conditions.push(eq(stockMovementsV2.movementType, type));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const rows = await query;
  res.json(rows);
}));

// ── POST /api/stock/movements ─────────────────────────
stockPocRouter.post("/movements",
  requirePermission("stock:write"),
  stockWriteRateLimit,
  validate(stockMovementSchema),
  asyncHandler(async (req, res) => {
    const { product_id, movement_type, quantity, note, created_by, target } = req.body;

    // Verify product exists
    const [product] = await db.select().from(products).where(eq(products.id, product_id));
    if (!product) throw new NotFoundError("Ürün", String(product_id));

    // Ensure stock_levels row exists (lazy creation)
    const currentLevel = await ensureStockLevel(product_id);

    // ── INVENTORY COUNT ──
    if (movement_type === "inventory_count") {
      const countTarget = target || "warehouse";
      const previousState = { ...currentLevel };

      let newInProduction = currentLevel.inProduction;
      let newInWarehouse = currentLevel.inWarehouse;
      const newTotalSold = currentLevel.totalSold;

      if (countTarget === "production") {
        newInProduction = quantity;
      } else {
        newInWarehouse = quantity;
      }

      await db.transaction(async (tx) => {
        await tx.insert(stockMovementsV2).values({
          productId: product_id,
          movementType: "inventory_count",
          quantity,
          previousState,
          note: note || `Sayım: ${countTarget === "production" ? "üretimde" : "depoda"} ${quantity} adet`,
          createdBy: created_by || "üretim_şefi",
        });

        await tx
          .update(stockLevels)
          .set({ inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold, updatedAt: new Date() })
          .where(eq(stockLevels.productId, product_id));
      });

      broadcastStockUpdate({
        event: "stock_update",
        productId: product_id,
        productSku: product.sku || "?",
        movementType: "inventory_count",
        quantity,
        stockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
      });

      evaluateAndBroadcast({ type: "stock_movement", productId: product_id });

      return res.json({
        success: true,
        stockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
      });
    }

    // ── STANDARD MOVEMENTS ──
    if (movement_type === "to_warehouse" && currentLevel.inProduction < quantity) {
      throw new InsufficientStockError("Üretimde", currentLevel.inProduction, quantity);
    }
    if (movement_type === "to_sales" && currentLevel.inWarehouse < quantity) {
      throw new InsufficientStockError("Depoda", currentLevel.inWarehouse, quantity);
    }

    const previousState = { ...currentLevel };

    let newInProduction = currentLevel.inProduction;
    let newInWarehouse = currentLevel.inWarehouse;
    let newTotalSold = currentLevel.totalSold;

    switch (movement_type) {
      case "produced":
        newInProduction += quantity;
        break;
      case "to_warehouse":
        newInProduction -= quantity;
        newInWarehouse += quantity;
        break;
      case "to_sales":
        newInWarehouse -= quantity;
        newTotalSold += quantity;
        break;
      case "raw_material_in":
        newInProduction += quantity;
        break;
    }

    let bomDeductions: Array<{ code: string; name: string; deducted: number; remaining: number; negative?: boolean }> = [];

    await db.transaction(async (tx) => {
      await tx.insert(stockMovementsV2).values({
        productId: product_id,
        movementType: movement_type,
        quantity,
        previousState,
        note: note || null,
        createdBy: created_by || "üretim_şefi",
      });

      await tx
        .update(stockLevels)
        .set({ inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold, updatedAt: new Date() })
        .where(eq(stockLevels.productId, product_id));

      // BOM deduction on production
      if (movement_type === "produced" && product.sku) {
        const bom = await tx
          .select({
            code: bomItems.componentCode,
            name: bomItems.componentName,
            requiredQty: bomItems.requiredQuantity,
            tier: bomItems.tier,
          })
          .from(bomItems)
          .where(eq(bomItems.parentProductSku, product.sku));

        for (const item of bom) {
          const reqQty = parseFloat(item.requiredQty as string);
          const totalDeduct = reqQty * quantity;

          await tx.execute(sql`
            UPDATE component_stock
            SET current_stock = CAST(current_stock AS numeric) - ${totalDeduct},
                updated_at = NOW()
            WHERE component_code = ${item.code}
          `);

          const [updated] = await tx
            .select({ currentStock: componentStock.currentStock })
            .from(componentStock)
            .where(eq(componentStock.componentCode, item.code));

          const remaining = updated ? parseFloat(updated.currentStock as string) : 0;

          bomDeductions.push({
            code: item.code,
            name: item.name,
            deducted: totalDeduct,
            remaining,
            negative: remaining < 0,
          });
        }
      }
    });

    log.info(`Stock movement: ${movement_type} x${quantity} for ${product.sku}`, {
      productId: product_id,
      movementType: movement_type,
      quantity,
    });

    broadcastStockUpdate({
      event: "stock_update",
      productId: product_id,
      productSku: product.sku || "?",
      movementType: movement_type,
      quantity,
      stockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
    });

    evaluateAndBroadcast({ type: "stock_movement", productId: product_id });

    const negativeComponents = bomDeductions.filter(d => d.negative);

    res.json({
      success: true,
      stockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
      ...(bomDeductions.length > 0 && {
        bomDeductions,
        bomMessage: `${bomDeductions.length} bileşenin stoku reçeteye göre düşürüldü (${quantity} adet üretim)`,
      }),
      ...(negativeComponents.length > 0 && {
        stockWarning: {
          type: "negative_stock",
          message: `${negativeComponents.length} bileşen negatif stokta! Acil tedarik gerekli.`,
          components: negativeComponents.map(c => ({
            code: c.code,
            name: c.name,
            stock: c.remaining,
          })),
        },
      }),
    });
  })
);

// ── POST /api/stock/movements/:id/undo ──────────
stockPocRouter.post("/movements/:id/undo",
  requirePermission("stock:write"),
  asyncHandler(async (req, res) => {
    const movementId = Number(req.params.id);

    const [movement] = await db
      .select()
      .from(stockMovementsV2)
      .where(eq(stockMovementsV2.id, movementId));

    if (!movement) throw new NotFoundError("Hareket", String(movementId));

    if (movement.movementType === "undo") {
      throw new ValidationError("Geri alınmış hareket tekrar geri alınamaz");
    }

    const prev = movement.previousState as { inProduction: number; inWarehouse: number; totalSold: number } | null;
    if (!prev) {
      throw new ValidationError("Bu hareketin önceki durumu kaydedilmemiş");
    }

    const currentState = await ensureStockLevel(movement.productId);
    const [prod] = await db.select({ sku: products.sku }).from(products).where(eq(products.id, movement.productId));

    await db.transaction(async (tx) => {
      await tx.insert(stockMovementsV2).values({
        productId: movement.productId,
        movementType: "undo",
        quantity: movement.quantity,
        previousState: currentState,
        note: `Geri alma: #${movementId} (${movement.movementType}, ${movement.quantity} adet)`,
        createdBy: "sistem",
      });

      await tx
        .update(stockLevels)
        .set({
          inProduction: prev.inProduction,
          inWarehouse: prev.inWarehouse,
          totalSold: prev.totalSold,
          updatedAt: new Date(),
        })
        .where(eq(stockLevels.productId, movement.productId));

      if (movement.movementType === "produced" && prod?.sku) {
        const bom = await tx
          .select({
            code: bomItems.componentCode,
            requiredQty: bomItems.requiredQuantity,
          })
          .from(bomItems)
          .where(eq(bomItems.parentProductSku, prod.sku));

        for (const item of bom) {
          const reqQty = parseFloat(item.requiredQty as string);
          const totalRestore = reqQty * movement.quantity;
          await tx.execute(sql`
            UPDATE component_stock
            SET current_stock = CAST(current_stock AS numeric) + ${totalRestore},
                updated_at = NOW()
            WHERE component_code = ${item.code}
          `);
        }
      }
    });

    log.info(`Undo movement #${movementId}`, { movementId, productSku: prod?.sku });

    broadcastStockUpdate({
      event: "stock_update",
      productId: movement.productId,
      productSku: prod?.sku || "?",
      movementType: "undo",
      quantity: movement.quantity,
      stockLevel: { inProduction: prev.inProduction, inWarehouse: prev.inWarehouse, totalSold: prev.totalSold },
    });

    res.json({ success: true, restored: prev });
  })
);

// ── POST /api/stock/reset ──
stockPocRouter.post("/reset", requirePermission("stock:reset"), asyncHandler(async (_req, res) => {
  await db.delete(stockMovementsV2);
  await db.execute(sql`UPDATE stock_levels SET in_production = 0, in_warehouse = 0, total_sold = 0, updated_at = NOW()`);

  const [existing] = await db.select().from(products).where(eq(products.sku, "ELT.7-11"));
  if (!existing) {
    await db.insert(products).values({
      tenantId: "cukurova",
      sku: "ELT.7-11",
      name: "Goldsun Elite - Seramik Plakalı Camlı Radyant Isıtıcı - 7/9/11 KW Üç kademeli",
      category: "Radyant Isıtıcı",
    });
  }

  log.warn("Stock data reset");
  res.json({ success: true, message: "Stok sıfırlandı. Tüm hareketler silindi, stoklar 0/0/0." });
}));

// ── GET /api/stock/products ────────────
stockPocRouter.get("/products", requirePermission("stock:read"), asyncHandler(async (_req, res) => {
  const rows = await db
    .select({ id: products.id, sku: products.sku, name: products.name, category: products.category })
    .from(products)
    .where(eq(products.sku, "ELT.7-11"));
  res.json(rows);
}));

export default stockPocRouter;
