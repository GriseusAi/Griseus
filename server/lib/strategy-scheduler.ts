/**
 * Strategy Scheduler — "Tepkime Denklemi" core engine.
 *
 * Cihazlar (sipariş + miktar + teslim) flask'a sürüklenir; bu motor 2 senaryo döndürür:
 *   S1 — Naive priority (insan aklı: en erken teslim → seri üret)
 *   S2 — Optimal parallel (paylaşılan bileşen kısıtı + tedarik penceresi farkındalığı)
 *
 * Saf hesap; DB'yi router okur, sonuçları input olarak verir. Test edilebilir, mutation yok.
 */

import type { BomItem } from "@shared/schema";

export interface DeviceRequest {
  sku: string;
  qty: number;
  deadline: string; // ISO yyyy-mm-dd
  productionDaysPerUnit?: number;
  color?: string;
}

export interface SupplyOrder {
  componentCode: string;
  qty: number;
  leadDays: number;
}

export interface SchedulerInput {
  devices: DeviceRequest[];
  supplyOrders?: SupplyOrder[];
  startDate?: string; // ISO
  horizonDays?: number;
}

export interface DeviceContext {
  sku: string;
  inWarehouse: number;
  bom: Array<{ code: string; requiredPerUnit: number; tier: number; parentCode: string | null }>;
}

export interface ComponentContext {
  code: string;
  currentStock: number;
}

export interface SchedulerCtx {
  devices: DeviceContext[];
  components: ComponentContext[];
}

export interface GanttSegment {
  sku: string;
  label: string;
  startDay: number;
  endDay: number;
  qty: number;
  color?: string;
  blocked?: boolean;
  note?: string;
}

export interface SupplySegment {
  code: string;
  qty: number;
  startDay: number;
  endDay: number;
}

export interface DeviceOutcome {
  sku: string;
  requested: number;
  fromStock: number;
  toProduce: number;
  finishesDay: number;
  deadlineDay: number;
  ontime: boolean;
  daysLate: number;
}

export interface Scenario {
  id: "S1" | "S2";
  label: string;
  rationale: string;
  segments: GanttSegment[];
  supplySegments: SupplySegment[];
  outcomes: DeviceOutcome[];
  ontime: boolean;
  worstLateDays: number;
}

export interface SchedulerResult {
  startDate: string;
  horizonDays: number;
  scenarios: [Scenario, Scenario];
  sharedComponents: string[];
  warnings: string[];
}

const DEFAULT_PROD_DAYS_PER_UNIT: Record<string, number> = {
  GSA15: 0.3,
  GSA20: 0.3,
  GSA30: 0.35,
  GSS20P: 0.2,
  GSS40P: 0.25,
  "ELT.5-7": 0.25,
  "ELT.7-11": 0.3,
};

const FALLBACK_PROD_DAYS = 0.3;

const dayDiff = (start: Date, target: Date) =>
  Math.round((target.getTime() - start.getTime()) / 86400000);

const prodDaysPerUnit = (sku: string, override?: number) =>
  override ?? DEFAULT_PROD_DAYS_PER_UNIT[sku] ?? FALLBACK_PROD_DAYS;

/* ──────────────────────────────────────────────────────────────────────────
   Helper: aggregate component demand across all devices' net production
   ────────────────────────────────────────────────────────────────────────── */
function totalComponentDemand(
  devices: DeviceRequest[],
  ctx: SchedulerCtx
): Record<string, number> {
  const demand: Record<string, number> = {};
  for (const d of devices) {
    const dev = ctx.devices.find((x) => x.sku === d.sku);
    if (!dev) continue;
    const toProduce = Math.max(0, d.qty - dev.inWarehouse);
    if (toProduce <= 0) continue;
    const tier1 = dev.bom.filter((b) => !b.parentCode);
    for (const c of tier1) {
      demand[c.code] = (demand[c.code] ?? 0) + toProduce * c.requiredPerUnit;
    }
  }
  return demand;
}

function findSharedComponents(ctx: SchedulerCtx): string[] {
  const codeSku: Record<string, Set<string>> = {};
  for (const d of ctx.devices) {
    for (const b of d.bom.filter((x) => !x.parentCode)) {
      (codeSku[b.code] ??= new Set()).add(d.sku);
    }
  }
  return Object.entries(codeSku)
    .filter(([, set]) => set.size >= 2)
    .map(([code]) => code);
}

/* ──────────────────────────────────────────────────────────────────────────
   Compute "how many of this device can run BEFORE supply lands"
   given currently allocated component pool.
   ────────────────────────────────────────────────────────────────────────── */
function maxDeviceFromStock(
  device: DeviceRequest,
  ctx: SchedulerCtx,
  available: Record<string, number>
): number {
  const dev = ctx.devices.find((x) => x.sku === device.sku);
  if (!dev) return 0;
  const tier1 = dev.bom.filter((b) => !b.parentCode);
  if (tier1.length === 0) return Infinity;
  let cap = Infinity;
  for (const c of tier1) {
    if (c.requiredPerUnit <= 0) continue;
    const stk = available[c.code] ?? 0;
    cap = Math.min(cap, Math.floor(stk / c.requiredPerUnit));
  }
  return cap === Infinity ? 0 : Math.max(0, cap);
}

function consumeStock(
  device: DeviceRequest,
  units: number,
  ctx: SchedulerCtx,
  available: Record<string, number>
) {
  const dev = ctx.devices.find((x) => x.sku === device.sku);
  if (!dev) return;
  const tier1 = dev.bom.filter((b) => !b.parentCode);
  for (const c of tier1) {
    available[c.code] = (available[c.code] ?? 0) - units * c.requiredPerUnit;
  }
}

function applySupply(
  supply: SupplyOrder[],
  available: Record<string, number>
) {
  for (const s of supply) {
    available[s.componentCode] = (available[s.componentCode] ?? 0) + s.qty;
  }
}

function maxSupplyLeadDays(supply: SupplyOrder[]): number {
  return supply.reduce((m, s) => Math.max(m, s.leadDays), 0);
}

/* ──────────────────────────────────────────────────────────────────────────
   S1 — Naive: sort by deadline asc, produce sequentially.
   When stock dries up, halt until supply lands, then continue.
   ────────────────────────────────────────────────────────────────────────── */
function buildS1(
  input: SchedulerInput,
  ctx: SchedulerCtx,
  startDate: Date
): Scenario {
  const sorted = [...input.devices].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  );
  const supply = input.supplyOrders ?? [];
  const supplyArrival = maxSupplyLeadDays(supply);

  const stock: Record<string, number> = {};
  for (const c of ctx.components) stock[c.code] = c.currentStock;

  const segments: GanttSegment[] = [];
  const outcomes: DeviceOutcome[] = [];
  let cursor = 0;
  let supplyApplied = false;

  for (const d of sorted) {
    const dev = ctx.devices.find((x) => x.sku === d.sku);
    const inWh = dev?.inWarehouse ?? 0;
    const fromStock = Math.min(d.qty, inWh);
    let need = d.qty - fromStock;
    const rate = prodDaysPerUnit(d.sku, d.productionDaysPerUnit);
    let producedSoFar = 0;
    const deadlineDay = dayDiff(startDate, new Date(d.deadline));

    while (need > 0) {
      const cap = maxDeviceFromStock(d, ctx, stock);
      if (cap === 0) {
        // wait for supply
        if (!supplyApplied && supplyArrival > 0) {
          cursor = Math.max(cursor, supplyArrival);
          applySupply(supply, stock);
          supplyApplied = true;
          continue;
        }
        // no relief possible — bail with blocked tail
        segments.push({
          sku: d.sku,
          label: `${d.sku} ×${need} (BEKLEME)`,
          startDay: cursor,
          endDay: cursor,
          qty: need,
          color: d.color,
          blocked: true,
          note: "tedarik gelmediği için sıkışık",
        });
        producedSoFar += need; // best-effort virtual finish to compute lateness
        cursor += need * rate;
        need = 0;
        break;
      }
      const batch = Math.min(cap, need);
      const start = cursor;
      const dur = batch * rate;
      consumeStock(d, batch, ctx, stock);
      segments.push({
        sku: d.sku,
        label: `${d.sku} ×${batch}`,
        startDay: start,
        endDay: start + dur,
        qty: batch,
        color: d.color,
      });
      cursor = start + dur;
      producedSoFar += batch;
      need -= batch;
    }

    const finishesDay = cursor;
    const ontime = finishesDay <= deadlineDay;
    outcomes.push({
      sku: d.sku,
      requested: d.qty,
      fromStock,
      toProduce: d.qty - fromStock,
      finishesDay,
      deadlineDay,
      ontime,
      daysLate: ontime ? 0 : finishesDay - deadlineDay,
    });
  }

  const supplySegments: SupplySegment[] = supply.map((s) => ({
    code: s.componentCode,
    qty: s.qty,
    startDay: 0,
    endDay: s.leadDays,
  }));

  const worstLate = outcomes.reduce((m, o) => Math.max(m, o.daysLate), 0);

  return {
    id: "S1",
    label: "Öncelikli (sıralı)",
    rationale:
      "Cihazlar teslim tarihine göre sıralanır, biri tamamlanmadan diğeri başlamaz. " +
      "Paylaşılan bileşen darboğazı ortaya çıkınca üretim durur, tedarik penceresi paralelleştirilemez.",
    segments,
    supplySegments,
    outcomes,
    ontime: worstLate === 0,
    worstLateDays: worstLate,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   S2 — Optimal: paylaşılan bileşen havuzunu paralel kullan,
   tedarik gecikmesini "boş zaman" olarak değil "ön üretim" olarak gör.
   Strateji:
     1. En kısa teslim tarihli cihaza yetecek kadar bileşen ayır → paralel başlat.
     2. Kalan bileşenle ikinci cihazı paralel başlat.
     3. Bileşen biter bitmez tedarik gelene kadar üretim sürer (paralel slotlarda).
     4. Tedarik gelince geriye kalan üretim devam eder.
   ────────────────────────────────────────────────────────────────────────── */
function buildS2(
  input: SchedulerInput,
  ctx: SchedulerCtx,
  startDate: Date
): Scenario {
  const supply = input.supplyOrders ?? [];
  const supplyArrival = maxSupplyLeadDays(supply);

  const stock: Record<string, number> = {};
  for (const c of ctx.components) stock[c.code] = c.currentStock;

  const segments: GanttSegment[] = [];
  const outcomes: DeviceOutcome[] = [];

  // 1) Devices sorted by deadline (urgent first), get first dibs on stock
  const ordered = [...input.devices].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  );

  // Per-device runtime cursor (paralel slotlar — her cihaz kendi timeline'ında)
  const deviceCursor: Record<string, number> = {};

  // PHASE A: give the most-urgent device exactly what it needs (or what stock allows)
  // PHASE B: with leftovers, start lower-priority devices in parallel
  // PHASE C: when supply lands, resume any device that ran out
  const devicePending: Record<string, number> = {};
  const deviceFromStock: Record<string, number> = {};

  for (const d of ordered) {
    const dev = ctx.devices.find((x) => x.sku === d.sku);
    const inWh = dev?.inWarehouse ?? 0;
    const fromStock = Math.min(d.qty, inWh);
    deviceFromStock[d.sku] = fromStock;
    devicePending[d.sku] = d.qty - fromStock;
    deviceCursor[d.sku] = 0;
  }

  // Phase A: most-urgent gets enough for full need (capped by stock)
  const urgent = ordered[0];
  if (urgent && devicePending[urgent.sku] > 0) {
    const want = devicePending[urgent.sku];
    const cap = maxDeviceFromStock(urgent, ctx, stock);
    const take = Math.min(want, cap);
    if (take > 0) {
      const rate = prodDaysPerUnit(urgent.sku, urgent.productionDaysPerUnit);
      consumeStock(urgent, take, ctx, stock);
      segments.push({
        sku: urgent.sku,
        label: `${urgent.sku} ×${take}`,
        startDay: 0,
        endDay: take * rate,
        qty: take,
        color: urgent.color,
      });
      deviceCursor[urgent.sku] = take * rate;
      devicePending[urgent.sku] -= take;
    }
  }

  // Phase B: remaining devices use leftover stock in parallel from day 0
  for (let i = 1; i < ordered.length; i++) {
    const d = ordered[i];
    if (devicePending[d.sku] <= 0) continue;
    const cap = maxDeviceFromStock(d, ctx, stock);
    if (cap <= 0) continue;
    const take = Math.min(devicePending[d.sku], cap);
    const rate = prodDaysPerUnit(d.sku, d.productionDaysPerUnit);
    consumeStock(d, take, ctx, stock);
    segments.push({
      sku: d.sku,
      label: `${d.sku} ×${take}`,
      startDay: 0,
      endDay: take * rate,
      qty: take,
      color: d.color,
    });
    deviceCursor[d.sku] = take * rate;
    devicePending[d.sku] -= take;
  }

  // Phase C: apply supply if any pending and supply exists
  const anyPending = Object.values(devicePending).some((v) => v > 0);
  if (anyPending && supplyArrival > 0) {
    applySupply(supply, stock);
    // After supply lands at day = supplyArrival, resume each pending device
    // sorted by deadline (urgent first gets stock priority again).
    for (const d of ordered) {
      let need = devicePending[d.sku];
      if (need <= 0) continue;
      const rate = prodDaysPerUnit(d.sku, d.productionDaysPerUnit);
      // resume start = max(deviceCursor, supplyArrival)
      let cursor = Math.max(deviceCursor[d.sku], supplyArrival);
      while (need > 0) {
        const cap = maxDeviceFromStock(d, ctx, stock);
        if (cap <= 0) {
          segments.push({
            sku: d.sku,
            label: `${d.sku} ×${need} (BEKLEME)`,
            startDay: cursor,
            endDay: cursor,
            qty: need,
            color: d.color,
            blocked: true,
            note: "ek tedarik gerekli",
          });
          cursor += need * rate;
          need = 0;
          break;
        }
        const take = Math.min(cap, need);
        consumeStock(d, take, ctx, stock);
        segments.push({
          sku: d.sku,
          label: `${d.sku} ×${take}`,
          startDay: cursor,
          endDay: cursor + take * rate,
          qty: take,
          color: d.color,
        });
        cursor += take * rate;
        need -= take;
      }
      deviceCursor[d.sku] = cursor;
      devicePending[d.sku] = 0;
    }
  }

  // Outcomes
  for (const d of ordered) {
    const finishesDay = deviceCursor[d.sku];
    const deadlineDay = dayDiff(startDate, new Date(d.deadline));
    const ontime = finishesDay <= deadlineDay;
    outcomes.push({
      sku: d.sku,
      requested: d.qty,
      fromStock: deviceFromStock[d.sku],
      toProduce: d.qty - deviceFromStock[d.sku],
      finishesDay,
      deadlineDay,
      ontime,
      daysLate: ontime ? 0 : finishesDay - deadlineDay,
    });
  }

  const supplySegments: SupplySegment[] = supply.map((s) => ({
    code: s.componentCode,
    qty: s.qty,
    startDay: 0,
    endDay: s.leadDays,
  }));

  const worstLate = outcomes.reduce((m, o) => Math.max(m, o.daysLate), 0);

  return {
    id: "S2",
    label: "AI-paralel (üst-üste bindirme)",
    rationale:
      "Mevcut paylaşılan bileşen havuzu en acil cihaza yetecek kadar ayrılır, kalanı " +
      "düşük-öncelikli cihazları paralel başlatır. Tedarik penceresi (max lead) ön " +
      "üretime fon olur — tedarik geldiğinde geri kalan üretim akıcı şekilde devam eder.",
    segments,
    supplySegments,
    outcomes,
    ontime: worstLate === 0,
    worstLateDays: worstLate,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Public entry
   ────────────────────────────────────────────────────────────────────────── */
export function generateScenarios(
  input: SchedulerInput,
  ctx: SchedulerCtx
): SchedulerResult {
  const startDate = input.startDate ? new Date(input.startDate) : new Date();
  const horizonDays = input.horizonDays ?? 60;

  const warnings: string[] = [];
  for (const d of input.devices) {
    if (!ctx.devices.find((x) => x.sku === d.sku)) {
      warnings.push(`${d.sku} için BOM/stok bulunamadı — varsayılan üretim oranı kullanılıyor.`);
    }
  }

  // Auto-suggest supply if no orders provided AND demand exceeds stock
  let supplyOrders = input.supplyOrders ?? [];
  if (supplyOrders.length === 0) {
    const demand = totalComponentDemand(input.devices, ctx);
    for (const [code, need] of Object.entries(demand)) {
      const have = ctx.components.find((c) => c.code === code)?.currentStock ?? 0;
      const shortage = need - have;
      if (shortage > 0) {
        supplyOrders = [
          ...supplyOrders,
          { componentCode: code, qty: Math.ceil(shortage * 1.5), leadDays: 15 },
        ];
        warnings.push(
          `${code} eksik (${shortage}). Otomatik öneri: ×${Math.ceil(shortage * 1.5)} sipariş, 15g tedarik.`
        );
      }
    }
  }

  const fullInput: SchedulerInput = { ...input, supplyOrders };

  const sharedComponents = findSharedComponents(ctx);
  const s1 = buildS1(fullInput, ctx, startDate);
  const s2 = buildS2(fullInput, ctx, startDate);

  return {
    startDate: startDate.toISOString().slice(0, 10),
    horizonDays,
    scenarios: [s1, s2],
    sharedComponents,
    warnings,
  };
}

// Re-export type for unused import lint hygiene (BomItem type may not be referenced directly)
export type { BomItem };
