import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";
import { Link, useLocation } from "wouter";
import {
  BH_OBJECT_TYPES, BH_LINK_TYPES, BH_ACTION_TYPES,
  objectTypeForKind, actionsForObjectType, linksForObjectType,
  cardinalityLabel, ontologyMeta,
  type ObjectTypeSpec, type ActionTypeSpec, type LinkTypeSpec,
} from "@/lib/bh-ontology-schema";
import { useSelection } from "@/lib/selection-context";

/* ═══════════════════════════════════════════════════════════
   BH ONTOLOGY CANVAS — Canlı Organizma (Tier 1)
   L1 Kinetics · L2 Cross-ref hover · L3 What-if dry-run · L5 Flow anim
   ═══════════════════════════════════════════════════════════ */

const C = {
  // Palantir-light Foundry palette — pure white canvas, slate ink, saturated status accents
  bg: "#ffffff",
  panelBg: "#ffffff",
  surface: "#f8fafc", surfaceHover: "#f1f5f9",
  border: "rgba(15,23,42,0.10)", borderActive: "rgba(15,23,42,0.22)",
  accent: "#2563eb", accentDim: "rgba(37,99,235,0.08)",
  ok: "#059669", okDim: "rgba(5,150,105,0.10)", okBorder: "rgba(5,150,105,0.35)",
  warn: "#d97706", warnDim: "rgba(217,119,6,0.10)", warnBorder: "rgba(217,119,6,0.35)",
  variable: "#ea580c", variableDim: "rgba(234,88,12,0.10)", variableBorder: "rgba(234,88,12,0.40)",
  err: "#dc2626", errDim: "rgba(220,38,38,0.10)", errBorder: "rgba(220,38,38,0.35)",
  blue: "#2563eb", blueDim: "rgba(37,99,235,0.08)", blueBorder: "rgba(37,99,235,0.30)",
  purple: "#7c3aed",
  // NOTE: token names kept for diff stability — `white` now = primary ink, `dim*` = neutral backgrounds
  white: "#0f172a", mid: "#475569", dim: "#94a3b8", dimmer: "#e2e8f0",
};
// Palantir uses Alliance No.1 (proprietary) — closest free substitute: Inter
// with alternate-char OpenType features for more Alliance-like rendering.
const mono = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
const INTER_FEATURES = "'cv11', 'ss01', 'ss02', 'cv02', 'cv03', 'cv04'"; // single-story a, alt g, flat l
const fmt = (n: number) => n.toLocaleString("tr-TR");

const BH_SKUS = ["BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV"] as const;

type Status = "critical" | "warning" | "ok" | "abundant" | "variable" | "N/A";

interface BomComponent {
  code: string; name: string; requiredPerUnit: number; unit: string;
  tier: number; parentComponentCode: string | null;
  currentStock: number; rawStock?: number; maxProducts: number | null;
  status: Status;
  isSubAssembly?: boolean;
  children?: BomComponent[];
}

// Recursive subassembly → flat collection (for drill-down)
function collectChildrenRecursive(comp: BomComponent, parentCode: string, acc: Array<{ child: BomComponent; parentCode: string }> = []): Array<{ child: BomComponent; parentCode: string }> {
  if (!comp.children || comp.children.length === 0) return acc;
  for (const c of comp.children) {
    acc.push({ child: c, parentCode });
    if (c.children && c.children.length > 0) collectChildrenRecursive(c, c.code, acc);
  }
  return acc;
}
interface BomResponse { product: string; components: BomComponent[] }
interface Capacity {
  product: string; maxProducible: number;
  bottlenecks: Array<{ code: string; name: string; stock: number; required: number; maxProducts: number }>;
}
interface IntelComponent {
  code: string; dailyBurnRate: number; seasonalDays: number | null;
  daysToStockout: number | null; trend: string; urgency: string;
  depletionMonth: string | null; winterStress: boolean;
}
interface IntelResponse { components: IntelComponent[] }

interface GraphNode {
  id: string; kind: "device" | "component" | "subassembly" | "subcomponent" | "variable";
  label: string; sublabel: string;
  sku?: string; code?: string;
  /* For multi-visual copies — which device column this visual belongs to */
  deviceSku?: string;
  usedBy: string[];
  currentStock?: number; status?: Status;
  maxProducible?: number; isBottleneck?: boolean; isShared?: boolean;
  unit?: string;
  /* L1 Kinetics */
  dailyBurnRate?: number;
  daysLeft?: number | null;
  trend?: string;
  depletionMonth?: string | null;
  /* L3 Required per BH (for dry-run) */
  requiredByDevice?: Record<string, number>;
  /* Drill-down: parent subassembly info */
  parentSubCode?: string;
  hasChildren?: boolean;
  childrenCount?: number;
}

interface GraphLink {
  from: string; to: string; required: number; tier: number;
  linkTypeApiName: "consumes" | "assembles" | "sharedAcross";
}

const LAYOUT_KEY = "bh-ontology-layout-v9-foundry-tile";
const EXPANDED_KEY = "bh-ontology-expanded-v1";
const CANVAS_W = 2200;
const CANVAS_H = 3200;

function statusColor(s?: Status, isBottleneck?: boolean): { fg: string; bg: string; border: string } {
  if (isBottleneck) return { fg: C.err, bg: C.errDim, border: C.errBorder };
  switch (s) {
    case "critical":  return { fg: C.err, bg: C.errDim, border: C.errBorder };
    case "variable":  return { fg: C.variable, bg: C.variableDim, border: C.variableBorder };
    case "warning":   return { fg: C.warn, bg: C.warnDim, border: C.warnBorder };
    case "ok":        return { fg: C.blue, bg: C.blueDim, border: C.blueBorder };
    case "abundant":  return { fg: C.ok, bg: C.okDim, border: C.okBorder };
    default:          return { fg: C.mid, bg: C.surface, border: C.border };
  }
}
/* Palantir-style gradient fill URL per status (refers to SVG <defs>) */
function statusGradientUrl(s?: Status, isBottleneck?: boolean): string {
  if (isBottleneck) return "url(#nodeCritical)";
  switch (s) {
    case "critical":  return "url(#nodeCritical)";
    case "variable":  return "url(#nodeVariable)";
    case "warning":   return "url(#nodeWarning)";
    case "ok":        return "url(#nodeOk)";
    case "abundant":  return "url(#nodeAbundant)";
    default:          return "url(#nodeMid)";
  }
}
function statusLabel(s?: Status): string {
  switch (s) {
    case "critical": return "KRİTİK";
    case "variable": return "DEĞİŞKEN";
    case "warning":  return "DÜŞÜK";
    case "ok":       return "YETERLİ";
    case "abundant": return "BOL";
    default:         return "—";
  }
}

/* L1 velocity → ok simgesi + renk */
function velocityIcon(burn: number | undefined, trend: string | undefined): { icon: string; color: string } {
  if (!burn || burn === 0) return { icon: "─", color: C.dim };
  if (trend === "accelerating") return { icon: "↑↑", color: C.err };
  if (trend === "increasing") return { icon: "↑", color: C.warn };
  if (trend === "decreasing") return { icon: "↓", color: C.ok };
  return { icon: "→", color: C.blue };
}

/* L3 — dry-run: verilen override map'ine göre 4 BH maxProducible hesap
   overrides keyed by raw CODE (not visual id) since stock is physically singular */
function dryRunCapacity(
  sku: string,
  overrides: Record<string, number>,
  nodes: GraphNode[],
  links: GraphLink[],
): { max: number; bottleneckCode: string | null } {
  const compLinks = links.filter(l => l.from === sku);
  let min = Infinity;
  let btc: string | null = null;
  for (const l of compLinks) {
    const n = nodes.find(nn => nn.id === l.to);
    if (!n) continue;
    if (n.status === "variable" || n.kind === "variable") continue;
    const code = n.code ?? l.to;
    // BH on-demand: stok=0 direct material bottleneck sayılmaz
    const stock = overrides[code] !== undefined ? overrides[code] : (n.currentStock ?? 0);
    if (stock === 0) continue;
    if (l.required <= 0) continue;
    const possible = Math.floor(stock / l.required);
    if (possible < min) { min = possible; btc = code; }
  }
  if (min === Infinity) return { max: 0, bottleneckCode: null };
  return { max: min, bottleneckCode: btc };
}

/* ── Default layout — grid: cihaz kolonları, bileşen satırları, yarı mamül aşağı, değişken en altta ──
   Shape boyutları (NodeView):
     device 240×96, component 200×160, subassembly 170×170, subComp 110×110, variable 150×130
   Her satır yüksekliği şekil boyutu + min 30px gap olmalı, yoksa üst üste biner. */
const DEVICE_ORDER = ["BH.50ST.SV", "BH.50UT.SV", "BH.55ST.SV", "BH.55UT.SV"];
const Y_CHART_TOP = 40;
const Y_DEVICE = 420;         // XL chart için daha fazla üst boşluk
const Y_TIER1_START = 560;    // device (96h) + 100 buffer (kart yataylaşınca daha az boşluk yetiyor)
const ROW_H = 118;            // component 96 + 22 gap (Foundry-tile)
const Y_SUBASSEMBLY_GAP = 70;
const SUB_ROW_H = 110;        // subassembly tile 88 + 22 gap
const Y_SUBCOMP_GAP = 90;     // parent tile alt sınırı + 22 buffer
const SUBCOMP_ROW_H = 84;     // child tile 64 + 20 gap
const Y_VARIABLE_GAP = 70;
const VARIABLE_ROW_H = 110;   // variable tile 88 + 22 gap

function defaultLayout(nodes: GraphNode[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};

  // Devices sorted in fixed order
  const devices = nodes.filter(n => n.kind === "device");
  const sortedDev = [...devices].sort((a, b) =>
    DEVICE_ORDER.indexOf(a.sku!) - DEVICE_ORDER.indexOf(b.sku!)
  );
  const D = sortedDev.length;
  const colW = CANVAS_W / (D + 1);
  const colX = (i: number) => colW * (i + 1);
  const deviceCol: Record<string, number> = {};
  sortedDev.forEach((d, i) => {
    deviceCol[d.sku!] = i;
    pos[d.id] = { x: colX(i), y: Y_DEVICE };
  });

  // Partition visual tier-1 nodes by code (to place all copies at same Y)
  const tier1 = nodes.filter(n => n.kind === "component" || n.kind === "subassembly");
  const variables = nodes.filter(n => n.kind === "variable");
  const subComps = nodes.filter(n => n.kind === "subcomponent");

  // Group tier-1 by code
  const groupByCode = (list: GraphNode[]): Map<string, GraphNode[]> => {
    const m = new Map<string, GraphNode[]>();
    for (const n of list) {
      const c = n.code!;
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(n);
    }
    return m;
  };

  const regularComps = tier1.filter(n => n.kind === "component");
  const subAsms = tier1.filter(n => n.kind === "subassembly");

  const regularGroups = groupByCode(regularComps);
  const subGroups = groupByCode(subAsms);
  const varGroups = groupByCode(variables);

  // Sort groups: most-shared first, then by code for stability
  const sortGroups = (groups: Map<string, GraphNode[]>): Array<[string, GraphNode[]]> => {
    return Array.from(groups.entries()).sort(([ca, a], [cb, b]) => {
      const diff = b.length - a.length;
      if (diff !== 0) return diff;
      return ca.localeCompare(cb);
    });
  };

  // Place regular tier-1 components
  let currentY = Y_TIER1_START;
  for (const [code, copies] of sortGroups(regularGroups)) {
    for (const copy of copies) {
      const idx = deviceCol[copy.deviceSku!];
      if (idx === undefined) continue;
      pos[copy.id] = { x: colX(idx), y: currentY };
    }
    currentY += ROW_H;
  }

  // Subassemblies below tier-1 components
  currentY += Y_SUBASSEMBLY_GAP;
  const subAssemblyRowY: Record<string, number> = {};
  for (const [code, copies] of sortGroups(subGroups)) {
    subAssemblyRowY[code] = currentY;
    for (const copy of copies) {
      const idx = deviceCol[copy.deviceSku!];
      if (idx === undefined) continue;
      pos[copy.id] = { x: colX(idx), y: currentY };
    }
    currentY += SUB_ROW_H;
  }

  // Subcomponents fan down under their parent visual copy
  const byParent = new Map<string, GraphNode[]>();
  for (const sc of subComps) {
    const parentId = sc.parentSubCode ?? "";
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push(sc);
  }
  // Grid fan-out — 3 sütun × N satır (dikey yer %66 azalır, kolon içi kalır)
  byParent.forEach((children: GraphNode[], parentId: string) => {
    const parentPos = pos[parentId];
    if (!parentPos) return;
    const cols = Math.min(3, children.length);
    const gapX = 130;                            // child 110 + 20 gap
    const gapY = SUBCOMP_ROW_H;                  // 140
    const startY = parentPos.y + Y_SUBCOMP_GAP;  // parent center + 170 = daire altı + buffer
    children.forEach((c: GraphNode, i: number) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Satırın ortasına hizala
      const rowChildCount = Math.min(cols, children.length - row * cols);
      const xOffset = (col - (rowChildCount - 1) / 2) * gapX;
      pos[c.id] = { x: parentPos.x + xOffset, y: startY + row * gapY };
    });
  });

  // Variables at the bottom (triangles)
  // Compute max bottom of all placed nodes
  let maxY = currentY;
  Object.values(pos).forEach(p => { if (p.y > maxY) maxY = p.y; });
  currentY = maxY + Y_VARIABLE_GAP;
  for (const [code, copies] of sortGroups(varGroups)) {
    for (const copy of copies) {
      const idx = deviceCol[copy.deviceSku!];
      if (idx === undefined) continue;
      pos[copy.id] = { x: colX(idx), y: currentY };
    }
    currentY += VARIABLE_ROW_H;
  }

  return pos;
}

function loadLayout(): Record<string, { x: number; y: number }> {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}"); } catch { return {}; }
}
function saveLayout(layout: Record<string, { x: number; y: number }>) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function BhOntologyPage() {
  const qc = useQueryClient();

  /* 4 BH BOM + capacity + intelligence parallel fetch */
  const bomQueries = BH_SKUS.map(sku =>
    useQuery<BomResponse>({ queryKey: [`/api/bom/${sku}/stock`] })
  );
  const capQueries = BH_SKUS.map(sku =>
    useQuery<Capacity>({ queryKey: [`/api/bom/${sku}/production-capacity`] })
  );
  const intelQueries = BH_SKUS.map(sku =>
    useQuery<IntelResponse>({ queryKey: [`/api/bom/${sku}/intelligence`] })
  );
  /* Sales time series per device — for mini chart above each BH */
  const salesQueries = BH_SKUS.map(sku =>
    useQuery<{ salesMonthly: Array<{ year: number; month: number; units: number; label: string }> }>({
      queryKey: [`/api/ontology/timeseries/${sku}`],
      queryFn: async () => {
        const res = await fetch(`/api/ontology/timeseries/${encodeURIComponent(sku)}?sku=${encodeURIComponent(sku)}`);
        if (!res.ok) throw new Error(`ts ${res.status}`);
        return res.json();
      },
      staleTime: 5 * 60 * 1000,
    })
  );
  const salesByDevice: Record<string, Array<{ label: string; units: number }>> = {};
  BH_SKUS.forEach((sku, i) => {
    const m = salesQueries[i].data?.salesMonthly ?? [];
    salesByDevice[sku] = m.slice(-12).map(x => ({ label: x.label, units: x.units }));
  });
  /* GLOBAL MAX across all 4 devices — so chart bars are comparable between columns */
  const salesGlobalMax = useMemo(() => {
    let max = 0;
    for (const sku of BH_SKUS) {
      const bars = salesByDevice[sku] ?? [];
      for (const b of bars) if (b.units > max) max = b.units;
    }
    return max;
  }, [salesByDevice]);
  const salesTotals: Record<string, number> = {};
  BH_SKUS.forEach(sku => {
    salesTotals[sku] = (salesByDevice[sku] ?? []).reduce((a, b) => a + b.units, 0);
  });
  const allLoaded = bomQueries.every(q => q.data) && capQueries.every(q => q.data) && intelQueries.every(q => q.data);

  /* Drill-down: expanded subassemblies (persist) */
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set<string>();
  });
  const toggleExpanded = useCallback((code: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }, []);

  /* WS pulse — hangi kodlar yeni değişti */
  const [pulseCodes, setPulseCodes] = useState<Map<string, number>>(new Map());
  const triggerPulse = useCallback((codes: string[]) => {
    const now = Date.now();
    setPulseCodes(prev => {
      const next = new Map(prev);
      for (const c of codes) next.set(c, now);
      return next;
    });
    setTimeout(() => {
      setPulseCodes(prev => {
        const next = new Map(prev);
        for (const c of codes) {
          const t = next.get(c);
          if (t === now) next.delete(c);
        }
        return next;
      });
    }, 2000);
  }, []);

  /* Graph model build (with intelligence merge) */
  const { nodes, links } = useMemo(() => {
    if (!allLoaded) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

    const nodeMap: Map<string, GraphNode> = new Map();
    const linkList: GraphLink[] = [];
    // intelligence map: code → IntelComponent (4 BH birleşik, en güncel seasonalDays al)
    const intelByCode: Map<string, IntelComponent> = new Map();
    BH_SKUS.forEach((_, i) => {
      const ic = intelQueries[i].data!.components;
      for (const c of ic) {
        const prev = intelByCode.get(c.code);
        // en kısa daysToStockout / seasonalDays'i tut (en kritik görünüm)
        if (!prev || ((c.seasonalDays ?? Infinity) < (prev.seasonalDays ?? Infinity))) {
          intelByCode.set(c.code, c);
        }
      }
    });

    // ─────────────────────────────────────────────────────
    // Per-device visual copy model:
    // • Device: id = SKU (single)
    // • Component/Subassembly/Variable: id = `${code}@${sku}` — one per usedBy device
    // • Subcomponent: id = `${parentVisualId}::${childCode}` — under each parent visual copy
    // • Links use visualIds
    // • Sharedness computed from how many copies of same code exist
    // ─────────────────────────────────────────────────────

    // Pass 1: Build usedBy map (code → array of SKUs using it)
    const codeUsedBy: Map<string, string[]> = new Map();
    BH_SKUS.forEach((sku, i) => {
      const comps = bomQueries[i].data!.components;
      for (const c of comps) {
        const list = codeUsedBy.get(c.code) ?? [];
        if (!list.includes(sku)) list.push(sku);
        codeUsedBy.set(c.code, list);
      }
    });
    const sharedCodes = new Set<string>();
    codeUsedBy.forEach((skus, code) => { if (skus.length >= 2) sharedCodes.add(code); });

    // Device nodes
    BH_SKUS.forEach((sku, i) => {
      const cap = capQueries[i].data!;
      nodeMap.set(sku, {
        id: sku, kind: "device", label: sku,
        sublabel: `max ${fmt(cap.maxProducible)} adet`,
        sku, usedBy: [], maxProducible: cap.maxProducible,
      });
    });

    // Bottlenecks by code (across all 4 BH)
    const bottleneckCodes = new Set<string>();
    BH_SKUS.forEach((_, i) => {
      const bt = capQueries[i].data!.bottlenecks[0];
      if (bt) bottleneckCodes.add(bt.code);
    });

    // Tier-1: create one visual copy per device that uses the component
    BH_SKUS.forEach((sku, i) => {
      const comps = bomQueries[i].data!.components;
      for (const c of comps) {
        const visualId = `${c.code}@${sku}`;
        if (nodeMap.has(visualId)) continue;
        const intel = intelByCode.get(c.code);
        const hasCh = (c.children && c.children.length > 0) || c.isSubAssembly === true;
        const isShared = sharedCodes.has(c.code);
        // Kind: variable status overrides to triangle
        let kind: GraphNode["kind"] = hasCh ? "subassembly" : "component";
        if (c.status === "variable") kind = "variable";
        nodeMap.set(visualId, {
          id: visualId,
          kind,
          label: c.code,
          sublabel: c.name,
          code: c.code,
          deviceSku: sku,
          usedBy: codeUsedBy.get(c.code) ?? [sku],
          currentStock: c.currentStock, status: c.status, unit: c.unit,
          dailyBurnRate: intel?.dailyBurnRate,
          daysLeft: intel?.seasonalDays ?? intel?.daysToStockout ?? null,
          trend: intel?.trend,
          depletionMonth: intel?.depletionMonth ?? null,
          requiredByDevice: { [sku]: c.requiredPerUnit },
          hasChildren: hasCh,
          childrenCount: c.children?.length ?? 0,
          isShared,
          isBottleneck: bottleneckCodes.has(c.code),
        });
        linkList.push({ from: sku, to: visualId, required: c.requiredPerUnit, tier: 1, linkTypeApiName: "consumes" });
      }
    });

    // Subcomponents: under each parent visual copy, when that parent is expanded
    BH_SKUS.forEach((sku, i) => {
      const comps = bomQueries[i].data!.components;
      for (const c of comps) {
        if (!c.isSubAssembly || !c.children || !expandedSubs.has(c.code)) continue;
        const parentVisualId = `${c.code}@${sku}`;
        const flat = collectChildrenRecursive(c, c.code);
        for (const { child, parentCode } of flat) {
          // parentCode is the raw code from the BOM walk; map to THIS device's parent visual
          const thisParentVisual = `${parentCode}@${sku}`;
          const childVisual = `${thisParentVisual}::${child.code}`;
          if (nodeMap.has(childVisual)) continue;
          const intel = intelByCode.get(child.code);
          nodeMap.set(childVisual, {
            id: childVisual,
            kind: "subcomponent",
            label: child.code,
            sublabel: child.name,
            code: child.code,
            deviceSku: sku,
            usedBy: [thisParentVisual],
            currentStock: child.currentStock, status: child.status, unit: child.unit,
            dailyBurnRate: intel?.dailyBurnRate,
            daysLeft: intel?.seasonalDays ?? intel?.daysToStockout ?? null,
            trend: intel?.trend,
            depletionMonth: intel?.depletionMonth ?? null,
            parentSubCode: thisParentVisual,
            hasChildren: (child.children?.length ?? 0) > 0,
            childrenCount: child.children?.length ?? 0,
          });
          linkList.push({ from: thisParentVisual, to: childVisual, required: child.requiredPerUnit, tier: child.tier, linkTypeApiName: "assembles" });
        }
      }
    });

    return { nodes: Array.from(nodeMap.values()), links: linkList };
  }, [allLoaded, bomQueries, capQueries, intelQueries, expandedSubs]);

  /* Layout */
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    if (!allLoaded || nodes.length === 0) return;
    const saved = loadLayout();
    const defaults = defaultLayout(nodes);
    const merged: Record<string, { x: number; y: number }> = { ...defaults };
    for (const n of nodes) if (saved[n.id]) merged[n.id] = saved[n.id];
    setPositions(merged);
  }, [allLoaded, nodes.length]);

  /* Drag */
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const toSvgCoords = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const res = pt.matrixTransform(ctm.inverse());
    return { x: res.x, y: res.y };
  }, []);
  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const pos = positions[id];
    if (!pos) return;
    const { x, y } = toSvgCoords(e);
    dragOffsetRef.current = { dx: x - pos.x, dy: y - pos.y };
    setDragId(id);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, [positions, toSvgCoords]);
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragId) return;
    const { x, y } = toSvgCoords(e);
    setPositions(prev => ({ ...prev, [dragId]: { x: x - dragOffsetRef.current.dx, y: y - dragOffsetRef.current.dy } }));
  }, [dragId, toSvgCoords]);
  const handlePointerUp = useCallback(() => {
    if (dragId) { setDragId(null); saveLayout(positions); }
  }, [dragId, positions]);

  /* L2 Cross-ref highlight */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const connectedSet = useMemo(() => {
    if (!hoveredId) return null;
    const set = new Set<string>([hoveredId]);
    for (const l of links) {
      if (l.from === hoveredId) set.add(l.to);
      if (l.to === hoveredId) set.add(l.from);
    }
    // Also highlight sibling visual copies of same code
    const hoveredNode = nodes.find(n => n.id === hoveredId);
    if (hoveredNode?.code) {
      for (const n of nodes) {
        if (n.code === hoveredNode.code) set.add(n.id);
      }
    }
    return set;
  }, [hoveredId, links, nodes]);

  /* Object inspector drawer */
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspectedNode = useMemo(() => inspectedId ? nodes.find(n => n.id === inspectedId) : null, [inspectedId, nodes]);

  /* Çoklu seçim (Cmd/Shift+click) */
  const { toggle: toggleSelection } = useSelection();
  const handleNodeClick = useCallback((n: GraphNode, e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.shiftKey || e.ctrlKey)) {
      const code = n.code || n.id;
      toggleSelection({
        code,
        label: n.label || code,
        kind: n.kind,
        currentStock: n.currentStock,
        dailyBurnRate: n.dailyBurnRate,
        daysLeft: n.daysLeft,
        usedBy: n.usedBy,
        isShared: n.isShared,
        isBottleneck: n.isBottleneck,
        status: n.status,
      });
      return;
    }
    setInspectedId(n.id);
  }, [toggleSelection]);

  /* Search + Filter */
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterActive = searchQuery.trim().length > 0 || statusFilter.size > 0;
  const matchesFilter = useCallback((n: GraphNode): boolean => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${n.label} ${n.sublabel} ${n.code ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statusFilter.size > 0) {
      const tags: string[] = [];
      if (n.status) tags.push(n.status);
      if (n.isShared) tags.push("shared");
      if (n.isBottleneck) tags.push("bottleneck");
      if (n.kind === "device") tags.push("device");
      if (!Array.from(statusFilter).some(f => tags.includes(f))) return false;
    }
    return true;
  }, [searchQuery, statusFilter]);

  /* Hover tooltip (400ms delay) */
  const [hoverTooltip, setHoverTooltip] = useState<{ id: string } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Legend collapse */
  const [legendOpen, setLegendOpen] = useState(false);

  /* BH grupları dropdown + Strateji modal */
  const [, navigate] = useLocation();
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [strategyName, setStrategyName] = useState("");
  const [strategyDesc, setStrategyDesc] = useState("");
  const groupsMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!groupsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (groupsMenuRef.current && !groupsMenuRef.current.contains(e.target as Node)) setGroupsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [groupsOpen]);

  /* L3 What-if dry-run */
  const [whatifOverrides, setWhatifOverrides] = useState<Record<string, number>>({});
  const [whatifFocusCode, setWhatifFocusCode] = useState<string | null>(null);
  const simulationActive = Object.keys(whatifOverrides).length > 0;
  const simulatedCapacity = useMemo(() => {
    const result: Record<string, { max: number; bottleneckCode: string | null }> = {};
    BH_SKUS.forEach(sku => {
      result[sku] = dryRunCapacity(sku, whatifOverrides, nodes, links);
    });
    return result;
  }, [whatifOverrides, nodes, links]);

  /* Inline stock edit (DB'ye yazar) */
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const stockMutation = useMutation({
    mutationFn: async ({ code, stock, unit }: { code: string; stock: number; unit: string }) => {
      const res = await apiRequest("POST", "/api/import/bulk/stock", { items: [{ code, stock, unit }] });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });

  /* Strateji submit — yeni scenario yarat ve simulate sayfasına yönlendir */
  const strategyMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const res = await apiRequest("POST", "/api/foundry/scenarios", payload);
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/foundry/scenarios"] });
      setStrategyOpen(false);
      setStrategyName("");
      setStrategyDesc("");
      navigate(`/ontology/simulate?scenario=${data.id}`);
    },
  });
  const submitStrategy = () => {
    const name = strategyName.trim();
    if (!name) return;
    strategyMutation.mutate({ name, description: strategyDesc.trim() || undefined });
  };

  /* Sales point mutation — device mini-chart drag/click edit */
  const salesMutation = useMutation({
    mutationFn: async (p: { sku: string; year: number; month: number; quantity: number }) => {
      const res = await apiRequest("POST", "/api/planning/point", p);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/ontology/timeseries/${vars.sku}`] });
      BH_SKUS.forEach(sku => {
        qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/intelligence`] });
        qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
      });
    },
  });
  const handleSalesEdit = useCallback((sku: string, barLabel: string, newUnits: number) => {
    // barLabel format: "MM/YY"
    const parts = barLabel.split("/");
    if (parts.length !== 2) return;
    const month = parseInt(parts[0]);
    const year = 2000 + parseInt(parts[1]);
    if (isNaN(month) || isNaN(year)) return;
    salesMutation.mutate({ sku, year, month, quantity: Math.max(0, Math.round(newUnits)) });
  }, [salesMutation]);
  const saveEdit = (node: GraphNode) => {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v >= 0) stockMutation.mutate({ code: node.code ?? node.id, stock: v, unit: node.unit || "AD" });
    setEditingCode(null);
  };

  /* WS live refresh + pulse trigger */
  const handleStockUpdate = useCallback((data: any) => {
    BH_SKUS.forEach(sku => {
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/intelligence`] });
    });
    // Pulse: tüm BH SKU'ları yanında, event'te componentCode varsa onu da ışıklandır
    const codes: string[] = [];
    if (data?.productSku) codes.push(data.productSku);
    if (data?.componentCode) codes.push(data.componentCode);
    if (codes.length > 0) triggerPulse(codes);
  }, [qc, triggerPulse]);
  const handleImpact = useCallback((ev: any) => {
    // impact_propagation event → affectedNodes'ları pulse et
    const codes: string[] = [];
    for (const imp of (ev?.impacts || [])) {
      for (const n of (imp?.affectedNodes || [])) {
        if (n.code) codes.push(n.code);
      }
    }
    if (codes.length > 0) triggerPulse(codes);
  }, [triggerPulse]);
  const { connected } = useStockWebSocket(handleStockUpdate, () => {}, handleImpact);

  /* Viewport pan/zoom */
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [panStart, setPanStart] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const handleBgPointerDown = (e: React.PointerEvent) => {
    if (dragId) return;
    setPanStart({ x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y });
  };
  const handleBgPointerMove = (e: React.PointerEvent) => {
    if (panStart && !dragId) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setViewport(v => ({ ...v, x: panStart.vx + dx / v.scale, y: panStart.vy + dy / v.scale }));
    }
  };
  const handleBgPointerUp = () => setPanStart(null);

  /* Zoom helpers — cursor merkezli. centerX/Y = screen pixel (isteğe bağlı). */
  const zoomAtScreen = useCallback((factor: number, centerX?: number, centerY?: number) => {
    setViewport(v => {
      const newScale = Math.max(0.25, Math.min(3, v.scale * factor));
      if (newScale === v.scale) return v;
      const svg = svgRef.current;
      if (!svg || centerX === undefined || centerY === undefined) {
        return { ...v, scale: newScale };
      }
      const rect = svg.getBoundingClientRect();
      const mx = centerX - rect.left;
      const my = centerY - rect.top;
      const kx = mx / rect.width;
      const ky = my / rect.height;
      return {
        scale: newScale,
        x: v.x + kx * (CANVAS_W / newScale - CANVAS_W / v.scale),
        y: v.y + ky * (CANVAS_H / newScale - CANVAS_H / v.scale),
      };
    });
  }, []);
  const zoomIn = useCallback(() => zoomAtScreen(1.2), [zoomAtScreen]);
  const zoomOut = useCallback(() => zoomAtScreen(0.83), [zoomAtScreen]);
  const zoomReset = useCallback(() => setViewport({ x: 0, y: 0, scale: 1 }), []);
  const snapToSku = useCallback((sku: string) => {
    const p = positions[sku];
    if (p) setViewport({ x: -(p.x - 600), y: -(p.y - 160), scale: 1 });
  }, [positions]);

  /* Wheel:
     • shift+wheel → ZOOM (en kolay, Magic Mouse'ta da çalışır)
     • ctrl/cmd+wheel → ZOOM (trackpad pinch + klavye)
     • default → PAN (2-parmak swipe, Magic Mouse swipe'ı pan eder) */
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomAtScreen(factor, e.clientX, e.clientY);
    } else {
      setViewport(v => ({
        ...v,
        x: v.x - e.deltaX / v.scale,
        y: v.y - e.deltaY / v.scale,
      }));
    }
  };

  /* Problemler */
  const problemCount = useMemo(() => {
    const critical = nodes.filter(n => n.kind !== "device" && n.status === "critical").length;
    const warning = nodes.filter(n => n.kind !== "device" && n.status === "warning").length;
    const bottlenecks = nodes.filter(n => n.isBottleneck).length;
    const shared = nodes.filter(n => n.isShared).length;
    return { critical, warning, bottlenecks, shared };
  }, [nodes]);

  const resetLayout = () => { localStorage.removeItem(LAYOUT_KEY); setPositions(defaultLayout(nodes)); };
  const clearSimulation = () => { setWhatifOverrides({}); setWhatifFocusCode(null); };

  /* Keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";
      if (isInput) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setInspectedId(null);
        setWhatifFocusCode(null);
        setSearchQuery("");
        setStatusFilter(new Set());
      } else if (e.key === "r" || e.key === "R") {
        localStorage.removeItem(LAYOUT_KEY);
        setPositions(defaultLayout(nodes));
      } else if (e.key >= "1" && e.key <= "4") {
        const sku = BH_SKUS[parseInt(e.key) - 1];
        const p = positions[sku];
        if (p) setViewport({ x: -(p.x - 600), y: -(p.y - 160), scale: 1 });
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        zoomReset();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nodes, positions, zoomIn, zoomOut, zoomReset]);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.white,
      fontFamily: mono,
      fontFeatureSettings: INTER_FEATURES,
      // @ts-ignore — valid CSS, TS may not know
      WebkitFontSmoothing: "antialiased",
      MozOsxFontSmoothing: "grayscale",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes flow { to { stroke-dashoffset: -24; } }
        @keyframes flowSlow { to { stroke-dashoffset: -12; } }
        .link-flow { animation: flow 1.2s linear infinite; }
        .link-flow-shared { animation: flow 0.8s linear infinite; }
        .link-flow-critical { animation: flow 0.5s linear infinite; }

        @keyframes pulseRing {
          0%   { transform: scale(1);   opacity: 0.9; }
          50%  { transform: scale(1.15); opacity: 0.4; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 0.7; }
        }
        .pulse-ring { animation: pulseRing 1.8s ease-out 1; transform-origin: center; transform-box: fill-box; }
        .breathe { animation: breathe 2.6s ease-in-out infinite; }

        @keyframes flashBg {
          0%   { fill: rgba(251,191,36,0.35); }
          100% { fill: inherit; }
        }
        .flash-bg { animation: flashBg 1.4s ease-out 1; }

        input[type=range]::-webkit-slider-thumb {
          width: 20px; height: 20px; cursor: grab;
        }
      `}</style>
      <TopNav connected={connected} />

      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 2, fontWeight: 400 }}>
            ◈ BH GRUBU ONTOLOJİ {simulationActive && <span style={{ color: C.variable, marginLeft: 8 }}>SİMÜLASYON AKTİF</span>}
          </div>
          <div style={{ fontSize: 18, color: C.white, marginTop: 2 }}>Varlık Felsefesi — 4 Cihaz · Canlı Zincir</div>
          {(() => {
            const m = ontologyMeta();
            return (
              <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, color: C.dim, fontFamily: mono, letterSpacing: 0.5 }}>
                <span><span style={{ color: C.accent }}>{m.objectTypes}</span> object types</span>
                <span>·</span>
                <span><span style={{ color: C.accent }}>{m.linkTypes}</span> link types</span>
                <span>·</span>
                <span><span style={{ color: C.accent }}>{m.actionTypes}</span> action types ({m.activeActions} aktif)</span>
              </div>
            );
          })()}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Stat label="KRİTİK" value={problemCount.critical} />
          <Stat label="DÜŞÜK" value={problemCount.warning} />
          <Stat label="DARBOĞAZ" value={problemCount.bottlenecks} />
          <Stat label="PAYLAŞIMLI" value={problemCount.shared} />
          {simulationActive && (
            <button onClick={clearSimulation} style={{
              padding: "10px 18px", borderRadius: 8, cursor: "pointer", minHeight: 36,
              background: C.variableDim, border: `1px solid ${C.variableBorder}`, color: C.variable, fontSize: 13, fontFamily: mono,
            }}>Simülasyonu Kapat</button>
          )}
          {expandedSubs.size > 0 && (
            <button onClick={() => { setExpandedSubs(new Set()); localStorage.removeItem(EXPANDED_KEY); }} style={{
              padding: "10px 18px", borderRadius: 8, cursor: "pointer", minHeight: 36,
              background: C.accentDim, border: `1px solid ${C.accent}40`, color: C.accent, fontSize: 13, fontFamily: mono,
            }}>↕ Alt Parçaları Kapat ({expandedSubs.size})</button>
          )}
          <button onClick={resetLayout} style={{
            padding: "10px 18px", borderRadius: 8, cursor: "pointer", minHeight: 36,
            background: C.surface, border: `1px solid ${C.border}`, color: C.mid, fontSize: 13, fontFamily: mono,
          }}>Layout Sıfırla</button>
          <Link href="/ontology/simulate">
            <a style={{
              padding: "10px 18px", borderRadius: 8, cursor: "pointer", minHeight: 36,
              background: C.variableDim, border: `1px solid ${C.variableBorder}`, color: C.variable,
              fontSize: 13, fontFamily: mono, textDecoration: "none", letterSpacing: 0.5, fontWeight: 500,
              display: "inline-flex", alignItems: "center",
            }}>Simulation Engine →</a>
          </Link>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 24px", borderBottom: `1px solid ${C.border}`,
        background: "rgba(10,10,15,0.55)", flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: "0 0 340px" }}>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍  Ara: kod, isim, açıklama…"
            style={{
              width: "100%", background: "#ffffff",
              border: `1px solid ${searchQuery ? C.accent : C.border}`,
              borderRadius: 8, padding: "9px 12px",
              color: C.white, fontFamily: mono, fontSize: 12, outline: "none",
              transition: "border 0.15s",
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={{
              position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
              background: "transparent", border: "none", color: C.mid, cursor: "pointer",
              fontSize: 14, padding: "4px 8px", fontFamily: mono,
            }}>✕</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            { k: "critical",   label: "KRİTİK",     color: C.err },
            { k: "warning",    label: "DÜŞÜK",      color: C.warn },
            { k: "variable",   label: "DEĞİŞKEN",   color: C.variable },
            { k: "ok",         label: "YETERLİ",    color: C.blue },
            { k: "abundant",   label: "BOL",        color: C.ok },
            { k: "shared",     label: "PAYLAŞIMLI", color: C.accent },
            { k: "bottleneck", label: "DARBOĞAZ",   color: C.err },
          ] as const).map(f => {
            const active = statusFilter.has(f.k);
            return (
              <button key={f.k} onClick={() => setStatusFilter(prev => {
                const next = new Set(prev);
                if (next.has(f.k)) next.delete(f.k); else next.add(f.k);
                return next;
              })} style={{
                padding: "6px 11px", borderRadius: 16, cursor: "pointer",
                fontSize: 10, fontFamily: mono, fontWeight: 500,
                background: active ? `${f.color}22` : "#f8fafc",
                border: `1px solid ${active ? f.color : C.border}`,
                color: active ? f.color : C.mid,
                letterSpacing: 1, transition: "all 0.15s",
              }}>{f.label}</button>
            );
          })}
          {filterActive && (
            <button onClick={() => { setStatusFilter(new Set()); setSearchQuery(""); }} style={{
              padding: "6px 11px", borderRadius: 16, cursor: "pointer",
              fontSize: 10, fontFamily: mono,
              background: C.surface, border: `1px solid ${C.border}`, color: C.dim,
            }}>✕ Temizle</button>
          )}
        </div>

        {/* BH grupları dropdown */}
        <div ref={groupsMenuRef} style={{ position: "relative" }}>
          <button onClick={() => setGroupsOpen(o => !o)} style={{
            padding: "6px 12px", borderRadius: 16, cursor: "pointer",
            fontSize: 10, fontFamily: mono, fontWeight: 500, letterSpacing: 1,
            background: groupsOpen ? `${C.accent}22` : C.surface,
            border: `1px solid ${groupsOpen ? C.accent : C.border}`,
            color: groupsOpen ? C.accent : C.mid,
            transition: "all 0.15s",
          }}>◈ BH GRUPLARI {groupsOpen ? "▴" : "▾"}</button>
          {groupsOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
              minWidth: 180, background: C.panelBg,
              border: `1px solid ${C.border}`, borderRadius: 8,
              boxShadow: "0 8px 24px rgba(15,23,42,0.12)", padding: 4,
            }}>
              {BH_SKUS.map((sku, i) => (
                <button key={sku} onClick={() => { snapToSku(sku); setGroupsOpen(false); }} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  width: "100%", padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                  background: "transparent", border: "none", color: C.white,
                  fontSize: 11, fontFamily: mono, textAlign: "left",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <span>{sku}</span>
                  <kbd style={{
                    fontFamily: mono, fontSize: 9, padding: "2px 6px",
                    borderRadius: 4, border: `1px solid ${C.border}`,
                    background: C.surface, color: C.mid,
                  }}>{i + 1}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Strateji butonu — senaryo yaz */}
        <button onClick={() => setStrategyOpen(true)} style={{
          padding: "6px 12px", borderRadius: 16, cursor: "pointer",
          fontSize: 10, fontFamily: mono, fontWeight: 500, letterSpacing: 1,
          background: C.variableDim, border: `1px solid ${C.variableBorder}`,
          color: C.variable, transition: "all 0.15s",
        }}>◇ STRATEJİ</button>
      </div>

      {/* Strateji modal — senaryo yarat */}
      {strategyOpen && (
        <div onClick={() => setStrategyOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 540, maxWidth: "92vw",
            background: C.bg, border: `1px solid ${C.variableBorder}`, borderRadius: 12,
            padding: 22, fontFamily: mono,
            boxShadow: "0 20px 50px rgba(15,23,42,0.18)",
          }}>
            <div style={{ fontSize: 9, color: C.variable, letterSpacing: 2, marginBottom: 4 }}>◇ YENİ STRATEJİ</div>
            <div style={{ fontSize: 16, color: C.white, marginBottom: 4 }}>Senaryo Yaz</div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 16 }}>
              Senaryoya bir ad ver, ardından simülasyon sayfasında stok/BOM override'larını ekleyip what-if çalıştır.
            </div>
            <label style={{ fontSize: 10, color: C.mid, letterSpacing: 1 }}>SENARYO ADI</label>
            <input
              autoFocus value={strategyName}
              onChange={e => setStrategyName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitStrategy(); } }}
              placeholder="Örn: BH.50ST satışları %20 artarsa"
              style={{
                width: "100%", marginTop: 6, marginBottom: 14,
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "9px 12px", color: C.white,
                fontFamily: mono, fontSize: 13, outline: "none",
              }}
            />
            <label style={{ fontSize: 10, color: C.mid, letterSpacing: 1 }}>AÇIKLAMA / NOT</label>
            <textarea
              value={strategyDesc}
              onChange={e => setStrategyDesc(e.target.value)}
              rows={4}
              placeholder="Senaryo bağlamı (opsiyonel) — hangi bileşenlerde, hangi varsayımla, ne zaman..."
              style={{
                width: "100%", marginTop: 6, marginBottom: 16,
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "9px 12px", color: C.white,
                fontFamily: mono, fontSize: 12, outline: "none", resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setStrategyOpen(false)} style={{
                padding: "9px 16px", borderRadius: 8, cursor: "pointer",
                background: C.surface, border: `1px solid ${C.border}`, color: C.mid,
                fontFamily: mono, fontSize: 12,
              }}>Vazgeç</button>
              <button onClick={submitStrategy}
                disabled={strategyMutation.isPending || !strategyName.trim()}
                style={{
                  padding: "9px 16px", borderRadius: 8,
                  cursor: strategyMutation.isPending || !strategyName.trim() ? "not-allowed" : "pointer",
                  background: C.variableDim, border: `1px solid ${C.variableBorder}`,
                  color: C.variable, fontFamily: mono, fontSize: 12, fontWeight: 500,
                  opacity: strategyMutation.isPending || !strategyName.trim() ? 0.5 : 1,
                }}>{strategyMutation.isPending ? "Yaratılıyor..." : "Yarat → Simülasyon"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Object Inspector drawer — sağ */}
      {inspectedNode && (
        <ObjectInspector
          node={inspectedNode}
          onClose={() => setInspectedId(null)}
          onStartEdit={() => {
            if (inspectedNode.kind === "device") return;
            setEditingCode(inspectedNode.id);
            setEditVal(String(inspectedNode.currentStock ?? 0));
            setInspectedId(null);
          }}
          onStartWhatIf={() => {
            if (inspectedNode.kind === "device") return;
            const rawCode = inspectedNode.code ?? inspectedNode.id;
            setWhatifFocusCode(rawCode);
            if (whatifOverrides[rawCode] === undefined) {
              setWhatifOverrides(prev => ({ ...prev, [rawCode]: inspectedNode.currentStock ?? 0 }));
            }
          }}
          onToggleExpand={() => {
            if (inspectedNode.hasChildren) {
              const code = inspectedNode.code || inspectedNode.id;
              toggleExpanded(code);
            }
          }}
          allNodes={nodes}
          allLinks={links}
        />
      )}

      {/* Simülasyon paneli */}
      {whatifFocusCode && (() => {
        const focusNode = nodes.find(n => (n.code ?? n.id) === whatifFocusCode);
        if (!focusNode) return null;
        return (
          <WhatIfPanel
            code={whatifFocusCode}
            node={focusNode}
            overrides={whatifOverrides}
            setOverrides={setWhatifOverrides}
            simulatedCapacity={simulatedCapacity}
            nodes={nodes}
            onClose={() => setWhatifFocusCode(null)}
          />
        );
      })()}

      {/* Canvas */}
      <div style={{ width: "100%", height: "calc(100vh - 188px)", position: "relative", cursor: panStart ? "grabbing" : "grab" }}>
        {!allLoaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim }}>
            4 BH cihazının BOM + kapasite + intelligence verisi yükleniyor…
          </div>
        )}
        <svg
          ref={svgRef}
          width="100%" height="100%"
          viewBox={`${-viewport.x} ${-viewport.y} ${CANVAS_W / viewport.scale} ${CANVAS_H / viewport.scale}`}
          onPointerDown={handleBgPointerDown}
          onPointerMove={(e) => { handleBgPointerMove(e); handlePointerMove(e); }}
          onPointerUp={() => { handleBgPointerUp(); handlePointerUp(); }}
          onWheel={handleWheel}
          style={{ display: "block", userSelect: "none" }}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={C.dimmer} strokeWidth="0.4" opacity="0.6" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            {/* Palantir-style gradient fills per status (top brighter → bottom darker) */}
            {([
              ["nodeCritical", "#dc2626"],
              ["nodeWarning",  "#d97706"],
              ["nodeVariable", "#ea580c"],
              ["nodeOk",       "#2563eb"],
              ["nodeAbundant", "#059669"],
              ["nodeAccent",   "#2563eb"],
              ["nodeMid",      "#94a3b8"],
            ] as const).map(([id, col]) => (
              <linearGradient key={id} id={id} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"  stopColor={col} stopOpacity="0.14" />
                <stop offset="55%" stopColor={col} stopOpacity="0.07" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </linearGradient>
            ))}
            {/* Device header gradient — soft slate panel on white */}
            <linearGradient id="deviceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f1f5f9" stopOpacity="1" />
              <stop offset="100%" stopColor="#e2e8f0" stopOpacity="1" />
            </linearGradient>
            {/* Soft inner shadow for group backdrops */}
            <filter id="panelShadow" x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
              <feOffset dx="0" dy="2" result="offsetblur"/>
              <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
              <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            {/* Card drop-shadow — Claude.ai/Linear style soft elevation */}
            <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="125%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
              <feOffset dx="0" dy="2" result="offsetblur"/>
              <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
              <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect x={-viewport.x} y={-viewport.y} width={CANVAS_W / viewport.scale} height={CANVAS_H / viewport.scale} fill="url(#grid)" />

          {/* Palantir-style UNIT backdrops per device column (soft dark panel with border + label) */}
          {allLoaded && (() => {
            const devicesPosed = BH_SKUS
              .map(sku => ({ sku, pos: positions[sku] }))
              .filter(d => d.pos);
            if (devicesPosed.length === 0) return null;
            // Compute per-column bounds: x center per device; y extends from device top to lowest node in that column
            const COL_WIDTH = 420;
            const PADDING_X = 40;
            const TOP_PAD = 60;
            // Find max Y per column by scanning nodes with deviceSku match
            const maxYByCol: Record<string, number> = {};
            for (const n of nodes) {
              const p = positions[n.id];
              if (!p) continue;
              const sku = n.deviceSku ?? (n.kind === "device" ? n.sku : undefined);
              if (!sku) continue;
              maxYByCol[sku] = Math.max(maxYByCol[sku] ?? 0, p.y + 100);
            }
            return (
              <g style={{ pointerEvents: "none" }}>
                {devicesPosed.map(({ sku, pos }, i) => {
                  const centerX = pos!.x;
                  const topY = pos!.y - 380; // XL chart için geniş üst boşluk
                  const bottomY = (maxYByCol[sku] ?? (pos!.y + 400)) + 40;
                  const leftX = centerX - COL_WIDTH / 2;
                  const widthRect = COL_WIDTH;
                  const heightRect = bottomY - topY;
                  return (
                    <g key={sku}>
                      <rect
                        x={leftX} y={topY}
                        width={widthRect} height={heightRect}
                        rx={12}
                        fill={C.panelBg}
                        stroke="#f1f5f9"
                        strokeWidth={1}
                      />
                      {/* Unit label top-left — Palantir "Unit 1/2" pattern */}
                      <g>
                        <rect x={leftX + 14} y={topY + 10}
                          width={78} height={22} rx={4}
                          fill="#ffffff"
                          stroke="rgba(15,23,42,0.10)" strokeWidth={0.8} />
                        <text x={leftX + 53} y={topY + 25} textAnchor="middle"
                          fill={C.mid} fontSize={10} fontFamily={mono} fontWeight={600} letterSpacing={1.2}>
                          UNIT {i + 1}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Horizontal "shared" dashed lines between visual copies of same code */}
          {(() => {
            const byCode = new Map<string, GraphNode[]>();
            for (const n of nodes) {
              if (n.kind !== "component" && n.kind !== "subassembly" && n.kind !== "variable") continue;
              if (!n.code) continue;
              if (!byCode.has(n.code)) byCode.set(n.code, []);
              byCode.get(n.code)!.push(n);
            }
            const segments: React.ReactElement[] = [];
            byCode.forEach((copies, code) => {
              if (copies.length < 2) return;
              // Sort by device column order for consistent left-to-right lines
              const sorted = [...copies].sort((a, b) =>
                DEVICE_ORDER.indexOf(a.deviceSku ?? "") - DEVICE_ORDER.indexOf(b.deviceSku ?? "")
              );
              for (let k = 0; k < sorted.length - 1; k++) {
                const a = sorted[k];
                const b = sorted[k + 1];
                const pa = positions[a.id]; const pb = positions[b.id];
                if (!pa || !pb) continue;
                const isHovered = connectedSet && (connectedSet.has(a.id) || connectedSet.has(b.id));
                const op = (isHovered ? 0.75 : 0.35);
                segments.push(
                  <line key={`shared-${code}-${k}`}
                    x1={pa.x + 60} y1={pa.y}
                    x2={pb.x - 60} y2={pb.y}
                    stroke={a.kind === "variable" ? C.variable : C.accent}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={op}
                    style={{ pointerEvents: "none", transition: "opacity 0.2s" }}
                  />
                );
              }
            });
            return segments;
          })()}

          {/* Links — Palantir digital-twin style: solid thin, rounded cap, soft color */}
          {links.map((l, i) => {
            const pa = positions[l.from]; const pb = positions[l.to];
            if (!pa || !pb) return null;
            const nodeTo = nodes.find(n => n.id === l.to);
            const nodeFrom = nodes.find(n => n.id === l.from);
            const isProb = nodeTo?.status === "critical" || nodeTo?.isBottleneck;
            const stroke = isProb ? "#dc2626cc" : "rgba(15,23,42,0.28)";
            const isConnected = !connectedSet || connectedSet.has(l.from) || connectedSet.has(l.to);
            const linkInFilter = !filterActive || ((nodeFrom && matchesFilter(nodeFrom)) || (nodeTo && matchesFilter(nodeTo)));
            const opacity = (isProb ? 0.9 : 0.6) * (isConnected ? 1 : 0.2) * (linkInFilter ? 1 : 0.2);
            const midX = (pa.x + pb.x) / 2; const midY = (pa.y + pb.y) / 2;
            // Softer curve, vertical-biased (Palantir uses gentle bezier)
            const dx = Math.abs(pb.x - pa.x);
            const dy = Math.abs(pb.y - pa.y);
            const ctrlOffset = Math.min(40, dy * 0.3);
            const curve = `M ${pa.x} ${pa.y + 28} C ${pa.x} ${pa.y + 28 + ctrlOffset}, ${pb.x} ${pb.y - 28 - ctrlOffset}, ${pb.x} ${pb.y - 28}`;
            const flowClass = ""; // Palantir doesn't animate dashes
            // Cardinality hesapla: device→component ONE_MANY, ama component shared ise MANY_MANY
            const linkSpec = BH_LINK_TYPES[l.linkTypeApiName];
            let cLabel = "";
            if (l.linkTypeApiName === "consumes") cLabel = nodeTo?.isShared ? "N↔N" : "1→N";
            else if (l.linkTypeApiName === "assembles") cLabel = "1→N";
            // Label'ı sadece bağlı kanalda (hover ilişkili olduğunda) göster
            const showLabel = connectedSet && (connectedSet.has(l.from) || connectedSet.has(l.to));
            return (
              <g key={i}>
                <path d={curve} fill="none"
                  stroke={stroke}
                  strokeWidth={isProb ? 2 : 1.3}
                  strokeLinecap="round"
                  opacity={opacity}
                  style={{ pointerEvents: "none", transition: "opacity 0.2s" }}
                />
                {showLabel && cLabel && (
                  <g style={{ pointerEvents: "none" }} opacity={0.85}>
                    <rect x={midX - 18} y={midY - 9} width={36} height={16} rx={4}
                      fill="rgba(10,10,15,0.85)" stroke={stroke} strokeWidth={0.5}/>
                    <text x={midX} y={midY + 3} textAnchor="middle"
                      fill={stroke} fontSize={9} fontFamily={mono} fontWeight={500}>
                      {cLabel}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(n => {
            const p = positions[n.id];
            if (!p) return null;
            const isConnected = !connectedSet || connectedSet.has(n.id);
            const isFilterMatch = matchesFilter(n);
            const simMax = n.kind === "device" && simulationActive ? simulatedCapacity[n.id!].max : undefined;
            const simBtc = n.kind === "device" && simulationActive ? simulatedCapacity[n.id!].bottleneckCode : undefined;
            const realCode = n.code || n.id;
            const pulsing = pulseCodes.has(realCode) || pulseCodes.has(n.id);
            const isExpanded = n.hasChildren && expandedSubs.has(realCode);
            return (
              <NodeView
                key={n.id} node={n} x={p.x} y={p.y}
                dim={!isConnected || !isFilterMatch}
                pulsing={pulsing}
                expanded={!!isExpanded}
                isInspected={inspectedId === n.id}
                editing={editingCode === n.id} editVal={editVal}
                overrideStock={whatifOverrides[n.code ?? n.id]}
                simulatedMax={simMax}
                simulatedBottleneckCode={simBtc}
                simulationActive={simulationActive}
                salesBars={n.kind === "device" ? salesByDevice[n.sku!] : undefined}
                salesGlobalMax={n.kind === "device" ? salesGlobalMax : undefined}
                salesTotal={n.kind === "device" ? salesTotals[n.sku!] : undefined}
                onSalesPointEdit={n.kind === "device"
                  ? (barLabel: string, newUnits: number) => handleSalesEdit(n.sku!, barLabel, newUnits)
                  : undefined}
                salesSaving={salesMutation.isPending}
                onPointerDown={(e) => handlePointerDown(e, n.id)}
                onMouseEnter={() => {
                  setHoveredId(n.id);
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = setTimeout(() => setHoverTooltip({ id: n.id }), 400);
                }}
                onMouseLeave={() => {
                  setHoveredId(null);
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  setHoverTooltip(null);
                }}
                onToggleExpand={() => {
                  if (n.hasChildren) toggleExpanded(realCode);
                }}
                onStartInspect={(e) => handleNodeClick(n, e)}
                onStartEdit={() => {
                  if (n.kind === "device") return;
                  setEditingCode(n.id);
                  setEditVal(String(n.currentStock ?? 0));
                }}
                onStartWhatIf={() => {
                  if (n.kind === "device") return;
                  const rawCode = n.code ?? n.id;
                  setWhatifFocusCode(rawCode);
                  if (whatifOverrides[rawCode] === undefined) {
                    setWhatifOverrides(prev => ({ ...prev, [rawCode]: n.currentStock ?? 0 }));
                  }
                }}
                onEditChange={setEditVal}
                onSaveEdit={() => saveEdit(n)}
                onCancelEdit={() => setEditingCode(null)}
                saving={stockMutation.isPending}
              />
            );
          })}

          {/* Hover tooltip — 400ms delayed mini-card */}
          {hoverTooltip && (() => {
            const tn = nodes.find(nn => nn.id === hoverTooltip.id);
            const tp = positions[hoverTooltip.id];
            if (!tn || !tp) return null;
            const nw = tn.kind === "device" ? 240 : 230;
            const tx = tp.x + nw / 2 + 18;
            const ty = tp.y - 100;
            const tStatus = statusColor(tn.status, tn.isBottleneck);
            return (
              <foreignObject x={tx} y={ty} width={280} height={220} style={{ pointerEvents: "none" }}>
                <div style={{
                  background: "rgba(5,5,10,0.96)", backdropFilter: "blur(14px)",
                  border: `1px solid ${tStatus.border}`, borderRadius: 10,
                  padding: "12px 14px", fontSize: 11, color: C.white, fontFamily: mono,
                  boxShadow: "0 8px 32px rgba(15,23,42,0.12)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.white, letterSpacing: 0.3 }}>{tn.label}</div>
                    {tn.status && tn.kind !== "device" && (
                      <div style={{ fontSize: 9, color: tStatus.fg, letterSpacing: 1.2, fontWeight: 500 }}>
                        {statusLabel(tn.status)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 3, whiteSpace: "normal", lineHeight: "14px" }}>{tn.sublabel}</div>
                  {tn.kind !== "device" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10, fontSize: 10 }}>
                      <div>
                        <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1 }}>STOK</div>
                        <div style={{ color: tStatus.fg, fontWeight: 600, marginTop: 1 }}>
                          {fmt(tn.currentStock ?? 0)} <span style={{ color: C.dim, fontWeight: 400 }}>{tn.unit ?? "AD"}</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1 }}>BURN</div>
                        <div style={{ color: C.white, fontWeight: 500, marginTop: 1 }}>
                          {tn.dailyBurnRate && tn.dailyBurnRate > 0 ? `${tn.dailyBurnRate.toFixed(1)}/gün` : "durağan"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1 }}>TÜKENME</div>
                        <div style={{ color: tn.daysLeft && tn.daysLeft < 30 ? C.err : tn.daysLeft && tn.daysLeft < 90 ? C.warn : C.white, fontWeight: 500, marginTop: 1 }}>
                          {tn.daysLeft != null ? (tn.daysLeft > 365 ? "> 1yıl" : `${Math.round(tn.daysLeft)}g`) : "—"}
                          {tn.depletionMonth ? ` · ${tn.depletionMonth}` : ""}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1 }}>TREND</div>
                        <div style={{ color: C.white, fontWeight: 500, marginTop: 1 }}>{tn.trend ?? "—"}</div>
                      </div>
                    </div>
                  )}
                  {tn.kind === "device" && tn.maxProducible !== undefined && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1 }}>MAKS ÜRETİM</div>
                      <div style={{ color: C.accent, fontWeight: 600, fontSize: 16, marginTop: 1 }}>{fmt(tn.maxProducible)} adet</div>
                    </div>
                  )}
                  {tn.usedBy.length > 0 && tn.kind !== "device" && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
                      <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1 }}>KULLANIM</div>
                      <div style={{ marginTop: 4, fontSize: 10, color: tn.isShared ? C.accent : C.mid, fontWeight: 500 }}>
                        {tn.usedBy.map(s => s.replace("BH.", "").replace(".SV", "")).join("  ·  ")}
                        {tn.isShared && <span style={{ marginLeft: 6, color: C.accent, fontSize: 9 }}>⇄ PAYLAŞIMLI</span>}
                      </div>
                    </div>
                  )}
                  {tn.isBottleneck && (
                    <div style={{ marginTop: 8, fontSize: 10, color: C.err, letterSpacing: 0.5 }}>▲ DARBOĞAZ — kapasiteyi bu parça sınırlıyor</div>
                  )}
                  <div style={{ marginTop: 10, fontSize: 9, color: C.dim, letterSpacing: 0.5 }}>Tıkla → detay inceleyici</div>
                </div>
              </foreignObject>
            );
          })()}
        </svg>

        {/* Legend panel — sol alt */}
        <div style={{
          position: "absolute", left: 16, bottom: 16, zIndex: 5,
          background: "rgba(5,5,10,0.88)", backdropFilter: "blur(12px)",
          border: `1px solid ${C.border}`, borderRadius: 10,
          padding: legendOpen ? "12px 14px" : "8px 12px",
          fontSize: 10, color: C.mid, fontFamily: mono,
          minWidth: legendOpen ? 220 : 80, transition: "all 0.2s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            onClick={() => setLegendOpen(o => !o)}>
            <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1.8, fontWeight: 500 }}>◎ AÇIKLAMA</div>
            <div style={{ fontSize: 11, color: C.dim }}>{legendOpen ? "−" : "+"}</div>
          </div>
          {legendOpen && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1 }}>DURUM</div>
              {([
                { c: C.err,      l: "KRİTİK — stok <15g" },
                { c: C.warn,     l: "DÜŞÜK — 15-60g" },
                { c: C.variable, l: "DEĞİŞKEN — opsiyonel" },
                { c: C.blue,     l: "YETERLİ — 60-180g" },
                { c: C.ok,       l: "BOL — >180g" },
              ] as const).map(x => (
                <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: x.c, display: "inline-block" }} />
                  <span style={{ color: C.white, fontSize: 10 }}>{x.l}</span>
                </div>
              ))}
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginTop: 6 }}>ŞEKİL</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.accent, fontSize: 14 }}>▭</span><span style={{ color: C.white, fontSize: 10 }}>Cihaz (BH)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.blue, fontSize: 14 }}>◻</span><span style={{ color: C.white, fontSize: 10 }}>Bileşen (kare)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.warn, fontSize: 14 }}>◯</span><span style={{ color: C.white, fontSize: 10 }}>Yarı mamül (daire)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.purple, fontSize: 14 }}>◦</span><span style={{ color: C.white, fontSize: 10 }}>Alt parça (küçük)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.variable, fontSize: 14 }}>▲</span><span style={{ color: C.white, fontSize: 10 }}>Değişken (üçgen)</span></div>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginTop: 6 }}>İŞARETLER</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.err, fontSize: 12 }}>▲</span><span style={{ color: C.white, fontSize: 10 }}>Darboğaz halosu</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.accent, fontSize: 10 }}>⇄</span><span style={{ color: C.white, fontSize: 10 }}>Paylaşımlı (çift çerçeve)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.variable, fontSize: 10 }}>●</span><span style={{ color: C.white, fontSize: 10 }}>What-if override</span></div>
            </div>
          )}
        </div>

        {/* Zoom toolbar — sağ alt, minimap üstü */}
        <div style={{
          position: "absolute", right: 16, bottom: 190, zIndex: 6,
          display: "flex", flexDirection: "column", gap: 4,
          background: "rgba(5,5,10,0.9)", backdropFilter: "blur(12px)",
          border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 5,
        }}>
          <button onClick={zoomIn} title="Yakınlaştır (+)" style={{
            width: 32, height: 28, borderRadius: 5, cursor: "pointer",
            background: C.surface, border: `1px solid ${C.border}`, color: C.white,
            fontSize: 16, fontFamily: mono, fontWeight: 600, padding: 0,
          }}>+</button>
          <button onClick={zoomReset} title="Sıfırla (0)" style={{
            width: 32, height: 22, borderRadius: 5, cursor: "pointer",
            background: C.accentDim, border: `1px solid ${C.accent}40`, color: C.accent,
            fontSize: 10, fontFamily: mono, fontWeight: 600, padding: 0, letterSpacing: 0.5,
          }}>{Math.round(viewport.scale * 100)}%</button>
          <button onClick={zoomOut} title="Uzaklaştır (-)" style={{
            width: 32, height: 28, borderRadius: 5, cursor: "pointer",
            background: C.surface, border: `1px solid ${C.border}`, color: C.white,
            fontSize: 16, fontFamily: mono, fontWeight: 600, padding: 0,
          }}>−</button>
        </div>

        {/* Minimap — sağ alt */}
        {allLoaded && (
          <Minimap
            nodes={nodes}
            positions={positions}
            viewport={viewport}
            setViewport={setViewport}
          />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Minimap — overview of all nodes, click-to-jump
   ═══════════════════════════════════════════════════════════ */
function Minimap({
  nodes, positions, viewport, setViewport,
}: {
  nodes: GraphNode[];
  positions: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number; scale: number };
  setViewport: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>;
}) {
  const W = 200, H = 140;
  const sx = W / CANVAS_W, sy = H / CANVAS_H;
  const s = Math.min(sx, sy);
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const worldX = px / s;
    const worldY = py / s;
    setViewport(v => ({
      ...v,
      x: (CANVAS_W / v.scale) / 2 - worldX,
      y: (CANVAS_H / v.scale) / 2 - worldY,
    }));
  };
  // viewport rect in world coords → minimap coords
  const vpW = CANVAS_W / viewport.scale;
  const vpH = CANVAS_H / viewport.scale;
  return (
    <div style={{
      position: "absolute", right: 16, bottom: 16, zIndex: 5,
      background: "rgba(5,5,10,0.9)", backdropFilter: "blur(12px)",
      border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "10px 12px 8px", fontFamily: mono,
    }}>
      <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1.8, fontWeight: 500, marginBottom: 6 }}>◈ MİNİMAP</div>
      <svg width={W} height={H} onClick={handleClick} style={{ cursor: "crosshair", display: "block", background: "#f8fafc", borderRadius: 4, border: "1px solid rgba(15,23,42,0.10)" }}>
        {nodes.map(n => {
          const p = positions[n.id];
          if (!p) return null;
          const col = n.kind === "device" ? C.accent
            : n.isBottleneck ? C.err
            : n.status === "critical" ? C.err
            : n.status === "warning" ? C.warn
            : n.status === "variable" ? C.variable
            : n.status === "ok" ? C.blue
            : n.status === "abundant" ? C.ok
            : C.mid;
          const r = n.kind === "device" ? 2.5 : 1.5;
          return <circle key={n.id} cx={p.x * s} cy={p.y * s} r={r} fill={col} opacity={0.85} />;
        })}
        <rect
          x={-viewport.x * s}
          y={-viewport.y * s}
          width={vpW * s}
          height={vpH * s}
          fill="none"
          stroke={C.accent}
          strokeWidth={1.2}
          opacity={0.7}
        />
      </svg>
      <div style={{ fontSize: 8, color: C.dim, marginTop: 4, letterSpacing: 0.5 }}>tıkla → konumlan</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   What-If Panel (sol üstte drawer)
   ═══════════════════════════════════════════════════════════ */
function WhatIfPanel({
  code, node, overrides, setOverrides, simulatedCapacity, nodes, onClose
}: {
  code: string; node: GraphNode;
  overrides: Record<string, number>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  simulatedCapacity: Record<string, { max: number; bottleneckCode: string | null }>;
  nodes: GraphNode[];
  onClose: () => void;
}) {
  const original = node.currentStock ?? 0;
  const current = overrides[code] ?? original;
  const maxSlider = Math.max(original * 5, 1000);

  return (
    <div style={{
      position: "absolute", top: 140, left: 20, zIndex: 10,
      width: 440, padding: "20px 22px", borderRadius: 14,
      background: "rgba(10,10,15,0.95)", backdropFilter: "blur(16px)",
      border: `1px solid ${C.variableBorder}`,
      boxShadow: "0 8px 32px rgba(15,23,42,0.14)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.variable, letterSpacing: 1.8, fontWeight: 500 }}>WHAT-IF SİMÜLASYON</div>
          <div style={{ fontSize: 18, color: C.white, marginTop: 4, fontFamily: mono }}>{code}</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{node.sublabel}</div>
        </div>
        <button onClick={onClose} style={{
          background: C.surface, border: `1px solid ${C.border}`, color: C.mid,
          cursor: "pointer", fontSize: 18, width: 36, height: 36, borderRadius: 8,
        }}>✕</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.dim, margin: "14px 0 8px" }}>
        <span>Gerçek stok: <span style={{ color: C.white, fontFamily: mono }}>{fmt(original)}</span></span>
        <span style={{ color: C.variable }}>Simüle: <span style={{ fontFamily: mono, fontWeight: 500 }}>{fmt(current)}</span></span>
      </div>
      <input type="range" min={0} max={maxSlider} value={current}
        onChange={e => setOverrides(prev => ({ ...prev, [code]: parseInt(e.target.value) }))}
        style={{ width: "100%", accentColor: C.variable, height: 8, cursor: "grab" }}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input type="number" value={current} onChange={e => setOverrides(prev => ({ ...prev, [code]: parseFloat(e.target.value) || 0 }))}
          style={{ flex: 1, fontSize: 16, fontFamily: mono, color: C.variable, background: "#ffffff",
            border: `1px solid ${C.variableBorder}`, borderRadius: 6, padding: "8px 12px", outline: "none", minHeight: 40 }}
        />
        <button onClick={() => setOverrides(prev => {
          const next = { ...prev }; delete next[code]; return next;
        })} style={{ padding: "8px 16px", fontSize: 13, borderRadius: 6, cursor: "pointer", minHeight: 40,
          background: C.surface, border: `1px solid ${C.border}`, color: C.mid, fontFamily: mono,
        }}>Sıfırla</button>
      </div>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px dashed ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.8, marginBottom: 10, fontWeight: 500 }}>4 CİHAZ ETKİSİ</div>
        {(["BH.50ST.SV","BH.50UT.SV","BH.55ST.SV","BH.55UT.SV"] as const).map(sku => {
          const dev = nodes.find(n => n.id === sku);
          if (!dev) return null;
          const realMax = dev.maxProducible ?? 0;
          const simMax = simulatedCapacity[sku].max;
          const delta = simMax - realMax;
          const dColor = delta > 0 ? C.ok : delta < 0 ? C.err : C.mid;
          const dSign = delta > 0 ? "+" : "";
          return (
            <div key={sku} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0" }}>
              <span style={{ color: C.white, fontFamily: mono }}>{sku.replace("BH.", "").replace(".SV","")}</span>
              <span style={{ fontFamily: mono, color: C.dim }}>
                {fmt(realMax)} → <span style={{ color: C.variable, fontWeight: 500, fontSize: 14 }}>{fmt(simMax)}</span>
                <span style={{ color: dColor, marginLeft: 8, fontWeight: 500 }}>({dSign}{delta})</span>
              </span>
            </div>
          );
        })}
        {node.isBottleneck && <div style={{ fontSize: 11, color: C.err, marginTop: 8 }}>▲ Bu atom şu an en az 1 BH'de darboğaz</div>}
      </div>

      <div style={{ fontSize: 11, color: C.dim, marginTop: 14, fontStyle: "italic" }}>
        Dry-run: DB'ye yazılmaz · Kapat ile simülasyon temizlenir
      </div>
    </div>
  );
}

/* ── Stat pill ── */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center", minWidth: 60 }}>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.2, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, color: C.white, fontFamily: mono, fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Node View — 5 shapes (rect, square, circle, small-circle, triangle)
   ═══════════════════════════════════════════════════════════ */
function NodeView({
  node, x, y, dim, pulsing, expanded, isInspected,
  editing, editVal,
  overrideStock, simulatedMax, simulatedBottleneckCode, simulationActive,
  salesBars, salesGlobalMax, salesTotal, onSalesPointEdit, salesSaving,
  onPointerDown, onMouseEnter, onMouseLeave,
  onToggleExpand, onStartInspect, onStartEdit, onStartWhatIf,
  onEditChange, onSaveEdit, onCancelEdit, saving,
}: {
  node: GraphNode; x: number; y: number;
  dim: boolean;
  pulsing: boolean;
  expanded: boolean;
  isInspected: boolean;
  editing: boolean; editVal: string;
  overrideStock?: number;
  simulatedMax?: number;
  simulatedBottleneckCode?: string | null;
  simulationActive: boolean;
  salesBars?: Array<{ label: string; units: number }>;
  salesGlobalMax?: number;
  salesTotal?: number;
  onSalesPointEdit?: (barLabel: string, newUnits: number) => void;
  salesSaving?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleExpand: () => void;
  onStartInspect: (e?: React.MouseEvent) => void;
  onStartEdit: () => void;
  onStartWhatIf: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  saving: boolean;
}) {
  const isDevice = node.kind === "device";
  const isSub = node.kind === "subassembly";
  const isSubComp = node.kind === "subcomponent";
  const isVariable = node.kind === "variable";
  const isComponent = node.kind === "component";

  /* Çoklu seçim rozeti */
  const { indexOf: selIndexOf } = useSelection();
  const selIdx = selIndexOf(node.code || node.id);
  const isSelected = selIdx >= 0;

  /* Bar drag state (device mini-chart interaction) */
  const [barDrag, setBarDrag] = useState<{ idx: number; startClientY: number; startUnits: number; currentUnits: number } | null>(null);

  // Shape sizes — Foundry "tile" pattern: yatay dikdörtgen + üst bant
  let w: number, h: number;
  if (isDevice)         { w = 240; h = 96; }
  else if (isSub)       { w = 220; h = 88; }   // yarı-mamül tile
  else if (isSubComp)   { w = 180; h = 64; }   // alt parça tile (daha kısa)
  else if (isVariable)  { w = 220; h = 88; }   // variable tile
  else                  { w = 240; h = 96; }   // component tile

  const displayStock = overrideStock !== undefined ? overrideStock : (node.currentStock ?? 0);
  const isOverridden = overrideStock !== undefined && overrideStock !== node.currentStock;

  const col = statusColor(node.status, node.isBottleneck);
  const vel = velocityIcon(node.dailyBurnRate, node.trend);
  const objType = objectTypeForKind(node.kind as any);

  const deviceDelta = (isDevice && simulatedMax !== undefined && node.maxProducible !== undefined)
    ? simulatedMax - node.maxProducible : 0;
  const deviceDeltaColor = deviceDelta > 0 ? C.ok : deviceDelta < 0 ? C.err : C.mid;

  return (
    <g transform={`translate(${x - w/2}, ${y - h/2})`}
       style={{ cursor: "grab", opacity: dim ? 0.22 : 1, transition: "opacity 0.25s" }}
       onMouseEnter={onMouseEnter}
       onMouseLeave={onMouseLeave}
       onClick={(e) => {
         if (e.metaKey || e.shiftKey || e.ctrlKey) {
           e.stopPropagation();
           onStartInspect(e);
         }
       }}
    >
      {/* Pulse ring — WS güncellemesi geldiğinde bir kere çalar */}
      {pulsing && (
        <rect className="pulse-ring" x={-8} y={-8} width={w+16} height={h+16} rx={16}
          fill="none" stroke={C.warn} strokeWidth={3} filter="url(#glow)"/>
      )}

      {/* Bottleneck halo */}
      {node.isBottleneck && (
        <rect className="breathe" x={-6} y={-6} width={w+12} height={h+12} rx={14}
          fill="none" stroke={C.err} strokeWidth={2} filter="url(#glow)"/>
      )}
      {/* Shared çift çerçeve */}
      {node.isShared && !isDevice && (
        <rect x={-3} y={-3} width={w+6} height={h+6} rx={10}
          fill="none" stroke={C.accent} strokeWidth={1} opacity={0.5} strokeDasharray="4 2"/>
      )}
      {/* Override indicator */}
      {isOverridden && (
        <rect x={-4} y={-4} width={w+8} height={h+8} rx={11}
          fill="none" stroke={C.variable} strokeWidth={1.5} strokeDasharray="2 2" opacity={0.9}/>
      )}
      {/* Çoklu seçim halo + numara rozeti */}
      {isSelected && (
        <g>
          <rect x={-6} y={-6} width={w+12} height={h+12} rx={13}
            fill="none" stroke={C.accent} strokeWidth={2.5} strokeDasharray="8 4" opacity={0.95}/>
          <circle cx={-2} cy={-2} r={13} fill={C.accent} stroke="#0a0a0f" strokeWidth={2}/>
          <text x={-2} y={2} textAnchor="middle" fill="#0a0a0f"
            fontSize={13} fontFamily={mono} fontWeight={700}>
            {selIdx + 1}
          </text>
        </g>
      )}
      {/* Inspected — kalın yeşil çerçeve */}
      {isInspected && (
        <rect x={-5} y={-5} width={w+10} height={h+10} rx={12}
          fill="none" stroke={C.ok} strokeWidth={2.5} opacity={0.95}/>
      )}

      {/* Main tile — Foundry Process Mining pattern: white card + saturated top band */}
      <rect className={pulsing ? "flash-bg" : undefined}
        width={w} height={h} rx={6}
        fill={isDevice ? "url(#deviceGrad)" : "#ffffff"}
        stroke={isDevice ? C.accent : "rgba(15,23,42,0.12)"}
        strokeWidth={1}
        filter={!isDevice ? "url(#cardShadow)" : undefined}
        onPointerDown={onPointerDown}
      />
      {/* Saturated status band — top, full width */}
      {!isDevice && (
        <rect width={w} height={isSubComp ? 5 : 7} rx={3}
          fill={col.fg}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Sales chart above device — XL size (default zoom'da okunabilir) */}
      {isDevice && salesBars && salesBars.length > 0 && (() => {
        const barCount = salesBars.length;
        const CHART_EXTRA = 160;                         // her iki yana 80px taşar
        const chartW = w + CHART_EXTRA;                  // 240 + 160 = 400
        const chartH = 260;                              // 170 → 260 (+53%)
        const chartXOffset = -CHART_EXTRA / 2;
        const chartYBase = -50;
        const chartYTop = chartYBase - chartH;
        const normMax = Math.max(1, salesGlobalMax ?? 0);
        const localMax = Math.max(0, ...salesBars.map(s => s.units));
        const gap = 4;
        const barW = (chartW - (barCount - 1) * gap) / barCount;  // ~30px bar (çok daha kolay tıkla)
        const total = salesTotal ?? 0;
        const pxPerUnit = chartH / normMax;
        const unitsPerPx = normMax / chartH;

        const handleBarDown = (e: React.PointerEvent, idx: number, units: number) => {
          if (!onSalesPointEdit) return;
          e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          setBarDrag({ idx, startClientY: e.clientY, startUnits: units, currentUnits: units });
        };
        const handleBarMove = (e: React.PointerEvent) => {
          if (!barDrag) return;
          const deltaY = barDrag.startClientY - e.clientY; // up = +
          const newUnits = Math.max(0, Math.round(barDrag.startUnits + deltaY * unitsPerPx));
          if (newUnits !== barDrag.currentUnits) {
            setBarDrag({ ...barDrag, currentUnits: newUnits });
          }
        };
        const handleBarUp = (e: React.PointerEvent, bar: { label: string; units: number }) => {
          if (!barDrag || !onSalesPointEdit) { setBarDrag(null); return; }
          const deltaPx = Math.abs(e.clientY - barDrag.startClientY);
          const { currentUnits, startUnits } = barDrag;
          if (deltaPx < 4) {
            // Treated as click → prompt for value
            const v = window.prompt(`${bar.label} satış (${fmt(bar.units)} → yeni değer):`, String(bar.units));
            setBarDrag(null);
            if (v !== null) {
              const n = parseInt(v.trim());
              if (!isNaN(n) && n >= 0 && n !== bar.units) {
                onSalesPointEdit(bar.label, n);
              }
            }
          } else if (currentUnits !== startUnits) {
            // Drag commit
            setBarDrag(null);
            onSalesPointEdit(bar.label, currentUnits);
          } else {
            setBarDrag(null);
          }
        };

        return (
          <g transform={`translate(${chartXOffset}, 0)`}>
            {/* Chart frame — subtle background */}
            <rect x={-4} y={chartYBase - chartH - 4} width={chartW + 8} height={chartH + 8} rx={4}
              fill="#f8fafc" stroke="#f1f5f9" strokeWidth={0.5}
              style={{ pointerEvents: "none" }} />
            <line x1={0} y1={chartYBase} x2={chartW} y2={chartYBase}
              stroke={C.dim} strokeWidth={0.6} strokeDasharray="2 3"
              style={{ pointerEvents: "none" }} />
            {/* Y-axis gridlines at 25/50/75% */}
            {[0.25, 0.5, 0.75].map((p, idx) => (
              <line key={idx}
                x1={0} x2={chartW}
                y1={chartYBase - chartH * p} y2={chartYBase - chartH * p}
                stroke={C.dim} strokeWidth={0.3} strokeDasharray="1 4" opacity={0.5}
                style={{ pointerEvents: "none" }} />
            ))}
            {salesBars.map((s, i) => {
              const effectiveUnits = barDrag?.idx === i ? barDrag.currentUnits : s.units;
              const hBar = effectiveUnits > 0 ? Math.max(2, effectiveUnits * pxPerUnit) : 0;
              const isPeak = effectiveUnits === localMax && localMax > 0 && !barDrag;
              const isDragging = barDrag?.idx === i;
              const barX = i * (barW + gap);
              return (
                <g key={i}>
                  {/* Hit area — full chart height, easier to click */}
                  <rect
                    x={barX} y={chartYBase - chartH}
                    width={barW} height={chartH + 14}
                    fill="transparent"
                    style={{ cursor: onSalesPointEdit ? (isDragging ? "grabbing" : "grab") : "default", touchAction: "none" }}
                    onPointerDown={(e) => handleBarDown(e, i, s.units)}
                    onPointerMove={handleBarMove}
                    onPointerUp={(e) => handleBarUp(e, s)}
                  />
                  {/* Visible bar */}
                  <rect
                    x={barX}
                    y={chartYBase - hBar}
                    width={barW}
                    height={hBar}
                    fill={isDragging ? C.variable : isPeak ? C.warn : C.accent}
                    opacity={isDragging ? 1 : salesSaving ? 0.5 : 0.9}
                    rx={2}
                    style={{ pointerEvents: "none", transition: isDragging ? "none" : "height 0.15s" }}
                  />
                  {/* Month label at bottom — daha büyük */}
                  <text x={barX + barW / 2} y={chartYBase + 16}
                    textAnchor="middle" fill={C.mid} fontSize={12} fontFamily={mono} fontWeight={500}
                    style={{ pointerEvents: "none" }}>
                    {s.label}
                  </text>
                  {/* Value label — her bar üzerinde görünsün (sadece değer varsa) */}
                  {effectiveUnits > 0 && !isDragging && (
                    <text x={barX + barW / 2} y={chartYBase - hBar - 6}
                      textAnchor="middle"
                      fill={isPeak ? C.warn : C.white}
                      fontSize={isPeak ? 14 : 11}
                      fontFamily={mono} fontWeight={isPeak ? 700 : 500}
                      style={{ pointerEvents: "none" }}>
                      {effectiveUnits}
                    </text>
                  )}
                  {/* Drag preview */}
                  {isDragging && (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={barX - 20} y={chartYBase - hBar - 30}
                        width={barW + 40} height={22} rx={4}
                        fill="rgba(10,10,15,0.97)" stroke={C.variable} strokeWidth={1.2} />
                      <text x={barX + barW / 2} y={chartYBase - hBar - 14}
                        textAnchor="middle" fill={C.variable} fontSize={14} fontFamily={mono} fontWeight={700}>
                        {fmt(barDrag!.currentUnits)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            <text x={0} y={chartYTop - 8} fill={C.dim}
              fontSize={13} fontFamily={mono} letterSpacing={1} fontWeight={500}
              style={{ pointerEvents: "none" }}>
              SATIŞ · {barCount} AY · TOPLAM <tspan fill={C.white} fontWeight={700}>{fmt(total)}</tspan> ADET
              {onSalesPointEdit && <tspan fill={C.dim}>  ·  sürükle / tıkla = edit</tspan>}
            </text>
            <text x={chartW} y={chartYTop - 8} fill={C.mid} textAnchor="end"
              fontSize={13} fontFamily={mono} fontWeight={500}
              style={{ pointerEvents: "none" }}>
              {salesSaving ? "kaydediliyor…" : total === 0 ? "veri yok" : `tepe ${fmt(localMax)}`}
            </text>
          </g>
        );
      })()}

      {isDevice ? (
        <>
          {/* Device inspector ℹ top-left */}
          <g onClick={(e) => { e.stopPropagation(); onStartInspect(e); }} style={{ cursor: "pointer" }}>
            <rect x={8} y={8} width={30} height={22} rx={5}
              fill={isInspected ? C.okDim : C.accentDim} stroke={isInspected ? C.okBorder : C.accent + "40"} strokeWidth={1}/>
            <text x={23} y={23} textAnchor="middle" fill={objType.displayMetadata.color} fontSize={14} fontFamily={mono} fontWeight={500}>
              {objType.displayMetadata.icon}
            </text>
          </g>
          <text x={w/2} y={28} textAnchor="middle" fill={C.white} fontSize={18} fontFamily={mono} fontWeight={600} letterSpacing={0.5}>
            {node.label}
          </text>
          <text x={w/2} y={50} textAnchor="middle" fill={C.accent} fontSize={12} fontFamily={mono} fontWeight={500}>
            {node.sublabel}
          </text>
          {simulationActive && simulatedMax !== undefined && (
            <>
              <line x1={22} y1={60} x2={w-22} y2={60} stroke={C.variableBorder} strokeDasharray="3 2" opacity={0.6} />
              <text x={w/2} y={80} textAnchor="middle" fill={C.variable} fontSize={13} fontFamily={mono} fontWeight={500}>
                sim: {fmt(simulatedMax)} <tspan fill={deviceDeltaColor}>
                  ({deviceDelta >= 0 ? "+" : ""}{deviceDelta})
                </tspan>
              </text>
            </>
          )}
        </>
      ) : (
        /* Unified Foundry-tile content — landscape rect for component / subassembly / subcomponent / variable */
        <>
          {/* Inspector ⓘ (top-left, overlaps band) — not for subcomp (too small) */}
          {!isSubComp && (
            <g onClick={(e) => { e.stopPropagation(); onStartInspect(e); }} style={{ cursor: "pointer" }}>
              <rect x={8} y={14} width={22} height={18} rx={4}
                fill={isInspected ? C.okDim : "#ffffff"}
                stroke={isInspected ? C.okBorder : "rgba(15,23,42,0.18)"} strokeWidth={0.8}/>
              <text x={19} y={27} textAnchor="middle"
                fill={isInspected ? C.ok : objType.displayMetadata.color} fontSize={11} fontFamily={mono} fontWeight={500}>
                ⓘ
              </text>
            </g>
          )}
          {/* What-if (top-right) — only component */}
          {isComponent && (
            <g onClick={(e) => { e.stopPropagation(); onStartWhatIf(); }} style={{ cursor: "pointer" }}>
              <rect x={w - 30} y={14} width={22} height={18} rx={4}
                fill={C.variableDim} stroke={C.variableBorder} strokeWidth={0.8}/>
              <text x={w - 19} y={27} textAnchor="middle" fill={C.variable} fontSize={9} fontFamily={mono} fontWeight={600}>W?</text>
            </g>
          )}
          {/* Variable marker — small ▲ near code */}
          {isVariable && (
            <text x={12} y={28} fill={C.variable} fontSize={11} fontFamily={mono} fontWeight={700}>▲</text>
          )}

          {/* Code (top-left, after icons) */}
          <text x={isSubComp ? 12 : (isVariable ? 28 : 36)} y={isSubComp ? 22 : 28}
            fill={C.white} fontSize={isSubComp ? 11 : 13} fontFamily={mono} fontWeight={600} letterSpacing={0.3}
            onPointerDown={onPointerDown}>
            {node.label}
          </text>

          {/* Status label (top-right, small caps) — not for subcomp + skip when W? button covers */}
          {!isSubComp && !isComponent && (
            <text x={w - 12} y={28} textAnchor="end"
              fill={col.fg} fontSize={9} fontFamily={mono} fontWeight={700} letterSpacing={1}>
              {statusLabel(node.status)}
            </text>
          )}

          {/* Bottleneck pill (component only, sublabel row right) */}
          {isComponent && node.isBottleneck && (
            <text x={w - 12} y={44} textAnchor="end" fill={C.err} fontSize={9} fontFamily={mono} fontWeight={700} letterSpacing={0.8}>
              ▲ DARBOĞAZ
            </text>
          )}

          {/* Sublabel — single-line truncate */}
          {!isSubComp && (
            <foreignObject x={12} y={36} width={isComponent && node.isBottleneck ? w - 96 : w - 24} height={14}>
              <div style={{ fontSize: 10, color: C.dim, fontFamily: mono, lineHeight: "13px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.sublabel}
              </div>
            </foreignObject>
          )}

          {/* Stock + days row */}
          {editing ? (
            <foreignObject x={12} y={isSubComp ? 30 : 56} width={w - 24} height={isSubComp ? 28 : 32}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}
                onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                <input autoFocus type="number" value={editVal}
                  onChange={e => onEditChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); else if (e.key === "Escape") onCancelEdit(); }}
                  disabled={saving}
                  style={{ flex: 1, fontSize: isSubComp ? 12 : 14, fontFamily: mono, color: col.fg,
                    background: "#ffffff", border: `1px solid ${col.fg}70`, borderRadius: 4,
                    padding: "3px 8px", outline: "none" }}
                />
                <button onClick={e => { e.stopPropagation(); onSaveEdit(); }} disabled={saving} style={{
                  fontSize: 12, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                  background: C.okDim, border: `1px solid ${C.okBorder}`, color: C.ok, fontFamily: mono,
                }}>✓</button>
                <button onClick={e => { e.stopPropagation(); onCancelEdit(); }} style={{
                  fontSize: 12, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                  background: "#f1f5f9", border: `1px solid ${C.border}`, color: C.mid, fontFamily: mono,
                }}>✕</button>
              </div>
            </foreignObject>
          ) : (
            <g onClick={isSubComp ? undefined : onStartEdit} style={{ cursor: isSubComp ? "default" : "pointer" }}>
              <text x={12} y={isSubComp ? 48 : 78}
                fill={isOverridden ? C.variable : col.fg}
                fontSize={isSubComp ? 18 : 22} fontFamily={mono} fontWeight={700} letterSpacing={-0.3}>
                {fmt(displayStock)}
              </text>
              <text x={12 + String(fmt(displayStock)).length * (isSubComp ? 11 : 13) + 6} y={isSubComp ? 48 : 78}
                fill={C.dim} fontSize={isSubComp ? 9 : 11} fontFamily={mono}>
                {node.unit || "AD"}{!isSubComp && " ✎"}
              </text>
              {!isSubComp && node.daysLeft !== null && node.daysLeft !== undefined && (
                <text x={w - 12} y={78} textAnchor="end"
                  fill={node.daysLeft < 30 ? C.err : node.daysLeft < 90 ? C.warn : C.mid}
                  fontSize={11} fontFamily={mono} fontWeight={600}>
                  {node.daysLeft > 365 ? "> 1yıl" : `${Math.round(node.daysLeft)}g`}
                  {node.depletionMonth ? ` · ${node.depletionMonth}` : ""}
                </text>
              )}
              {/* Subcomponent: status label sağda */}
              {isSubComp && (
                <text x={w - 12} y={48} textAnchor="end"
                  fill={col.fg} fontSize={8} fontFamily={mono} fontWeight={700} letterSpacing={0.8}>
                  {statusLabel(node.status)}
                </text>
              )}
            </g>
          )}

          {/* Burn rate (component only — sublabel row right) */}
          {isComponent && !editing && !node.isBottleneck && (
            <text x={w - 12} y={44} textAnchor="end" fill={vel.color} fontSize={9} fontFamily={mono} fontWeight={500}>
              {vel.icon} {node.dailyBurnRate && node.dailyBurnRate > 0 ? `${node.dailyBurnRate.toFixed(1)}/g` : "durağan"}
            </text>
          )}

          {/* Expand (+N) button — bottom-right (sub + component with children) */}
          {(isSub || isComponent) && node.hasChildren && (
            <g onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
               onPointerDown={(e) => e.stopPropagation()}
               style={{ cursor: "pointer" }}>
              <rect x={w - 32} y={h - 22} width={26} height={18} rx={4}
                fill={expanded ? C.accentDim : "#ffffff"}
                stroke={expanded ? C.accent : "rgba(15,23,42,0.18)"} strokeWidth={0.8}/>
              <text x={w - 19} y={h - 9} textAnchor="middle"
                fill={expanded ? C.accent : C.mid} fontSize={10} fontFamily={mono} fontWeight={600}>
                {expanded ? "−" : `+${node.childrenCount ?? ""}`}
              </text>
            </g>
          )}

          {/* usedBy badges — only component, below tile */}
          {isComponent && node.usedBy.length > 0 && (
            <foreignObject x={0} y={h + 2} width={w} height={16}>
              <div style={{ display: "flex", gap: 3, paddingLeft: 12, flexWrap: "wrap" }}>
                {node.usedBy.map(sku => {
                  const abbr = sku.replace("BH.", "").replace(".SV", "");
                  return (
                    <span key={sku} style={{
                      fontSize: 8, fontFamily: mono, padding: "1px 5px", borderRadius: 3,
                      background: node.isShared ? C.accentDim : "#f1f5f9",
                      color: node.isShared ? C.accent : C.dim,
                      border: `1px solid ${node.isShared ? C.accent + "40" : C.border}`,
                    }}>{abbr}</span>
                  );
                })}
              </div>
            </foreignObject>
          )}
        </>
      )}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════
   Object Inspector — Palantir Object Explorer tarzı sağ drawer
   Full property sheet + link list + action menu
   ═══════════════════════════════════════════════════════════ */
function ObjectInspector({
  node, onClose, onStartEdit, onStartWhatIf, onToggleExpand, allNodes, allLinks,
}: {
  node: GraphNode;
  onClose: () => void;
  onStartEdit: () => void;
  onStartWhatIf: () => void;
  onToggleExpand: () => void;
  allNodes: GraphNode[];
  allLinks: GraphLink[];
}) {
  // Action form modal state
  const [activeActionForm, setActiveActionForm] = useState<ActionTypeSpec | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);
  const objType = objectTypeForKind(node.kind as any);
  const actions = actionsForObjectType(objType.apiName);
  const linkSpecs = linksForObjectType(objType.apiName);

  const narrativeCode = node.code || node.id;
  const qc = useQueryClient();

  // L6 Action history
  const historyQuery = useQuery<{ code: string; total: number; actions: Array<{
    kind: "placeOrder" | "transferStock"; id: number; at: string; status: string;
    quantity: number; unit: string; detail: string; actor: string;
  }> }>({
    queryKey: [`/api/ontology/actions/history/${narrativeCode}`],
    queryFn: async () => {
      const res = await fetch(`/api/ontology/actions/history/${encodeURIComponent(narrativeCode)}?limit=8`);
      if (!res.ok) throw new Error("history fetch failed");
      return res.json();
    },
    enabled: node.kind !== "device",
  });

  // L6 Action execution
  const executeActionMutation = useMutation({
    mutationFn: async ({ action, values }: { action: ActionTypeSpec; values: Record<string, any> }) => {
      const endpoint = action.apiName === "placeOrder" ? "/api/ontology/action/place-order"
        : action.apiName === "transferStock" ? "/api/ontology/action/transfer-stock"
        : null;
      if (!endpoint) throw new Error(`${action.apiName} için endpoint yok`);
      const res = await apiRequest("POST", endpoint, values);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "HTTP " + res.status }));
        throw new Error(body.error || "Hata");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setToastMsg({ text: data.message || "Aksiyon başarılı", kind: "ok" });
      qc.invalidateQueries({ queryKey: [`/api/ontology/actions/history/${narrativeCode}`] });
      setActiveActionForm(null);
    },
    onError: (err: any) => setToastMsg({ text: err.message || "Aksiyon hatası", kind: "err" }),
  });

  // Bu node'a bağlı gerçek kenarlar (runtime linkler)
  const inbound = allLinks.filter(l => l.to === node.id);
  const outbound = allLinks.filter(l => l.from === node.id);

  // Property değerleri — runtime node data'dan gel
  const propValue = (apiName: string): string => {
    const v: any = (node as any)[apiName];
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") return v.toLocaleString("tr-TR");
    if (typeof v === "boolean") return v ? "Evet" : "Hayır";
    if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "—";
    return String(v);
  };

  return (
    <div style={{
      position: "absolute", top: 140, right: 20, zIndex: 11,
      width: 420, maxHeight: "calc(100vh - 180px)",
      padding: "22px 24px", borderRadius: 14,
      background: "rgba(10,10,15,0.97)", backdropFilter: "blur(18px)",
      border: `1px solid ${objType.displayMetadata.color}40`,
      boxShadow: "0 12px 48px rgba(15,23,42,0.16)",
      overflowY: "auto", fontFamily: mono,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: objType.displayMetadata.color + "20",
              border: `1px solid ${objType.displayMetadata.color}60`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, color: objType.displayMetadata.color, fontWeight: 500,
            }}>{objType.displayMetadata.icon}</div>
            <div>
              <div style={{ fontSize: 10, color: objType.displayMetadata.color, letterSpacing: 1.5, fontWeight: 500 }}>
                {objType.displayName.toUpperCase()}
              </div>
              <div style={{ fontSize: 17, color: C.white, marginTop: 1 }}>{node.label}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{node.sublabel}</div>
          <div style={{ fontSize: 9, color: C.dim, marginTop: 6, fontStyle: "italic" }}>
            {objType.displayMetadata.description}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: C.surface, border: `1px solid ${C.border}`, color: C.mid,
          cursor: "pointer", fontSize: 18, width: 36, height: 36, borderRadius: 8,
        }}>✕</button>
      </div>

      {/* Meta */}
      <div style={{ fontSize: 9, color: C.dim, marginBottom: 12, padding: "8px 10px",
        background: "#f8fafc", borderRadius: 6, border: `1px solid ${C.border}`,
        lineHeight: 1.6 }}>
        <div><span style={{ color: C.mid }}>apiName:</span> <span style={{ color: C.white, fontFamily: mono }}>{objType.apiName}</span></div>
        <div><span style={{ color: C.mid }}>rid:</span> <span style={{ fontFamily: mono }}>{objType.rid}</span></div>
        <div><span style={{ color: C.mid }}>primaryKey:</span> <span style={{ fontFamily: mono }}>{objType.primaryKey}</span></div>
        <div><span style={{ color: C.mid }}>status:</span> <span style={{ color: objType.status === "ACTIVE" ? C.ok : C.warn, fontWeight: 500 }}>{objType.status}</span></div>
      </div>

      {/* Properties */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.8, marginBottom: 8, fontWeight: 500 }}>
          ÖZELLİKLER ({objType.properties.length})
        </div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          {objType.properties
            .filter(p => p.visibility !== "HIDDEN")
            .map((p, i) => (
              <div key={p.apiName} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", fontSize: 12,
                background: i % 2 === 0 ? "#f8fafc" : "transparent",
                borderBottom: i < objType.properties.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <div style={{ color: C.mid, fontSize: 12 }}>{p.displayName}</div>
                <div style={{ color: C.white, fontFamily: mono, fontSize: 13, fontWeight: 500, textAlign: "right" }}>
                  {propValue(p.apiName)}
                  {p.unit && <span style={{ color: C.dim, fontSize: 10, marginLeft: 3 }}>{p.unit}</span>}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Link Types */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.8, marginBottom: 8, fontWeight: 500 }}>
          BAĞLANTI TİPLERİ ({linkSpecs.length})
        </div>
        {linkSpecs.map(({ link, side, role }) => {
          const liveCount = side === "A"
            ? outbound.filter(l => l.linkTypeApiName === link.apiName).length
            : inbound.filter(l => l.linkTypeApiName === link.apiName).length;
          return (
            <div key={link.apiName + side} style={{
              padding: "10px 12px", marginBottom: 6, borderRadius: 6,
              background: "#f8fafc", border: `1px solid ${C.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.white }}>{role.displayName}</span>
                <span style={{ fontSize: 10, color: C.accent, fontFamily: mono,
                  padding: "2px 8px", borderRadius: 4, background: C.accentDim }}>
                  {cardinalityLabel(role.cardinality)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>
                {link.sentence}
              </div>
              <div style={{ fontSize: 10, color: C.ok, marginTop: 4, fontFamily: mono }}>
                → {liveCount} canlı bağlantı
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions — Palantir ActionType menü */}
      {node.kind !== "device" && actions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.8, marginBottom: 8, fontWeight: 500 }}>
            AKSİYONLAR ({actions.filter(a => a.status === "ACTIVE").length} aktif / {actions.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {actions.map(a => (
              <button
                key={a.apiName}
                disabled={a.status === "PLANNED"}
                onClick={() => {
                  if (a.apiName === "updateStock") onStartEdit();
                  else if (a.apiName === "simulateStock") onStartWhatIf();
                  else if (a.apiName === "placeOrder" || a.apiName === "transferStock") {
                    setActiveActionForm(a);
                  }
                }}
                style={{
                  textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: a.status === "PLANNED" ? "not-allowed" : "pointer",
                  background: a.status === "ACTIVE" ? "rgba(5,150,105,0.10)" : "#f8fafc",
                  border: `1px solid ${a.status === "ACTIVE" ? C.okBorder : C.border}`,
                  color: a.status === "ACTIVE" ? C.white : C.dim,
                  fontFamily: mono, fontSize: 12,
                  opacity: a.status === "PLANNED" ? 0.55 : 1,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{a.displayName}</div>
                  <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>{a.description}</div>
                </div>
                <span style={{
                  fontSize: 8, padding: "2px 6px", borderRadius: 3,
                  background: a.status === "ACTIVE" ? C.okDim : "#f1f5f9",
                  color: a.status === "ACTIVE" ? C.ok : C.mid,
                  border: `1px solid ${a.status === "ACTIVE" ? C.okBorder : C.border}`,
                }}>{a.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* L6 — Son Aksiyonlar (action history) */}
      {node.kind !== "device" && historyQuery.data && historyQuery.data.actions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.8, marginBottom: 8, fontWeight: 500 }}>
            SON AKSİYONLAR ({historyQuery.data.total})
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {historyQuery.data.actions.map((a, i) => {
              const isOrder = a.kind === "placeOrder";
              const statusColor = a.status === "completed" || a.status === "ordered" ? C.ok
                : a.status === "pending" || a.status === "in_transit" ? C.warn
                : a.status === "cancelled" || a.status === "rejected" ? C.err : C.mid;
              return (
                <div key={a.kind + a.id} style={{
                  padding: "8px 12px",
                  background: i % 2 === 0 ? "#f8fafc" : "transparent",
                  borderBottom: i < historyQuery.data!.actions.length - 1 ? `1px solid ${C.border}` : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.white, fontFamily: mono }}>
                      {isOrder ? "📦 Sipariş" : "↔ Transfer"}
                      <span style={{ color: C.dim, marginLeft: 8 }}>
                        {a.quantity} {a.unit}
                      </span>
                    </span>
                    <span style={{
                      fontSize: 8, padding: "2px 6px", borderRadius: 3,
                      background: statusColor + "22", color: statusColor, border: `1px solid ${statusColor}44`,
                      fontFamily: mono, fontWeight: 500, letterSpacing: 0.5,
                    }}>{a.status.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 9, color: C.dim, marginTop: 3 }}>{a.detail}</div>
                  <div style={{ fontSize: 8, color: C.dim, marginTop: 2, fontStyle: "italic" }}>
                    {a.at ? new Date(a.at).toLocaleString("tr-TR") : ""} · {a.actor}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drill-down buton (yarı mamül için) */}
      {node.hasChildren && (
        <button onClick={onToggleExpand} style={{
          width: "100%", padding: "10px", borderRadius: 8, cursor: "pointer",
          background: C.accentDim, border: `1px solid ${C.accent}40`, color: C.accent,
          fontSize: 12, fontFamily: mono, fontWeight: 500,
        }}>↕ Alt parçaları aç/kapat ({node.childrenCount})</button>
      )}

      {/* ActionForm modal */}
      {activeActionForm && (
        <ActionFormModal
          action={activeActionForm}
          defaultCode={node.code || node.id}
          defaultUnit={node.unit || "AD"}
          onClose={() => setActiveActionForm(null)}
          onSubmit={(values) => executeActionMutation.mutate({ action: activeActionForm, values })}
          submitting={executeActionMutation.isPending}
        />
      )}

      {/* Toast (mini-notification) */}
      {toastMsg && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 20,
          padding: "12px 18px", borderRadius: 10, fontFamily: mono, fontSize: 13,
          background: toastMsg.kind === "ok" ? C.okDim : C.errDim,
          border: `1px solid ${toastMsg.kind === "ok" ? C.okBorder : C.errBorder}`,
          color: toastMsg.kind === "ok" ? C.ok : C.err,
          boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
          maxWidth: 400,
        }}>
          {toastMsg.kind === "ok" ? "✓" : "✕"} {toastMsg.text}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ActionFormModal — Palantir Action parameter dialog
   Her parametre için input alanı (String/Integer/LocalDate)
   ═══════════════════════════════════════════════════════════ */
function ActionFormModal({
  action, defaultCode, defaultUnit, onClose, onSubmit, submitting,
}: {
  action: ActionTypeSpec;
  defaultCode: string;
  defaultUnit: string;
  onClose: () => void;
  onSubmit: (values: Record<string, any>) => void;
  submitting: boolean;
}) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = { code: defaultCode };
    for (const p of action.parameters) {
      if (p.apiName === "code") v[p.apiName] = defaultCode;
      else if (p.type === "Integer") v[p.apiName] = "";
      else v[p.apiName] = "";
    }
    return v;
  });

  const setField = (k: string, v: any) => setValues(prev => ({ ...prev, [k]: v }));

  const canSubmit = action.parameters.every(p => {
    if (!p.required) return true;
    const v = values[p.apiName];
    if (p.type === "Integer" || p.type === "Double") return v !== "" && !isNaN(parseFloat(v));
    return typeof v === "string" && v.trim().length > 0;
  }) && !submitting;

  const handleSubmit = () => {
    const payload: Record<string, any> = {};
    for (const p of action.parameters) {
      const v = values[p.apiName];
      if (v === "" || v === undefined) continue;
      if (p.type === "Integer" || p.type === "Double") payload[p.apiName] = parseFloat(v);
      else payload[p.apiName] = v;
    }
    onSubmit(payload);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, maxHeight: "85vh", overflowY: "auto",
          padding: "24px 28px", borderRadius: 14,
          background: "rgba(12,12,18,0.98)",
          border: `1px solid ${C.ok}50`,
          boxShadow: "0 16px 64px rgba(15,23,42,0.20)",
          fontFamily: mono,
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: C.ok, letterSpacing: 1.8, fontWeight: 500 }}>AKSİYON</div>
            <div style={{ fontSize: 20, color: C.white, marginTop: 4 }}>{action.displayName}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{action.description}</div>
          </div>
          <button onClick={onClose} style={{
            background: C.surface, border: `1px solid ${C.border}`, color: C.mid,
            cursor: "pointer", fontSize: 18, width: 36, height: 36, borderRadius: 8,
          }}>✕</button>
        </div>

        {/* Parameter inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {action.parameters.map(p => {
            const val = values[p.apiName] ?? "";
            return (
              <div key={p.apiName}>
                <label style={{ fontSize: 11, color: C.mid, fontFamily: mono, letterSpacing: 0.5 }}>
                  {p.displayName}
                  {p.required && <span style={{ color: C.err, marginLeft: 4 }}>*</span>}
                  <span style={{ fontSize: 9, color: C.dim, marginLeft: 6 }}>({p.type})</span>
                </label>
                {p.description && (
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2, fontStyle: "italic" }}>{p.description}</div>
                )}
                <input
                  type={p.type === "Integer" || p.type === "Double" ? "number" : p.type === "LocalDate" ? "date" : "text"}
                  value={val}
                  onChange={e => setField(p.apiName, e.target.value)}
                  disabled={p.apiName === "code"}
                  placeholder={p.apiName === "code" ? defaultCode : ""}
                  style={{
                    width: "100%", marginTop: 6, padding: "10px 12px",
                    fontSize: 14, fontFamily: mono, color: C.white,
                    background: p.apiName === "code" ? "#f8fafc" : "#ffffff",
                    border: `1px solid ${C.border}`, borderRadius: 6, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Submit row */}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 18px", borderRadius: 8, cursor: "pointer",
            background: C.surface, border: `1px solid ${C.border}`, color: C.mid,
            fontSize: 13, fontFamily: mono, minHeight: 40,
          }}>İptal</button>
          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={{
              padding: "10px 22px", borderRadius: 8, cursor: canSubmit ? "pointer" : "not-allowed",
              background: canSubmit ? C.okDim : C.surface,
              border: `1px solid ${canSubmit ? C.okBorder : C.border}`,
              color: canSubmit ? C.ok : C.dim,
              fontSize: 13, fontFamily: mono, fontWeight: 500, minHeight: 40,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Gönderiliyor…" : `▶ ${action.displayName}`}
          </button>
        </div>

        <div style={{ fontSize: 9, color: C.dim, marginTop: 12, fontStyle: "italic" }}>
          Onaydan sonra lineage + WS broadcast çalışır. Geri alınamaz.
        </div>
      </div>
    </div>
  );
}
