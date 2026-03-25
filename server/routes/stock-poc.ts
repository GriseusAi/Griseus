import { Router } from "express";
import { db } from "../db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { products, stockLevels, stockMovementsV2, bomItems, componentStock } from "@shared/schema";
import { broadcastStockUpdate } from "../ws";

const stockPocRouter = Router();

// ── Lazy stock_levels creation — row created on first movement ──────
async function ensureStockLevel(productId: number, tx?: any): Promise<{
  inProduction: number; inWarehouse: number; totalSold: number;
}> {
  const d = tx || db;
  const [existing] = await d.select().from(stockLevels).where(eq(stockLevels.productId, productId));
  if (existing) return { inProduction: existing.inProduction, inWarehouse: existing.inWarehouse, totalSold: existing.totalSold };

  const [created] = await d.insert(stockLevels).values({ productId }).returning();
  return { inProduction: created.inProduction, inWarehouse: created.inWarehouse, totalSold: created.totalSold };
}

// ── GET /api/stock/levels — sadece ELT.7-11 stok durumu ───────────────
stockPocRouter.get("/levels", async (_req, res) => {
  try {
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/stock/levels/:id — tek ürünün stok durumu ──────────────
stockPocRouter.get("/levels/:id", async (req, res) => {
  try {
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

    if (!row) return res.status(404).json({ error: "Ürün stok kaydı bulunamadı" });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/stock/summary — özet kartlar ───────────────────────────
stockPocRouter.get("/summary", async (_req, res) => {
  try {
    const [agg] = await db
      .select({
        totalInProduction: sql<number>`COALESCE(SUM(${stockLevels.inProduction}), 0)`,
        totalInWarehouse: sql<number>`COALESCE(SUM(${stockLevels.inWarehouse}), 0)`,
      })
      .from(stockLevels);

    // Today's sales: sum quantity for to_sales movements created today
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

    // Last movement time
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/stock/movements — hareket geçmişi ─────────────────────
stockPocRouter.get("/movements", async (req, res) => {
  try {
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

    // Apply filters
    const conditions = [];
    if (productId) conditions.push(eq(stockMovementsV2.productId, productId));
    if (type) conditions.push(eq(stockMovementsV2.movementType, type));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const rows = await query;
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/stock/movements — yeni hareket kaydet ─────────────────
stockPocRouter.post("/movements", async (req, res) => {
  try {
    const { product_id, movement_type, quantity, note, created_by, target } = req.body;

    if (!product_id || !movement_type) {
      return res.status(400).json({ error: "product_id ve movement_type zorunlu" });
    }

    const validTypes = ["produced", "to_warehouse", "to_sales", "raw_material_in", "inventory_count"];
    if (!validTypes.includes(movement_type)) {
      return res.status(400).json({ error: `Geçersiz hareket tipi. Geçerli: ${validTypes.join(", ")}` });
    }

    if (!quantity || quantity < 0 || (movement_type !== "inventory_count" && quantity <= 0)) {
      return res.status(400).json({ error: "quantity zorunlu ve >= 0 olmalı" });
    }

    // Verify product exists
    const [product] = await db.select().from(products).where(eq(products.id, product_id));
    if (!product) {
      return res.status(404).json({ error: "Ürün bulunamadı" });
    }

    // Ensure stock_levels row exists (lazy creation)
    const currentLevel = await ensureStockLevel(product_id);

    // ── INVENTORY COUNT — directly set stock values ──────────────
    if (movement_type === "inventory_count") {
      const countTarget = target || "warehouse"; // 'warehouse' | 'production'
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

      return res.json({
        success: true,
        stockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
      });
    }

    // ── STANDARD MOVEMENTS ───────────────────────────────────────

    // Validate — can't go negative
    if (movement_type === "to_warehouse" && currentLevel.inProduction < quantity) {
      return res.status(400).json({
        error: `Üretimde yeterli stok yok. Üretimde: ${currentLevel.inProduction}, İstenen: ${quantity}`,
      });
    }
    if (movement_type === "to_sales" && currentLevel.inWarehouse < quantity) {
      return res.status(400).json({
        error: `Depoda yeterli stok yok. Depoda: ${currentLevel.inWarehouse}, İstenen: ${quantity}`,
      });
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

    // BOM bileşenlerini düş (sadece "produced" harekette)
    let bomDeductions: Array<{ code: string; name: string; deducted: number; remaining: number }> = [];

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

      // ── REÇETE DÜŞÜMÜ — üretim yapıldığında bileşen stokları otomatik düşer ──
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

          // Stoku düş
          await tx.execute(sql`
            UPDATE component_stock
            SET current_stock = GREATEST(0, CAST(current_stock AS numeric) - ${totalDeduct}),
                updated_at = NOW()
            WHERE component_code = ${item.code}
          `);

          // Güncel stoku al
          const [updated] = await tx
            .select({ currentStock: componentStock.currentStock })
            .from(componentStock)
            .where(eq(componentStock.componentCode, item.code));

          bomDeductions.push({
            code: item.code,
            name: item.name,
            deducted: totalDeduct,
            remaining: updated ? parseFloat(updated.currentStock as string) : 0,
          });
        }
      }
    });

    broadcastStockUpdate({
      event: "stock_update",
      productId: product_id,
      productSku: product.sku || "?",
      movementType: movement_type,
      quantity,
      stockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
    });

    res.json({
      success: true,
      stockLevel: { inProduction: newInProduction, inWarehouse: newInWarehouse, totalSold: newTotalSold },
      ...(bomDeductions.length > 0 && {
        bomDeductions,
        bomMessage: `${bomDeductions.length} bileşenin stoku reçeteye göre düşürüldü (${quantity} adet üretim)`,
      }),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/stock/movements/:id/undo — hareketi geri al ──────────
stockPocRouter.post("/movements/:id/undo", async (req, res) => {
  try {
    const movementId = Number(req.params.id);

    const [movement] = await db
      .select()
      .from(stockMovementsV2)
      .where(eq(stockMovementsV2.id, movementId));

    if (!movement) {
      return res.status(404).json({ error: "Hareket bulunamadı" });
    }

    if (movement.movementType === "undo") {
      return res.status(400).json({ error: "Geri alınmış hareket tekrar geri alınamaz" });
    }

    const prev = movement.previousState as { inProduction: number; inWarehouse: number; totalSold: number } | null;
    if (!prev) {
      return res.status(400).json({ error: "Bu hareketin önceki durumu kaydedilmemiş" });
    }

    // Get current state for the undo movement's previousState
    const currentState = await ensureStockLevel(movement.productId);

    await db.transaction(async (tx) => {
      // Record undo movement
      await tx.insert(stockMovementsV2).values({
        productId: movement.productId,
        movementType: "undo",
        quantity: movement.quantity,
        previousState: currentState,
        note: `Geri alma: #${movementId} (${movement.movementType}, ${movement.quantity} adet)`,
        createdBy: "sistem",
      });

      // Restore to previous state
      await tx
        .update(stockLevels)
        .set({
          inProduction: prev.inProduction,
          inWarehouse: prev.inWarehouse,
          totalSold: prev.totalSold,
          updatedAt: new Date(),
        })
        .where(eq(stockLevels.productId, movement.productId));
    });

    // Get product SKU for broadcast
    const [prod] = await db.select({ sku: products.sku }).from(products).where(eq(products.id, movement.productId));

    broadcastStockUpdate({
      event: "stock_update",
      productId: movement.productId,
      productSku: prod?.sku || "?",
      movementType: "undo",
      quantity: movement.quantity,
      stockLevel: { inProduction: prev.inProduction, inWarehouse: prev.inWarehouse, totalSold: prev.totalSold },
    });

    res.json({
      success: true,
      restored: prev,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/stock/reset — stok verilerini sıfırla ──
stockPocRouter.post("/reset", async (_req, res) => {
  try {
    // 1. Tüm hareketleri sil
    await db.delete(stockMovementsV2);

    // 2. Tüm stok seviyelerini sıfırla (silmek yerine güncelle)
    await db.execute(sql`UPDATE stock_levels SET in_production = 0, in_warehouse = 0, total_sold = 0, updated_at = NOW()`);

    // 3. ELT.7-11 ürünü yoksa ekle
    const [existing] = await db.select().from(products).where(eq(products.sku, "ELT.7-11"));
    if (!existing) {
      await db.insert(products).values({
        tenantId: "cukurova",
        sku: "ELT.7-11",
        name: "Goldsun Elite - Seramik Plakalı Camlı Radyant Isıtıcı - 7/9/11 KW Üç kademeli",
        category: "Radyant Isıtıcı",
      });
    }

    res.json({ success: true, message: "Stok sıfırlandı. Tüm hareketler silindi, stoklar 0/0/0." });
  } catch (error: any) {
    console.error("Reset error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/stock/products — sadece ELT.7-11 ────────────
stockPocRouter.get("/products", async (_req, res) => {
  try {
    const rows = await db
      .select({ id: products.id, sku: products.sku, name: products.name, category: products.category })
      .from(products)
      .where(eq(products.sku, "ELT.7-11"));
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default stockPocRouter;
