import { db } from "../db";
import { objects, objectTypes, links, linkTypes } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { GEObject } from "@shared/schema";

// ── Holt-Winters Seasonal Forecasting ───────────────────────────────

interface HoltWintersResult {
  forecast: number[];      // next N periods
  level: number;
  trend: number;
  seasonal: number[];      // 12 seasonal factors
}

function holtWintersMultiplicative(
  data: number[],
  seasonLength: number = 12,
  alpha: number = 0.3,     // level smoothing
  beta: number = 0.1,      // trend smoothing
  gamma: number = 0.3,     // seasonal smoothing
  forecastPeriods: number = 3
): HoltWintersResult {
  if (data.length < seasonLength) {
    // Not enough data — fall back to simple average
    const avg = data.reduce((a, b) => a + b, 0) / Math.max(data.length, 1);
    return {
      forecast: Array(forecastPeriods).fill(avg),
      level: avg,
      trend: 0,
      seasonal: Array(seasonLength).fill(1),
    };
  }

  // Initialize seasonal factors from first season
  const firstSeasonAvg = data.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
  const seasonal = data.slice(0, seasonLength).map(v => v / (firstSeasonAvg || 1));

  // Initialize level and trend
  let level = firstSeasonAvg;
  let trend = 0;
  if (data.length >= 2 * seasonLength) {
    const secondSeasonAvg = data.slice(seasonLength, 2 * seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
    trend = (secondSeasonAvg - firstSeasonAvg) / seasonLength;
  }

  // Smooth through data
  for (let i = seasonLength; i < data.length; i++) {
    const si = i % seasonLength;
    const y = data[i];
    const seasonalFactor = seasonal[si] || 1;

    const prevLevel = level;
    level = alpha * (y / (seasonalFactor || 1)) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonal[si] = gamma * (y / (level || 1)) + (1 - gamma) * seasonalFactor;
  }

  // Forecast
  const forecast: number[] = [];
  const currentMonth = new Date().getMonth(); // 0-indexed
  for (let h = 1; h <= forecastPeriods; h++) {
    const si = (currentMonth + h) % seasonLength;
    forecast.push(Math.max(0, Math.round((level + trend * h) * (seasonal[si] || 1))));
  }

  return { forecast, level, trend, seasonal };
}

// ── Statistical Helpers ─────────────────────────────────────────────

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── Compute Engine ──────────────────────────────────────────────────

export class ComputeEngine {
  private readonly Z_SCORE = 1.65; // 95% service level

  /**
   * Refresh computed properties for all product objects
   */
  async refreshAll(): Promise<{ updated: number; errors: string[] }> {
    const [productType] = await db.select().from(objectTypes).where(eq(objectTypes.apiName, "product"));
    if (!productType) return { updated: 0, errors: ["product object type not found"] };

    const productObjects = await db.select().from(objects).where(eq(objects.objectTypeId, productType.id));
    let updated = 0;
    const errors: string[] = [];

    for (const product of productObjects) {
      try {
        const computed = await this.computeProductProperties(product);
        await db.update(objects).set({
          computedProperties: computed,
          updatedAt: new Date(),
        }).where(eq(objects.id, product.id));
        updated++;
      } catch (err: any) {
        errors.push(`${product.title}: ${err.message}`);
      }
    }

    return { updated, errors };
  }

  /**
   * Compute all derived properties for a single product
   */
  async computeProductProperties(product: GEObject): Promise<Record<string, any>> {
    const props = product.properties as any;

    // Extract production data from properties
    const monthlyProduction: number[] = props.monthly_production || Array(12).fill(0);
    const totalProduction: number = props.total_production || monthlyProduction.reduce((a: number, b: number) => a + b, 0);
    const stockPercent: number = props.stock_percent || 0;
    const orderPercent: number = props.order_percent || 0;
    const unitCost: number = props.unit_cost || 150; // default unit cost in TRY
    const leadTimeDays: number = props.lead_time_days || 14; // default 2 weeks
    const leadTimeVarianceDays: number = props.lead_time_variance_days || 3;
    const currentStock: number = props.current_stock || Math.round(totalProduction * stockPercent / 100);
    const annualRevenue: number = props.annual_revenue || totalProduction * unitCost;

    // ── Monthly production analysis
    const avgMonthlyDemand = mean(monthlyProduction);

    // ── Holt-Winters forecast
    const hw = holtWintersMultiplicative(monthlyProduction, 12, 0.3, 0.1, 0.3, 3);
    const currentMonthForecast = hw.forecast[0] || avgMonthlyDemand;
    const next3MonthsForecast = hw.forecast.reduce((a, b) => a + b, 0);

    // ── Daily demand
    const workingDaysPerMonth = 22;
    const dailyDemand = currentMonthForecast / workingDaysPerMonth;

    // ── Safety Stock: SS = Z × √(LT_avg × σ²_d + d²_avg × σ²_LT)
    const sigmaD = standardDeviation(monthlyProduction.map(m => m / workingDaysPerMonth)); // daily demand std dev
    const avgDailyDemand = avgMonthlyDemand / workingDaysPerMonth;
    const sigmaLT = leadTimeVarianceDays;
    const safetyStock = Math.ceil(
      this.Z_SCORE * Math.sqrt(
        leadTimeDays * Math.pow(sigmaD, 2) + Math.pow(avgDailyDemand, 2) * Math.pow(sigmaLT, 2)
      )
    );

    // ── Reorder Point
    const reorderPoint = Math.ceil(dailyDemand * leadTimeDays + safetyStock);

    // ── Days of Supply (forward-looking walk through monthly forecasts)
    let remainingStock = currentStock;
    let daysOfSupply = 0;
    for (let i = 0; i < hw.forecast.length && remainingStock > 0; i++) {
      const monthlyDemand = hw.forecast[i] || avgMonthlyDemand;
      const dailyDemandForMonth = monthlyDemand / workingDaysPerMonth;
      if (dailyDemandForMonth <= 0) {
        daysOfSupply += workingDaysPerMonth;
        continue;
      }
      const daysThisMonth = Math.min(workingDaysPerMonth, remainingStock / dailyDemandForMonth);
      daysOfSupply += daysThisMonth;
      remainingStock -= daysThisMonth * dailyDemandForMonth;
    }
    daysOfSupply = Math.round(daysOfSupply);

    // ── Excess Inventory Value
    const excessInventory = Math.max(0, currentStock - next3MonthsForecast - safetyStock);
    const excessInventoryValue = excessInventory * unitCost;

    // ── RAG Status based on days of supply vs lead time
    let ragStatus: "red" | "amber" | "green" | "blue";
    if (daysOfSupply <= leadTimeDays * 0.5) {
      ragStatus = "red";         // Critical — stockout imminent
    } else if (daysOfSupply <= leadTimeDays * 1.5) {
      ragStatus = "amber";       // Warning — approaching reorder
    } else if (daysOfSupply <= leadTimeDays * 4) {
      ragStatus = "green";       // Healthy
    } else {
      ragStatus = "blue";        // Overstock
    }

    // ── Stock Risk Score (0-100)
    // Overstock risk (40%): excess as % of total production
    const overstockRisk = totalProduction > 0
      ? Math.min(100, (excessInventory / totalProduction) * 200)
      : 0;
    // Stockout risk (30%): inverse of days of supply coverage
    const stockoutRisk = leadTimeDays > 0
      ? Math.min(100, Math.max(0, (1 - daysOfSupply / (leadTimeDays * 3)) * 100))
      : 0;
    // Capital exposure risk (30%): excess value as proportion of annual revenue
    const capitalRisk = annualRevenue > 0
      ? Math.min(100, (excessInventoryValue / annualRevenue) * 300)
      : 0;
    const stockRiskScore = Math.round(overstockRisk * 0.4 + stockoutRisk * 0.3 + capitalRisk * 0.3);

    // ── Stock to Order Ratio
    const stockToOrderRatio = stockPercent;

    // ── ABC Classification (will be set globally in refreshAll, but estimate here)
    // This is a per-product placeholder — real ABC needs all products' revenue sorted
    const abcClass = props.abc_class || "B";

    return {
      monthly_production: monthlyProduction,
      avg_monthly_demand: Math.round(avgMonthlyDemand),
      current_month_demand_forecast: currentMonthForecast,
      next_3_months_forecast: hw.forecast,
      days_of_supply: daysOfSupply,
      safety_stock: safetyStock,
      reorder_point: reorderPoint,
      stock_risk_score: stockRiskScore,
      excess_inventory: excessInventory,
      excess_inventory_value: excessInventoryValue,
      rag_status: ragStatus,
      stock_to_order_ratio: stockToOrderRatio,
      abc_class: abcClass,
      daily_demand: Math.round(dailyDemand * 10) / 10,
      current_stock: currentStock,
      holt_winters_seasonal: hw.seasonal.map(s => Math.round(s * 100) / 100),
      overstock_risk: Math.round(overstockRisk),
      stockout_risk: Math.round(stockoutRisk),
      capital_risk: Math.round(capitalRisk),
      computed_at: new Date().toISOString(),
    };
  }

  /**
   * Compute ABC classification across all products and update
   */
  async computeAbcClassification(): Promise<void> {
    const [productType] = await db.select().from(objectTypes).where(eq(objectTypes.apiName, "product"));
    if (!productType) return;

    const productObjects = await db.select().from(objects).where(eq(objects.objectTypeId, productType.id));

    // Sort by revenue (total_production * unit_cost)
    const withRevenue = productObjects.map(p => {
      const props = p.properties as any;
      const revenue = (props.total_production || 0) * (props.unit_cost || 150);
      return { product: p, revenue };
    }).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = withRevenue.reduce((sum, p) => sum + p.revenue, 0);
    let cumulativeRevenue = 0;

    for (const item of withRevenue) {
      cumulativeRevenue += item.revenue;
      const cumulativePercent = totalRevenue > 0 ? (cumulativeRevenue / totalRevenue) * 100 : 0;

      let abcClass: "A" | "B" | "C";
      if (cumulativePercent <= 80) {
        abcClass = "A";
      } else if (cumulativePercent <= 95) {
        abcClass = "B";
      } else {
        abcClass = "C";
      }

      const computed = (item.product.computedProperties as any) || {};
      computed.abc_class = abcClass;

      await db.update(objects).set({
        computedProperties: computed,
      }).where(eq(objects.id, item.product.id));
    }
  }

  /**
   * Get stock intelligence dashboard summary
   */
  async getDashboard(): Promise<Record<string, any>> {
    const [productType] = await db.select().from(objectTypes).where(eq(objectTypes.apiName, "product"));
    if (!productType) return { products: 0 };

    const productObjects = await db.select().from(objects).where(eq(objects.objectTypeId, productType.id));

    let totalExcessValue = 0;
    let totalStockValue = 0;
    const ragCounts = { red: 0, amber: 0, green: 0, blue: 0 };
    const reorderAlerts: string[] = [];

    for (const product of productObjects) {
      const computed = product.computedProperties as any;
      if (!computed) continue;

      totalExcessValue += computed.excess_inventory_value || 0;
      const props = product.properties as any;
      totalStockValue += (computed.current_stock || 0) * (props.unit_cost || 150);

      const rag = computed.rag_status as keyof typeof ragCounts;
      if (rag in ragCounts) ragCounts[rag]++;

      if ((computed.current_stock || 0) <= (computed.reorder_point || 0)) {
        reorderAlerts.push(product.title);
      }
    }

    return {
      total_products: productObjects.length,
      rag_distribution: ragCounts,
      total_stock_value: totalStockValue,
      total_excess_value: totalExcessValue,
      capital_efficiency: totalStockValue > 0
        ? Math.round((1 - totalExcessValue / totalStockValue) * 100)
        : 100,
      reorder_alerts: reorderAlerts,
      last_computed: new Date().toISOString(),
    };
  }

  /**
   * Get all products with their RAG status
   */
  async getStockStatus(): Promise<any[]> {
    const [productType] = await db.select().from(objectTypes).where(eq(objectTypes.apiName, "product"));
    if (!productType) return [];

    const productObjects = await db.select().from(objects).where(eq(objects.objectTypeId, productType.id));

    return productObjects.map(p => ({
      id: p.id,
      sku: p.externalId,
      title: p.title,
      properties: p.properties,
      computed: p.computedProperties,
    })).sort((a: any, b: any) => {
      const riskA = a.computed?.stock_risk_score || 0;
      const riskB = b.computed?.stock_risk_score || 0;
      return riskB - riskA;
    });
  }

  /**
   * Get overstock report — products with excess inventory
   */
  async getOverstockReport(): Promise<any[]> {
    const allProducts = await this.getStockStatus();
    return allProducts
      .filter((p: any) => (p.computed?.excess_inventory || 0) > 0)
      .map((p: any) => ({
        ...p,
        severity: (p.computed?.rag_status === "blue") ? "critical" : "warning",
      }));
  }

  /**
   * Get seasonal forecast for next 3 months per product
   */
  async getSeasonalForecast(): Promise<any[]> {
    const allProducts = await this.getStockStatus();
    const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    const currentMonth = new Date().getMonth();

    return allProducts.map((p: any) => {
      const forecast = p.computed?.next_3_months_forecast || [0, 0, 0];
      return {
        id: p.id,
        sku: p.sku,
        title: p.title,
        forecast: forecast.map((f: number, i: number) => ({
          month: months[(currentMonth + i + 1) % 12],
          predicted_demand: f,
        })),
        total_forecast: forecast.reduce((a: number, b: number) => a + b, 0),
        avg_monthly_demand: p.computed?.avg_monthly_demand || 0,
        seasonal_factors: p.computed?.holt_winters_seasonal || [],
      };
    });
  }

  /**
   * Get total capital exposure from excess inventory
   */
  async getCapitalExposure(): Promise<any> {
    const allProducts = await this.getStockStatus();
    const overstocked = allProducts.filter((p: any) => (p.computed?.excess_inventory || 0) > 0);

    const totalExcess = overstocked.reduce((sum: number, p: any) => sum + (p.computed?.excess_inventory_value || 0), 0);
    const totalStockValue = allProducts.reduce((sum: number, p: any) => {
      const props = p.properties as any;
      return sum + ((p.computed?.current_stock || 0) * (props?.unit_cost || 150));
    }, 0);

    return {
      total_capital_exposure: totalExcess,
      total_stock_value: totalStockValue,
      exposure_percent: totalStockValue > 0 ? Math.round((totalExcess / totalStockValue) * 100) : 0,
      products: overstocked.map((p: any) => ({
        sku: p.sku,
        title: p.title,
        excess_units: p.computed?.excess_inventory || 0,
        excess_value: p.computed?.excess_inventory_value || 0,
        rag_status: p.computed?.rag_status,
      })).sort((a: any, b: any) => b.excess_value - a.excess_value),
    };
  }

  /**
   * Get products below reorder point
   */
  async getReorderAlerts(): Promise<any[]> {
    const allProducts = await this.getStockStatus();
    return allProducts
      .filter((p: any) => {
        const stock = p.computed?.current_stock || 0;
        const reorderPoint = p.computed?.reorder_point || 0;
        return stock <= reorderPoint;
      })
      .map((p: any) => ({
        id: p.id,
        sku: p.sku,
        title: p.title,
        current_stock: p.computed?.current_stock || 0,
        reorder_point: p.computed?.reorder_point || 0,
        safety_stock: p.computed?.safety_stock || 0,
        days_of_supply: p.computed?.days_of_supply || 0,
        rag_status: p.computed?.rag_status,
        urgency: (p.computed?.rag_status === "red") ? "critical" : "warning",
      }));
  }
}

export const computeEngine = new ComputeEngine();
