import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";

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
  id: string; kind: "device" | "component" | "subassembly";
  label: string; sublabel: string;
  sku?: string; code?: string;
  usedBy: string[];
  currentStock?: number; status?: Status;
  maxProducible?: number; isBottleneck?: boolean; isShared?: boolean;
  unit?: string;
  /* L1 Kinetics */
  dailyBurnRate?: number;
  daysLeft?: number | null;      // seasonalDays (mevsim-ağırlıklı)
  trend?: string;
  depletionMonth?: string | null;
  /* L3 Required per BH (for dry-run) */
  requiredByDevice?: Record<string, number>;
}

interface GraphLink {
  from: string; to: string; required: number; tier: number;
}

const LAYOUT_KEY = "bh-ontology-layout-v2";
const CANVAS_W = 1800;
const CANVAS_H = 1200;

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
  const others = nodes.filter(n => n.kind !== "device");

  const sortedDev = [...devices].sort((a, b) => {
    const a50 = a.sku!.includes("50") ? 0 : 1;
    const b50 = b.sku!.includes("50") ? 0 : 1;
    if (a50 !== b50) return a50 - b50;
    return a.sku!.localeCompare(b.sku!);
  });
  const devY = 80;
  const devSpacing = CANVAS_W / (sortedDev.length + 1);
  sortedDev.forEach((d, i) => { pos[d.id] = { x: devSpacing * (i + 1), y: devY }; });

  const shared = others.filter(n => n.isShared);
  const unique = others.filter(n => !n.isShared);

  const sharedY = 280;
  const sharedCols = Math.max(1, Math.ceil(shared.length / 2));
  const sharedSpacing = CANVAS_W / (sharedCols + 1);
  shared.forEach((n, i) => {
    const col = i % sharedCols;
    const row = Math.floor(i / sharedCols);
    pos[n.id] = { x: sharedSpacing * (col + 1), y: sharedY + row * 130 };
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
    const baseX = devSpacing * (di + 1) - 170;
    const baseY = 600;
    list.forEach((n, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      pos[n.id] = { x: baseX + col * 120, y: baseY + row * 120 };
    });
  });

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

    // Tier-1 bileşen + link'ler
    BH_SKUS.forEach((sku, i) => {
      const comps = bomQueries[i].data!.components;
      const tier1 = comps.filter(c => c.tier === 1);
      for (const c of tier1) {
        let n = nodeMap.get(c.code);
        if (!n) {
          const intel = intelByCode.get(c.code);
          n = {
            id: c.code, kind: c.isSubAssembly ? "subassembly" : "component",
            label: c.code, sublabel: c.name, code: c.code, usedBy: [],
            currentStock: c.currentStock, status: c.status, unit: c.unit,
            dailyBurnRate: intel?.dailyBurnRate,
            daysLeft: intel?.seasonalDays ?? intel?.daysToStockout ?? null,
            trend: intel?.trend,
            depletionMonth: intel?.depletionMonth ?? null,
            requiredByDevice: {},
          };
          nodeMap.set(c.code, n);
        }
        if (!n.usedBy.includes(sku)) n.usedBy.push(sku);
        (n.requiredByDevice as Record<string, number>)[sku] = c.requiredPerUnit;
        linkList.push({ from: sku, to: c.code, required: c.requiredPerUnit, tier: 1 });
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
  }, [allLoaded, bomQueries, capQueries, intelQueries]);

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

  /* WS live refresh */
  const handleStockUpdate = useCallback(() => {
    BH_SKUS.forEach(sku => {
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/intelligence`] });
    });
  }, [qc]);
  const { connected } = useStockWebSocket(handleStockUpdate, () => {}, () => {});

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
        @keyframes flow {
          to { stroke-dashoffset: -24; }
        }
        @keyframes flowSlow {
          to { stroke-dashoffset: -12; }
        }
        .link-flow { animation: flow 1.2s linear infinite; }
        .link-flow-shared { animation: flow 0.8s linear infinite; }
        .link-flow-critical { animation: flow 0.5s linear infinite; }
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
            Hover → bağlıları vurgula · Tıkla → stok değiştir · Çift tıkla → What-if simüle · Sürükle → konum · Scroll → zoom
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Stat label="KRİTİK" value={problemCount.critical} color={C.err} />
          <Stat label="DÜŞÜK" value={problemCount.warning} color={C.warn} />
          <Stat label="DARBOĞAZ" value={problemCount.bottlenecks} color={C.err} />
          <Stat label="PAYLAŞIMLI" value={problemCount.shared} color={C.accent} />
          {simulationActive && (
            <button onClick={clearSimulation} style={{
              padding: "6px 12px", borderRadius: 6, cursor: "pointer",
              background: C.variableDim, border: `1px solid ${C.variableBorder}`, color: C.variable, fontSize: 11, fontFamily: mono,
            }}>⚡ Simülasyonu Kapat</button>
          )}
          <button onClick={resetLayout} style={{
            padding: "6px 12px", borderRadius: 6, cursor: "pointer",
            background: C.surface, border: `1px solid ${C.border}`, color: C.mid, fontSize: 11, fontFamily: mono,
          }}>Layout Sıfırla</button>
        </div>
      </div>

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

          {/* Links — L5 Flow animation + L2 hover dim */}
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
            return (
              <path key={i} d={curve} fill="none"
                stroke={stroke}
                strokeWidth={isProb ? 2 : 1.2}
                strokeDasharray="8 4"
                className={flowClass}
                opacity={opacity}
                style={{ pointerEvents: "none", transition: "opacity 0.2s" }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(n => {
            const p = positions[n.id];
            if (!p) return null;
            const isConnected = !connectedSet || connectedSet.has(n.id);
            const simMax = n.kind === "device" && simulationActive ? simulatedCapacity[n.id!].max : undefined;
            const simBtc = n.kind === "device" && simulationActive ? simulatedCapacity[n.id!].bottleneckCode : undefined;
            return (
              <NodeView
                key={n.id} node={n} x={p.x} y={p.y}
                dim={!isConnected}
                editing={editingCode === n.id} editVal={editVal}
                overrideStock={whatifOverrides[n.id]}
                simulatedMax={simMax}
                simulatedBottleneckCode={simBtc}
                simulationActive={simulationActive}
                onPointerDown={(e) => handlePointerDown(e, n.id)}
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId(null)}
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
      position: "absolute", top: 130, left: 16, zIndex: 10,
      width: 360, padding: "14px 16px", borderRadius: 12,
      background: "rgba(10,10,15,0.92)", backdropFilter: "blur(12px)",
      border: `1px solid ${C.variableBorder}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: C.variable, letterSpacing: 1.5 }}>⚡ WHAT-IF SİMÜLASYON</div>
          <div style={{ fontSize: 14, color: C.white, marginTop: 2 }}>{code}</div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>{node.sublabel}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.dim, margin: "10px 0 4px" }}>
        <span>Gerçek: {fmt(original)}</span>
        <span style={{ color: C.variable }}>Simüle: {fmt(current)}</span>
      </div>
      <input type="range" min={0} max={maxSlider} value={current}
        onChange={e => setOverrides(prev => ({ ...prev, [code]: parseInt(e.target.value) }))}
        style={{ width: "100%", accentColor: C.variable }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input type="number" value={current} onChange={e => setOverrides(prev => ({ ...prev, [code]: parseFloat(e.target.value) || 0 }))}
          style={{ flex: 1, fontSize: 12, fontFamily: mono, color: C.variable, background: "rgba(0,0,0,0.4)",
            border: `1px solid ${C.variableBorder}`, borderRadius: 4, padding: "4px 8px", outline: "none" }}
        />
        <button onClick={() => setOverrides(prev => {
          const next = { ...prev }; delete next[code]; return next;
        })} style={{ padding: "4px 10px", fontSize: 10, borderRadius: 4, cursor: "pointer",
          background: C.surface, border: `1px solid ${C.border}`, color: C.mid,
        }}>Sıfırla</button>
      </div>

      <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>4 CİHAZ ETKİSİ</div>
        {(["BH.50ST.SV","BH.50UT.SV","BH.55ST.SV","BH.55UT.SV"] as const).map(sku => {
          const dev = nodes.find(n => n.id === sku);
          if (!dev) return null;
          const realMax = dev.maxProducible ?? 0;
          const simMax = simulatedCapacity[sku].max;
          const btc = simulatedCapacity[sku].bottleneckCode;
          const delta = simMax - realMax;
          const dColor = delta > 0 ? C.ok : delta < 0 ? C.err : C.mid;
          const dSign = delta > 0 ? "+" : "";
          return (
            <div key={sku} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "3px 0" }}>
              <span style={{ color: C.mid, fontFamily: mono }}>{sku.replace("BH.", "").replace(".SV","")}</span>
              <span style={{ fontFamily: mono, color: C.dim }}>
                {fmt(realMax)} → <span style={{ color: C.variable, fontWeight: 500 }}>{fmt(simMax)}</span>
                <span style={{ color: dColor, marginLeft: 6 }}>({dSign}{delta})</span>
              </span>
            </div>
          );
        })}
        {node.isBottleneck && <div style={{ fontSize: 9, color: C.err, marginTop: 6 }}>▲ Bu atom şu an en az 1 BH'de darboğaz</div>}
      </div>

      <div style={{ fontSize: 9, color: C.dim, marginTop: 10, fontStyle: "italic" }}>
        Dry-run: DB'ye yazılmaz. Kapat ile tüm simülasyonlar temizlenir.
      </div>
    </div>
  );
}

/* ── Stat pill ── */
function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, color, fontFamily: mono, fontWeight: 400 }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Node View — L1 kinetics + L2 dim + L3 override
   ═══════════════════════════════════════════════════════════ */
function NodeView({
  node, x, y, dim, editing, editVal,
  overrideStock, simulatedMax, simulatedBottleneckCode, simulationActive,
  onPointerDown, onMouseEnter, onMouseLeave,
  onStartEdit, onStartWhatIf,
  onEditChange, onSaveEdit, onCancelEdit, saving,
}: {
  node: GraphNode; x: number; y: number;
  dim: boolean;
  editing: boolean; editVal: string;
  overrideStock?: number;
  simulatedMax?: number;
  simulatedBottleneckCode?: string | null;
  simulationActive: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onStartEdit: () => void;
  onStartWhatIf: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  saving: boolean;
}) {
  const isDevice = node.kind === "device";
  const isSub = node.kind === "subassembly";
  const w = isDevice ? 190 : 180;
  const h = isDevice ? 74 : 86;

  const displayStock = overrideStock !== undefined ? overrideStock : (node.currentStock ?? 0);
  const isOverridden = overrideStock !== undefined && overrideStock !== node.currentStock;

  const col = statusColor(node.status, node.isBottleneck);
  const vel = velocityIcon(node.dailyBurnRate, node.trend);

  // Device simulated bottleneck gösterimi
  const deviceDelta = (isDevice && simulatedMax !== undefined && node.maxProducible !== undefined)
    ? simulatedMax - node.maxProducible : 0;
  const deviceDeltaColor = deviceDelta > 0 ? C.ok : deviceDelta < 0 ? C.err : C.mid;

  return (
    <g transform={`translate(${x - w/2}, ${y - h/2})`}
       style={{ cursor: "grab", opacity: dim ? 0.25 : 1, transition: "opacity 0.2s" }}
       onMouseEnter={onMouseEnter}
       onMouseLeave={onMouseLeave}
    >
      {/* Bottleneck halo */}
      {node.isBottleneck && (
        <rect x={-6} y={-6} width={w+12} height={h+12} rx={14}
          fill="none" stroke={C.err} strokeWidth={2} opacity={0.5} filter="url(#glow)">
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite"/>
        </rect>
      )}
      {/* Shared çift çerçeve */}
      {node.isShared && !isDevice && (
        <rect x={-3} y={-3} width={w+6} height={h+6} rx={10}
          fill="none" stroke={C.accent} strokeWidth={1} opacity={0.5} strokeDasharray="4 2"/>
      )}
      {/* Override indicator */}
      {isOverridden && (
        <rect x={-4} y={-4} width={w+8} height={h+8} rx={11}
          fill="none" stroke={C.variable} strokeWidth={1.5} strokeDasharray="2 2" opacity={0.8}/>
      )}

      <rect width={w} height={h} rx={8}
        fill={isDevice ? "#111118" : col.bg}
        stroke={isDevice ? C.accent : col.border}
        strokeWidth={isDevice ? 2 : 1.5}
        onPointerDown={onPointerDown}
      />

      {isDevice ? (
        <>
          <text x={w/2} y={22} textAnchor="middle" fill={C.white} fontSize={14} fontFamily={mono} fontWeight={500}>
            {node.label}
          </text>
          <text x={w/2} y={42} textAnchor="middle" fill={C.accent} fontSize={10} fontFamily={mono}>
            {node.sublabel}
          </text>
          {simulationActive && simulatedMax !== undefined && (
            <>
              <line x1={20} y1={50} x2={w-20} y2={50} stroke={C.variableBorder} strokeDasharray="2 2" opacity={0.6} />
              <text x={w/2} y={64} textAnchor="middle" fill={C.variable} fontSize={11} fontFamily={mono} fontWeight={500}>
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
          <rect width={w} height={3} fill={col.fg} opacity={0.7} rx={2}/>

          <text x={8} y={18} fill={C.white} fontSize={10} fontFamily={mono} fontWeight={500}
            onPointerDown={onPointerDown}>
            {node.label}
          </text>
          {isSub && (
            <text x={w - 8} y={18} textAnchor="end" fill={C.accent} fontSize={7} fontFamily={mono}>
              ⚙ YARI MAMÜL
            </text>
          )}
          {node.isBottleneck && !isSub && (
            <text x={w - 8} y={18} textAnchor="end" fill={C.err} fontSize={7} fontFamily={mono}>
              ▲ DARBOĞAZ
            </text>
          )}

          <foreignObject x={8} y={22} width={w - 16} height={14}>
            <div style={{ fontSize: 9, color: C.dim, fontFamily: mono, lineHeight: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.sublabel}
            </div>
          </foreignObject>

          {/* Stock (editable) */}
          {editing ? (
            <foreignObject x={8} y={38} width={w - 16} height={26}>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }} onPointerDown={e => e.stopPropagation()}>
                <input autoFocus type="number" value={editVal}
                  onChange={e => onEditChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); else if (e.key === "Escape") onCancelEdit(); }}
                  disabled={saving}
                  style={{ width: 70, fontSize: 12, fontFamily: mono, color: col.fg,
                    background: "rgba(0,0,0,0.5)", border: `1px solid ${col.fg}60`, borderRadius: 4,
                    padding: "2px 4px", outline: "none" }}
                />
                <button onClick={onSaveEdit} disabled={saving} style={{
                  fontSize: 11, padding: "2px 6px", borderRadius: 3, cursor: "pointer",
                  background: C.okDim, border: `1px solid ${C.okBorder}`, color: C.ok,
                }}>✓</button>
                <button onClick={onCancelEdit} style={{
                  fontSize: 11, padding: "2px 6px", borderRadius: 3, cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.mid,
                }}>✕</button>
              </div>
            </foreignObject>
          ) : (
            <g onClick={onStartEdit} style={{ cursor: "pointer" }}>
              <text x={8} y={54} fill={isOverridden ? C.variable : col.fg} fontSize={16} fontFamily={mono} fontWeight={500}>
                {fmt(displayStock)}
              </text>
              <text x={62} y={54} fill={C.dim} fontSize={9} fontFamily={mono}>
                {node.unit || "AD"} ✎
              </text>
              <text x={w - 8} y={54} textAnchor="end" fill={col.fg} fontSize={8} fontFamily={mono} opacity={0.8}>
                {statusLabel(node.status)}
              </text>
            </g>
          )}

          {/* L1 Kinetics row — velocity + countdown */}
          <g style={{ pointerEvents: "none" }}>
            <text x={8} y={70} fill={vel.color} fontSize={11} fontFamily={mono} fontWeight={500}>
              {vel.icon}
            </text>
            <text x={24} y={70} fill={C.dim} fontSize={8} fontFamily={mono}>
              {node.dailyBurnRate && node.dailyBurnRate > 0
                ? `${node.dailyBurnRate.toFixed(1)}/gün`
                : "durağan"}
            </text>
            {node.daysLeft !== null && node.daysLeft !== undefined && (
              <text x={w - 8} y={70} textAnchor="end"
                fill={node.daysLeft < 30 ? C.err : node.daysLeft < 90 ? C.warn : C.mid}
                fontSize={8} fontFamily={mono}>
                {node.daysLeft > 365 ? "> 1yıl" : `${Math.round(node.daysLeft)}g`}
                {node.depletionMonth ? ` · ${node.depletionMonth}` : ""}
              </text>
            )}
          </g>

          {/* What-if button */}
          <g onClick={(e) => { e.stopPropagation(); onStartWhatIf(); }} style={{ cursor: "pointer" }}>
            <rect x={w - 24} y={2} width={20} height={14} rx={3}
              fill={C.variableDim} stroke={C.variableBorder} strokeWidth={0.5}/>
            <text x={w - 14} y={12} textAnchor="middle" fill={C.variable} fontSize={8} fontFamily={mono}>⚡</text>
          </g>

          {/* usedBy badges */}
          {node.usedBy.length > 0 && (
            <foreignObject x={0} y={h} width={w} height={14}>
              <div style={{ display: "flex", gap: 2, paddingLeft: 4, flexWrap: "wrap" }}>
                {node.usedBy.map(sku => {
                  const abbr = sku.replace("BH.", "").replace(".SV", "");
                  return (
                    <span key={sku} style={{
                      fontSize: 7, fontFamily: mono, padding: "1px 4px", borderRadius: 3,
                      background: node.isShared ? C.accentDim : "rgba(255,255,255,0.04)",
                      color: node.isShared ? C.accent : C.dim,
                      border: `1px solid ${node.isShared ? C.accent + "30" : C.border}`,
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
