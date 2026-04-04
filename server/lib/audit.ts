/**
 * Data Lineage — Audit Log
 * Her veri değişikliğini kim/ne zaman/neden/eski→yeni olarak kaydeder.
 * Fire-and-forget: ana işlemi bloklamaz.
 */
import { db } from "../db";
import { auditLog } from "@shared/schema";

export interface AuditEntry {
  entity: string; // component_stock | stock_level | bom_item | purchase_suggestion | custom_rule
  entityId: string; // ilgili kaydın ID'si veya kodu
  action: string; // create | update | delete | import | undo
  field?: string; // değişen alan
  previousValue?: string | number | null;
  newValue?: string | number | null;
  reason?: string;
  actor?: string; // üretim_şefi | ceo_agent | rules_engine | import | system
  metadata?: Record<string, any>;
}

/** Tek bir audit kaydı oluştur */
export function logAudit(entry: AuditEntry): void {
  db.insert(auditLog).values({
    entity: entry.entity,
    entityId: String(entry.entityId),
    action: entry.action,
    field: entry.field ?? null,
    previousValue: entry.previousValue != null ? String(entry.previousValue) : null,
    newValue: entry.newValue != null ? String(entry.newValue) : null,
    reason: entry.reason ?? null,
    actor: entry.actor ?? "system",
    metadata: entry.metadata ?? null,
  }).catch(err => console.error("[audit] Log error:", err));
}

/** Birden fazla audit kaydı oluştur */
export function logAuditBatch(entries: AuditEntry[]): void {
  if (entries.length === 0) return;
  const values = entries.map(e => ({
    entity: e.entity,
    entityId: String(e.entityId),
    action: e.action,
    field: e.field ?? null,
    previousValue: e.previousValue != null ? String(e.previousValue) : null,
    newValue: e.newValue != null ? String(e.newValue) : null,
    reason: e.reason ?? null,
    actor: e.actor ?? "system",
    metadata: e.metadata ?? null,
  }));
  db.insert(auditLog).values(values).catch(err => console.error("[audit] Batch log error:", err));
}
