import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import TopNav from "@/components/top-nav";

/* ═══════════════════════════════════════════════════════════
   GRISEUS — LINEAGE CANVAS (Palantir SDDI)
   Pure HTML/SVG — no Canvas API dependency
   ═══════════════════════════════════════════════════════════ */

const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.10)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.08)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.08)",
  err: "#ef4444",
  blue: "#60a5fa", purple: "#a78bfa", cyan: "#22d3ee", orange: "#fb923c",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60",
  source: "#fb923c", store: "#60a5fa", engine: "#a78bfa", output: "#34d399", ontology: "#818cf8",
};
const mono = "'Outfit', sans-serif";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── Types ── */
type NodeType = "source" | "store" | "engine" | "output" | "ontology";

interface PNode {
  id: string; label: string; sub?: string; type: NodeType; table?: string;
  col: number; row: number; // grid position
}
interface PEdge { from: string; to: string; label?: string; live?: boolean; }

/* ── Pipeline Blueprint ── */
const NODES: PNode[] = [
  // Sources (col 0)
  { id: "excel_bom",    label: "Excel BOM",        sub: "Reçete İthalatı",      type: "source",  col: 0, row: 0 },
  { id: "excel_sales",  label: "Excel Satış",      sub: "3 Yıllık Satış",       type: "source",  col: 0, row: 1 },
  { id: "excel_stock",  label: "Excel Stok",       sub: "Stok Sayım",           type: "source",  col: 0, row: 2 },
  { id: "manual_entry", label: "Manuel Giriş",     sub: "Stok Hareketi",        type: "source",  col: 0, row: 3 },
  { id: "agent_wb",     label: "Agent Write-back",  sub: "Karar → Veri",        type: "source",  col: 0, row: 4 },
  // Data Stores (col 1)
  { id: "products",    label: "Ürünler",           sub: "products",             type: "store", table: "products",          col: 1, row: 0 },
  { id: "bom_items",   label: "BOM Ağacı",         sub: "bom_items",            type: "store", table: "bom_items",         col: 1, row: 1 },
  { id: "comp_stock",  label: "Bileşen Stok",      sub: "component_stock",      type: "store", table: "component_stock",   col: 1, row: 2 },
  { id: "sales_hist",  label: "Satış Geçmişi",     sub: "sales_history",        type: "store", table: "sales_history",     col: 1, row: 3 },
  { id: "stock_moves", label: "Stok Hareketleri",  sub: "stock_movements_v2",   type: "store", table: "stock_movements_v2", col: 1, row: 4 },
  { id: "season_idx",  label: "Mevsimsel İndeks",  sub: "seasonal_indices",     type: "store", table: "seasonal_indices",   col: 1, row: 5 },
  // Engines (col 2)
  { id: "dse",        label: "DSE",               sub: "Mevsimsellik Motoru",   type: "engine", col: 2, row: 0 },
  { id: "ate",        label: "ATE",               sub: "Adaptif Eşik",         type: "engine", col: 2, row: 1 },
  { id: "intel",      label: "Intelligence",      sub: "Bileşen İstihbarat",   type: "engine", col: 2, row: 2 },
  { id: "impact",     label: "Impact Engine",     sub: "Etki Yayılım",         type: "engine", col: 2, row: 3 },
  { id: "whatif",     label: "What-If",           sub: "Senaryo Simülatör",    type: "engine", col: 2, row: 4 },
  { id: "validation", label: "Validation",        sub: "10 Kural Motoru",      type: "engine", col: 2, row: 5 },
  // Knowledge (col 3)
  { id: "ole", label: "OLE",  sub: "Öğrenme Motoru",     type: "engine", table: "outcome_tracking", col: 3, row: 0 },
  { id: "adm", label: "ADM",  sub: "Agent Hafıza",       type: "engine", table: "agent_memory",     col: 3, row: 1 },
  { id: "tvt", label: "TVT",  sub: "Token Değer Takibi", type: "engine", table: "token_metrics",    col: 3, row: 2 },
  // Outputs (col 4)
  { id: "ceo_agent",   label: "CEO Agent",        sub: "24 Tool · 4 Mod",          type: "output", col: 4, row: 0 },
  { id: "alerts",      label: "Uyarılar",         sub: "validation_alerts",        type: "output", table: "validation_alerts",    col: 4, row: 1 },
  { id: "suggestions", label: "Satın Alma",       sub: "purchase_suggestions",     type: "output", table: "purchase_suggestions", col: 4, row: 2 },
  { id: "plans",       label: "Üretim Planları",  sub: "production_plans",         type: "output", table: "production_plans",     col: 4, row: 3 },
];

const EDGES: PEdge[] = [
  // Sources → Stores
  { from: "excel_bom",    to: "bom_items",   label: "import",    live: true },
  { from: "excel_bom",    to: "products",    label: "import" },
  { from: "excel_sales",  to: "sales_hist",  label: "import",    live: true },
  { from: "excel_stock",  to: "comp_stock",  label: "import",    live: true },
  { from: "manual_entry", to: "stock_moves", label: "create",    live: true },
  { from: "manual_entry", to: "comp_stock",  label: "update" },
  { from: "agent_wb",     to: "stock_moves", label: "writeback" },
  // Stores → Engines
  { from: "sales_hist",  to: "dse",        label: "EWMA",       live: true },
  { from: "dse",         to: "season_idx", label: "indeksler",   live: true },
  { from: "comp_stock",  to: "intel",      label: "stok verisi" },
  { from: "bom_items",   to: "intel",      label: "reçete" },
  { from: "season_idx",  to: "intel",      label: "mevsimsel",   live: true },
  { from: "products",    to: "intel",      label: "ürün bilgi" },
  { from: "intel",       to: "ate",        label: "urgency" },
  { from: "comp_stock",  to: "impact",     label: "stok delta" },
  { from: "stock_moves", to: "impact",     label: "hareket" },
  { from: "intel",       to: "whatif",     label: "kapasite" },
  { from: "season_idx",  to: "whatif",     label: "talep" },
  { from: "ate",         to: "validation", label: "eşikler" },
  { from: "intel",       to: "validation", label: "risk skoru" },
  // Engines → Outputs
  { from: "intel",      to: "ceo_agent",   label: "istihbarat",  live: true },
  { from: "whatif",     to: "ceo_agent",   label: "simülasyon" },
  { from: "impact",     to: "ceo_agent",   label: "etki analiz" },
  { from: "validation", to: "alerts",      label: "uyarı",       live: true },
  { from: "ceo_agent",  to: "suggestions", label: "öneri",       live: true },
  { from: "ceo_agent",  to: "plans",       label: "plan" },
  // Knowledge ↔ Agent
  { from: "ole", to: "ceo_agent", label: "güven" },
  { from: "adm", to: "ceo_agent", label: "hafıza" },
  { from: "tvt", to: "ceo_agent", label: "V/T" },
  { from: "ceo_agent", to: "ole", label: "sonuç" },
  { from: "ceo_agent", to: "adm", label: "embedding" },
  { from: "ceo_agent", to: "tvt", label: "token" },
  // Write-back loop
  { from: "ceo_agent",  to: "agent_wb",   label: "karar",     live: true },
  { from: "stock_moves", to: "comp_stock", label: "güncelle",  live: true },
];

const COL_LABELS = ["VERİ KAYNAKLARI", "VERİ HAVUZLARI", "MOTORLAR", "BİLGİ KATMANI", "ÇIKTILAR"];

/* ── Grid layout calculation ── */
const COL_COUNT = 5;
const NODE_W = 150;
const NODE_H = 52;
const COL_GAP = 30;
const ROW_GAP = 14;

function nodePos(node: PNode, containerW: number) {
  const colW = (containerW - COL_GAP * (COL_COUNT + 1)) / COL_COUNT;
  const x = COL_GAP + node.col * (colW + COL_GAP) + colW / 2;
  const maxRows = [5, 6, 6, 3, 4][node.col] || 6;
  const totalH = maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  const startY = 70;
  const y = startY + node.row * (NODE_H + ROW_GAP) + NODE_H / 2;
  return { x, y, colW };
}

/* ── Main Component ── */
export default function LineagePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [containerW, setContainerW] = useState(900);

  // Measure container
  const measuredRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      const w = el.getBoundingClientRect().width;
      if (w > 100) setContainerW(w);
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          if (e.contentRect.width > 100) setContainerW(e.contentRect.width);
        }
      });
      ro.observe(el);
    }
  }, []);

  // Stats
  const { data: stats } = useQuery<{
    tables: Record<string, { count: number; lastUpdate: string | null }>;
    flows: Array<{ source_type: string; cnt: number }>;
    pipelines: Array<{ name: string; last_status: string }>;
  }>({
    queryKey: ["/api/foundry/lineage/graph/stats"],
    queryFn: () => apiRequest("GET", "/api/foundry/lineage/graph/stats").then(r => r.json()),
    staleTime: 30000,
    retry: false,
  });

  // Node positions map
  const posMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of NODES) {
      const { x, y } = nodePos(n, containerW);
      m.set(n.id, { x, y });
    }
    return m;
  }, [containerW]);

  // Selected node info
  const selectedNode = useMemo(() => NODES.find(n => n.id === selected) || null, [selected]);
  const connections = useMemo(() => {
    if (!selected) return { inn: [] as PEdge[], out: [] as PEdge[] };
    return {
      inn: EDGES.filter(e => e.to === selected),
      out: EDGES.filter(e => e.from === selected),
    };
  }, [selected]);

  // Connected node ids for highlight
  const highlightIds = useMemo(() => {
    const target = hovered || selected;
    if (!target) return new Set<string>();
    const ids = new Set<string>([target]);
    for (const e of EDGES) {
      if (e.from === target) ids.add(e.to);
      if (e.to === target) ids.add(e.from);
    }
    return ids;
  }, [hovered, selected]);

  const totalRecords = useMemo(() => {
    if (!stats?.tables) return 0;
    return Object.values(stats.tables).reduce((s, t) => s + t.count, 0);
  }, [stats]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.white, fontFamily: mono }}>
      <TopNav connected={true} />

      <div style={{ display: "flex", height: "calc(100vh - 48px)" }}>
        {/* ═══ LEFT PANEL ═══ */}
        <div style={{
          width: 280, minWidth: 280, borderRight: `1px solid ${C.border}`, padding: 16,
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1.5 }}>LINEAGE CANVAS</div>
            <div style={{ fontSize: 16, fontWeight: 400, color: C.white, marginTop: 4 }}>Veri Akış Haritası</div>
            <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>Palantir SDDI</div>
          </div>

          {/* Stats */}
          <div style={{ padding: 12, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1, marginBottom: 8 }}>SİSTEM</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "KAYIT", value: stats ? fmt(totalRecords) : "...", color: C.accent },
                { label: "BAĞLANTI", value: String(EDGES.length), color: C.purple },
                { label: "DÜĞÜM", value: String(NODES.length), color: C.blue },
                { label: "AKIŞ", value: stats?.flows ? String(stats.flows.length) : "...", color: C.ok },
              ].map((s, i) => (
                <div key={i} style={{ padding: 6, borderRadius: 6, background: C.bg }}>
                  <div style={{ fontSize: 7, color: C.dim }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 400, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Flow types */}
          {stats?.flows && stats.flows.length > 0 && (
            <div style={{ padding: 12, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1, marginBottom: 6 }}>VERİ AKIŞ TİPLERİ</div>
              {stats.flows.map((f: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 10 }}>
                  <span style={{ color: C.mid }}>{f.source_type}</span>
                  <span style={{ color: C.white }}>{fmt(f.cnt)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Selected node */}
          {selectedNode && (
            <div style={{
              padding: 12, borderRadius: 10,
              background: C[selectedNode.type] + "08",
              border: `1px solid ${C[selectedNode.type]}25`,
            }}>
              <div style={{ fontSize: 8, color: C[selectedNode.type], letterSpacing: 1, marginBottom: 6 }}>SEÇİLİ DÜĞÜM</div>
              <div style={{ fontSize: 14, fontWeight: 400 }}>{selectedNode.label}</div>
              <div style={{ fontSize: 10, color: C.dim }}>{selectedNode.sub}</div>

              {selectedNode.table && stats?.tables[selectedNode.table] && (
                <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: C.bg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: C.dim }}>Kayıt</span>
                    <span style={{ color: C.white }}>{fmt(stats.tables[selectedNode.table].count)}</span>
                  </div>
                </div>
              )}

              {connections.inn.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 1, marginBottom: 3 }}>GELEN ({connections.inn.length})</div>
                  {connections.inn.map((e, i) => {
                    const from = NODES.find(n => n.id === e.from);
                    return <div key={i} style={{ fontSize: 9, color: C.mid }}><span style={{ color: C[from?.type || "store"] }}>{from?.label}</span> {e.label && `(${e.label})`}</div>;
                  })}
                </div>
              )}
              {connections.out.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: 1, marginBottom: 3 }}>GİDEN ({connections.out.length})</div>
                  {connections.out.map((e, i) => {
                    const to = NODES.find(n => n.id === e.to);
                    return <div key={i} style={{ fontSize: 9, color: C.mid }}><span style={{ color: C[to?.type || "store"] }}>{to?.label}</span> {e.label && `(${e.label})`}</div>;
                  })}
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 8, color: C.dim, marginTop: "auto" }}>
            Düğüme tıkla: detay gör
          </div>
        </div>

        {/* ═══ RIGHT: Pipeline Graph ═══ */}
        <div ref={measuredRef} style={{ flex: 1, position: "relative", overflow: "auto" }}>
          {/* Column headers */}
          <div style={{ display: "flex", padding: "12px 0", position: "sticky", top: 0, zIndex: 5, background: C.bg }}>
            {COL_LABELS.map((label, i) => {
              const colW = (containerW - COL_GAP * (COL_COUNT + 1)) / COL_COUNT;
              const left = COL_GAP + i * (colW + COL_GAP);
              return (
                <div key={i} style={{
                  position: "absolute", left, width: colW,
                  textAlign: "center", fontSize: 9, color: C.dim, letterSpacing: 1,
                }}>
                  {label}
                </div>
              );
            })}
          </div>

          {/* SVG edges */}
          <svg style={{
            position: "absolute", top: 0, left: 0,
            width: containerW, height: 600,
            pointerEvents: "none", zIndex: 1,
          }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 3 L 0 6 z" fill="rgba(255,255,255,0.15)" />
              </marker>
              <marker id="arrow-hi" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 3 L 0 6 z" fill={C.accent} />
              </marker>
            </defs>
            {EDGES.map((edge, i) => {
              const fp = posMap.get(edge.from);
              const tp = posMap.get(edge.to);
              if (!fp || !tp) return null;
              const isHi = highlightIds.has(edge.from) && highlightIds.has(edge.to);
              // Bezier curve
              const mx = (fp.x + tp.x) / 2;
              const my = (fp.y + tp.y) / 2;
              const dx = tp.x - fp.x;
              const dy = tp.y - fp.y;
              const cpx = mx - dy * 0.08;
              const cpy = my + dx * 0.08;
              return (
                <g key={i}>
                  <path
                    d={`M ${fp.x} ${fp.y} Q ${cpx} ${cpy} ${tp.x} ${tp.y}`}
                    fill="none"
                    stroke={isHi ? C.accent + "50" : "rgba(255,255,255,0.06)"}
                    strokeWidth={isHi ? 1.5 : 0.7}
                    markerEnd={isHi ? "url(#arrow-hi)" : "url(#arrow)"}
                  />
                  {/* Animated dot for live edges */}
                  {(edge.live || isHi) && (
                    <circle r="3" fill={isHi ? C.accent : C.ok} opacity="0.7">
                      <animateMotion
                        dur={`${2 + i % 3}s`}
                        repeatCount="indefinite"
                        path={`M ${fp.x} ${fp.y} Q ${cpx} ${cpy} ${tp.x} ${tp.y}`}
                      />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Node cards */}
          {NODES.map(node => {
            const pos = posMap.get(node.id);
            if (!pos) return null;
            const color = C[node.type];
            const isHi = highlightIds.has(node.id);
            const isSel = selected === node.id;
            const count = node.table ? (stats?.tables[node.table]?.count ?? 0) : 0;
            return (
              <div
                key={node.id}
                onClick={() => setSelected(prev => prev === node.id ? null : node.id)}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: "absolute",
                  left: pos.x - NODE_W / 2,
                  top: pos.y - NODE_H / 2,
                  width: NODE_W,
                  height: NODE_H,
                  borderRadius: node.type === "engine" ? 16 : node.type === "ontology" ? 24 : 10,
                  background: isHi ? color + "15" : color + "08",
                  border: `1px solid ${isSel ? color : isHi ? color + "50" : color + "20"}`,
                  cursor: "pointer",
                  zIndex: 2,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease",
                  boxShadow: isSel ? `0 0 20px ${color}30` : "none",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 500, color, lineHeight: 1.2 }}>{node.label}</div>
                {node.sub && <div style={{ fontSize: 8, color: C.dim, marginTop: 1 }}>{node.sub}</div>}
                {/* Record count badge */}
                {count != null && count > 0 && (
                  <div style={{
                    position: "absolute", top: -8, right: -4,
                    padding: "1px 6px", borderRadius: 8, fontSize: 8, fontWeight: 600,
                    background: color + "25", color, border: `1px solid ${color}40`,
                  }}>
                    {fmt(count)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Title */}
          <div style={{
            position: "absolute", bottom: 12, left: 16,
            fontSize: 8, color: C.dim, letterSpacing: 1, zIndex: 3,
          }}>
            GRISEUS SDDI — SOFTWARE DEFINED DATA INTEGRATION
          </div>
        </div>
      </div>
    </div>
  );
}
