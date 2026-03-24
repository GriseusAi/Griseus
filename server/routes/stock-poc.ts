import { Router } from "express";
import { db } from "../db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { products, stockLevels, stockMovementsV2 } from "@shared/schema";

const stockPocRouter = Router();

// ── Seed stock_levels for all products if empty ─────────────────────
async function seedStockLevels() {
  const existing = await db.select().from(stockLevels);
  if (existing.length > 0) return;

  const allProducts = await db.select().from(products);
  if (allProducts.length === 0) return;

  for (const p of allProducts) {
    await db.insert(stockLevels).values({ productId: p.id }).onConflictDoNothing();
  }
  console.log(`[stock-poc] Seeded stock_levels for ${allProducts.length} products`);
}

// Run seed on import
seedStockLevels().catch(err => console.error("[stock-poc] Seed error:", err));

// ── GET /api/stock/levels — tüm ürünlerin stok durumu ───────────────
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
      .orderBy(products.sku);

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
    const { product_id, movement_type, quantity, note, created_by } = req.body;

    if (!product_id || !movement_type || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "product_id, movement_type ve quantity (>0) zorunlu" });
    }

    const validTypes = ["produced", "to_warehouse", "to_sales", "raw_material_in"];
    if (!validTypes.includes(movement_type)) {
      return res.status(400).json({ error: `Geçersiz hareket tipi. Geçerli: ${validTypes.join(", ")}` });
    }

    // Get current stock level
    const [currentLevel] = await db
      .select()
      .from(stockLevels)
      .where(eq(stockLevels.productId, product_id));

    if (!currentLevel) {
      return res.status(404).json({ error: "Ürün stok kaydı bulunamadı" });
    }

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

    // Save previous state for undo
    const previousState = {
      inProduction: currentLevel.inProduction,
      inWarehouse: currentLevel.inWarehouse,
      totalSold: currentLevel.totalSold,
    };

    // Calculate new levels
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

    // Transaction: insert movement + update levels
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
        .set({
          inProduction: newInProduction,
          inWarehouse: newInWarehouse,
          totalSold: newTotalSold,
          updatedAt: new Date(),
        })
        .where(eq(stockLevels.productId, product_id));
    });

    res.json({
      success: true,
      stockLevel: {
        inProduction: newInProduction,
        inWarehouse: newInWarehouse,
        totalSold: newTotalSold,
      },
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
    const [currentLevel] = await db
      .select()
      .from(stockLevels)
      .where(eq(stockLevels.productId, movement.productId));

    if (!currentLevel) {
      return res.status(404).json({ error: "Stok kaydı bulunamadı" });
    }

    const currentState = {
      inProduction: currentLevel.inProduction,
      inWarehouse: currentLevel.inWarehouse,
      totalSold: currentLevel.totalSold,
    };

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

    res.json({
      success: true,
      restored: prev,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/stock/products — dropdown için ürün listesi ────────────
stockPocRouter.get("/products", async (_req, res) => {
  try {
    const rows = await db
      .select({ id: products.id, sku: products.sku, name: products.name, category: products.category })
      .from(products)
      .orderBy(products.sku);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default stockPocRouter;
