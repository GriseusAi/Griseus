import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";
import {
  BH_OBJECT_TYPES, BH_LINK_TYPES, BH_ACTION_TYPES,
  objectTypeForKind, actionsForObjectType, linksForObjectType,
  cardinalityLabel, ontologyMeta,
  type ObjectTypeSpec, type ActionTypeSpec, type LinkTypeSpec,
} from "@/lib/bh-ontology-schema";

/* ═══════════════════════════════════════════════════════════
   BH ONTOLOGY CANVAS — Canlı Organizma (Tier 1)
   L1 Kinetics · L2 Cross-ref hover · L3 What-if dry-run · L5 Flow anim
   ═══════════════════════════════════════════════════════════ */

const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.03)", surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(129,140,248,0.10)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.08)", okBorder: "rgba(52,211,153,0.25)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.08)", warnBorder: "rgba(251,191,36,0.25)",
  variable: "#ea580c", variableDim: "rgba(234,88,12,0.10)", variableBorder: "rgba(234,88,12,0.35)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.08)", errBorder: "rgba(239,68,68,0.30)",
  blue: "#60a5fa", blueDim: "rgba(96,165,250,0.08)", blueBorder: "rgba(96,165,250,0.25)",
  purple: "#a78bfa",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60", dimmer: "#2a2a3a",
};
const mono = "'Outfit', sans-serif";
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
  id: string; kind: "device" | "component" | "subassembly" | "subcomponent";
  label: string; sublabel: string;
  sku?: string; code?: string;
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

const LAYOUT_KEY = "bh-ontology-layout-v3";
const EXPANDED_KEY = "bh-ontology-expanded-v1";
const CANVAS_W = 2200;
const CANVAS_H = 1600;

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

/* L3 — dry-run: verilen override map'ine göre 4 BH maxProducible hesap */
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
    if (n.status === "variable") continue;
    // BH on-demand: stok=0 direct material bottleneck sayılmaz
    const stock = overrides[l.to] !== undefined ? overrides[l.to] : (n.currentStock ?? 0);
    if (stock === 0) continue;
    if (l.required <= 0) continue;
    const possible = Math.floor(stock / l.required);
    if (possible < min) { min = possible; btc = l.to; }
  }
  if (min === Infinity) return { max: 0, bottleneckCode: null };
  return { max: min, bottleneckCode: btc };
}

/* ── Default layout ── */
function defaultLayout(nodes: GraphNode[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const devices = nodes.filter(n => n.kind === "device");
  const topLevel = nodes.filter(n => n.kind !== "device" && n.kind !== "subcomponent");
  const subs = nodes.filter(n => n.kind === "subcomponent");

  const sortedDev = [...devices].sort((a, b) => {
    const a50 = a.sku!.includes("50") ? 0 : 1;
    const b50 = b.sku!.includes("50") ? 0 : 1;
    if (a50 !== b50) return a50 - b50;
    return a.sku!.localeCompare(b.sku!);
  });
  const devY = 110;
  const devSpacing = CANVAS_W / (sortedDev.length + 1);
  sortedDev.forEach((d, i) => { pos[d.id] = { x: devSpacing * (i + 1), y: devY }; });

  const shared = topLevel.filter(n => n.isShared);
  const unique = topLevel.filter(n => !n.isShared);

  const sharedY = 360;
  const sharedCols = Math.max(1, Math.ceil(shared.length / 2));
  const sharedSpacing = CANVAS_W / (sharedCols + 1);
  shared.forEach((n, i) => {
    const col = i % sharedCols;
    const row = Math.floor(i / sharedCols);
    pos[n.id] = { x: sharedSpacing * (col + 1), y: sharedY + row * 160 };
  });

  const skuToUnique: Record<string, GraphNode[]> = {};
  for (const n of unique) {
    if (n.usedBy.length === 1) {
      const s = n.usedBy[0];
      (skuToUnique[s] = skuToUnique[s] || []).push(n);
    } else {
      (skuToUnique["_orphan"] = skuToUnique["_orphan"] || []).push(n);
    }
  }
  sortedDev.forEach((d, di) => {
    const list = skuToUnique[d.sku!] || [];
    const baseX = devSpacing * (di + 1) - 200;
    const baseY = 780;
    list.forEach((n, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      pos[n.id] = { x: baseX + col * 140, y: baseY + row * 150 };
    });
  });

  // Subcomponent'ler: parent subassembly'nin altında fan-out
  const byParent: Record<string, GraphNode[]> = {};
  for (const s of subs) {
    const p = s.parentSubCode || "_";
    (byParent[p] = byParent[p] || []).push(s);
  }
  for (const [parentCode, children] of Object.entries(byParent)) {
    const pp = pos[parentCode];
    if (!pp) continue;
    const totalW = (children.length - 1) * 160;
    const startX = pp.x - totalW / 2;
    children.forEach((c, i) => {
      pos[c.id] = { x: startX + i * 160, y: pp.y + 180 };
    });
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

    // 4 device node
    BH_SKUS.forEach((sku, i) => {
      const cap = capQueries[i].data!;
      nodeMap.set(sku, {
        id: sku, kind: "device", label: sku,
        sublabel: `max ${fmt(cap.maxProducible)} adet`,
        sku, usedBy: [], maxProducible: cap.maxProducible,
      });
    });

    // Top-level bileşen + link'ler
    BH_SKUS.forEach((sku, i) => {
      const comps = bomQueries[i].data!.components;
      for (const c of comps) {
        let n = nodeMap.get(c.code);
        if (!n) {
          const intel = intelByCode.get(c.code);
          const hasCh = (c.children && c.children.length > 0) || c.isSubAssembly === true;
          n = {
            id: c.code, kind: hasCh ? "subassembly" : "component",
            label: c.code, sublabel: c.name, code: c.code, usedBy: [],
            currentStock: c.currentStock, status: c.status, unit: c.unit,
            dailyBurnRate: intel?.dailyBurnRate,
            daysLeft: intel?.seasonalDays ?? intel?.daysToStockout ?? null,
            trend: intel?.trend,
            depletionMonth: intel?.depletionMonth ?? null,
            requiredByDevice: {},
            hasChildren: hasCh,
            childrenCount: c.children?.length ?? 0,
          };
          nodeMap.set(c.code, n);
        }
        if (!n.usedBy.includes(sku)) n.usedBy.push(sku);
        (n.requiredByDevice as Record<string, number>)[sku] = c.requiredPerUnit;
        linkList.push({ from: sku, to: c.code, required: c.requiredPerUnit, tier: 1, linkTypeApiName: "consumes" });
      }
    });

    // Drill-down: expanded yarı mamül children → subcomponent node + link (sub→child)
    BH_SKUS.forEach((_, i) => {
      const comps = bomQueries[i].data!.components;
      for (const c of comps) {
        if (!c.isSubAssembly || !c.children || !expandedSubs.has(c.code)) continue;
        const flat = collectChildrenRecursive(c, c.code);
        for (const { child, parentCode } of flat) {
          const nid = `${parentCode}::${child.code}`;
          if (!nodeMap.has(nid)) {
            const intel = intelByCode.get(child.code);
            nodeMap.set(nid, {
              id: nid, kind: "subcomponent",
              label: child.code, sublabel: child.name, code: child.code, usedBy: [parentCode],
              currentStock: child.currentStock, status: child.status, unit: child.unit,
              dailyBurnRate: intel?.dailyBurnRate,
              daysLeft: intel?.seasonalDays ?? intel?.daysToStockout ?? null,
              trend: intel?.trend,
              depletionMonth: intel?.depletionMonth ?? null,
              parentSubCode: parentCode,
              hasChildren: (child.children?.length ?? 0) > 0,
              childrenCount: child.children?.length ?? 0,
            });
            linkList.push({ from: parentCode, to: nid, required: child.requiredPerUnit, tier: child.tier, linkTypeApiName: "assembles" });
          }
        }
      }
    });

    // Shared + bottleneck
    const bottleneckCodes = new Set<string>();
    BH_SKUS.forEach((_, i) => {
      const bt = capQueries[i].data!.bottlenecks[0];
      if (bt) bottleneckCodes.add(bt.code);
    });
    nodeMap.forEach(n => {
      if (n.kind !== "device") {
        n.isShared = n.usedBy.length >= 2;
        n.isBottleneck = bottleneckCodes.has(n.id);
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
    return set;
  }, [hoveredId, links]);

  /* Object inspector drawer */
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspectedNode = useMemo(() => inspectedId ? nodes.find(n => n.id === inspectedId) : null, [inspectedId, nodes]);

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
  const saveEdit = (node: GraphNode) => {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v >= 0) stockMutation.mutate({ code: node.id, stock: v, unit: node.unit || "AD" });
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
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setViewport(v => ({ ...v, scale: Math.max(0.3, Math.min(3, v.scale * factor)) }));
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

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: mono, overflow: "hidden" }}>
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
            ◈ BH GRUBU ONTOLOJİ {simulationActive && <span style={{ color: C.variable, marginLeft: 8 }}>⚡ SİMÜLASYON AKTİF</span>}
          </div>
          <div style={{ fontSize: 18, color: C.white, marginTop: 2 }}>Varlık Felsefesi — 4 Cihaz · Canlı Zincir</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
            Hover → bağlıları vurgula · Tıkla → detay incele · Stok üstü → düzenle · ⚡ → What-if · +N → alt parça · Sürükle/Scroll
          </div>
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
          <Stat label="KRİTİK" value={problemCount.critical} color={C.err} />
          <Stat label="DÜŞÜK" value={problemCount.warning} color={C.warn} />
          <Stat label="DARBOĞAZ" value={problemCount.bottlenecks} color={C.err} />
          <Stat label="PAYLAŞIMLI" value={problemCount.shared} color={C.accent} />
          {simulationActive && (
            <button onClick={clearSimulation} style={{
              padding: "10px 18px", borderRadius: 8, cursor: "pointer", minHeight: 36,
              background: C.variableDim, border: `1px solid ${C.variableBorder}`, color: C.variable, fontSize: 13, fontFamily: mono,
            }}>⚡ Simülasyonu Kapat</button>
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
        </div>
      </div>

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
            setWhatifFocusCode(inspectedNode.id);
            if (whatifOverrides[inspectedNode.id] === undefined) {
              setWhatifOverrides(prev => ({ ...prev, [inspectedNode.id]: inspectedNode.currentStock ?? 0 }));
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
      {whatifFocusCode && (
        <WhatIfPanel
          code={whatifFocusCode}
          node={nodes.find(n => n.id === whatifFocusCode)!}
          overrides={whatifOverrides}
          setOverrides={setWhatifOverrides}
          simulatedCapacity={simulatedCapacity}
          nodes={nodes}
          onClose={() => setWhatifFocusCode(null)}
        />
      )}

      {/* Canvas */}
      <div style={{ width: "100%", height: "calc(100vh - 130px)", position: "relative", cursor: panStart ? "grabbing" : "grab" }}>
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
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={C.dimmer} strokeWidth="0.5" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect x={-viewport.x} y={-viewport.y} width={CANVAS_W / viewport.scale} height={CANVAS_H / viewport.scale} fill="url(#grid)" />

          {/* Links — L5 Flow animation + L2 hover dim + cardinality label */}
          {links.map((l, i) => {
            const pa = positions[l.from]; const pb = positions[l.to];
            if (!pa || !pb) return null;
            const nodeTo = nodes.find(n => n.id === l.to);
            const isProb = nodeTo?.status === "critical" || nodeTo?.isBottleneck;
            const stroke = isProb ? C.err : (nodeTo?.isShared ? C.accent : C.border);
            const isConnected = !connectedSet || connectedSet.has(l.from) || connectedSet.has(l.to);
            const opacity = (isProb ? 0.7 : nodeTo?.isShared ? 0.5 : 0.3) * (isConnected ? 1 : 0.15);
            const midX = (pa.x + pb.x) / 2; const midY = (pa.y + pb.y) / 2;
            const curve = `M ${pa.x} ${pa.y + 30} Q ${midX} ${midY} ${pb.x} ${pb.y - 30}`;
            const flowClass = isProb ? "link-flow-critical" : nodeTo?.isShared ? "link-flow-shared" : "link-flow";
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
                  strokeWidth={isProb ? 2.5 : 1.5}
                  strokeDasharray="8 4"
                  className={flowClass}
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
            const simMax = n.kind === "device" && simulationActive ? simulatedCapacity[n.id!].max : undefined;
            const simBtc = n.kind === "device" && simulationActive ? simulatedCapacity[n.id!].bottleneckCode : undefined;
            const realCode = n.code || n.id;
            const pulsing = pulseCodes.has(realCode) || pulseCodes.has(n.id);
            const isExpanded = n.hasChildren && expandedSubs.has(realCode);
            return (
              <NodeView
                key={n.id} node={n} x={p.x} y={p.y}
                dim={!isConnected}
                pulsing={pulsing}
                expanded={!!isExpanded}
                isInspected={inspectedId === n.id}
                editing={editingCode === n.id} editVal={editVal}
                overrideStock={whatifOverrides[n.id]}
                simulatedMax={simMax}
                simulatedBottleneckCode={simBtc}
                simulationActive={simulationActive}
                onPointerDown={(e) => handlePointerDown(e, n.id)}
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId(null)}
                onToggleExpand={() => {
                  if (n.hasChildren) toggleExpanded(realCode);
                }}
                onStartInspect={() => setInspectedId(n.id)}
                onStartEdit={() => {
                  if (n.kind === "device") return;
                  setEditingCode(n.id);
                  setEditVal(String(n.currentStock ?? 0));
                }}
                onStartWhatIf={() => {
                  if (n.kind === "device") return;
                  setWhatifFocusCode(n.id);
                  if (whatifOverrides[n.id] === undefined) {
                    setWhatifOverrides(prev => ({ ...prev, [n.id]: n.currentStock ?? 0 }));
                  }
                }}
                onEditChange={setEditVal}
                onSaveEdit={() => saveEdit(n)}
                onCancelEdit={() => setEditingCode(null)}
                saving={stockMutation.isPending}
              />
            );
          })}
        </svg>
      </div>
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
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.variable, letterSpacing: 1.8, fontWeight: 500 }}>⚡ WHAT-IF SİMÜLASYON</div>
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
          style={{ flex: 1, fontSize: 16, fontFamily: mono, color: C.variable, background: "rgba(0,0,0,0.5)",
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
function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 60 }}>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.2, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, color, fontFamily: mono, fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Node View — L1 kinetics + L2 dim + L3 override + pulse + expand
   ═══════════════════════════════════════════════════════════ */
function NodeView({
  node, x, y, dim, pulsing, expanded, isInspected,
  editing, editVal,
  overrideStock, simulatedMax, simulatedBottleneckCode, simulationActive,
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
  onPointerDown: (e: React.PointerEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleExpand: () => void;
  onStartInspect: () => void;
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
  // Daha büyük, kullanıcı dostu boyutlar
  const w = isDevice ? 240 : isSubComp ? 200 : 230;
  const h = isDevice ? 96 : isSubComp ? 106 : 118;

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
      {/* Inspected — kalın yeşil çerçeve */}
      {isInspected && (
        <rect x={-5} y={-5} width={w+10} height={h+10} rx={12}
          fill="none" stroke={C.ok} strokeWidth={2.5} opacity={0.95}/>
      )}

      <rect className={pulsing ? "flash-bg" : undefined}
        width={w} height={h} rx={10}
        fill={isDevice ? "#0f0f18" : col.bg}
        stroke={isDevice ? C.accent : col.border}
        strokeWidth={isDevice ? 2 : 1.5}
        onPointerDown={onPointerDown}
      />

      {isDevice ? (
        <>
          {/* Device inspector ℹ top-left */}
          <g onClick={(e) => { e.stopPropagation(); onStartInspect(); }} style={{ cursor: "pointer" }}>
            <rect x={8} y={8} width={30} height={22} rx={5}
              fill={isInspected ? C.okDim : C.accentDim} stroke={isInspected ? C.okBorder : C.accent + "40"} strokeWidth={1}/>
            <text x={23} y={23} textAnchor="middle" fill={objType.displayMetadata.color} fontSize={14} fontFamily={mono} fontWeight={500}>
              {objType.displayMetadata.icon}
            </text>
          </g>
          <text x={w/2} y={28} textAnchor="middle" fill={C.white} fontSize={17} fontFamily={mono} fontWeight={500}>
            {node.label}
          </text>
          <text x={w/2} y={50} textAnchor="middle" fill={C.accent} fontSize={12} fontFamily={mono}>
            {node.sublabel}
          </text>
          {simulationActive && simulatedMax !== undefined && (
            <>
              <line x1={22} y1={60} x2={w-22} y2={60} stroke={C.variableBorder} strokeDasharray="3 2" opacity={0.6} />
              <text x={w/2} y={80} textAnchor="middle" fill={C.variable} fontSize={13} fontFamily={mono} fontWeight={500}>
                ⚡ sim: {fmt(simulatedMax)} <tspan fill={deviceDeltaColor}>
                  ({deviceDelta >= 0 ? "+" : ""}{deviceDelta})
                </tspan>
              </text>
            </>
          )}
        </>
      ) : (
        <>
          {/* Status stripe */}
          <rect width={w} height={4} fill={col.fg} opacity={0.75} rx={2}/>

          <text x={10} y={24} fill={C.white} fontSize={13} fontFamily={mono} fontWeight={500}
            onPointerDown={onPointerDown}>
            {node.label}
          </text>
          {isSub && (
            <text x={w - 10} y={24} textAnchor="end" fill={C.accent} fontSize={9} fontFamily={mono}>
              ⚙ YARI MAMÜL
            </text>
          )}
          {isSubComp && (
            <text x={w - 10} y={24} textAnchor="end" fill={C.purple} fontSize={9} fontFamily={mono}>
              ↳ ALT PARÇA
            </text>
          )}
          {node.isBottleneck && !isSub && !isSubComp && (
            <text x={w - 10} y={24} textAnchor="end" fill={C.err} fontSize={9} fontFamily={mono}>
              ▲ DARBOĞAZ
            </text>
          )}

          <foreignObject x={10} y={30} width={w - 20} height={16}>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: mono, lineHeight: "14px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.sublabel}
            </div>
          </foreignObject>

          {/* Stock (editable) */}
          {editing ? (
            <foreignObject x={10} y={50} width={w - 20} height={32}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }} onPointerDown={e => e.stopPropagation()}>
                <input autoFocus type="number" value={editVal}
                  onChange={e => onEditChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); else if (e.key === "Escape") onCancelEdit(); }}
                  disabled={saving}
                  style={{ width: 90, fontSize: 15, fontFamily: mono, color: col.fg,
                    background: "rgba(0,0,0,0.55)", border: `1px solid ${col.fg}70`, borderRadius: 5,
                    padding: "4px 8px", outline: "none" }}
                />
                <button onClick={onSaveEdit} disabled={saving} style={{
                  fontSize: 14, padding: "5px 10px", borderRadius: 5, cursor: "pointer",
                  background: C.okDim, border: `1px solid ${C.okBorder}`, color: C.ok, fontFamily: mono,
                }}>✓</button>
                <button onClick={onCancelEdit} style={{
                  fontSize: 14, padding: "5px 10px", borderRadius: 5, cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.mid, fontFamily: mono,
                }}>✕</button>
              </div>
            </foreignObject>
          ) : (
            <g onClick={onStartEdit} style={{ cursor: "pointer" }}>
              <text x={10} y={72} fill={isOverridden ? C.variable : col.fg} fontSize={22} fontFamily={mono} fontWeight={500}>
                {fmt(displayStock)}
              </text>
              <text x={10 + String(fmt(displayStock)).length * 13 + 6} y={72} fill={C.dim} fontSize={11} fontFamily={mono}>
                {node.unit || "AD"} ✎
              </text>
              <text x={w - 10} y={72} textAnchor="end" fill={col.fg} fontSize={10} fontFamily={mono} opacity={0.85}>
                {statusLabel(node.status)}
              </text>
            </g>
          )}

          {/* L1 Kinetics row */}
          <g style={{ pointerEvents: "none" }}>
            <text x={10} y={94} fill={vel.color} fontSize={14} fontFamily={mono} fontWeight={500}>
              {vel.icon}
            </text>
            <text x={32} y={94} fill={C.dim} fontSize={10} fontFamily={mono}>
              {node.dailyBurnRate && node.dailyBurnRate > 0
                ? `${node.dailyBurnRate.toFixed(1)}/gün`
                : "durağan"}
            </text>
            {node.daysLeft !== null && node.daysLeft !== undefined && (
              <text x={w - 10} y={94} textAnchor="end"
                fill={node.daysLeft < 30 ? C.err : node.daysLeft < 90 ? C.warn : C.mid}
                fontSize={10} fontFamily={mono}>
                {node.daysLeft > 365 ? "> 1yıl" : `${Math.round(node.daysLeft)}g`}
                {node.depletionMonth ? ` · ${node.depletionMonth}` : ""}
              </text>
            )}
          </g>

          {/* Inspector (ℹ) button — sol üstte obj type icon'u tıklanabilir */}
          <g onClick={(e) => { e.stopPropagation(); onStartInspect(); }} style={{ cursor: "pointer" }}>
            <rect x={-10} y={4} width={30} height={22} rx={5}
              fill={isInspected ? C.okDim : "rgba(52,211,153,0.06)"}
              stroke={isInspected ? C.okBorder : "rgba(52,211,153,0.18)"} strokeWidth={1}/>
            <text x={5} y={19} textAnchor="middle" fill={objType.displayMetadata.color} fontSize={14} fontFamily={mono} fontWeight={500}>
              {objType.displayMetadata.icon}
            </text>
          </g>

          {/* What-if button — 32x22 */}
          <g onClick={(e) => { e.stopPropagation(); onStartWhatIf(); }} style={{ cursor: "pointer" }}>
            <rect x={w - 40} y={4} width={32} height={22} rx={5}
              fill={C.variableDim} stroke={C.variableBorder} strokeWidth={1}/>
            <text x={w - 24} y={19} textAnchor="middle" fill={C.variable} fontSize={13} fontFamily={mono} fontWeight={500}>⚡</text>
          </g>

          {/* Expand button — yarı mamül için (+/−) */}
          {node.hasChildren && (
            <g onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} style={{ cursor: "pointer" }}>
              <rect x={-10} y={h - 14} width={28} height={22} rx={5}
                fill={expanded ? C.accentDim : C.surface}
                stroke={expanded ? C.accent : C.border} strokeWidth={1}/>
              <text x={4} y={h + 2} textAnchor="middle"
                fill={expanded ? C.accent : C.mid} fontSize={13} fontFamily={mono} fontWeight={500}>
                {expanded ? "−" : `+${node.childrenCount}`}
              </text>
            </g>
          )}

          {/* usedBy badges */}
          {node.usedBy.length > 0 && (
            <foreignObject x={0} y={h} width={w} height={18}>
              <div style={{ display: "flex", gap: 3, paddingLeft: 24, flexWrap: "wrap" }}>
                {node.usedBy.map(sku => {
                  const abbr = sku.replace("BH.", "").replace(".SV", "");
                  return (
                    <span key={sku} style={{
                      fontSize: 9, fontFamily: mono, padding: "2px 6px", borderRadius: 4,
                      background: node.isShared ? C.accentDim : "rgba(255,255,255,0.04)",
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
  const objType = objectTypeForKind(node.kind as any);
  const actions = actionsForObjectType(objType.apiName);
  const linkSpecs = linksForObjectType(objType.apiName);

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
      boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
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
        background: "rgba(255,255,255,0.02)", borderRadius: 6, border: `1px solid ${C.border}`,
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
                background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                borderBottom: i < objType.properties.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.white, fontSize: 12 }}>{p.displayName}</div>
                  <div style={{ color: C.dim, fontSize: 9, marginTop: 1 }}>
                    {p.apiName} · <span style={{ color: C.accent + "99" }}>{p.type}</span>
                    {p.unit && <span> · {p.unit}</span>}
                    {p.visibility === "PROMINENT" && <span style={{ color: C.ok, marginLeft: 6 }}>●</span>}
                  </div>
                </div>
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
              background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`,
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
                }}
                style={{
                  textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: a.status === "PLANNED" ? "not-allowed" : "pointer",
                  background: a.status === "ACTIVE" ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.02)",
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
                  background: a.status === "ACTIVE" ? C.okDim : "rgba(255,255,255,0.04)",
                  color: a.status === "ACTIVE" ? C.ok : C.mid,
                  border: `1px solid ${a.status === "ACTIVE" ? C.okBorder : C.border}`,
                }}>{a.status}</span>
              </button>
            ))}
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
    </div>
  );
}
