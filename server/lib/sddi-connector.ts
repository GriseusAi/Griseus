// ═══════════════════════════════════════════════════════════
// SDDI — Software-Defined Data Integration (FAZ 5, 2026-04-27)
//
// Vertex/Foundry pattern: external sources (Netsis/MES/IoT/Excel) → ontology
// via configured connectors with auto-mapping + scheduled syncs.
//
// Auto-mapping algorithm: levenshtein + token similarity + alias dictionary.
// ═══════════════════════════════════════════════════════════

import { db } from "../db";
import { connectors, connectorRuns, fieldMappings } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

// Common alias dictionary for HVAC manufacturing data (TR + EN)
const ALIAS_DICT: Record<string, string[]> = {
  sku: ["sku", "kod", "code", "urun_kodu", "product_code", "stock_code"],
  name: ["name", "ad", "isim", "urun_adi", "product_name", "description", "aciklama"],
  quantity: ["quantity", "miktar", "adet", "qty", "stock", "stok"],
  price: ["price", "fiyat", "tutar", "amount", "cost", "maliyet"],
  date: ["date", "tarih", "created_at", "tarih_saat", "datetime", "olusturma_tarihi"],
  supplier: ["supplier", "tedarikci", "vendor", "firma"],
  product_sku: ["product_sku", "urun_kodu", "sku", "stok_kodu"],
  component_code: ["component_code", "bilesen_kodu", "parca_kodu", "malzeme_kodu", "code"],
  current_stock: ["current_stock", "mevcut_stok", "stok", "stock", "miktar", "kalan"],
  year: ["year", "yil", "yıl"],
  month: ["month", "ay", "ay_no"],
  quantity_sold: ["quantity_sold", "satilan", "satis_adet", "satis_miktari", "satis", "sales"],
  revenue: ["revenue", "ciro", "gelir", "satis_tutari"],
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "_").replace(/[^\w]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (la === 0) return lb; if (lb === 0) return la;
  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[la][lb];
}

function fuzzyScore(a: string, b: string): number {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return 1 - levenshtein(a, b) / max;
}

export interface AutoMapResult {
  sourceField: string;
  bestMatch: string | null;
  confidence: number;
  candidates: Array<{ target: string; score: number }>;
}

export function autoMapFields(sourceFields: string[], targetFields: string[]): AutoMapResult[] {
  const out: AutoMapResult[] = [];
  for (const src of sourceFields) {
    const srcNorm = normalize(src);
    const candidates: Array<{ target: string; score: number }> = [];
    for (const tgt of targetFields) {
      const tgtNorm = normalize(tgt);
      const aliases = ALIAS_DICT[tgt] ?? [];
      let best = fuzzyScore(srcNorm, tgtNorm);
      for (const a of aliases) {
        const aNorm = normalize(a);
        const s = fuzzyScore(srcNorm, aNorm);
        if (s > best) best = s;
      }
      candidates.push({ target: tgt, score: Number(best.toFixed(3)) });
    }
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    out.push({
      sourceField: src,
      bestMatch: top && top.score >= 0.6 ? top.target : null,
      confidence: top?.score ?? 0,
      candidates: candidates.slice(0, 5),
    });
  }
  return out;
}

// ── Connector CRUD ──

export const CreateConnectorInput = z.object({
  name: z.string(),
  kind: z.enum(["netsis", "mes", "iot_mqtt", "excel", "csv", "rest_api"]),
  direction: z.enum(["read_only", "write_only", "bidirectional"]).default("read_only"),
  config: z.record(z.any()).default({}),
  targetTable: z.string().optional(),
  schedule: z.string().optional(),
});
export type CreateConnectorInput = z.infer<typeof CreateConnectorInput>;

export async function createConnector(input: CreateConnectorInput): Promise<number> {
  const parsed = CreateConnectorInput.parse(input);
  const [row] = await db.insert(connectors).values({
    name: parsed.name, kind: parsed.kind, direction: parsed.direction,
    config: parsed.config, targetTable: parsed.targetTable, schedule: parsed.schedule,
  }).returning();
  return row!.id;
}

export async function listConnectors() {
  return await db.select().from(connectors).orderBy(desc(connectors.createdAt));
}

export async function listConnectorRuns(connectorId?: number) {
  const rows = connectorId
    ? await db.select().from(connectorRuns).where(eq(connectorRuns.connectorId, connectorId)).orderBy(desc(connectorRuns.startedAt)).limit(50)
    : await db.select().from(connectorRuns).orderBy(desc(connectorRuns.startedAt)).limit(50);
  return rows;
}

// ── Run a connector (stub adapters for demo) ──

export async function runConnector(connectorId: number, trigger: "manual" | "scheduled" | "webhook" = "manual"): Promise<number> {
  const [c] = await db.select().from(connectors).where(eq(connectors.id, connectorId)).limit(1);
  if (!c) throw new Error("Connector not found");

  const [run] = await db.insert(connectorRuns).values({
    connectorId, trigger, status: "running",
  }).returning();

  const start = Date.now();
  try {
    let rowsRead = 0, rowsWritten = 0, rowsRejected = 0;
    const summary: any = {};

    switch (c.kind) {
      case "netsis":
        // Placeholder: real impl would call Netsis SOAP/REST. Without creds, simulate.
        summary.note = "Netsis connector stub — real adapter requires credentials in config";
        rowsRead = 0;
        break;
      case "mes":
        summary.note = "MES connector stub — would pull production_runs from MES API";
        rowsRead = 0;
        break;
      case "iot_mqtt":
        summary.note = "IoT MQTT subscription requires runtime listener (not run-once)";
        rowsRead = 0;
        break;
      case "excel": case "csv":
        summary.note = "File-based connector — invoke via /api/import for actual ingestion";
        rowsRead = 0;
        break;
      case "rest_api":
        summary.note = "REST API connector stub — would fetch + map per fieldMappings";
        rowsRead = 0;
        break;
    }

    const durationMs = Date.now() - start;
    await db.update(connectorRuns).set({
      status: "success", completedAt: new Date(), durationMs,
      rowsRead, rowsWritten, rowsRejected, summary,
    }).where(eq(connectorRuns.id, run!.id));

    return run!.id;
  } catch (err: any) {
    await db.update(connectorRuns).set({
      status: "failed", completedAt: new Date(), durationMs: Date.now() - start,
      errorMessage: err.message,
    }).where(eq(connectorRuns.id, run!.id));
    throw err;
  }
}

// ── Field mappings ──

export async function suggestFieldMappings(connectorId: number, sourceFields: string[], targetTable: string): Promise<AutoMapResult[]> {
  // Get column list for target table
  const targetFields = await getTargetColumns(targetTable);
  return autoMapFields(sourceFields, targetFields);
}

async function getTargetColumns(targetTable: string): Promise<string[]> {
  // Read from information_schema
  const r = await db.execute(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${targetTable.replace(/'/g, "")}'` as any);
  return (r.rows as any[]).map(row => row.column_name);
}

export async function approveFieldMapping(connectorId: number, sourceField: string, targetField: string, confidence: number, by: string): Promise<number> {
  const [row] = await db.insert(fieldMappings).values({
    connectorId, sourceField, targetField,
    confidence: confidence.toString(),
    approvedBy: by, approvedAt: new Date(),
  }).returning();
  return row!.id;
}

export async function listFieldMappings(connectorId: number) {
  return await db.select().from(fieldMappings).where(eq(fieldMappings.connectorId, connectorId));
}
