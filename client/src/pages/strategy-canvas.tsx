import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";
import { useAgentPanel } from "@/App";
import { useSelection, type SelectedItem } from "@/lib/selection-context";
import BhOntologyPage from "@/pages/bh-ontology";
import bomTreeRaw from "@shared/strategy-bom-tree.json";
import {
  ReactionFlask,
  type FlaskItem,
  type SupplyItem,
  type ReactionResult,
} from "@/components/reaction-flask";
import { ReactionGantt } from "@/components/reaction-gantt";

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

/* ════════════════════════════════════════════════════════════════════
   EDGE COLOR PALETTE — kullanıcı seçtiği palet ok renklerini override eder
   Default = mevcut hardcoded renklerle birebir aynı (identity).
   Diğer paletler 7 rolü farklı hex'lere eşler, alpha korunur.
   ──────────────────────────────────────────────────────────────────── */
type EdgeRole = "electric" | "gas" | "neutral" | "shortfall" | "warn" | "select" | "dark";

interface EdgePalette {
  id: string;
  name: string;
  colors: Record<EdgeRole, string>;
}

const EDGE_PALETTES: EdgePalette[] = [
  {
    id: "default", name: "Varsayılan",
    colors: { electric: "#10b981", gas: "#38bdf8", neutral: "#ffffff", shortfall: "#ef4444", warn: "#f59e0b", select: "#f97316", dark: "#0f172a" },
  },
  {
    id: "vivid", name: "Canlı",
    colors: { electric: "#a855f7", gas: "#ec4899", neutral: "#f5f5f5", shortfall: "#dc2626", warn: "#f59e0b", select: "#06b6d4", dark: "#1e293b" },
  },
  {
    id: "mono", name: "Tek Ton",
    colors: { electric: "#52525b", gas: "#a1a1aa", neutral: "#e4e4e7", shortfall: "#18181b", warn: "#71717a", select: "#0ea5e9", dark: "#09090b" },
  },
  {
    id: "solar", name: "Güneş",
    colors: { electric: "#fbbf24", gas: "#fb923c", neutral: "#fef3c7", shortfall: "#dc2626", warn: "#f97316", select: "#1d4ed8", dark: "#78350f" },
  },
  {
    id: "ink", name: "Mürekkep",
    colors: { electric: "#1e3a8a", gas: "#5b21b6", neutral: "#94a3b8", shortfall: "#991b1b", warn: "#a16207", select: "#0891b2", dark: "#020617" },
  },
  {
    id: "forest", name: "Orman",
    colors: { electric: "#14532d", gas: "#0e7490", neutral: "#d6d3d1", shortfall: "#7c2d12", warn: "#854d0e", select: "#65a30d", dark: "#1c1917" },
  },
];

const EDGE_PALETTE_KEY = "griseus_edge_palette_v1";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function asRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function getEdgePalette(id: string | null | undefined): EdgePalette {
  return EDGE_PALETTES.find(p => p.id === id) ?? EDGE_PALETTES[0];
}

// Hardcoded sahne renklerini palet rollerine eşle. Default palette identity döner.
function remapEdgeColor(orig: string | undefined, p: EdgePalette): string | undefined {
  if (!orig) return orig;
  if (p.id === "default") return orig;
  const s = orig.replace(/\s/g, "").toLowerCase();

  // Hex eşleşmeleri (default palette anchor'ları)
  if (s === "#10b981") return p.colors.electric;
  if (s === "#38bdf8") return p.colors.gas;
  if (s === "#f97316") return p.colors.select;
  if (s === "#ef4444") return p.colors.shortfall;
  if (s === "#f59e0b") return p.colors.warn;
  if (s === "#ffffff" || s === "#fff") return p.colors.neutral;
  if (s === "#0f172a") return p.colors.dark;

  // RGBA — rgb tripletinden role çıkar, alpha'yı koru
  const m = s.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/);
  if (m) {
    const r = m[1], g = m[2], b = m[3];
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    const rgb = `${r},${g},${b}`;
    let role: EdgeRole | null = null;
    if (rgb === "16,185,129") role = "electric";
    else if (rgb === "56,189,248") role = "gas";
    else if (rgb === "249,115,22") role = "select";
    else if (rgb === "239,68,68") role = "shortfall";
    else if (rgb === "245,158,11") role = "warn";
    else if (rgb === "255,255,255") role = "neutral";
    else if (rgb === "15,23,42") role = "dark";
    if (role) return asRgba(p.colors[role], alpha);
  }
  return orig;
}

/* ════════════════════════════════════════════════════════════════════
   SHAPE OVERRIDE — kullanıcı sol palet üzerinden atom kutusunun şeklini
   değiştirebilir (rect/rounded/circle/triangle). Default = atom.kind'in
   doğal şekli.
   ──────────────────────────────────────────────────────────────────── */
type ShapeKind = "rect" | "rounded" | "circle" | "triangle";

const SHAPE_OVERRIDES_KEY = "griseus_scene_shapes_v1";
const CUSTOM_EDGES_KEY = "griseus_scene_custom_edges_v1";
const ATOM_META_KEY = "griseus_scene_atom_meta_v1";

interface CustomEdge {
  id: string;
  fromId: string;
  toId: string;
}

interface AtomMeta {
  orderNumber?: string;
  deadline?: string;
}

function shapeStyleFor(kind: ShapeKind): React.CSSProperties {
  switch (kind) {
    case "circle":
      return { borderRadius: "50%", clipPath: "circle(50%)" };
    case "triangle":
      return { borderRadius: 0, clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" };
    case "rounded":
      return { borderRadius: 24, clipPath: "none" };
    case "rect":
    default:
      return { borderRadius: 4, clipPath: "none" };
  }
}

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
const SCENARIOS_KEY = "griseus_scenarios_v1";
const ACTIVE_SCENARIO_KEY = "griseus_scenario_active_v1";

interface WidgetVisibility {
  customers: boolean;
  categories: boolean;
  products: boolean;
  stages: boolean;
  factory: boolean;
  supply: boolean;
  scene: boolean;
}

const DEFAULT_WIDGET_VIS: WidgetVisibility = {
  customers: false, categories: false, products: false,
  stages: false, factory: false, supply: false, scene: false,
};

// Customers Senaryosu için: panel'leri değil, sahne (atomlar + kıvrımlı oklar) açar
const CUSTOMERS_SCENE_VIS: WidgetVisibility = {
  customers: false, categories: false, products: false,
  stages: false, factory: false, supply: false, scene: true,
};

interface ScenarioSnapshot {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  payload: {
    orders: Order[];
    posOverrides: PositionOverrides;
    expandedSubs: Record<string, string[]>;
    customers?: Customer[];
    customersPanelOpen?: boolean;
    expandedCustomers?: string[];
    widgetVisibility?: WidgetVisibility;
    supplyEntries?: { id: string; code: string; qty: number; leadDays: number }[];
    scenePositions?: Record<string, XY>;
    flaskItems?: FlaskItem[];
    flaskSupplies?: SupplyItem[];
    // v2: kaydet basınca canvas görseli birebir geri gelsin
    viewport?: { vx: number; vy: number; scale: number };
    customersPanelPos?: { x: number; y: number };
    flaskOpen?: boolean;
    reactionResult?: unknown;
  };
}

interface Customer {
  id: string;
  label: string;
  category?: "elektrikli" | "gazlı" | string;
  note?: string;
}

const CUSTOMERS_KEY = "griseus_customers_v1";
const CUSTOMERS_PANEL_OPEN_KEY = "griseus_customers_panel_open_v1";
const CUSTOMERS_EXPANDED_KEY = "griseus_customers_expanded_v1";

// Hipotetik müşteri seed'i — kullanıcının resmindeki E1-E3, G1-G3, En, Gn pattern'i
const SAMPLE_CUSTOMERS: Customer[] = [
  { id: "c_E1", label: "E1", category: "elektrikli" },
  { id: "c_E2", label: "E2", category: "elektrikli" },
  { id: "c_E3", label: "E3", category: "elektrikli" },
  { id: "c_G1", label: "G1", category: "gazlı" },
  { id: "c_G2", label: "G2", category: "gazlı" },
  { id: "c_G3", label: "G3", category: "gazlı" },
  { id: "c_En", label: "En", category: "elektrikli" },
  { id: "c_Gn", label: "Gn", category: "gazlı" },
];

const CUSTOMERS_PANEL_W = 240;
const CUSTOMERS_HEADER_H = 56;
const CUSTOMERS_CHIP_H = 38;
const CUSTOMERS_ORDER_ROW_H = 56;

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
  pos, width, height, onDrag, onTap, onMultiSelect, getMouseInWorld, children, style, asCircle, viewport, shapeStyle,
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
  viewport: { vx: number; vy: number; scale: number };
  shapeStyle?: React.CSSProperties;
}) {
  const offsetRef = useRef<XY>({ x: 0, y: 0 });
  const downAtRef = useRef<{ x: number; y: number; t: number; shift: boolean } | null>(null);
  const movedRef = useRef(false);
  const handleDown = (e: React.PointerEvent) => {
    const isShift = e.shiftKey || e.metaKey || e.ctrlKey;
    e.stopPropagation();
    // Shift+click sırasında tarayıcının text-range select default'unu engelle
    // (yoksa seçilen kartların içindeki yazılar mavi hilight olur)
    if (isShift) e.preventDefault();
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
      // shift+click ile oluşmuş tarayıcı text-range'ini sıfırla (mavi hilight)
      try { window.getSelection()?.removeAllRanges(); } catch { /* noop */ }
      onMultiSelect();
    } else if (onTap) {
      onTap();
    }
  };
  const sx = pos.x * viewport.scale + viewport.vx;
  const sy = pos.y * viewport.scale + viewport.vy;
  const sw = width * viewport.scale;
  const sh = height * viewport.scale;
  return (
    <div
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onClick={handleClick}
      style={{
        position: "absolute",
        left: sx, top: sy,
        width: sw, height: sh,
        cursor: (onTap || onMultiSelect) ? "pointer" : "grab",
        touchAction: "none", userSelect: "none",
        ...(asCircle ? { borderRadius: "50%" } : {}),
        ...style,
      }}
    >
      <div style={{
        width, height,
        transform: `scale(${viewport.scale})`,
        transformOrigin: "0 0",
        ...(asCircle ? { borderRadius: "50%" } : {}),
        ...(shapeStyle ?? {}),
        overflow: shapeStyle?.clipPath ? "hidden" : undefined,
      }}>
        {children}
      </div>
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
  onRemove, onEdit, onAddToFlask,
  getMouseInWorld, viewport,
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
  onAddToFlask: () => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
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
        onDrag={(xy) => onMove(`order:${order.id}`, xy)} getMouseInWorld={getMouseInWorld} viewport={viewport}>
        <div
          style={cardWrap()}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData(
              "application/x-griseus-order",
              JSON.stringify({
                sku: order.sku,
                qty: order.quantity,
                deadline: order.deadline,
                orderId: order.id,
              }),
            );
          }}
        >
          <div style={cardLabel}>SİPARİŞ · sürükle</div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{order.customer || "Bayi"}</div>
          <div style={{ fontSize: 11, color: C.cardSub, marginTop: 2 }}>
            <b>{order.deadline ? new Date(order.deadline).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b> son tarih
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onEdit} style={btnGhost}>düzenle</button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} style={btnGhost}>kaldır</button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onAddToFlask} style={btnFlask} title="Tepkime denklemine ekle">+ tepkime</button>
          </div>
        </div>
      </DragNode>

      <DragNode pos={productP} width={PRODUCT_W} height={PRODUCT_H}
        onDrag={(xy) => onMove(`product:${order.id}`, xy)} getMouseInWorld={getMouseInWorld} viewport={viewport}>
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
              getMouseInWorld={getMouseInWorld} viewport={viewport}
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
                    onDrag={(xy) => onMove(overrideId, xy)} getMouseInWorld={getMouseInWorld} viewport={viewport}
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
                  onDrag={(xy) => onMove(overrideId, xy)} getMouseInWorld={getMouseInWorld} viewport={viewport}
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
            onDrag={(xy) => onMove(`comp:${order.id}:${c.code}`, xy)} getMouseInWorld={getMouseInWorld} viewport={viewport}
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
        onDrag={(xy) => onMove(`panel:${order.id}`, xy)} getMouseInWorld={getMouseInWorld} viewport={viewport}>
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
const btnFlask: React.CSSProperties = {
  background: "rgba(201,100,66,0.18)", border: `1px solid rgba(201,100,66,0.55)`, borderRadius: 6,
  padding: "2px 8px", fontSize: 10, color: "#f0a98a", cursor: "pointer", fontFamily: mono, fontWeight: 600,
};

/* ════════════════════════════════════════════════════════════════════
   EDGES — tek SVG overlay, world koordinatlarında, transform parent'ı içinde
   ──────────────────────────────────────────────────────────────────── */
function EdgesLayer({ orders, allDefaults, posOverrides, stockBySku, expandedByOrder, viewport, edgePalette }: {
  orders: Order[];
  allDefaults: Record<string, Record<string, XY>>;
  posOverrides: PositionOverrides;
  stockBySku: Record<string, StockResp>;
  expandedByOrder: Record<string, string[]>;
  viewport: { vx: number; vy: number; scale: number };
  edgePalette: EdgePalette;
}) {
  type EdgeSeg = { d: string; short: boolean; key: string };
  const edges: EdgeSeg[] = [];
  const T = (x: number, y: number) => ({ x: x * viewport.scale + viewport.vx, y: y * viewport.scale + viewport.vy });

  orders.forEach(order => {
    const stock = stockBySku[order.sku];
    if (!stock) return;
    const overrides = posOverrides[order.id] ?? {};
    const defaults = allDefaults[order.id] ?? {};
    const get = (id: string): XY => overrides[id] ?? defaults[id] ?? { x: 0, y: 0 };
    const orderP = get(`order:${order.id}`);
    const productP = get(`product:${order.id}`);
    const orderRight = T(orderP.x + ORDER_W, orderP.y + ORDER_H / 2);
    const productLeft = T(productP.x, productP.y + PRODUCT_H / 2);
    const productRight = T(productP.x + PRODUCT_W, productP.y + PRODUCT_H / 2);

    edges.push({ key: `e:o2p:${order.id}`, short: false,
      d: `M ${orderRight.x} ${orderRight.y} L ${productLeft.x} ${productLeft.y}` });

    const top = stock.components.filter(c => c.parentComponentCode === null);
    const subs = top.filter(c => c.isSubAssembly || c.hasChildren);
    const flats = top.filter(c => !(c.isSubAssembly || c.hasChildren));
    const expanded = new Set(expandedByOrder[order.id] ?? []);

    const hub = T(productP.x + PRODUCT_W + 90, productP.y + PRODUCT_H / 2);
    if (subs.length > 0 || flats.length > 0) {
      edges.push({ key: `e:p2hub:${order.id}`, short: false,
        d: `M ${productRight.x} ${productRight.y} L ${hub.x} ${hub.y}` });
    }
    const hubX = hub.x;
    const hubY = hub.y;

    subs.forEach(c => {
      const sp = get(`sub:${order.id}:${c.code}`);
      const sc = T(sp.x + SUB_R, sp.y + SUB_R);
      const subLeft = T(sp.x, sp.y + SUB_R);
      const cpx = (hubX + sc.x) / 2;
      const needed = order.quantity * c.requiredPerUnit;
      const short = needed - c.currentStock > 0;
      edges.push({
        key: `e:sub:${order.id}:${c.code}`, short,
        d: `M ${hubX} ${hubY} C ${cpx} ${hubY}, ${cpx} ${sc.y}, ${subLeft.x} ${subLeft.y}`,
      });

      if (expanded.has(c.code) && c.children) {
        const childGap = 44;
        const childStartY = sp.y + SUB_R - ((c.children.length - 1) * childGap) / 2 - COMP_H / 2;
        const childX = sp.x + SUB_R * 2 + 80;
        const subRight = T(sp.x + SUB_R * 2, sp.y + SUB_R);
        c.children.forEach((ch, i) => {
          const overrideId = `subchild:${order.id}:${c.code}:${ch.code}`;
          const cpos = overrides[overrideId] ?? { x: childX, y: childStartY + i * childGap };
          const childNeed = order.quantity * ch.requiredPerUnit;
          const cs = childNeed - ch.currentStock > 0;
          const childCenter = T(cpos.x, cpos.y + COMP_H / 2);
          const cmid = (sc.x + childCenter.x) / 2;
          edges.push({
            key: `e:subch:${order.id}:${c.code}:${ch.code}`, short: cs,
            d: `M ${subRight.x} ${subRight.y} C ${cmid} ${subRight.y}, ${cmid} ${childCenter.y}, ${childCenter.x} ${childCenter.y}`,
          });
        });
      }
    });

    flats.forEach(c => {
      const cp = get(`comp:${order.id}:${c.code}`);
      const cc = T(cp.x, cp.y + COMP_H / 2);
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
      position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
      pointerEvents: "none", overflow: "visible",
    }}>
      {edges.map(e => (
        <path key={e.key} d={e.d}
          stroke={e.short
            ? (remapEdgeColor(C.shortfall, edgePalette) ?? C.shortfall)
            : (remapEdgeColor(C.edge, edgePalette) ?? C.edge)}
          strokeWidth={e.short ? 1.6 : 1.2}
          strokeDasharray={e.short ? "5 5" : "3 5"}
          fill="none" />
      ))}
    </svg>
  );
}

/* ─────── Order Modal ─────── */
/* ════════════════════════════════════════════════════════════════════
   CUSTOMERS PANEL — free-form, draggable, drill-down
   Canvas'ta sol tarafta yaşar. Click header → toggle open. Click chip →
   o müşterinin siparişleri inline açılır. "+ sipariş" → modal pre-fill.
   ──────────────────────────────────────────────────────────────────── */
function CustomersPanel({
  pos, customers, orders, isOpen, expanded,
  onMove, onTogglePanel, onToggleCustomer,
  onCreateOrderFor, onEditOrder, onRemoveCustomer, onAddCustomer,
  getMouseInWorld, viewport,
}: {
  pos: XY;
  customers: Customer[];
  orders: Order[];
  isOpen: boolean;
  expanded: string[];
  onMove: (xy: XY) => void;
  onTogglePanel: () => void;
  onToggleCustomer: (id: string) => void;
  onCreateOrderFor: (label: string) => void;
  onEditOrder: (o: Order) => void;
  onRemoveCustomer: (id: string) => void;
  onAddCustomer: (label: string, category?: string) => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<"elektrikli" | "gazlı">("elektrikli");

  const ordersByCustomer = useMemo(() => {
    const m: Record<string, Order[]> = {};
    for (const o of orders) {
      const key = o.customer.trim().toLowerCase();
      (m[key] ??= []).push(o);
    }
    return m;
  }, [orders]);

  const expandedSet = new Set(expanded);

  // Compute total panel height based on content
  const itemsHeight = isOpen
    ? customers.reduce((sum, c) => {
        const customerOrders = ordersByCustomer[c.label.toLowerCase()] ?? [];
        const open = expandedSet.has(c.id);
        return sum + CUSTOMERS_CHIP_H + 4 +
          (open ? customerOrders.length * CUSTOMERS_ORDER_ROW_H + 36 : 0);
      }, 0) + (adding ? 92 : 36) + 16
    : 0;

  const totalH = CUSTOMERS_HEADER_H + itemsHeight;

  return (
    <DragNode
      pos={pos}
      width={CUSTOMERS_PANEL_W}
      height={totalH}
      onDrag={onMove}
      getMouseInWorld={getMouseInWorld}
      viewport={viewport}
    >
      <div style={{
        width: CUSTOMERS_PANEL_W, height: totalH,
        background: C.panelBg, color: C.cardInk,
        border: `1px solid ${C.panelEdge}`, borderRadius: 12,
        boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        fontFamily: mono,
      }}>
        {/* Header — click to toggle */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onTogglePanel(); }}
          style={{
            height: CUSTOMERS_HEADER_H, padding: "12px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", borderBottom: isOpen ? `1px solid ${C.panelEdge}` : "none",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.accent }}>◇ MÜŞTERİLER</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
              Customers
              <span style={{ fontSize: 10, color: C.cardSub, fontWeight: 400, marginLeft: 6 }}>
                ({customers.length})
              </span>
            </div>
          </div>
          <div style={{ fontSize: 14, color: C.cardSub }}>{isOpen ? "▾" : "▸"}</div>
        </div>

        {isOpen && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{ padding: "10px 12px", overflowY: "auto", flex: 1 }}
          >
            {(["elektrikli", "gazlı"] as const).map(catKey => {
              const catCustomers = customers.filter(c => c.category === catKey);
              if (catCustomers.length === 0) return null;
              const catLabel = catKey === "elektrikli" ? "Elektrikli müşteriler" : "Gazlı müşteriler";
              const accent = catKey === "elektrikli" ? C.ok : C.info;
              const tag = catKey === "elektrikli" ? "ELK" : "GAZ";
              const isCatOpen = expandedSet.has(`cat:${catKey}`);
              const totalOrders = catCustomers.reduce(
                (s, c) => s + (ordersByCustomer[c.label.toLowerCase()]?.length ?? 0), 0,
              );
              return (
                <div key={catKey} style={{ marginBottom: 8 }}>
                  <div
                    onClick={(e) => { e.stopPropagation(); onToggleCustomer(`cat:${catKey}`); }}
                    style={{
                      padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                      background: isCatOpen ? `${accent}1a` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isCatOpen ? `${accent}66` : C.panelEdge}`,
                      borderLeft: `3px solid ${accent}`,
                    }}
                  >
                    <span style={{
                      fontSize: 9, letterSpacing: 1, fontWeight: 700,
                      color: accent, padding: "1px 5px",
                      background: `${accent}22`, borderRadius: 3,
                    }}>{tag}</span>
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{catLabel}</div>
                    <span style={{ fontSize: 10, color: C.cardSub }}>
                      {catCustomers.length}{totalOrders > 0 && ` · ${totalOrders} sip.`}
                    </span>
                    <span style={{ fontSize: 11, color: C.cardSub }}>{isCatOpen ? "▾" : "▸"}</span>
                  </div>

                  {isCatOpen && (
                    <div style={{ marginTop: 4, paddingLeft: 8 }}>
                      {catCustomers.map(c => {
                        const customerOrders = ordersByCustomer[c.label.toLowerCase()] ?? [];
                        const isExpanded = expandedSet.has(c.id);
                        const hasOrders = customerOrders.length > 0;
                        const catColor = accent;
                        return (
                          <CustomerRow
                            key={c.id}
                            c={c}
                            customerOrders={customerOrders}
                            isExpanded={isExpanded}
                            hasOrders={hasOrders}
                            catColor={catColor}
                            onToggleCustomer={onToggleCustomer}
                            onEditOrder={onEditOrder}
                            onCreateOrderFor={onCreateOrderFor}
                            onRemoveCustomer={onRemoveCustomer}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Kategorisiz müşteri varsa düz olarak listele */}
            {customers.filter(c => c.category !== "elektrikli" && c.category !== "gazlı").map(c => {
              const customerOrders = ordersByCustomer[c.label.toLowerCase()] ?? [];
              const isExpanded = expandedSet.has(c.id);
              const hasOrders = customerOrders.length > 0;
              const catColor = c.category === "elektrikli" ? C.ok
                            : c.category === "gazlı" ? C.info : C.mid;
              return (
                <div key={c.id} style={{ marginBottom: 4 }}>
                  <div
                    onClick={(e) => { e.stopPropagation(); onToggleCustomer(c.id); }}
                    style={{
                      height: CUSTOMERS_CHIP_H,
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "0 10px", borderRadius: 6, cursor: "pointer",
                      background: isExpanded ? "rgba(255,255,255,0.07)" : "transparent",
                      border: hasOrders ? `1px solid ${catColor}66` : `1px solid transparent`,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = isExpanded ? "rgba(255,255,255,0.07)" : "transparent")}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: hasOrders ? catColor : "rgba(255,255,255,0.2)",
                    }} />
                    <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{c.label}</div>
                    {hasOrders && (
                      <span style={{
                        background: `${catColor}22`, color: catColor,
                        padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                      }}>
                        {customerOrders.length}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: C.cardSub }}>{isExpanded ? "▾" : "▸"}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: "4px 6px 8px 24px" }}>
                      {customerOrders.length === 0 ? (
                        <div style={{ fontSize: 10, color: C.cardSub, padding: "4px 0 8px" }}>
                          (henüz sipariş yok)
                        </div>
                      ) : customerOrders.map(o => (
                        <div
                          key={o.id}
                          onClick={(e) => { e.stopPropagation(); onEditOrder(o); }}
                          style={{
                            padding: "8px 10px", marginBottom: 4,
                            background: "rgba(255,255,255,0.04)",
                            border: `1px solid ${C.panelEdge}`,
                            borderRadius: 6, cursor: "pointer",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700 }}>
                            {o.sku} <span style={{ color: C.cardSub, fontWeight: 400 }}>×{fmtTR(o.quantity)}</span>
                          </div>
                          <div style={{ fontSize: 10, color: C.cardSub, marginTop: 2 }}>
                            {o.deadline ? new Date(o.deadline).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={(e) => { e.stopPropagation(); onCreateOrderFor(c.label); }}
                        style={{
                          width: "100%", padding: "5px 8px", marginTop: 2,
                          background: "transparent", border: `1px dashed ${C.cardSub}66`,
                          borderRadius: 5, color: C.cardSub,
                          fontSize: 10, fontFamily: mono, cursor: "pointer",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${C.cardSub}66`; e.currentTarget.style.color = C.cardSub; }}
                      >
                        + sipariş ekle
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (customerOrders.length > 0) {
                            alert(`${c.label} için ${customerOrders.length} sipariş var — önce siparişleri taşıyın/silin.`);
                            return;
                          }
                          if (confirm(`${c.label} müşterisini sil?`)) onRemoveCustomer(c.id);
                        }}
                        style={{
                          width: "100%", padding: "3px 8px", marginTop: 4,
                          background: "transparent", border: "none",
                          color: C.shortfall, fontSize: 9, fontFamily: mono, cursor: "pointer", opacity: 0.6,
                        }}
                      >
                        müşteriyi sil
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add new customer */}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.panelEdge}` }}>
              {!adding ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setAdding(true); }}
                  style={{
                    width: "100%", padding: "6px 10px",
                    background: "transparent", border: `1px dashed ${C.cardSub}66`,
                    borderRadius: 6, color: C.cardSub,
                    fontSize: 11, fontFamily: mono, cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${C.cardSub}66`; e.currentTarget.style.color = C.cardSub; }}
                >
                  + yeni müşteri
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    autoFocus
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newLabel.trim()) {
                        onAddCustomer(newLabel.trim(), newCategory);
                        setNewLabel(""); setAdding(false);
                      }
                      if (e.key === "Escape") { setAdding(false); setNewLabel(""); }
                    }}
                    placeholder="müşteri kodu / adı"
                    style={{
                      padding: "6px 8px", fontSize: 12,
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${C.panelEdge}`, borderRadius: 4,
                      color: C.cardInk, fontFamily: mono, outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["elektrikli", "gazlı"] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={(e) => { e.stopPropagation(); setNewCategory(cat); }}
                        style={{
                          flex: 1, padding: "4px 6px", fontSize: 10, fontFamily: mono,
                          background: newCategory === cat
                            ? (cat === "elektrikli" ? `${C.ok}33` : `${C.info}33`)
                            : "rgba(255,255,255,0.04)",
                          border: `1px solid ${newCategory === cat ? (cat === "elektrikli" ? C.ok : C.info) : C.panelEdge}`,
                          borderRadius: 4, color: C.cardInk, cursor: "pointer",
                        }}
                      >
                        {cat === "elektrikli" ? "elektrikli" : "gazlı"}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (newLabel.trim()) {
                          onAddCustomer(newLabel.trim(), newCategory);
                          setNewLabel(""); setAdding(false);
                        }
                      }}
                      style={{
                        flex: 1, padding: "5px 8px", fontSize: 11, fontWeight: 700,
                        background: C.accent, border: "none", borderRadius: 4,
                        color: "#fff", cursor: "pointer", fontFamily: mono,
                      }}
                    >
                      ekle
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAdding(false); setNewLabel(""); }}
                      style={{
                        padding: "5px 12px", fontSize: 11,
                        background: "transparent", border: `1px solid ${C.panelEdge}`,
                        borderRadius: 4, color: C.cardSub, cursor: "pointer", fontFamily: mono,
                      }}
                    >
                      iptal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DragNode>
  );
}

/* Customer row helper (CustomersPanel altında ortak kullanım) */
function CustomerRow({
  c, customerOrders, isExpanded, hasOrders, catColor,
  onToggleCustomer, onEditOrder, onCreateOrderFor, onRemoveCustomer,
}: {
  c: Customer;
  customerOrders: Order[];
  isExpanded: boolean;
  hasOrders: boolean;
  catColor: string;
  onToggleCustomer: (id: string) => void;
  onEditOrder: (o: Order) => void;
  onCreateOrderFor: (label: string) => void;
  onRemoveCustomer: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={(e) => { e.stopPropagation(); onToggleCustomer(c.id); }}
        style={{
          height: CUSTOMERS_CHIP_H,
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 10px", borderRadius: 6, cursor: "pointer",
          background: isExpanded ? "rgba(255,255,255,0.07)" : "transparent",
          border: hasOrders ? `1px solid ${catColor}66` : `1px solid transparent`,
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = isExpanded ? "rgba(255,255,255,0.07)" : "transparent")}
      >
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: hasOrders ? catColor : "rgba(255,255,255,0.2)",
        }} />
        <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{c.label}</div>
        {hasOrders && (
          <span style={{
            background: `${catColor}22`, color: catColor,
            padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          }}>
            {customerOrders.length}
          </span>
        )}
        <span style={{ fontSize: 11, color: C.cardSub }}>{isExpanded ? "▾" : "▸"}</span>
      </div>
      {isExpanded && (
        <div style={{ padding: "4px 6px 8px 24px" }}>
          {customerOrders.length === 0 ? (
            <div style={{ fontSize: 10, color: C.cardSub, padding: "4px 0 8px" }}>(henüz sipariş yok)</div>
          ) : customerOrders.map(o => (
            <div
              key={o.id}
              onClick={(e) => { e.stopPropagation(); onEditOrder(o); }}
              style={{
                padding: "8px 10px", marginBottom: 4,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${C.panelEdge}`,
                borderRadius: 6, cursor: "pointer", transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            >
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {o.sku} <span style={{ color: C.cardSub, fontWeight: 400 }}>×{fmtTR(o.quantity)}</span>
              </div>
              <div style={{ fontSize: 10, color: C.cardSub, marginTop: 2 }}>
                {o.deadline ? new Date(o.deadline).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
              </div>
            </div>
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); onCreateOrderFor(c.label); }}
            style={{
              width: "100%", padding: "5px 8px", marginTop: 2,
              background: "transparent", border: `1px dashed ${C.cardSub}66`,
              borderRadius: 5, color: C.cardSub,
              fontSize: 10, fontFamily: mono, cursor: "pointer",
            }}
          >+ sipariş ekle</button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (customerOrders.length > 0) {
                alert(`${c.label} için ${customerOrders.length} sipariş var — önce siparişleri taşıyın/silin.`);
                return;
              }
              if (confirm(`${c.label} müşterisini sil?`)) onRemoveCustomer(c.id);
            }}
            style={{
              width: "100%", padding: "3px 8px", marginTop: 4,
              background: "transparent", border: "none",
              color: C.shortfall, fontSize: 9, fontFamily: mono, cursor: "pointer", opacity: 0.6,
            }}
          >müşteriyi sil</button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CATEGORIES PANEL — Elektrikli / Gazlı daireleri, click → filter products
   ──────────────────────────────────────────────────────────────────── */
function CategoriesPanel({
  pos, activeCategory, onMove, onSelect, getMouseInWorld, viewport,
}: {
  pos: XY;
  activeCategory: "elektrikli" | "gazlı" | null;
  onMove: (xy: XY) => void;
  onSelect: (cat: "elektrikli" | "gazlı" | null) => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
}) {
  const W = 220, H = 290;
  return (
    <DragNode pos={pos} width={W} height={H} onDrag={onMove}
      getMouseInWorld={getMouseInWorld} viewport={viewport}>
      <div style={{
        width: W, height: H, background: C.panelBg, color: C.cardInk,
        border: `1px solid ${C.panelEdge}`, borderRadius: 12, padding: 14,
        fontFamily: mono, display: "flex", flexDirection: "column", gap: 10,
        boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: C.accent }}>◇ KATEGORİ</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Cihaz tipi</div>
        </div>
        <div onPointerDown={(e) => e.stopPropagation()}
          style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          {(["elektrikli", "gazlı"] as const).map(cat => {
            const active = activeCategory === cat;
            const accent = cat === "elektrikli" ? C.ok : C.info;
            return (
              <div
                key={cat}
                onClick={(e) => { e.stopPropagation(); onSelect(active ? null : cat); }}
                style={{
                  width: 90, height: 90, borderRadius: "50%",
                  background: active ? `${accent}33` : "rgba(255,255,255,0.06)",
                  border: `2px solid ${active ? accent : C.panelEdge}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: cat === "elektrikli" ? C.ok : C.info, letterSpacing: 1 }}>{cat === "elektrikli" ? "ELK" : "GAZ"}</div>
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: active ? accent : C.cardInk }}>
                  {cat === "elektrikli" ? "Elektrikli" : "Gazlı"}
                </div>
              </div>
            );
          })}
        </div>
        {activeCategory && (
          <div style={{ fontSize: 9, color: C.cardSub, textAlign: "center" }}>
            ürünler filtrelendi · iptal için tekrar tıkla
          </div>
        )}
      </div>
    </DragNode>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PRODUCTS PALETTE — bütün SKU'lar kart olarak, click → sipariş oluştur
   ──────────────────────────────────────────────────────────────────── */
function ProductsPalette({
  pos, activeCategory, orders, onMove, onCreateOrderForSku, getMouseInWorld, viewport,
}: {
  pos: XY;
  activeCategory: "elektrikli" | "gazlı" | null;
  orders: Order[];
  onMove: (xy: XY) => void;
  onCreateOrderForSku: (sku: string) => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
}) {
  // SKU → category heuristic
  const skuCategory = (sku: string): "elektrikli" | "gazlı" =>
    sku.startsWith("GSS") ? "gazlı" : "elektrikli";

  const filtered = ALL_SKUS.filter(sku =>
    !activeCategory || skuCategory(sku) === activeCategory,
  );

  const orderCountBySku: Record<string, number> = {};
  for (const o of orders) orderCountBySku[o.sku] = (orderCountBySku[o.sku] ?? 0) + 1;

  const W = 230;
  const rowH = 38;
  const H = 60 + filtered.length * (rowH + 4);

  return (
    <DragNode pos={pos} width={W} height={H} onDrag={onMove}
      getMouseInWorld={getMouseInWorld} viewport={viewport}>
      <div style={{
        width: W, height: H, background: C.panelBg, color: C.cardInk,
        border: `1px solid ${C.panelEdge}`, borderRadius: 12, padding: 12,
        fontFamily: mono, boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
      }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: C.accent }}>◇ ÜRÜNLER</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
            Mamul kataloğu
            <span style={{ fontSize: 10, color: C.cardSub, fontWeight: 400, marginLeft: 6 }}>
              ({filtered.length}{activeCategory && `/${ALL_SKUS.length}`})
            </span>
          </div>
        </div>
        <div onPointerDown={(e) => e.stopPropagation()}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map(sku => {
            const cat = skuCategory(sku);
            const accent = cat === "elektrikli" ? C.ok : C.info;
            const count = orderCountBySku[sku] ?? 0;
            return (
              <div
                key={sku}
                onClick={(e) => { e.stopPropagation(); onCreateOrderForSku(sku); }}
                style={{
                  height: rowH, padding: "0 10px",
                  display: "flex", alignItems: "center", gap: 8,
                  borderRadius: 6, cursor: "pointer",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${count > 0 ? `${accent}66` : C.panelEdge}`,
                  borderLeft: `3px solid ${accent}`,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              >
                <span style={{ width: 10, height: 10, borderRadius: 2, background: cat === "elektrikli" ? C.ok : C.info, display: "inline-block" }} />
                <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{sku}</span>
                {count > 0 && (
                  <span style={{
                    background: `${accent}22`, color: accent,
                    padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                  }}>{count}</span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 9, color: C.cardSub, textAlign: "center", marginTop: 8 }}>
          tıkla → o SKU ile sipariş aç
        </div>
      </div>
    </DragNode>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PRODUCTION STAGES — Üretim / Depo / Satış halkaları, drill-down
   Tıkla → o aşamadaki sipariş listesi açılır
   ──────────────────────────────────────────────────────────────────── */

// Bir siparişi 60% üretim + 25% depo + 15% satış olarak böl (proxy)
function splitOrderByStage(o: Order) {
  const prod = Math.floor(o.quantity * 0.6);
  const depo = Math.floor(o.quantity * 0.25);
  const sat = o.quantity - prod - depo;
  return { prod, depo, sat };
}

function ProductionStagesPanel({
  pos, orders, onMove, onSelectOrder, getMouseInWorld, viewport,
}: {
  pos: XY;
  orders: Order[];
  onMove: (xy: XY) => void;
  onSelectOrder: (o: Order) => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
}) {
  const [openStage, setOpenStage] = useState<"uretim" | "depo" | "satis" | null>(null);

  const stageData = useMemo(() => {
    const items = {
      uretim: [] as Array<{ o: Order; qty: number }>,
      depo:   [] as Array<{ o: Order; qty: number }>,
      satis:  [] as Array<{ o: Order; qty: number }>,
    };
    for (const o of orders) {
      const split = splitOrderByStage(o);
      if (split.prod > 0) items.uretim.push({ o, qty: split.prod });
      if (split.depo > 0) items.depo.push({ o, qty: split.depo });
      if (split.sat  > 0) items.satis.push({ o, qty: split.sat });
    }
    return items;
  }, [orders]);

  const totalProd = stageData.uretim.reduce((s, x) => s + x.qty, 0);
  const totalDepo = stageData.depo.reduce((s, x) => s + x.qty, 0);
  const totalSat  = stageData.satis.reduce((s, x) => s + x.qty, 0);

  const stages = [
    { key: "uretim" as const, label: "Üretim", qty: totalProd, color: C.warn, items: stageData.uretim },
    { key: "depo"   as const, label: "Depo",   qty: totalDepo, color: C.info, items: stageData.depo },
    { key: "satis"  as const, label: "Satış",  qty: totalSat,  color: C.ok,   items: stageData.satis },
  ];

  const W = 220;
  const baseH = 80;
  const stageRowH = 80;
  const expandedExtra = (key: "uretim" | "depo" | "satis") => {
    if (openStage !== key) return 0;
    const items = stages.find(s => s.key === key)!.items;
    return items.length === 0 ? 32 : items.length * 50 + 12;
  };
  const H = baseH + stageRowH * 3 + expandedExtra("uretim") + expandedExtra("depo") + expandedExtra("satis") + 14;

  return (
    <DragNode pos={pos} width={W} height={H} onDrag={onMove}
      getMouseInWorld={getMouseInWorld} viewport={viewport}>
      <div style={{
        width: W, height: H, background: C.panelBg, color: C.cardInk,
        border: `1px solid ${C.panelEdge}`, borderRadius: 12, padding: 14,
        fontFamily: mono, boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
      }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: C.accent }}>◇ AKIŞ</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Üretim hattı</div>
        </div>

        <div onPointerDown={(e) => e.stopPropagation()}>
          {stages.map(stage => {
            const isOpen = openStage === stage.key;
            return (
              <div key={stage.key} style={{ marginBottom: 6 }}>
                <div
                  onClick={(e) => { e.stopPropagation(); setOpenStage(isOpen ? null : stage.key); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 4px",
                    cursor: "pointer", borderRadius: 6,
                    background: isOpen ? `${stage.color}1a` : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: `${stage.color}22`, border: `2px solid ${stage.color}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: stage.color,
                  }}>{stage.label}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtTR(stage.qty)}</div>
                    <div style={{ fontSize: 9, color: C.cardSub }}>{stage.items.length} cihaz</div>
                  </div>
                  <span style={{ fontSize: 11, color: C.cardSub }}>{isOpen ? "▾" : "▸"}</span>
                </div>
                {isOpen && (
                  <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                    {stage.items.length === 0 ? (
                      <div style={{ fontSize: 10, color: C.cardSub, padding: "4px 0" }}>(boş)</div>
                    ) : stage.items.map(({ o, qty }) => (
                      <div
                        key={o.id}
                        onClick={(e) => { e.stopPropagation(); onSelectOrder(o); }}
                        style={{
                          padding: "6px 8px", marginBottom: 3,
                          background: "rgba(255,255,255,0.04)",
                          border: `1px solid ${C.panelEdge}`,
                          borderLeft: `3px solid ${stage.color}`,
                          borderRadius: 4, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700 }}>{o.sku}</div>
                          <div style={{ fontSize: 9, color: C.cardSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.customer}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: stage.color }}>×{fmtTR(qty)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DragNode>
  );
}

/* ════════════════════════════════════════════════════════════════════
   FACTORY WIDGET — fabrika ikonu (decorative + status)
   ──────────────────────────────────────────────────────────────────── */
function FactoryWidget({
  pos, orderCount, onMove, getMouseInWorld, viewport,
}: {
  pos: XY;
  orderCount: number;
  onMove: (xy: XY) => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
}) {
  const W = 140, H = 140;
  return (
    <DragNode pos={pos} width={W} height={H} onDrag={onMove}
      getMouseInWorld={getMouseInWorld} viewport={viewport}>
      <div style={{
        width: W, height: H, background: C.panelBg, color: C.cardInk,
        border: `1px solid ${C.panelEdge}`, borderRadius: 12, padding: 12,
        fontFamily: mono, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 6,
        boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
      }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: C.cardSub, fontWeight: 700, padding: "16px 0" }}>FABRİKA</div>
        <div style={{ fontSize: 11, fontWeight: 700 }}>Fabrika</div>
        <div style={{ fontSize: 9, color: C.cardSub }}>
          {orderCount === 0 ? "boşta" : `${orderCount} aktif sipariş`}
        </div>
      </div>
    </DragNode>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SUPPLY EQUATION — paylaşılan bileşen + qty + lead, Tepkime'ye besleme
   ──────────────────────────────────────────────────────────────────── */
interface SupplyEntry { id: string; code: string; qty: number; leadDays: number; }

function SupplyEquationPanel({
  pos, entries, onMove, onChange, onApplyToFlask, getMouseInWorld, viewport,
}: {
  pos: XY;
  entries: SupplyEntry[];
  onMove: (xy: XY) => void;
  onChange: (next: SupplyEntry[]) => void;
  onApplyToFlask: (entries: SupplyEntry[]) => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
}) {
  const W = 280;
  const rowH = 78;
  const H = 100 + entries.length * rowH + 70;
  const maxLead = entries.reduce((m, e) => Math.max(m, e.leadDays), 0);

  return (
    <DragNode pos={pos} width={W} height={H} onDrag={onMove}
      getMouseInWorld={getMouseInWorld} viewport={viewport}>
      <div style={{
        width: W, height: H, background: C.panelBg, color: C.cardInk,
        border: `2px solid ${C.shortfall}66`, borderRadius: 12, padding: 14,
        fontFamily: mono, boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
      }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: C.shortfall }}>◇ TEDARİK DENKLEMİ</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Paylaşılan bileşenler</div>
        </div>

        <div onPointerDown={(e) => e.stopPropagation()}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {entries.map(en => (
            <div key={en.id} style={{
              padding: 8, borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${C.panelEdge}`,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: C.cardSub, color: C.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700,
                }}>{en.code}</div>
                <input
                  value={en.code}
                  onChange={(e) => onChange(entries.map(x => x.id === en.id ? { ...x, code: e.target.value } : x))}
                  style={{
                    flex: 1, fontSize: 11, padding: "4px 6px",
                    background: "transparent", border: `1px solid ${C.panelEdge}`,
                    borderRadius: 4, color: C.cardInk, fontFamily: mono,
                  }}
                />
                <button
                  onClick={() => onChange(entries.filter(x => x.id !== en.id))}
                  style={{
                    background: "transparent", border: "none", color: C.cardSub,
                    cursor: "pointer", fontSize: 12, padding: "2px 4px", fontFamily: mono,
                  }}
                >✕</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: C.cardSub, width: 30 }}>×</span>
                <input
                  type="number" min={1}
                  value={en.qty}
                  onChange={(e) => onChange(entries.map(x => x.id === en.id ? { ...x, qty: parseInt(e.target.value, 10) || 0 } : x))}
                  style={{
                    flex: 1, fontSize: 11, padding: "4px 6px",
                    background: "transparent", border: `1px solid ${C.panelEdge}`,
                    borderRadius: 4, color: C.cardInk, fontFamily: mono, textAlign: "right",
                  }}
                />
                <span style={{ fontSize: 10, color: C.cardSub }}>→</span>
                <input
                  type="number" min={1}
                  value={en.leadDays}
                  onChange={(e) => onChange(entries.map(x => x.id === en.id ? { ...x, leadDays: parseInt(e.target.value, 10) || 0 } : x))}
                  style={{
                    width: 50, fontSize: 11, padding: "4px 6px",
                    background: "transparent", border: `1px solid ${C.panelEdge}`,
                    borderRadius: 4, color: C.cardInk, fontFamily: mono, textAlign: "right",
                  }}
                />
                <span style={{ fontSize: 10, color: C.cardSub }}>g</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const id = `sup_${Date.now().toString(36)}`;
            onChange([...entries, { id, code: "?", qty: 100, leadDays: 14 }]);
          }}
          style={{
            width: "100%", padding: "5px 8px", marginTop: 6,
            background: "transparent", border: `1px dashed ${C.cardSub}66`,
            borderRadius: 5, color: C.cardSub,
            fontSize: 10, fontFamily: mono, cursor: "pointer",
          }}
        >
          + bileşen ekle
        </button>

        <div style={{
          marginTop: 8, padding: "8px 10px",
          background: `${C.shortfall}22`, border: `1px solid ${C.shortfall}66`,
          borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 10, color: C.cardSub }}>max tedarik</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.shortfall }}>{maxLead} gün</span>
        </div>

        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onApplyToFlask(entries); }}
          disabled={entries.length === 0}
          style={{
            width: "100%", padding: "6px 10px", marginTop: 6,
            background: entries.length === 0 ? "transparent" : C.accent,
            border: `1px solid ${entries.length === 0 ? C.panelEdge : C.accent}`,
            borderRadius: 6, color: entries.length === 0 ? C.cardSub : "#fff",
            fontSize: 11, fontFamily: mono, fontWeight: 700,
            cursor: entries.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          Tepkime'ye uygula
        </button>
      </div>
    </DragNode>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CUSTOMERS SCENE — bireysel atomlar (X stadyum kart stili) + kıvrımlı
   bezier oklar. Customers Senaryosu için. Her atom DragNode, pozisyonlar
   posOverrides["scene"] altında persist edilir.
   ──────────────────────────────────────────────────────────────────── */

type SceneAtomKind =
  | "label" | "customer-chip" | "category" | "product" | "stage"
  | "factory" | "component" | "bom-item" | "subassembly" | "lead-pill" | "deadline-pill" | "flask"
  | "supply-bracket" | "timeline-s1" | "timeline-s2";

interface SceneAtom {
  id: string;
  kind: SceneAtomKind;
  label: string;
  x: number; y: number; w: number; h: number;
  highlight?: "green" | "blue" | "red" | null;
  sub?: string;
}

/* BOM tree drill-down — xls'lerden tam Tier 1/Tier 2 hiyerarşisi
   (shared/strategy-bom-tree.json'dan). children.length>0 olan T1 = yarı-mamül. */
interface BomLeaf { code: string; name: string; stock: number | null }
interface BomT1 { code: string; name: string; stock: number | null; children: BomLeaf[] }
const DEVICE_BOM_TREE = bomTreeRaw as Record<string, BomT1[]>;

const CRITICAL_PATTERNS = [
  /\bAmpul\b/i, /Radyant Boru/i, /U Borusu/i, /Yanma Borusu/i, /CC.*Izgara/i,
  /Brülör Ateşleme/i,
];
const isCriticalBom = (name: string): boolean =>
  CRITICAL_PATTERNS.some(rx => rx.test(name));

const compactName = (s: string): string => {
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length > 32 ? cleaned.slice(0, 30) + "…" : cleaned;
};


interface SceneEdge {
  fromId: string; toId: string;
  color?: string;
  dashed?: boolean;
  label?: string;
  curveK?: number;  // bezier control offset multiplier
  fromPort?: "n"|"s"|"e"|"w";
  toPort?: "n"|"s"|"e"|"w";
}

// Sahne kurulumu — kullanıcının senaryo fotoğrafına yakın layout, draggable
function makeDefaultSceneAtoms(): SceneAtom[] {
  // X = 0 sol, sağa doğru artar. Y = 0 üst, aşağı artar.
  const atoms: SceneAtom[] = [];

  // Customers label
  atoms.push({ id: "lbl-customers", kind: "label", label: "Customers", x: 60, y: 380, w: 130, h: 44 });

  // Customer chips (sol kolon)
  const chipX = 240;
  const customerSpec: Array<{ id: string; label: string; hl?: "green" | "blue" }> = [
    { id: "c-En", label: "En" },
    { id: "c-E3", label: "E3", hl: "green" },
    { id: "c-E2", label: "E2" },
    { id: "c-E1", label: "E1" },
    { id: "c-G1", label: "G1" },
    { id: "c-G2", label: "G2", hl: "blue" },
    { id: "c-G3", label: "G3" },
    { id: "c-Gn", label: "Gn" },
  ];
  customerSpec.forEach((c, i) => {
    atoms.push({
      id: c.id, kind: "customer-chip", label: c.label,
      x: chipX, y: 100 + i * 76, w: 110, h: 40, highlight: c.hl,
    });
  });

  // Categories (Elektrikli, Gazlı) — büyük gri daireler
  atoms.push({ id: "cat-elektrikli", kind: "category", label: "Elektrikli", x: 540, y: 220, w: 150, h: 150 });
  atoms.push({ id: "cat-gazli",      kind: "category", label: "Gazlı",     x: 540, y: 540, w: 150, h: 150 });

  // Products — gerçek cihazlar (xls reçetelerinden, fuel BOM kanıtları)
  // ELEKTRİKLİ kolon (Elektrikli kategori dairesinin yanı, üst yarı)
  atoms.push({ id: "p-GSA15",      kind: "product", label: "GSA15",      x: 800, y:  70, w: 180, h: 60, highlight: "green" });
  atoms.push({ id: "p-GSA20",      kind: "product", label: "GSA20",      x: 800, y: 140, w: 180, h: 56 });
  atoms.push({ id: "p-GSA30",      kind: "product", label: "GSA30",      x: 800, y: 210, w: 180, h: 56 });
  atoms.push({ id: "p-GSS20P",     kind: "product", label: "GSS20P",     x: 800, y: 280, w: 180, h: 60 });
  atoms.push({ id: "p-GSS40P",     kind: "product", label: "GSS40P",     x: 800, y: 350, w: 180, h: 56 });
  // GAZLI kolon (alt yarı)
  atoms.push({ id: "p-ELT.5-7",    kind: "product", label: "ELT.5-7",    x: 800, y: 460, w: 180, h: 56 });
  atoms.push({ id: "p-ELT.7-11",   kind: "product", label: "ELT.7-11",   x: 800, y: 530, w: 180, h: 56 });
  atoms.push({ id: "p-BH.50ST.SV", kind: "product", label: "BH.50ST.SV", x: 800, y: 600, w: 180, h: 56 });
  atoms.push({ id: "p-BH.50UT.SV", kind: "product", label: "BH.50UT.SV", x: 800, y: 670, w: 180, h: 56 });
  atoms.push({ id: "p-BH.55ST.SV", kind: "product", label: "BH.55ST.SV", x: 800, y: 740, w: 180, h: 60, highlight: "blue" });
  atoms.push({ id: "p-BH.55UT.SV", kind: "product", label: "BH.55UT.SV", x: 800, y: 810, w: 180, h: 56 });

  // Deadline pills
  atoms.push({ id: "pill-d-E3", kind: "deadline-pill", label: "Teslim = 1 Haz",  x: 540, y:  70, w: 150, h: 36, highlight: "green" });
  atoms.push({ id: "pill-d-G2", kind: "deadline-pill", label: "Teslim = 15 Mayıs", x: 540, y: 750, w: 170, h: 36, highlight: "blue" });

  // Lead pills
  atoms.push({ id: "pill-lead-GSA15",  kind: "lead-pill", label: "30 gün", x: 1080, y:  80, w: 90, h: 36, highlight: "green" });
  atoms.push({ id: "pill-lead-GSS20P", kind: "lead-pill", label: "10 gün", x: 1080, y: 290, w: 90, h: 36 });

  // Stages — ana akış kolonu (mamuller 800X, stage 1100X)
  atoms.push({ id: "stg-uretim", kind: "stage", label: "Üretim", x: 1100, y: 200, w: 130, h: 130 });
  atoms.push({ id: "stg-depo",   kind: "stage", label: "Depo",   x: 1100, y: 380, w: 130, h: 130 });
  atoms.push({ id: "stg-satis",  kind: "stage", label: "Satış",  x: 1100, y: 560, w: 130, h: 130 });

  // Factory
  atoms.push({ id: "fact",  kind: "factory", label: "Fabrika", x: 1340, y: 420, w: 150, h: 130 });

  // Flask
  atoms.push({ id: "flask", kind: "flask", label: "Tepkime · GSA 15  GSS20P", x: 760, y: 880, w: 280, h: 100 });

  // S1 ve S2 timeline kartları (alt iki kolon)
  atoms.push({ id: "tl-s1", kind: "timeline-s1", label: "S1", x: 80,  y: 1050, w: 760, h: 380 });
  atoms.push({ id: "tl-s2", kind: "timeline-s2", label: "S2", x: 920, y: 1050, w: 800, h: 380 });

  return atoms;
}

const SCENE_EDGES: SceneEdge[] = [
  // Customers label → all chips (faint dashed)
  ...["c-En","c-E3","c-E2","c-E1","c-G1","c-G2","c-G3","c-Gn"].map(id => ({
    fromId: "lbl-customers", toId: id, dashed: true, color: "rgba(255,255,255,0.18)",
  })),
  // E3 (yeşil) → Elektrikli daire (chip sağ port → daire sol port)
  { fromId: "c-E3", toId: "cat-elektrikli", fromPort: "e", toPort: "w", color: "#10b981", dashed: true, label: "x200", curveK: 0.4 },
  // G2 (mavi) → Gazlı daire
  { fromId: "c-G2", toId: "cat-gazli", fromPort: "e", toPort: "w", color: "#38bdf8", dashed: true, label: "x50", curveK: 0.4 },

  // Elektrikli (yeşil fan) → 5 cihaz: dairenin sağ port'undan cihazın sol port'una
  { fromId: "cat-elektrikli", toId: "p-GSA15",  fromPort: "e", toPort: "w", dashed: true, color: "#10b981",                  curveK: 0.5 },
  { fromId: "cat-elektrikli", toId: "p-GSA20",  fromPort: "e", toPort: "w", dashed: true, color: "rgba(16,185,129,0.55)",    curveK: 0.5 },
  { fromId: "cat-elektrikli", toId: "p-GSA30",  fromPort: "e", toPort: "w", dashed: true, color: "rgba(16,185,129,0.55)",    curveK: 0.5 },
  { fromId: "cat-elektrikli", toId: "p-GSS20P", fromPort: "e", toPort: "w", dashed: true, color: "#10b981",                  curveK: 0.5 },
  { fromId: "cat-elektrikli", toId: "p-GSS40P", fromPort: "e", toPort: "w", dashed: true, color: "rgba(16,185,129,0.55)",    curveK: 0.5 },

  // Gazlı (mavi fan) → 6 cihaz: dairenin sağ port'undan cihazın sol port'una
  { fromId: "cat-gazli", toId: "p-ELT.5-7",    fromPort: "e", toPort: "w", dashed: true, color: "rgba(56,189,248,0.55)", curveK: 0.5 },
  { fromId: "cat-gazli", toId: "p-ELT.7-11",   fromPort: "e", toPort: "w", dashed: true, color: "rgba(56,189,248,0.55)", curveK: 0.5 },
  { fromId: "cat-gazli", toId: "p-BH.50ST.SV", fromPort: "e", toPort: "w", dashed: true, color: "rgba(56,189,248,0.55)", curveK: 0.5 },
  { fromId: "cat-gazli", toId: "p-BH.50UT.SV", fromPort: "e", toPort: "w", dashed: true, color: "rgba(56,189,248,0.55)", curveK: 0.5 },
  { fromId: "cat-gazli", toId: "p-BH.55ST.SV", fromPort: "e", toPort: "w", dashed: true, color: "#38bdf8",               curveK: 0.5 }, // G2 sipariş hattı
  { fromId: "cat-gazli", toId: "p-BH.55UT.SV", fromPort: "e", toPort: "w", dashed: true, color: "rgba(56,189,248,0.55)", curveK: 0.5 },

  // GSA15 → Üretim, Depo, Satış (yeşil — E3 sipariş zinciri)
  { fromId: "p-GSA15", toId: "stg-uretim", color: "#10b981", dashed: true, label: "x100", curveK: 0.35 },
  { fromId: "p-GSA15", toId: "stg-depo",   color: "#10b981", dashed: true, label: "x50",  curveK: 0.5 },
  { fromId: "p-GSA15", toId: "stg-satis",  color: "#10b981", dashed: true, label: "x50",  curveK: 0.7 },

  // GSS20P → Üretim (elektrikli, paylaşılan komponent zinciri için)
  { fromId: "p-GSS20P", toId: "stg-uretim", color: "rgba(255,255,255,0.5)", dashed: true, curveK: 0.4 },

  // BH.55ST.SV → Üretim (mavi — G2 sipariş zinciri, ana gazlı hat)
  { fromId: "p-BH.55ST.SV", toId: "stg-uretim", color: "#38bdf8", dashed: true, label: "x50", curveK: 0.4 },

  // Stages → Factory
  { fromId: "stg-uretim", toId: "fact", color: "rgba(255,255,255,0.6)", dashed: true },
  { fromId: "stg-depo",   toId: "fact", color: "rgba(255,255,255,0.6)", dashed: true },
  { fromId: "stg-satis",  toId: "fact", color: "rgba(255,255,255,0.6)", dashed: true },

  // Lead pill → ilgili akış
  { fromId: "pill-lead-GSA15",  toId: "stg-uretim", color: "rgba(16,185,129,0.4)", dashed: true },
  { fromId: "pill-lead-GSS20P", toId: "stg-uretim", color: "rgba(255,255,255,0.4)", dashed: true },

  // Deadline pill → müşteri chip
  { fromId: "pill-d-E3", toId: "c-E3", color: "rgba(16,185,129,0.5)", dashed: true },
  { fromId: "pill-d-G2", toId: "c-G2", color: "rgba(56,189,248,0.5)", dashed: true },

  // Flask → mamul kartları (görsel bağ)
  { fromId: "p-GSA15",  toId: "flask", color: "rgba(16,185,129,0.4)", dashed: true, curveK: 0.6 },
  { fromId: "p-GSS20P", toId: "flask", color: "rgba(255,255,255,0.4)", dashed: true, curveK: 0.6 },

  // Flask → S1, S2 timeline kartları
  { fromId: "flask", toId: "tl-s1", color: "rgba(255,255,255,0.5)", dashed: false },
  { fromId: "flask", toId: "tl-s2", color: "rgba(255,255,255,0.5)", dashed: false },
];

// Atom merkezi hesabı — port'a göre kenar noktası
function atomCenter(a: SceneAtom): { x: number; y: number } {
  return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
}
function atomPort(a: SceneAtom, port?: "n"|"s"|"e"|"w"): { x: number; y: number } {
  const c = atomCenter(a);
  if (!port) return c;
  if (port === "n") return { x: c.x, y: a.y };
  if (port === "s") return { x: c.x, y: a.y + a.h };
  if (port === "e") return { x: a.x + a.w, y: c.y };
  return { x: a.x, y: c.y };
}

// Hangi atom hangi gruba ait — grup kapalıysa bu id'ler gizlenir.
// Kategori daireye tıklayınca o kategorinin cihazları açılıp/kapanıyor.
const SCENE_GROUP_MEMBERS: Record<string, string[]> = {
  customers: ["c-En","c-E3","c-E2","c-E1","c-G1","c-G2","c-G3","c-Gn"],
  "cat-elektrikli": ["p-GSA15","p-GSA20","p-GSA30","p-GSS20P","p-GSS40P","pill-lead-GSA15","pill-lead-GSS20P"],
  "cat-gazli":      ["p-ELT.5-7","p-ELT.7-11","p-BH.50ST.SV","p-BH.50UT.SV","p-BH.55ST.SV","p-BH.55UT.SV"],
};

/* ════════════════════════════════════════════════════════════════════
   DEVICE REGISTRY — xls reçetelerinden türetildi (BOM kanıtları)
   GAZLI: ELT.* (Gaz Flexi Nipeli), BH.* (Yanma Borusu)
   ELEKTRİKLİ: GSA.* (Su Geçirmez Ampul, Watt), GSS.* (Watt portatif)
   ──────────────────────────────────────────────────────────────────── */
type DeviceFuel = "elektrikli" | "gazli";
interface DeviceMeta {
  code: string; name: string; family: "BH" | "ELT" | "GSA" | "GSS";
  fuel: DeviceFuel; power?: string; note?: string;
}

const DEVICE_REGISTRY: DeviceMeta[] = [
  // GAZLI — ELT (Goldsun Elite Seramik Plakalı Camlı Radyant)
  { code: "ELT.5-7",    family: "ELT", fuel: "gazli", name: "Goldsun Elite Seramik 5-7",  power: "5-7 kW",  note: "ofis seramik radyant" },
  { code: "ELT.7-11",   family: "ELT", fuel: "gazli", name: "Goldsun Elite Seramik 7-11", power: "7-11 kW", note: "büyük proje seramik radyant" },
  // GAZLI — BH (Blackheat Borulu Üniter Radyant)
  { code: "BH.50ST.SV", family: "BH",  fuel: "gazli", name: "Blackheat 50 Düz Tip", power: "50 kW", note: "sanayi düz boru ST" },
  { code: "BH.50UT.SV", family: "BH",  fuel: "gazli", name: "Blackheat 50 U Tip",   power: "50 kW", note: "sanayi U-tip" },
  { code: "BH.55ST.SV", family: "BH",  fuel: "gazli", name: "Blackheat 55 Düz Tip", power: "55 kW", note: "sanayi düz boru ST (en yüksek hacim)" },
  { code: "BH.55UT.SV", family: "BH",  fuel: "gazli", name: "Blackheat 55 U Tip",   power: "55 kW", note: "sanayi U-tip" },
  // ELEKTRİKLİ — GSA (Goldsun Aqua Duvar Tipi, Su Geçirmez Ampul)
  { code: "GSA15",      family: "GSA", fuel: "elektrikli", name: "Goldsun Aqua 1500 W Duvar", power: "1500 W", note: "duvar IR ampul" },
  { code: "GSA20",      family: "GSA", fuel: "elektrikli", name: "Goldsun Aqua 2000 W Duvar", power: "2000 W", note: "duvar IR ampul" },
  { code: "GSA30",      family: "GSA", fuel: "elektrikli", name: "Goldsun Aqua 3000 W",       power: "3000 W", note: "çift ampul varyant" },
  // ELEKTRİKLİ — GSS (Goldsun Supra Plus, Portatif)
  { code: "GSS20P",     family: "GSS", fuel: "elektrikli", name: "Goldsun Supra Plus 2000 W", power: "2000 W", note: "portatif IR" },
  { code: "GSS40P",     family: "GSS", fuel: "elektrikli", name: "Goldsun Supra Plus 4000 W", power: "4000 W", note: "portatif büyük IR" },
];

const devicesByFuel = (fuel: DeviceFuel) => DEVICE_REGISTRY.filter(d => d.fuel === fuel);

/* ════════════════════════════════════════════════════════════════════
   ShapesToolbar — sahnenin sol kenarında dikey ribbon (AutoCAD-vari).
   Seçili atomlara şekil uygular; 2+ seçim varsa ok butonu pairwise edge.
   ──────────────────────────────────────────────────────────────────── */
function ShapesToolbar({
  selectedIds, atomById, onApplyShape, onClearShape, onAddArrow,
  customEdgeCount, onClearCustomEdges,
}: {
  selectedIds: Set<string>;
  atomById: Record<string, SceneAtom>;
  onApplyShape: (kind: ShapeKind) => void;
  onClearShape: () => void;
  onAddArrow: () => void;
  customEdgeCount: number;
  onClearCustomEdges: () => void;
}) {
  const validSelected = Array.from(selectedIds).filter(id => atomById[id]);
  const hasShapeTarget = validSelected.length >= 1;
  const hasArrowTarget = validSelected.length >= 2;
  const btn = (enabled: boolean): React.CSSProperties => ({
    width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.panelEdge}`,
    borderRadius: 6,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.35,
    color: C.cardInk,
    transition: "background 0.1s, border-color 0.1s",
  });
  const sectionLabel: React.CSSProperties = {
    fontSize: 8, color: C.cardSub, letterSpacing: 1.5,
    fontFamily: mono, fontWeight: 600, textTransform: "uppercase",
    marginBottom: 4, marginTop: 6,
  };
  return (
    <div style={{
      position: "absolute", top: 12, left: 12, zIndex: 20,
      width: 56,
      background: C.cardBg, color: C.cardInk,
      border: `1px solid ${C.panelEdge}`,
      borderRadius: 10, padding: 8,
      fontFamily: mono,
      boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    }}>
      <div style={{ ...sectionLabel, marginTop: 0 }}>Şekil</div>
      <button
        title="Dikdörtgen — seçili atomları köşeli yap"
        onClick={() => hasShapeTarget && onApplyShape("rect")}
        style={btn(hasShapeTarget)}
      >
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
          <rect x="1" y="1" width="16" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button
        title="Yuvarlak köşe — seçili atomları yuvarlak köşeli yap"
        onClick={() => hasShapeTarget && onApplyShape("rounded")}
        style={btn(hasShapeTarget)}
      >
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
          <rect x="1" y="1" width="16" height="12" rx="5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button
        title="Daire — seçili atomları daireye dönüştür"
        onClick={() => hasShapeTarget && onApplyShape("circle")}
        style={btn(hasShapeTarget)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button
        title="Üçgen — seçili atomları üçgene dönüştür"
        onClick={() => hasShapeTarget && onApplyShape("triangle")}
        style={btn(hasShapeTarget)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <polygon points="8,2 14,14 2,14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        title="Şekli sıfırla — seçili atomları doğal kind'ine döndür"
        onClick={() => hasShapeTarget && onClearShape()}
        style={btn(hasShapeTarget)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8a5 5 0 1 1 1.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M3 5v3h3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={sectionLabel}>Bağlantı</div>
      <button
        title="Ok — 2+ atom seçili iken aralarına kalıcı edge ekle"
        onClick={() => hasArrowTarget && onAddArrow()}
        style={btn(hasArrowTarget)}
      >
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
          <line x1="2" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.5" />
          <polyline points="12,2 17,6 12,10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </button>
      <button
        title={`Tüm kullanıcı oklarını sil${customEdgeCount > 0 ? ` (${customEdgeCount})` : ""}`}
        onClick={() => customEdgeCount > 0 && onClearCustomEdges()}
        style={btn(customEdgeCount > 0)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {customEdgeCount > 0 && (
        <div style={{
          fontSize: 9, color: C.cardSub, fontFamily: mono,
          marginTop: 2, fontWeight: 600,
        }}>
          {customEdgeCount}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CommandBar — sahnenin altında AutoCAD-vari komut satırı.
   Komutlar: /siparis <no>, /teslim <tarih>
   Seçili atomlara meta uygular; sonuç + hata pill'i input üstünde.
   ──────────────────────────────────────────────────────────────────── */
interface CommandSpec {
  name: string;
  syntax: string;
  hint: string;
}

const COMMAND_SPECS: CommandSpec[] = [
  { name: "siparis", syntax: "/siparis <no>", hint: "Seçili atom(lar)a sipariş numarası ata" },
  { name: "teslim",  syntax: "/teslim <tarih>", hint: "Seçili atom(lar)a teslim tarihi ata (örn: 15 Mayıs, 2026-05-15)" },
];

type CommandResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function CommandBar({
  selectedIds, atomById, onApplyMeta, onClearMeta, edgePalette,
}: {
  selectedIds: Set<string>;
  atomById: Record<string, SceneAtom>;
  onApplyMeta: (ids: string[], patch: AtomMeta) => void;
  onClearMeta: (ids: string[]) => void;
  edgePalette: EdgePalette;
}) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CommandResult | null>(null);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const historyRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const validIds = useMemo(
    () => Array.from(selectedIds).filter(id => atomById[id]),
    [selectedIds, atomById],
  );

  const trimmed = input.trim();
  const showSuggest = trimmed.startsWith("/") && trimmed.split(/\s+/)[0].length <= 8;
  const suggestions = useMemo(() => {
    if (!showSuggest) return [];
    const q = trimmed.replace(/^\//, "").toLowerCase();
    return COMMAND_SPECS.filter(c => c.name.startsWith(q));
  }, [trimmed, showSuggest]);

  const runCommand = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    historyRef.current = [text, ...historyRef.current.filter(t => t !== text)].slice(0, 30);
    setHistoryIdx(-1);

    // /komut formatı; / olmasa da kabul
    const stripped = text.replace(/^\//, "");
    const space = stripped.indexOf(" ");
    const cmd = (space === -1 ? stripped : stripped.slice(0, space)).toLowerCase();
    const arg = (space === -1 ? "" : stripped.slice(space + 1)).trim();

    if (validIds.length === 0) {
      setResult({ ok: false, message: "Önce bir veya daha fazla atom seç (shift+click)." });
      return;
    }

    if (cmd === "siparis" || cmd === "sipariş" || cmd === "order") {
      if (!arg) {
        setResult({ ok: false, message: `Sipariş numarası eksik. Örn: /siparis 12345` });
        return;
      }
      onApplyMeta(validIds, { orderNumber: arg });
      setResult({ ok: true, message: `${validIds.length} atom · sipariş = ${arg}` });
      setInput("");
      return;
    }

    if (cmd === "teslim" || cmd === "deadline" || cmd === "tarih") {
      if (!arg) {
        setResult({ ok: false, message: `Teslim tarihi eksik. Örn: /teslim 15 Mayıs` });
        return;
      }
      onApplyMeta(validIds, { deadline: arg });
      setResult({ ok: true, message: `${validIds.length} atom · teslim = ${arg}` });
      setInput("");
      return;
    }

    if (cmd === "sil" || cmd === "clear") {
      onClearMeta(validIds);
      setResult({ ok: true, message: `${validIds.length} atom · meta silindi` });
      setInput("");
      return;
    }

    if (cmd === "yardim" || cmd === "yardım" || cmd === "help" || cmd === "?") {
      setResult({ ok: true, message: COMMAND_SPECS.map(c => c.syntax).join("  ·  ") });
      setInput("");
      return;
    }

    setResult({ ok: false, message: `Bilinmeyen komut: "${cmd}". /yardim ile listele.` });
  }, [validIds, onApplyMeta, onClearMeta]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runCommand(input);
      return;
    }
    if (e.key === "Escape") {
      setInput("");
      setResult(null);
      setHistoryIdx(-1);
      return;
    }
    if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      setInput(`/${suggestions[0].name} `);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(historyRef.current.length - 1, historyIdx + 1);
      if (next >= 0 && historyRef.current[next] !== undefined) {
        setHistoryIdx(next);
        setInput(historyRef.current[next]);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) {
        setHistoryIdx(-1);
        setInput("");
      } else {
        setHistoryIdx(next);
        setInput(historyRef.current[next] ?? "");
      }
      return;
    }
  };

  return (
    <div style={{
      position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 25,
      display: "flex", flexDirection: "column", gap: 6,
      pointerEvents: "none",
    }}>
      {/* Suggest dropdown — input'un üstünde */}
      {showSuggest && suggestions.length > 0 && (
        <div style={{
          alignSelf: "flex-start",
          background: C.cardBg, color: C.cardInk,
          border: `1px solid ${C.panelEdge}`,
          borderRadius: 8, padding: 6, minWidth: 320, maxWidth: 520,
          fontFamily: mono, fontSize: 11,
          boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
          pointerEvents: "auto",
        }}>
          <div style={{
            fontSize: 9, color: C.cardSub, letterSpacing: 1.4,
            padding: "2px 6px 4px", borderBottom: `1px solid ${C.panelEdge}`,
            marginBottom: 4,
          }}>KOMUTLAR · TAB ile tamamla</div>
          {suggestions.map(s => (
            <button
              key={s.name}
              onClick={() => { setInput(`/${s.name} `); inputRef.current?.focus(); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "5px 6px", borderRadius: 4,
                background: "transparent", border: "none", cursor: "pointer",
                color: C.cardInk, fontFamily: mono, fontSize: 11,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: edgePalette.colors.select, fontWeight: 700 }}>{s.syntax}</span>
              <span style={{ color: C.cardSub, marginLeft: 8 }}>— {s.hint}</span>
            </button>
          ))}
        </div>
      )}

      {/* Sonuç pill */}
      {result && (
        <div style={{
          alignSelf: "flex-start",
          padding: "4px 10px", borderRadius: 6,
          background: result.ok ? "rgba(16,185,129,0.16)" : "rgba(239,68,68,0.16)",
          border: `1px solid ${result.ok ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`,
          color: result.ok ? "#10b981" : "#ef4444",
          fontFamily: mono, fontSize: 11, fontWeight: 600,
          pointerEvents: "auto",
          maxWidth: "calc(100% - 24px)",
        }}>
          {result.ok ? "✓ " : "✕ "}{result.message}
        </div>
      )}

      {/* Komut satırı */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: C.cardBg, color: C.cardInk,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 8, padding: "8px 12px",
        fontFamily: mono, fontSize: 12,
        boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
        pointerEvents: "auto",
      }}>
        <span style={{
          fontSize: 10, color: C.cardSub, fontFamily: mono,
          letterSpacing: 1.4, fontWeight: 700,
        }}>
          KOMUT
        </span>
        <span style={{ color: edgePalette.colors.select, fontWeight: 700 }}>›</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Bir komut yaz (örn: /siparis 12345)  ·  /yardim için liste${validIds.length > 0 ? `  ·  ${validIds.length} atom seçili` : "  ·  önce atom seç"}`}
          spellCheck={false}
          style={{
            flex: 1,
            background: "transparent", border: "none", outline: "none",
            color: C.cardInk, fontFamily: mono, fontSize: 12,
          }}
        />
        <span style={{ color: C.cardSub, fontSize: 10 }}>↵ çalıştır · Esc temizle · ↑/↓ geçmiş</span>
      </div>
    </div>
  );
}

function CustomersSceneRenderer({
  positions, onMove, getMouseInWorld, viewport, setViewport, wrapperRef, edgePalette,
  shapeOverrides, setShape, clearShape,
  customEdges, addCustomEdge, removeCustomEdge, clearAllCustomEdges,
  atomMeta, setAtomMetaField, clearAtomMeta,
}: {
  positions: Record<string, XY>;
  onMove: (id: string, xy: XY) => void;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
  setViewport: React.Dispatch<React.SetStateAction<{ vx: number; vy: number; scale: number }>>;
  wrapperRef: React.RefObject<HTMLDivElement>;
  edgePalette: EdgePalette;
  shapeOverrides: Record<string, ShapeKind>;
  setShape: (id: string, kind: ShapeKind) => void;
  clearShape: (id: string) => void;
  customEdges: CustomEdge[];
  addCustomEdge: (fromId: string, toId: string) => void;
  removeCustomEdge: (id: string) => void;
  clearAllCustomEdges: () => void;
  atomMeta: Record<string, AtomMeta>;
  setAtomMetaField: (id: string, patch: AtomMeta) => void;
  clearAtomMeta: (id: string) => void;
}) {
  // Açık gruplar — varsayılan: Customers + iki kategori AÇIK (chips ve cihazlar görünür)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["customers", "cat-elektrikli", "cat-gazli"]));
  // Shift+click ile çoklu seçim — aralarında canlı edge çiziliyor
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Pop-up drill-down — atom'a tıklayınca yan tarafta detay kartı açılır
  const [popupAtomId, setPopupAtomId] = useState<string | null>(null);
  // Cihaz BOM drill-down — bir cihaza tıklayınca alt bileşenleri sahnede yan tarafa açılır
  // Çoklu cihaz aynı anda açılabilir — her cihaz için ayrı BOM kolonu render edilir
  const [expandedDeviceIds, setExpandedDeviceIds] = useState<Set<string>>(() => new Set());
  const toggleDevice = (id: string) => setExpandedDeviceIds(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const toggleGroup = (key: string) => setOpenGroups(prev => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const clearSelection = () => setSelectedIds(new Set());

  // ESC ile seçimi + popup + drill-down'ı temizle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
        setPopupAtomId(null);
        setExpandedDeviceIds(new Set());
        setExpandedSubassemblies(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Bir cihaz kapatıldığında, o cihaza ait subassembly açılışlarını da temizle
  useEffect(() => {
    setExpandedSubassemblies(prev => {
      const n = new Set<string>();
      prev.forEach(subId => {
        // subId formatı: bom-{deviceId}-{t1code}
        const m = subId.match(/^bom-(p-[^-]+(?:\.[^-]+)*)-/);
        const devId = m?.[1];
        if (devId && expandedDeviceIds.has(devId)) n.add(subId);
      });
      return n;
    });
  }, [expandedDeviceIds]);

  // Statik atomlar (sahnenin temel yapısı, scenePositions override'ı uygulanır)
  const baseAtoms = useMemo(() => {
    const defaults = makeDefaultSceneAtoms();
    return defaults.map(a => {
      const p = positions[a.id];
      return p ? { ...a, x: p.x, y: p.y } : a;
    });
  }, [positions]);

  // Yarı-mamül expand state — birden fazla yarı-mamül aynı anda açık olabilir
  // (kategori grup pattern'inin aynısı: Set<string> içinde subassembly atom id'leri)
  const [expandedSubassemblies, setExpandedSubassemblies] = useState<Set<string>>(() => new Set());
  const toggleSubassembly = (id: string) => setExpandedSubassemblies(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Dinamik BOM atomları — açık cihazların her biri için ayrı X kolonu.
  // Çoklu cihaz açıkken kolonlar yan yana sıralanır (sahne otomatik fit'lenir).
  const bomAtoms = useMemo<SceneAtom[]>(() => {
    if (expandedDeviceIds.size === 0) return [];
    const out: SceneAtom[] = [];
    const COL_BASE_X = 1540;
    const COL_WIDTH = 600;       // her cihazın BOM kolonu (T1 + T2 + margin)
    const CARD_W = 220, CARD_H = 38;
    const SUB_W = 80, SUB_H = 80;
    const GAP = 8;
    const T2_W = 200, T2_H = 32, T2_GAP = 4;
    const T2_OFFSET = 280;       // T1 sol kenarından T2 sol kenarına

    // Açılma sırası → kolon idx (sıralı diziye çevir, deterministik olsun)
    const ordered = Array.from(expandedDeviceIds);

    ordered.forEach((deviceId, deviceIdx) => {
      const dev = baseAtoms.find(a => a.id === deviceId);
      if (!dev) return;
      const sku = deviceId.replace(/^p-/, "");
      const tree = DEVICE_BOM_TREE[sku];
      if (!tree || tree.length === 0) return;

      const CARD_X = COL_BASE_X + deviceIdx * COL_WIDTH;
      const SUB_X = CARD_X + (CARD_W - SUB_W) / 2;
      const T2_X = CARD_X + T2_OFFSET;

      // Cumulative Y — kart ve daire farklı yükseklikte
      const totalH = tree.reduce((acc, t1) => {
        const isSub = t1.children.length > 0;
        return acc + (isSub ? SUB_H : CARD_H) + GAP;
      }, -GAP);
      const devCenterY = dev.y + dev.h / 2;
      let cursorY = Math.max(30, devCenterY - totalH / 2);

      tree.forEach((t1) => {
        const t1Id = `bom-${deviceId}-${t1.code}`;
        const isSub = t1.children.length > 0;
        const w = isSub ? SUB_W : CARD_W;
        const h = isSub ? SUB_H : CARD_H;
        const defaultX = isSub ? SUB_X : CARD_X;
        const persistedT1 = positions[t1Id];
        out.push({
          id: t1Id,
          kind: isSub ? "subassembly" : "bom-item",
          label: t1.code,
          sub: compactName(t1.name) + (t1.stock != null ? ` · stok ${t1.stock}` : ""),
          x: persistedT1 ? persistedT1.x : defaultX,
          y: persistedT1 ? persistedT1.y : cursorY,
          w, h,
          highlight: isCriticalBom(t1.name) ? "red" : null,
        });

        if (isSub && expandedSubassemblies.has(t1Id)) {
          const t2Count = t1.children.length;
          const t2TotalH = t2Count * T2_H + (t2Count - 1) * T2_GAP;
          const subCenterY = cursorY + h / 2;
          const t2StartY = subCenterY - t2TotalH / 2;
          t1.children.forEach((c, j) => {
            const t2Id = `bom-${deviceId}-${t1.code}-${c.code}`;
            const persistedT2 = positions[t2Id];
            out.push({
              id: t2Id,
              kind: "bom-item",
              label: c.code,
              sub: compactName(c.name) + (c.stock != null ? ` · stok ${c.stock}` : ""),
              x: persistedT2 ? persistedT2.x : T2_X,
              y: persistedT2 ? persistedT2.y : t2StartY + j * (T2_H + T2_GAP),
              w: T2_W, h: T2_H,
              highlight: isCriticalBom(c.name) ? "red" : null,
            });
          });
        }

        cursorY += h + GAP;
      });
    });
    return out;
  }, [expandedDeviceIds, expandedSubassemblies, baseAtoms, positions]);

  const atoms = useMemo(() => [...baseAtoms, ...bomAtoms], [baseAtoms, bomAtoms]);

  // Dinamik BOM edge'leri — her cihaz kendi T1'lerine, yarı-mamül kendi T2'lerine
  // bom-{deviceId}-{t1code}[-{t2code}] formatından çözümleniyor.
  const bomEdges = useMemo<SceneEdge[]>(() => {
    if (bomAtoms.length === 0) return [];
    const edges: SceneEdge[] = [];
    // Açık cihazlar setinden hızlı arama
    const idsArr = Array.from(expandedDeviceIds);
    bomAtoms.forEach(b => {
      // Atom'un ait olduğu deviceId'yi bul (idsArr içinde prefix eşleşir)
      const deviceId = idsArr.find(d => b.id.startsWith(`bom-${d}-`));
      if (!deviceId) return;
      const rest = b.id.slice(`bom-${deviceId}-`.length);
      const isChild = rest.includes("-");
      if (isChild) {
        const t1Code = rest.split("-")[0];
        edges.push({
          fromId: `bom-${deviceId}-${t1Code}`,
          toId: b.id,
          fromPort: "e", toPort: "w",
          dashed: true, curveK: 0.4,
          color: b.highlight === "red" ? "#ef4444" : "rgba(168,85,247,0.55)",
        });
      } else {
        edges.push({
          fromId: deviceId,
          toId: b.id,
          fromPort: "e", toPort: "w",
          dashed: true, curveK: 0.4,
          color: b.highlight === "red"
            ? "#ef4444"
            : (b.kind === "subassembly" ? "rgba(168,85,247,0.7)" : "rgba(16,185,129,0.55)"),
        });
      }
    });
    return edges;
  }, [expandedDeviceIds, bomAtoms]);

  const atomById = useMemo(() => {
    const m: Record<string, SceneAtom> = {};
    for (const a of atoms) m[a.id] = a;
    return m;
  }, [atoms]);

  // Kullanıcının klavye Delete/Backspace ile sildiği atomlar — localStorage persist
  const [deletedAtomIds, setDeletedAtomIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("griseus_scene_deleted_v1");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try {
      localStorage.setItem("griseus_scene_deleted_v1", JSON.stringify(Array.from(deletedAtomIds)));
    } catch { /* noop */ }
  }, [deletedAtomIds]);

  // Kapalı grubun üyelerini + silinen atomları gizle — hem atom hem edge filter'ı
  const hiddenIds = useMemo(() => {
    const h = new Set<string>();
    for (const [key, members] of Object.entries(SCENE_GROUP_MEMBERS)) {
      if (!openGroups.has(key)) members.forEach(id => h.add(id));
    }
    deletedAtomIds.forEach(id => h.add(id));
    return h;
  }, [openGroups, deletedAtomIds]);

  // Delete/Backspace → seçili atom(lar)ı sil (input/textarea içindeyse atla)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedIds.size === 0) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      setDeletedAtomIds(prev => {
        const n = new Set(prev);
        selectedIds.forEach(id => n.add(id));
        return n;
      });
      setSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds]);

  const visibleAtoms = useMemo(
    () => atoms.filter(a => !hiddenIds.has(a.id)),
    [atoms, hiddenIds],
  );

  // Otomatik ekrana sığdırma — BOM drill-down açılırken/kapanırken sahne
  // tüm görünür atomları (cihaz BOM kolonları dahil) ekrana ortalı ve sığacak
  // şekilde zoom'lar. Kullanıcı BOM kapalıyken kendi zoom'unu kullanır.
  const visibleAtomsRef = useRef(visibleAtoms);
  visibleAtomsRef.current = visibleAtoms;
  const lastFitKeyRef = useRef<string>("");
  useEffect(() => {
    // Sadece BOM açıkken/kapanırken fit'le. Kapalıdan kapalıya geçişlerde no-op.
    const fitKey = `${Array.from(expandedDeviceIds).sort().join(",")}|${Array.from(expandedSubassemblies).sort().join(",")}`;
    if (fitKey === lastFitKeyRef.current) return;
    lastFitKeyRef.current = fitKey;
    if (expandedDeviceIds.size === 0) return; // BOM kapanırken viewport'u zorla değiştirme

    const t = setTimeout(() => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const atomsNow = visibleAtomsRef.current;
      if (atomsNow.length === 0) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const a of atomsNow) {
        if (a.x < minX) minX = a.x;
        if (a.y < minY) minY = a.y;
        if (a.x + a.w > maxX) maxX = a.x + a.w;
        if (a.y + a.h > maxY) maxY = a.y + a.h;
      }
      const padding = 60;
      const W = maxX - minX + padding * 2;
      const H = maxY - minY + padding * 2;
      const scaleX = rect.width / Math.max(1, W);
      const scaleY = rect.height / Math.max(1, H);
      const scale = Math.max(0.18, Math.min(1.0, Math.min(scaleX, scaleY)));
      const vx = -(minX - padding) * scale;
      const vy = -(minY - padding) * scale;
      setViewport({ vx, vy, scale });
    }, 60);
    return () => clearTimeout(t);
  }, [expandedDeviceIds, expandedSubassemblies, setViewport, wrapperRef]);

  // Seçili atomlar arasında pairwise canlı edge — palet'in select rengi, kalın
  const liveEdges: SceneEdge[] = useMemo(() => {
    const ids = Array.from(selectedIds).filter(id => atomById[id] && !hiddenIds.has(id));
    const edges: SceneEdge[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push({
          fromId: ids[i], toId: ids[j],
          color: edgePalette.colors.select, dashed: false, curveK: 0.45,
        });
      }
    }
    return edges;
  }, [selectedIds, atomById, hiddenIds, edgePalette]);

  // Custom edges → SceneEdge formatına dönüştür (palette select rengi, dashed
  // çünkü kalıcı bağlantı diğer sahne ok'ları gibi görünmeli — sadece geçici
  // shift+click live preview turuncu solid kalın)
  const customSceneEdges = useMemo<SceneEdge[]>(() => customEdges.map(ce => ({
    fromId: ce.fromId,
    toId: ce.toId,
    color: edgePalette.colors.select,
    dashed: true,
    curveK: 0.4,
  })), [customEdges, edgePalette]);

  // Görünür edge'ler: hidden atom'a değen var olanları at + dinamik BOM edge'leri + custom
  const visibleSceneEdges = useMemo(
    () => [...SCENE_EDGES, ...bomEdges, ...customSceneEdges].filter(e => !hiddenIds.has(e.fromId) && !hiddenIds.has(e.toId)),
    [hiddenIds, bomEdges, customSceneEdges],
  );

  // SVG bounding box: world coords so we draw in the same transformed space
  const bbox = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of visibleAtoms) {
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x + a.w);
      maxY = Math.max(maxY, a.y + a.h);
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
    return { minX: minX - 200, minY: minY - 100, maxX: maxX + 200, maxY: maxY + 100 };
  }, [visibleAtoms]);

  const W = bbox.maxX - bbox.minX;
  const H = bbox.maxY - bbox.minY;

  const renderEdge = (e: SceneEdge, i: number, isLive: boolean) => {
    const a = atomById[e.fromId];
    const b = atomById[e.toId];
    if (!a || !b) return null;
    const p1 = atomPort(a, e.fromPort);
    const p2 = atomPort(b, e.toPort);
    const dx = p2.x - p1.x;
    const k = e.curveK ?? 0.5;
    const c1x = p1.x + dx * k;
    const c1y = p1.y;
    const c2x = p2.x - dx * k;
    const c2y = p2.y;
    const x1 = p1.x - bbox.minX, y1 = p1.y - bbox.minY;
    const x2 = p2.x - bbox.minX, y2 = p2.y - bbox.minY;
    const cx1 = c1x - bbox.minX, cy1 = c1y - bbox.minY;
    const cx2 = c2x - bbox.minX, cy2 = c2y - bbox.minY;
    const path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2 - 6;
    const fallback = asRgba(edgePalette.colors.neutral, 0.4);
    const labelFallback = asRgba(edgePalette.colors.neutral, 0.85);
    const stroke = remapEdgeColor(e.color, edgePalette) ?? fallback;
    const labelFill = remapEdgeColor(e.color, edgePalette) ?? labelFallback;
    const liveGlow = asRgba(edgePalette.colors.select, 0.55);
    return (
      <g key={`${isLive ? "live" : "edge"}-${i}`}>
        <path
          d={path}
          stroke={stroke}
          strokeWidth={isLive ? 2.5 : 1.5}
          fill="none"
          strokeDasharray={e.dashed ? "5 4" : undefined}
          style={isLive ? { filter: `drop-shadow(0 0 6px ${liveGlow})` } : undefined}
        />
        {e.label && (
          <text
            x={midX} y={midY}
            fill={labelFill}
            fontSize={13}
            fontFamily={mono}
            fontWeight={600}
            textAnchor="middle"
          >
            {e.label}
          </text>
        )}
      </g>
    );
  };

  return (
    <>
      {/* Sol şekil paleti — sahnenin sol üst köşesinde sabit, viewport'tan bağımsız */}
      <ShapesToolbar
        selectedIds={selectedIds}
        atomById={atomById}
        onApplyShape={(kind) => {
          if (selectedIds.size === 0) return;
          selectedIds.forEach(id => setShape(id, kind));
        }}
        onClearShape={() => {
          if (selectedIds.size === 0) return;
          selectedIds.forEach(id => clearShape(id));
        }}
        onAddArrow={() => {
          const ids = Array.from(selectedIds).filter(id => atomById[id]);
          if (ids.length < 2) return;
          for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
              addCustomEdge(ids[i], ids[j]);
            }
          }
        }}
        customEdgeCount={customEdges.length}
        onClearCustomEdges={clearAllCustomEdges}
      />

      {/* Seçim göstergesi — sağ üstte sabit pill (DragNode dışında, viewport'tan bağımsız) */}
      {selectedIds.size > 0 && (
        <div style={{
          position: "absolute", top: 12, right: 12, zIndex: 20,
          background: C.cardBg, color: C.cardInk,
          border: `1px solid ${C.panelEdge}`,
          borderRadius: 10, padding: "8px 12px",
          fontFamily: mono, fontSize: 11,
          boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ color: edgePalette.colors.select, fontWeight: 700 }}>● {selectedIds.size}</span>
          <span style={{ color: C.cardSub }}>seçili · shift+click ekle/çıkar · Del sil</span>
          <button
            onClick={clearSelection}
            style={{
              background: "rgba(255,255,255,0.06)", color: C.cardInk,
              border: `1px solid ${C.panelEdge}`, borderRadius: 6,
              padding: "4px 8px", fontFamily: mono, fontSize: 10, cursor: "pointer",
            }}
          >
            temizle
          </button>
        </div>
      )}

      {/* Silinen atom göstergesi — selection pill'in altında, geri getir butonu */}
      {deletedAtomIds.size > 0 && (
        <div style={{
          position: "absolute",
          top: selectedIds.size > 0 ? 60 : 12,
          right: 12, zIndex: 20,
          background: C.cardBg, color: C.cardInk,
          border: `1px solid ${C.panelEdge}`,
          borderRadius: 10, padding: "8px 12px",
          fontFamily: mono, fontSize: 11,
          boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ color: "#ef4444", fontWeight: 700 }}>🗑 {deletedAtomIds.size}</span>
          <span style={{ color: C.cardSub }}>silinen atom</span>
          <button
            onClick={() => setDeletedAtomIds(new Set())}
            style={{
              background: "rgba(255,255,255,0.06)", color: C.cardInk,
              border: `1px solid ${C.panelEdge}`, borderRadius: 6,
              padding: "4px 8px", fontFamily: mono, fontSize: 10, cursor: "pointer",
            }}
            title="Tüm silinen atomları geri getir"
          >
            geri getir
          </button>
        </div>
      )}

      {/* SVG edge layer — world coords, transform by viewport */}
      <svg
        width={W}
        height={H}
        style={{
          position: "absolute",
          left: bbox.minX * viewport.scale + viewport.vx,
          top: bbox.minY * viewport.scale + viewport.vy,
          width: W * viewport.scale,
          height: H * viewport.scale,
          pointerEvents: "none",
        }}
        viewBox={`0 0 ${W} ${H}`}
      >
        {visibleSceneEdges.map((e, i) => renderEdge(e, i, false))}
        {liveEdges.map((e, i) => renderEdge(e, i, true))}
      </svg>

      {/* Atom altı metadata badge overlay — sipariş no + teslim tarihi */}
      {visibleAtoms.map(a => {
        const meta = atomMeta[a.id];
        if (!meta || (!meta.orderNumber && !meta.deadline)) return null;
        const sx = a.x * viewport.scale + viewport.vx;
        const sy = (a.y + a.h + 4) * viewport.scale + viewport.vy;
        const sw = a.w * viewport.scale;
        return (
          <div
            key={`meta-${a.id}`}
            style={{
              position: "absolute", left: sx, top: sy, width: sw,
              display: "flex", flexWrap: "wrap", gap: 4,
              pointerEvents: "auto",
              zIndex: 5,
            }}
          >
            {meta.orderNumber && (
              <span
                title={`Sipariş #${meta.orderNumber} — sağ tık ile sil`}
                onContextMenu={(e) => { e.preventDefault(); setAtomMetaField(a.id, { orderNumber: undefined }); }}
                style={{
                  fontSize: 9 * viewport.scale, padding: `${2 * viewport.scale}px ${6 * viewport.scale}px`,
                  background: asRgba(edgePalette.colors.select, 0.18),
                  border: `1px solid ${asRgba(edgePalette.colors.select, 0.55)}`,
                  borderRadius: 4 * viewport.scale,
                  color: edgePalette.colors.select,
                  fontFamily: mono, fontWeight: 700, letterSpacing: 0.4,
                  whiteSpace: "nowrap", cursor: "context-menu",
                }}
              >
                #{meta.orderNumber}
              </span>
            )}
            {meta.deadline && (
              <span
                title={`Teslim ${meta.deadline} — sağ tık ile sil`}
                onContextMenu={(e) => { e.preventDefault(); setAtomMetaField(a.id, { deadline: undefined }); }}
                style={{
                  fontSize: 9 * viewport.scale, padding: `${2 * viewport.scale}px ${6 * viewport.scale}px`,
                  background: asRgba(edgePalette.colors.gas, 0.18),
                  border: `1px solid ${asRgba(edgePalette.colors.gas, 0.55)}`,
                  borderRadius: 4 * viewport.scale,
                  color: edgePalette.colors.gas,
                  fontFamily: mono, fontWeight: 700, letterSpacing: 0.4,
                  whiteSpace: "nowrap", cursor: "context-menu",
                }}
              >
                → {meta.deadline}
              </span>
            )}
          </div>
        );
      })}

      {/* Atom layer — DragNode'lar */}
      {visibleAtoms.map(a => {
        // 1) Customers KÖK + kategori daireler → grup toggle
        // 2) Cihaz kartı (product, BOM tree var) → BOM tree drill-down toggle
        // 3) Yarı-mamül (subassembly) → Tier 2 alt bileşen drill-down toggle
        // 4) Diğerleri → yan drill-down pop-up
        const isCustomersLabel = a.id === "lbl-customers";
        const isCategory = a.kind === "category";
        const sku = a.id.replace(/^p-/, "");
        const hasBomDrillDown = a.kind === "product" && !!DEVICE_BOM_TREE[sku];
        const isSubassembly = a.kind === "subassembly";
        const groupKey = isCustomersLabel ? "customers" : isCategory ? a.id : null;

        let onTap: () => void;
        if (groupKey) {
          onTap = () => toggleGroup(groupKey);
        } else if (hasBomDrillDown) {
          onTap = () => toggleDevice(a.id);
        } else if (isSubassembly) {
          onTap = () => toggleSubassembly(a.id);
        } else {
          onTap = () => setPopupAtomId(prev => prev === a.id ? null : a.id);
        }

        const groupOpen = groupKey
          ? openGroups.has(groupKey)
          : hasBomDrillDown
            ? expandedDeviceIds.has(a.id)
            : isSubassembly
              ? expandedSubassemblies.has(a.id)
              : undefined;

        return (
          <SceneAtomNode
            key={a.id}
            atom={a}
            onMove={(xy) => onMove(a.id, xy)}
            onTap={onTap}
            onMultiSelect={() => toggleSelect(a.id)}
            selected={selectedIds.has(a.id)}
            groupOpen={groupOpen}
            getMouseInWorld={getMouseInWorld}
            viewport={viewport}
            shapeOverride={shapeOverrides[a.id]}
          />
        );
      })}

      {/* Pop-up drill-down — atom'a tıklayınca yan tarafta detay kartı */}
      {popupAtomId && atomById[popupAtomId] && !hiddenIds.has(popupAtomId) && (
        <ScenePopup
          atom={atomById[popupAtomId]}
          allAtoms={atoms}
          onClose={() => setPopupAtomId(null)}
          onJumpToAtom={(id) => { setPopupAtomId(id); }}
          viewport={viewport}
        />
      )}

      {/* Komut satırı — alt sabit, AutoCAD-vari */}
      <CommandBar
        selectedIds={selectedIds}
        atomById={atomById}
        edgePalette={edgePalette}
        onApplyMeta={(ids, patch) => ids.forEach(id => setAtomMetaField(id, patch))}
        onClearMeta={(ids) => ids.forEach(id => clearAtomMeta(id))}
      />
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SCENE POPUP — atom kind'ına göre drill-down içerik
   Atom dünya konumundan ekran konumuna projeksiyon, sabit boyut.
   ──────────────────────────────────────────────────────────────────── */
function ScenePopup({
  atom, allAtoms, onClose, onJumpToAtom, viewport,
}: {
  atom: SceneAtom;
  allAtoms: SceneAtom[];
  onClose: () => void;
  onJumpToAtom: (id: string) => void;
  viewport: { vx: number; vy: number; scale: number };
}) {
  const POPUP_W = 320;
  // Atom'un sağ üst köşesinin ekran konumu
  const atomScreenRight = (atom.x + atom.w) * viewport.scale + viewport.vx;
  const atomScreenTop   = atom.y * viewport.scale + viewport.vy;
  // Sağa sığmazsa sola yerleştir
  const willOverflowRight = (typeof window !== "undefined")
    ? atomScreenRight + POPUP_W + 24 > window.innerWidth
    : false;
  const left = willOverflowRight
    ? atom.x * viewport.scale + viewport.vx - POPUP_W - 12
    : atomScreenRight + 12;
  const top = atomScreenTop;

  return (
    <div
      style={{
        position: "absolute",
        left, top,
        width: POPUP_W,
        background: C.cardBg,
        color: C.cardInk,
        border: `1px solid ${C.panelEdge}`,
        borderLeft: `3px solid #f97316`,
        borderRadius: 12,
        boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
        fontFamily: mono,
        zIndex: 30,
        overflow: "hidden",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px",
        borderBottom: `1px solid ${C.panelEdge}`,
        background: "rgba(255,255,255,0.03)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 9, letterSpacing: 1.6, color: "#f97316", fontWeight: 700 }}>
            ◇ DRILL-DOWN
          </div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{atom.label}</div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.06)",
            color: C.cardInk,
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 6, width: 24, height: 24,
            fontFamily: mono, fontSize: 12, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          aria-label="Kapat"
        >×</button>
      </div>
      <div style={{ padding: 12, maxHeight: 380, overflowY: "auto" }}>
        <ScenePopupContent atom={atom} allAtoms={allAtoms} onJumpToAtom={onJumpToAtom} />
      </div>
    </div>
  );
}

function ScenePopupContent({
  atom, allAtoms, onJumpToAtom,
}: {
  atom: SceneAtom;
  allAtoms: SceneAtom[];
  onJumpToAtom: (id: string) => void;
}) {
  const subLabel = (text: string) => (
    <div style={{ fontSize: 9, letterSpacing: 1.4, color: C.cardSub, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>
      {text}
    </div>
  );
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 12, borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
      <span style={{ color: C.cardSub }}>{k}</span>
      <span style={{ color: C.cardInk, textAlign: "right" }}>{v}</span>
    </div>
  );
  const deviceCard = (d: DeviceMeta) => (
    <div key={d.code} style={{
      padding: "8px 10px", borderRadius: 8,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${C.panelEdge}`,
      marginBottom: 6,
      display: "flex", flexDirection: "column", gap: 3,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{d.code}</span>
        <span style={{ fontSize: 10, color: C.cardSub }}>{d.power}</span>
      </div>
      <div style={{ fontSize: 11, color: C.cardSub }}>{d.name}</div>
      {d.note && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>{d.note}</div>}
    </div>
  );

  // KATEGORİ → fuel'e göre cihaz listesi
  if (atom.kind === "category") {
    const fuel: DeviceFuel = atom.label === "Elektrikli" ? "elektrikli" : "gazli";
    const list = devicesByFuel(fuel);
    const total = list.length;
    const families = Array.from(new Set(list.map(d => d.family))).join(", ");
    return (
      <>
        {row("Yakıt", fuel === "elektrikli" ? "Elektrikli" : "Gazlı (doğal gaz)")}
        {row("Aileler", families)}
        {row("Cihaz sayısı", total)}
        {subLabel("CİHAZLAR")}
        <div style={{ marginTop: 4 }}>{list.map(deviceCard)}</div>
      </>
    );
  }

  // MAMUL → DEVICE_REGISTRY'de varsa gerçek bilgi, yoksa placeholder
  if (atom.kind === "product") {
    // Atom label eşleşmesi: "GSA 15" → "GSA15"
    const norm = atom.label.replace(/\s+/g, "");
    const dev = DEVICE_REGISTRY.find(d => d.code === norm)
             ?? DEVICE_REGISTRY.find(d => atom.label.includes(d.code));
    if (dev) {
      return (
        <>
          {row("Kod", dev.code)}
          {row("Ad", dev.name)}
          {row("Aile", dev.family)}
          {row("Yakıt", dev.fuel === "elektrikli" ? "Elektrikli" : "Gazlı")}
          {row("Güç", dev.power ?? "-")}
          {dev.note && (<>
            {subLabel("NOT")}
            <div style={{ fontSize: 11, color: C.cardSub, lineHeight: 1.45 }}>{dev.note}</div>
          </>)}
        </>
      );
    }
    // Placeholder (Z-elek, T-elek, X-gazlı, Y-gazlı)
    return (
      <>
        {row("Tip", "Mamul (placeholder)")}
        {row("Etiket", atom.label)}
        <div style={{ fontSize: 11, color: C.cardSub, marginTop: 8, lineHeight: 1.45 }}>
          Sahnede temsili kart. Gerçek cihaz envanteri için kategori dairesine
          tıkla — Elektrikli/Gazlı listesi açılır.
        </div>
      </>
    );
  }

  // STAGE (Üretim / Depo / Satış)
  if (atom.kind === "stage") {
    const desc: Record<string, string> = {
      "Üretim": "Aktif siparişlerin üretim hattındaki adımları. Lead time burada birikir.",
      "Depo":   "Tamamlanmış mamul + bileşen stok deposu. Tedarik denklemi giriş noktası.",
      "Satış":  "Müşteriye sevk + fatura aşaması. Teslim tarihi commit'i burada.",
    };
    return (
      <>
        {row("Aşama", atom.label)}
        {row("Akış yönü", "Müşteri → Üretim → Depo → Satış → Fabrika")}
        <div style={{ fontSize: 11, color: C.cardSub, marginTop: 8, lineHeight: 1.45 }}>
          {desc[atom.label] ?? "Üretim akışı aşaması."}
        </div>
      </>
    );
  }

  if (atom.kind === "factory") {
    const total = DEVICE_REGISTRY.length;
    const elek  = devicesByFuel("elektrikli").length;
    const gaz   = devicesByFuel("gazli").length;
    return (
      <>
        {row("Tesis", atom.label)}
        {row("Toplam cihaz", total)}
        {row("Elektrikli", elek)}
        {row("Gazlı", gaz)}
        {row("Aileler", "BH · ELT · GSA · GSS")}
        <div style={{ fontSize: 11, color: C.cardSub, marginTop: 8, lineHeight: 1.45 }}>
          Üretim/Depo/Satış akışlarının birleştiği son nokta.
        </div>
      </>
    );
  }

  // BİLEŞEN (a, b — paylaşılan komponent)
  if (atom.kind === "component") {
    const supplyId = atom.label === "a" ? "sup-a" : "sup-b";
    const qtyAtom = allAtoms.find(x => x.id === `${supplyId}-qty`);
    const leadAtom = allAtoms.find(x => x.id === `${supplyId}-lead`);
    return (
      <>
        {row("Bileşen", atom.label)}
        {row("Tip", "Paylaşılan (cross-product)")}
        {qtyAtom && row("Tedarik adedi", qtyAtom.label)}
        {leadAtom && row("Tedarik süresi", leadAtom.label)}
        <div style={{ fontSize: 11, color: C.cardSub, marginTop: 8, lineHeight: 1.45 }}>
          GSA15 ve GSS20P arasında ortak — değişikliği Octopus zincirini tetikler.
        </div>
      </>
    );
  }

  // MÜŞTERİ chip
  if (atom.kind === "customer-chip") {
    const isElectricBuyer = ["En","E1","E2","E3"].includes(atom.label);
    const segment = isElectricBuyer ? "Elektrikli grubu" : "Gazlı grubu";
    return (
      <>
        {row("Müşteri", atom.label)}
        {row("Segment", segment)}
        {row("Sahne durumu", atom.highlight === "green" ? "Aktif sipariş (yeşil)" : atom.highlight === "blue" ? "Aktif sipariş (mavi)" : "Pasif")}
        <div style={{ fontSize: 11, color: C.cardSub, marginTop: 8, lineHeight: 1.45 }}>
          Senaryo placeholder — gerçek sipariş geçmişi için Customers panelini aç.
        </div>
      </>
    );
  }

  // PILL (lead, deadline)
  if (atom.kind === "lead-pill" || atom.kind === "deadline-pill") {
    const kindLabel = atom.kind === "lead-pill" ? "Lead time pill" : "Teslim tarih pill";
    return (
      <>
        {row("Tip", kindLabel)}
        {row("Değer", atom.label)}
        <div style={{ fontSize: 11, color: C.cardSub, marginTop: 8, lineHeight: 1.45 }}>
          {atom.kind === "lead-pill"
            ? "Akıştaki bekleme süresi — kritik yola eklenir."
            : "Müşteri commit'i — teslim hesabının üst sınırı."}
        </div>
      </>
    );
  }

  // FLASK (tepkime)
  if (atom.kind === "flask") {
    return (
      <>
        {row("Tip", "Tepkime denklemi")}
        {row("Etiket", atom.label)}
        <div style={{ fontSize: 11, color: C.cardSub, marginTop: 8, lineHeight: 1.45 }}>
          Birden fazla mamulün/bileşenin paylaşılan reaksiyonu — S1/S2 timeline'a
          aktarılır.
        </div>
      </>
    );
  }

  if (atom.kind === "supply-bracket" || atom.kind === "timeline-s1" || atom.kind === "timeline-s2") {
    return (
      <>
        {row("Tip", atom.kind)}
        {row("Etiket", atom.label)}
      </>
    );
  }

  if (atom.kind === "label") {
    return (
      <div style={{ fontSize: 11, color: C.cardSub, lineHeight: 1.45 }}>
        Grup başlığı — tıklayınca alt müşteri kartlarını aç/kapat.
      </div>
    );
  }

  return (
    <div style={{ fontSize: 11, color: C.cardSub }}>
      Bu atom için detay tanımlı değil.
    </div>
  );
}

function SceneAtomNode({
  atom, onMove, onTap, onMultiSelect, selected, groupOpen, getMouseInWorld, viewport, shapeOverride,
}: {
  atom: SceneAtom;
  onMove: (xy: XY) => void;
  onTap?: () => void;
  onMultiSelect?: () => void;
  selected?: boolean;
  groupOpen?: boolean;
  getMouseInWorld: (e: React.PointerEvent) => XY;
  viewport: { vx: number; vy: number; scale: number };
  shapeOverride?: ShapeKind;
}) {
  const naturalCircle = atom.kind === "category" || atom.kind === "stage" || atom.kind === "component" || atom.kind === "subassembly";
  const effectiveShape: ShapeKind | null = shapeOverride
    ?? (naturalCircle ? "circle" : null);
  const shapeStyle = effectiveShape ? shapeStyleFor(effectiveShape) : {};
  const asCircle = effectiveShape === "circle";
  const selectedStyle: React.CSSProperties = selected ? {
    outline: "3px solid #f97316",
    outlineOffset: 4,
  } : {};
  return (
    <DragNode
      pos={{ x: atom.x, y: atom.y }}
      width={atom.w}
      height={atom.h}
      onDrag={onMove}
      onTap={onTap}
      onMultiSelect={onMultiSelect}
      getMouseInWorld={getMouseInWorld}
      viewport={viewport}
      asCircle={asCircle}
      shapeStyle={shapeStyle}
      style={{ ...selectedStyle, ...shapeStyle }}
    >
      <SceneAtomVisual atom={atom} groupOpen={groupOpen} />
    </DragNode>
  );
}

function SceneAtomVisual({ atom, groupOpen }: { atom: SceneAtom; groupOpen?: boolean }) {
  const accent =
    atom.highlight === "green" ? "#10b981" :
    atom.highlight === "blue"  ? "#38bdf8" : null;

  // X stadyum estetiği — tüm atomlar için ortak shell
  const xCard = (kindLabel: string, content: React.ReactNode, opts?: {
    border?: string; circle?: boolean; padding?: number; accentLabel?: string;
  }): React.CSSProperties & { __content?: React.ReactNode } => ({
    width: "100%", height: "100%", boxSizing: "border-box",
    background: C.cardBg, color: C.cardInk,
    borderRadius: opts?.circle ? "50%" : 12,
    border: opts?.border ?? `1px solid ${C.panelEdge}`,
    padding: opts?.padding ?? 12,
    boxShadow: "0 6px 22px rgba(0,0,0,0.32)",
    fontFamily: mono,
    display: "flex", flexDirection: "column", justifyContent: "center", gap: 3,
  });

  const labelLine = (text: string, color: string = C.cardSub): React.ReactNode => (
    <div style={{ fontSize: 9, color, letterSpacing: 1.6, fontWeight: 600 }}>{text}</div>
  );

  if (atom.kind === "label") {
    // "Customers" master label — tıklanabilir grup başlığı (chevron + hover)
    const showChevron = typeof groupOpen === "boolean";
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: 12, padding: 12,
        boxShadow: "0 6px 22px rgba(0,0,0,0.32)",
        border: `1px solid ${C.panelEdge}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 3,
        fontFamily: mono,
      }}>
        {labelLine("◇ KÖK")}
        <div style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          {showChevron && (
            <span style={{ fontSize: 11, color: C.cardSub, width: 10, display: "inline-block" }}>
              {groupOpen ? "▾" : "▸"}
            </span>
          )}
          {atom.label}
        </div>
      </div>
    );
  }

  if (atom.kind === "customer-chip") {
    const stripe = accent ?? "rgba(255,255,255,0.16)";
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: 12, padding: "8px 10px",
        boxShadow: "0 6px 22px rgba(0,0,0,0.32)",
        border: `1px solid ${C.panelEdge}`,
        borderLeft: `3px solid ${stripe}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
        fontFamily: mono,
      }}>
        {labelLine("MÜŞTERİ", accent ?? C.cardSub)}
        <div style={{ fontSize: 14, fontWeight: 700 }}>{atom.label}</div>
      </div>
    );
  }

  if (atom.kind === "category") {
    const stripe = atom.label === "Elektrikli" ? "#10b981" : "#38bdf8";
    const showChevron = typeof groupOpen === "boolean";
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: "50%",
        border: `1.5px solid ${stripe}55`,
        boxShadow: `0 0 0 6px ${stripe}10, 0 6px 22px rgba(0,0,0,0.42)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        fontFamily: mono, padding: 8,
      }}>
        {labelLine("KATEGORİ", stripe)}
        <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }}>{atom.label}</div>
        {showChevron && (
          <div style={{ fontSize: 11, color: stripe, opacity: 0.85, marginTop: 2, letterSpacing: 1 }}>
            {groupOpen ? "▾ açık" : "▸ kapalı"}
          </div>
        )}
      </div>
    );
  }

  if (atom.kind === "stage") {
    const stripe = atom.label === "Üretim" ? "#f59e0b"
                  : atom.label === "Depo"   ? "#38bdf8" : "#10b981";
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: "50%",
        border: `1.5px solid ${stripe}55`,
        boxShadow: `0 0 0 5px ${stripe}10, 0 6px 22px rgba(0,0,0,0.42)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        fontFamily: mono, padding: 6,
      }}>
        {labelLine("AKIŞ", stripe)}
        <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center" }}>{atom.label}</div>
      </div>
    );
  }

  if (atom.kind === "product") {
    const stripe = accent ?? "rgba(255,255,255,0.18)";
    const showChevron = typeof groupOpen === "boolean";
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: 12, padding: "10px 12px",
        boxShadow: "0 6px 22px rgba(0,0,0,0.32)",
        border: `1px solid ${C.panelEdge}`,
        borderLeft: `3px solid ${stripe}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 3,
        fontFamily: mono,
      }}>
        {labelLine("MAMUL", accent ?? C.cardSub)}
        <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          {showChevron && (
            <span style={{ fontSize: 10, color: stripe, opacity: 0.85 }}>
              {groupOpen ? "▾" : "▸"}
            </span>
          )}
          {atom.label}
        </div>
        {atom.sub && (
          <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
            {atom.sub.split(" · ").map(s => (
              <div key={s} style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "rgba(255,255,255,0.08)", color: C.cardInk,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700,
                border: `1px solid ${stripe}`,
              }}>{s}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (atom.kind === "bom-item") {
    const isCritical = atom.highlight === "red";
    const stripe = isCritical ? "#ef4444" : "rgba(16,185,129,0.6)";
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: 10, padding: "5px 9px",
        boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
        border: `1px solid ${C.panelEdge}`,
        borderLeft: `3px solid ${stripe}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 1,
        fontFamily: mono,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 8, letterSpacing: 1.4, color: stripe, fontWeight: 700 }}>
            {isCritical ? "KRİTİK" : "BİLEŞEN"}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, marginLeft: "auto" }}>{atom.label}</div>
        </div>
        {atom.sub && (
          <div style={{ fontSize: 9, color: C.cardSub, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {atom.sub}
          </div>
        )}
      </div>
    );
  }

  if (atom.kind === "subassembly") {
    const stripe = "#a855f7"; // mor — yarı-mamül (bh-ontology daire pattern)
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: "50%",
        border: `1.5px solid ${stripe}77`,
        boxShadow: `0 0 0 4px ${stripe}10, 0 4px 14px rgba(168,85,247,0.28)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
        fontFamily: mono, padding: 6,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 8, letterSpacing: 1.6, color: stripe, fontWeight: 700 }}>
          YARI-MAMÜL
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1 }}>
          {atom.label}
        </div>
        <div style={{ fontSize: 8, color: stripe, opacity: 0.85 }}>
          {groupOpen ? "▾ açık" : "▸ tıkla"}
        </div>
      </div>
    );
  }

  if (atom.kind === "component") {
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: "50%",
        border: "1.5px solid rgba(239,68,68,0.55)",
        boxShadow: "0 0 0 5px rgba(239,68,68,0.08), 0 6px 22px rgba(0,0,0,0.42)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
        fontFamily: mono,
      }}>
        {labelLine("BİLEŞEN", "#ef4444")}
        <div style={{ fontSize: 22, fontWeight: 700 }}>{atom.label}</div>
      </div>
    );
  }

  if (atom.kind === "factory") {
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: 12, padding: 10,
        border: `1px solid ${C.panelEdge}`,
        boxShadow: "0 6px 22px rgba(0,0,0,0.32)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        fontFamily: mono,
      }}>
        {labelLine("FABRİKA")}
        <div style={{ fontSize: 14, fontWeight: 700 }}>{atom.label}</div>
      </div>
    );
  }

  if (atom.kind === "lead-pill") {
    const stripe = accent ?? "rgba(255,255,255,0.4)";
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: 8, padding: "6px 10px",
        border: `1px solid ${C.panelEdge}`,
        borderLeft: `3px solid ${stripe}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 1,
        fontFamily: mono, boxShadow: "0 4px 12px rgba(0,0,0,0.32)",
      }}>
        {labelLine("LEAD", accent ?? C.cardSub)}
        <div style={{ fontSize: 13, fontWeight: 700 }}>{atom.label}</div>
      </div>
    );
  }

  if (atom.kind === "deadline-pill") {
    const stripe = accent ?? "rgba(255,255,255,0.4)";
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        borderRadius: 8, padding: "6px 10px",
        border: `1px solid ${C.panelEdge}`,
        borderLeft: `3px solid ${stripe}`,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 1,
        fontFamily: mono, boxShadow: "0 4px 12px rgba(0,0,0,0.32)",
      }}>
        {labelLine("TESLİM", accent ?? C.cardSub)}
        <div style={{ fontSize: 12, fontWeight: 700 }}>{atom.label}</div>
      </div>
    );
  }

  if (atom.kind === "flask") {
    return (
      <div style={{
        width: "100%", height: "100%",
        background: C.cardBg, color: C.cardInk,
        border: "1.5px solid rgba(245,158,11,0.6)",
        boxShadow: "0 0 0 5px rgba(245,158,11,0.08), 0 6px 22px rgba(0,0,0,0.42)",
        borderRadius: 12, padding: "10px 12px",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
        fontFamily: mono,
      }}>
        {labelLine("TEPKİME", "#f59e0b")}
        <div style={{ fontSize: 13, fontWeight: 700 }}>{atom.label}</div>
      </div>
    );
  }
  if (atom.kind === "timeline-s1") {
    return <TimelineCard which="S1" />;
  }
  if (atom.kind === "timeline-s2") {
    return <TimelineCard which="S2" />;
  }
  return <div>{atom.label}</div>;
}

function TimelineCard({ which }: { which: "S1" | "S2" }) {
  const ok = which === "S2";
  // X axis: 1 May, 15 May, 1 Haz (gün 0 → 31)
  const ticks = [
    { label: "1 May.",  pct: 0 },
    { label: "15 May",  pct: 14 / 31 * 100 },
    { label: "1 Haz.",  pct: 100 },
  ];
  // Bars
  const bars = which === "S1"
    ? [
        { lane: 0, label: "x100 GSA 15",          startPct: 0,            widthPct: 30 / 31 * 100, dur: "30 gün", color: "#ffffff" },
        { lane: 1, label: "a ve b tedarik süresi", startPct: 0,            widthPct: 15 / 31 * 100, dur: "15 gün", color: "#ffffff" },
        { lane: 2, label: "x10 GSS20P",            startPct: 0,            widthPct: 2 / 31 * 100,  dur: "2 gün",  color: "#ffffff" },
        { lane: 2, label: "x40 GSS20P",            startPct: 15 / 31 * 100, widthPct: 8 / 31 * 100, dur: "8 gün",  color: "#ef4444" },
      ]
    : [
        { lane: 0, label: "x60 GSA 15",            startPct: 0,            widthPct: 18 / 31 * 100, dur: "18 gün", color: "#ffffff" },
        { lane: 0, label: "x40 GSA 15",            startPct: 18 / 31 * 100, widthPct: 12 / 31 * 100, dur: "12 gün", color: "#ffffff" },
        { lane: 1, label: "a ve b tedarik süresi", startPct: 0,            widthPct: 15 / 31 * 100, dur: "15 gün", color: "#ffffff" },
        { lane: 2, label: "x50 GSS20P",            startPct: 0,            widthPct: 10 / 31 * 100, dur: "10 gün", color: "#ffffff" },
      ];
  const note = which === "S1"
    ? "G2 müşterisine teslim 8 gün gecikmeli ulaşır."
    : "AI aracılığıyla aşamalar akıllı bir şekilde üst üste oturtularak teslimler müşterilere gecikme olmadan tamamlanır.";

  return (
    <div style={{
      width: "100%", height: "100%",
      background: C.cardBg, color: C.cardInk,
      borderRadius: 12, padding: "16px 18px",
      boxShadow: "0 6px 22px rgba(0,0,0,0.32)", fontFamily: mono,
      display: "flex", flexDirection: "column", gap: 10,
      border: ok ? "1.5px solid rgba(16,185,129,0.45)" : `1px solid ${C.panelEdge}`,
    }}>
      {/* Title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          fontSize: 22, fontWeight: 700, fontFamily: mono,
          color: ok ? "#10b981" : C.cardInk,
        }}>{which}</div>
        {ok && (
          <div style={{
            width: 22, height: 22, borderRadius: 4,
            background: "rgba(16,185,129,0.2)", color: "#10b981",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700,
          }}>✓</div>
        )}
      </div>

      {/* X axis ticks */}
      <div style={{ position: "relative", height: 14, marginLeft: 0 }}>
        {ticks.map((t, i) => (
          <div key={i} style={{
            position: "absolute", left: `${t.pct}%`, top: 0,
            transform: i === 0 ? "translateX(0)" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            fontSize: 11, color: C.cardSub, fontFamily: mono,
          }}>{t.label}</div>
        ))}
      </div>

      {/* Bars (3 lanes) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {[0, 1, 2].map(laneIdx => {
          const laneBars = bars.filter(b => b.lane === laneIdx);
          return (
            <div key={laneIdx} style={{
              position: "relative", height: 32,
              borderTop: `1px dashed ${C.panelEdge}`, borderBottom: `1px dashed ${C.panelEdge}`,
            }}>
              {/* Vertical guides at ticks */}
              {ticks.map((t, i) => (
                <div key={i} style={{
                  position: "absolute", left: `${t.pct}%`, top: -2, bottom: -2, width: 1,
                  background: "rgba(255,255,255,0.08)", pointerEvents: "none",
                }}/>
              ))}
              {laneBars.map((b, i) => (
                <div key={i} style={{
                  position: "absolute",
                  left: `${b.startPct}%`,
                  width: `${b.widthPct}%`,
                  top: 4, height: 22,
                  background: "transparent",
                  border: `2px solid ${b.color}`,
                  borderRadius: 2,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  paddingTop: 1,
                }}>
                  <div style={{
                    fontSize: 10, color: b.color, fontFamily: mono, fontWeight: 600,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    width: "100%", textAlign: "center",
                  }}>
                    {b.label}
                  </div>
                  <div style={{
                    fontSize: 9, color: b.color, fontFamily: mono,
                    fontStyle: "italic", marginTop: -1,
                  }}>{b.dur}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div style={{
        fontSize: 11, color: ok ? "#10b981" : C.shortfall,
        fontFamily: mono, lineHeight: 1.5,
        marginTop: 4,
      }}>{note}</div>
    </div>
  );
}

function OrderModal({
  initial, onClose, onSave, customers, prefilledCustomer, onAutoCreateCustomer,
}: {
  initial?: Order | null;
  onClose: () => void;
  onSave: (o: Order) => void;
  customers: Customer[];
  prefilledCustomer?: string | null;
  onAutoCreateCustomer?: (label: string, category?: string) => void;
}) {
  const [customer, setCustomer] = useState(initial?.customer ?? prefilledCustomer ?? "");
  const [sku, setSku] = useState<string>(initial?.sku ?? ALL_SKUS[0]);
  const [quantity, setQuantity] = useState<string>(initial ? String(initial.quantity) : "100");
  const [deadline, setDeadline] = useState<string>(
    initial?.deadline ?? new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  );
  const submit = () => {
    const q = parseInt(quantity, 10);
    if (!sku || isNaN(q) || q <= 0) return;
    const finalCustomer = customer.trim() || "Bayi";
    // If user typed a new customer name not in the list, auto-create
    if (
      finalCustomer !== "Bayi" &&
      onAutoCreateCustomer &&
      !customers.some(c => c.label.toLowerCase() === finalCustomer.toLowerCase())
    ) {
      // electrical SKUs get elektrikli, gas-related get gazlı (heuristic)
      const cat = sku.startsWith("ELT") || sku.startsWith("BH") ? "elektrikli" : "gazlı";
      onAutoCreateCustomer(finalCustomer, cat);
    }
    onSave({
      id: initial?.id ?? `o_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      customer: finalCustomer,
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
        <input
          value={customer}
          onChange={e => setCustomer(e.target.value)}
          placeholder="Listeden seç veya yeni isim yaz"
          list="strategy-customer-list"
          style={inp}
        />
        <datalist id="strategy-customer-list">
          {customers.map(c => (
            <option key={c.id} value={c.label}>{c.category ?? ""}</option>
          ))}
        </datalist>
        {customers.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {customers.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCustomer(c.label)}
                style={{
                  padding: "3px 8px",
                  background: customer === c.label
                    ? (c.category === "elektrikli" ? "rgba(16,185,129,0.25)" : "rgba(59,130,246,0.25)")
                    : "rgba(255,255,255,0.06)",
                  border: `1px solid ${customer === c.label ? C.accent : C.panelEdge}`,
                  borderRadius: 4, color: C.cardInk,
                  fontSize: 10, fontFamily: mono, cursor: "pointer",
                }}
              >
                {c.label}
                <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 9 }}>
                  {c.category === "elektrikli" ? "ELK" : c.category === "gazlı" ? "GAZ" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
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
   ONTOLOGY SEARCH — header'da BH Grupları gibi alt-canvas'ları bulma
   ──────────────────────────────────────────────────────────────────── */
type SearchEntry = {
  label: string;
  sub: string;
  keywords: string[];
  icon: string;
  // ya navigation hedef path'i, ya da inline view swap (BH gibi — aynı /ontology
  // sayfasında kalıp sadece canvas değişir).
  path?: string;
  viewSwap?: "strategy" | "bh";
};
const ONTOLOGY_SEARCH_CATALOG: SearchEntry[] = [
  {
    label: "BH Grupları",
    sub: "Varlık Felsefesi — 4 Cihaz · Canlı Zincir",
    keywords: ["bh", "grup", "varlık", "varlik", "felsefe", "ontoloji", "ontology", "cihaz", "zincir", "canvas", "bh.50", "bh.55"],
    icon: "◈",
    viewSwap: "bh",
  },
];

type SearchHit =
  | { kind: "page"; label: string; sub: string; icon: string; path?: string; viewSwap?: "strategy" | "bh" }
  | { kind: "scenario"; label: string; sub: string; icon: string; scenarioId: string }
  | { kind: "scenario_save_new"; label: string; sub: string; icon: string };

function OntologySearchBox({
  onNavigate,
  onSetView,
  scenarios,
  activeId,
  onLoadScenario,
  onDeleteScenario,
  onSaveAs,
}: {
  onNavigate: (path: string) => void;
  onSetView?: (v: "strategy" | "bh") => void;
  scenarios: ScenarioSnapshot[];
  activeId: string | null;
  onLoadScenario: (id: string) => void;
  onDeleteScenario: (id: string) => void;
  onSaveAs: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const matches = useMemo<SearchHit[]>(() => {
    const term = q.trim().toLowerCase();
    const hits: SearchHit[] = [];

    // Senaryolar — boş arama da listelensin (en yenisi üstte)
    const scs = [...scenarios].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const s of scs) {
      const matchTerm =
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.description ?? "").toLowerCase().includes(term);
      if (!matchTerm) continue;
      const orderCount = s.payload.orders.length;
      const date = new Date(s.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "2-digit" });
      hits.push({
        kind: "scenario",
        label: s.name + (s.id === activeId ? "  (açık)" : ""),
        sub: s.description ?? `${orderCount} sipariş · ${date}`,
        icon: "◇",
        scenarioId: s.id,
      });
    }

    // Sayfa kataloğu (BH gibi)
    if (term) {
      for (const it of ONTOLOGY_SEARCH_CATALOG) {
        if (
          it.label.toLowerCase().includes(term) ||
          it.sub.toLowerCase().includes(term) ||
          it.keywords.some(k => k.includes(term))
        ) {
          hits.push({ kind: "page", label: it.label, sub: it.sub, icon: it.icon, path: it.path, viewSwap: it.viewSwap });
        }
      }
    }

    // "Yeni senaryo olarak kaydet" — kullanıcı yeni isim yazmışsa
    if (term && term.length >= 2 && !scs.some(s => s.name.toLowerCase() === term)) {
      hits.push({
        kind: "scenario_save_new",
        label: `"${q}" olarak kaydet`,
        sub: "yeni senaryo · mevcut canvas hali ile",
        icon: "+",
      });
    }

    return hits;
  }, [q, scenarios, activeId]);

  const placeholder = scenarios.length > 0
    ? `Senaryo ara (${scenarios.length}) — yaz, tıkla, canvas o senaryoya geçer`
    : "Senaryo adı yaz, Enter — şu anki canvas senaryo olarak kaydedilir";

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "1 1 320px", maxWidth: 480 }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) {
            const exact = scenarios.find(s => s.name.toLowerCase() === q.trim().toLowerCase());
            if (exact) {
              onLoadScenario(exact.id);
            } else {
              onSaveAs(q.trim());
            }
            setOpen(false);
            setQ("");
          }
        }}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "9px 12px 9px 32px",
          background: "#ffffff",
          border: `1px solid ${q ? C.accent : C.edgeFaint}`,
          borderRadius: 8, color: C.ink, fontFamily: mono, fontSize: 12,
          outline: "none", transition: "border 0.15s",
        }}
      />
      <span style={{
        position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
        fontSize: 12, color: C.mid, pointerEvents: "none",
      }}>◎</span>
      {q && (
        <button onClick={() => { setQ(""); setOpen(false); }} style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          background: "transparent", border: "none", color: C.mid, cursor: "pointer",
          fontSize: 14, padding: "4px 8px", fontFamily: mono,
        }}>✕</button>
      )}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 60,
          background: "#ffffff", border: `1px solid ${C.edgeFaint}`,
          borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
          padding: 4, maxHeight: 360, overflowY: "auto",
        }}>
          {matches.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 11, color: C.mid, fontFamily: mono }}>
              {scenarios.length === 0
                ? "Henüz senaryo yok. İsim yazıp Enter'a bas → kaydedilir."
                : "Sonuç yok"}
            </div>
          ) : matches.map((m, idx) => {
            if (m.kind === "scenario") {
              return (
                <div
                  key={`s-${m.scenarioId}`}
                  style={{
                    display: "flex", alignItems: "center",
                    width: "100%", padding: "8px 10px", borderRadius: 6,
                    background: m.scenarioId === activeId ? C.accentSoft : "transparent",
                    cursor: "pointer", gap: 8,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.accentSoft)}
                  onMouseLeave={e => (e.currentTarget.style.background = m.scenarioId === activeId ? C.accentSoft : "transparent")}
                  onClick={() => { onLoadScenario(m.scenarioId); setOpen(false); setQ(""); }}
                >
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.ink, fontFamily: mono }}>
                      <span style={{ color: C.accent }}>{m.icon}</span>
                      <span>{m.label}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.mid, fontFamily: mono, marginTop: 2 }}>{m.sub}</div>
                  </div>
                  <button
                    title="senaryoyu sil"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`"${m.label.replace("  (açık)", "")}" senaryosunu silelim mi?`)) {
                        onDeleteScenario(m.scenarioId);
                      }
                    }}
                    style={{
                      background: "transparent", border: "none", color: C.mid,
                      cursor: "pointer", fontSize: 14, padding: "4px 8px", fontFamily: mono,
                    }}
                  >✕</button>
                </div>
              );
            }
            if (m.kind === "scenario_save_new") {
              return (
                <button
                  key={`save-${idx}`}
                  onClick={() => { onSaveAs(q.trim()); setOpen(false); setQ(""); }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start",
                    width: "100%", padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                    background: "transparent", border: `1px dashed ${C.accent}`, textAlign: "left",
                    marginTop: 4,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.accentSoft)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.accent, fontFamily: mono, fontWeight: 600 }}>
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.mid, fontFamily: mono, marginTop: 2 }}>{m.sub}</div>
                </button>
              );
            }
            // page (path navigate VEYA inline viewSwap)
            const handlePageClick = () => {
              if (m.viewSwap && onSetView) onSetView(m.viewSwap);
              else if (m.path) onNavigate(m.path);
              setOpen(false); setQ("");
            };
            return (
              <button
                key={`p-${m.path ?? m.viewSwap ?? m.label}`}
                onClick={handlePageClick}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  width: "100%", padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                  background: "transparent", border: "none", textAlign: "left",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.accentSoft)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.ink, fontFamily: mono }}>
                  <span style={{ color: C.accent }}>{m.icon}</span>
                  <span>{m.label}</span>
                </div>
                <div style={{ fontSize: 10, color: C.mid, fontFamily: mono, marginTop: 2 }}>{m.sub}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PAGE
   ──────────────────────────────────────────────────────────────────── */
const VIEW_MODE_KEY = "griseus_ontology_view_v1";

export default function StrategyCanvasPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  // /ontology sayfasında inline canvas swap — strategy ↔ bh (BhOntologyPage embedded)
  const [viewMode, setViewMode] = useState<"strategy" | "bh">(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === "bh" ? "bh" : "strategy";
  });
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);

  // Sahne atom şekil override'ları — kullanıcı sol palet üzerinden değiştirir
  const [sceneShapeOverrides, setSceneShapeOverrides] = useState<Record<string, ShapeKind>>(
    () => safeParse<Record<string, ShapeKind>>(localStorage.getItem(SHAPE_OVERRIDES_KEY), {}),
  );
  useEffect(() => { localStorage.setItem(SHAPE_OVERRIDES_KEY, JSON.stringify(sceneShapeOverrides)); }, [sceneShapeOverrides]);
  const setSceneShape = useCallback((id: string, kind: ShapeKind) => {
    setSceneShapeOverrides(prev => ({ ...prev, [id]: kind }));
  }, []);
  const clearSceneShape = useCallback((id: string) => {
    setSceneShapeOverrides(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Sahne custom edges — kullanıcı 2 atom seçip ok butonuna basınca eklenir
  const [sceneCustomEdges, setSceneCustomEdges] = useState<CustomEdge[]>(
    () => safeParse<CustomEdge[]>(localStorage.getItem(CUSTOM_EDGES_KEY), []),
  );
  useEffect(() => { localStorage.setItem(CUSTOM_EDGES_KEY, JSON.stringify(sceneCustomEdges)); }, [sceneCustomEdges]);
  const addSceneCustomEdge = useCallback((fromId: string, toId: string) => {
    setSceneCustomEdges(prev => {
      const exists = prev.some(e =>
        (e.fromId === fromId && e.toId === toId) ||
        (e.fromId === toId && e.toId === fromId),
      );
      if (exists) return prev;
      const id = `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      return [...prev, { id, fromId, toId }];
    });
  }, []);
  const removeSceneCustomEdge = useCallback((id: string) => {
    setSceneCustomEdges(prev => prev.filter(e => e.id !== id));
  }, []);
  const clearAllSceneCustomEdges = useCallback(() => {
    setSceneCustomEdges([]);
  }, []);

  // Atom metadata — komut bar'dan set edilir (sipariş no, teslim tarihi)
  const [sceneAtomMeta, setSceneAtomMeta] = useState<Record<string, AtomMeta>>(
    () => safeParse<Record<string, AtomMeta>>(localStorage.getItem(ATOM_META_KEY), {}),
  );
  useEffect(() => { localStorage.setItem(ATOM_META_KEY, JSON.stringify(sceneAtomMeta)); }, [sceneAtomMeta]);
  const setSceneAtomMetaField = useCallback((id: string, patch: AtomMeta) => {
    setSceneAtomMeta(prev => {
      const cur = prev[id] ?? {};
      const merged: AtomMeta = { ...cur, ...patch };
      // Tüm alanlar boşsa kaydı sil
      const isEmpty = !merged.orderNumber && !merged.deadline;
      if (isEmpty) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: merged };
    });
  }, []);
  const clearSceneAtomMeta = useCallback((id: string) => {
    setSceneAtomMeta(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Edge color palette — kullanıcı seçimi, localStorage'da kalıcı
  const [edgePaletteId, setEdgePaletteId] = useState<string>(() => {
    return localStorage.getItem(EDGE_PALETTE_KEY) || "default";
  });
  useEffect(() => { localStorage.setItem(EDGE_PALETTE_KEY, edgePaletteId); }, [edgePaletteId]);
  const edgePalette = useMemo(() => getEdgePalette(edgePaletteId), [edgePaletteId]);
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);
  const paletteMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!paletteMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (paletteMenuRef.current && !paletteMenuRef.current.contains(e.target as Node)) {
        setPaletteMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [paletteMenuOpen]);

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

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  const initialView = safeParse<{ vx: number; vy: number; scale: number }>(localStorage.getItem(VIEW_KEY), { vx: 0, vy: 0, scale: 0.85 });
  const [viewport, setViewport] = useState(initialView);
  useEffect(() => { localStorage.setItem(VIEW_KEY, JSON.stringify(viewport)); }, [viewport]);

  /* ── Müşteri kayıtları (free-form, drillable, hypothetical seed) ── */
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const stored = safeParse<Customer[] | null>(localStorage.getItem(CUSTOMERS_KEY), null);
    return stored && stored.length > 0 ? stored : SAMPLE_CUSTOMERS;
  });
  useEffect(() => { localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers)); }, [customers]);

  const [customersPanelOpen, setCustomersPanelOpen] = useState<boolean>(
    () => safeParse<boolean>(localStorage.getItem(CUSTOMERS_PANEL_OPEN_KEY), true),
  );
  useEffect(() => { localStorage.setItem(CUSTOMERS_PANEL_OPEN_KEY, JSON.stringify(customersPanelOpen)); }, [customersPanelOpen]);

  const [expandedCustomers, setExpandedCustomers] = useState<string[]>(
    () => safeParse<string[]>(localStorage.getItem(CUSTOMERS_EXPANDED_KEY), []),
  );
  useEffect(() => { localStorage.setItem(CUSTOMERS_EXPANDED_KEY, JSON.stringify(expandedCustomers)); }, [expandedCustomers]);

  const toggleCustomer = useCallback((id: string) => {
    setExpandedCustomers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const addCustomer = useCallback((label: string, category?: string) => {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const id = `c_${trimmed.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now().toString(36).slice(-4)}`;
    const c: Customer = { id, label: trimmed, category: (category as Customer["category"]) ?? "elektrikli" };
    setCustomers(prev => [...prev, c]);
    return c;
  }, []);

  const removeCustomer = useCallback((id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    setExpandedCustomers(prev => prev.filter(x => x !== id));
  }, []);

  const renameCustomer = useCallback((id: string, newLabel: string) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, label: newLabel } : c));
  }, []);

  // Sipariş oluştururken müşteri ön-seçimi
  const [pendingNewOrderCustomer, setPendingNewOrderCustomer] = useState<string | null>(null);

  // Free-form widget pozisyonları
  const [customersPanelPos, setCustomersPanelPos] = useState<XY>(() =>
    safeParse<XY>(localStorage.getItem("griseus_customers_panel_pos_v1"), { x: -300, y: 60 }),
  );
  useEffect(() => { localStorage.setItem("griseus_customers_panel_pos_v1", JSON.stringify(customersPanelPos)); }, [customersPanelPos]);

  const [categoriesPos, setCategoriesPos] = useState<XY>(() =>
    safeParse<XY>(localStorage.getItem("griseus_categories_pos_v1"), { x: -40, y: 60 }),
  );
  useEffect(() => { localStorage.setItem("griseus_categories_pos_v1", JSON.stringify(categoriesPos)); }, [categoriesPos]);

  const [productsPos, setProductsPos] = useState<XY>(() =>
    safeParse<XY>(localStorage.getItem("griseus_products_pos_v1"), { x: 220, y: 60 }),
  );
  useEffect(() => { localStorage.setItem("griseus_products_pos_v1", JSON.stringify(productsPos)); }, [productsPos]);

  const [stagesPos, setStagesPos] = useState<XY>(() =>
    safeParse<XY>(localStorage.getItem("griseus_stages_pos_v1"), { x: 480, y: 60 }),
  );
  useEffect(() => { localStorage.setItem("griseus_stages_pos_v1", JSON.stringify(stagesPos)); }, [stagesPos]);

  const [factoryPos, setFactoryPos] = useState<XY>(() =>
    safeParse<XY>(localStorage.getItem("griseus_factory_pos_v1"), { x: 700, y: 60 }),
  );
  useEffect(() => { localStorage.setItem("griseus_factory_pos_v1", JSON.stringify(factoryPos)); }, [factoryPos]);

  const [supplyPos, setSupplyPos] = useState<XY>(() =>
    safeParse<XY>(localStorage.getItem("griseus_supply_pos_v1"), { x: 880, y: 60 }),
  );
  useEffect(() => { localStorage.setItem("griseus_supply_pos_v1", JSON.stringify(supplyPos)); }, [supplyPos]);

  const [supplyEntries, setSupplyEntries] = useState<SupplyEntry[]>(() =>
    safeParse<SupplyEntry[]>(localStorage.getItem("griseus_supply_entries_v1"), [
      { id: "sup_a", code: "a", qty: 300, leadDays: 15 },
      { id: "sup_b", code: "b", qty: 180, leadDays: 12 },
    ]),
  );
  useEffect(() => { localStorage.setItem("griseus_supply_entries_v1", JSON.stringify(supplyEntries)); }, [supplyEntries]);

  const [activeCategory, setActiveCategory] = useState<"elektrikli" | "gazlı" | null>(null);

  // Customers Senaryosu sahne atom pozisyonları (kullanıcı sürükledikçe persist)
  const [scenePositions, setScenePositions] = useState<Record<string, XY>>(() =>
    safeParse<Record<string, XY>>(localStorage.getItem("griseus_scene_pos_v1"), {}),
  );
  useEffect(() => { localStorage.setItem("griseus_scene_pos_v1", JSON.stringify(scenePositions)); }, [scenePositions]);
  const moveSceneAtom = useCallback((id: string, xy: XY) => {
    setScenePositions(prev => ({ ...prev, [id]: xy }));
  }, []);
  const resetScenePositions = useCallback(() => setScenePositions({}), []);

  // Workbench widget görünürlüğü — senaryo state'inin parçası, default kapalı
  // İlk mount'ta sadece DEFAULT yükle — eski v1 sürümünden kalma "hepsi açık" temizlenir.
  const [widgetVis, setWidgetVis] = useState<WidgetVisibility>(() => DEFAULT_WIDGET_VIS);
  const toggleWidget = useCallback((k: keyof WidgetVisibility) => {
    setWidgetVis(prev => ({ ...prev, [k]: !prev[k] }));
  }, []);

  const handleCreateOrderFor = useCallback((customerLabel: string) => {
    setPendingNewOrderCustomer(customerLabel);
    setEditing(null);
    setModalOpen(true);
  }, []);

  // Click an order in the panel → focus its card on canvas (zoom + pan)
  const focusOrderOnCanvas = useCallback((order: Order) => {
    setEditing(order);
    setModalOpen(true);
  }, []);

  /* ── Tepkime Denklemi (reaction flask) state ── */
  const [flaskOpen, setFlaskOpen] = useState(false);
  const [flaskItems, setFlaskItems] = useState<FlaskItem[]>([]);
  const [flaskSupplies, setFlaskSupplies] = useState<SupplyItem[]>([]);
  const [reactionResult, setReactionResult] = useState<ReactionResult | null>(null);

  /* ── Senaryo yönetimi (canvas state'i adlı kayıt olarak yaşar) ── */
  const [scenarios, setScenarios] = useState<ScenarioSnapshot[]>(
    () => safeParse<ScenarioSnapshot[]>(localStorage.getItem(SCENARIOS_KEY), []),
  );
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_SCENARIO_KEY),
  );
  useEffect(() => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  }, [scenarios]);
  useEffect(() => {
    if (activeScenarioId) localStorage.setItem(ACTIVE_SCENARIO_KEY, activeScenarioId);
    else localStorage.removeItem(ACTIVE_SCENARIO_KEY);
  }, [activeScenarioId]);
  const activeScenario = useMemo(
    () => scenarios.find(s => s.id === activeScenarioId) ?? null,
    [scenarios, activeScenarioId],
  );

  // İlk açılışta "Customers Senaryosu" sahne sürümünü garantiye al
  const customersSeedRef = useRef(false);
  useEffect(() => {
    if (customersSeedRef.current) return;
    customersSeedRef.current = true;
    const seed: ScenarioSnapshot = {
      id: "s_customers_seed_v3",
      name: "Customers Senaryosu",
      description: "Atomlar + kıvrımlı oklar — kullanıcının senaryo şemasının canlı kopyası",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload: {
        orders: [],
        posOverrides: {},
        expandedSubs: {},
        customers: SAMPLE_CUSTOMERS,
        customersPanelOpen: false,
        expandedCustomers: [],
        widgetVisibility: CUSTOMERS_SCENE_VIS,
        scenePositions: {}, // default layout from makeDefaultSceneAtoms
        supplyEntries: [
          { id: "sup_a", code: "a", qty: 300, leadDays: 15 },
          { id: "sup_b", code: "b", qty: 180, leadDays: 12 },
        ],
        flaskItems: [],
        flaskSupplies: [],
      },
    };
    // Migrasyon: tüm eski "customers" varyantlarını sil + yenisini koy
    let needsActiveReset = false;
    setScenarios(prev => {
      const filtered = prev.filter(s => {
        const isOld = s.id === "s_customers_seed_v1" || s.id === "s_customers_seed_v2";
        const isCustomersByName = s.name.toLowerCase().includes("customers")
          && s.id !== "s_customers_seed_v3";
        if (isOld || isCustomersByName) {
          if (s.id === activeScenarioId) needsActiveReset = true;
          return false;
        }
        return true;
      });
      if (filtered.find(s => s.id === seed.id)) return filtered;
      return [...filtered, seed];
    });
    // Aktif senaryo silinen eski v2 ise → yeni seed'i aktif yap
    if (needsActiveReset) {
      setTimeout(() => {
        setActiveScenarioId(seed.id);
        setOrders([]);
        setPosOverrides({});
        setExpandedSubs({});
        setCustomers(SAMPLE_CUSTOMERS);
        setCustomersPanelOpen(false);
        setExpandedCustomers([]);
        setWidgetVis(CUSTOMERS_SCENE_VIS);
        setScenePositions({});
        setFlaskItems([]);
        setFlaskSupplies([]);
        setReactionResult(null);
      }, 50);
    }
  }, [scenarios]);

  const buildSnapshot = useCallback(
    (id: string, name: string, prev?: ScenarioSnapshot): ScenarioSnapshot => ({
      id,
      name,
      description: prev?.description,
      createdAt: prev?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      payload: {
        orders,
        posOverrides,
        expandedSubs,
        customers,
        customersPanelOpen,
        expandedCustomers,
        widgetVisibility: widgetVis,
        supplyEntries,
        scenePositions,
        flaskItems,
        flaskSupplies,
        viewport,
        customersPanelPos,
        flaskOpen,
        reactionResult,
      },
    }),
    [orders, posOverrides, expandedSubs, customers, customersPanelOpen, expandedCustomers, widgetVis, supplyEntries, scenePositions, flaskItems, flaskSupplies, viewport, customersPanelPos, flaskOpen, reactionResult],
  );

  const saveScenarioAs = useCallback((rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    const existing = scenarios.find(s => s.name.toLowerCase() === name.toLowerCase());
    const id = existing?.id ?? `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const snap = buildSnapshot(id, name, existing);
    setScenarios(prev => {
      const without = prev.filter(s => s.id !== id);
      return [...without, snap];
    });
    setActiveScenarioId(id);
  }, [scenarios, buildSnapshot]);

  const overwriteActive = useCallback(() => {
    if (!activeScenario) return false;
    const snap = buildSnapshot(activeScenario.id, activeScenario.name, activeScenario);
    setScenarios(prev => prev.map(s => s.id === activeScenario.id ? snap : s));
    return true;
  }, [activeScenario, buildSnapshot]);

  const promptSaveAs = useCallback(() => {
    const def = activeScenario?.name ?? `Senaryo ${scenarios.length + 1}`;
    const name = window.prompt("Senaryo adı:", def);
    if (!name) return;
    saveScenarioAs(name);
  }, [activeScenario, scenarios.length, saveScenarioAs]);

  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSaved = useCallback(() => {
    setJustSaved(true);
    if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    justSavedTimerRef.current = setTimeout(() => setJustSaved(false), 1500);
  }, []);
  useEffect(() => () => { if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current); }, []);

  const handleQuickSave = useCallback(() => {
    if (activeScenario) {
      overwriteActive();
      flashSaved();
    } else {
      promptSaveAs();
    }
  }, [activeScenario, overwriteActive, promptSaveAs, flashSaved]);

  const loadScenario = useCallback((id: string) => {
    const s = scenarios.find(x => x.id === id);
    if (!s) return;
    setOrders(s.payload.orders);
    setPosOverrides(s.payload.posOverrides);
    setExpandedSubs(s.payload.expandedSubs);
    if (s.payload.customers) setCustomers(s.payload.customers);
    if (typeof s.payload.customersPanelOpen === "boolean") setCustomersPanelOpen(s.payload.customersPanelOpen);
    if (s.payload.expandedCustomers) setExpandedCustomers(s.payload.expandedCustomers);
    // Eski senaryolarda widgetVisibility yok → DEFAULT (hepsi kapalı) → workbench görünmez
    setWidgetVis(s.payload.widgetVisibility ?? DEFAULT_WIDGET_VIS);
    if (s.payload.supplyEntries) setSupplyEntries(s.payload.supplyEntries);
    setScenePositions(s.payload.scenePositions ?? {});
    setFlaskItems(s.payload.flaskItems ?? []);
    setFlaskSupplies(s.payload.flaskSupplies ?? []);
    if (s.payload.viewport) setViewport(s.payload.viewport);
    if (s.payload.customersPanelPos) setCustomersPanelPos(s.payload.customersPanelPos);
    setFlaskOpen(s.payload.flaskOpen ?? false);
    setReactionResult((s.payload.reactionResult as ReactionResult | null) ?? null);
    setActiveScenarioId(id);
    setModalOpen(false);
    setEditing(null);
  }, [scenarios]);

  const deleteScenarioById = useCallback((id: string) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
    if (activeScenarioId === id) setActiveScenarioId(null);
  }, [activeScenarioId]);

  const newBlankScenario = useCallback(() => {
    if (orders.length > 0) {
      const ok = window.confirm(
        activeScenario
          ? `"${activeScenario.name}" üstündeki çalışmalar kaydedilecek mi? OK = kaydet, İptal = boş canvas (kayıtsız değişiklikler kaybolur)`
          : "Mevcut canvas'ı senaryo olarak kaydedeyim mi? OK = kaydet, İptal = boş canvas",
      );
      if (ok) {
        if (activeScenario) overwriteActive();
        else promptSaveAs();
      }
    }
    setOrders([]);
    setPosOverrides({});
    setExpandedSubs({});
    setFlaskItems([]);
    setFlaskSupplies([]);
    setReactionResult(null);
    setActiveScenarioId(null);
  }, [orders.length, activeScenario, overwriteActive, promptSaveAs]);

  // "+ widget" dropdown — kullanıcı tek tek workbench parçalarını açar
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);
  const widgetMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!widgetMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (widgetMenuRef.current && !widgetMenuRef.current.contains(e.target as Node)) {
        setWidgetMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [widgetMenuOpen]);

  // "Senaryolarım" dropdown — header'da prominent buton
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const scenariosRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scenariosOpen) return;
    const onClick = (e: MouseEvent) => {
      if (scenariosRef.current && !scenariosRef.current.contains(e.target as Node)) {
        setScenariosOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [scenariosOpen]);
  const FLASK_COLORS = ["#3f8f5b", "#3d6fb0", "#c96442", "#b8761c", "#8b5cf6", "#0891b2", "#dc2626"];
  const addOrderToFlask = useCallback((o: Order) => {
    setFlaskItems(prev => {
      const exists = prev.find(x => x.sku === o.sku && x.deadline === o.deadline);
      if (exists) {
        return prev.map(x => x === exists ? { ...x, qty: x.qty + o.quantity } : x);
      }
      const color = FLASK_COLORS[prev.length % FLASK_COLORS.length];
      return [...prev, {
        id: `o_${o.id}_${Date.now()}`,
        sku: o.sku,
        qty: o.quantity,
        deadline: o.deadline || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        color,
      }];
    });
    setFlaskOpen(true);
  }, []);
  const addAllOrdersToFlask = useCallback(() => {
    setFlaskItems(prev => {
      const merged = [...prev];
      orders.forEach((o) => {
        const exists = merged.find(x => x.sku === o.sku && x.deadline === o.deadline);
        if (exists) {
          exists.qty = exists.qty; // keep manual edit
        } else {
          const color = FLASK_COLORS[merged.length % FLASK_COLORS.length];
          merged.push({
            id: `o_${o.id}_${Date.now()}`,
            sku: o.sku,
            qty: o.quantity,
            deadline: o.deadline || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            color,
          });
        }
      });
      return merged;
    });
  }, [orders]);
  const handleFlaskDropPayload = useCallback(
    (p: { sku: string; qty: number; deadline: string; orderId?: string }) => {
      setFlaskItems(prev => {
        const exists = prev.find(x => x.sku === p.sku && x.deadline === p.deadline);
        if (exists) {
          return prev.map(x => x === exists ? { ...x, qty: x.qty + p.qty } : x);
        }
        const color = FLASK_COLORS[prev.length % FLASK_COLORS.length];
        return [...prev, {
          id: `d_${p.orderId ?? "x"}_${Date.now()}`,
          sku: p.sku,
          qty: p.qty,
          deadline: p.deadline || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          color,
        }];
      });
    },
    [],
  );
  const toggleFlaskOpen = useCallback(() => {
    setFlaskOpen(prev => {
      const next = !prev;
      // İlk açılışta + flask boş + canvas'ta sipariş varsa otomatik tümünü ekle
      if (next && flaskItems.length === 0 && orders.length > 0) {
        addAllOrdersToFlask();
      }
      return next;
    });
  }, [flaskItems.length, orders.length, addAllOrdersToFlask]);

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

      {/* Inline canvas swap — BH Grupları arama'dan tıklanınca aynı /ontology sayfasında
          BhOntologyPage'i embedded modda gösterir; URL değişmez. */}
      {viewMode === "bh" ? (
        <BhOntologyPage embedded onBackToStrategy={() => setViewMode("strategy")} />
      ) : (<>

      {/* Header */}
      <div style={{ padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, borderBottom: `1px solid ${C.edgeFaint}` }}>
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 2 }}>◇ STRATEJİ CANVAS</div>
          <div style={{ fontSize: 18, marginTop: 2, color: C.ink, display: "flex", alignItems: "center", gap: 8 }}>
            {activeScenario ? activeScenario.name : "Çalışma alanı"}
            {activeScenario && (
              <span style={{
                fontSize: 9, padding: "2px 6px",
                background: C.accentSoft, color: C.accent,
                borderRadius: 4, fontFamily: mono, letterSpacing: 0.5,
              }}>
                AÇIK
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
            {scenarios.length === 0
              ? "Senaryolar arama kutusunda yaşar — isim yazıp Enter ile kaydet, sonra arayıp aç"
              : `${scenarios.length} senaryo kayıtlı · arama kutusunda yaz veya yenisini başlat`}
          </div>
        </div>
        <OntologySearchBox
          onNavigate={navigate}
          onSetView={setViewMode}
          scenarios={scenarios}
          activeId={activeScenarioId}
          onLoadScenario={loadScenario}
          onDeleteScenario={deleteScenarioById}
          onSaveAs={saveScenarioAs}
        />
        <div style={{ display: "flex", gap: 8, flex: "0 0 auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => zoomBy(1.2)} style={hdrBtnGhost} title="Yakınlaştır">+</button>
          <button onClick={() => zoomBy(0.83)} style={hdrBtnGhost} title="Uzaklaştır">−</button>
          <button
            onClick={handleQuickSave}
            style={justSaved
              ? { ...hdrBtnGhost, color: C.ok, borderColor: C.ok, background: C.okSoft }
              : hdrBtnGhost}
            title={activeScenario ? `'${activeScenario.name}' senaryosunu güncelle` : "Şu anki canvas'ı senaryo olarak kaydet"}
          >
            {justSaved ? "✓ kaydedildi" : `◈ ${activeScenario ? "kaydet" : "senaryo yap"}`}
          </button>
          {activeScenario && (
            <button onClick={promptSaveAs} style={hdrBtnGhost} title="Yeni isimle kopya kaydet">
              ⎘ farklı kaydet
            </button>
          )}
          <div ref={widgetMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setWidgetMenuOpen(o => !o)}
              style={widgetMenuOpen ? hdrBtnAccent : hdrBtnGhost}
              title="Workbench widget'larını ekle/kaldır"
            >
              + widget
            </button>
            {widgetMenuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 70,
                width: 220, background: "#ffffff", border: `1px solid ${C.edgeFaint}`,
                borderRadius: 10, boxShadow: "0 12px 32px rgba(15,23,42,0.18)", padding: 6,
              }}>
                <div style={{
                  padding: "6px 10px", fontSize: 9, color: C.mid, letterSpacing: 1.5,
                  fontFamily: mono, borderBottom: `1px solid ${C.edgeFaint}`, marginBottom: 4,
                }}>WORKBENCH PARÇALARI</div>
                {([
                  { k: "scene", l: "Sahne (atomlar + kıvrımlı oklar)" },
                  { k: "customers", l: "Müşteriler paneli (drill-down)" },
                  { k: "categories", l: "Kategori paneli" },
                  { k: "products", l: "Ürün kataloğu paneli" },
                  { k: "stages", l: "Akış paneli" },
                  { k: "factory", l: "Fabrika kutusu" },
                  { k: "supply", l: "Tedarik denklemi paneli" },
                ] as const).map(w => (
                  <button
                    key={w.k}
                    onClick={() => toggleWidget(w.k)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", borderRadius: 6,
                      background: widgetVis[w.k] ? C.accentSoft : "transparent",
                      border: "none", cursor: "pointer",
                      fontSize: 12, color: C.ink, fontFamily: mono, textAlign: "left",
                    }}
                    onMouseEnter={(e) => { if (!widgetVis[w.k]) e.currentTarget.style.background = "#f5f3ec"; }}
                    onMouseLeave={(e) => { if (!widgetVis[w.k]) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{
                      width: 16, height: 16, display: "inline-flex",
                      alignItems: "center", justifyContent: "center",
                      border: `1.5px solid ${widgetVis[w.k] ? C.accent : C.mid}`,
                      borderRadius: 3, fontSize: 10, color: C.accent, fontWeight: 700,
                    }}>{widgetVis[w.k] ? "✓" : ""}</span>
                    <span style={{ flex: 1 }}>{w.l}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div ref={paletteMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setPaletteMenuOpen(o => !o)}
              style={paletteMenuOpen ? hdrBtnAccent : hdrBtnGhost}
              title="Ok renk paleti — sahnedeki edge'lerin rengini değiştir"
            >
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: 2,
                background: edgePalette.colors.electric, marginRight: 4, verticalAlign: "middle",
              }} />
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: 2,
                background: edgePalette.colors.gas, marginRight: 6, verticalAlign: "middle",
              }} />
              Palet
            </button>
            {paletteMenuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 70,
                width: 240, background: "#ffffff", border: `1px solid ${C.edgeFaint}`,
                borderRadius: 10, boxShadow: "0 12px 32px rgba(15,23,42,0.18)", padding: 6,
              }}>
                <div style={{
                  padding: "6px 10px", fontSize: 9, color: C.mid, letterSpacing: 1.5,
                  fontFamily: mono, borderBottom: `1px solid ${C.edgeFaint}`, marginBottom: 4,
                }}>OK RENK PALETİ</div>
                {EDGE_PALETTES.map(p => {
                  const active = p.id === edgePaletteId;
                  const swatchOrder: EdgeRole[] = ["electric", "gas", "shortfall", "select", "warn"];
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setEdgePaletteId(p.id); setPaletteMenuOpen(false); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 10px", borderRadius: 6,
                        background: active ? C.accentSoft : "transparent",
                        border: "none", cursor: "pointer",
                        fontSize: 12, color: C.ink, fontFamily: mono, textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f5f3ec"; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{
                        width: 16, height: 16, display: "inline-flex",
                        alignItems: "center", justifyContent: "center",
                        border: `1.5px solid ${active ? C.accent : C.mid}`,
                        borderRadius: 3, fontSize: 10, color: C.accent, fontWeight: 700,
                      }}>{active ? "✓" : ""}</span>
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <span style={{ display: "inline-flex", gap: 2 }}>
                        {swatchOrder.map(r => (
                          <span key={r} style={{
                            width: 10, height: 10, borderRadius: 2,
                            background: p.colors[r],
                            border: "1px solid rgba(15,23,42,0.12)",
                          }} />
                        ))}
                      </span>
                    </button>
                  );
                })}
                <div style={{
                  padding: "8px 10px", fontSize: 10, color: C.mid, fontFamily: mono,
                  borderTop: `1px solid ${C.edgeFaint}`, marginTop: 4, lineHeight: 1.5,
                }}>
                  Tercih localStorage'a kaydedilir, tüm sahne ve sipariş okları yeniden renklenir.
                </div>
              </div>
            )}
          </div>
          <div ref={scenariosRef} style={{ position: "relative" }}>
            <button
              onClick={() => setScenariosOpen(o => !o)}
              style={scenariosOpen ? hdrBtnAccent : hdrBtnGhost}
              title="Tüm kayıtlı senaryoları aç"
            >
              Senaryolarım{scenarios.length > 0 ? ` (${scenarios.length})` : ""}
            </button>
            {scenariosOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 70,
                width: 360, maxHeight: 480, overflowY: "auto",
                background: "#ffffff", border: `1px solid ${C.edgeFaint}`,
                borderRadius: 10, boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
                padding: 6,
              }}>
                <div style={{
                  padding: "8px 10px", fontSize: 9, color: C.mid, letterSpacing: 1.5,
                  fontFamily: mono, borderBottom: `1px solid ${C.edgeFaint}`, marginBottom: 4,
                }}>
                  KAYITLI SENARYOLAR · {scenarios.length}
                </div>
                {scenarios.length === 0 ? (
                  <div style={{ padding: "16px 12px", fontSize: 12, color: C.mid, fontFamily: mono, textAlign: "center", lineHeight: 1.5 }}>
                    Henüz senaryo yok.<br />
                    Üstte "◈ senaryo yap" butonuna bas — şu anki canvas senaryo olarak kaydedilir.
                  </div>
                ) : [...scenarios]
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map(s => {
                    const isActive = s.id === activeScenarioId;
                    const date = new Date(s.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "2-digit" });
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 10px", borderRadius: 6,
                          background: isActive ? C.accentSoft : "transparent",
                          cursor: "pointer", marginBottom: 2,
                        }}
                        onClick={() => { loadScenario(s.id); setScenariosOpen(false); }}
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f5f3ec"; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <span style={{ color: C.accent, fontSize: 14 }}>◇</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: mono,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {s.name}
                            {isActive && (
                              <span style={{
                                marginLeft: 6, fontSize: 9, padding: "1px 5px",
                                background: C.accent, color: "#fff", borderRadius: 3,
                                letterSpacing: 0.5, fontWeight: 700,
                              }}>AÇIK</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: C.mid, fontFamily: mono, marginTop: 2 }}>
                            {s.payload.orders.length} sipariş
                            {(s.payload.customers ?? []).length > 0 && ` · ${(s.payload.customers ?? []).length} müşteri`}
                            {(s.payload.flaskItems ?? []).length > 0 && ` · tepkime ${(s.payload.flaskItems ?? []).length}`}
                            {" · "}{date}
                          </div>
                        </div>
                        <button
                          title="kopya"
                          onClick={(e) => {
                            e.stopPropagation();
                            const newName = window.prompt("Kopya adı:", `${s.name} (kopya)`);
                            if (!newName) return;
                            const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
                            const copy: ScenarioSnapshot = {
                              ...s, id, name: newName,
                              createdAt: Date.now(), updatedAt: Date.now(),
                            };
                            setScenarios(prev => [...prev, copy]);
                          }}
                          style={{
                            background: "transparent", border: "none", color: C.mid,
                            cursor: "pointer", padding: "4px 6px", fontFamily: mono, fontSize: 12,
                          }}
                        >⎘</button>
                        <button
                          title="sil"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`"${s.name}" senaryosunu sil?`)) deleteScenarioById(s.id);
                          }}
                          style={{
                            background: "transparent", border: "none", color: C.mid,
                            cursor: "pointer", padding: "4px 6px", fontFamily: mono, fontSize: 12,
                          }}
                        >✕</button>
                      </div>
                    );
                  })}
                <div style={{
                  padding: "8px 10px", fontSize: 10, color: C.mid, fontFamily: mono,
                  borderTop: `1px solid ${C.edgeFaint}`, marginTop: 4, lineHeight: 1.5,
                }}>
                  💡 Arama kutusuna boş tıklayınca da liste açılır
                </div>
              </div>
            )}
          </div>
          <button
            onClick={toggleFlaskOpen}
            style={flaskOpen ? hdrBtnFlaskActive : hdrBtnFlask}
            title="Tepkime denklemi (siparişleri sürükle veya tek tıkla doldur, AI iki senaryo üretir)"
          >
            Tepkime{flaskItems.length > 0 ? ` (${flaskItems.length})` : ""}
          </button>
          <button onClick={() => { setEditing(null); setModalOpen(true); }} style={hdrBtnAccent}>+ Sipariş</button>
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
        {/* ─── Workbench widget'ları — sadece widgetVis bayrağı açıksa render ─── */}
        {!widgetVis.scene && widgetVis.customers && (
          <CustomersPanel
            pos={customersPanelPos}
            customers={customers}
            orders={orders}
            isOpen={customersPanelOpen}
            expanded={expandedCustomers}
            onMove={setCustomersPanelPos}
            onTogglePanel={() => setCustomersPanelOpen(o => !o)}
            onToggleCustomer={toggleCustomer}
            onCreateOrderFor={handleCreateOrderFor}
            onEditOrder={focusOrderOnCanvas}
            onRemoveCustomer={removeCustomer}
            onAddCustomer={(label, cat) => { addCustomer(label, cat); }}
            getMouseInWorld={getMouseInWorld}
            viewport={viewport}
          />
        )}
        {!widgetVis.scene && widgetVis.categories && (
          <CategoriesPanel
            pos={categoriesPos}
            activeCategory={activeCategory}
            onMove={setCategoriesPos}
            onSelect={setActiveCategory}
            getMouseInWorld={getMouseInWorld}
            viewport={viewport}
          />
        )}
        {!widgetVis.scene && widgetVis.products && (
          <ProductsPalette
            pos={productsPos}
            activeCategory={activeCategory}
            orders={orders}
            onMove={setProductsPos}
            onCreateOrderForSku={(sku) => {
              const o: Order = {
                id: `o_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                customer: "",
                sku,
                quantity: 100,
                deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                createdAt: Date.now(),
              };
              setEditing(o);
              setModalOpen(true);
            }}
            getMouseInWorld={getMouseInWorld}
            viewport={viewport}
          />
        )}
        {!widgetVis.scene && widgetVis.stages && (
          <ProductionStagesPanel
            pos={stagesPos}
            orders={orders}
            onMove={setStagesPos}
            onSelectOrder={focusOrderOnCanvas}
            getMouseInWorld={getMouseInWorld}
            viewport={viewport}
          />
        )}
        {!widgetVis.scene && widgetVis.factory && (
          <FactoryWidget
            pos={factoryPos}
            orderCount={orders.length}
            onMove={setFactoryPos}
            getMouseInWorld={getMouseInWorld}
            viewport={viewport}
          />
        )}
        {widgetVis.scene && (
          <CustomersSceneRenderer
            positions={scenePositions}
            onMove={moveSceneAtom}
            getMouseInWorld={getMouseInWorld}
            viewport={viewport}
            setViewport={setViewport}
            wrapperRef={wrapperRef}
            edgePalette={edgePalette}
            shapeOverrides={sceneShapeOverrides}
            setShape={setSceneShape}
            clearShape={clearSceneShape}
            customEdges={sceneCustomEdges}
            addCustomEdge={addSceneCustomEdge}
            removeCustomEdge={removeSceneCustomEdge}
            clearAllCustomEdges={clearAllSceneCustomEdges}
            atomMeta={sceneAtomMeta}
            setAtomMetaField={setSceneAtomMetaField}
            clearAtomMeta={clearSceneAtomMeta}
          />
        )}
        {!widgetVis.scene && widgetVis.supply && (
          <SupplyEquationPanel
            pos={supplyPos}
            entries={supplyEntries}
            onMove={setSupplyPos}
            onChange={setSupplyEntries}
            onApplyToFlask={(entries) => {
              setFlaskSupplies(entries.map(e => ({
                id: e.id,
                componentCode: e.code,
                qty: e.qty,
                leadDays: e.leadDays,
              })));
              setFlaskOpen(true);
            }}
            getMouseInWorld={getMouseInWorld}
            viewport={viewport}
          />
        )}

        {orders.length === 0 ? null : (
          <>
            <EdgesLayer
              orders={orders}
              allDefaults={allDefaults}
              posOverrides={posOverrides}
              stockBySku={stockBySku}
              expandedByOrder={expandedSubs}
              viewport={viewport}
              edgePalette={edgePalette}
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
                onAddToFlask={() => addOrderToFlask(o)}
                getMouseInWorld={getMouseInWorld} viewport={viewport}
                allOrders={orders}
                stockBySku={stockBySku}
              />
            ))}
          </>
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
          customers={customers}
          prefilledCustomer={pendingNewOrderCustomer}
          onAutoCreateCustomer={(label, cat) => { addCustomer(label, cat); }}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
            setPendingNewOrderCustomer(null);
          }}
          onSave={(o) => {
            upsertOrder(o);
            setPendingNewOrderCustomer(null);
            // Otomatik o müşteriyi panel'de aç
            const cust = customers.find(c => c.label.toLowerCase() === o.customer.toLowerCase());
            if (cust && !expandedCustomers.includes(cust.id)) {
              setExpandedCustomers(prev => [...prev, cust.id]);
            }
          }}
        />
      )}

      {flaskOpen && (
        <ReactionFlask
          items={flaskItems}
          setItems={setFlaskItems}
          supplies={flaskSupplies}
          setSupplies={setFlaskSupplies}
          result={reactionResult}
          setResult={setReactionResult}
          onClose={() => setFlaskOpen(false)}
          pendingOrdersCount={orders.length}
          onAddAll={addAllOrdersToFlask}
          onDropPayload={handleFlaskDropPayload}
        />
      )}

      {reactionResult && (
        <ReactionGantt
          result={reactionResult}
          onClose={() => setReactionResult(null)}
        />
      )}

      </>)}
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
const hdrBtnFlask: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 8, cursor: "pointer",
  background: "rgba(201,100,66,0.15)", border: `1px solid rgba(201,100,66,0.55)`,
  color: "#c96442", fontFamily: mono, fontSize: 12, fontWeight: 600,
};
const hdrBtnFlaskActive: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 8, cursor: "pointer",
  background: "#c96442", border: `1px solid #c96442`,
  color: "#ffffff", fontFamily: mono, fontSize: 12, fontWeight: 700,
};
