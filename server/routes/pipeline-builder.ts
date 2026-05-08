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
  customData: z.record(z.enum(sourceIds), z.array(z.record(z.any()))).optional(),
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

function firstValue(row: Record<string, any>, keys: string[], fallback?: any) {
  const normalized = new Map(Object.keys(row).map(k => [k.toLowerCase().replace(/[\s_-]+/g, ""), k]));
  for (const key of keys) {
    const found = normalized.get(key.toLowerCase().replace(/[\s_-]+/g, ""));
    if (found && row[found] !== undefined && row[found] !== "") return row[found];
  }
  return fallback;
}

function normalizeRecipeRows(rows: Array<Record<string, any>>, sku: string) {
  return rows.map((row, index) => ({
    productSku: String(firstValue(row, ["productSku", "parentProductSku", "sku", "cihazSku", "cihaz_sku"], sku)),
    componentCode: String(firstValue(row, ["componentCode", "component_code", "code", "komponentKodu", "komponent_kodu"], `row-${index + 1}`)),
    componentName: String(firstValue(row, ["componentName", "component_name", "name", "komponentAdi", "komponent_adi"], "")),
    requiredPerUnit: toNumber(firstValue(row, ["requiredPerUnit", "requiredQuantity", "required_quantity", "quantity", "qty", "receteAdedi", "recete_adedi"], 1)),
    unit: String(firstValue(row, ["unit", "birim"], "AD")),
    tier: Math.max(1, Math.floor(toNumber(firstValue(row, ["tier", "seviye"], 1)))),
    parentComponentCode: firstValue(row, ["parentComponentCode", "parent_component_code", "parentCode", "ustKomponent"], null),
  })).filter(row => row.componentCode);
}

function normalizeComponentStockRows(rows: Array<Record<string, any>>) {
  return rows.map((row, index) => ({
    componentCode: String(firstValue(row, ["componentCode", "component_code", "code", "komponentKodu", "komponent_kodu"], `row-${index + 1}`)),
    currentStock: toNumber(firstValue(row, ["currentStock", "current_stock", "stock", "stok", "komponentStok", "komponent_stok"], 0)),
    unit: String(firstValue(row, ["unit", "birim"], "AD")),
  })).filter(row => row.componentCode);
}

function normalizeFinishedStockRows(rows: Array<Record<string, any>>, sku: string) {
  return rows.map(row => ({
    productSku: String(firstValue(row, ["productSku", "sku", "cihazSku", "cihaz_sku"], sku)),
    productName: String(firstValue(row, ["productName", "name", "cihazAdi", "cihaz_adi"], sku)),
    productCategory: firstValue(row, ["productCategory", "category", "kategori"], null),
    inProduction: toNumber(firstValue(row, ["inProduction", "in_production", "uretimde", "bitmisUretim", "bitmis_uretim"], 0)),
    inWarehouse: toNumber(firstValue(row, ["inWarehouse", "in_warehouse", "warehouse", "depo", "bitmisDepo", "bitmis_depo"], 0)),
    totalSold: toNumber(firstValue(row, ["totalSold", "total_sold", "sold", "satilan", "toplamSatis"], 0)),
  })).filter(row => row.productSku);
}

function normalizeSalesRows(rows: Array<Record<string, any>>, sku: string) {
  const values = rows.map(row => ({
    productSku: String(firstValue(row, ["productSku", "product_sku", "sku", "cihazSku", "cihaz_sku"], sku)),
    avgMonthlySales: firstValue(row, ["avgMonthlySales", "avg_monthly_sales", "aylikSatisOrt", "aylik_satis_ort"], undefined),
    quantitySold: firstValue(row, ["quantitySold", "quantity_sold", "qty", "sales", "satis", "adet"], undefined),
    revenue: firstValue(row, ["revenue", "ciro"], 0),
  })).filter(row => row.productSku);

  const scoped = values.filter(row => row.productSku === sku || values.length === 1);
  if (scoped.length === 0) return null;
  const explicitAvg = scoped.find(row => row.avgMonthlySales !== undefined);
  if (explicitAvg) {
    return {
      productSku: sku,
      avgMonthlySales: toNumber(explicitAvg.avgMonthlySales),
      historicalSold: scoped.reduce((sum, row) => sum + toNumber(row.quantitySold), 0),
      salesPeriods: scoped.length,
      avgMonthlyRevenue: scoped.reduce((sum, row) => sum + toNumber(row.revenue), 0) / Math.max(scoped.length, 1),
    };
  }
  const total = scoped.reduce((sum, row) => sum + toNumber(row.quantitySold), 0);
  return {
    productSku: sku,
    avgMonthlySales: Math.round((total / Math.max(scoped.length, 1)) * 100) / 100,
    historicalSold: total,
    salesPeriods: scoped.length,
    avgMonthlyRevenue: scoped.reduce((sum, row) => sum + toNumber(row.revenue), 0) / Math.max(scoped.length, 1),
  };
}

async function loadDbSources(sku: string) {
  const [recipeResult, stockResult, finishedResult, salesResult] = await Promise.all([
    db.execute(sql`
      SELECT
        parent_product_sku AS "productSku",
        component_code AS "componentCode",
        component_name AS "componentName",
        required_quantity::float AS "requiredPerUnit",
        unit,
        tier,
        parent_component_code AS "parentComponentCode"
      FROM bom_items
      WHERE parent_product_sku = ${sku}
      ORDER BY tier, component_code
    `),
    db.execute(sql`
      SELECT
        component_code AS "componentCode",
        current_stock::float AS "currentStock",
        unit
      FROM component_stock
    `),
    db.execute(sql`
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
    `),
    db.execute(sql`
      SELECT
        product_sku AS "productSku",
        ROUND(AVG(quantity_sold)::numeric, 2)::float AS "avgMonthlySales",
        SUM(quantity_sold)::int AS "historicalSold",
        COUNT(*)::int AS "salesPeriods",
        ROUND(COALESCE(AVG(revenue), 0)::numeric, 2)::float AS "avgMonthlyRevenue"
      FROM sales_history
      WHERE product_sku = ${sku}
      GROUP BY product_sku
    `),
  ]);

  return {
    recipe: recipeResult.rows as any[],
    component_stock: stockResult.rows as any[],
    finished_stock: finishedResult.rows[0] as any | undefined,
    sales_average: salesResult.rows[0] as any | undefined,
  };
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
    const { sku, sources, customData } = parsed.data;
    const enabled = new Set<SourceId>(sources);
    const dbSources = await loadDbSources(sku);
    const customFlags = {
      recipe: Boolean(customData?.recipe?.length),
      component_stock: Boolean(customData?.component_stock?.length),
      finished_stock: Boolean(customData?.finished_stock?.length),
      sales_average: Boolean(customData?.sales_average?.length),
    };

    const recipeRows = customFlags.recipe
      ? normalizeRecipeRows(customData!.recipe!, sku)
      : dbSources.recipe;
    const componentStockRows = customFlags.component_stock
      ? normalizeComponentStockRows(customData!.component_stock!)
      : dbSources.component_stock;
    const finishedStock = customFlags.finished_stock
      ? normalizeFinishedStockRows(customData!.finished_stock!, sku)[0]
      : dbSources.finished_stock;
    const salesAverage = customFlags.sales_average
      ? normalizeSalesRows(customData!.sales_average!, sku)
      : dbSources.sales_average;

    const stockByCode = new Map(componentStockRows.map((row: any) => [String(row.componentCode), row]));

    const rows = recipeRows.map((recipe: any) => {
      const stock = stockByCode.get(String(recipe.componentCode)) as any | undefined;
      const row = {
        productSku: recipe.productSku || sku,
        productName: finishedStock?.productName ?? sku,
        productCategory: finishedStock?.productCategory ?? null,
        componentCode: recipe.componentCode,
        componentName: recipe.componentName,
        requiredPerUnit: recipe.requiredPerUnit,
        unit: recipe.unit,
        tier: recipe.tier,
        parentComponentCode: recipe.parentComponentCode,
        currentStock: stock?.currentStock ?? 0,
        finishedInProduction: finishedStock?.inProduction ?? 0,
        finishedInWarehouse: finishedStock?.inWarehouse ?? 0,
        finishedTotalSold: finishedStock?.totalSold ?? 0,
        avgMonthlySales: salesAverage?.avgMonthlySales ?? 0,
        historicalSold: salesAverage?.historicalSold ?? 0,
        salesPeriods: salesAverage?.salesPeriods ?? 0,
        avgMonthlyRevenue: salesAverage?.avgMonthlyRevenue ?? 0,
      };
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
      customSources: Object.entries(customFlags).filter(([, isCustom]) => isCustom).map(([id]) => id),
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
