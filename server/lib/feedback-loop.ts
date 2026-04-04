/**
 * Feedback Loop — Kural Hassasiyet Takibi + Otomatik Düzeltme
 *
 * Palantir AIP: "identify issue → understand root cause → implement correction →
 * observe validation improvement → repeat"
 *
 * Her kural tipi için precision hesaplar.
 * False positive oranı %60'ı aşan kuralları otomatik suppress eder.
 * Suppress edilen kurallar info seviyesine düşürülür (critical/warning → info).
 */
import { db } from "../db";
import { validationAlerts } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { logAudit } from "./audit";
import { FEEDBACK_SUPPRESS_THRESHOLD, FEEDBACK_MIN_VALIDATED, FEEDBACK_ANALYSIS_INTERVAL } from "./constants";

export interface RuleFeedback {
  ruleType: string;
  total: number;
  truePositive: number;
  falsePositive: number;
  unvalidated: number;
  precision: number | null; // null = henüz yeterli veri yok
  shouldSuppress: boolean;
  reason: string;
}

/** Tüm kural tiplerinin hassasiyet analizini yap */
export async function analyzeRulePrecision(): Promise<RuleFeedback[]> {
  const results = await db.select({
    type: validationAlerts.type,
    total: sql<number>`COUNT(*)`,
    truePositive: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.outcome} = 'true_positive')`,
    falsePositive: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.outcome} = 'false_positive')`,
    validated: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.validated} = true)`,
  })
    .from(validationAlerts)
    .groupBy(validationAlerts.type);

  return results.map(r => {
    const total = Number(r.total);
    const tp = Number(r.truePositive);
    const fp = Number(r.falsePositive);
    const validated = Number(r.validated);
    const unvalidated = total - validated;

    // Precision = TP / (TP + FP), sadece yeterli veri varsa (min 5 validated)
    const precision = validated >= FEEDBACK_MIN_VALIDATED ? tp / (tp + fp) : null;

    // Suppress: precision < threshold ve en az N validated örnek varsa
    const shouldSuppress = precision !== null && precision < FEEDBACK_SUPPRESS_THRESHOLD;
    const reason = shouldSuppress
      ? `Precision ${(precision! * 100).toFixed(0)}% (${tp}/${tp + fp}) — eşik altında, severity düşürüldü`
      : precision !== null
        ? `Precision ${(precision! * 100).toFixed(0)}% (${tp}/${tp + fp}) — normal`
        : `Henüz yeterli validasyon yok (${validated}/5 minimum)`;

    return { ruleType: r.type, total, truePositive: tp, falsePositive: fp, unvalidated, precision, shouldSuppress, reason };
  });
}

// Suppress edilen kural tiplerini cache'le (server restart'ta sıfırlanır, analiz tekrar çalışır)
let suppressedRuleTypes = new Set<string>();
let lastAnalysisTime = 0;
const ANALYSIS_INTERVAL = FEEDBACK_ANALYSIS_INTERVAL;

/** Bir kural tipi suppress edilmeli mi? */
export async function isRuleSuppressed(ruleType: string): Promise<boolean> {
  // Periyodik analiz
  if (Date.now() - lastAnalysisTime > ANALYSIS_INTERVAL) {
    await refreshSuppression();
  }
  return suppressedRuleTypes.has(ruleType);
}

/** Suppression listesini güncelle */
export async function refreshSuppression(): Promise<void> {
  try {
    const feedback = await analyzeRulePrecision();
    const newSuppressed = new Set<string>();

    for (const fb of feedback) {
      if (fb.shouldSuppress) {
        newSuppressed.add(fb.ruleType);

        // Yeni suppress edilen kural mı? Log it.
        if (!suppressedRuleTypes.has(fb.ruleType)) {
          logAudit({
            entity: "rule_suppression", entityId: fb.ruleType, action: "update",
            field: "severity", previousValue: "original", newValue: "suppressed_to_info",
            reason: fb.reason, actor: "feedback_loop",
          });
          console.log(`[feedback-loop] Kural suppress edildi: ${fb.ruleType} — ${fb.reason}`);
        }
      }
    }

    suppressedRuleTypes = newSuppressed;
    lastAnalysisTime = Date.now();
  } catch (err) {
    console.error("[feedback-loop] Analysis error:", err);
  }
}

/** Alert severity'sini feedback loop'a göre ayarla */
export function adjustSeverity(
  originalSeverity: "critical" | "warning" | "info",
  ruleType: string
): "critical" | "warning" | "info" {
  if (suppressedRuleTypes.has(ruleType)) {
    return "info"; // Suppress: tüm uyarıları info'ya düşür
  }
  return originalSeverity;
}
