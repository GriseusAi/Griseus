/**
 * Correction Propagation Engine
 *
 * Palantir AIP: "Corrections propagate rapidly through the pipeline,
 * enterprises get feedback on improvements within minutes, not weeks."
 *
 * Bir düzeltme yapıldığında (alert false_positive, stok düzeltme, kural değişikliği)
 * tüm bağlı kolları otomatik re-evaluate eder:
 * 1. Rules Engine → yeni/güncel uyarılar üret
 * 2. Impact Engine → cascade etkilerini hesapla
 * 3. Feedback Loop → precision güncelle, suppress durumunu ayarla
 * 4. WebSocket → tüm client'lara yayınla
 */
import { evaluateRules, type ProactiveAlert } from "../rules-engine";
import { computeImpactPropagation, takePreSnapshot } from "./impact-engine";
import { refreshSuppression } from "./feedback-loop";
import { broadcastProactiveAlert, broadcastImpactPropagation } from "../ws";
import { logAudit } from "./audit";

export interface CorrectionEvent {
  type: "alert_validated" | "stock_corrected" | "rule_changed";
  entityId: string;
  detail: string;
  actor: string;
  sku?: string;
}

export interface PropagationResult {
  correctionType: string;
  triggeredAlerts: number;
  impactEvents: number;
  feedbackUpdated: boolean;
  summary: string;
}

/**
 * Ana propagation fonksiyonu — düzeltme yapıldığında çağrılır.
 * Tüm kolları sırasıyla re-evaluate eder.
 */
export async function propagateCorrection(event: CorrectionEvent): Promise<PropagationResult> {
  const startTime = Date.now();
  let triggeredAlerts = 0;
  let impactEvents = 0;
  let feedbackUpdated = false;

  try {
    // 1. Feedback Loop güncelle (suppress listesi yenile)
    await refreshSuppression().catch(err => console.error("[correction-propagation]", err));
    feedbackUpdated = true;

    // 2. Pre-snapshot al (impact engine için)
    const preSnapshot = await takePreSnapshot().catch(() => null);

    // 3. Rules Engine re-evaluate (her iki trigger tipi için)
    const [stockAlerts, compAlerts] = await Promise.all([
      evaluateRules({ type: "stock_movement", sku: event.sku }).catch(() => [] as ProactiveAlert[]),
      evaluateRules({ type: "component_stock_update", sku: event.sku }).catch(() => [] as ProactiveAlert[]),
    ]);

    // Deduplicate (aynı tip uyarılar birleş)
    const allAlerts = deduplicateAlerts([...stockAlerts, ...compAlerts]);
    triggeredAlerts = allAlerts.length;

    if (allAlerts.length > 0) {
      broadcastProactiveAlert({ event: "proactive_alert", alerts: allAlerts });
    }

    // 4. Impact Propagation (eğer pre-snapshot varsa)
    if (preSnapshot) {
      const impacts = await computeImpactPropagation(
        { type: "correction", actor: event.actor, detail: event.detail },
        preSnapshot
      ).catch(() => []);

      impactEvents = impacts.length;
      if (impacts.length > 0) {
        broadcastImpactPropagation({ event: "impact_propagation", impacts });
      }
    }

    // 5. Audit log
    logAudit({
      entity: "correction_propagation",
      entityId: event.entityId,
      action: "propagate",
      reason: `${event.type}: ${event.detail}`,
      actor: event.actor,
      metadata: {
        triggeredAlerts,
        impactEvents,
        feedbackUpdated,
        durationMs: Date.now() - startTime,
      },
    });

    const summary = `Düzeltme yayıldı: ${triggeredAlerts} uyarı, ${impactEvents} impact, feedback ${feedbackUpdated ? "güncellendi" : "başarısız"} (${Date.now() - startTime}ms)`;
    console.log(`[correction-propagation] ${summary}`);

    return { correctionType: event.type, triggeredAlerts, impactEvents, feedbackUpdated, summary };
  } catch (err) {
    console.error("[correction-propagation] Error:", err);
    return {
      correctionType: event.type,
      triggeredAlerts, impactEvents, feedbackUpdated,
      summary: `Propagation hatası: ${(err as Error).message}`,
    };
  }
}

/** Alert deduplicate — aynı type+componentCode çiftini bir kez al */
function deduplicateAlerts(alerts: ProactiveAlert[]): ProactiveAlert[] {
  const seen = new Set<string>();
  return alerts.filter(a => {
    const key = `${a.type}_${a.componentCode || ""}_${a.productSku || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
