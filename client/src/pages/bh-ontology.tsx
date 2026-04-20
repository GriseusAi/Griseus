import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";

/* ═══════════════════════════════════════════════════════════
   BH ONTOLOGY CANVAS — Varlık Felsefesi
   4 BH cihazını yan yana, bileşenleri aşağıda, paylaşımlı
   bileşenler cross-link ile octopus deseni. Node'lar serbest
   sürüklenir, stok anında değiştirilir, SORUNLAR canlı vurgulanır.
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

interface GraphNode {
  id: string;        // sku for device, code for component
  kind: "device" | "component" | "subassembly";
  label: string;
  sublabel: string;
  sku?: string;      // device
  code?: string;     // component/subassembly
  usedBy: string[];  // device SKUs using this component
  currentStock?: number;
  status?: Status;
  maxProducible?: number;
  isBottleneck?: boolean;
  isShared?: boolean;
  unit?: string;
}

interface GraphLink {
  from: string; to: string; required: number; tier: number;
}

const LAYOUT_KEY = "bh-ontology-layout-v1";
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

/* ── Default layout — 4 BH yukarıda grid, bileşenler aşağıda grid ── */
function defaultLayout(nodes: GraphNode[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const devices = nodes.filter(n => n.kind === "device");
  const others = nodes.filter(n => n.kind !== "device");

  // 4 device satırda yan yana (gruplanmış: 50'ler solda, 55'ler sağda)
  const sortedDev = [...devices].sort((a, b) => {
    // 50'ler önce
    const a50 = a.sku!.includes("50") ? 0 : 1;
    const b50 = b.sku!.includes("50") ? 0 : 1;
    if (a50 !== b50) return a50 - b50;
    // ST önce UT sonra
    return a.sku!.localeCompare(b.sku!);
  });
  const devY = 80;
  const devSpacing = CANVAS_W / (sortedDev.length + 1);
  sortedDev.forEach((d, i) => { pos[d.id] = { x: devSpacing * (i + 1), y: devY }; });

  // Paylaşımlı bileşenler ortada yüksek, tek-kullanımlılar ilgili cihaz altında
  const shared = others.filter(n => n.isShared);
  const unique = others.filter(n => !n.isShared);

  // Shared row: 4 device'ın ortasındaki yatay eksende
  const sharedY = 280;
  const sharedCols = Math.max(1, Math.ceil(shared.length / 2));
  const sharedSpacing = CANVAS_W / (sharedCols + 1);
  shared.forEach((n, i) => {
    const col = i % sharedCols;
    const row = Math.floor(i / sharedCols);
    pos[n.id] = { x: sharedSpacing * (col + 1), y: sharedY + row * 120 };
  });

  // Unique: her device'ın altında o device'a özgü bileşenler
  const skuToUnique: Record<string, GraphNode[]> = {};
  for (const n of unique) {
    if (n.usedBy.length === 1) {
      const s = n.usedBy[0];
      (skuToUnique[s] = skuToUnique[s] || []).push(n);
    } else {
      // edge case: 0 usedBy (orphan) — sağ kenara at
      (skuToUnique["_orphan"] = skuToUnique["_orphan"] || []).push(n);
    }
  }
  sortedDev.forEach((d, di) => {
    const list = skuToUnique[d.sku!] || [];
    const baseX = devSpacing * (di + 1) - 160;
    const baseY = 550;
    list.forEach((n, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      pos[n.id] = { x: baseX + col * 110, y: baseY + row * 110 };
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

  /* ── 4 BH BOM + capacity parallel fetch ── */
  const bomQueries = BH_SKUS.map(sku =>
    useQuery<BomResponse>({ queryKey: [`/api/bom/${sku}/stock`] })
  );
  const capQueries = BH_SKUS.map(sku =>
    useQuery<Capacity>({ queryKey: [`/api/bom/${sku}/production-capacity`] })
  );
  const allLoaded = bomQueries.every(q => q.data) && capQueries.every(q => q.data);

  /* ── Graph model build ── */
  const { nodes, links } = useMemo(() => {
    if (!allLoaded) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };

    const nodeMap: Map<string, GraphNode> = new Map();
    const linkList: GraphLink[] = [];

    // 4 device node
    BH_SKUS.forEach((sku, i) => {
      const cap = capQueries[i].data!;
      const bt = cap.bottlenecks[0];
      nodeMap.set(sku, {
        id: sku, kind: "device", label: sku,
        sublabel: `max ${fmt(cap.maxProducible)} adet`,
        sku, usedBy: [], maxProducible: cap.maxProducible,
      });
      // bottleneck code'u daha sonra işaretlenecek
      (nodeMap.get(sku) as any)._btCode = bt?.code;
    });

    // Bileşen node'lar + link'ler (sadece tier 1 + sub-assembly roots)
    BH_SKUS.forEach((sku, i) => {
      const comps = bomQueries[i].data!.components;
      const tier1 = comps.filter(c => c.tier === 1);
      for (const c of tier1) {
        let n = nodeMap.get(c.code);
        if (!n) {
          n = {
            id: c.code, kind: c.isSubAssembly ? "subassembly" : "component",
            label: c.code, sublabel: c.name,
            code: c.code, usedBy: [],
            currentStock: c.currentStock, status: c.status,
            unit: c.unit,
          };
          nodeMap.set(c.code, n);
        }
        if (!n.usedBy.includes(sku)) n.usedBy.push(sku);
        linkList.push({ from: sku, to: c.code, required: c.requiredPerUnit, tier: 1 });
      }
    });

    // Shared flag + bottleneck flag
    const bottleneckCodes = new Set<string>();
    BH_SKUS.forEach((sku, i) => {
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
  }, [allLoaded, bomQueries, capQueries]);

  /* ── Layout state ── */
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    if (!allLoaded || nodes.length === 0) return;
    const saved = loadLayout();
    const defaults = defaultLayout(nodes);
    // Saved sadece var olan node'lar için uygulansın
    const merged: Record<string, { x: number; y: number }> = { ...defaults };
    for (const n of nodes) {
      if (saved[n.id]) merged[n.id] = saved[n.id];
    }
    setPositions(merged);
  }, [allLoaded, nodes.length]);

  /* ── Drag state ── */
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
    const inv = ctm.inverse();
    const res = pt.matrixTransform(inv);
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
    setPositions(prev => {
      const next = { ...prev, [dragId]: { x: x - dragOffsetRef.current.dx, y: y - dragOffsetRef.current.dy } };
      return next;
    });
  }, [dragId, toSvgCoords]);

  const handlePointerUp = useCallback(() => {
    if (dragId) {
      setDragId(null);
      saveLayout(positions);
    }
  }, [dragId, positions]);

  /* ── Inline stock edit ── */
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
    if (!isNaN(v) && v >= 0) {
      stockMutation.mutate({ code: node.id, stock: v, unit: node.unit || "AD" });
    }
    setEditingCode(null);
  };

  /* ── WS live refresh ── */
  const handleStockUpdate = useCallback(() => {
    BH_SKUS.forEach(sku => {
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/stock`] });
      qc.invalidateQueries({ queryKey: [`/api/bom/${sku}/production-capacity`] });
    });
  }, [qc]);
  const { connected } = useStockWebSocket(handleStockUpdate, () => {}, () => {});

  /* ── Layout reset ── */
  const resetLayout = () => {
    localStorage.removeItem(LAYOUT_KEY);
    setPositions(defaultLayout(nodes));
  };

  /* ── Viewport pan/zoom (basit) ── */
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

  /* ── Count problemler ── */
  const problemCount = useMemo(() => {
    const critical = nodes.filter(n => n.kind !== "device" && n.status === "critical").length;
    const warning = nodes.filter(n => n.kind !== "device" && n.status === "warning").length;
    const bottlenecks = nodes.filter(n => n.isBottleneck).length;
    const shared = nodes.filter(n => n.isShared).length;
    return { critical, warning, bottlenecks, shared };
  }, [nodes]);

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: mono, overflow: "hidden" }}>
      <TopNav connected={connected} />

      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 2, fontWeight: 400 }}>◈ BH GRUBU ONTOLOJİ</div>
          <div style={{ fontSize: 18, color: C.white, marginTop: 2 }}>Varlık Felsefesi — 4 Cihaz · Atom Zinciri</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
            Tıkla → stok değiştir · Sürükle → konum · Scroll → zoom · Arka plan sürükle → pan
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Stat label="KRİTİK" value={problemCount.critical} color={C.err} />
          <Stat label="DÜŞÜK" value={problemCount.warning} color={C.warn} />
          <Stat label="DARBOĞAZ" value={problemCount.bottlenecks} color={C.err} />
          <Stat label="PAYLAŞIMLI" value={problemCount.shared} color={C.accent} />
          <button onClick={resetLayout} style={{
            padding: "6px 12px", borderRadius: 6, cursor: "pointer",
            background: C.surface, border: `1px solid ${C.border}`, color: C.mid, fontSize: 11, fontFamily: mono,
          }}>Layout Sıfırla</button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ width: "100%", height: "calc(100vh - 130px)", position: "relative", cursor: panStart ? "grabbing" : "grab" }}>
        {!allLoaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim }}>
            4 BH cihazının BOM + kapasite verisi yükleniyor…
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
          {/* Grid pattern */}
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

          {/* Links */}
          {links.map((l, i) => {
            const pa = positions[l.from];
            const pb = positions[l.to];
            if (!pa || !pb) return null;
            const nodeTo = nodes.find(n => n.id === l.to);
            const isProb = nodeTo?.status === "critical" || nodeTo?.isBottleneck;
            const stroke = isProb ? C.err : (nodeTo?.isShared ? C.accent : C.border);
            const opacity = isProb ? 0.7 : 0.35;
            const midX = (pa.x + pb.x) / 2;
            const midY = (pa.y + pb.y) / 2;
            const curve = `M ${pa.x} ${pa.y + 30} Q ${midX} ${midY} ${pb.x} ${pb.y - 30}`;
            return (
              <path key={i} d={curve} fill="none" stroke={stroke} strokeWidth={isProb ? 1.8 : 1} strokeDasharray={nodeTo?.isShared ? "0" : "3 3"} opacity={opacity} />
            );
          })}

          {/* Nodes */}
          {nodes.map(n => {
            const p = positions[n.id];
            if (!p) return null;
            return (
              <NodeView
                key={n.id} node={n} x={p.x} y={p.y}
                editing={editingCode === n.id} editVal={editVal}
                onPointerDown={(e) => handlePointerDown(e, n.id)}
                onStartEdit={() => {
                  if (n.kind === "device") return;
                  setEditingCode(n.id);
                  setEditVal(String(n.currentStock ?? 0));
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

/* ── Stat pill ── */
function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, color, fontFamily: mono, fontWeight: 400 }}>{value}</div>
    </div>
  );
}

/* ── Node view (device / component / sub-assembly) ── */
function NodeView({
  node, x, y, editing, editVal,
  onPointerDown, onStartEdit, onEditChange, onSaveEdit, onCancelEdit, saving,
}: {
  node: GraphNode; x: number; y: number;
  editing: boolean; editVal: string;
  onPointerDown: (e: React.PointerEvent) => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  saving: boolean;
}) {
  const col = statusColor(node.status, node.isBottleneck);
  const isDevice = node.kind === "device";
  const isSub = node.kind === "subassembly";
  const w = isDevice ? 180 : 170;
  const h = isDevice ? 64 : 72;

  return (
    <g transform={`translate(${x - w/2}, ${y - h/2})`} style={{ cursor: "grab" }}>
      {/* Bottleneck halo */}
      {node.isBottleneck && (
        <rect x={-6} y={-6} width={w+12} height={h+12} rx={14}
          fill="none" stroke={C.err} strokeWidth={2} opacity={0.5}
          filter="url(#glow)">
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite"/>
        </rect>
      )}
      {/* Shared indicator — çift çerçeve */}
      {node.isShared && !isDevice && (
        <rect x={-3} y={-3} width={w+6} height={h+6} rx={10}
          fill="none" stroke={C.accent} strokeWidth={1} opacity={0.5} strokeDasharray="4 2"/>
      )}

      <rect
        width={w} height={h} rx={8}
        fill={isDevice ? "#111118" : col.bg}
        stroke={isDevice ? C.accent : col.border}
        strokeWidth={isDevice ? 2 : 1.5}
        onPointerDown={onPointerDown}
      />

      {/* Device node */}
      {isDevice && (
        <>
          <text x={w/2} y={24} textAnchor="middle" fill={C.white} fontSize={14} fontFamily={mono} fontWeight={500}>
            {node.label}
          </text>
          <text x={w/2} y={44} textAnchor="middle" fill={C.accent} fontSize={10} fontFamily={mono}>
            {node.sublabel}
          </text>
        </>
      )}

      {/* Component/subassembly node */}
      {!isDevice && (
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

          {/* Name */}
          <foreignObject x={8} y={22} width={w - 16} height={18}>
            <div style={{ fontSize: 9, color: C.dim, fontFamily: mono, lineHeight: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.sublabel}
            </div>
          </foreignObject>

          {/* Stock (editable) */}
          {editing ? (
            <foreignObject x={8} y={42} width={w - 16} height={26}>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }} onPointerDown={e => e.stopPropagation()}>
                <input
                  autoFocus type="number" value={editVal}
                  onChange={e => onEditChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") onSaveEdit();
                    else if (e.key === "Escape") onCancelEdit();
                  }}
                  disabled={saving}
                  style={{
                    width: 70, fontSize: 12, fontFamily: mono, color: col.fg,
                    background: "rgba(0,0,0,0.5)", border: `1px solid ${col.fg}60`,
                    borderRadius: 4, padding: "2px 4px", outline: "none",
                  }}
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
              <text x={8} y={58} fill={col.fg} fontSize={16} fontFamily={mono} fontWeight={500}>
                {fmt(node.currentStock ?? 0)}
              </text>
              <text x={58} y={58} fill={C.dim} fontSize={9} fontFamily={mono}>
                {node.unit || "AD"} ✎
              </text>
              <text x={w - 8} y={58} textAnchor="end" fill={col.fg} fontSize={8} fontFamily={mono} opacity={0.8}>
                {statusLabel(node.status)}
              </text>
            </g>
          )}

          {/* usedBy badges — hangi cihazlar kullanıyor */}
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
