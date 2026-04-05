/**
 * Outcome Learning Engine (OLE)
 *
 * Flywheel'in kalbi — her tahmini sonucuyla eşleştirir, Bayesian güncelleme yapar.
 * Döngüyü kapatır: tahmin → sonuç → öğrenme → daha iyi tahmin
 *
 * Linares: "When the dataset becomes exhaustive, your network becomes an ontology."
 * OLE, ontolojinin hafızasıdır — ne tahmin ettik, ne oldu, ne öğrendik.
 */
import { db } from "../db";
import { outcomeTracking, validationAlerts, componentStock, bomItems } from "@shared/schema";
import { eq, and, sql, lt, desc, isNull } from "drizzle-orm";
import { logAudit } from "./audit";
import {
  OUTCOME_CHECK_INTERVALS,
  OUTCOME_PRIOR_CONFIDENCE,
  OUTCOME_LEARNING_RATE,
  OUTCOME_MIN_SAMPLES,
  OUTCOME_EXPIRY_GRACE_DAYS,
} from "./constants";
import type { ProactiveAlert } from "../rules-engine";

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export interface PredictionRecord {
  source: "alert" | "purchase_suggestion" | "what_if" | "agent_recommendation";
  sourceId: string;
  ruleType?: string;
  componentCode?: string;
  productSku?: string;
  predictedOutcome: string;
  predictedValue?: {
    metric: string;      // "stock_level" | "days_to_stockout" | "capacity" | "demand"
    threshold: number;
    direction: "below" | "above" | "equal";
    magnitude?: number;
  };
  deadline: Date;
  tokensConsumed?: number;
  metadata?: Record<string, any>;
}

export interface OutcomeVerification {
  predictionId: string;
  actualOutcome: string;
  actualValue?: { metric: string; measuredValue: number };
  outcomeStatus: "verified_correct" | "verified_incorrect" | "partially_correct";
  valueGenerated?: number; // TL
  verifiedBy: "system" | "user" | "auto_check";
}

export interface RuleConfidence {
  ruleType: string;
  componentCode: string | null;
  totalPredictions: number;
  correctPredictions: number;
  confidence: number;          // Bayesian posterior
  avgValueGenerated: number;   // ortalama üretilen TL
  trend: "improving" | "stable" | "degrading";
}

export interface OutcomeDashboard {
  totalPredictions: number;
  pendingVerification: number;
  verifiedCorrect: number;
  verifiedIncorrect: number;
  partiallyCorrect: number;
  expired: number;
  overallAccuracy: number | null;
  totalValueGenerated: number;
  byRule: RuleConfidence[];
  recentOutcomes: Array<{
    predictionId: string;
    source: string;
    predictedOutcome: string;
    actualOutcome: string | null;
    outcomeStatus: string;
    valueGenerated: number | null;
    createdAt: Date | null;
  }>;
  weeklyTrend: Array<{
    week: string;
    total: number;
    correct: number;
    accuracy: number | null;
    valueTL: number;
  }>;
}

// ══════════════════════════════════════════════════════════
// IN-MEMORY CONFIDENCE CACHE
// ══════════════════════════════════════════════════════════

const confidenceCache = new Map<string, number>(); // "ruleType:componentCode" → confidence

function cacheKey(ruleType: string, componentCode?: string | null): string {
  return `${ruleType}:${componentCode || "*"}`;
}

// ══════════════════════════════════════════════════════════
// CORE: KAYIT
// ══════════════════════════════════════════════════════════

/** Yeni bir tahmin kaydet — her alert/suggestion otomatik çağırır */
export function trackPrediction(record: PredictionRecord): void {
  const predictionId = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const checkIntervals = [...OUTCOME_CHECK_INTERVALS];

  db.insert(outcomeTracking).values({
    predictionId,
    source: record.source,
    sourceId: record.sourceId,
    ruleType: record.ruleType ?? null,
    componentCode: record.componentCode ?? null,
    productSku: record.productSku ?? null,
    predictedOutcome: record.predictedOutcome,
    predictedValue: record.predictedValue ?? null,
    confidence: String(getConfidence(record.ruleType ?? "unknown", record.componentCode)),
    deadline: record.deadline,
    checkIntervals,
    tokensConsumed: record.tokensConsumed ?? null,
    metadata: record.metadata ?? null,
  }).catch(err => console.error("[OLE] Track prediction error:", err));
}

/** Alert'lerden otomatik prediction oluştur — rules-engine'den çağrılır */
export function trackAlertsAsOutcomes(alerts: ProactiveAlert[]): void {
  for (const alert of alerts) {
    // Her alert doğası gereği bir tahmindir:
    // "Bu bileşen kritik duruma düşecek" → doğru mu yanlış mı?
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30); // 30 gün içinde doğrulanabilir

    trackPrediction({
      source: "alert",
      sourceId: alert.id,
      ruleType: alert.type,
      componentCode: alert.componentCode,
      productSku: alert.productSku,
      predictedOutcome: alert.message,
      predictedValue: extractPredictedValue(alert),
      deadline,
    });
  }
}

// ══════════════════════════════════════════════════════════
// CORE: DOĞRULAMA
// ══════════════════════════════════════════════════════════

/** Manuel doğrulama — kullanıcı veya agent sonucu kaydeder */
export async function verifyOutcome(verification: OutcomeVerification): Promise<void> {
  const [updated] = await db.update(outcomeTracking).set({
    actualOutcome: verification.actualOutcome,
    actualValue: verification.actualValue ?? null,
    outcomeStatus: verification.outcomeStatus,
    valueGenerated: verification.valueGenerated != null ? String(verification.valueGenerated) : null,
    verifiedAt: new Date(),
    verifiedBy: verification.verifiedBy,
  }).where(eq(outcomeTracking.predictionId, verification.predictionId)).returning();

  if (updated) {
    // Bayesian güncelleme
    const isCorrect = verification.outcomeStatus === "verified_correct" ||
      verification.outcomeStatus === "partially_correct";
    updateConfidence(updated.ruleType ?? "unknown", updated.componentCode, isCorrect);

    logAudit({
      entity: "outcome_tracking",
      entityId: verification.predictionId,
      action: "update",
      field: "outcomeStatus",
      previousValue: "pending",
      newValue: verification.outcomeStatus,
      reason: `Tahmin doğrulandı: ${verification.actualOutcome}`,
      actor: verification.verifiedBy,
      metadata: { valueGenerated: verification.valueGenerated },
    });
  }
}

/** Otomatik doğrulama — sistem tahminin doğruluğunu kontrol eder */
export async function autoVerifyOutcomes(): Promise<number> {
  // Deadline'ı geçmiş ve hâlâ pending olan tahminleri bul
  const now = new Date();
  const pending = await db.select()
    .from(outcomeTracking)
    .where(and(
      eq(outcomeTracking.outcomeStatus, "pending"),
      lt(outcomeTracking.deadline, now),
    ))
    .orderBy(desc(outcomeTracking.createdAt))
    .limit(50);

  let verifiedCount = 0;

  for (const prediction of pending) {
    const result = await checkPredictionAgainstReality(prediction);
    if (result) {
      await verifyOutcome({
        predictionId: prediction.predictionId,
        actualOutcome: result.actualOutcome,
        actualValue: result.actualValue,
        outcomeStatus: result.outcomeStatus,
        valueGenerated: result.valueGenerated,
        verifiedBy: "auto_check",
      });
      verifiedCount++;
    } else {
      // Grace period aşıldıysa expire et
      const graceDeadline = new Date(prediction.deadline);
      graceDeadline.setDate(graceDeadline.getDate() + OUTCOME_EXPIRY_GRACE_DAYS);
      if (now > graceDeadline) {
        await db.update(outcomeTracking).set({
          outcomeStatus: "expired",
          verifiedAt: now,
          verifiedBy: "system",
        }).where(eq(outcomeTracking.id, prediction.id));
        verifiedCount++;
      }
    }
  }

  return verifiedCount;
}

// ══════════════════════════════════════════════════════════
// BAYESIAN CONFIDENCE
// ══════════════════════════════════════════════════════════

/** Mevcut güven skorunu getir */
export function getConfidence(ruleType: string, componentCode?: string | null): number {
  const key = cacheKey(ruleType, componentCode);
  return confidenceCache.get(key) ?? OUTCOME_PRIOR_CONFIDENCE;
}

/** Bayesian güncelleme — her doğrulama sonrası */
function updateConfidence(ruleType: string, componentCode: string | null, isCorrect: boolean): void {
  const key = cacheKey(ruleType, componentCode);
  const prior = confidenceCache.get(key) ?? OUTCOME_PRIOR_CONFIDENCE;
  const alpha = OUTCOME_LEARNING_RATE;

  // Bayesian update: posterior = α × evidence + (1 - α) × prior
  const evidence = isCorrect ? 1.0 : 0.0;
  const posterior = alpha * evidence + (1 - alpha) * prior;

  // Clamp [0.05, 0.99] — asla tam 0 veya 1 olmasın
  const clamped = Math.max(0.05, Math.min(0.99, posterior));
  confidenceCache.set(key, clamped);
}

/** Tüm güven skorlarını DB'den yeniden hesapla — sunucu başlangıcında çağrılır */
export async function rebuildConfidenceCache(): Promise<void> {
  const results = await db.select({
    ruleType: outcomeTracking.ruleType,
    componentCode: outcomeTracking.componentCode,
    total: sql<number>`COUNT(*)`,
    correct: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} IN ('verified_correct', 'partially_correct'))`,
    incorrect: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} = 'verified_incorrect')`,
  })
    .from(outcomeTracking)
    .where(sql`${outcomeTracking.outcomeStatus} != 'pending' AND ${outcomeTracking.outcomeStatus} != 'expired'`)
    .groupBy(outcomeTracking.ruleType, outcomeTracking.componentCode);

  confidenceCache.clear();

  for (const r of results) {
    const total = Number(r.correct) + Number(r.incorrect);
    if (total < OUTCOME_MIN_SAMPLES) continue;

    // Bayesian posterior from historical data
    const empiricalRate = Number(r.correct) / total;
    const prior = OUTCOME_PRIOR_CONFIDENCE;
    // Weight empirical by sample size (more data → trust empirical more)
    const weight = Math.min(1.0, total / (OUTCOME_MIN_SAMPLES * 5));
    const posterior = weight * empiricalRate + (1 - weight) * prior;

    const key = cacheKey(r.ruleType ?? "unknown", r.componentCode);
    confidenceCache.set(key, Math.max(0.05, Math.min(0.99, posterior)));
  }

  console.log(`[OLE] Confidence cache rebuilt: ${confidenceCache.size} entries`);
}

// ══════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════

/** Ana dashboard — tüm outcome metrikleri */
export async function getOutcomeDashboard(): Promise<OutcomeDashboard> {
  const [counts, byRule, recent, weeklyTrend] = await Promise.all([
    // Genel sayaçlar
    db.select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} = 'pending')`,
      correct: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} = 'verified_correct')`,
      incorrect: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} = 'verified_incorrect')`,
      partial: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} = 'partially_correct')`,
      expired: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} = 'expired')`,
      totalValue: sql<number>`COALESCE(SUM(${outcomeTracking.valueGenerated}::numeric), 0)`,
    }).from(outcomeTracking),

    // Kural bazlı güven skorları
    db.select({
      ruleType: outcomeTracking.ruleType,
      componentCode: outcomeTracking.componentCode,
      total: sql<number>`COUNT(*)`,
      correct: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} IN ('verified_correct', 'partially_correct'))`,
      avgValue: sql<number>`COALESCE(AVG(${outcomeTracking.valueGenerated}::numeric), 0)`,
    })
      .from(outcomeTracking)
      .where(sql`${outcomeTracking.outcomeStatus} != 'pending'`)
      .groupBy(outcomeTracking.ruleType, outcomeTracking.componentCode),

    // Son 20 outcome
    db.select({
      predictionId: outcomeTracking.predictionId,
      source: outcomeTracking.source,
      predictedOutcome: outcomeTracking.predictedOutcome,
      actualOutcome: outcomeTracking.actualOutcome,
      outcomeStatus: outcomeTracking.outcomeStatus,
      valueGenerated: outcomeTracking.valueGenerated,
      createdAt: outcomeTracking.createdAt,
    })
      .from(outcomeTracking)
      .orderBy(desc(outcomeTracking.createdAt))
      .limit(20),

    // Haftalık trend (son 8 hafta)
    db.select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${outcomeTracking.createdAt}), 'YYYY-WW')`,
      total: sql<number>`COUNT(*)`,
      correct: sql<number>`COUNT(*) FILTER (WHERE ${outcomeTracking.outcomeStatus} IN ('verified_correct', 'partially_correct'))`,
      valueTL: sql<number>`COALESCE(SUM(${outcomeTracking.valueGenerated}::numeric), 0)`,
    })
      .from(outcomeTracking)
      .where(sql`${outcomeTracking.createdAt} > NOW() - INTERVAL '8 weeks'`)
      .groupBy(sql`DATE_TRUNC('week', ${outcomeTracking.createdAt})`)
      .orderBy(sql`DATE_TRUNC('week', ${outcomeTracking.createdAt})`),
  ]);

  const c = counts[0];
  const total = Number(c.total);
  const correct = Number(c.correct);
  const incorrect = Number(c.incorrect);
  const verified = correct + incorrect + Number(c.partial);

  return {
    totalPredictions: total,
    pendingVerification: Number(c.pending),
    verifiedCorrect: correct,
    verifiedIncorrect: incorrect,
    partiallyCorrect: Number(c.partial),
    expired: Number(c.expired),
    overallAccuracy: verified >= OUTCOME_MIN_SAMPLES
      ? (correct + Number(c.partial) * 0.5) / verified
      : null,
    totalValueGenerated: Number(c.totalValue),
    byRule: byRule.map(r => {
      const tot = Number(r.total);
      const cor = Number(r.correct);
      const key = cacheKey(r.ruleType ?? "unknown", r.componentCode);
      const confidence = confidenceCache.get(key) ?? OUTCOME_PRIOR_CONFIDENCE;
      return {
        ruleType: r.ruleType ?? "unknown",
        componentCode: r.componentCode,
        totalPredictions: tot,
        correctPredictions: cor,
        confidence,
        avgValueGenerated: Number(r.avgValue),
        trend: computeTrend(r.ruleType ?? "unknown", r.componentCode),
      };
    }),
    recentOutcomes: recent.map(r => ({
      predictionId: r.predictionId,
      source: r.source,
      predictedOutcome: r.predictedOutcome,
      actualOutcome: r.actualOutcome,
      outcomeStatus: r.outcomeStatus,
      valueGenerated: r.valueGenerated ? Number(r.valueGenerated) : null,
      createdAt: r.createdAt,
    })),
    weeklyTrend: weeklyTrend.map(w => ({
      week: w.week,
      total: Number(w.total),
      correct: Number(w.correct),
      accuracy: Number(w.total) > 0 ? Number(w.correct) / Number(w.total) : null,
      valueTL: Number(w.valueTL),
    })),
  };
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

/** Alert'ten predicted value çıkar */
function extractPredictedValue(alert: ProactiveAlert): PredictionRecord["predictedValue"] | undefined {
  // Root cause'dan sayısal veri çıkar
  if (!alert.rootCause || alert.rootCause.length === 0) return undefined;

  for (const step of alert.rootCause) {
    if (step.data) {
      if ("seasonalDays" in step.data) {
        return {
          metric: "days_to_stockout",
          threshold: Number(step.data.seasonalDays),
          direction: "below",
          magnitude: Number(step.data.seasonalDays),
        };
      }
      if ("maxProducible" in step.data) {
        return {
          metric: "capacity",
          threshold: Number(step.data.maxProducible),
          direction: "below",
          magnitude: Number(step.data.maxProducible),
        };
      }
      if ("currentStock" in step.data) {
        return {
          metric: "stock_level",
          threshold: Number(step.data.currentStock),
          direction: "below",
          magnitude: Number(step.data.currentStock),
        };
      }
    }
  }
  return undefined;
}

/** Tahmin ile gerçeği karşılaştır — otomatik doğrulama */
async function checkPredictionAgainstReality(
  prediction: typeof outcomeTracking.$inferSelect
): Promise<Omit<OutcomeVerification, "predictionId" | "verifiedBy"> | null> {
  const predicted = prediction.predictedValue as PredictionRecord["predictedValue"] | null;
  if (!predicted || !prediction.componentCode) return null;

  // Bileşenin mevcut durumunu al
  const [current] = await db.select({
    currentStock: componentStock.currentStock,
  })
    .from(componentStock)
    .where(eq(componentStock.componentCode, prediction.componentCode))
    .limit(1);

  if (!current) return null;

  const actualStock = Number(current.currentStock);

  if (predicted.metric === "stock_level" || predicted.metric === "days_to_stockout") {
    // Tahmin: "stok X'in altına düşecek"
    const predictedThreshold = predicted.threshold;

    if (predicted.direction === "below") {
      const didHappen = actualStock <= predictedThreshold;
      return {
        actualOutcome: `Gerçek stok: ${actualStock} (tahmin eşiği: ${predictedThreshold})`,
        actualValue: { metric: predicted.metric, measuredValue: actualStock },
        outcomeStatus: didHappen ? "verified_correct" : "verified_incorrect",
        valueGenerated: didHappen ? estimateValueFromPrevention(prediction) : 0,
      };
    }
  }

  if (predicted.metric === "capacity") {
    const [bomData] = await db.select({ required: bomItems.requiredQuantity })
      .from(bomItems)
      .where(eq(bomItems.componentCode, prediction.componentCode))
      .limit(1);

    if (bomData) {
      const capacity = Math.floor(actualStock / Number(bomData.required));
      const didHappen = capacity <= predicted.threshold;
      return {
        actualOutcome: `Gerçek kapasite: ${capacity} (tahmin eşiği: ${predicted.threshold})`,
        actualValue: { metric: "capacity", measuredValue: capacity },
        outcomeStatus: didHappen ? "verified_correct" : "verified_incorrect",
        valueGenerated: didHappen ? estimateValueFromPrevention(prediction) : 0,
      };
    }
  }

  return null;
}

/** Önleme değeri tahmini — stoksuzluk önlendiyse ne kadar tasarruf edildi? */
function estimateValueFromPrevention(
  prediction: typeof outcomeTracking.$inferSelect
): number {
  // Bileşen kritikliğine göre temel değer
  const source = prediction.source;
  if (source === "alert") {
    // Kritik alert → stoksuzluk önlendi → yüksek değer
    return 2500; // STOCKOUT_DAILY_COST_TL (constants'tan)
  }
  if (source === "purchase_suggestion") {
    return 1500; // Tedarik önerisi uygulandı
  }
  return 500; // Genel bilgi değeri
}

/** Kural trendini hesapla — son 4 hafta iyileşme mi kötüleşme mi */
function computeTrend(ruleType: string, componentCode: string | null): "improving" | "stable" | "degrading" {
  // Basit: cache'deki confidence ile prior'ı karşılaştır
  const key = cacheKey(ruleType, componentCode);
  const confidence = confidenceCache.get(key);
  if (!confidence) return "stable";

  if (confidence > OUTCOME_PRIOR_CONFIDENCE + 0.1) return "improving";
  if (confidence < OUTCOME_PRIOR_CONFIDENCE - 0.1) return "degrading";
  return "stable";
}
