import { db } from "../db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { stockStates, stockMovements, products } from "@shared/schema";

export type StockStatus = "in_sync" | "drifting" | "stale" | "critical";

export interface PredictedStockResult {
  confirmed: number;
  pendingProduction: number;
  pendingSales: number;
  predicted: number;
  blindSpotHours: number;
  confidence: number;
  status: StockStatus;
}

export interface SyncResult {
  previousPredicted: number;
  actualConfirmed: number;
  discrepancy: number;
  movementsReconciled: number;
}

function computeBlindSpotHours(confirmedUpdatedAt: Date | null): number {
  if (!confirmedUpdatedAt) return 999;
  return Math.floor((Date.now() - confirmedUpdatedAt.getTime()) / (1000 * 60 * 60));
}

function computeConfidence(blindSpotHours: number): number {
  // 100% at sync, -5% per day (24h), minimum 20%
  return Math.max(20, 100 - Math.floor(blindSpotHours / 24) * 5);
}

function computeStatus(blindSpotHours: number): StockStatus {
  if (blindSpotHours < 24) return "in_sync";
  if (blindSpotHours < 72) return "drifting";
  if (blindSpotHours < 168) return "stale";
  return "critical";
}

export class StockReconciliation {
  /** Calculate predicted stock from confirmed + unsynced movements */
  async computePredictedStock(productId: number): Promise<PredictedStockResult> {
    // Get current stock state
    const [state] = await db
      .select()
      .from(stockStates)
      .where(eq(stockStates.productId, productId));

    if (!state) {
      return {
        confirmed: 0,
        pendingProduction: 0,
        pendingSales: 0,
        predicted: 0,
        blindSpotHours: 999,
        confidence: 20,
        status: "critical",
      };
    }

    // Sum unsynced production movements
    const unsyncedProduction = await db
      .select({ total: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)` })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.productId, productId),
          eq(stockMovements.movementType, "production"),
          isNull(stockMovements.syncedAt),
        ),
      );

    // Sum unsynced sales movements (these are negative)
    const unsyncedSales = await db
      .select({ total: sql<number>`COALESCE(SUM(ABS(${stockMovements.quantity})), 0)` })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.productId, productId),
          eq(stockMovements.movementType, "sale"),
          isNull(stockMovements.syncedAt),
        ),
      );

    const confirmed = state.confirmedQuantity;
    const pendingProduction = Number(unsyncedProduction[0]?.total || 0);
    const pendingSales = Number(unsyncedSales[0]?.total || 0);
    const predicted = confirmed + pendingProduction - pendingSales;

    const blindSpotHours = computeBlindSpotHours(state.confirmedUpdatedAt);
    const confidence = computeConfidence(blindSpotHours);
    const status = computeStatus(blindSpotHours);

    // Update the stock_states row
    await db
      .update(stockStates)
      .set({
        predictedQuantity: predicted,
        predictedUpdatedAt: new Date(),
        pendingProduction,
        pendingSales,
        blindSpotHours,
        confidenceScore: String(confidence),
        status,
        updatedAt: new Date(),
      })
      .where(eq(stockStates.productId, productId));

    return { confirmed, pendingProduction, pendingSales, predicted, blindSpotHours, confidence, status };
  }

  /** When Netsis data arrives, reconcile predicted vs actual */
  async syncFromNetsis(productId: number, netsisQuantity: number): Promise<SyncResult> {
    const predicted = await this.computePredictedStock(productId);

    const discrepancy = netsisQuantity - predicted.predicted;

    // Mark all pending movements as synced
    const syncTime = new Date();
    const result = await db
      .update(stockMovements)
      .set({ syncedAt: syncTime })
      .where(
        and(
          eq(stockMovements.productId, productId),
          isNull(stockMovements.syncedAt),
        ),
      );

    // Reset confirmed quantity to Netsis value
    await db
      .update(stockStates)
      .set({
        confirmedQuantity: netsisQuantity,
        confirmedUpdatedAt: syncTime,
        predictedQuantity: netsisQuantity,
        predictedUpdatedAt: syncTime,
        pendingProduction: 0,
        pendingSales: 0,
        blindSpotHours: 0,
        confidenceScore: "100",
        status: "in_sync",
        updatedAt: syncTime,
      })
      .where(eq(stockStates.productId, productId));

    // Log sync as an adjustment movement if there's a discrepancy
    if (discrepancy !== 0) {
      await db.insert(stockMovements).values({
        productId,
        movementType: "adjustment",
        quantity: discrepancy,
        source: "netsis_sync",
        referenceId: `NETSIS_SYNC_${syncTime.toISOString()}`,
        enteredBy: "system",
        enteredAt: syncTime,
        syncedAt: syncTime,
        notes: `Netsis senkronizasyonu: Tahmini ${predicted.predicted}, Gerçek ${netsisQuantity}, Fark ${discrepancy}`,
      });
    }

    return {
      previousPredicted: predicted.predicted,
      actualConfirmed: netsisQuantity,
      discrepancy,
      movementsReconciled: predicted.pendingProduction + predicted.pendingSales,
    };
  }

  /** Quick entry for production chief — minimal input */
  async recordProduction(
    productId: number,
    quantity: number,
    enteredBy?: string,
    referenceId?: string,
    notes?: string,
  ): Promise<void> {
    await db.insert(stockMovements).values({
      productId,
      movementType: "production",
      quantity: Math.abs(quantity), // always positive for production
      source: "manual_entry",
      referenceId: referenceId || null,
      enteredBy: enteredBy || "üretim_şefi",
      enteredAt: new Date(),
      notes: notes || null,
    });

    // Recompute predicted stock immediately
    await this.computePredictedStock(productId);
  }

  /** Quick entry for sales */
  async recordSale(
    productId: number,
    quantity: number,
    enteredBy?: string,
    customerRef?: string,
    notes?: string,
  ): Promise<void> {
    await db.insert(stockMovements).values({
      productId,
      movementType: "sale",
      quantity: -Math.abs(quantity), // always negative for sales
      source: "manual_entry",
      referenceId: customerRef || null,
      enteredBy: enteredBy || "satış",
      enteredAt: new Date(),
      notes: notes || null,
    });

    // Recompute predicted stock immediately
    await this.computePredictedStock(productId);
  }

  /** Get movement history for a product */
  async getMovements(productId: number, limit = 50): Promise<typeof stockMovements.$inferSelect[]> {
    return db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId))
      .orderBy(desc(stockMovements.enteredAt))
      .limit(limit);
  }

  /** Get all products with stale data (blind spots) */
  async getBlindSpots(minHours = 24): Promise<Array<{
    productId: number;
    productName: string;
    productSku: string | null;
    blindSpotHours: number;
    confidence: number;
    status: string;
    predictedQuantity: number;
    confirmedQuantity: number;
  }>> {
    const rows = await db
      .select({
        productId: stockStates.productId,
        productName: products.name,
        productSku: products.sku,
        blindSpotHours: stockStates.blindSpotHours,
        confidence: stockStates.confidenceScore,
        status: stockStates.status,
        predictedQuantity: stockStates.predictedQuantity,
        confirmedQuantity: stockStates.confirmedQuantity,
      })
      .from(stockStates)
      .innerJoin(products, eq(stockStates.productId, products.id))
      .where(sql`${stockStates.blindSpotHours} >= ${minHours}`)
      .orderBy(desc(stockStates.blindSpotHours));

    return rows.map((r) => ({
      ...r,
      confidence: Number(r.confidence),
    }));
  }

  /** Get stock state for a single product (by product ID) */
  async getStockState(productId: number) {
    const [state] = await db
      .select()
      .from(stockStates)
      .where(eq(stockStates.productId, productId));
    return state || null;
  }

  /** Find product by SKU code */
  async findProductBySku(sku: string) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.sku, sku));
    return product || null;
  }

  /** Ensure stock_state row exists for a product, create if missing */
  async ensureStockState(productId: number): Promise<void> {
    const existing = await this.getStockState(productId);
    if (!existing) {
      await db.insert(stockStates).values({
        productId,
        confirmedQuantity: 0,
        predictedQuantity: 0,
        pendingProduction: 0,
        pendingSales: 0,
        blindSpotHours: 999,
        confidenceScore: "20",
        status: "critical",
      });
    }
  }
}

export const stockReconciliation = new StockReconciliation();
