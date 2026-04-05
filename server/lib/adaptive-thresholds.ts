/**
 * Adaptive Threshold Engine (ATE)
 *
 * Linares: "Hyper-personalisation drives far higher levels of engagement"
 *
 * Her firma için operasyonel parmak izine göre eşikleri adapte eder:
 * - Tedarik süresi 45 gün olan firma → kritik eşik otomatik yükselir
 * - Talep volatilitesi yüksek → daha geniş güvenlik marjı
 * - Kullanıcı alert'leri görmezden geliyorsa → risk toleransı ↑, eşikler daralır
 *
 * Matematik:
 *   critical_days(f) = lead_time(f) × (1 + z × cv(f)) × seasonal_peak × (2 - risk_tolerance(f))
 *   Bayesian risk_tolerance güncelleme: α × observed + (1-α) × prior
 */
import { db } from "../db";
import { tenantProfiles, alertInteractions } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import { logAudit } from "./audit";
import {
  // Default sabitler — ATE adapte edemezse fallback
  URGENCY_CRITICAL_DAYS, URGENCY_WARNING_DAYS, URGENCY_OK_DAYS,
  LINEAR_CRITICAL_DAYS, LINEAR_WARNING_DAYS, LINEAR_OK_DAYS,
  LEAD_TIME_DAYS, CAPACITY_CRITICAL_THRESHOLD,
  SEASONAL_SPIKE_RATIO, SEASONAL_RISK_DAYS,
  CASCADE_FAILURE_THRESHOLD, DEMAND_ANOMALY_RATIO,
  SERVICE_LEVEL_Z,
} from "./constants";
import { SEASONAL_INDICES } from "./seasonal-constants";

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export interface AdaptiveThresholds {
  // Aciliyet eşikleri (gün)
  urgencyCriticalDays: number;
  urgencyWarningDays: number;
  urgencyOkDays: number;
  linearCriticalDays: number;
  linearWarningDays: number;
  linearOkDays: number;
  // Operasyonel eşikler
  leadTimeDays: number;
  capacityCriticalThreshold: number;
  seasonalSpikeRatio: number;
  seasonalRiskDays: number;
  cascadeFailureThreshold: number;
  demandAnomalyRatio: number;
}

export interface TenantFingerprint {
  tenantId: string;
  companyName: string;
  avgLeadTimeDays: number;
  leadTimeStdDev: number;
  demandVolatility: number;   // CV = σ/μ
  seasonalAmplitude: number;  // max_index / min_index
  riskTolerance: number;      // 0 = temkinli, 1 = risk sever
  alertResponseRate: number;  // alert'lere tepki oranı
  avgDecisionTimeMin: number;
  thresholds: AdaptiveThresholds;
  lastUpdated: Date | null;
}

// ══════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ══════════════════════════════════════════════════════════

const thresholdCache = new Map<string, AdaptiveThresholds>();
const DEFAULT_TENANT = "cukurova";

// Behavior learning rate
const BEHAVIOR_ALPHA = 0.15; // Yavaş öğrenme — ani davranış değişikliklerine aşırı tepki verme

// ══════════════════════════════════════════════════════════
// CORE: EŞİK HESAPLAMA
// ══════════════════════════════════════════════════════════

/**
 * Adaptif eşikleri hesapla — matematiksel model:
 *
 * Base formula:
 *   critical_days = lead_time × safety_factor × seasonal_factor × risk_factor
 *
 * Safety factor = 1 + Z × CV(demand)
 *   Z = service level z-score (1.65 for 95%)
 *   CV = demand coefficient of variation (σ/μ)
 *
 * Seasonal factor = sqrt(seasonal_amplitude)
 *   Yüksek mevsimsellik → daha geniş buffer
 *
 * Risk factor = 2 - risk_tolerance
 *   Temkinli firma (0.0) → 2.0x buffer
 *   Risk sever firma (1.0) → 1.0x buffer (minimum)
 */
export function computeAdaptiveThresholds(
  leadTimeDays: number,
  leadTimeStdDev: number,
  demandVolatility: number,
  seasonalAmplitude: number,
  riskTolerance: number,
): AdaptiveThresholds {
  // Safety factor: talep belirsizliği ne kadar yüksekse buffer o kadar geniş
  const safetyFactor = 1 + SERVICE_LEVEL_Z * demandVolatility;

  // Seasonal factor: mevsimsel dalgalanma yüksekse buffer genişlet
  const seasonalFactor = Math.sqrt(Math.max(1, seasonalAmplitude));

  // Risk factor: temkinli firma → geniş buffer, risk sever → dar buffer
  const riskFactor = 2 - Math.max(0, Math.min(1, riskTolerance));

  // Lead time uncertainty: tedarik süresi std sapması
  const leadTimeUncertainty = leadTimeDays + SERVICE_LEVEL_Z * leadTimeStdDev;

  // ── Aciliyet eşikleri ──
  // Kritik = tedarik süresi + belirsizlik tamponu (minimum: asla lead time'ın altında olmasın)
  const criticalBase = leadTimeUncertainty * safetyFactor * seasonalFactor * riskFactor;
  const urgencyCriticalDays = Math.round(Math.max(criticalBase, leadTimeDays * 2));

  // Warning = kritik × 2 (daha erken uyarı)
  const urgencyWarningDays = Math.round(urgencyCriticalDays * 2);

  // OK = warning × 2
  const urgencyOkDays = Math.round(urgencyWarningDays * 2);

  // ── Lineer eşikler (kısa vadeli, gün bazlı) ──
  // Lineer kritik: tedarik süresinin yarısı (minimum 3 gün)
  const linearCriticalDays = Math.round(Math.max(3, leadTimeDays * 0.5 * riskFactor));

  // Lineer warning: tedarik süresi × 1.5
  const linearWarningDays = Math.round(Math.max(linearCriticalDays * 2, leadTimeDays * 1.5 * riskFactor));

  // Lineer OK: tedarik süresi × 4
  const linearOkDays = Math.round(Math.max(linearWarningDays * 2, leadTimeDays * 4 * riskFactor));

  // ── Operasyonel eşikler ──
  // Kapasite kritik: risk toleransına göre 5-15 arası
  const capacityCriticalThreshold = Math.round(
    CAPACITY_CRITICAL_THRESHOLD * riskFactor * safetyFactor * 0.5
  );

  // Seasonal spike: volatilite yüksekse daha hassas tetikleme
  const seasonalSpikeRatio = Math.max(1.1,
    SEASONAL_SPIKE_RATIO - (demandVolatility * 0.2) // Volatil talep → daha düşük spike eşiği
  );

  // Seasonal risk days: kritik eşiğin üçte biri (minimum 30)
  const seasonalRiskDays = Math.round(Math.max(30, urgencyCriticalDays / 3));

  // Cascade failure: risk toleransı yüksekse daha fazla bileşen tolere et
  const cascadeFailureThreshold = Math.max(2, Math.round(
    CASCADE_FAILURE_THRESHOLD + (riskTolerance * 2) // Risk sever → 3→5 arası
  ));

  // Demand anomaly: volatilite yüksekse daha toleranslı
  const demandAnomalyRatio = Math.max(1.2,
    DEMAND_ANOMALY_RATIO + (demandVolatility * 0.3) // Volatil → 1.5→1.8 arası
  );

  return {
    urgencyCriticalDays,
    urgencyWarningDays,
    urgencyOkDays,
    linearCriticalDays,
    linearWarningDays,
    linearOkDays,
    leadTimeDays: Math.round(leadTimeUncertainty),
    capacityCriticalThreshold: Math.max(5, capacityCriticalThreshold),
    seasonalSpikeRatio: Math.round(seasonalSpikeRatio * 100) / 100,
    seasonalRiskDays,
    cascadeFailureThreshold,
    demandAnomalyRatio: Math.round(demandAnomalyRatio * 100) / 100,
  };
}

// ══════════════════════════════════════════════════════════
// CORE: EŞİK GETİRME (tüm sistem bunu çağırır)
// ══════════════════════════════════════════════════════════

/** Firmanın adaptif eşiklerini getir — cache'den veya hesapla */
export async function getThresholds(tenantId: string = DEFAULT_TENANT): Promise<AdaptiveThresholds> {
  // 1. Cache kontrol
  const cached = thresholdCache.get(tenantId);
  if (cached) return cached;

  // 2. DB'den profil çek
  try {
    const [profile] = await db.select().from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, tenantId))
      .limit(1);

    if (profile) {
      // Cache'deki adaptiveThresholds varsa direkt kullan
      if (profile.adaptiveThresholds) {
        const t = profile.adaptiveThresholds as AdaptiveThresholds;
        thresholdCache.set(tenantId, t);
        return t;
      }

      // Yoksa hesapla
      const thresholds = computeAdaptiveThresholds(
        Number(profile.avgLeadTimeDays),
        Number(profile.leadTimeStdDev),
        Number(profile.demandVolatility),
        Number(profile.seasonalAmplitude),
        Number(profile.riskTolerance),
      );

      // Cache'le ve DB'ye yaz
      thresholdCache.set(tenantId, thresholds);
      db.update(tenantProfiles).set({
        adaptiveThresholds: thresholds,
        lastThresholdCalc: new Date(),
        updatedAt: new Date(),
      }).where(eq(tenantProfiles.tenantId, tenantId))
        .catch(err => console.error("[ATE] Threshold persist error:", err));

      return thresholds;
    }
  } catch (err) {
    console.error("[ATE] Profile fetch error:", err);
  }

  // 3. Fallback: varsayılan sabitler
  return getDefaultThresholds();
}

/** Varsayılan eşikler — constants.ts'deki orijinal değerler */
export function getDefaultThresholds(): AdaptiveThresholds {
  return {
    urgencyCriticalDays: URGENCY_CRITICAL_DAYS,
    urgencyWarningDays: URGENCY_WARNING_DAYS,
    urgencyOkDays: URGENCY_OK_DAYS,
    linearCriticalDays: LINEAR_CRITICAL_DAYS,
    linearWarningDays: LINEAR_WARNING_DAYS,
    linearOkDays: LINEAR_OK_DAYS,
    leadTimeDays: LEAD_TIME_DAYS,
    capacityCriticalThreshold: CAPACITY_CRITICAL_THRESHOLD,
    seasonalSpikeRatio: SEASONAL_SPIKE_RATIO,
    seasonalRiskDays: SEASONAL_RISK_DAYS,
    cascadeFailureThreshold: CASCADE_FAILURE_THRESHOLD,
    demandAnomalyRatio: DEMAND_ANOMALY_RATIO,
  };
}

// ══════════════════════════════════════════════════════════
// DAVRANIŞ ÖĞRENME
// ══════════════════════════════════════════════════════════

/** Alert etkileşimini kaydet — kullanıcı ne yaptı? */
export function trackAlertInteraction(
  tenantId: string,
  alertId: string,
  alertType: string,
  alertSeverity: string,
  action: "seen" | "dismissed" | "acted" | "escalated",
  responseTimeMs?: number,
): void {
  db.insert(alertInteractions).values({
    tenantId,
    alertId,
    alertType,
    alertSeverity,
    action,
    responseTimeMs: responseTimeMs ?? null,
  }).catch(err => console.error("[ATE] Track interaction error:", err));
}

/**
 * Davranış analizi → risk toleransı güncelleme
 *
 * Bayesian update:
 *   risk_tolerance(t+1) = α × observed_behavior(t) + (1-α) × risk_tolerance(t)
 *
 * observed_behavior:
 *   - dismissed_rate yüksek → risk toleransı ↑ (uyarıları önemsemiyor)
 *   - acted_rate yüksek → risk toleransı ↓ (temkinli, her uyarıya tepki)
 *   - response_time uzun → risk toleransı ↑ (acele etmiyor)
 *   - escalated_rate yüksek → risk toleransı ↓ (çok hassas)
 */
export async function updateBehaviorProfile(tenantId: string = DEFAULT_TENANT): Promise<void> {
  try {
    // Son 30 gündeki etkileşimleri analiz et
    const stats = await db.select({
      total: sql<number>`COUNT(*)`,
      dismissed: sql<number>`COUNT(*) FILTER (WHERE ${alertInteractions.action} = 'dismissed')`,
      acted: sql<number>`COUNT(*) FILTER (WHERE ${alertInteractions.action} = 'acted')`,
      escalated: sql<number>`COUNT(*) FILTER (WHERE ${alertInteractions.action} = 'escalated')`,
      avgResponseMs: sql<number>`AVG(${alertInteractions.responseTimeMs})`,
    })
      .from(alertInteractions)
      .where(sql`${alertInteractions.tenantId} = ${tenantId} AND ${alertInteractions.createdAt} > NOW() - INTERVAL '30 days'`);

    const s = stats[0];
    const total = Number(s.total);
    if (total < 5) return; // Minimum 5 etkileşim gerekli

    const dismissedRate = Number(s.dismissed) / total;
    const actedRate = Number(s.acted) / total;
    const escalatedRate = Number(s.escalated) / total;
    const avgResponseMin = (Number(s.avgResponseMs) || 60000) / 60000;

    // Observed behavior: 0 = çok temkinli, 1 = çok risk sever
    // dismissed ↑ → risk sever, acted ↑ → temkinli, escalated ↑ → çok temkinli
    const observedBehavior = Math.max(0, Math.min(1,
      0.5 + (dismissedRate * 0.4) - (actedRate * 0.3) - (escalatedRate * 0.5)
      + Math.min(0.15, (avgResponseMin - 30) / 200) // Yavaş tepki → biraz daha risk sever
    ));

    // Mevcut profili çek
    const [profile] = await db.select().from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, tenantId))
      .limit(1);

    if (!profile) return;

    const oldRiskTolerance = Number(profile.riskTolerance);
    const oldAlertResponseRate = Number(profile.alertResponseRate);

    // Bayesian güncelleme
    const newRiskTolerance = BEHAVIOR_ALPHA * observedBehavior + (1 - BEHAVIOR_ALPHA) * oldRiskTolerance;
    const newAlertResponseRate = BEHAVIOR_ALPHA * actedRate + (1 - BEHAVIOR_ALPHA) * oldAlertResponseRate;

    // Clamp
    const clampedRisk = Math.max(0.05, Math.min(0.95, newRiskTolerance));
    const clampedResponse = Math.max(0.0, Math.min(1.0, newAlertResponseRate));

    // Yeni eşikleri hesapla
    const newThresholds = computeAdaptiveThresholds(
      Number(profile.avgLeadTimeDays),
      Number(profile.leadTimeStdDev),
      Number(profile.demandVolatility),
      Number(profile.seasonalAmplitude),
      clampedRisk,
    );

    // DB güncelle
    await db.update(tenantProfiles).set({
      riskTolerance: String(clampedRisk),
      alertResponseRate: String(clampedResponse),
      avgDecisionTimeMin: String(Math.round(avgResponseMin)),
      adaptiveThresholds: newThresholds,
      lastBehaviorUpdate: new Date(),
      lastThresholdCalc: new Date(),
      updatedAt: new Date(),
    }).where(eq(tenantProfiles.tenantId, tenantId));

    // Cache güncelle
    thresholdCache.set(tenantId, newThresholds);

    // Audit log
    if (Math.abs(clampedRisk - oldRiskTolerance) > 0.02) {
      logAudit({
        entity: "tenant_profile",
        entityId: tenantId,
        action: "update",
        field: "risk_tolerance",
        previousValue: oldRiskTolerance,
        newValue: clampedRisk,
        reason: `Davranış analizi: dismissed=${(dismissedRate * 100).toFixed(0)}%, acted=${(actedRate * 100).toFixed(0)}%, response=${avgResponseMin.toFixed(0)}dk`,
        actor: "ate_engine",
        metadata: { observedBehavior, total, dismissedRate, actedRate, escalatedRate },
      });
    }

    console.log(`[ATE] Behavior updated for ${tenantId}: risk ${oldRiskTolerance.toFixed(2)} → ${clampedRisk.toFixed(2)}`);
  } catch (err) {
    console.error("[ATE] Behavior update error:", err);
  }
}

// ══════════════════════════════════════════════════════════
// SEASONAL AMPLITUDE HESAPLAMA
// ══════════════════════════════════════════════════════════

/** Mevsimsel genlik hesapla — max_index / min_index (>0 olan) */
export function computeSeasonalAmplitude(): number {
  const nonZero = SEASONAL_INDICES.filter(i => i > 0.01);
  if (nonZero.length < 2) return 1;
  return Math.max(...nonZero) / Math.min(...nonZero);
}

// ══════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════

/** Firma profili + adaptif eşikler + karşılaştırma */
export async function getTenantFingerprint(tenantId: string = DEFAULT_TENANT): Promise<TenantFingerprint | null> {
  const [profile] = await db.select().from(tenantProfiles)
    .where(eq(tenantProfiles.tenantId, tenantId))
    .limit(1);

  if (!profile) return null;

  const thresholds = await getThresholds(tenantId);

  return {
    tenantId: profile.tenantId,
    companyName: profile.companyName,
    avgLeadTimeDays: Number(profile.avgLeadTimeDays),
    leadTimeStdDev: Number(profile.leadTimeStdDev),
    demandVolatility: Number(profile.demandVolatility),
    seasonalAmplitude: Number(profile.seasonalAmplitude),
    riskTolerance: Number(profile.riskTolerance),
    alertResponseRate: Number(profile.alertResponseRate),
    avgDecisionTimeMin: Number(profile.avgDecisionTimeMin),
    thresholds,
    lastUpdated: profile.lastBehaviorUpdate,
  };
}

/** Cache'i temizle — profil güncellendiğinde çağrılır */
export function invalidateCache(tenantId: string): void {
  thresholdCache.delete(tenantId);
}

/** Sunucu başlangıcında default tenant'ın seasonal amplitude'unu hesapla ve kaydet */
export async function initATE(): Promise<void> {
  try {
    const amplitude = computeSeasonalAmplitude();
    const [profile] = await db.select().from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, DEFAULT_TENANT))
      .limit(1);

    if (profile) {
      await db.update(tenantProfiles).set({
        seasonalAmplitude: String(Math.round(amplitude * 100) / 100),
      }).where(eq(tenantProfiles.tenantId, DEFAULT_TENANT));

      // İlk eşik hesaplamasını yap ve cache'le
      const thresholds = computeAdaptiveThresholds(
        Number(profile.avgLeadTimeDays),
        Number(profile.leadTimeStdDev),
        Number(profile.demandVolatility),
        amplitude,
        Number(profile.riskTolerance),
      );

      await db.update(tenantProfiles).set({
        adaptiveThresholds: thresholds,
        lastThresholdCalc: new Date(),
      }).where(eq(tenantProfiles.tenantId, DEFAULT_TENANT));

      thresholdCache.set(DEFAULT_TENANT, thresholds);
      console.log(`[ATE] Initialized: amplitude=${amplitude.toFixed(2)}, critical=${thresholds.urgencyCriticalDays}d, warning=${thresholds.urgencyWarningDays}d`);
    }
  } catch (err) {
    console.error("[ATE] Init error:", err);
  }
}
