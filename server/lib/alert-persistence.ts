/**
 * Alert Persistence Layer — Continuous Validation Pipeline
 * Uyarıları DB'ye kaydeder, sorgular ve doğrulama metrikleri hesaplar.
 */
import { db } from "../db";
import { validationAlerts } from "@shared/schema";
import { eq, desc, and, sql, count } from "drizzle-orm";
import type { ProactiveAlert } from "../rules-engine";

/** Uyarıları DB'ye yaz (fire-and-forget) */
export async function persistAlerts(alerts: ProactiveAlert[]): Promise<void> {
  if (alerts.length === 0) return;

  const values = alerts.map(a => ({
    alertId: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    message: a.message,
    rootCause: a.rootCause ?? null,
    componentCode: a.componentCode ?? null,
    productSku: a.productSku ?? null,
    suggestedAction: a.suggestedAction ?? null,
  }));

  await db.insert(validationAlerts).values(values);
}

/** Filtrelenmiş uyarı listesi */
export async function getValidationAlerts(filters?: {
  type?: string;
  severity?: string;
  validated?: boolean;
  limit?: number;
}) {
  const conditions = [];
  if (filters?.type) conditions.push(eq(validationAlerts.type, filters.type));
  if (filters?.severity) conditions.push(eq(validationAlerts.severity, filters.severity));
  if (filters?.validated !== undefined) conditions.push(eq(validationAlerts.validated, filters.validated));

  const query = db.select().from(validationAlerts);
  const rows = await (conditions.length > 0
    ? query.where(and(...conditions))
    : query
  )
    .orderBy(desc(validationAlerts.createdAt))
    .limit(filters?.limit ?? 50);

  return rows;
}

/** Uyarı doğrulama durumunu güncelle */
export async function updateAlertValidation(
  id: number,
  data: { validated: boolean; validationNote?: string; outcome?: string }
) {
  const [updated] = await db.update(validationAlerts)
    .set({
      validated: data.validated,
      validationNote: data.validationNote ?? null,
      outcome: data.outcome ?? null,
      resolvedAt: new Date(),
    })
    .where(eq(validationAlerts.id, id))
    .returning();

  return updated;
}

/** Validation metrikleri hesapla */
export async function getValidationMetrics() {
  // Tip bazlı dağılım
  const byType = await db.select({
    type: validationAlerts.type,
    count: count(),
  })
    .from(validationAlerts)
    .groupBy(validationAlerts.type);

  // Severity bazlı dağılım
  const bySeverity = await db.select({
    severity: validationAlerts.severity,
    count: count(),
  })
    .from(validationAlerts)
    .groupBy(validationAlerts.severity);

  // Toplam ve doğrulama durumu
  const [totals] = await db.select({
    total: count(),
    validated: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.validated} = true)`,
    truePositive: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.outcome} = 'true_positive')`,
    falsePositive: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.outcome} = 'false_positive')`,
  }).from(validationAlerts);

  // Precision hesapla
  const validatedCount = Number(totals.truePositive) + Number(totals.falsePositive);
  const precision = validatedCount > 0
    ? Number(totals.truePositive) / validatedCount
    : null;

  // Son 24 saat, 7 gün, 30 gün
  const [recent] = await db.select({
    last24h: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.createdAt} > NOW() - INTERVAL '24 hours')`,
    last7d: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.createdAt} > NOW() - INTERVAL '7 days')`,
    last30d: sql<number>`COUNT(*) FILTER (WHERE ${validationAlerts.createdAt} > NOW() - INTERVAL '30 days')`,
  }).from(validationAlerts);

  return {
    total: Number(totals.total),
    validated: Number(totals.validated),
    unvalidated: Number(totals.total) - Number(totals.validated),
    precision,
    truePositives: Number(totals.truePositive),
    falsePositives: Number(totals.falsePositive),
    byType: byType.map(r => ({ type: r.type, count: Number(r.count) })),
    bySeverity: bySeverity.map(r => ({ severity: r.severity, count: Number(r.count) })),
    last24h: Number(recent.last24h),
    last7d: Number(recent.last7d),
    last30d: Number(recent.last30d),
  };
}
