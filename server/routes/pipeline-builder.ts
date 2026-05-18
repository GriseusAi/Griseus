import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const sourceIds = ["recipe", "component_stock", "finished_stock", "sales_average"] as const;
type SourceId = typeof sourceIds[number];

const runSchema = z.object({
  sku: z.string().min(1),
  sources: z.array(z.enum(sourceIds)).min(1).default(["recipe", "component_stock", "finished_stock", "sales_average"]),
  customData: z.record(z.enum(sourceIds), z.array(z.record(z.any()))).optional(),
});

const semanticValidateSchema = z.object({
  connection: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.string().optional(),
    contract: z.object({
      relation: z.string().min(1),
      fromRole: z.string().optional(),
      toRole: z.string().optional(),
      fieldMap: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
      context: z.record(z.string()).default({}),
      internal: z.object({
        entity: z.literal("orderLine"),
        fields: z.record(z.any()),
        contracts: z.array(z.object({
          relation: z.string(),
          fieldMap: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
        })).default([]),
      }).optional(),
      status: z.string().optional(),
      message: z.string().optional(),
    }).optional(),
  }),
  source: z.object({
    id: z.string(),
    title: z.string(),
    semanticRole: z.string().optional(),
    semanticLabel: z.string().optional(),
    orderFields: z.record(z.any()).optional(),
    orderLineFields: z.record(z.any()).optional(),
    deviceQuantity: z.string().optional(),
  }),
  target: z.object({
    id: z.string(),
    title: z.string(),
    semanticRole: z.string().optional(),
    orderFields: z.record(z.any()).optional(),
    orderLineFields: z.record(z.any()).optional(),
    semanticLabel: z.string().optional(),
    deviceSku: z.string().optional(),
    deviceQuantity: z.string().optional(),
  }),
});

const pipelineDefinitionSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().min(1).max(100),
  nodes: z.array(z.record(z.any())),
  connections: z.array(z.record(z.any())),
  selectedNodeId: z.string().min(1),
  savedAt: z.string().optional(),
});

const ontologyAnalyzeSchema = z.object({
  selectedNodeId: z.string().min(1),
  chartMode: z.enum(["fulfillment", "capacity", "risk"]).default("fulfillment"),
  xDimension: z.enum(["device", "customer", "deadline", "riskTier"]).default("device"),
  yMetrics: z.array(z.enum([
    "requested",
    "warehouse",
    "producible",
    "shortage",
    "criticalComponents",
    "warningComponents",
    "riskScore",
    "totalSold",
  ])).min(1).max(6).default(["requested", "warehouse", "producible", "shortage"]),
  nodes: z.array(z.record(z.any())).max(200),
  connections: z.array(z.record(z.any())).max(500),
});

const ontologySemanticLayerSchema = z.object({
  selectedNodeId: z.string().min(1),
  chartMode: z.enum(["fulfillment", "capacity", "risk"]).default("fulfillment"),
  xDimension: z.enum(["device", "customer", "deadline", "riskTier"]).default("device"),
  yMetrics: z.array(z.enum([
    "requested",
    "warehouse",
    "producible",
    "shortage",
    "criticalComponents",
    "warningComponents",
    "riskScore",
    "totalSold",
  ])).min(1).max(6).default(["requested", "warehouse", "producible", "shortage"]),
  nodes: z.array(z.record(z.any())).max(200),
  connections: z.array(z.record(z.any())).max(500),
});

const graphFunctionRunSchema = ontologySemanticLayerSchema.extend({
  functionId: z.enum(["fulfillment-risk-by-device"]).default("fulfillment-risk-by-device"),
  filters: z.record(z.any()).default({}),
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

router.get("/definitions", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT id, name, config, updated_at AS "updatedAt"
      FROM pipeline_definitions
      WHERE pipeline_type = 'builder_graph'
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 30
    `);

    res.json({
      pipelines: result.rows.map(row => toSavedPipeline(row)).filter(Boolean),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/definitions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Geçersiz pipeline id" });

    const result = await db.execute(sql`
      SELECT id, name, config, updated_at AS "updatedAt"
      FROM pipeline_definitions
      WHERE id = ${id} AND pipeline_type = 'builder_graph'
      LIMIT 1
    `);
    const pipeline = toSavedPipeline(result.rows[0]);
    if (!pipeline) return res.status(404).json({ error: "Pipeline bulunamadı" });
    res.json({ pipeline });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/definitions", async (req, res) => {
  try {
    const parsed = pipelineDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(", ") });
    }

    const input = parsed.data;
    const semanticContracts = input.connections
      .map(connection => connection.contract)
      .filter(Boolean);
    const config = {
      version: 1,
      graph: {
        nodes: input.nodes,
        connections: input.connections,
        selectedNodeId: input.selectedNodeId,
      },
      semanticContracts,
      savedAt: input.savedAt ?? new Date().toISOString(),
    };
    const numericId = Number(input.id);
    const shouldUpdate = Number.isInteger(numericId) && numericId > 0;

    const result = shouldUpdate
      ? await db.execute(sql`
          UPDATE pipeline_definitions
          SET name = ${input.name},
              config = ${JSON.stringify(config)}::jsonb,
              updated_at = NOW()
          WHERE id = ${numericId} AND pipeline_type = 'builder_graph'
          RETURNING id, name, config, updated_at AS "updatedAt"
        `)
      : await db.execute(sql`
          INSERT INTO pipeline_definitions (name, description, pipeline_type, enabled, config, last_status, created_at, updated_at)
          VALUES (${input.name}, ${"Pipeline Builder canvas graph"}, 'builder_graph', true, ${JSON.stringify(config)}::jsonb, 'draft', NOW(), NOW())
          RETURNING id, name, config, updated_at AS "updatedAt"
        `);

    const pipeline = toSavedPipeline(result.rows[0]);
    if (!pipeline) return res.status(500).json({ error: "Pipeline kaydedildi ama okunamadı" });
    res.json({ pipeline });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/semantic/validate", async (req, res) => {
  try {
    const parsed = semanticValidateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.errors.map(e => e.message).join(", ") });
    }
    const { connection, source, target } = parsed.data;
    const contract = connection.contract;
    if (!contract) return res.status(400).json({ ok: false, error: "semantic contract gerekli" });

    if (contract.relation === "customer_order") {
      if (source.semanticRole !== "customer" || target.semanticRole !== "order") {
        return res.status(422).json({ ok: false, error: "customer_order için source=customer ve target=order olmalı" });
      }
      if (!contract.context.customer) {
        return res.status(422).json({ ok: false, error: "customer context eksik" });
      }
      return res.json({
        ok: true,
        relation: "customer_order",
        validatedAt: new Date().toISOString(),
        context: contract.context,
        fieldMap: contract.fieldMap,
        message: `${source.title} → ${target.title}: backend semantic contract doğrulandı.`,
      });
    }

    if (contract.relation === "customer_device") {
      if (source.semanticRole !== "customer" || target.semanticRole !== "device") {
        return res.status(422).json({ ok: false, error: "customer_device için source=customer ve target=device olmalı" });
      }
      const internalContract = contract.internal?.entity === "orderLine" ? contract.internal : null;
      const internalLine = internalContract?.fields;
      const customer = contract.context.customer || source.semanticLabel || source.title || "";
      const device = contract.context.device || target.deviceSku || target.semanticLabel || target.title;
      const quantity = String(internalLine?.quantity || contract.context.quantity || target.deviceQuantity || "");
      if (!customer) {
        return res.status(422).json({ ok: false, error: "customer context eksik" });
      }
      if (!device) {
        return res.status(422).json({ ok: false, error: "device context eksik" });
      }
      return res.json({
        ok: true,
        relation: "customer_device",
        validatedAt: new Date().toISOString(),
        context: { ...contract.context, customer, device, quantity },
        fieldMap: contract.fieldMap,
        internal: {
          entity: "orderLine",
          fields: {
            customer: String(internalLine?.customer || customer),
            deadline: String(internalLine?.deadline || contract.context.deadline || ""),
            deviceType: String(internalLine?.deviceType || device),
            quantity,
          },
          contracts: internalContract?.contracts ?? [],
        },
        message: `${source.title} → ${target.title}: backend müşteri-cihaz hidden sipariş kalemi doğrulandı.`,
      });
    }

    if (contract.relation === "order_order_line") {
      if (source.semanticRole !== "order" || target.semanticRole !== "orderLine") {
        return res.status(422).json({ ok: false, error: "order_order_line için source=order ve target=orderLine olmalı" });
      }
      const customer = contract.context.customer || String((source as any).orderFields?.customer || "");
      return res.json({
        ok: true,
        relation: "order_order_line",
        validatedAt: new Date().toISOString(),
        context: { ...contract.context, customer },
        fieldMap: contract.fieldMap,
        message: `${source.title} → ${target.title}: backend sipariş kalemi contract doğrulandı.`,
      });
    }

    if (contract.relation === "order_line_device") {
      if (source.semanticRole !== "orderLine" || target.semanticRole !== "device") {
        return res.status(422).json({ ok: false, error: "order_line_device için source=orderLine ve target=device olmalı" });
      }
      const lineDevice = typeof source.orderLineFields?.deviceType === "string" ? source.orderLineFields.deviceType : "";
      const lineQuantity = typeof source.orderLineFields?.quantity === "string" ? source.orderLineFields.quantity : "";
      const device = contract.context.device || target.semanticLabel || target.deviceSku || target.title;
      if (!device) {
        return res.status(422).json({ ok: false, error: "device context eksik" });
      }
      if (lineDevice && device !== "Cihaz" && lineDevice !== device) {
        return res.status(422).json({ ok: false, error: "sipariş kalemi cihaz tipi ile cihaz node'u eşleşmiyor" });
      }
      return res.json({
        ok: true,
        relation: "order_line_device",
        validatedAt: new Date().toISOString(),
        context: { ...contract.context, device: lineDevice || device, quantity: lineQuantity || contract.context.quantity || "" },
        fieldMap: contract.fieldMap,
        message: `${source.title} → ${target.title}: backend kalem-cihaz contract doğrulandı.`,
      });
    }

    if (contract.relation === "order_device") {
      if (source.semanticRole !== "order" || target.semanticRole !== "device") {
        return res.status(422).json({ ok: false, error: "order_device için source=order ve target=device olmalı" });
      }
      const internalContract = contract.internal?.entity === "orderLine" ? contract.internal : null;
      const internalLine = internalContract?.fields;
      if (!internalContract || !internalLine) {
        return res.status(422).json({ ok: false, error: "order_device için internal orderLine contract gerekli" });
      }
      const lineDevice = typeof internalLine.deviceType === "string" ? internalLine.deviceType : "";
      const lineQuantity = typeof internalLine.quantity === "string" ? internalLine.quantity : "";
      const device = contract.context.device || target.deviceSku || target.semanticLabel || target.title;
      if (!device) {
        return res.status(422).json({ ok: false, error: "device context eksik" });
      }
      if (lineDevice && device !== "Cihaz" && lineDevice !== device) {
        return res.status(422).json({ ok: false, error: "internal sipariş kalemi cihaz tipi ile cihaz node'u eşleşmiyor" });
      }
      return res.json({
        ok: true,
        relation: "order_device",
        validatedAt: new Date().toISOString(),
        context: { ...contract.context, device: lineDevice || device, quantity: lineQuantity || contract.context.quantity || "" },
        fieldMap: contract.fieldMap,
        internal: {
          entity: "orderLine",
          fields: {
            customer: String(internalLine.customer || contract.context.customer || ""),
            deadline: String(internalLine.deadline || contract.context.deadline || ""),
            deviceType: lineDevice || device,
            quantity: lineQuantity || contract.context.quantity || "",
          },
          contracts: internalContract.contracts,
        },
        message: `${source.title} → ${target.title}: backend hidden sipariş kalemi contract doğrulandı.`,
      });
    }

    return res.json({
      ok: true,
      relation: contract.relation,
      validatedAt: new Date().toISOString(),
      context: contract.context,
      fieldMap: contract.fieldMap,
      message: `${source.title} → ${target.title}: generic semantic contract doğrulandı.`,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function toSavedPipeline(row: any) {
  if (!row) return null;
  const config = row.config ?? {};
  const graph = config.graph ?? {};
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) return null;
  return {
    id: String(row.id),
    name: row.name,
    nodes: graph.nodes,
    connections: graph.connections,
    selectedNodeId: typeof graph.selectedNodeId === "string" ? graph.selectedNodeId : graph.nodes[0]?.id,
    savedAt: config.savedAt ?? row.updatedAt ?? new Date().toISOString(),
    backendStored: true,
  };
}

type OntologyAnalyzeContext = ReturnType<typeof collectOntologyAnalyzeContext>;

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_anthropicClient) _anthropicClient = new Anthropic({ apiKey });
  return _anthropicClient;
}

function compactNode(node: any) {
  const bom = node.bomComponent;
  return {
    id: String(node.id || ""),
    kind: String(node.kind || ""),
    title: String(node.title || ""),
    subtitle: String(node.subtitle || ""),
    semanticRole: node.semanticRole || null,
    semanticLabel: node.semanticLabel || null,
    deviceSku: node.deviceSku || null,
    deviceQuantity: node.deviceQuantity || null,
    deviceOperationMode: node.deviceOperationMode || null,
    deviceOperation: node.deviceOperation ? {
      status: node.deviceOperation.status,
      sku: node.deviceOperation.sku,
      inWarehouse: toNumber(node.deviceOperation.inWarehouse),
      inProduction: toNumber(node.deviceOperation.inProduction),
      totalSold: toNumber(node.deviceOperation.totalSold),
      maxProducible: node.deviceOperation.maxProducible === null ? null : toNumber(node.deviceOperation.maxProducible),
      bottleneck: node.deviceOperation.bottleneck || null,
    } : null,
    orderFields: node.orderFields || null,
    orderLineFields: node.orderLineFields || null,
    procurementFields: node.procurementFields || null,
    rows: Array.isArray(node.rows) ? node.rows.slice(0, 100) : [],
    bomComponent: bom ? {
      sku: bom.sku || null,
      code: bom.code || null,
      name: bom.name || null,
      status: bom.status || null,
      tier: bom.tier ?? null,
      requiredPerUnit: bom.requiredPerUnit ?? null,
      currentStock: bom.currentStock ?? null,
      maxProducts: bom.maxProducts ?? null,
      orderQuantity: bom.orderQuantity ?? null,
      requiredForOrder: bom.requiredForOrder ?? null,
      stockShortage: bom.stockShortage ?? null,
      isInsufficient: Boolean(bom.isInsufficient),
      isSubAssembly: Boolean(bom.isSubAssembly),
    } : null,
  };
}

function collectOntologyAnalyzeContext(input: z.infer<typeof ontologyAnalyzeSchema>) {
  const byId = new Map(input.nodes.map(node => [String(node.id), compactNode(node)]));
  const upstreamIds = new Set<string>();
  const walk = (targetId: string) => {
    input.connections
      .filter(connection => String(connection.to) === targetId)
      .forEach(connection => {
        const from = String(connection.from || "");
        if (!from || upstreamIds.has(from)) return;
        upstreamIds.add(from);
        walk(from);
      });
  };
  walk(input.selectedNodeId);

  const connected = Array.from(upstreamIds).map(id => byId.get(id)).filter(Boolean) as ReturnType<typeof compactNode>[];
  const scopedConnections = input.connections
    .filter(connection => upstreamIds.has(String(connection.from)) && (upstreamIds.has(String(connection.to)) || String(connection.to) === input.selectedNodeId))
    .map(connection => ({
      from: String(connection.from || ""),
      to: String(connection.to || ""),
      kind: connection.kind || null,
      relation: connection.contract?.relation || null,
      context: connection.contract?.context || {},
      fieldMap: connection.contract?.fieldMap || [],
    }));
  const devices = connected.filter(node => node.semanticRole === "device");
  const orders = connected.filter(node => node.semanticRole === "order" || node.semanticRole === "orderLine");
  const customers = connected.filter(node => node.semanticRole === "customer");
  const procurement = connected.filter(node => node.semanticRole === "procurement");
  const bom = connected.filter(node => node.kind === "component" || node.bomComponent);

  return {
    selectedNodeId: input.selectedNodeId,
    chartMode: input.chartMode,
    chartConfig: {
      xDimension: input.xDimension,
      yMetrics: input.yMetrics,
    },
    connected,
    scopedConnections,
    counts: {
      devices: devices.length,
      orders: orders.length,
      customers: customers.length,
      procurement: procurement.length,
      bom: bom.length,
    },
    devices,
    orders,
    customers,
    procurement,
    bom,
  };
}

function deterministicOntologyAnalysis(context: OntologyAnalyzeContext, source: "template" | "fallback" = "template") {
  const rows = context.devices.map(device => {
    const sku = String(device.deviceSku || device.semanticLabel || device.title || "Cihaz");
    const relatedOrders = context.orders.filter(order => {
      const fields = order.orderLineFields || order.orderFields || {};
      const orderDevice = String(fields.deviceType || fields.deviceSku || fields.sku || "");
      return !orderDevice || orderDevice === sku || context.orders.length === 1;
    });
    const firstOrder: any = relatedOrders[0]?.orderLineFields || relatedOrders[0]?.orderFields || {};
    const requested = toNumber(device.deviceQuantity);
    const warehouse = toNumber(device.deviceOperation?.inWarehouse);
    const producible = device.deviceOperation?.maxProducible === null ? 0 : toNumber(device.deviceOperation?.maxProducible);
    const totalSold = toNumber(device.deviceOperation?.totalSold);
    const shortage = Math.max(0, requested - warehouse - producible);
    const relatedBom = context.bom.filter(item => item.bomComponent?.sku === sku);
    const criticalComponents = relatedBom.filter(item => item.bomComponent?.status === "critical").length;
    const warningComponents = relatedBom.filter(item => item.bomComponent?.status === "warning").length;
    const riskScore = shortage + criticalComponents * 25 + warningComponents * 10;
    return {
      device: sku,
      customer: String(firstOrder.customer || context.customers[0]?.semanticLabel || context.customers[0]?.title || "Müşteri yok"),
      deadline: String(firstOrder.deadline || "Deadline yok"),
      riskTier: riskScore > 75 ? "Kritik" : riskScore > 0 ? "Riskli" : "Sağlıklı",
      requested,
      warehouse,
      producible,
      totalSold,
      shortage,
      criticalComponents,
      warningComponents,
      riskScore,
    };
  });
  const mode = context.chartMode;
  const seriesCatalog: Record<string, { key: string; label: string; color: string }> = {
    requested: { key: "requested", label: "Sipariş", color: "#c96442" },
    warehouse: { key: "warehouse", label: "Depo", color: "#3d6fb0" },
    producible: { key: "producible", label: "Üretilebilir", color: "#3f8f5b" },
    shortage: { key: "shortage", label: "Açık", color: "#b34037" },
    criticalComponents: { key: "criticalComponents", label: "Kritik BOM", color: "#8f332b" },
    warningComponents: { key: "warningComponents", label: "Düşük BOM", color: "#b8761c" },
    riskScore: { key: "riskScore", label: "Risk skoru", color: "#c96442" },
    totalSold: { key: "totalSold", label: "Satılan", color: "#6f6258" },
  };
  const requestedSeries = context.chartConfig.yMetrics
    .map(key => seriesCatalog[key])
    .filter(Boolean);
  const fallbackSeries = mode === "risk"
    ? ["criticalComponents", "warningComponents", "shortage", "riskScore"]
    : mode === "capacity"
      ? ["warehouse", "producible", "totalSold"]
      : ["requested", "warehouse", "producible", "shortage"];
  return {
    provider: source,
    model: null,
    intent: mode,
    title: mode === "risk" ? "BOM ve fulfillment risk karşılaştırması" : mode === "capacity" ? "Kapasite karşılaştırması" : "Fulfillment karşılaştırması",
    narrative: rows.length > 0
      ? `${rows.length} cihaz, ${context.orders.length} sipariş ve ${context.bom.length} BOM node'u typed graph context olarak okundu.`
      : "Ontology f(x) node'una cihaz bağlanınca model graph context'i yorumlayacak.",
    chartSpec: {
      type: mode === "fulfillment" ? "line" : "bar",
      xKey: context.chartConfig.xDimension,
      yLabel: "Adet / skor",
      series: requestedSeries.length > 0 ? requestedSeries : fallbackSeries.map(key => seriesCatalog[key]),
      data: rows,
    },
    recommendedActions: rows.some(row => row.shortage > 0)
      ? ["Açık veren cihazları sipariş teslim tarihiyle önceliklendir.", "Darboğaz BOM node'larını tedarik aksiyonuna bağla.", "Depo ve üretim senaryosunu ayrı ayrı simüle et."]
      : ["Kapasite ve depo serilerini aynı chart üzerinde izlemeye devam et.", "Sipariş node'u bağlanırsa teslim tarihi risk skoruna dahil edilir."],
    missingContext: [
      ...(context.orders.length === 0 ? ["Sipariş / teslim tarihi node'u yok"] : []),
      ...(context.bom.length === 0 ? ["BOM veya tedarik node'u yok"] : []),
    ],
  };
}

function parsePositiveSemanticNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function semanticDateDiffDays(left: string, right: string): number | null {
  if (!left || !right) return null;
  const leftDate = new Date(`${left}T00:00:00Z`);
  const rightDate = new Date(`${right}T00:00:00Z`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return null;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000);
}

function findDeviceCustomerContext(context: OntologyAnalyzeContext, deviceId: string, device: ReturnType<typeof compactNode>) {
  const incoming = context.scopedConnections.find(connection => (
    connection.to === deviceId
    && (connection.relation === "customer_device" || connection.relation === "order_device" || connection.relation === "order_line_device")
  ));
  const source = incoming ? context.connected.find(node => node.id === incoming.from) : null;
  const internal = (incoming?.context as any) ?? {};
  return {
    customer: String(internal.customer || source?.semanticLabel || source?.title || ""),
    quantity: parsePositiveSemanticNumber(device.deviceQuantity || internal.quantity),
    deadline: String(internal.deadline || source?.orderFields?.deadline || source?.orderLineFields?.deadline || ""),
    source: incoming?.relation || "device_only",
  };
}

function buildSemanticProcurementIndex(context: OntologyAnalyzeContext) {
  const procurementById = new Map(context.procurement.map(node => [node.id, node]));
  const byComponentCode = new Map<string, any>();

  for (const link of context.scopedConnections) {
    if (link.relation !== "component_procurement") continue;
    const component = context.bom.find(node => node.id === link.from);
    const procurementNode = procurementById.get(link.to);
    const code = component?.bomComponent?.code;
    if (!code || !procurementNode) continue;
    const row = procurementNode.rows.find((item: any) => String(item.component_code || item.code) === String(code)) ?? procurementNode.rows[0];
    if (row) byComponentCode.set(String(code), { ...row, procurementNodeId: procurementNode.id, procurementNodeTitle: procurementNode.title });
  }

  for (const procurementNode of context.procurement) {
    for (const row of procurementNode.rows) {
      const code = String(row.component_code || row.code || "");
      if (code && !byComponentCode.has(code)) {
        byComponentCode.set(code, { ...row, procurementNodeId: procurementNode.id, procurementNodeTitle: procurementNode.title });
      }
    }
  }

  return byComponentCode;
}

function buildOntologySemanticLayer(context: OntologyAnalyzeContext) {
  const procurementByCode = buildSemanticProcurementIndex(context);
  const decisions = context.devices.map(device => {
    const sku = String(device.deviceSku || device.semanticLabel || device.title || "");
    const customerContext = findDeviceCustomerContext(context, device.id, device);
    const requested = customerContext.quantity || parsePositiveSemanticNumber(device.deviceQuantity);
    const warehouse = toNumber(device.deviceOperation?.inWarehouse);
    const producible = device.deviceOperation?.maxProducible === null ? 0 : toNumber(device.deviceOperation?.maxProducible);
    const fulfillmentGap = Math.max(0, requested - warehouse - producible);
    const bomRows = context.bom
      .filter(node => node.bomComponent?.sku === sku)
      .map(node => {
        const bom = node.bomComponent!;
        const requiredPerUnit = bom.requiredPerUnit === null ? 0 : toNumber(bom.requiredPerUnit);
        const currentStock = bom.currentStock === null ? 0 : toNumber(bom.currentStock);
        const requiredForOrder = bom.requiredForOrder === null || bom.requiredForOrder === undefined
          ? requiredPerUnit * requested
          : toNumber(bom.requiredForOrder);
        const shortage = Math.max(0, toNumber(bom.stockShortage) || requiredForOrder - currentStock);
        const procurement = bom.code ? procurementByCode.get(String(bom.code)) : null;
        const readyDate = String(procurement?.ready_date || procurement?.eta || "");
        const delayDays = semanticDateDiffDays(readyDate, customerContext.deadline);
        return {
          nodeId: node.id,
          code: String(bom.code || ""),
          name: String(bom.name || ""),
          tier: bom.tier,
          requiredPerUnit,
          currentStock,
          requiredForOrder,
          shortage,
          status: shortage > 0 ? "shortage" : String(bom.status || "ok"),
          procurementLinked: Boolean(procurement),
          supplier: String(procurement?.supplier || procurement?.tedarikci || ""),
          readyDate,
          delayDays,
        };
      });
    const shortageRows = bomRows.filter(row => row.shortage > 0);
    const missingProcurement = shortageRows.filter(row => !row.procurementLinked).length;
    const lateRows = shortageRows.filter(row => row.delayDays !== null && row.delayDays > 0);
    const riskScore = fulfillmentGap + shortageRows.length * 25 + missingProcurement * 20 + lateRows.length * 35;
    const status = !customerContext.deadline
      ? "missing_context"
      : lateRows.length > 0
        ? "late"
        : shortageRows.length > 0 || fulfillmentGap > 0
          ? "at_risk"
          : "on_track";
    const bottleneck = shortageRows
      .slice()
      .sort((a, b) => b.shortage - a.shortage)[0] ?? null;

    return {
      id: `decision:${device.id}`,
      objectType: "DeliveryDecision",
      status,
      riskScore,
      customer: customerContext.customer,
      device: sku,
      requested,
      deadline: customerContext.deadline,
      warehouse,
      producible,
      fulfillmentGap,
      shortageCount: shortageRows.length,
      linkedProcurementCount: shortageRows.length - missingProcurement,
      missingProcurementCount: missingProcurement,
      lateProcurementCount: lateRows.length,
      bottleneck,
      summary: `${sku}: ${requested} talep, ${warehouse} depo, ${producible} üretilebilir, ${shortageRows.length} eksik BOM.`,
      recommendation: status === "late"
        ? "Expedite veya kısmi sevk aksiyonu stage et."
        : status === "at_risk"
          ? "Eksik BOM satırlarını procurement node'una bağla ve ready date tamamla."
          : status === "missing_context"
            ? "Deadline ve müşteri bağlamını tamamla."
            : "Teslim planı izleme modunda kalabilir.",
      bomRows,
    };
  });

  const sortedDecisions = decisions.slice().sort((a, b) => b.riskScore - a.riskScore);
  const actions = sortedDecisions
    .filter(decision => decision.status !== "on_track")
    .slice(0, 6)
    .map(decision => ({
      id: `action:${decision.device}`,
      actionType: decision.status === "late" ? "expedite_procurement" : decision.missingProcurementCount > 0 ? "complete_semantic_links" : "review_fulfillment_plan",
      label: decision.status === "late" ? "Expedite stage et" : decision.missingProcurementCount > 0 ? "Tedarik linklerini tamamla" : "Fulfillment planını incele",
      targetObject: decision.id,
      ownerAgent: decision.status === "late" ? "Action agent" : decision.missingProcurementCount > 0 ? "Data agent" : "Fulfillment agent",
      requiresHumanApproval: true,
      reason: decision.recommendation,
    }));

  return {
    provider: "backend-semantic-layer",
    generatedAt: new Date().toISOString(),
    ontology: {
      objectTypes: ["Customer", "Device", "BomComponent", "ProcurementNeed", "DeliveryDecision"],
      linkTypes: ["customer_device", "device_bom", "component_procurement", "decision_action"],
      actionTypes: ["complete_semantic_links", "review_fulfillment_plan", "expedite_procurement"],
    },
    kpis: {
      devices: context.devices.length,
      customers: context.customers.length,
      bomComponents: context.bom.length,
      procurementNodes: context.procurement.length,
      decisions: decisions.length,
      riskyDecisions: decisions.filter(decision => decision.status !== "on_track").length,
      stagedActions: actions.length,
    },
    decisions: sortedDecisions,
    actionQueue: actions,
    agentLanes: [
      { agent: "Data agent", responsibility: "Object/link completeness", finding: `${context.scopedConnections.length} semantic link okundu.` },
      { agent: "Fulfillment agent", responsibility: "Demand vs warehouse/production", finding: `${decisions.filter(item => item.fulfillmentGap > 0).length} cihazda fulfillment açığı var.` },
      { agent: "Supply agent", responsibility: "BOM shortage vs procurement", finding: `${decisions.reduce((sum, item) => sum + item.shortageCount, 0)} eksik BOM satırı izlendi.` },
      { agent: "Action agent", responsibility: "Human-approved writeback", finding: `${actions.length} aksiyon stage edildi; otomatik writeback yok.` },
    ],
  };
}

router.post("/ontology/semantic-layer", async (req, res) => {
  try {
    const parsed = ontologySemanticLayerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(", ") });
    const context = collectOntologyAnalyzeContext(parsed.data);
    res.json(buildOntologySemanticLayer(context));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ontology/graph-function/run", async (req, res) => {
  try {
    const parsed = graphFunctionRunSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(", ") });
    const context = collectOntologyAnalyzeContext(parsed.data);
    const semantic = buildOntologySemanticLayer(context);
    const decisions = semantic.decisions;
    const series = [
      { key: "requested", label: "Sipariş", color: "#c96442" },
      { key: "warehouse", label: "Depo", color: "#3d6fb0" },
      { key: "producible", label: "Üretilebilir", color: "#3f8f5b" },
      { key: "shortage", label: "Açık", color: "#b34037" },
      { key: "riskScore", label: "Risk skoru", color: "#8f332b" },
    ];
    const rows = decisions.map((decision: any) => ({
      objectId: decision.id,
      device: decision.device,
      customer: decision.customer || "Müşteri yok",
      deadline: decision.deadline || "Deadline yok",
      riskTier: decision.status === "late" ? "Geç" : decision.status === "at_risk" ? "Riskli" : decision.status === "missing_context" ? "Eksik" : "Sağlıklı",
      requested: toNumber(decision.requested),
      warehouse: toNumber(decision.warehouse),
      producible: toNumber(decision.producible),
      shortage: toNumber(decision.fulfillmentGap),
      riskScore: toNumber(decision.riskScore),
    }));
    res.json({
      provider: "graph-function",
      functionId: parsed.data.functionId,
      generatedAt: new Date().toISOString(),
      chart: {
        type: "bar",
        xKey: parsed.data.xDimension,
        rows,
        series: series.filter(item => parsed.data.yMetrics.includes(item.key as any)),
      },
      objects: decisions.map((decision: any) => ({
        id: decision.id,
        objectType: "DeliveryDecision",
        title: decision.device,
        subtitle: decision.customer || decision.status,
        decision,
      })),
      actions: semantic.actionQueue,
      semantic,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function ontologyAnalysisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["intent", "title", "narrative", "chartSpec", "recommendedActions", "missingContext"],
    properties: {
      intent: { type: "string" },
      title: { type: "string" },
      narrative: { type: "string" },
      chartSpec: {
        type: "object",
        additionalProperties: false,
        required: ["type", "xKey", "yLabel", "series", "data"],
        properties: {
          type: { type: "string", enum: ["line", "bar", "area", "combo"] },
          xKey: { type: "string" },
          yLabel: { type: "string" },
          series: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "label", "color"],
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                color: { type: "string" },
              },
            },
          },
          data: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["x", "values"],
              properties: {
                x: { type: "string" },
                values: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["key", "value"],
                    properties: {
                      key: { type: "string" },
                      value: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      recommendedActions: { type: "array", items: { type: "string" } },
      missingContext: { type: "array", items: { type: "string" } },
    },
  };
}

function validateAnalysisPayload(payload: any, context: OntologyAnalyzeContext, provider: string, model: string | null) {
  const fallback = deterministicOntologyAnalysis(context, "fallback");
  const chartSpec = payload?.chartSpec && Array.isArray(payload.chartSpec.series) && Array.isArray(payload.chartSpec.data)
    ? payload.chartSpec
    : fallback.chartSpec;
  const requestedX = context.chartConfig.xDimension || "device";
  const normalizedData = chartSpec.data.map((row: any) => {
    if (Array.isArray(row?.values)) {
      return {
        [requestedX]: String(row.x || row[requestedX] || row.device || row.name || "Node"),
        ...Object.fromEntries(row.values.filter((item: any) => item?.key).map((item: any) => [String(item.key), toNumber(item.value)])),
      };
    }
    return {
      ...row,
      [requestedX]: String(row?.[requestedX] || row?.[chartSpec.xKey] || row?.device || row?.name || "Node"),
    };
  });
  const allowedKeys = new Set(normalizedData.flatMap((row: any) => Object.keys(row)));
  const safeSeries = chartSpec.series
    .filter((series: any) => typeof series?.key === "string" && allowedKeys.has(series.key))
    .slice(0, 8)
    .map((series: any) => ({
      key: series.key,
      label: String(series.label || series.key),
      color: /^#[0-9a-fA-F]{6}$/.test(String(series.color)) ? String(series.color) : "#c96442",
    }));
  return {
    provider,
    model,
    intent: String(payload?.intent || fallback.intent),
    title: String(payload?.title || fallback.title),
    narrative: String(payload?.narrative || fallback.narrative),
    chartSpec: {
      type: ["line", "bar", "area", "combo"].includes(chartSpec.type) ? chartSpec.type : fallback.chartSpec.type,
      xKey: requestedX,
      yLabel: String(chartSpec.yLabel || "Adet / skor"),
      series: safeSeries.length > 0 ? safeSeries : fallback.chartSpec.series,
      data: normalizedData.slice(0, 50),
    },
    recommendedActions: Array.isArray(payload?.recommendedActions) ? payload.recommendedActions.slice(0, 6).map(String) : fallback.recommendedActions,
    missingContext: Array.isArray(payload?.missingContext) ? payload.missingContext.slice(0, 6).map(String) : fallback.missingContext,
    analyzedAt: new Date().toISOString(),
  };
}

async function analyzeWithOpenAI(context: OntologyAnalyzeContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_ONTOLOGY_MODEL || "gpt-5.4";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: "Sen Griseus Ontology f(x) motorusun. Palantir-style operasyon graph analisti gibi node tiplerini, edge contract'larını ve iş niyetini yorumla. Başlık, narrative, seri label'ları ve aksiyonları Türkçe üret. Sadece istenen JSON'u döndür. Verilen graph context dışına satır uydurma.",
      input: JSON.stringify(context),
      text: {
        format: {
          type: "json_schema",
          name: "griseus_ontology_analysis",
          strict: true,
          schema: ontologyAnalysisSchema(),
        },
      },
      store: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "OpenAI ontology analysis failed");
  const text = payload.output_text || payload.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text || "").join("");
  return validateAnalysisPayload(JSON.parse(text), context, "openai", model);
}

async function analyzeWithAnthropic(context: OntologyAnalyzeContext) {
  const client = getAnthropicClient();
  if (!client) return null;
  const model = process.env.ANTHROPIC_ONTOLOGY_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const response = await client.messages.create({
    model,
    max_tokens: 3000,
    system: "Sen Griseus Ontology f(x) motorusun. Node tiplerini, edge contract'larını ve operasyon niyetini yorumla. Başlık, narrative, seri label'ları ve aksiyonları Türkçe üret. chartConfig.xDimension X eksenidir; chartConfig.yMetrics seri/metrik seçimidir. Chart data satırlarını schema'daki x + values formatında döndür. Sadece JSON döndür; ekstra metin yazma.",
    messages: [{
      role: "user",
      content: `Graph context:
${JSON.stringify(context, null, 2)}

JSON schema:
${JSON.stringify(ontologyAnalysisSchema(), null, 2)}`,
    }],
  });
  const text = response.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Anthropic ontology analysis JSON parse failed");
  return validateAnalysisPayload(JSON.parse(match[0]), context, "anthropic", model);
}

router.post("/ontology/analyze", async (req, res) => {
  try {
    const parsed = ontologyAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(", ") });
    const context = collectOntologyAnalyzeContext(parsed.data);

    try {
      const anthropic = await analyzeWithAnthropic(context);
      if (anthropic) return res.json(anthropic);
    } catch (err: any) {
      console.warn("[pipeline-builder/ontology] Anthropic failed:", err.message);
    }

    try {
      const openai = await analyzeWithOpenAI(context);
      if (openai) return res.json(openai);
    } catch (err: any) {
      console.warn("[pipeline-builder/ontology] OpenAI failed:", err.message);
    }

    res.json(validateAnalysisPayload(deterministicOntologyAnalysis(context), context, "template", null));
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
