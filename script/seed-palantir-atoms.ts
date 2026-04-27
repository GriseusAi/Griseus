/**
 * Seed Palantir-Level Operational Atoms — FAZ 0 (2026-04-27)
 *
 * Registers 16 ObjectType + 6 LinkType in ontology registry tables.
 * Seeds 1 example operational chain (Çukurova Ankara Plant → Line 1 → ...)
 * for canvas demo + simulation pipeline testing.
 *
 * Hybrid approach: simulated seed; replace with real Çukurova data when available.
 *
 * Usage: npx tsx script/seed-palantir-atoms.ts
 */
import { db } from "../server/db";
import {
  ontologyObjectTypes, ontologyLinkTypes,
  plants, workCenters, machines, operators,
  shifts, batches, productionRuns, downtimeEpisodes,
  scrapReasons, qualityEvents,
  suppliers, supplierLots,
  opportunities, workOrders,
  energyMeters, energyReadings,
  productionLines, products,
} from "@shared/schema";
import { eq } from "drizzle-orm";

const ATOM_OBJECT_TYPES = [
  { id: "plant", displayName: "Plant", displayNameTr: "Tesis", icon: "▣",
    backingTable: "plants", primaryKeyField: "id", titleField: "name",
    description: "Üretim fabrikası", ontologyAxis: null,
    properties: { code: { type: "string", displayName: "Code" }, name: { type: "string", displayName: "Name" }, city: { type: "string", displayName: "City" } } },
  { id: "line", displayName: "Line", displayNameTr: "Hat", icon: "═",
    backingTable: "production_lines", primaryKeyField: "id", titleField: "name",
    description: "Üretim hattı", ontologyAxis: null,
    properties: { name: { type: "string", displayName: "Name" }, type: { type: "string", displayName: "Type" } } },
  { id: "work_center", displayName: "WorkCenter", displayNameTr: "İstasyon", icon: "◫",
    backingTable: "work_centers", primaryKeyField: "id", titleField: "name",
    description: "Hat üzerinde iş istasyonu", ontologyAxis: null,
    properties: { code: { type: "string", displayName: "Code" }, name: { type: "string", displayName: "Name" } } },
  { id: "machine", displayName: "Machine", displayNameTr: "Makine", icon: "⚙",
    backingTable: "machines", primaryKeyField: "id", titleField: "name",
    description: "Makine ekipmanı", ontologyAxis: null,
    properties: { code: { type: "string", displayName: "Code" }, name: { type: "string", displayName: "Name" }, type: { type: "string", displayName: "Type" } } },
  { id: "operator", displayName: "Operator", displayNameTr: "Operatör", icon: "◐",
    backingTable: "operators", primaryKeyField: "id", titleField: "name",
    description: "Üretim personeli", ontologyAxis: null,
    properties: { employeeCode: { type: "string", displayName: "Code" }, name: { type: "string", displayName: "Name" }, skill: { type: "string", displayName: "Skill" } } },
  { id: "shift", displayName: "Shift", displayNameTr: "Vardiya", icon: "◷",
    backingTable: "shifts", primaryKeyField: "id", titleField: "shift_code",
    description: "Vardiya episode'u", ontologyAxis: "sure",
    properties: { shiftCode: { type: "string", displayName: "Code" }, startAt: { type: "date", displayName: "Start" } } },
  { id: "batch", displayName: "Batch", displayNameTr: "Parti", icon: "▦",
    backingTable: "batches", primaryKeyField: "id", titleField: "batch_code",
    description: "Üretim partisi", ontologyAxis: "miktar",
    properties: { batchCode: { type: "string", displayName: "Code" }, plannedQuantity: { type: "number", displayName: "Planned", unit: "adet" } } },
  { id: "production_run", displayName: "ProductionRun", displayNameTr: "Üretim Koşusu", icon: "▶",
    backingTable: "production_runs", primaryKeyField: "id", titleField: "id",
    description: "Batch'in makinada koştuğu zaman dilimi", ontologyAxis: "miktar",
    properties: { plannedOutput: { type: "number", displayName: "Planned" }, actualOutput: { type: "number", displayName: "Actual" }, scrapCount: { type: "number", displayName: "Scrap" } } },
  { id: "downtime_episode", displayName: "DowntimeEpisode", displayNameTr: "Duruş", icon: "⏸",
    backingTable: "downtime_episodes", primaryKeyField: "id", titleField: "category",
    description: "Makine duruş episode'u", ontologyAxis: "sure",
    properties: { durationMin: { type: "number", displayName: "Duration", unit: "dk" }, category: { type: "string", displayName: "Category" } } },
  { id: "scrap_reason", displayName: "ScrapReason", displayNameTr: "Hurda Sebebi", icon: "⊗",
    backingTable: "scrap_reasons", primaryKeyField: "id", titleField: "name",
    description: "Hurda sebep kataloğu", ontologyAxis: null,
    properties: { code: { type: "string", displayName: "Code" }, name: { type: "string", displayName: "Name" } } },
  { id: "quality_event", displayName: "QualityEvent", displayNameTr: "Kalite Olayı", icon: "✕",
    backingTable: "quality_events", primaryKeyField: "id", titleField: "event_type",
    description: "Kalite olayı kaydı", ontologyAxis: null,
    properties: { eventType: { type: "string", displayName: "Type" }, quantity: { type: "number", displayName: "Quantity" } } },
  { id: "supplier", displayName: "Supplier", displayNameTr: "Tedarikçi", icon: "◬",
    backingTable: "suppliers", primaryKeyField: "id", titleField: "name",
    description: "Bileşen tedarikçisi", ontologyAxis: null,
    properties: { code: { type: "string", displayName: "Code" }, name: { type: "string", displayName: "Name" }, averageLeadTimeDays: { type: "number", displayName: "Lead time", unit: "gün" } } },
  { id: "supplier_lot", displayName: "SupplierLot", displayNameTr: "Tedarikçi Lotu", icon: "◇",
    backingTable: "supplier_lots", primaryKeyField: "id", titleField: "lot_number",
    description: "Tedarikçi lotu", ontologyAxis: "miktar",
    properties: { lotNumber: { type: "string", displayName: "Lot" }, quantity: { type: "number", displayName: "Quantity" } } },
  { id: "opportunity", displayName: "Opportunity", displayNameTr: "Fırsat", icon: "✦",
    backingTable: "opportunities", primaryKeyField: "id", titleField: "title",
    description: "İyileştirme fırsatı (scenario'dan üretilen)", ontologyAxis: null,
    properties: { title: { type: "string", displayName: "Title" }, projectedValue: { type: "number", displayName: "Value", unit: "TL" }, status: { type: "string", displayName: "Status" } } },
  { id: "work_order", displayName: "WorkOrder", displayNameTr: "İş Emri", icon: "▤",
    backingTable: "work_orders", primaryKeyField: "id", titleField: "code",
    description: "İcra emri (opportunity'den türetilir)", ontologyAxis: null,
    properties: { code: { type: "string", displayName: "Code" }, type: { type: "string", displayName: "Type" }, status: { type: "string", displayName: "Status" } } },
  { id: "energy_meter", displayName: "EnergyMeter", displayNameTr: "Enerji Sayacı", icon: "◈",
    backingTable: "energy_meters", primaryKeyField: "id", titleField: "meter_type",
    description: "Enerji sayacı", ontologyAxis: null,
    properties: { meterType: { type: "string", displayName: "Type" }, unit: { type: "string", displayName: "Unit" }, lastReading: { type: "number", displayName: "Last reading" } } },
];

const ATOM_LINK_TYPES = [
  { id: "plant_hosts_line", displayName: "hostsLine", description: "Plant hosts production lines",
    sourceObjectType: "plant", targetObjectType: "line",
    joinType: "field_match", sourceField: "id", targetField: "facility_id", cardinality: "one_to_many" },
  { id: "run_runs_on_machine", displayName: "runsOn", description: "ProductionRun runs on Machine",
    sourceObjectType: "production_run", targetObjectType: "machine",
    joinType: "foreign_key", sourceField: "machine_id", targetField: "id", cardinality: "one_to_many" },
  { id: "shift_staffed_by_operator", displayName: "staffedBy", description: "Shift staffed by Operator",
    sourceObjectType: "shift", targetObjectType: "operator",
    joinType: "foreign_key", sourceField: "supervisor_id", targetField: "id", cardinality: "many_to_many" },
  { id: "quality_caused_by_reason", displayName: "causedBy", description: "QualityEvent caused by ScrapReason",
    sourceObjectType: "quality_event", targetObjectType: "scrap_reason",
    joinType: "foreign_key", sourceField: "scrap_reason_id", targetField: "id", cardinality: "one_to_many" },
  { id: "opportunity_derived_from_scenario", displayName: "derivedFrom", description: "Opportunity derived from Scenario",
    sourceObjectType: "opportunity", targetObjectType: "scenario",
    joinType: "foreign_key", sourceField: "scenario_id", targetField: "id", cardinality: "one_to_many" },
  { id: "opportunity_executed_as_workorder", displayName: "executedAs", description: "Opportunity executed as WorkOrder",
    sourceObjectType: "opportunity", targetObjectType: "work_order",
    joinType: "foreign_key", sourceField: "id", targetField: "opportunity_id", cardinality: "one_to_many" },
];

async function registerOntologyTypes() {
  console.log("\n[1/3] Registering ontology object types...");
  for (const ot of ATOM_OBJECT_TYPES) {
    await db.insert(ontologyObjectTypes).values({
      id: ot.id, displayName: ot.displayName, displayNameTr: ot.displayNameTr,
      icon: ot.icon, description: ot.description,
      backingTable: ot.backingTable, primaryKeyField: ot.primaryKeyField, titleField: ot.titleField,
      properties: ot.properties as any, ontologyAxis: ot.ontologyAxis ?? null,
    }).onConflictDoNothing();
  }
  console.log(`  ✓ ${ATOM_OBJECT_TYPES.length} object types registered`);

  console.log("\n[2/3] Registering ontology link types...");
  for (const lt of ATOM_LINK_TYPES) {
    await db.insert(ontologyLinkTypes).values({
      id: lt.id, displayName: lt.displayName, description: lt.description,
      sourceObjectType: lt.sourceObjectType, targetObjectType: lt.targetObjectType,
      joinType: lt.joinType, sourceField: lt.sourceField, targetField: lt.targetField,
      cardinality: lt.cardinality,
    }).onConflictDoNothing();
  }
  console.log(`  ✓ ${ATOM_LINK_TYPES.length} link types registered`);
}

async function seedExampleChain() {
  console.log("\n[3/3] Seeding example operational chain (Çukurova Ankara → Line 1 → GSS20P batch)...");

  const [plant] = await db.insert(plants).values({
    code: "CKR-ANK", name: "Çukurova Ankara", city: "Ankara", status: "active",
  }).onConflictDoNothing().returning();

  const lines = await db.select().from(productionLines).limit(1);
  const lineId = lines[0]?.id;
  if (!lineId) {
    console.log("  ⚠ No production line found, skipping chain seed");
    return;
  }

  const [wc] = await db.insert(workCenters).values({
    lineId, code: "WC-01", name: "Montaj İstasyonu 1", stationOrder: 1, capacityPerHour: "60",
  }).returning();

  const [machine] = await db.insert(machines).values({
    workCenterId: wc?.id, code: "MCH-001", name: "Pres 100T",
    type: "press", manufacturer: "Schuler", expectedCycleTimeSec: "45", status: "active",
  }).returning();

  const [operator] = await db.insert(operators).values({
    employeeCode: "OP-1001", name: "Mehmet Demir", primaryLineId: lineId, skill: "montaj_a", status: "active",
  }).returning();

  const now = new Date();
  const shiftStart = new Date(now); shiftStart.setHours(8, 0, 0, 0);
  const [shift] = await db.insert(shifts).values({
    lineId, shiftCode: "morning", startAt: shiftStart, supervisorId: operator?.id,
  }).returning();

  const products_ = await db.select().from(products).where(eq(products.sku, "GSS20P")).limit(1);
  const productId = products_[0]?.id;
  if (!productId) {
    console.log("  ⚠ GSS20P product not found, skipping batch seed");
    return;
  }

  const [batch] = await db.insert(batches).values({
    productId, batchCode: `B-${Date.now()}`, plannedQuantity: 100,
    status: "in_progress", scheduledStart: shiftStart,
  }).returning();

  const [run] = await db.insert(productionRuns).values({
    batchId: batch!.id, machineId: machine?.id, operatorId: operator?.id, shiftId: shift?.id,
    startAt: shiftStart, plannedOutput: 100, status: "running",
  }).returning();

  await db.insert(scrapReasons).values([
    { code: "MAT-01", name: "Hammadde hatası", category: "material" },
    { code: "MCH-01", name: "Makine ayarı", category: "machine" },
    { code: "OP-01", name: "Operatör hatası", category: "operator" },
    { code: "DSG-01", name: "Tasarım hatası", category: "design" },
  ]).onConflictDoNothing();

  await db.insert(energyMeters).values({
    machineId: machine?.id, lineId, meterType: "electricity", unit: "kWh",
  });

  console.log(`  ✓ Plant=${plant?.code} Line=${lineId} WC=${wc?.code} Machine=${machine?.code} Operator=${operator?.employeeCode} Shift=${shift?.id} Batch=${batch?.batchCode} Run=${run?.id}`);
}

(async () => {
  try {
    await registerOntologyTypes();
    await seedExampleChain();
    console.log("\n✓ FAZ 0 seed complete");
    process.exit(0);
  } catch (err) {
    console.error("✗ Seed failed:", err);
    process.exit(1);
  }
})();
