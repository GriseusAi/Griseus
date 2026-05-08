import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

const sourceIds = ["recipe", "component_stock", "finished_stock", "sales_average"] as const;
type SourceId = typeof sourceIds[number];

const runSchema = z.object({
  sku: z.string().min(1),
  sources: z.array(z.enum(sourceIds)).min(1).default(["recipe", "component_stock", "finished_stock", "sales_average"]),
});

const sourceCatalog: Array<{
  id: SourceId;
  label: string;
  description: string;
  primaryKey: string;
  joinsOn: string[];
}> = [
  {
    id: "recipe",
    label: "Cihaz reçetesi",
    description: "BOM satırları: cihaz SKU, komponent kodu, reçete adedi, tier",
    primaryKey: "productSku + componentCode",
    joinsOn: ["productSku", "componentCode"],
  },
  {
    id: "component_stock",
    label: "Bileşen stok durumu",
    description: "Komponent bazlı canlı stok ve sayım bilgisi",
    primaryKey: "componentCode",
    joinsOn: ["componentCode"],
  },
  {
    id: "finished_stock",
    label: "Bitmiş ürün stoku",
    description: "SKU bazlı üretimde, depoda ve satılan adetler",
    primaryKey: "productSku",
    joinsOn: ["productSku"],
  },
  {
    id: "sales_average",
    label: "Satış ortalamaları",
    description: "SKU bazlı aylık ortalama satış, toplam satış ve dönem sayısı",
    primaryKey: "productSku",
    joinsOn: ["productSku"],
  },
];

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

router.get("/sources", async (_req, res) => {
  try {
    const productsResult = await db.execute(sql`
      SELECT DISTINCT
        p.sku,
        p.name,
        p.category,
        COUNT(b.id)::int AS "componentCount"
      FROM products p
      INNER JOIN bom_items b ON b.parent_product_sku = p.sku
      GROUP BY p.sku, p.name, p.category
      ORDER BY p.sku
    `);

    res.json({
      sources: sourceCatalog,
      products: productsResult.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/preview/:sourceId", async (req, res) => {
  try {
    const sourceId = req.params.sourceId as SourceId;
    const sku = String(req.query.sku || "");
    if (!sourceIds.includes(sourceId)) return res.status(404).json({ error: "Kaynak bulunamadı" });
    if (!sku) return res.status(400).json({ error: "sku gerekli" });

    const queryBySource: Record<SourceId, any> = {
      recipe: sql`
        SELECT
          parent_product_sku AS "productSku",
          component_code AS "componentCode",
          component_name AS "componentName",
          required_quantity::float AS "requiredPerUnit",
          unit,
          tier
        FROM bom_items
        WHERE parent_product_sku = ${sku}
        ORDER BY tier, component_code
        LIMIT 20
      `,
      component_stock: sql`
        SELECT
          b.parent_product_sku AS "productSku",
          cs.component_code AS "componentCode",
          cs.current_stock::float AS "currentStock",
          cs.unit,
          cs.last_counted_at AS "lastCountedAt"
        FROM component_stock cs
        INNER JOIN bom_items b ON b.component_code = cs.component_code
        WHERE b.parent_product_sku = ${sku}
        ORDER BY cs.component_code
        LIMIT 20
      `,
      finished_stock: sql`
        SELECT
          p.sku AS "productSku",
          p.name AS "productName",
          COALESCE(sl.in_production, 0)::int AS "inProduction",
          COALESCE(sl.in_warehouse, 0)::int AS "inWarehouse",
          COALESCE(sl.total_sold, 0)::int AS "totalSold"
        FROM products p
        LEFT JOIN stock_levels sl ON sl.product_id = p.id
        WHERE p.sku = ${sku}
        LIMIT 20
      `,
      sales_average: sql`
        SELECT
          product_sku AS "productSku",
          ROUND(AVG(quantity_sold)::numeric, 2)::float AS "avgMonthlySales",
          SUM(quantity_sold)::int AS "totalSoldInHistory",
          COUNT(*)::int AS "periods",
          ROUND(COALESCE(AVG(revenue), 0)::numeric, 2)::float AS "avgMonthlyRevenue"
        FROM sales_history
        WHERE product_sku = ${sku}
        GROUP BY product_sku
        LIMIT 20
      `,
    };

    const result = await db.execute(queryBySource[sourceId]);
    res.json({ source: sourceCatalog.find(s => s.id === sourceId), rows: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/run", async (req, res) => {
  try {
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(", ") });
    }
    const { sku, sources } = parsed.data;
    const enabled = new Set<SourceId>(sources);

    const result = await db.execute(sql`
      WITH recipe AS (
        SELECT
          b.parent_product_sku AS "productSku",
          b.component_code AS "componentCode",
          b.component_name AS "componentName",
          b.required_quantity::float AS "requiredPerUnit",
          b.unit,
          b.tier,
          b.parent_component_code AS "parentComponentCode"
        FROM bom_items b
        WHERE b.parent_product_sku = ${sku}
      ),
      finished_stock AS (
        SELECT
          p.sku AS "productSku",
          p.name AS "productName",
          p.category AS "productCategory",
          COALESCE(sl.in_production, 0)::int AS "inProduction",
          COALESCE(sl.in_warehouse, 0)::int AS "inWarehouse",
          COALESCE(sl.total_sold, 0)::int AS "totalSold"
        FROM products p
        LEFT JOIN stock_levels sl ON sl.product_id = p.id
        WHERE p.sku = ${sku}
      ),
      sales_average AS (
        SELECT
          product_sku AS "productSku",
          ROUND(AVG(quantity_sold)::numeric, 2)::float AS "avgMonthlySales",
          SUM(quantity_sold)::int AS "historicalSold",
          COUNT(*)::int AS "salesPeriods",
          ROUND(COALESCE(AVG(revenue), 0)::numeric, 2)::float AS "avgMonthlyRevenue"
        FROM sales_history
        WHERE product_sku = ${sku}
        GROUP BY product_sku
      )
      SELECT
        r."productSku",
        fs."productName",
        fs."productCategory",
        r."componentCode",
        r."componentName",
        r."requiredPerUnit",
        r.unit,
        r.tier,
        r."parentComponentCode",
        COALESCE(cs.current_stock, 0)::float AS "currentStock",
        COALESCE(fs."inProduction", 0)::int AS "finishedInProduction",
        COALESCE(fs."inWarehouse", 0)::int AS "finishedInWarehouse",
        COALESCE(fs."totalSold", 0)::int AS "finishedTotalSold",
        COALESCE(sa."avgMonthlySales", 0)::float AS "avgMonthlySales",
        COALESCE(sa."historicalSold", 0)::int AS "historicalSold",
        COALESCE(sa."salesPeriods", 0)::int AS "salesPeriods",
        COALESCE(sa."avgMonthlyRevenue", 0)::float AS "avgMonthlyRevenue"
      FROM recipe r
      LEFT JOIN component_stock cs ON cs.component_code = r."componentCode"
      LEFT JOIN finished_stock fs ON fs."productSku" = r."productSku"
      LEFT JOIN sales_average sa ON sa."productSku" = r."productSku"
      ORDER BY r.tier, r."componentCode"
    `);

    const rows = result.rows.map((row: any) => {
      const requiredPerUnit = enabled.has("recipe") ? toNumber(row.requiredPerUnit) : 0;
      const currentStock = enabled.has("component_stock") ? toNumber(row.currentStock) : 0;
      const avgMonthlySales = enabled.has("sales_average") ? toNumber(row.avgMonthlySales) : 0;
      const monthlyComponentDemand = requiredPerUnit * avgMonthlySales;
      const monthsOfCover = monthlyComponentDemand > 0 ? currentStock / monthlyComponentDemand : null;
      const maxBuildableFromComponent = requiredPerUnit > 0 ? Math.floor(currentStock / requiredPerUnit) : null;

      return {
        productSku: row.productSku,
        productName: enabled.has("finished_stock") ? row.productName : null,
        productCategory: enabled.has("finished_stock") ? row.productCategory : null,
        componentCode: row.componentCode,
        componentName: row.componentName,
        requiredPerUnit,
        unit: row.unit,
        tier: row.tier,
        parentComponentCode: row.parentComponentCode,
        currentStock,
        maxBuildableFromComponent,
        finishedInProduction: enabled.has("finished_stock") ? toNumber(row.finishedInProduction) : null,
        finishedInWarehouse: enabled.has("finished_stock") ? toNumber(row.finishedInWarehouse) : null,
        finishedTotalSold: enabled.has("finished_stock") ? toNumber(row.finishedTotalSold) : null,
        avgMonthlySales,
        historicalSold: enabled.has("sales_average") ? toNumber(row.historicalSold) : null,
        salesPeriods: enabled.has("sales_average") ? toNumber(row.salesPeriods) : null,
        avgMonthlyRevenue: enabled.has("sales_average") ? toNumber(row.avgMonthlyRevenue) : null,
        projectedMonthlyComponentDemand: Math.round(monthlyComponentDemand * 100) / 100,
        monthsOfComponentCover: monthsOfCover === null ? null : Math.round(monthsOfCover * 100) / 100,
        status:
          monthsOfCover !== null && monthsOfCover < 1 ? "critical"
          : monthsOfCover !== null && monthsOfCover < 3 ? "warning"
          : maxBuildableFromComponent !== null && maxBuildableFromComponent < 50 ? "warning"
          : "ok",
      };
    });

    const bottleneck = rows
      .filter(r => typeof r.maxBuildableFromComponent === "number")
      .sort((a, b) => (a.maxBuildableFromComponent ?? Infinity) - (b.maxBuildableFromComponent ?? Infinity))[0] ?? null;

    res.json({
      runId: `pb-${Date.now()}`,
      sku,
      sources,
      joins: [
        { left: "recipe.productSku", right: "finished_stock.productSku", enabled: enabled.has("recipe") && enabled.has("finished_stock") },
        { left: "recipe.componentCode", right: "component_stock.componentCode", enabled: enabled.has("recipe") && enabled.has("component_stock") },
        { left: "recipe.productSku", right: "sales_average.productSku", enabled: enabled.has("recipe") && enabled.has("sales_average") },
      ],
      summary: {
        componentCount: rows.length,
        criticalCount: rows.filter(r => r.status === "critical").length,
        warningCount: rows.filter(r => r.status === "warning").length,
        maxDeviceBuildable: bottleneck?.maxBuildableFromComponent ?? 0,
        bottleneckComponent: bottleneck ? `${bottleneck.componentCode} - ${bottleneck.componentName}` : null,
        avgMonthlySales: rows[0]?.avgMonthlySales ?? 0,
      },
      columns: rows[0] ? Object.keys(rows[0]) : [],
      rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
