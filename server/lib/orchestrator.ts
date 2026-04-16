/**
 * Octopus-Chain Orchestrator — autonomous system integrity auditor
 *
 * Mission (from /octopus-chain skill): her veri mutasyonunda ve periyodik olarak
 * 10-katmanlı bütünlük doğrulaması çalıştırır. Palantir Octopus prensibi:
 * "1 atom değişince her atom bu değişikliği yansıtmalı".
 *
 * Trigger:
 *  - Scheduled tick (default every 30 min, env ORCHESTRATOR_INTERVAL_MIN)
 *  - Data ingestion events (bulk import, stock movement, bom change)
 *  - Manual API trigger
 *
 * Output:
 *  - orchestrator_runs tablosuna tam rapor
 *  - Red findings → WS broadcast (proactive alert için)
 */

import { db } from "../db";
import {
  orchestratorRuns, bomItems, componentStock, products,
  dataLineage, dataSnapshots, ontologyObjectTypes, ontologyLinkTypes,
} from "@shared/schema";
import { eq, gte, desc, sql } from "drizzle-orm";
import { computeComponentIntelligence } from "../routes/intelligence";
import { broadcastProactiveAlert } from "../ws";
import Anthropic from "@anthropic-ai/sdk";
import { OCTOPUS_CHAIN_CONFIG, familyOfSku, expectedPeakMonth } from "@shared/octopus-chain-config";

type LayerStatus = "green" | "yellow" | "red" | "skip";
interface Finding {
  layer: string;
  severity: "red" | "yellow";
  message: string;
  sku?: string;
  data?: any;
}

// SKU listesi, aile arketipleri, threshold'lar — @shared/octopus-chain-config
// /octopus-chain skill file ile senkron. Tek kaynak, drift yok.
const SKUS = OCTOPUS_CHAIN_CONFIG.skus;
const WINTER_MONTH_LABELS = OCTOPUS_CHAIN_CONFIG.winterMonths;

/** ═══ LAYER 1: Mutation Kaydı — snapshot + lineage var mı ═══ */
async function layer1Mutation(findings: Finding[]): Promise<LayerStatus> {
  try {
    const recentLineage = await db.select({ count: sql<number>`count(*)::int` })
      .from(dataLineage)
      .where(gte(dataLineage.createdAt, new Date(Date.now() - OCTOPUS_CHAIN_CONFIG.mutation.recencyHours * 60 * 60 * 1000)));
    const count = recentLineage[0]?.count ?? 0;
    // No lineage in last hour during potential business activity — just informational
    if (count === 0) {
      findings.push({ layer: "mutation", severity: "yellow",
        message: "Son 1 saatte lineage kaydı yok — sistem idle veya mutasyon kaydedilmedi" });
      return "yellow";
    }
    return "green";
  } catch (err: any) {
    findings.push({ layer: "mutation", severity: "red", message: `Lineage query failed: ${err.message}` });
    return "red";
  }
}

/** ═══ LAYER 2: Self Intelligence — her SKU temiz mi ═══ */
async function layer2SelfIntelligence(
  findings: Finding[],
  intelCache: Map<string, any>
): Promise<LayerStatus> {
  let worst: LayerStatus = "green";
  for (const sku of SKUS) {
    try {
      const intel = await computeComponentIntelligence(sku);
      intelCache.set(sku, intel);

      const bug = intel.components.filter(
        (c) => c.currentStock > 0 && c.seasonalDays === 0
      );
      const artifact = intel.components.filter(
        (c) => c.depletionYear !== null && c.depletionYear > new Date().getFullYear() + OCTOPUS_CHAIN_CONFIG.depletionHorizon.artifactYearOffset
      );

      if (bug.length > 0) {
        findings.push({
          layer: "selfIntel", severity: "red", sku,
          message: `BUG: stock>0 && seasonalDays=0 (${bug.length} bileşen)`,
          data: { codes: bug.map((c) => c.code).slice(0, 10) },
        });
        worst = "red";
      }
      if (artifact.length > 0) {
        findings.push({
          layer: "selfIntel", severity: "red", sku,
          message: `2042+ artifact (${artifact.length} bileşen)`,
          data: { codes: artifact.map((c) => c.code).slice(0, 10) },
        });
        worst = "red";
      }
    } catch (err: any) {
      findings.push({ layer: "selfIntel", severity: "red", sku,
        message: `Intelligence query failed: ${err.message}` });
      worst = "red";
    }
  }
  return worst;
}

/** ═══ LAYER 3: Cross-Product Y.2 — paylaşılan kod stok tutarlılık ═══ */
async function layer3CrossProduct(findings: Finding[]): Promise<LayerStatus> {
  try {
    const allBom = await db.select({
      code: bomItems.componentCode,
      sku: bomItems.parentProductSku,
    }).from(bomItems);

    const codeSkus: Map<string, Set<string>> = new Map();
    for (const b of allBom) {
      if (!codeSkus.has(b.code)) codeSkus.set(b.code, new Set());
      codeSkus.get(b.code)!.add(b.sku);
    }

    const shared = Array.from(codeSkus.entries()).filter(([_, s]) => s.size >= 2);
    // Shared codes must exist — if very few, something is wrong
    if (shared.length < 10) {
      findings.push({ layer: "crossProduct", severity: "yellow",
        message: `Paylaşılan kod sayısı beklenenin altında (${shared.length})` });
      return "yellow";
    }
    // component_stock rows should exist for all unique codes used
    const stockCount = await db.select({ count: sql<number>`count(*)::int` })
      .from(componentStock);
    const actualStockCount = stockCount[0]?.count ?? 0;
    if (actualStockCount < codeSkus.size * 0.5) {
      findings.push({ layer: "crossProduct", severity: "red",
        message: `component_stock %50'den az kod için veri tutuyor (${actualStockCount}/${codeSkus.size})` });
      return "red";
    }
    return "green";
  } catch (err: any) {
    findings.push({ layer: "crossProduct", severity: "red",
      message: `Cross-product check failed: ${err.message}` });
    return "red";
  }
}

/** ═══ LAYER 4: Downstream — DSE, snapshot, lineage staleness ═══ */
async function layer4Downstream(findings: Finding[]): Promise<LayerStatus> {
  try {
    const recentSnap = await db.select().from(dataSnapshots)
      .orderBy(desc(dataSnapshots.createdAt)).limit(1);
    if (recentSnap.length === 0) {
      findings.push({ layer: "downstream", severity: "yellow",
        message: "Hiç snapshot yok — rollback güvenlik ağı eksik" });
      return "yellow";
    }
    return "green";
  } catch (err: any) {
    findings.push({ layer: "downstream", severity: "red",
      message: `Downstream check failed: ${err.message}` });
    return "red";
  }
}

/** ═══ LAYER 5: UI Coherence — backend tarafından proxy olarak check ═══ */
async function layer5UiCoherence(findings: Finding[], intelCache: Map<string, any>): Promise<LayerStatus> {
  // Backend'den UI'ya direct check imkansız — proxy: aynı endpoint birden çağırıldığında
  // aynı veriyi dönüyor mu (cache consistency). Şu an skip.
  return "skip";
}

/** ═══ LAYER 6: WS Broadcast — connection count, recent broadcast ═══ */
async function layer6WsBroadcast(findings: Finding[]): Promise<LayerStatus> {
  // WS connection metrics şu an not tracked — skip
  return "skip";
}

/** ═══ LAYER 7: Agent Visibility — tool çıktıları fresh ═══ */
async function layer7Agent(findings: Finding[]): Promise<LayerStatus> {
  // Agent self-query imkansız (LLM çağrısı pahalı, orchestrator deterministik olmalı)
  return "skip";
}

/** ═══ LAYER 8: Ontology Integrity ═══ */
async function layer8Ontology(findings: Finding[]): Promise<LayerStatus> {
  try {
    const objTypes = await db.select({ count: sql<number>`count(*)::int` })
      .from(ontologyObjectTypes).where(eq(ontologyObjectTypes.enabled, true));
    const linkTypes = await db.select({ count: sql<number>`count(*)::int` })
      .from(ontologyLinkTypes).where(eq(ontologyLinkTypes.enabled, true));
    const objCount = objTypes[0]?.count ?? 0;
    const linkCount = linkTypes[0]?.count ?? 0;
    if (objCount < OCTOPUS_CHAIN_CONFIG.ontology.minObjectTypes) {
      findings.push({ layer: "ontology", severity: "red",
        message: `Ontology object_types eksik (${objCount} < ${OCTOPUS_CHAIN_CONFIG.ontology.minObjectTypes}) — seed gerekli` });
      return "red";
    }
    if (linkCount < OCTOPUS_CHAIN_CONFIG.ontology.minLinkTypes) {
      findings.push({ layer: "ontology", severity: "red",
        message: `Ontology link_types eksik (${linkCount} < ${OCTOPUS_CHAIN_CONFIG.ontology.minLinkTypes})` });
      return "red";
    }
    return "green";
  } catch (err: any) {
    findings.push({ layer: "ontology", severity: "red",
      message: `Ontology check failed: ${err.message}` });
    return "red";
  }
}

/** ═══ LAYER 9: System-Wide Validation — tükenme matematiği, BOM tree, kapasite ═══ */
async function layer9Validation(findings: Finding[], intelCache: Map<string, any>): Promise<LayerStatus> {
  // Capacity sanity: her SKU için max > 0 OR explicit reason (stock=0)
  let worst: LayerStatus = "green";
  for (const sku of SKUS) {
    const intel = intelCache.get(sku);
    if (!intel) continue;
    // Check: critical + warning + ok + abundant = total
    const total = intel.components.length;
    const sum = intel.components.reduce((acc: number, c: any) => {
      return acc + (["critical", "warning", "ok", "abundant"].includes(c.urgency) ? 1 : 0);
    }, 0);
    if (sum !== total) {
      findings.push({ layer: "validation", severity: "red", sku,
        message: `Urgency classification missed (${sum}/${total})` });
      worst = "red";
    }
  }
  return worst;
}

/** ═══ LAYER 10: Seasonal Multiplier Integrity ═══ */
async function layer10Seasonal(findings: Finding[], intelCache: Map<string, any>): Promise<LayerStatus> {
  let worst: LayerStatus = "green";
  // Config'den aile listesi — yeni aile eklenince otomatik denetlenir
  const familyAmps: Record<string, number[]> = Object.fromEntries(
    Object.keys(OCTOPUS_CHAIN_CONFIG.familyArchetypes).map(f => [f, []])
  );

  for (const sku of SKUS) {
    const intel = intelCache.get(sku);
    if (!intel?.ontology) continue;
    const ont = intel.ontology;
    const idxList = (ont.seasonalIndices ?? []).map((m: any) => m.index);
    const labels = (ont.seasonalIndices ?? []).map((m: any) => m.month);
    if (idxList.length < 12) {
      findings.push({ layer: "seasonal", severity: "red", sku,
        message: "Sezonsal indeks 12 aylık değil" });
      worst = "red";
      continue;
    }
    const peak = idxList.indexOf(Math.max(...idxList));
    const trough = idxList.indexOf(Math.min(...idxList));
    const peakMonth = labels[peak];
    const amplitude = Math.max(...idxList) / Math.max(0.01, Math.min(...idxList));

    // 10.1 Kategori arketipi (config'den)
    const fam = familyOfSku(sku);
    const expected = expectedPeakMonth(sku);
    if (expected && peakMonth !== expected) {
      findings.push({ layer: "seasonal", severity: "red", sku,
        message: `Peak ayı bozulmuş: ${peakMonth} (beklenen: ${expected} ${fam} ailesi)`,
        data: { amplitude, peak: peakMonth } });
      worst = "red";
    }

    // 10.2 Amplitude (config threshold)
    const minAmp = OCTOPUS_CHAIN_CONFIG.seasonalThresholds.minAmplitude;
    if (amplitude < minAmp) {
      findings.push({ layer: "seasonal", severity: "yellow", sku,
        message: `Amplitude düşük (${amplitude.toFixed(2)} < ${minAmp}) — DSE düz baseline'a regress etmiş olabilir`,
        data: { amplitude } });
      if (worst === "green") worst = "yellow";
    }

    // 10.4 Aritmetik (config tolerance)
    const normTol = OCTOPUS_CHAIN_CONFIG.seasonalThresholds.normalizedMeanTolerance;
    const normalizedMean = idxList.reduce((a: number, b: number) => a + b, 0) / 12;
    if (Math.abs(normalizedMean - 1.0) > normTol) {
      findings.push({ layer: "seasonal", severity: "yellow", sku,
        message: `Normalized mean ${normalizedMean.toFixed(3)} ≠ 1.0 (±${normTol}) — indeksler normalize değil`,
        data: { mean: normalizedMean } });
      if (worst === "green") worst = "yellow";
    }

    // 10.5 Current month alignment (config tolerance)
    const alignTol = OCTOPUS_CHAIN_CONFIG.seasonalThresholds.currentMonthAlignmentTolerance;
    const now = new Date().getMonth();
    const expectedCurrentIdx = idxList[now];
    if (ont.currentSeasonalIndex !== undefined &&
        Math.abs(ont.currentSeasonalIndex - expectedCurrentIdx) > alignTol) {
      findings.push({ layer: "seasonal", severity: "yellow", sku,
        message: `Current month misalignment: ${ont.currentSeasonalIndex} vs ${expectedCurrentIdx}`,
        data: { stated: ont.currentSeasonalIndex, expected: expectedCurrentIdx } });
      if (worst === "green") worst = "yellow";
    }

    // 10.6 winterStress semantik (ASCII month labels)
    const ws = intel.components.filter((c: any) => c.winterStress === true);
    for (const c of ws) {
      if (c.depletionMonth && !WINTER_MONTH_LABELS.includes(c.depletionMonth as any)) {
        findings.push({ layer: "seasonal", severity: "red", sku,
          message: `winterStress TRUE ama depletion ${c.depletionMonth} (kış değil): ${c.code}`,
          data: { code: c.code, month: c.depletionMonth } });
        worst = "red";
      }
    }

    if (fam) familyAmps[fam].push(amplitude);
  }

  // 10.8 Family amplitude consistency (config threshold)
  const spreadRatio = OCTOPUS_CHAIN_CONFIG.seasonalThresholds.familyAmplitudeSpreadRatio;
  for (const [fam, amps] of Object.entries(familyAmps)) {
    if (amps.length < 2) continue;
    const spread = Math.max(...amps) - Math.min(...amps);
    const meanAmp = amps.reduce((a,b)=>a+b,0) / amps.length;
    if (meanAmp > 0 && (spread / meanAmp) > spreadRatio) {
      findings.push({ layer: "seasonal", severity: "yellow",
        message: `${fam} ailesi amplitude dağılımı geniş: ${amps.map(a => a.toFixed(2)).join(", ")}`,
        data: { family: fam, amplitudes: amps } });
      if (worst === "green") worst = "yellow";
    }
  }

  return worst;
}

/** ═══ OPUS DIAGNOSIS ═══ — Claude-kalite root cause analizi */
let _anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!_anthropicClient) _anthropicClient = new Anthropic({ apiKey: key });
  return _anthropicClient;
}

async function invokeOpusDiagnosis(findings: Finding[]): Promise<string | null> {
  const anthropic = getAnthropic();
  if (!anthropic || findings.length === 0) return null;
  try {
    const system = `Sen Griseus (griseus.io) orchestrator'ısın — Palantir-style Türk HVAC üretim platformunun zincir doğrulayıcısı.

Bağlam:
- 11 aktif SKU: ELT.7-11, GSS20P, BH (50/55 × ST/UT), ELT.5-7, GSA (15/20/30), GSS40P
- Octopus prensibi: 1 atom değişince her atom bu değişikliği yansıtmalı
- Sezonsallık kategori arketipleri (KİLİTLİ): BH→Eylül peak (sanayi), ELT→Ekim (seramik ofis), GSA→Kasım (duvar ev), GSS→Ağustos (portatif)
- 10-katman audit: mutation, selfIntel, crossProduct, downstream, uiCoherence, wsBroadcast, agent, ontology, validation, seasonal
- Mevcut endpoint'ler düzeltme için: /api/ontology/seed (re-seed), /api/import/bulk/stock (re-sync), /api/import/bulk/sales (DSE tetikler)

Görevin: Deterministik audit'in bulduğu sorunları analiz et. Her sorun için:
1. Kök neden (veri mi, kod mu, sentetik mi, Çukurova sahadan mı?)
2. Ciddiyet (gerçek iş etkisi mi, muhtemel bug mi, sinyal gürültüsü mü?)
3. Önerilen düzeltme (mevcut endpoint/procedure ile — KOD YAZMA)

Türkçe yaz, 200-400 token. Net ve aksiyona dönük ol. Panik yaratma, kanıta dayalı yaz.`;

    const userMsg = `10-katman audit ${findings.length} finding buldu:\n\n${findings.map(f =>
      `- [${f.severity.toUpperCase()} ${f.layer}] ${f.sku ?? "GLOBAL"}: ${f.message}${f.data ? ` (data: ${JSON.stringify(f.data).slice(0, 200)})` : ""}`
    ).join("\n")}\n\nAnalizini ver.`;

    const model = process.env.ORCHESTRATOR_MODEL ?? "claude-opus-4-6";
    const response = await anthropic.messages.create({
      model,
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: userMsg }],
    });

    const block = response.content.find(b => b.type === "text");
    return block?.type === "text" ? block.text : null;
  } catch (err: any) {
    console.error("[orchestrator] Opus diagnosis failed:", err.message);
    return `Opus çağrısı başarısız: ${err.message}`;
  }
}

/** ═══ MAIN AUDIT ═══ */
export async function runOctopusChainAudit(
  trigger: "scheduled" | "data_ingestion" | "manual",
  triggerDetail?: string
): Promise<{ id: number; layers: Record<string, LayerStatus>; redCount: number; yellowCount: number; summary: string; diagnosis?: string | null }> {
  const startTime = Date.now();
  const findings: Finding[] = [];
  const intelCache = new Map<string, any>();

  console.log(`[orchestrator] Audit başladı (trigger=${trigger})`);

  const layers = {
    mutation: await layer1Mutation(findings),
    selfIntel: await layer2SelfIntelligence(findings, intelCache),
    crossProduct: await layer3CrossProduct(findings),
    downstream: await layer4Downstream(findings),
    uiCoherence: await layer5UiCoherence(findings, intelCache),
    wsBroadcast: await layer6WsBroadcast(findings),
    agent: await layer7Agent(findings),
    ontology: await layer8Ontology(findings),
    validation: await layer9Validation(findings, intelCache),
    seasonal: await layer10Seasonal(findings, intelCache),
  };

  const greenCount = Object.values(layers).filter((s) => s === "green").length;
  const yellowCount = Object.values(layers).filter((s) => s === "yellow").length;
  const redCount = Object.values(layers).filter((s) => s === "red").length;
  const durationMs = Date.now() - startTime;

  const summary =
    redCount > 0 ? `🔴 ${redCount} katman RED — BLOKLA: ${findings.filter(f => f.severity === "red").map(f => f.layer).join(", ")}` :
    yellowCount > 0 ? `⚠️  ${yellowCount} katman uyarı` :
    `✅ Tüm katmanlar yeşil (${greenCount} green, ${Object.values(layers).filter(s => s === "skip").length} skip)`;

  // Opus diagnosis for red/yellow findings (Claude-kalite root cause)
  const diagnosis = (redCount + yellowCount > 0) ? await invokeOpusDiagnosis(findings) : null;

  const [inserted] = await db.insert(orchestratorRuns).values({
    trigger,
    triggerDetail: triggerDetail ?? null,
    durationMs,
    layerMutation: layers.mutation,
    layerSelfIntel: layers.selfIntel,
    layerCrossProduct: layers.crossProduct,
    layerDownstream: layers.downstream,
    layerUiCoherence: layers.uiCoherence,
    layerWsBroadcast: layers.wsBroadcast,
    layerAgent: layers.agent,
    layerOntology: layers.ontology,
    layerValidation: layers.validation,
    layerSeasonal: layers.seasonal,
    greenCount, yellowCount, redCount,
    findings,
    summary: diagnosis ? `${summary}\n\n— Opus Diagnosis —\n${diagnosis}` : summary,
  }).returning();

  console.log(`[orchestrator] Audit tamamlandı (${durationMs}ms): ${summary}`);

  // Red + yellow findings → proactive WS alert (zil ikonuna)
  if (redCount + yellowCount > 0) {
    const headMsg = diagnosis ? diagnosis.slice(0, 240) : summary;
    const alerts = [{
      id: `orch_${inserted.id}_summary`,
      type: redCount > 0 ? "octopus_chain_red" : "octopus_chain_yellow",
      severity: redCount > 0 ? "critical" as const : "warning" as const,
      title: `Octopus Chain — ${redCount > 0 ? `${redCount} RED` : `${yellowCount} UYARI`}`,
      message: headMsg,
      suggestedAction: `Detay: /api/orchestrator/runs/${inserted.id}`,
      timestamp: new Date(),
    }];
    try { broadcastProactiveAlert({ event: "proactive_alert", alerts } as any); } catch {}
  }

  return { id: inserted.id, layers, redCount, yellowCount, summary, diagnosis };
}

/** ═══ SCHEDULER ═══ */
let intervalId: NodeJS.Timeout | null = null;
let debounceTimeout: NodeJS.Timeout | null = null;

async function ensureSchema(): Promise<void> {
  // Idempotent table creation — drizzle-kit push deploy pipeline'i olmadan
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS orchestrator_runs (
      id serial PRIMARY KEY,
      timestamp timestamp DEFAULT now() NOT NULL,
      trigger text NOT NULL,
      trigger_detail text,
      duration_ms integer DEFAULT 0 NOT NULL,
      layer_mutation text,
      layer_self_intel text,
      layer_cross_product text,
      layer_downstream text,
      layer_ui_coherence text,
      layer_ws_broadcast text,
      layer_agent text,
      layer_ontology text,
      layer_validation text,
      layer_seasonal text,
      green_count integer DEFAULT 0 NOT NULL,
      yellow_count integer DEFAULT 0 NOT NULL,
      red_count integer DEFAULT 0 NOT NULL,
      findings jsonb DEFAULT '[]'::jsonb,
      summary text
    )
  `);
}

export function startOrchestrator(): void {
  const intervalMin = parseInt(process.env.ORCHESTRATOR_INTERVAL_MIN ?? "180", 10);
  const intervalMs = Math.max(5, intervalMin) * 60 * 1000;
  console.log(`[orchestrator] Started — her ${intervalMin} dakikada bir audit (default trigger='scheduled')`);

  ensureSchema().catch(err => console.error("[orchestrator] Schema ensure failed:", err.message));

  intervalId = setInterval(() => {
    runOctopusChainAudit("scheduled").catch(err =>
      console.error("[orchestrator] Scheduled audit failed:", err.message));
  }, intervalMs);

  // Initial run after 60 seconds (let server warm up)
  setTimeout(() => {
    runOctopusChainAudit("scheduled", "boot").catch(err =>
      console.error("[orchestrator] Initial audit failed:", err.message));
  }, 60_000);
}

export function stopOrchestrator(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (debounceTimeout) { clearTimeout(debounceTimeout); debounceTimeout = null; }
}

/** Data ingestion trigger — debounced to avoid storms */
export function triggerAuditOnDataChange(detail: string): void {
  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    runOctopusChainAudit("data_ingestion", detail).catch(err =>
      console.error("[orchestrator] Ingestion audit failed:", err.message));
  }, 60_000); // 60s debounce — batch rapid-fire imports
}
