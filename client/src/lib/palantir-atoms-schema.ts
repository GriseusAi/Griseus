/**
 * Palantir-Level Operational Atoms — FAZ 0 (2026-04-27)
 *
 * Vertex pattern adapted to Çukurova manufacturing.
 * Reference: /Users/gurkanduruak/Desktop/GRISEUS_PALANTIR_PLAYBOOK.md
 *
 * 16 ObjectType + 6 LinkType. Visual schema only — backing tables defined in shared/schema.ts.
 * Existing Line uses productionLines, so 15 new ObjectTypes here.
 */

import type { ObjectTypeSpec, LinkTypeSpec } from "./bh-ontology-schema";
import { BH_OBJECT_TYPES, BH_LINK_TYPES } from "./bh-ontology-schema";

const ATOM = (apiName: string) => `griseus.ontology.object-type.${apiName}`;
const LINK = (apiName: string) => `griseus.ontology.link-type.${apiName}`;

export const PALANTIR_ATOM_OBJECT_TYPES: Record<string, ObjectTypeSpec> = {
  // --- Asset hierarchy ---
  Plant: {
    rid: ATOM("Plant"), apiName: "Plant", displayName: "Tesis", pluralDisplayName: "Tesisler",
    primaryKey: "code", titleProperty: "name", status: "EXPERIMENTAL",
    displayMetadata: { icon: "▣", color: "#0ea5e9", description: "Üretim fabrikası (örn: Çukurova Ankara)" },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "city", displayName: "Şehir", type: "String", visibility: "NORMAL" },
      { apiName: "status", displayName: "Durum", type: "Enum", enumValues: ["active", "idle", "maintenance"], visibility: "NORMAL" },
    ],
  },
  Line: {
    rid: ATOM("Line"), apiName: "Line", displayName: "Hat", pluralDisplayName: "Hatlar",
    primaryKey: "id", titleProperty: "name", status: "EXPERIMENTAL",
    displayMetadata: { icon: "═", color: "#06b6d4", description: "Üretim hattı (productionLines tablosu)" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "type", displayName: "Tip", type: "String", visibility: "NORMAL" },
      { apiName: "workerCount", displayName: "Operatör sayısı", type: "Integer", visibility: "NORMAL" },
      { apiName: "currentUnitTimeMin", displayName: "Mevcut cycle (dk)", type: "Double", unit: "dk", visibility: "PROMINENT" },
    ],
  },
  WorkCenter: {
    rid: ATOM("WorkCenter"), apiName: "WorkCenter", displayName: "İstasyon", pluralDisplayName: "İstasyonlar",
    primaryKey: "code", titleProperty: "name", status: "EXPERIMENTAL",
    displayMetadata: { icon: "◫", color: "#0891b2", description: "Hat üzerinde sıralı iş istasyonu" },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "stationOrder", displayName: "Sıra", type: "Integer", visibility: "NORMAL" },
      { apiName: "capacityPerHour", displayName: "Saatlik kapasite", type: "Double", unit: "AD/h", visibility: "PROMINENT" },
    ],
  },
  Machine: {
    rid: ATOM("Machine"), apiName: "Machine", displayName: "Makine", pluralDisplayName: "Makineler",
    primaryKey: "code", titleProperty: "name", status: "EXPERIMENTAL",
    displayMetadata: { icon: "⚙", color: "#0369a1", description: "İstasyona bağlı makine ekipmanı" },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "type", displayName: "Tip", type: "String", visibility: "NORMAL" },
      { apiName: "manufacturer", displayName: "Üretici", type: "String", visibility: "NORMAL" },
      { apiName: "expectedCycleTimeSec", displayName: "Beklenen cycle (sn)", type: "Double", unit: "sn", visibility: "PROMINENT" },
      { apiName: "status", displayName: "Durum", type: "Enum", enumValues: ["active", "down", "maintenance"], visibility: "PROMINENT" },
    ],
  },
  Operator: {
    rid: ATOM("Operator"), apiName: "Operator", displayName: "Operatör", pluralDisplayName: "Operatörler",
    primaryKey: "employeeCode", titleProperty: "name", status: "EXPERIMENTAL",
    displayMetadata: { icon: "◐", color: "#7c3aed", description: "Üretim personeli (operatör/şef)" },
    properties: [
      { apiName: "employeeCode", displayName: "Sicil", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "skill", displayName: "Yetkinlik", type: "String", visibility: "NORMAL" },
      { apiName: "status", displayName: "Durum", type: "Enum", enumValues: ["active", "leave", "training"], visibility: "NORMAL" },
    ],
  },

  // --- Time atoms ---
  Shift: {
    rid: ATOM("Shift"), apiName: "Shift", displayName: "Vardiya", pluralDisplayName: "Vardiyalar",
    primaryKey: "id", titleProperty: "shiftCode", status: "EXPERIMENTAL",
    displayMetadata: { icon: "◷", color: "#f59e0b", description: "Hat üzerinde vardiya episode'u" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "shiftCode", displayName: "Kod", type: "Enum", enumValues: ["morning", "afternoon", "night"], visibility: "PROMINENT" },
      { apiName: "startAt", displayName: "Başlangıç", type: "Timestamp", visibility: "PROMINENT" },
      { apiName: "endAt", displayName: "Bitiş", type: "Timestamp", visibility: "NORMAL" },
    ],
  },
  Batch: {
    rid: ATOM("Batch"), apiName: "Batch", displayName: "Parti", pluralDisplayName: "Partiler",
    primaryKey: "batchCode", titleProperty: "batchCode", status: "EXPERIMENTAL",
    displayMetadata: { icon: "▦", color: "#84cc16", description: "Aynı SKU için planlanmış üretim partisi" },
    properties: [
      { apiName: "batchCode", displayName: "Parti kodu", type: "String", visibility: "PROMINENT" },
      { apiName: "plannedQuantity", displayName: "Planlı miktar", type: "Integer", unit: "adet", visibility: "PROMINENT" },
      { apiName: "status", displayName: "Durum", type: "Enum", enumValues: ["planned", "in_progress", "completed", "cancelled"], visibility: "PROMINENT" },
      { apiName: "scheduledStart", displayName: "Plan başlangıç", type: "Timestamp", visibility: "NORMAL" },
      { apiName: "scheduledEnd", displayName: "Plan bitiş", type: "Timestamp", visibility: "NORMAL" },
    ],
  },
  ProductionRun: {
    rid: ATOM("ProductionRun"), apiName: "ProductionRun", displayName: "Üretim Koşusu", pluralDisplayName: "Üretim Koşuları",
    primaryKey: "id", titleProperty: "id", status: "EXPERIMENTAL",
    displayMetadata: { icon: "▶", color: "#10b981", description: "Bir batch'in makinada koştuğu zaman dilimi" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "startAt", displayName: "Başlangıç", type: "Timestamp", visibility: "PROMINENT" },
      { apiName: "endAt", displayName: "Bitiş", type: "Timestamp", visibility: "NORMAL" },
      { apiName: "plannedOutput", displayName: "Planlı çıktı", type: "Integer", unit: "adet", visibility: "PROMINENT" },
      { apiName: "actualOutput", displayName: "Gerçek çıktı", type: "Integer", unit: "adet", visibility: "PROMINENT" },
      { apiName: "scrapCount", displayName: "Hurda", type: "Integer", unit: "adet", visibility: "PROMINENT" },
      { apiName: "cycleTimeAvgSec", displayName: "Ortalama cycle (sn)", type: "Double", unit: "sn", visibility: "NORMAL" },
      { apiName: "status", displayName: "Durum", type: "Enum", enumValues: ["running", "completed", "aborted"], visibility: "PROMINENT" },
    ],
  },
  DowntimeEpisode: {
    rid: ATOM("DowntimeEpisode"), apiName: "DowntimeEpisode", displayName: "Duruş", pluralDisplayName: "Duruşlar",
    primaryKey: "id", titleProperty: "category", status: "EXPERIMENTAL",
    displayMetadata: { icon: "⏸", color: "#ef4444", description: "Makine duruş episode'u" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "startAt", displayName: "Başlangıç", type: "Timestamp", visibility: "PROMINENT" },
      { apiName: "endAt", displayName: "Bitiş", type: "Timestamp", visibility: "NORMAL" },
      { apiName: "durationMin", displayName: "Süre (dk)", type: "Double", unit: "dk", visibility: "PROMINENT" },
      { apiName: "category", displayName: "Kategori", type: "Enum",
        enumValues: ["breakdown", "changeover", "material_wait", "quality", "planned"], visibility: "PROMINENT" },
      { apiName: "reason", displayName: "Sebep", type: "String", visibility: "NORMAL" },
    ],
  },

  // --- Quality ---
  ScrapReason: {
    rid: ATOM("ScrapReason"), apiName: "ScrapReason", displayName: "Hurda Sebebi", pluralDisplayName: "Hurda Sebepleri",
    primaryKey: "code", titleProperty: "name", status: "EXPERIMENTAL",
    displayMetadata: { icon: "⊗", color: "#dc2626", description: "Hurda/iade sebep kataloğu" },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "category", displayName: "Kategori", type: "Enum",
        enumValues: ["material", "machine", "operator", "design"], visibility: "PROMINENT" },
    ],
  },
  QualityEvent: {
    rid: ATOM("QualityEvent"), apiName: "QualityEvent", displayName: "Kalite Olayı", pluralDisplayName: "Kalite Olayları",
    primaryKey: "id", titleProperty: "eventType", status: "EXPERIMENTAL",
    displayMetadata: { icon: "✕", color: "#b91c1c", description: "Hurda/rework/iade/inspection-fail kaydı" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "eventType", displayName: "Olay tipi", type: "Enum",
        enumValues: ["scrap", "rework", "warranty_return", "inspection_fail"], visibility: "PROMINENT" },
      { apiName: "quantity", displayName: "Adet", type: "Integer", unit: "adet", visibility: "PROMINENT" },
      { apiName: "detectedAt", displayName: "Tespit zamanı", type: "Timestamp", visibility: "NORMAL" },
      { apiName: "notes", displayName: "Not", type: "String", visibility: "NORMAL" },
    ],
  },

  // --- Supplier graph ---
  Supplier: {
    rid: ATOM("Supplier"), apiName: "Supplier", displayName: "Tedarikçi", pluralDisplayName: "Tedarikçiler",
    primaryKey: "code", titleProperty: "name", status: "EXPERIMENTAL",
    displayMetadata: { icon: "◬", color: "#9333ea", description: "Bileşen tedarikçisi" },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "name", displayName: "Ad", type: "String", visibility: "PROMINENT" },
      { apiName: "country", displayName: "Ülke", type: "String", visibility: "NORMAL" },
      { apiName: "averageLeadTimeDays", displayName: "Ortalama lead time", type: "Integer", unit: "gün", visibility: "PROMINENT" },
      { apiName: "qualityGrade", displayName: "Kalite notu", type: "Enum", enumValues: ["A", "B", "C"], visibility: "PROMINENT" },
    ],
  },
  SupplierLot: {
    rid: ATOM("SupplierLot"), apiName: "SupplierLot", displayName: "Tedarikçi Lotu", pluralDisplayName: "Tedarikçi Lotları",
    primaryKey: "lotNumber", titleProperty: "lotNumber", status: "EXPERIMENTAL",
    displayMetadata: { icon: "◇", color: "#a855f7", description: "Tedarikçiden gelen tek bir lot/parti" },
    properties: [
      { apiName: "lotNumber", displayName: "Lot no", type: "String", visibility: "PROMINENT" },
      { apiName: "componentCode", displayName: "Bileşen kodu", type: "String", visibility: "PROMINENT" },
      { apiName: "quantity", displayName: "Miktar", type: "Integer", unit: "adet", visibility: "PROMINENT" },
      { apiName: "qualityCheckResult", displayName: "Kalite", type: "Enum",
        enumValues: ["passed", "failed", "conditional"], visibility: "PROMINENT" },
      { apiName: "unitCost", displayName: "Birim maliyet", type: "Money", unit: "TL", visibility: "NORMAL" },
    ],
  },

  // --- Decision/execution chain ---
  Opportunity: {
    rid: ATOM("Opportunity"), apiName: "Opportunity", displayName: "Fırsat", pluralDisplayName: "Fırsatlar",
    primaryKey: "id", titleProperty: "title", status: "EXPERIMENTAL",
    displayMetadata: { icon: "✦", color: "#eab308", description: "Scenario'dan üretilen iyileştirme fırsatı" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "title", displayName: "Başlık", type: "String", visibility: "PROMINENT" },
      { apiName: "category", displayName: "Kategori", type: "Enum",
        enumValues: ["throughput", "scrap_reduction", "energy", "inventory", "quality"], visibility: "PROMINENT" },
      { apiName: "projectedValue", displayName: "Beklenen değer", type: "Money", unit: "TL", visibility: "PROMINENT" },
      { apiName: "priority", displayName: "Öncelik", type: "Enum",
        enumValues: ["low", "medium", "high", "critical"], visibility: "PROMINENT" },
      { apiName: "status", displayName: "Durum", type: "Enum",
        enumValues: ["identified", "approved", "in_progress", "completed", "verified", "rejected"], visibility: "PROMINENT" },
      { apiName: "deadline", displayName: "Termin", type: "Timestamp", visibility: "NORMAL" },
    ],
  },
  WorkOrder: {
    rid: ATOM("WorkOrder"), apiName: "WorkOrder", displayName: "İş Emri", pluralDisplayName: "İş Emirleri",
    primaryKey: "code", titleProperty: "code", status: "EXPERIMENTAL",
    displayMetadata: { icon: "▤", color: "#f97316", description: "Opportunity'den türetilen icra emri" },
    properties: [
      { apiName: "code", displayName: "Kod", type: "String", visibility: "PROMINENT" },
      { apiName: "type", displayName: "Tip", type: "Enum",
        enumValues: ["production", "maintenance", "purchase", "quality", "setup_change"], visibility: "PROMINENT" },
      { apiName: "description", displayName: "Açıklama", type: "String", visibility: "NORMAL" },
      { apiName: "dueDate", displayName: "Termin", type: "Timestamp", visibility: "PROMINENT" },
      { apiName: "status", displayName: "Durum", type: "Enum",
        enumValues: ["open", "in_progress", "completed", "cancelled", "verified"], visibility: "PROMINENT" },
      { apiName: "actualValue", displayName: "Gerçek değer", type: "Money", unit: "TL", visibility: "NORMAL" },
    ],
  },

  // --- Decision (FAZ 3) ---
  Decision: {
    rid: ATOM("Decision"), apiName: "Decision",
    displayName: "Decision", pluralDisplayName: "Decisions",
    primaryKey: "id", titleProperty: "title", status: "EXPERIMENTAL",
    displayMetadata: { icon: "◊", color: "#8b5cf6", description: "Yapılandırılmış karar kaydı: rationale + alternatives + predicted outcome" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "title", displayName: "Başlık", type: "String", visibility: "PROMINENT" },
      { apiName: "decisionType", displayName: "Tip", type: "Enum",
        enumValues: ["purchase", "production_change", "maintenance", "scrap_reduction", "scenario_apply", "manual"], visibility: "PROMINENT" },
      { apiName: "rationale", displayName: "Gerekçe", type: "String", visibility: "PROMINENT" },
      { apiName: "predictedValue", displayName: "Tahmini değer", type: "Money", unit: "TL", visibility: "PROMINENT" },
      { apiName: "confidence", displayName: "Güven", type: "Percentage", unit: "%", visibility: "NORMAL" },
      { apiName: "status", displayName: "Durum", type: "Enum",
        enumValues: ["proposed", "approved", "rejected", "expired", "superseded"], visibility: "PROMINENT" },
      { apiName: "outcomeStatus", displayName: "Sonuç", type: "Enum",
        enumValues: ["pending", "verified_correct", "verified_partial", "verified_wrong"], visibility: "PROMINENT" },
      { apiName: "actualValue", displayName: "Gerçek değer", type: "Money", unit: "TL", visibility: "NORMAL" },
      { apiName: "deadline", displayName: "Termin", type: "Timestamp", visibility: "NORMAL" },
    ],
  },

  // --- Digital Twin Health (FAZ 2) ---
  TwinHealthMetric: {
    rid: ATOM("TwinHealthMetric"), apiName: "TwinHealthMetric",
    displayName: "Twin Health Metric", pluralDisplayName: "Twin Health Metric'leri",
    primaryKey: "id", titleProperty: "metric", status: "EXPERIMENTAL",
    displayMetadata: { icon: "≈", color: "#14b8a6", description: "Planned vs actual variance — digital twin divergence" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "entityType", displayName: "Entity tipi", type: "Enum", enumValues: ["line", "machine", "product"], visibility: "PROMINENT" },
      { apiName: "entityId", displayName: "Entity ID", type: "String", visibility: "PROMINENT" },
      { apiName: "metric", displayName: "Metric", type: "Enum",
        enumValues: ["throughput", "scrap", "cycle_time", "energy", "stock_burn"], visibility: "PROMINENT" },
      { apiName: "plannedValue", displayName: "Planlanan", type: "Double", visibility: "PROMINENT" },
      { apiName: "actualValue", displayName: "Gerçek", type: "Double", visibility: "PROMINENT" },
      { apiName: "variancePercent", displayName: "Sapma %", type: "Percentage", unit: "%", visibility: "PROMINENT" },
      { apiName: "trend7d", displayName: "7-gün trend", type: "Percentage", unit: "%", visibility: "NORMAL" },
      { apiName: "trend30d", displayName: "30-gün trend", type: "Percentage", unit: "%", visibility: "NORMAL" },
      { apiName: "driftStatus", displayName: "Drift", type: "Enum",
        enumValues: ["ok", "warning", "critical"], visibility: "PROMINENT" },
      { apiName: "consecutiveDriftDays", displayName: "Üst üste gün", type: "Integer", unit: "gün", visibility: "NORMAL" },
    ],
  },
  DriftAlert: {
    rid: ATOM("DriftAlert"), apiName: "DriftAlert",
    displayName: "Drift Alarmı", pluralDisplayName: "Drift Alarmları",
    primaryKey: "id", titleProperty: "message", status: "EXPERIMENTAL",
    displayMetadata: { icon: "⟂", color: "#ef4444", description: "3+ gün üst üste >%15 sapma alarmı" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "severity", displayName: "Severity", type: "Enum",
        enumValues: ["warning", "critical"], visibility: "PROMINENT" },
      { apiName: "metric", displayName: "Metric", type: "String", visibility: "PROMINENT" },
      { apiName: "variancePercent", displayName: "Sapma %", type: "Percentage", unit: "%", visibility: "PROMINENT" },
      { apiName: "consecutiveDriftDays", displayName: "Üst üste gün", type: "Integer", visibility: "PROMINENT" },
      { apiName: "message", displayName: "Mesaj", type: "String", visibility: "NORMAL" },
      { apiName: "recommendedAction", displayName: "Önerilen aksiyon", type: "String", visibility: "NORMAL" },
      { apiName: "status", displayName: "Durum", type: "Enum",
        enumValues: ["open", "acknowledged", "resolved"], visibility: "PROMINENT" },
    ],
  },

  // --- Simulation pipeline (FAZ 1) ---
  SimulationPipelineRun: {
    rid: ATOM("SimulationPipelineRun"), apiName: "SimulationPipelineRun",
    displayName: "Pipeline Run", pluralDisplayName: "Pipeline Run'lar",
    primaryKey: "id", titleProperty: "id", status: "EXPERIMENTAL",
    displayMetadata: { icon: "⟿", color: "#3b82f6", description: "Vertex-style chained model run (DSE → Forecast → Plan → BOM → Gap → Impact → Outcome)" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "sku", displayName: "SKU", type: "String", visibility: "PROMINENT" },
      { apiName: "horizonMonths", displayName: "Ufuk", type: "Integer", unit: "ay", visibility: "PROMINENT" },
      { apiName: "mode", displayName: "Mod", type: "Enum", enumValues: ["simulation", "live"], visibility: "PROMINENT" },
      { apiName: "status", displayName: "Durum", type: "Enum",
        enumValues: ["running", "success", "partial", "failed"], visibility: "PROMINENT" },
      { apiName: "durationMs", displayName: "Süre (ms)", type: "Integer", visibility: "NORMAL" },
      { apiName: "startedAt", displayName: "Başlangıç", type: "Timestamp", visibility: "NORMAL" },
    ],
  },

  // --- Energy ---
  EnergyMeter: {
    rid: ATOM("EnergyMeter"), apiName: "EnergyMeter", displayName: "Enerji Sayacı", pluralDisplayName: "Enerji Sayaçları",
    primaryKey: "id", titleProperty: "meterType", status: "EXPERIMENTAL",
    displayMetadata: { icon: "◈", color: "#facc15", description: "Makine/hat seviyesi enerji sayacı" },
    properties: [
      { apiName: "id", displayName: "ID", type: "Integer", visibility: "PROMINENT" },
      { apiName: "meterType", displayName: "Sayaç tipi", type: "Enum",
        enumValues: ["electricity", "gas", "water", "compressed_air"], visibility: "PROMINENT" },
      { apiName: "unit", displayName: "Birim", type: "String", visibility: "NORMAL" },
      { apiName: "lastReading", displayName: "Son okuma", type: "Double", visibility: "PROMINENT" },
      { apiName: "lastReadingAt", displayName: "Okuma zamanı", type: "Timestamp", visibility: "NORMAL" },
    ],
  },
};

export const PALANTIR_ATOM_LINK_TYPES: Record<string, LinkTypeSpec> = {
  hostsLine: {
    rid: LINK("hostsLine"), apiName: "hostsLine", displayName: "Barındırır",
    sentence: "Tesis hatları barındırır",
    sideA: { apiName: "lines", displayName: "Hatlar", objectTypeApiName: "Plant", cardinality: "ONE_MANY" },
    sideB: { apiName: "plant", displayName: "Tesis", objectTypeApiName: "Line", cardinality: "ONE_ONE" },
  },
  runsOn: {
    rid: LINK("runsOn"), apiName: "runsOn", displayName: "Çalışır",
    sentence: "Üretim koşusu makinada çalışır",
    sideA: { apiName: "runs", displayName: "Koşular", objectTypeApiName: "Machine", cardinality: "ONE_MANY" },
    sideB: { apiName: "machine", displayName: "Makine", objectTypeApiName: "ProductionRun", cardinality: "ONE_ONE",
      foreignKeyPropertyApiName: "machineId" },
  },
  staffedBy: {
    rid: LINK("staffedBy"), apiName: "staffedBy", displayName: "Personellenir",
    sentence: "Vardiya operatörlerle personellenir",
    sideA: { apiName: "operators", displayName: "Operatörler", objectTypeApiName: "Shift", cardinality: "ONE_MANY" },
    sideB: { apiName: "shifts", displayName: "Vardiyalar", objectTypeApiName: "Operator", cardinality: "ONE_MANY" },
  },
  causedBy: {
    rid: LINK("causedBy"), apiName: "causedBy", displayName: "Sebebi",
    sentence: "Kalite olayının hurda sebebi",
    sideA: { apiName: "events", displayName: "Olaylar", objectTypeApiName: "ScrapReason", cardinality: "ONE_MANY" },
    sideB: { apiName: "reason", displayName: "Sebep", objectTypeApiName: "QualityEvent", cardinality: "ONE_ONE",
      foreignKeyPropertyApiName: "scrapReasonId" },
  },
  derivedFrom: {
    rid: LINK("derivedFrom"), apiName: "derivedFrom", displayName: "Türetilir",
    sentence: "Fırsat scenario'dan türetilir",
    sideA: { apiName: "opportunities", displayName: "Fırsatlar", objectTypeApiName: "Opportunity", cardinality: "ONE_MANY" },
    sideB: { apiName: "scenario", displayName: "Senaryo", objectTypeApiName: "Opportunity", cardinality: "ONE_ONE" },
  },
  executedAs: {
    rid: LINK("executedAs"), apiName: "executedAs", displayName: "İcra edilir",
    sentence: "Fırsat iş emri olarak icra edilir",
    sideA: { apiName: "workOrders", displayName: "İş emirleri", objectTypeApiName: "Opportunity", cardinality: "ONE_MANY" },
    sideB: { apiName: "opportunity", displayName: "Fırsat", objectTypeApiName: "WorkOrder", cardinality: "ONE_ONE",
      foreignKeyPropertyApiName: "opportunityId" },
  },
};

// Register atoms into BH ontology so canvas + ontologyMeta() pick them up
Object.assign(BH_OBJECT_TYPES, PALANTIR_ATOM_OBJECT_TYPES);
Object.assign(BH_LINK_TYPES, PALANTIR_ATOM_LINK_TYPES);
