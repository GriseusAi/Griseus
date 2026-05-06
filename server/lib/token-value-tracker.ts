/**
 * Token Value Tracker (TVT)
 *
 * Linares: "Customers don't care about CapEx, parameters, or GPUs.
 *           They care about outcomes and are willing to pay for them."
 *
 * V/T (Value per Token) = üretilen_değer / harcanan_token
 * OAR (Ontology Advantage Ratio) = V/T_griseus / V/T_generic
 *
 * Her agent etkileşimini loglar, outcome'la eşleştirir, V/T hesaplar.
 * Generic model baseline ile karşılaştırarak ontoloji avantajını ölçer.
 */
import { db } from "../db";
import { tokenMetrics, outcomeTracking } from "@shared/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import {
  STOCKOUT_DAILY_COST_TL,
  PRODUCTION_DOWNTIME_HOURLY_TL,
  DECISION_TIME_HOURLY_TL,
  OVERSTOCK_MONTHLY_UNIT_TL,
  GENERIC_MODEL_BASELINE_VT,
} from "./constants";

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export interface TokenInteraction {
  interactionType: "agent_chat" | "agent_multi_chat" | "agent_multi_v2_chat" | "agent_multi_v2_normal" | "agent_multi_v2_fast" | "agent_multi_v2_research" | "agent_multi_v2_visual" | "alert_generated" | "rule_evaluated" | "what_if" | "import";
  inputTokens: number;
  outputTokens: number;
  toolsUsed?: string[];
  queryCategory?: "stock_check" | "forecast" | "planning" | "alert_response" | "operational";
  outcomeId?: string; // bağlı outcome prediction ID
  actor?: string;
}

export interface ValueEstimate {
  category: string;
  estimatedTL: number;
  reasoning: string;
}

export interface TVTDashboard {
  // Genel
  totalInteractions: number;
  totalTokensConsumed: number;
  totalEstimatedValueTL: number;
  totalActualValueTL: number;
  // V/T Metrikleri
  avgValuePerToken: number | null;
  avgOntologyAdvantageRatio: number | null;
  // Zaman serisi
  weeklyVPT: Array<{
    week: string;
    tokens: number;
    valueTL: number;
    vpt: number | null;
    interactions: number;
  }>;
  // Kategori bazlı
  byCategory: Array<{
    category: string;
    interactions: number;
    tokens: number;
    valueTL: number;
    vpt: number | null;
  }>;
  // Tool etkinliği
  topTools: Array<{
    tool: string;
    usageCount: number;
    avgValueTL: number;
  }>;
  // Flywheel metriği
  flywheel: {
    dataGrowthRate: number;       // haftalık veri artış oranı
    personalizationDepth: number; // outcome-bağlı etkileşim oranı
    engagementTrend: number;      // haftalık etkileşim değişimi
    velocityScore: number;        // bileşik flywheel skoru
  };
}

// ══════════════════════════════════════════════════════════
// CORE: LOGGING
// ══════════════════════════════════════════════════════════

/** Agent etkileşimini logla — her chat/tool çağrısında */
export function logTokenInteraction(interaction: TokenInteraction): void {
  const interactionId = `ti_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const totalTokens = interaction.inputTokens + interaction.outputTokens;

  // Değer tahmini — query kategorisine göre
  const estimate = estimateInteractionValue(interaction);

  // Generic baseline — ontolojik sorulara generic model cevap veremez
  const genericBaseline = canGenericModelAnswer(interaction) ? estimate.estimatedTL * 0.3 : 0;

  const vpt = totalTokens > 0 ? estimate.estimatedTL / totalTokens : null;
  const oar = genericBaseline > 0 && totalTokens > 0
    ? (estimate.estimatedTL / totalTokens) / (genericBaseline / totalTokens)
    : null; // generic cevap veremezse OAR = infinity (null olarak göster)

  db.insert(tokenMetrics).values({
    interactionId,
    interactionType: interaction.interactionType,
    inputTokens: interaction.inputTokens,
    outputTokens: interaction.outputTokens,
    totalTokens,
    toolsUsed: interaction.toolsUsed ?? null,
    queryCategory: interaction.queryCategory ?? null,
    outcomeLinked: !!interaction.outcomeId,
    outcomeId: interaction.outcomeId ?? null,
    estimatedValueTL: String(estimate.estimatedTL),
    actualValueTL: null, // outcome doğrulanınca güncellenir
    valuePerToken: vpt != null ? String(vpt) : null,
    genericBaselineTL: String(genericBaseline),
    ontologyAdvantageRatio: oar != null ? String(oar) : null,
    actor: interaction.actor ?? "ceo_agent",
  }).catch(err => console.error("[TVT] Log error:", err));
}

/** Outcome doğrulanınca bağlı token metriğini güncelle */
export async function linkOutcomeToTokens(outcomeId: string, actualValueTL: number): Promise<void> {
  const rows = await db.select()
    .from(tokenMetrics)
    .where(eq(tokenMetrics.outcomeId, outcomeId))
    .limit(5);

  for (const row of rows) {
    const total = Number(row.totalTokens);
    const vpt = total > 0 ? actualValueTL / total : null;
    const genericBase = Number(row.genericBaselineTL ?? 0);
    const oar = genericBase > 0 && vpt != null ? vpt / (genericBase / total) : null;

    await db.update(tokenMetrics).set({
      actualValueTL: String(actualValueTL),
      valuePerToken: vpt != null ? String(vpt) : null,
      ontologyAdvantageRatio: oar != null ? String(oar) : null,
    }).where(eq(tokenMetrics.id, row.id));
  }
}

// ══════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════

/** Ana TVT dashboard — V/T metrikleri + flywheel skoru */
export async function getTVTDashboard(): Promise<TVTDashboard> {
  const [totals, weekly, byCategory, toolUsage] = await Promise.all([
    // Genel toplamlar
    db.select({
      total: sql<number>`COUNT(*)`,
      tokens: sql<number>`COALESCE(SUM(${tokenMetrics.totalTokens}), 0)`,
      estimatedValue: sql<number>`COALESCE(SUM(${tokenMetrics.estimatedValueTL}::numeric), 0)`,
      actualValue: sql<number>`COALESCE(SUM(${tokenMetrics.actualValueTL}::numeric), 0)`,
      avgVPT: sql<number>`AVG(${tokenMetrics.valuePerToken}::numeric)`,
      avgOAR: sql<number>`AVG(${tokenMetrics.ontologyAdvantageRatio}::numeric)`,
    }).from(tokenMetrics),

    // Haftalık V/T trend (son 8 hafta)
    db.select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${tokenMetrics.createdAt}), 'YYYY-WW')`,
      tokens: sql<number>`COALESCE(SUM(${tokenMetrics.totalTokens}), 0)`,
      valueTL: sql<number>`COALESCE(SUM(COALESCE(${tokenMetrics.actualValueTL}::numeric, ${tokenMetrics.estimatedValueTL}::numeric)), 0)`,
      interactions: sql<number>`COUNT(*)`,
    })
      .from(tokenMetrics)
      .where(sql`${tokenMetrics.createdAt} > NOW() - INTERVAL '8 weeks'`)
      .groupBy(sql`DATE_TRUNC('week', ${tokenMetrics.createdAt})`)
      .orderBy(sql`DATE_TRUNC('week', ${tokenMetrics.createdAt})`),

    // Kategori bazlı
    db.select({
      category: tokenMetrics.queryCategory,
      interactions: sql<number>`COUNT(*)`,
      tokens: sql<number>`COALESCE(SUM(${tokenMetrics.totalTokens}), 0)`,
      valueTL: sql<number>`COALESCE(SUM(COALESCE(${tokenMetrics.actualValueTL}::numeric, ${tokenMetrics.estimatedValueTL}::numeric)), 0)`,
    })
      .from(tokenMetrics)
      .groupBy(tokenMetrics.queryCategory),

    // Tool kullanım analizi — jsonb array'den tool çıkar
    db.select({
      tool: sql<string>`jsonb_array_elements_text(${tokenMetrics.toolsUsed})`,
      usageCount: sql<number>`COUNT(*)`,
      avgValue: sql<number>`AVG(COALESCE(${tokenMetrics.actualValueTL}::numeric, ${tokenMetrics.estimatedValueTL}::numeric))`,
    })
      .from(tokenMetrics)
      .where(sql`${tokenMetrics.toolsUsed} IS NOT NULL AND jsonb_typeof(${tokenMetrics.toolsUsed}) = 'array'`)
      .groupBy(sql`jsonb_array_elements_text(${tokenMetrics.toolsUsed})`)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
  ]);

  const t = totals[0];

  // Flywheel metrikleri hesapla
  const flywheel = computeFlywheelMetrics(weekly);

  return {
    totalInteractions: Number(t.total),
    totalTokensConsumed: Number(t.tokens),
    totalEstimatedValueTL: Number(t.estimatedValue),
    totalActualValueTL: Number(t.actualValue),
    avgValuePerToken: t.avgVPT ? Number(t.avgVPT) : null,
    avgOntologyAdvantageRatio: t.avgOAR ? Number(t.avgOAR) : null,
    weeklyVPT: weekly.map(w => {
      const tokens = Number(w.tokens);
      const value = Number(w.valueTL);
      return {
        week: w.week,
        tokens,
        valueTL: value,
        vpt: tokens > 0 ? value / tokens : null,
        interactions: Number(w.interactions),
      };
    }),
    byCategory: byCategory.map(c => {
      const tokens = Number(c.tokens);
      const value = Number(c.valueTL);
      return {
        category: c.category ?? "uncategorized",
        interactions: Number(c.interactions),
        tokens,
        valueTL: value,
        vpt: tokens > 0 ? value / tokens : null,
      };
    }),
    topTools: toolUsage.map(t => ({
      tool: t.tool,
      usageCount: Number(t.usageCount),
      avgValueTL: Number(t.avgValue),
    })),
    flywheel,
  };
}

// ══════════════════════════════════════════════════════════
// FLYWHEEL SCORE
// ══════════════════════════════════════════════════════════

/**
 * Flywheel metrikleri — Linares'in 3 bileşeni:
 * 1. Data growth rate (daha fazla veri)
 * 2. Personalization depth (outcome bağlantı oranı)
 * 3. Engagement trend (etkileşim artışı)
 *
 * Velocity Score = (dataGrowth × personalization × engagement) ^ (1/3)
 * Geometrik ortalama — 3 bileşenin dengeli büyümesini ödüllendirir
 */
function computeFlywheelMetrics(weekly: Array<{
  tokens: number | unknown;
  interactions: number | unknown;
  valueTL: number | unknown;
}>): TVTDashboard["flywheel"] {
  if (weekly.length < 2) {
    return { dataGrowthRate: 0, personalizationDepth: 0, engagementTrend: 0, velocityScore: 0 };
  }

  const weeks = weekly.map(w => ({
    tokens: Number(w.tokens),
    interactions: Number(w.interactions),
    value: Number(w.valueTL),
  }));

  const last = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];

  // 1. Data growth: haftalık token artış oranı
  const dataGrowthRate = prev.tokens > 0
    ? (last.tokens - prev.tokens) / prev.tokens
    : 0;

  // 2. Personalization depth: son haftanın V/T'si ilk haftaya göre artış
  const firstVPT = weeks[0].tokens > 0 ? weeks[0].value / weeks[0].tokens : 0;
  const lastVPT = last.tokens > 0 ? last.value / last.tokens : 0;
  const personalizationDepth = firstVPT > 0
    ? (lastVPT - firstVPT) / firstVPT
    : lastVPT > 0 ? 1 : 0;

  // 3. Engagement trend: haftalık etkileşim artışı
  const engagementTrend = prev.interactions > 0
    ? (last.interactions - prev.interactions) / prev.interactions
    : 0;

  // Velocity score: geometrik ortalama (0'ları handle et)
  const safeGrowth = Math.max(0, 1 + dataGrowthRate);
  const safePersonal = Math.max(0, 1 + personalizationDepth);
  const safeEngage = Math.max(0, 1 + engagementTrend);
  const velocityScore = Math.pow(safeGrowth * safePersonal * safeEngage, 1 / 3) - 1;

  return {
    dataGrowthRate: Math.round(dataGrowthRate * 1000) / 1000,
    personalizationDepth: Math.round(personalizationDepth * 1000) / 1000,
    engagementTrend: Math.round(engagementTrend * 1000) / 1000,
    velocityScore: Math.round(velocityScore * 1000) / 1000,
  };
}

// ══════════════════════════════════════════════════════════
// VALUE ESTIMATION
// ══════════════════════════════════════════════════════════

/** Etkileşimin tahmini değerini hesapla */
function estimateInteractionValue(interaction: TokenInteraction): ValueEstimate {
  const tools = interaction.toolsUsed ?? [];
  const category = interaction.queryCategory;
  let estimatedTL = 0;
  let reasoning = "";

  // Tool bazlı değer hesabı
  if (tools.includes("what_if_analysis")) {
    estimatedTL += DECISION_TIME_HOURLY_TL * 2; // 2 saat karar süresi tasarrufu
    reasoning += "What-if simülasyonu: karar süresi tasarrufu. ";
  }

  if (tools.includes("get_component_intelligence") || tools.includes("get_intelligence_engine")) {
    estimatedTL += DECISION_TIME_HOURLY_TL; // 1 saat bilgi toplama tasarrufu
    reasoning += "Bileşen istihbaratı: bilgi toplama tasarrufu. ";
  }

  if (tools.includes("get_production_capacity") || tools.includes("simulate_order_fulfillment")) {
    estimatedTL += DECISION_TIME_HOURLY_TL * 1.5;
    reasoning += "Kapasite/sipariş analizi: planlama tasarrufu. ";
  }

  if (tools.includes("create_purchase_suggestion")) {
    estimatedTL += STOCKOUT_DAILY_COST_TL; // Potansiyel stoksuzluk önleme
    reasoning += "Satın alma önerisi: stoksuzluk riski azaltma. ";
  }

  if (tools.includes("check_stock_alerts") || tools.includes("get_validation_dashboard")) {
    estimatedTL += DECISION_TIME_HOURLY_TL * 0.5;
    reasoning += "Alert kontrolü: erken uyarı değeri. ";
  }

  // Kategori bazlı minimum değer
  if (estimatedTL === 0) {
    switch (category) {
      case "stock_check": estimatedTL = DECISION_TIME_HOURLY_TL * 0.5; break;
      case "forecast": estimatedTL = DECISION_TIME_HOURLY_TL * 2; break;
      case "planning": estimatedTL = DECISION_TIME_HOURLY_TL * 3; break;
      case "alert_response": estimatedTL = STOCKOUT_DAILY_COST_TL * 0.5; break;
      case "operational": estimatedTL = DECISION_TIME_HOURLY_TL * 0.3; break;
      default: estimatedTL = DECISION_TIME_HOURLY_TL * 0.2; break;
    }
    reasoning += `Kategori bazlı tahmini değer: ${category ?? "genel"}. `;
  }

  // Etkileşim tipi çarpanı
  if (interaction.interactionType === "alert_generated") {
    estimatedTL *= 1.5; // Proaktif uyarılar daha değerli
    reasoning += "Proaktif uyarı çarpanı (%50). ";
  }

  return {
    category: category ?? "uncategorized",
    estimatedTL: Math.round(estimatedTL),
    reasoning: reasoning.trim(),
  };
}

/** Generic model bu soruyu cevaplayabilir mi? */
function canGenericModelAnswer(interaction: TokenInteraction): boolean {
  const tools = interaction.toolsUsed ?? [];

  // Bu tool'lar proprietary data gerektirir — generic model cevap veremez
  const ontologyTools = [
    "get_live_stock_levels",
    "get_stock_movement_history",
    "get_production_capacity",
    "simulate_order_fulfillment",
    "check_stock_alerts",
    "get_bom_tree",
    "get_component_intelligence",
    "get_intelligence_engine",
    "get_validation_dashboard",
    "what_if_analysis",
    "get_audit_trail",
    "create_stock_movement",
    "update_component_stock",
    "create_purchase_suggestion",
  ];

  // Herhangi bir ontoloji tool'u kullanıldıysa → generic cevap veremez
  const usesOntology = tools.some(t => ontologyTools.includes(t));
  if (usesOntology) return false;

  // Operational sorular genelde ontoloji gerektirir
  if (interaction.queryCategory === "stock_check" ||
    interaction.queryCategory === "forecast" ||
    interaction.queryCategory === "alert_response") {
    return false;
  }

  // Genel bilgi soruları → generic de cevap verebilir (ama daha düşük kalitede)
  return true;
}
