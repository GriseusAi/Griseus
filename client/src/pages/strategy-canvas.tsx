import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";
import { useAgentPanel } from "@/App";
import { useSelection, type SelectedItem } from "@/lib/selection-context";

/* ════════════════════════════════════════════════════════════════════
   STRATEGY CANVAS v5 — Pure HTML + CSS transform (no SVG foreignObject)
   Tek pan-zoom wrapper · tüm atomlar uniform hareket eder · Safari-safe
   ──────────────────────────────────────────────────────────────────── */

const C = {
  bg: "#f8fafc",
  panelBg: "#0e0e14",
  panelEdge: "rgba(255,255,255,0.10)",
  cardBg: "#0a0a0e",
  cardBgAlt: "#15151c",
  cardInk: "#ffffff",
  cardSub: "#9a9aa8",
  ink: "#0a0a0e",
  mid: "#5a6072",
  dim: "#94a3b8",
  edge: "rgba(15,23,42,0.55)",
  edgeFaint: "rgba(15,23,42,0.20)",
  shortfall: "#ef4444",
  shortfallSoft: "rgba(239,68,68,0.18)",
  ok: "#10b981",
  okSoft: "rgba(16,185,129,0.16)",
  warn: "#f59e0b",
  warnSoft: "rgba(245,158,11,0.16)",
  accent: "#8b5cf6",
  accentSoft: "rgba(139,92,246,0.16)",
  info: "#38bdf8",
  infoSoft: "rgba(56,189,248,0.14)",
} as const;
const mono = "'Inter', system-ui, -apple-system, sans-serif";
const INTER_FEATS = "'cv11', 'ss01', 'cv02'";
const fmtTR = (n: number) => (isFinite(n) ? n.toLocaleString("tr-TR") : "—");
const MONTH_LABELS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const DEFAULT_LEAD_TIME_DAYS = 14;
const PRODUCTION_DAYS_PER_UNIT = 0.4;

const ALL_SKUS = [
  "ELT.7-11", "ELT.5-7",
  "GSS20P", "GSS40P",
  "GSA15", "GSA20", "GSA30",
  "BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV",
] as const;

interface Order {
  id: string; customer: string; deadline: string;
  sku: string; quantity: number; createdAt: number;
}
interface BomComponent {
  code: string; name: string; requiredPerUnit: number; unit: string;
  currentStock: number; rawStock?: number;
  maxProducts: number | null; status: string; tier: number;
  parentComponentCode: string | null;
  isSubAssembly?: boolean; hasChildren?: boolean;
  lastCountedAt?: string;
  children?: BomComponent[];
}
interface CapacityResp {
  product: string; maxProducible: number;
  bottlenecks: { code: string; name: string; maxProducts: number; reason?: string }[];
}
interface StockResp { product: string; components: BomComponent[]; }
type XY = { x: number; y: number };
type PositionOverrides = Record<string, Record<string, XY>>;

const ORDERS_KEY = "griseus_strategy_orders_v1";
const POS_KEY = "griseus_strategy_positions_v3";
const VIEW_KEY = "griseus_strategy_viewport_v2";
const EXPAND_KEY = "griseus_strategy_expanded_v1";

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

function monthSlots(start: Date, end: Date): { label: string; t: number }[] {
  const slots: { label: string; t: number }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    slots.push({ label: `${MONTH_LABELS[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`, t: cur.getTime() });
    cur.setMonth(cur.getMonth() + 1);
  }
  if (slots.length === 0) slots.push({ label: `${MONTH_LABELS[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`, t: start.getTime() });
  return slots;
}

/* ─────── Geometri ─────── */
const ORDER_W = 250, ORDER_H = 96;
const PRODUCT_W = 190, PRODUCT_H = 76;
const COMP_W = 200, COMP_H = 36;
const SUB_R = 28;
const PANEL_W = 440, PANEL_H = 620;

function defaultPositions(order: Order, components: BomComponent[], yOffset: number): Record<string, XY> {
  const top = components.filter(c => c.parentComponentCode === null);
  const subs = top.filter(c => c.isSubAssembly || c.hasChildren);
  const flats = top.filter(c => !(c.isSubAssembly || c.hasChildren));

  const TWO_COL_THRESHOLD = 16;
  const useTwoCol = flats.length > TWO_COL_THRESHOLD;
  const flatGap = Math.max(38, Math.min(46, useTwoCol ? 700 / Math.ceil(flats.length / 2) : 700 / Math.max(1, flats.length)));
  const flatColCount = useTwoCol ? 2 : 1;
  const flatRows = Math.ceil(flats.length / flatColCount);

  const ORDER_X = 60;
  const PRODUCT_X = 340;
  const SUB_X = 580;
  const COMP_X = 800;
  const COMP_X2 = COMP_X + COMP_W + 14;
  const PANEL_X = useTwoCol ? COMP_X2 + COMP_W + 70 : COMP_X + COMP_W + 60;

  const CENTER_Y = 320 + yOffset;
  const flatStartY = CENTER_Y - ((flatRows - 1) * flatGap) / 2;
  const subGap = 64;
  const subStartY = CENTER_Y - ((subs.length - 1) * subGap) / 2;

  const pos: Record<string, XY> = {
    [`order:${order.id}`]: { x: ORDER_X, y: CENTER_Y - ORDER_H / 2 },
    [`product:${order.id}`]: { x: PRODUCT_X, y: CENTER_Y - PRODUCT_H / 2 },
    [`panel:${order.id}`]: { x: PANEL_X, y: CENTER_Y - PANEL_H / 2 },
  };
  flats.forEach((c, i) => {
    const col = useTwoCol ? Math.floor(i / flatRows) : 0;
    const row = useTwoCol ? i % flatRows : i;
    const x = col === 0 ? COMP_X : COMP_X2;
    pos[`comp:${order.id}:${c.code}`] = { x, y: flatStartY + row * flatGap - COMP_H / 2 };
  });
  subs.forEach((c, i) => {
    pos[`sub:${order.id}:${c.code}`] = { x: SUB_X, y: subStartY + i * subGap - SUB_R };
  });
  return pos;
}

/* ════════════════════════════════════════════════════════════════════
   STRATEJI HESAPLAMA
   ──────────────────────────────────────────────────────────────────── */
type ActionItem =
  | { kind: "tedarik"; code: string; name: string; quantity: number; leadDays: number; rationale: string; impact: string }
  | { kind: "uret"; sku: string; quantity: number; daysNeeded: number; rationale: string; impact: string }
  | { kind: "oncelik"; code: string; sharedOrders: { id: string; customer: string; sku: string }[]; rationale: string; impact: string }
  | { kind: "uyari"; severity: "warn" | "critical"; message: string };

interface CrossImpact { code: string; orders: { id: string; customer: string; sku: string; quantity: number }[]; }

interface Strategy {
  capacityPct: number;
  riskScore: number;
  riskBand: "low" | "med" | "high";
  riskReasons: string[];
  confidencePct: number;
  confidenceNote: string;
  actions: ActionItem[];
  crossImpact: CrossImpact[];
  bottleneckCascade: { code: string; name: string; coveragePct: number; max: number }[];
  timeline: {
    todayT: number; deadlineT: number;
    procurementEndT: number; productionStartT: number; productionEndT: number;
    daysToDeadline: number;
  };
}

function computeStrategy(args: {
  order: Order;
  capacity?: CapacityResp;
  components: BomComponent[];
  enriched: (BomComponent & { needed: number; shortfall: number })[];
  allOrders: Order[];
  stockBySku: Record<string, StockResp>;
}): Strategy {
  const { order, capacity, components, enriched, allOrders, stockBySku } = args;
  const today = new Date();
  const deadline = order.deadline ? new Date(order.deadline) : new Date(Date.now() + 90 * 86400000);
  const todayT = today.getTime(); const deadlineT = deadline.getTime();
  const daysToDeadline = Math.max(0, daysBetween(today, deadline));

  const maxProd = capacity?.maxProducible ?? 0;
  const possible = Math.min(order.quantity, maxProd);
  const missing = Math.max(0, order.quantity - maxProd);
  const capacityPct = order.quantity > 0 ? Math.min(100, Math.round((possible / order.quantity) * 100)) : 0;

  const reasons: string[] = [];
  let risk = 0;
  const gapRatio = order.quantity > 0 ? missing / order.quantity : 0;
  risk += gapRatio * 40;
  if (gapRatio > 0.15) reasons.push(`%${Math.round(gapRatio * 100)} talep eksiği`);
  const leadDays = DEFAULT_LEAD_TIME_DAYS;
  const tightness = leadDays > 0 ? Math.max(0, 1 - daysToDeadline / (leadDays * 2)) : 0;
  risk += tightness * 35;
  if (daysToDeadline < leadDays) reasons.push(`teslime ${daysToDeadline} gün, tedarik ~${leadDays} gün`);
  else if (daysToDeadline < leadDays * 1.5) reasons.push(`teslime ${daysToDeadline} gün — sınırda`);
  const bn = capacity?.bottlenecks?.[0];
  if (bn && bn.maxProducts < order.quantity) {
    const sev = 1 - bn.maxProducts / Math.max(1, order.quantity);
    risk += sev * 25;
    reasons.push(`darboğaz ${bn.code} maks ${fmtTR(bn.maxProducts)}`);
  }
  risk = Math.max(0, Math.min(100, Math.round(risk)));
  const riskBand: "low" | "med" | "high" = risk >= 65 ? "high" : risk >= 30 ? "med" : "low";

  let conf = 90;
  let confNote = "tüm bileşen sayımları taze (≤7 gün)";
  if (components.length > 0) {
    const days = components.map(c => {
      if (!c.lastCountedAt) return 365;
      return daysBetween(new Date(c.lastCountedAt), today);
    });
    const avg = days.reduce((a, b) => a + b, 0) / days.length;
    const stale = days.filter(d => d > 14).length;
    conf = Math.round(Math.max(40, Math.min(98, 100 - avg * 1.2 - stale * 1.5)));
    if (stale > 0) confNote = `${stale} bileşen sayımı 14+ gün eski`;
    else if (avg > 7) confNote = `ortalama sayım ${Math.round(avg)} gün önce`;
  }

  const componentCodes = Array.from(new Set(enriched.filter(c => c.shortfall > 0).map(c => c.code)));
  const crossImpact: CrossImpact[] = [];
  for (const code of componentCodes) {
    const sharers: CrossImpact["orders"] = [];
    for (const o of allOrders) {
      if (o.id === order.id) continue;
      const otherStock = stockBySku[o.sku];
      if (!otherStock) continue;
      const has = otherStock.components.find(c => c.code === code);
      if (has) sharers.push({ id: o.id, customer: o.customer, sku: o.sku, quantity: o.quantity });
    }
    if (sharers.length > 0) crossImpact.push({ code, orders: sharers });
  }

  const actions: ActionItem[] = [];
  enriched
    .filter(c => c.shortfall > 0)
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 5)
    .forEach(c => {
      const cross = crossImpact.find(ci => ci.code === c.code);
      const rationale = cross
        ? `${order.customer} eksik · ${cross.orders.map(o => o.customer).join(", ")} siparişlerinde de kullanılıyor`
        : `mevcut stok ${fmtTR(c.currentStock)} — gerekli ${fmtTR(c.needed)}`;
      actions.push({
        kind: "tedarik",
        code: c.code, name: c.name,
        quantity: c.shortfall, leadDays,
        rationale,
        impact: `+${fmtTR(Math.floor(c.shortfall / Math.max(1, c.requiredPerUnit)))} mamul üretim hakkı`,
      });
    });
  if (possible > 0) {
    const days = Math.max(1, Math.ceil(possible * PRODUCTION_DAYS_PER_UNIT));
    actions.push({
      kind: "uret",
      sku: order.sku, quantity: possible, daysNeeded: days,
      rationale: missing > 0
        ? `${fmtTR(possible)} adet hemen üretilebilir; ${fmtTR(missing)} adet tedariğe bağlı`
        : `tüm talep mevcut stokla karşılanıyor`,
      impact: missing > 0 ? `kısmi teslim güvence altına alınır` : `tam teslim, ekstra eylem gerekmez`,
    });
  }
  for (const ci of crossImpact.slice(0, 3)) {
    actions.push({
      kind: "oncelik",
      code: ci.code,
      sharedOrders: ci.orders.map(o => ({ id: o.id, customer: o.customer, sku: o.sku })),
      rationale: `${ci.orders.length} sipariş bu bileşeni paylaşıyor — paylaşımlı stok bölünme stratejisi`,
      impact: `paylaşım önceliği belirlenmeli`,
    });
  }
  if (riskBand === "high") {
    actions.push({ kind: "uyari", severity: "critical", message: `Yüksek risk · ${reasons[0] ?? "deadline-stok dengesizliği"}` });
  } else if (riskBand === "med" && missing > 0) {
    actions.push({ kind: "uyari", severity: "warn", message: `Orta risk · ${reasons[0] ?? "yakın takip gerekli"}` });
  }

  const bottleneckCascade = (capacity?.bottlenecks ?? []).slice(0, 3).map(b => ({
    code: b.code, name: b.name, max: b.maxProducts,
    coveragePct: order.quantity > 0 ? Math.min(100, Math.round((b.maxProducts / order.quantity) * 100)) : 0,
  }));

  const procurementEndT = todayT + leadDays * 86400000;
  const productionStartT = missing > 0 ? procurementEndT : todayT;
  const productionEndT = productionStartT + Math.ceil(possible * PRODUCTION_DAYS_PER_UNIT) * 86400000;

  return {
    capacityPct, riskScore: risk, riskBand, riskReasons: reasons.slice(0, 3),
    confidencePct: conf, confidenceNote: confNote,
    actions, crossImpact, bottleneckCascade,
    timeline: { todayT, deadlineT, procurementEndT, productionStartT, productionEndT, daysToDeadline },
  };
}

/* ════════════════════════════════════════════════════════════════════
   STRATEJI PANEL — pure HTML, no foreignObject, no absolute positioning
   ──────────────────────────────────────────────────────────────────── */
type Lens = "overview" | "actions" | "whatif" | "cross" | "time" | "ask";
type ActionStatus = "pending" | "approved" | "skipped";

function StrategyPanel({ s, order, loading, enriched }: {
  s: Strategy; order: Order; loading: boolean;
  enriched: (BomComponent & { needed: number; shortfall: number })[];
}) {
  const [lens, setLens] = useState<Lens>("overview");
  const riskColor = s.riskBand === "high" ? C.shortfall : s.riskBand === "med" ? C.warn : C.ok;
  const riskLabel = s.riskBand === "high" ? "YÜKSEK" : s.riskBand === "med" ? "ORTA" : "DÜŞÜK";

  const lenses: { k: Lens; label: string }[] = [
    { k: "overview", label: "Genel" },
    { k: "actions", label: "Aksiyon" },
    { k: "whatif", label: "Ne-Eğer" },
    { k: "cross", label: "Çapraz" },
    { k: "time", label: "Zaman" },
    { k: "ask", label: "AI Sor" },
  ];

  return (
    <div style={{
      width: "100%", height: "100%", boxSizing: "border-box",
      background: C.panelBg, border: `1px solid ${C.panelEdge}`, borderRadius: 14,
      padding: 16, fontFamily: mono, color: C.cardInk,
      boxShadow: "0 12px 36px rgba(0,0,0,0.55)",
      overflow: "hidden", display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1.8, fontWeight: 600 }}>◇ STRATEJİ</div>
        <div style={{ fontSize: 9, color: C.cardSub }} title={s.confidenceNote}>güven %{s.confidencePct}</div>
      </div>

      {/* Lens tabs */}
      <div onPointerDown={(e) => e.stopPropagation()} style={{
        display: "flex", flexWrap: "wrap", gap: 4, flexShrink: 0,
        padding: 3, background: "rgba(255,255,255,0.04)", borderRadius: 8,
      }}>
        {lenses.map(l => (
          <button key={l.k} onClick={() => setLens(l.k)} style={{
            flex: 1, minWidth: 50, padding: "5px 8px", borderRadius: 5,
            background: lens === l.k ? C.accent : "transparent",
            border: "none", color: lens === l.k ? "#fff" : C.cardSub,
            fontFamily: mono, fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
            cursor: "pointer", transition: "all 0.15s",
          }}>{l.label}</button>
        ))}
      </div>

      {/* Capacity + risk header (visible across all lenses) */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{
            width: `${s.capacityPct}%`, height: "100%",
            background: s.capacityPct >= 100 ? C.ok : s.capacityPct >= 60 ? C.info : s.capacityPct >= 30 ? C.warn : C.shortfall,
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11 }}>
          <div>
            <b>%{s.capacityPct}</b> karşılanıyor
            <span style={{ color: C.cardSub }}> · </span>
            <span style={{ color: riskColor, fontWeight: 600 }}>risk {riskLabel}</span>
          </div>
          <div style={{ color: C.cardSub }}>{s.timeline.daysToDeadline} gün</div>
        </div>
      </div>

      {/* Lens content */}
      <div onPointerDown={(e) => e.stopPropagation()} style={{
        flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10,
        paddingRight: 4, marginRight: -4,
      }}>
        {lens === "overview" && <OverviewLens s={s} order={order} />}
        {lens === "actions" && <ActionsLens s={s} order={order} loading={loading} />}
        {lens === "whatif" && <WhatIfLens order={order} enriched={enriched} baselineCapacity={s.capacityPct} />}
        {lens === "cross" && <CrossLens s={s} />}
        {lens === "time" && <TimeLens s={s} order={order} />}
        {lens === "ask" && <AskLens order={order} s={s} enriched={enriched} />}
      </div>
    </div>
  );
}

function OverviewLens({ s, order }: { s: Strategy; order: Order }) {
  const possible = Math.min(order.quantity, order.quantity - (order.quantity - Math.round(order.quantity * s.capacityPct / 100)));
  return (
    <>
      {s.riskReasons.length > 0 && (
        <Section title="RİSK GEREKÇESİ">
          <div style={{ fontSize: 10, color: C.cardSub, lineHeight: 1.5 }}>
            {s.riskReasons.join(" · ")}
          </div>
        </Section>
      )}
      <Section title="ÖZET">
        <KV k="Talep" v={`${fmtTR(order.quantity)} adet ${order.sku}`} />
        <KV k="Üretilebilir" v={`${fmtTR(possible)} adet`} />
        <KV k="Eksik" v={s.capacityPct >= 100 ? "yok" : `${fmtTR(order.quantity - possible)} adet`}
          color={s.capacityPct >= 100 ? C.ok : C.shortfall} />
        <KV k="Aksiyon sayısı" v={String(s.actions.length)} />
        <KV k="Çapraz etki" v={s.crossImpact.length > 0 ? `${s.crossImpact.length} bileşen` : "yok"} />
        <KV k="Bayi" v={order.customer || "—"} />
      </Section>
      {s.bottleneckCascade.length > 0 && (
        <Section title="DARBOĞAZ TOP 3">
          {s.bottleneckCascade.map(b => (
            <div key={b.code}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ fontWeight: 700 }}>{b.code}</span>
                <span style={{ color: C.cardSub }}>%{b.coveragePct}</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginTop: 2, overflow: "hidden" }}>
                <div style={{
                  width: `${b.coveragePct}%`, height: "100%",
                  background: b.coveragePct >= 100 ? C.ok : b.coveragePct >= 60 ? C.info : b.coveragePct >= 30 ? C.warn : C.shortfall,
                }} />
              </div>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function ActionsLens({ s, order, loading }: { s: Strategy; order: Order; loading: boolean }) {
  const key = `griseus_strategy_action_status_v1:${order.id}`;
  const [statuses, setStatuses] = useState<Record<number, ActionStatus>>(
    () => safeParse(localStorage.getItem(key), {} as Record<number, ActionStatus>),
  );
  useEffect(() => { localStorage.setItem(key, JSON.stringify(statuses)); }, [key, statuses]);
  const set = (i: number, st: ActionStatus) => setStatuses(p => ({ ...p, [i]: st }));

  if (loading) return <div style={{ fontSize: 11, color: C.cardSub }}>Hesaplanıyor…</div>;
  if (s.actions.length === 0) return <div style={{ fontSize: 11, color: C.cardSub }}>Aksiyon gerekmiyor — tüm talep karşılanıyor.</div>;

  return (
    <Section title={`KUYRUK · ${s.actions.length} aksiyon`}>
      {s.actions.map((a, i) => {
        const st = statuses[i] ?? "pending";
        return (
          <div key={i} style={{ opacity: st === "skipped" ? 0.5 : 1 }}>
            <ActionRow action={a} />
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button onClick={() => set(i, "approved")} style={btnSm(st === "approved" ? C.ok : "rgba(255,255,255,0.06)", st === "approved" ? "#fff" : C.cardSub)}>
                {st === "approved" ? "✓ onaylı" : "✓ onayla"}
              </button>
              <button onClick={() => set(i, "skipped")} style={btnSm(st === "skipped" ? C.shortfall : "rgba(255,255,255,0.06)", st === "skipped" ? "#fff" : C.cardSub)}>
                {st === "skipped" ? "✕ atlandı" : "✕ atla"}
              </button>
              <button onClick={() => set(i, "pending")} style={btnSm("rgba(255,255,255,0.06)", C.cardSub)}>↺</button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function WhatIfLens({ order, enriched, baselineCapacity }: {
  order: Order;
  enriched: (BomComponent & { needed: number; shortfall: number })[];
  baselineCapacity: number;
}) {
  const top = useMemo(() => [...enriched].sort((a, b) => b.shortfall - a.shortfall).slice(0, 6), [enriched]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const newCapacity = useMemo(() => {
    let minMax = order.quantity;
    for (const c of enriched) {
      const stock = overrides[c.code] ?? c.currentStock;
      const max = c.requiredPerUnit > 0 ? Math.floor(stock / c.requiredPerUnit) : 1e9;
      if (max < minMax) minMax = max;
    }
    return Math.min(100, Math.round((Math.min(order.quantity, minMax) / order.quantity) * 100));
  }, [enriched, overrides, order.quantity]);

  const delta = newCapacity - baselineCapacity;

  return (
    <>
      <Section title="STOKLAMA SİMÜLASYONU">
        <div style={{ fontSize: 11, lineHeight: 1.5 }}>
          Eksik bileşenler için stoğu kaydır → kapasite anında yeniden hesaplanır.
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}>
          <span>Yeni kapasite: <b>%{newCapacity}</b></span>
          <span style={{ color: delta > 0 ? C.ok : delta < 0 ? C.shortfall : C.cardSub, fontWeight: 700 }}>
            {delta > 0 ? `+${delta}` : delta} pp
          </span>
        </div>
      </Section>
      <Section title="BİLEŞEN STOKLARI">
        {top.map(c => {
          const cur = overrides[c.code] ?? c.currentStock;
          const max = Math.max(c.needed * 2, c.currentStock * 2 + 100);
          return (
            <div key={c.code}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ fontWeight: 700 }}>{c.code}</span>
                <span style={{ color: C.cardSub }}>
                  {fmtTR(cur)} / gerekli {fmtTR(c.needed)}
                </span>
              </div>
              <input type="range" min={0} max={max} step={Math.max(1, Math.round(max / 100))}
                value={cur}
                onChange={(e) => setOverrides(p => ({ ...p, [c.code]: parseInt(e.target.value) }))}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ width: "100%", marginTop: 4, accentColor: C.accent }} />
            </div>
          );
        })}
      </Section>
      {Object.keys(overrides).length > 0 && (
        <button onClick={() => setOverrides({})} style={btnSm("rgba(255,255,255,0.08)", C.cardInk)}>↺ baseline'a dön</button>
      )}
    </>
  );
}

function CrossLens({ s }: { s: Strategy }) {
  if (s.crossImpact.length === 0) {
    return <div style={{ fontSize: 11, color: C.cardSub }}>Bu sipariş başka açık siparişle bileşen paylaşmıyor.</div>;
  }
  return (
    <Section title="PAYLAŞIMLI BİLEŞENLER">
      {s.crossImpact.map(ci => (
        <div key={ci.code} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 10px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.shortfall }}>{ci.code}</div>
          <div style={{ fontSize: 10, color: C.cardSub, marginTop: 4, lineHeight: 1.5 }}>
            {ci.orders.length} sipariş bu bileşeni kullanıyor:
          </div>
          {ci.orders.map(o => (
            <div key={o.id} style={{
              fontSize: 10, color: C.cardInk, marginTop: 4, padding: "4px 8px",
              background: "rgba(255,255,255,0.04)", borderRadius: 4,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>{o.customer}</span>
              <span style={{ color: C.cardSub }}>{o.sku} · {fmtTR(o.quantity)} adet</span>
            </div>
          ))}
          <div style={{ fontSize: 9, color: C.accent, marginTop: 6 }}>
            → Önceliklendir: hangi siparişe öncelik veriyorsun?
          </div>
        </div>
      ))}
    </Section>
  );
}

function TimeLens({ s, order }: { s: Strategy; order: Order }) {
  const [plan, setPlan] = useState<"A" | "B" | "C">("A");
  const today = new Date();
  const deadline = order.deadline ? new Date(order.deadline) : new Date(Date.now() + 90 * 86400000);
  const months = monthSlots(today, deadline);
  const totalSpan = Math.max(1, deadline.getTime() - today.getTime());
  const tlW = PANEL_W - 32;
  const tToX = (t: number) => Math.max(0, Math.min(tlW, ((t - today.getTime()) / totalSpan) * tlW));
  const possible = Math.round(order.quantity * s.capacityPct / 100);
  const missing = order.quantity - possible;

  const plans = {
    A: {
      label: "Tedarik + Üret", color: C.ok,
      desc: `${fmtTR(missing)} eksik bileşen tedarik et, sonra ${fmtTR(order.quantity)} üret. Tam teslim, +14 gün hazırlık.`,
      procEndT: s.timeline.procurementEndT, prodStartT: s.timeline.productionStartT, prodEndT: s.timeline.productionEndT,
      kpis: [{ k: "Tamamlanma", v: "%100" }, { k: "Risk", v: "DÜŞÜK" }, { k: "Ek maliyet", v: "tedarik" }],
    },
    B: {
      label: "Geç Teslim — Ceza Riski", color: C.warn,
      desc: `Sadece ${fmtTR(possible)} üret, eksik kısmı deadline sonrası teslim et. Bayi ile yeniden müzakere.`,
      procEndT: today.getTime(), prodStartT: today.getTime(), prodEndT: today.getTime() + Math.ceil(possible * 0.4) * 86400000,
      kpis: [{ k: "Tamamlanma", v: `%${s.capacityPct}` }, { k: "Risk", v: "ORTA" }, { k: "Ek maliyet", v: "ceza" }],
    },
    C: {
      label: "Yarımamül Outsource", color: C.accent,
      desc: `Yarımamülleri dışarıdan hazır al. Üretim hızlanır, marj düşer ama deadline yetişir.`,
      procEndT: today.getTime() + 7 * 86400000,
      prodStartT: today.getTime() + 7 * 86400000,
      prodEndT: today.getTime() + 7 * 86400000 + Math.ceil(order.quantity * 0.25) * 86400000,
      kpis: [{ k: "Tamamlanma", v: "%100" }, { k: "Risk", v: "DÜŞÜK" }, { k: "Ek maliyet", v: "marj kaybı" }],
    },
  };
  const cur = plans[plan];

  return (
    <>
      <Section title="ALTERNATİF PLANLAR">
        <div style={{ display: "flex", gap: 4 }}>
          {(["A", "B", "C"] as const).map(p => (
            <button key={p} onClick={() => setPlan(p)} style={{
              flex: 1, padding: "6px 8px", borderRadius: 6,
              background: plan === p ? plans[p].color : "rgba(255,255,255,0.04)",
              border: "none", color: plan === p ? "#fff" : C.cardSub,
              fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: "pointer",
            }}>{p}: {plans[p].label.split(" ")[0]}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.cardInk, marginTop: 6, lineHeight: 1.5 }}>
          <b style={{ color: cur.color }}>Plan {plan}: {cur.label}</b>
        </div>
        <div style={{ fontSize: 10, color: C.cardSub, marginTop: 4, lineHeight: 1.5 }}>
          {cur.desc}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {cur.kpis.map(k => (
            <div key={k.k} style={{
              padding: "4px 8px", background: "rgba(255,255,255,0.04)",
              borderRadius: 4, fontSize: 9,
            }}>
              <span style={{ color: C.cardSub }}>{k.k}: </span>
              <b>{k.v}</b>
            </div>
          ))}
        </div>
      </Section>
      <Section title="ZAMAN ÇİZGİSİ">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          {months.map(m => <div key={m.t} style={{ fontSize: 9, color: C.cardSub }}>{m.label}</div>)}
        </div>
        <svg width={tlW} height={48} style={{ display: "block" }}>
          <rect x={0} y={6} width={tlW} height={36} rx={6} fill="rgba(255,255,255,0.04)" />
          <rect x={0} y={28} width={Math.max(0, tToX(cur.procEndT))} height={4} rx={2} fill={C.warn} />
          <rect x={tToX(cur.prodStartT)} y={14} width={Math.max(8, tToX(cur.prodEndT) - tToX(cur.prodStartT))} height={8} rx={4} fill={cur.color} />
          <line x1={tToX(s.timeline.deadlineT)} y1={6} x2={tToX(s.timeline.deadlineT)} y2={42} stroke={C.shortfall} strokeWidth={2} />
        </svg>
        <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 9, color: C.cardSub, flexWrap: "wrap" }}>
          <Legend dot={C.warn}>Tedarik</Legend>
          <Legend dot={cur.color}>Üretim</Legend>
          <Legend dot={C.shortfall}>Deadline</Legend>
        </div>
      </Section>
    </>
  );
}

function AskLens({ order, s, enriched }: {
  order: Order;
  s: Strategy;
  enriched: (BomComponent & { needed: number; shortfall: number })[];
}) {
  const { toggleAgent, setPrefillInput } = useAgentPanel();
  const shorts = enriched.filter(c => c.shortfall > 0).sort((a, b) => b.shortfall - a.shortfall).slice(0, 3);
  const ctx = `Sipariş: ${order.customer} için ${fmtTR(order.quantity)} adet ${order.sku} (deadline ${order.deadline}). Üretilebilir: %${s.capacityPct}, risk ${s.riskBand}. Eksik: ${shorts.map(c => `${c.code} (${fmtTR(c.shortfall)} adet)`).join(", ") || "yok"}.`;

  const presets = [
    "Bu siparişi nasıl tam teslim edebilirim?",
    "Hangi tedarikçiye öncelik vermeliyim?",
    "Bu eksiği başka bileşenle ikame edebilir miyim?",
    "Çapraz siparişlerde hangisini geciktirsem?",
    "Bu siparişin marjını nasıl korurum?",
  ];

  const ask = (q: string) => {
    setPrefillInput(`${q}\n\nBağlam: ${ctx}`);
    toggleAgent();
  };

  return (
    <>
      <Section title="AI'A SOR">
        <div style={{ fontSize: 10, color: C.cardSub, lineHeight: 1.5 }}>
          Bu siparişin context'i agent'a otomatik geçer. Hazır soru seç veya kendi sorunu yaz.
        </div>
      </Section>
      <Section title="HAZIR SORULAR">
        {presets.map(p => (
          <button key={p} onClick={() => ask(p)} style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.panelEdge}`,
            borderRadius: 6, padding: "8px 10px", fontSize: 11, color: C.cardInk,
            fontFamily: mono, cursor: "pointer", textAlign: "left",
          }}>{p}</button>
        ))}
      </Section>
      <button onClick={() => ask("")} style={{
        background: C.accent, border: "none", borderRadius: 6, padding: "9px 12px",
        fontSize: 11, color: "#fff", fontFamily: mono, fontWeight: 700, cursor: "pointer",
        marginTop: 4,
      }}>+ Kendi sorumu yaz (agent panel açılır)</button>
    </>
  );
}

function KV({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0" }}>
      <span style={{ color: C.cardSub }}>{k}</span>
      <span style={{ fontWeight: 600, color: color ?? C.cardInk }}>{v}</span>
    </div>
  );
}
const btnSm = (bg: string, color: string): React.CSSProperties => ({
  flex: 1, padding: "4px 8px", borderRadius: 5,
  background: bg, border: "none", color, fontFamily: mono, fontSize: 9,
  fontWeight: 600, cursor: "pointer", letterSpacing: 0.4,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: C.cardSub, letterSpacing: 1.4, fontWeight: 600,
        marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${C.panelEdge}`,
      }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function ActionRow({ action }: { action: ActionItem }) {
  let color: string = C.info, soft: string = C.infoSoft, label = "AKSİYON", body: React.ReactNode = null;
  switch (action.kind) {
    case "tedarik":
      color = C.shortfall; soft = C.shortfallSoft; label = "TEDARİK";
      body = (
        <>
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            {fmtTR(action.quantity)} adet <span style={{ color: C.cardSub }}>{action.code}</span>
            <span style={{ color: C.cardSub, fontWeight: 500, marginLeft: 6 }}>~{action.leadDays} gün</span>
          </div>
          <div style={{ fontSize: 10, color: C.cardSub, marginTop: 2, lineHeight: 1.4 }}>{action.rationale}</div>
          <div style={{ fontSize: 10, color: C.ok, marginTop: 2 }}>→ {action.impact}</div>
        </>
      );
      break;
    case "uret":
      color = C.ok; soft = C.okSoft; label = "ÜRETİM";
      body = (
        <>
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            {fmtTR(action.quantity)} adet <span style={{ color: C.cardSub }}>{action.sku}</span>
            <span style={{ color: C.cardSub, fontWeight: 500, marginLeft: 6 }}>~{action.daysNeeded} gün</span>
          </div>
          <div style={{ fontSize: 10, color: C.cardSub, marginTop: 2, lineHeight: 1.4 }}>{action.rationale}</div>
          <div style={{ fontSize: 10, color: C.info, marginTop: 2 }}>→ {action.impact}</div>
        </>
      );
      break;
    case "oncelik":
      color = C.accent; soft = C.accentSoft; label = "ÖNCELİKLENDİR";
      body = (
        <>
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: C.cardSub }}>{action.code}</span> · {action.sharedOrders.length} sipariş paylaşıyor
          </div>
          <div style={{ fontSize: 10, color: C.cardSub, marginTop: 2, lineHeight: 1.4 }}>
            {action.sharedOrders.map(o => `${o.customer} (${o.sku})`).join(" · ")}
          </div>
          <div style={{ fontSize: 10, color: C.accent, marginTop: 2 }}>→ {action.impact}</div>
        </>
      );
      break;
    case "uyari":
      color = action.severity === "critical" ? C.shortfall : C.warn;
      soft = action.severity === "critical" ? C.shortfallSoft : C.warnSoft;
      label = action.severity === "critical" ? "KRİTİK UYARI" : "UYARI";
      body = <div style={{ fontSize: 11, fontWeight: 600 }}>{action.message}</div>;
      break;
  }
  return (
    <div style={{ background: soft, borderLeft: `3px solid ${color}`, borderRadius: 6, padding: "6px 10px" }}>
      <div style={{ fontSize: 8, color, letterSpacing: 1.4, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      {body}
    </div>
  );
}

function Legend({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, display: "inline-block" }} />
      {children}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DRAGGABLE NODE — saf HTML div, absolute pozisyon, transform parent içinde
   ──────────────────────────────────────────────────────────────────── */
function DragNode({
  pos, width, height, onDrag, onTap, onMultiSelect, getMouseInWorld, children, style, asCircle,
}: {
  pos: XY;
  width: number;
  height: number;
  onDrag: (xy: XY) => void;
  onTap?: () => void;
  onMultiSelect?: () => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  children: React.ReactNode;
  style?: React.CSSProperties;
  asCircle?: boolean;
}) {
  const offsetRef = useRef<XY>({ x: 0, y: 0 });
  const downAtRef = useRef<{ x: number; y: number; t: number; shift: boolean } | null>(null);
  const movedRef = useRef(false);
  const handleDown = (e: React.PointerEvent) => {
    const isShift = e.shiftKey || e.metaKey || e.ctrlKey;
    e.stopPropagation();
    movedRef.current = false;
    if (!isShift) {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const w = getMouseInWorld(e);
      offsetRef.current = { x: w.x - pos.x, y: w.y - pos.y };
    }
    downAtRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), shift: isShift };
  };
  const handleMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    if (!downAtRef.current) return;
    if (downAtRef.current.shift) return;
    const w = getMouseInWorld(e);
    movedRef.current = true;
    onDrag({ x: w.x - offsetRef.current.x, y: w.y - offsetRef.current.y });
  };
  const handleUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    downAtRef.current = null;
  };
  // onClick: pointer events sonrası browser üretir; setPointerCapture ile çakışmaz
  const handleClick = (e: React.MouseEvent) => {
    if (movedRef.current) { movedRef.current = false; return; }
    e.stopPropagation();
    if ((e.shiftKey || e.metaKey || e.ctrlKey) && onMultiSelect) {
      onMultiSelect();
    } else if (onTap) {
      onTap();
    }
  };
  return (
    <div
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onClick={handleClick}
      style={{
        position: "absolute",
        left: pos.x, top: pos.y,
        width, height,
        cursor: (onTap || onMultiSelect) ? "pointer" : "grab",
        touchAction: "none", userSelect: "none",
        ...(asCircle ? { borderRadius: "50%" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SİPARİŞ BLOĞU — atomlar (HTML div) + edges (SVG overlay)
   ──────────────────────────────────────────────────────────────────── */
function OrderBlock({
  order, capacity, stock, loading,
  positions, defaults, onMove,
  expandedSubs, toggleSub,
  onRemove, onEdit,
  getMouseInWorld,
  allOrders, stockBySku,
}: {
  order: Order;
  capacity?: CapacityResp;
  stock?: StockResp;
  loading: boolean;
  positions: Record<string, XY>;
  defaults: Record<string, XY>;
  onMove: (nodeId: string, xy: XY) => void;
  expandedSubs: Set<string>;
  toggleSub: (code: string) => void;
  onRemove: () => void;
  onEdit: () => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  allOrders: Order[];
  stockBySku: Record<string, StockResp>;
}) {
  const top = useMemo(() => (stock?.components ?? []).filter(c => c.parentComponentCode === null), [stock]);
  const enriched = useMemo(() => top.map(c => {
    const needed = order.quantity * c.requiredPerUnit;
    const shortfall = Math.max(0, Math.ceil(needed - c.currentStock));
    return { ...c, needed, shortfall };
  }), [top, order.quantity]);
  const subs = useMemo(() => enriched.filter(c => c.isSubAssembly || c.hasChildren), [enriched]);
  const flats = useMemo(() => enriched.filter(c => !(c.isSubAssembly || c.hasChildren)), [enriched]);

  const sel = useSelection();
  const buildItem = (c: BomComponent, kind: SelectedItem["kind"]): SelectedItem => ({
    code: c.code,
    label: c.name || c.code,
    kind,
    currentStock: c.currentStock,
    usedBy: [order.sku],
    status: c.status,
  });

  const get = (id: string): XY => positions[id] ?? defaults[id] ?? { x: 0, y: 0 };
  const orderP = get(`order:${order.id}`);
  const productP = get(`product:${order.id}`);
  const panelP = get(`panel:${order.id}`);

  const orderC = { x: orderP.x + ORDER_W, y: orderP.y + ORDER_H / 2 };
  const productC = { x: productP.x + PRODUCT_W / 2, y: productP.y + PRODUCT_H / 2 };
  const productOut = { x: productP.x + PRODUCT_W, y: productP.y + PRODUCT_H / 2 };

  const strategy = useMemo(
    () => computeStrategy({ order, capacity, components: stock?.components ?? [], enriched, allOrders, stockBySku }),
    [order, capacity, stock, enriched, allOrders, stockBySku],
  );

  return (
    <>
      {/* Atomlar — saf HTML div, transform parent içinde uniform hareket eder */}
      <DragNode pos={orderP} width={ORDER_W} height={ORDER_H}
        onDrag={(xy) => onMove(`order:${order.id}`, xy)} getMouseInWorld={getMouseInWorld}>
        <div style={cardWrap()}>
          <div style={cardLabel}>SİPARİŞ</div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{order.customer || "Bayi"}</div>
          <div style={{ fontSize: 11, color: C.cardSub, marginTop: 2 }}>
            <b>{order.deadline ? new Date(order.deadline).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b> son tarih
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onEdit} style={btnGhost}>düzenle</button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} style={btnGhost}>kaldır</button>
          </div>
        </div>
      </DragNode>

      <DragNode pos={productP} width={PRODUCT_W} height={PRODUCT_H}
        onDrag={(xy) => onMove(`product:${order.id}`, xy)} getMouseInWorld={getMouseInWorld}>
        <div style={cardWrap()}>
          <div style={cardLabel}>MAMUL</div>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>{fmtTR(order.quantity)} adet</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.cardSub, marginTop: 1 }}>{order.sku}</div>
        </div>
      </DragNode>

      {/* Yarımamül daireleri + drill-down children */}
      {subs.map(c => {
        const sp = get(`sub:${order.id}:${c.code}`);
        const isShort = c.shortfall > 0;
        const open = expandedSubs.has(c.code);
        const children = c.children ?? [];
        const childGap = 44;
        const childStartY = sp.y + SUB_R - ((children.length - 1) * childGap) / 2 - COMP_H / 2;
        const childX = sp.x + SUB_R * 2 + 80;
        return (
          <div key={`sub-grp:${c.code}`}>
            <DragNode pos={sp} width={SUB_R * 2} height={SUB_R * 2}
              onDrag={(xy) => onMove(`sub:${order.id}:${c.code}`, xy)}
              getMouseInWorld={getMouseInWorld}
              onTap={children.length > 0 ? () => toggleSub(c.code) : undefined}
              onMultiSelect={() => sel.toggle(buildItem(c, "subassembly"))}
              asCircle>
              <div title={`${c.name}${children.length > 0 ? ` · tıkla → ${children.length} alt bileşen · Shift+tıkla → seç` : " · Shift+tıkla → seç"}`} style={{
                width: "100%", height: "100%", borderRadius: "50%",
                background: C.cardBg, color: C.cardInk,
                border: sel.isSelected(c.code) ? `2px solid ${C.accent}`
                  : open ? `2px solid ${C.accent}`
                  : isShort ? `2px solid ${C.shortfall}`
                  : `1.5px solid rgba(255,255,255,0.18)`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                boxShadow: open ? `0 0 0 4px ${C.accentSoft}, 0 5px 18px rgba(0,0,0,0.35)` : "0 5px 18px rgba(0,0,0,0.35)",
                fontFamily: mono, position: "relative",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700 }}>{c.code.length > 9 ? c.code.slice(0, 8) + "…" : c.code}</div>
                <div style={{ fontSize: 7, color: C.cardSub, marginTop: 1 }}>{fmtTR(c.currentStock)} ad</div>
                {isShort && <div style={{ fontSize: 7, color: C.shortfall, marginTop: 1, fontWeight: 700 }}>−{fmtTR(c.shortfall)}</div>}
                {children.length > 0 && (
                  <div style={{
                    position: "absolute", top: -6, right: -6,
                    width: 16, height: 16, borderRadius: "50%",
                    background: open ? C.accent : C.cardBgAlt,
                    border: `1px solid ${open ? C.accent : "rgba(255,255,255,0.3)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, color: open ? "#ffffff" : C.cardSub, fontWeight: 700,
                  }}>{open ? "−" : `+${children.length}`}</div>
                )}
              </div>
            </DragNode>

            {open && children.map((ch, i) => {
              const overrideId = `subchild:${order.id}:${c.code}:${ch.code}`;
              const cpos = positions[overrideId] ?? { x: childX, y: childStartY + i * childGap };
              const childNeeded = order.quantity * ch.requiredPerUnit;
              const childShort = Math.max(0, Math.ceil(childNeeded - ch.currentStock));
              const childIsSub = (ch.children?.length ?? 0) > 0 || ch.isSubAssembly;
              if (childIsSub) {
                return (
                  <DragNode key={overrideId} pos={cpos} width={SUB_R * 2 - 8} height={SUB_R * 2 - 8}
                    onDrag={(xy) => onMove(overrideId, xy)} getMouseInWorld={getMouseInWorld}
                    onMultiSelect={() => sel.toggle(buildItem(ch, "subcomponent"))} asCircle>
                    <div title={`${ch.name} · Shift+tıkla → seç`} style={{
                      width: "100%", height: "100%", borderRadius: "50%",
                      background: C.cardBgAlt, color: C.cardInk,
                      border: sel.isSelected(ch.code) ? `2px solid ${C.accent}` : `1.5px dashed ${C.accent}66`,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      fontFamily: mono, boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700 }}>{ch.code.length > 9 ? ch.code.slice(0, 8) + "…" : ch.code}</div>
                      <div style={{ fontSize: 6, color: C.cardSub, marginTop: 1 }}>{fmtTR(ch.currentStock)}</div>
                    </div>
                  </DragNode>
                );
              }
              return (
                <DragNode key={overrideId} pos={cpos} width={COMP_W - 30} height={COMP_H - 4}
                  onDrag={(xy) => onMove(overrideId, xy)} getMouseInWorld={getMouseInWorld}
                  onMultiSelect={() => sel.toggle(buildItem(ch, "subcomponent"))}>
                  <div title={`${ch.name} · Shift+tıkla → seç`} style={{
                    width: "100%", height: "100%", boxSizing: "border-box",
                    background: C.cardBgAlt, color: C.cardInk, borderRadius: 7,
                    padding: "4px 8px", display: "flex", alignItems: "center", gap: 5,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.25)", fontFamily: mono,
                    border: sel.isSelected(ch.code) ? `2px solid ${C.accent}`
                      : childShort > 0 ? `1.5px solid ${C.shortfall}` : `1px solid ${C.accent}33`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ch.code}
                      </div>
                      <div style={{ fontSize: 7, color: C.cardSub, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fmtTR(ch.currentStock)} {ch.unit || "ad"}
                      </div>
                    </div>
                    {childShort > 0 && (
                      <div style={{
                        background: C.shortfallSoft, color: C.shortfall,
                        fontSize: 7, padding: "1px 4px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap",
                      }}>−{fmtTR(childShort)}</div>
                    )}
                  </div>
                </DragNode>
              );
            })}
          </div>
        );
      })}

      {/* Flat bileşenler */}
      {flats.map(c => {
        const cp = get(`comp:${order.id}:${c.code}`);
        const isShort = c.shortfall > 0;
        return (
          <DragNode key={`comp:${c.code}`} pos={cp} width={COMP_W} height={COMP_H}
            onDrag={(xy) => onMove(`comp:${order.id}:${c.code}`, xy)} getMouseInWorld={getMouseInWorld}
            onMultiSelect={() => sel.toggle(buildItem(c, "component"))}>
            <div title={`${c.name} · Shift+tıkla → seç`} style={{
              width: "100%", height: "100%", boxSizing: "border-box",
              background: C.cardBg, color: C.cardInk, borderRadius: 8,
              padding: "5px 9px", display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 3px 12px rgba(0,0,0,0.30)", fontFamily: mono,
              border: sel.isSelected(c.code) ? `2px solid ${C.accent}`
                : isShort ? `1.5px solid ${C.shortfall}` : "1.5px solid transparent",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.code}
                </div>
                <div style={{ fontSize: 8, color: C.cardSub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  stok {fmtTR(c.currentStock)} {c.unit || "ad"}
                </div>
              </div>
              {isShort && (
                <div style={{
                  background: C.shortfallSoft, color: C.shortfall,
                  fontSize: 8, padding: "2px 5px", borderRadius: 4, fontWeight: 700, whiteSpace: "nowrap",
                }}>−{fmtTR(c.shortfall)}</div>
              )}
            </div>
          </DragNode>
        );
      })}

      {/* Strateji panel — pure HTML div, transform parent içinde */}
      <DragNode pos={panelP} width={PANEL_W} height={PANEL_H}
        onDrag={(xy) => onMove(`panel:${order.id}`, xy)} getMouseInWorld={getMouseInWorld}>
        <StrategyPanel s={strategy} order={order} loading={loading} enriched={enriched} />
      </DragNode>
    </>
  );
}

const cardWrap = (): React.CSSProperties => ({
  width: "100%", height: "100%", boxSizing: "border-box",
  background: C.cardBg, color: C.cardInk,
  borderRadius: 12, padding: 12,
  boxShadow: "0 6px 22px rgba(0,0,0,0.32)", fontFamily: mono,
  display: "flex", flexDirection: "column", gap: 3,
});
const cardLabel: React.CSSProperties = { fontSize: 9, color: C.cardSub, letterSpacing: 1.6, fontWeight: 600 };
const btnGhost: React.CSSProperties = {
  background: "transparent", border: `1px solid ${C.cardSub}40`, borderRadius: 6,
  padding: "2px 8px", fontSize: 10, color: C.cardSub, cursor: "pointer", fontFamily: mono,
};

/* ════════════════════════════════════════════════════════════════════
   EDGES — tek SVG overlay, world koordinatlarında, transform parent'ı içinde
   ──────────────────────────────────────────────────────────────────── */
function EdgesLayer({ orders, allDefaults, posOverrides, stockBySku, expandedByOrder }: {
  orders: Order[];
  allDefaults: Record<string, Record<string, XY>>;
  posOverrides: PositionOverrides;
  stockBySku: Record<string, StockResp>;
  expandedByOrder: Record<string, string[]>;
}) {
  type EdgeSeg = { d: string; short: boolean; key: string };
  const edges: EdgeSeg[] = [];

  orders.forEach(order => {
    const stock = stockBySku[order.sku];
    if (!stock) return;
    const overrides = posOverrides[order.id] ?? {};
    const defaults = allDefaults[order.id] ?? {};
    const get = (id: string): XY => overrides[id] ?? defaults[id] ?? { x: 0, y: 0 };
    const orderP = get(`order:${order.id}`);
    const productP = get(`product:${order.id}`);
    const orderRight = { x: orderP.x + ORDER_W, y: orderP.y + ORDER_H / 2 };
    const productLeft = { x: productP.x, y: productP.y + PRODUCT_H / 2 };
    const productRight = { x: productP.x + PRODUCT_W, y: productP.y + PRODUCT_H / 2 };

    edges.push({ key: `e:o2p:${order.id}`, short: false,
      d: `M ${orderRight.x} ${orderRight.y} L ${productLeft.x} ${productLeft.y}` });

    const top = stock.components.filter(c => c.parentComponentCode === null);
    const subs = top.filter(c => c.isSubAssembly || c.hasChildren);
    const flats = top.filter(c => !(c.isSubAssembly || c.hasChildren));
    const expanded = new Set(expandedByOrder[order.id] ?? []);

    if (subs.length > 0 || flats.length > 0) {
      edges.push({ key: `e:p2hub:${order.id}`, short: false,
        d: `M ${productRight.x} ${productRight.y} L ${productRight.x + 90} ${productRight.y}` });
    }
    const hubX = productRight.x + 90;
    const hubY = productRight.y;

    subs.forEach(c => {
      const sp = get(`sub:${order.id}:${c.code}`);
      const sc = { x: sp.x + SUB_R, y: sp.y + SUB_R };
      const cpx = (hubX + sc.x) / 2;
      const needed = order.quantity * c.requiredPerUnit;
      const short = needed - c.currentStock > 0;
      edges.push({
        key: `e:sub:${order.id}:${c.code}`, short,
        d: `M ${hubX} ${hubY} C ${cpx} ${hubY}, ${cpx} ${sc.y}, ${sc.x - SUB_R} ${sc.y}`,
      });

      // Drill-down children
      if (expanded.has(c.code) && c.children) {
        const childGap = 44;
        const childStartY = sp.y + SUB_R - ((c.children.length - 1) * childGap) / 2 - COMP_H / 2;
        const childX = sp.x + SUB_R * 2 + 80;
        c.children.forEach((ch, i) => {
          const overrideId = `subchild:${order.id}:${c.code}:${ch.code}`;
          const cpos = overrides[overrideId] ?? { x: childX, y: childStartY + i * childGap };
          const childNeed = order.quantity * ch.requiredPerUnit;
          const cs = childNeed - ch.currentStock > 0;
          const childCenter = { x: cpos.x, y: cpos.y + COMP_H / 2 };
          const cmid = (sc.x + childCenter.x) / 2;
          edges.push({
            key: `e:subch:${order.id}:${c.code}:${ch.code}`, short: cs,
            d: `M ${sc.x + SUB_R - 2} ${sc.y} C ${cmid} ${sc.y}, ${cmid} ${childCenter.y}, ${childCenter.x} ${childCenter.y}`,
          });
        });
      }
    });

    flats.forEach(c => {
      const cp = get(`comp:${order.id}:${c.code}`);
      const cc = { x: cp.x, y: cp.y + COMP_H / 2 };
      const cpx = (hubX + cc.x) / 2;
      const needed = order.quantity * c.requiredPerUnit;
      const short = needed - c.currentStock > 0;
      edges.push({
        key: `e:flat:${order.id}:${c.code}`, short,
        d: `M ${hubX} ${hubY} C ${cpx} ${hubY}, ${cpx} ${cc.y}, ${cc.x} ${cc.y}`,
      });
    });
  });

  return (
    <svg style={{
      position: "absolute", left: 0, top: 0, width: 4000, height: 4000,
      pointerEvents: "none", overflow: "visible",
    }}>
      {edges.map(e => (
        <path key={e.key} d={e.d}
          stroke={e.short ? C.shortfall : C.edge}
          strokeWidth={e.short ? 1.6 : 1.2}
          strokeDasharray={e.short ? "5 5" : "3 5"}
          fill="none" />
      ))}
    </svg>
  );
}

/* ─────── Order Modal ─────── */
function OrderModal({
  initial, onClose, onSave,
}: {
  initial?: Order | null;
  onClose: () => void;
  onSave: (o: Order) => void;
}) {
  const [customer, setCustomer] = useState(initial?.customer ?? "");
  const [sku, setSku] = useState<string>(initial?.sku ?? ALL_SKUS[0]);
  const [quantity, setQuantity] = useState<string>(initial ? String(initial.quantity) : "100");
  const [deadline, setDeadline] = useState<string>(
    initial?.deadline ?? new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  );
  const submit = () => {
    const q = parseInt(quantity, 10);
    if (!sku || isNaN(q) || q <= 0) return;
    onSave({
      id: initial?.id ?? `o_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      customer: customer.trim() || "Bayi",
      sku, quantity: q, deadline,
      createdAt: initial?.createdAt ?? Date.now(),
    });
  };
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: "92vw", background: C.cardBg,
        border: `1px solid ${C.panelEdge}`, borderRadius: 14, padding: 22,
        fontFamily: mono, color: C.cardInk,
        boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
      }}>
        <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, marginBottom: 4 }}>
          {initial ? "SİPARİŞİ DÜZENLE" : "YENİ SİPARİŞ"}
        </div>
        <div style={{ fontSize: 18, marginBottom: 14 }}>Strateji canvas'a bayi siparişi ekle</div>
        <label style={lbl}>BAYİ / MÜŞTERİ</label>
        <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Örn: Ankara Bayi" style={inp} />
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>MAMUL (SKU)</label>
            <select value={sku} onChange={e => setSku(e.target.value)} style={{ ...inp, height: 38 }}>
              {ALL_SKUS.map(s => <option key={s} value={s} style={{ background: C.cardBg }}>{s}</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label style={lbl}>ADET</label>
            <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} style={inp} />
          </div>
        </div>
        <label style={{ ...lbl, marginTop: 12, display: "block" }}>SON TARİH</label>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inp} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.cardSub,
            fontFamily: mono, fontSize: 12,
          }}>Vazgeç</button>
          <button onClick={submit} style={{
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            background: C.accent, border: "none", color: "#ffffff",
            fontFamily: mono, fontSize: 12, fontWeight: 700,
          }}>{initial ? "Güncelle" : "Ekle"}</button>
        </div>
      </div>
    </div>
  );
}
const lbl: React.CSSProperties = { fontSize: 10, color: C.cardSub, letterSpacing: 1 };
const inp: React.CSSProperties = {
  width: "100%", marginTop: 6,
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.panelEdge}`,
  borderRadius: 8, padding: "9px 12px", color: C.cardInk,
  fontFamily: mono, fontSize: 13, outline: "none",
};

/* ════════════════════════════════════════════════════════════════════
   PAGE
   ──────────────────────────────────────────────────────────────────── */
export default function StrategyCanvasPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [orders, setOrders] = useState<Order[]>(() => safeParse<Order[]>(localStorage.getItem(ORDERS_KEY), []));
  useEffect(() => { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }, [orders]);

  const [posOverrides, setPosOverrides] = useState<PositionOverrides>(
    () => safeParse<PositionOverrides>(localStorage.getItem(POS_KEY), {}),
  );
  useEffect(() => { localStorage.setItem(POS_KEY, JSON.stringify(posOverrides)); }, [posOverrides]);

  const [expandedSubs, setExpandedSubs] = useState<Record<string, string[]>>(
    () => safeParse<Record<string, string[]>>(localStorage.getItem(EXPAND_KEY), {}),
  );
  useEffect(() => { localStorage.setItem(EXPAND_KEY, JSON.stringify(expandedSubs)); }, [expandedSubs]);
  const toggleSub = useCallback((orderId: string, code: string) => {
    setExpandedSubs(prev => {
      const cur = prev[orderId] ?? [];
      const next = cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code];
      return { ...prev, [orderId]: next };
    });
  }, []);

  const [modalOpen, setModalOpen] = useState(orders.length === 0);
  const [editing, setEditing] = useState<Order | null>(null);

  const initialView = safeParse<{ vx: number; vy: number; scale: number }>(localStorage.getItem(VIEW_KEY), { vx: 0, vy: 0, scale: 0.85 });
  const [viewport, setViewport] = useState(initialView);
  useEffect(() => { localStorage.setItem(VIEW_KEY, JSON.stringify(viewport)); }, [viewport]);

  const skuSet = useMemo(() => Array.from(new Set(orders.map(o => o.sku))), [orders]);
  const stockQueries = useQueries({
    queries: skuSet.map(sku => ({ queryKey: [`/api/bom/${sku}/stock`], enabled: !!sku })),
  });
  const capacityQueries = useQueries({
    queries: skuSet.map(sku => ({ queryKey: [`/api/bom/${sku}/production-capacity`], enabled: !!sku })),
  });
  const stockBySku = useMemo(() => {
    const m: Record<string, StockResp> = {};
    skuSet.forEach((sku, i) => { const d = stockQueries[i]?.data as StockResp | undefined; if (d) m[sku] = d; });
    return m;
  }, [skuSet, stockQueries.map(q => q.data).join("|")]);
  const capacityBySku = useMemo(() => {
    const m: Record<string, CapacityResp> = {};
    skuSet.forEach((sku, i) => { const d = capacityQueries[i]?.data as CapacityResp | undefined; if (d) m[sku] = d; });
    return m;
  }, [skuSet, capacityQueries.map(q => q.data).join("|")]);
  const anyLoading = stockQueries.some(q => q.isLoading) || capacityQueries.some(q => q.isLoading);

  const handleStockUpdate = useCallback(() => {
    skuSet.forEach(sku => {
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
    });
  }, [qc, skuSet]);
  const { connected } = useStockWebSocket(handleStockUpdate);

  const triggerOctopus = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/orchestrator/run-audit", { source: "strategy_canvas" });
      return res.json();
    },
    onError: () => {},
  });

  const upsertOrder = (o: Order) => {
    setOrders(prev => {
      const idx = prev.findIndex(p => p.id === o.id);
      return idx >= 0 ? prev.map((p, i) => i === idx ? o : p) : [...prev, o];
    });
    setModalOpen(false); setEditing(null);
    triggerOctopus.mutate();
  };
  const removeOrder = (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    setPosOverrides(prev => { const next = { ...prev }; delete next[id]; return next; });
    triggerOctopus.mutate();
  };
  const moveNode = useCallback((orderId: string, nodeId: string, xy: XY) => {
    setPosOverrides(prev => ({ ...prev, [orderId]: { ...(prev[orderId] ?? {}), [nodeId]: xy } }));
  }, []);
  const resetLayout = () => setPosOverrides({});

  const ROW_HEIGHT = 720;
  const allDefaults = useMemo(() => {
    const all: Record<string, Record<string, XY>> = {};
    orders.forEach((o, i) => {
      const stock = stockBySku[o.sku];
      all[o.id] = defaultPositions(o, stock?.components ?? [], i * ROW_HEIGHT);
    });
    return all;
  }, [orders, stockBySku]);

  /* World ↔ screen koordinat dönüştürme */
  const wrapperRef = useRef<HTMLDivElement>(null);
  const getMouseInWorld = useCallback((e: React.PointerEvent): XY => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left - viewport.vx) / viewport.scale,
      y: (e.clientY - rect.top - viewport.vy) / viewport.scale,
    };
  }, [viewport]);

  /* Pan */
  const panRef = useRef<{ startX: number; startY: number; vx0: number; vy0: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const handleBgDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, vx0: viewport.vx, vy0: viewport.vy };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setIsPanning(true);
  };
  const handleBgMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    setViewport(v => ({ ...v, vx: panRef.current!.vx0 + dx, vy: panRef.current!.vy0 + dy }));
  };
  const handleBgUp = (e: React.PointerEvent<HTMLDivElement>) => {
    panRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setViewport(v => {
        const newScale = Math.max(0.2, Math.min(2.5, v.scale * factor));
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return { ...v, scale: newScale };
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const k = newScale / v.scale;
        return { vx: cx - k * (cx - v.vx), vy: cy - k * (cy - v.vy), scale: newScale };
      });
    } else {
      setViewport(v => ({ ...v, vx: v.vx - e.deltaX, vy: v.vy - e.deltaY }));
    }
  };

  const zoomBy = (factor: number) => setViewport(v => ({ ...v, scale: Math.max(0.2, Math.min(2.5, v.scale * factor)) }));

  const fitToView = () => {
    const all: XY[] = [];
    orders.forEach(o => {
      const merged = { ...(allDefaults[o.id] ?? {}), ...(posOverrides[o.id] ?? {}) };
      Object.values(merged).forEach(p => all.push(p));
    });
    if (all.length === 0) { setViewport({ vx: 0, vy: 0, scale: 1 }); return; }
    const minX = Math.min(...all.map(p => p.x)) - 40;
    const maxX = Math.max(...all.map(p => p.x)) + PANEL_W + 40;
    const minY = Math.min(...all.map(p => p.y)) - 40;
    const maxY = Math.max(...all.map(p => p.y)) + PANEL_H + 40;
    const rect = wrapperRef.current?.getBoundingClientRect(); if (!rect) return;
    const scaleX = rect.width / Math.max(1, maxX - minX);
    const scaleY = rect.height / Math.max(1, maxY - minY);
    const scale = Math.max(0.2, Math.min(1.2, Math.min(scaleX, scaleY) * 0.95));
    setViewport({ vx: -minX * scale + 20, vy: -minY * scale + 20, scale });
  };

  const fittedOnceRef = useRef(false);
  useEffect(() => {
    if (fittedOnceRef.current) return;
    if (orders.length === 0) return;
    const ready = orders.every(o => stockBySku[o.sku]);
    if (!ready) return;
    fittedOnceRef.current = true;
    setTimeout(fitToView, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length, Object.keys(stockBySku).length]);

  return (
    <div className="native-light" style={{
      minHeight: "100vh", background: C.bg, color: C.ink,
      fontFamily: mono, fontFeatureSettings: INTER_FEATS,
      // @ts-ignore
      WebkitFontSmoothing: "antialiased", overflow: "hidden",
    }}>
      <TopNav connected={connected} />

      {/* Header */}
      <div style={{ padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.edgeFaint}` }}>
        <div>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 2 }}>◇ STRATEJİ CANVAS</div>
          <div style={{ fontSize: 18, marginTop: 2, color: C.ink }}>Sipariş → Mamul → BOM → Aksiyon Kuyruğu · Canlı Domino</div>
          <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
            Bayi siparişi ekle · fan-out otomatik · sürükle, zoom, sığdır · stok değişince yeniden hesapla
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/ontology")} style={hdrBtnGhost}>← Ontoloji</button>
          <button onClick={() => zoomBy(1.2)} style={hdrBtnGhost} title="Yakınlaştır">+</button>
          <button onClick={() => zoomBy(0.83)} style={hdrBtnGhost} title="Uzaklaştır">−</button>
          <button onClick={fitToView} style={hdrBtnGhost} title="Sığdır">⊡ sığdır</button>
          <button onClick={resetLayout} style={hdrBtnGhost} title="Yerleşimi sıfırla">⟲ layout</button>
          <button onClick={() => { setEditing(null); setModalOpen(true); }} style={hdrBtnAccent}>+ Sipariş ekle</button>
        </div>
      </div>

      {/* Canvas — pan/zoom wrapper */}
      <div
        ref={wrapperRef}
        onPointerDown={handleBgDown}
        onPointerMove={handleBgMove}
        onPointerUp={handleBgUp}
        onWheel={handleWheel}
        style={{
          position: "relative", height: "calc(100vh - 132px)",
          overflow: "hidden",
          background: C.bg,
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(15,23,42,0.10) 1px, transparent 0)`,
          backgroundSize: `${40 * viewport.scale}px ${40 * viewport.scale}px`,
          backgroundPosition: `${viewport.vx}px ${viewport.vy}px`,
          cursor: isPanning ? "grabbing" : "grab",
          touchAction: "none", userSelect: "none",
        }}
      >
        {orders.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", color: C.mid, gap: 12, pointerEvents: "auto",
          }}>
            <div style={{ fontSize: 14 }}>Boş canvas — sipariş ekleyerek başla</div>
            <button onClick={() => { setEditing(null); setModalOpen(true); }} style={hdrBtnAccent}>+ İlk siparişi ekle</button>
          </div>
        ) : (
          <div style={{
            position: "absolute", left: 0, top: 0, width: 0, height: 0,
            transformOrigin: "0 0",
            transform: `translate3d(${viewport.vx}px, ${viewport.vy}px, 0) scale(${viewport.scale})`,
            willChange: "transform",
          }}>
            <EdgesLayer
              orders={orders}
              allDefaults={allDefaults}
              posOverrides={posOverrides}
              stockBySku={stockBySku}
              expandedByOrder={expandedSubs}
            />
            {orders.map(o => (
              <OrderBlock
                key={o.id}
                order={o}
                capacity={capacityBySku[o.sku]}
                stock={stockBySku[o.sku]}
                loading={anyLoading && !stockBySku[o.sku]}
                positions={posOverrides[o.id] ?? {}}
                defaults={allDefaults[o.id] ?? {}}
                onMove={(nodeId, xy) => moveNode(o.id, nodeId, xy)}
                expandedSubs={new Set(expandedSubs[o.id] ?? [])}
                toggleSub={(code) => toggleSub(o.id, code)}
                onRemove={() => removeOrder(o.id)}
                onEdit={() => { setEditing(o); setModalOpen(true); }}
                getMouseInWorld={getMouseInWorld}
                allOrders={orders}
                stockBySku={stockBySku}
              />
            ))}
          </div>
        )}

        <div style={{
          position: "absolute", bottom: 14, left: 14,
          background: "rgba(15,23,42,0.78)", color: C.cardInk,
          padding: "6px 10px", borderRadius: 6, fontSize: 10, fontFamily: mono,
          letterSpacing: 0.4, pointerEvents: "none",
        }}>
          sürükle = pan · Shift+wheel = zoom · kart tut = taşı · ölçek {viewport.scale.toFixed(2)}×
        </div>
      </div>

      {modalOpen && (
        <OrderModal
          initial={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={upsertOrder}
        />
      )}
    </div>
  );
}

const hdrBtnGhost: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 8, cursor: "pointer",
  background: "transparent", border: `1px solid ${C.edgeFaint}`, color: C.mid,
  fontFamily: mono, fontSize: 12,
};
const hdrBtnAccent: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 8, cursor: "pointer",
  background: C.accent, border: "none", color: "#ffffff",
  fontFamily: mono, fontSize: 12, fontWeight: 700,
};
