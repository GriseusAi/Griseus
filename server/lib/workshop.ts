// ═══════════════════════════════════════════════════════════
// WORKSHOP — No-code dashboard builder (FAZ 5, 2026-04-27)
//
// Foundry Workshop pattern: drag-drop widgets bound to ontology.
// Widget types: chart, table, kpi, pipeline_runner, text.
// ═══════════════════════════════════════════════════════════

import { db } from "../db";
import { workspaces, workspaceWidgets } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";

export const CreateWorkspaceInput = z.object({
  name: z.string(),
  description: z.string().optional(),
  ownerId: z.string().default("user"),
  visibility: z.enum(["private", "shared", "public"]).default("private"),
});

export const CreateWidgetInput = z.object({
  workspaceId: z.number(),
  type: z.enum(["chart", "table", "kpi", "pipeline_runner", "text"]),
  title: z.string(),
  config: z.record(z.any()).default({}),
  dataSource: z.object({
    kind: z.enum(["ontology_query", "api_endpoint", "static"]),
    query: z.string().optional(),
    endpoint: z.string().optional(),
    params: z.record(z.any()).optional(),
  }).optional(),
});

const ALLOWED_TABLES = new Set([
  "products", "stock_levels", "stock_movements_v2", "bom_items", "component_stock",
  "purchase_suggestions", "validation_alerts", "production_lines",
  "plants", "work_centers", "machines", "operators",
  "shifts", "batches", "production_runs", "downtime_episodes",
  "scrap_reasons", "quality_events", "suppliers", "supplier_lots",
  "opportunities", "griseus_work_orders", "energy_meters", "energy_readings",
  "decisions", "ops_alerts", "drift_alerts", "digital_twin_divergence",
  "simulation_pipeline_runs", "ontology_object_types", "ontology_link_types",
  "connectors", "connector_runs",
]);

export async function createWorkspace(input: z.infer<typeof CreateWorkspaceInput>): Promise<number> {
  const parsed = CreateWorkspaceInput.parse(input);
  const [row] = await db.insert(workspaces).values(parsed).returning();
  return row!.id;
}

export async function listWorkspaces() {
  return await db.select().from(workspaces).orderBy(desc(workspaces.updatedAt));
}

export async function getWorkspace(id: number) {
  const [w] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (!w) return null;
  const widgets = await db.select().from(workspaceWidgets).where(eq(workspaceWidgets.workspaceId, id));
  return { ...w, widgets };
}

export async function deleteWorkspace(id: number): Promise<void> {
  await db.delete(workspaceWidgets).where(eq(workspaceWidgets.workspaceId, id));
  await db.delete(workspaces).where(eq(workspaces.id, id));
}

export async function createWidget(input: z.infer<typeof CreateWidgetInput>): Promise<number> {
  const parsed = CreateWidgetInput.parse(input);
  const [row] = await db.insert(workspaceWidgets).values(parsed).returning();
  return row!.id;
}

export async function deleteWidget(id: number): Promise<void> {
  await db.delete(workspaceWidgets).where(eq(workspaceWidgets.id, id));
}

export async function updateLayout(workspaceId: number, layout: any[]): Promise<void> {
  await db.update(workspaces).set({ layout, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
}

// ── Widget data resolver — safe ontology queries ──

export async function resolveWidgetData(widgetId: number): Promise<any> {
  const [w] = await db.select().from(workspaceWidgets).where(eq(workspaceWidgets.id, widgetId)).limit(1);
  if (!w) throw new Error("Widget not found");
  const ds = w.dataSource as any;

  if (!ds || ds.kind === "static") {
    return w.config?.staticData ?? null;
  }

  if (ds.kind === "ontology_query") {
    const { table, limit, orderBy, where } = (w.config as any) ?? {};
    if (!table || !ALLOWED_TABLES.has(table)) {
      throw new Error(`Table not allowed: ${table}`);
    }
    let q = `SELECT * FROM ${table}`;
    const params: any[] = [];
    if (where && typeof where === "object") {
      const clauses: string[] = [];
      for (const [k, v] of Object.entries(where)) {
        if (!/^[a-z_][a-z_0-9]*$/i.test(k)) continue;
        params.push(v);
        clauses.push(`${k} = $${params.length}`);
      }
      if (clauses.length > 0) q += ` WHERE ${clauses.join(" AND ")}`;
    }
    if (orderBy && /^[a-z_][a-z_0-9]*( DESC| ASC)?$/i.test(orderBy)) {
      q += ` ORDER BY ${orderBy}`;
    }
    const lim = Math.min(Number(limit ?? 50), 500);
    q += ` LIMIT ${lim}`;
    const r = await db.execute(sql.raw(q));
    return { rows: r.rows ?? [], rowCount: (r.rows as any[])?.length ?? 0 };
  }

  if (ds.kind === "api_endpoint") {
    // For safety we don't auto-fetch external endpoints from server; UI handles api_endpoint widgets directly.
    return { note: "api_endpoint widgets resolved client-side" };
  }

  return null;
}

// ── Catalog: which widget types are available + their config schema (UI uses this) ──

export const WIDGET_CATALOG = [
  {
    type: "kpi",
    label: "KPI Tile",
    description: "Tek metrik kart",
    configSchema: { table: "string", aggregation: "count|sum|avg", field: "string" },
  },
  {
    type: "table",
    label: "Tablo",
    description: "Ontology tablosundan satırlar",
    configSchema: { table: "string", limit: "number", orderBy: "string" },
  },
  {
    type: "chart",
    label: "Chart (line/bar)",
    description: "Zaman serisi veya kategori grafiği",
    configSchema: { table: "string", xField: "string", yField: "string", chartType: "line|bar" },
  },
  {
    type: "pipeline_runner",
    label: "Pipeline Runner",
    description: "Bir butonla simulation pipeline tetikler",
    configSchema: { sku: "string", horizonMonths: "number", mode: "simulation|live" },
  },
  {
    type: "text",
    label: "Markdown Text",
    description: "Sabit içerik / not",
    configSchema: { content: "string" },
  },
];
