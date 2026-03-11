import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

/* ── Fonts ── */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

/* ── Palette ── */
const C = {
  bg: "#08080c",
  card: "rgba(255,255,255,0.02)",
  cardBorder: "rgba(255,255,255,0.06)",
  facility: "#34d399",
  line: "#818cf8",
  worker: "#fbbf24",
  operation: "#f472b6",
  product: "#a78bfa",
  schedule: "#fb923c",
  capacity: "#38bdf8",
  kpi: "#f87171",
  white: "#fff",
  mid: "#888",
  dim: "#555",
};
const mono = "'JetBrains Mono', monospace";
const sans = "'Outfit', sans-serif";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── Types ── */
type NodeKey = "facility" | "elektrikli" | "gazli" | "worker" | "operation" | "product" | "schedule" | "capacity" | "kpi";

interface NodeDef {
  key: NodeKey;
  label: string;
  sub: string;
  color: string;
  x: number;
  y: number;
  count?: number;
}

interface Edge {
  from: NodeKey;
  to: NodeKey;
  label: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   DETAIL PANELS
   ═══════════════════════════════════════════════════════════════════════ */

function FacilityDetail({ data }: { data: any }) {
  if (!data) return <PanelLoading />;
  const f = data[0];
  return (
    <div>
      <PanelTitle color={C.facility}>Tesis Detayı</PanelTitle>
      <KV label="Ad" value={f?.name} />
      <KV label="Lokasyon" value={f?.location} />
      <KV label="Tip" value={f?.type} />
      <KV label="Status" value={f?.status} />
    </div>
  );
}

function LineDetail({ data }: { data: any[] | null }) {
  if (!data) return <PanelLoading />;
  return (
    <div>
      <PanelTitle color={C.line}>Üretim Hatları</PanelTitle>
      {data.map((l: any) => (
        <div key={l.id} style={{ marginBottom: 16, padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 6 }}>{l.name}</div>
          <KV label="Tip" value={l.type} />
          <KV label="Çalışan" value={l.workerCount} />
          <KV label="Teorik birim süre" value={`${l.capacityUnitTimeMin} dk`} />
          <KV label="Mevcut birim süre" value={`${l.currentUnitTimeMin} dk`} />
        </div>
      ))}
    </div>
  );
}

function WorkerDetail({ data }: { data: any[] | null }) {
  if (!data) return <PanelLoading />;
  const sorted = [...data].sort((a, b) => (b.capabilities?.length || 0) - (a.capabilities?.length || 0));
  return (
    <div>
      <PanelTitle color={C.worker}>Personel ({data.length})</PanelTitle>
      <div style={{ fontSize: 12, color: C.mid, marginBottom: 12 }}>En yüksek yetkili ilk 10</div>
      {sorted.slice(0, 10).map((w: any) => (
        <div key={w.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.white }}>{w.name}</div>
            <div style={{ fontSize: 11, color: C.dim }}>{w.department}</div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 12, color: C.worker }}>{w.capabilities?.length || 0} yetki</div>
        </div>
      ))}
    </div>
  );
}

function OperationDetail({ ops }: { ops: any[] | null }) {
  if (!ops) return <PanelLoading />;
  const totalE = ops.filter((o: any) => o.lineId === 1).reduce((s: number, o: any) => s + (o.actualQty || 0), 0);
  const totalG = ops.filter((o: any) => o.lineId === 2).reduce((s: number, o: any) => s + (o.actualQty || 0), 0);

  const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const monthly = monthNames.map((ay, i) => {
    const m = String(i + 1).padStart(2, "0");
    const e = ops.filter((o: any) => o.lineId === 1 && o.plannedDate?.includes(`-${m}-`)).reduce((s: number, o: any) => s + (o.actualQty || 0), 0);
    const g = ops.filter((o: any) => o.lineId === 2 && o.plannedDate?.includes(`-${m}-`)).reduce((s: number, o: any) => s + (o.actualQty || 0), 0);
    return { ay, e, g };
  }).filter((d) => d.e > 0 || d.g > 0);

  return (
    <div>
      <PanelTitle color={C.operation}>Operasyonlar ({ops.length})</PanelTitle>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <Stat label="Elektrikli" value={fmt(totalE)} color={C.line} />
        <Stat label="Gazlı" value={fmt(totalG)} color={C.operation} />
        <Stat label="Toplam" value={fmt(totalE + totalG)} color={C.white} />
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer>
          <BarChart data={monthly} barGap={1}>
            <XAxis dataKey="ay" tick={{ fill: C.dim, fontSize: 9, fontFamily: sans }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.dim, fontSize: 9, fontFamily: mono }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8, fontSize: 11, fontFamily: sans }} />
            <Bar dataKey="e" name="Elektrikli" fill={C.line} radius={[2, 2, 0, 0]} />
            <Bar dataKey="g" name="Gazlı" fill={C.operation} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ScheduleDetail({ scheds }: { scheds: any[] | null }) {
  if (!scheds) return <PanelLoading />;
  const deviations = scheds.map((s: any) => {
    const p = s.plannedQty || 0;
    const a = s.actualQty || 0;
    return p > 0 ? Math.round(((a - p) / p) * 100) : 0;
  });
  const avg = deviations.length > 0 ? Math.round(deviations.reduce((s, d) => s + d, 0) / deviations.length) : 0;
  const worst = scheds.reduce((w: any, s: any) => {
    const p = s.plannedQty || 0;
    const a = s.actualQty || 0;
    const dev = p > 0 ? ((a - p) / p) * 100 : 0;
    return dev < (w.dev || 0) ? { week: s.periodValue, dev: Math.round(dev) } : w;
  }, { week: "-", dev: 0 });

  return (
    <div>
      <PanelTitle color={C.schedule}>Çizelgeler ({scheds.length})</PanelTitle>
      <KV label="Toplam hafta" value={scheds.length} />
      <KV label="Ortalama sapma" value={`${avg}%`} />
      <KV label="En kötü hafta" value={`${worst.week} (${worst.dev}%)`} />
    </div>
  );
}

function CapacityDetail({ caps }: { caps: any[] | null }) {
  if (!caps) return <PanelLoading />;
  return (
    <div>
      <PanelTitle color={C.capacity}>Kapasite Metrikleri</PanelTitle>
      {caps.map((c: any, i: number) => (
        <div key={i} style={{ marginBottom: 14, padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10 }}>
          <KV label="Hat" value={c.lineId === 1 ? "Elektrikli" : "Gazlı"} />
          <KV label="Teorik Max" value={fmt(c.theoreticalMax)} />
          <KV label="Gerçek Üretim" value={fmt(c.actualOutput)} />
          <KV label="Kullanım" value={`%${c.utilizationPct}`} />
        </div>
      ))}
    </div>
  );
}

function ProductDetail({ count }: { count: number }) {
  return (
    <div>
      <PanelTitle color={C.product}>Ürünler</PanelTitle>
      <KV label="Toplam SKU" value={count} />
      <KV label="Kategoriler" value="Elektrikli + Gazlı" />
    </div>
  );
}

function KpiDetail() {
  return (
    <div>
      <PanelTitle color={C.kpi}>KPI Tanımları</PanelTitle>
      <div style={{ fontSize: 13, color: C.dim, padding: "20px 0", textAlign: "center" }}>
        Henüz KPI tanımlanmadı. Katman 05'te aktif olacak.
      </div>
    </div>
  );
}

/* ── Helpers ── */
function PanelTitle({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
      <span style={{ fontSize: 15, fontWeight: 600, color: C.white, fontFamily: sans }}>{children}</span>
    </div>
  );
}
function KV({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
      <span style={{ color: C.mid }}>{label}</span>
      <span style={{ color: C.white, fontFamily: mono, fontWeight: 500 }}>{value}</span>
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
function PanelLoading() {
  return <div style={{ fontSize: 13, color: C.dim, padding: 20, textAlign: "center" }}>Yükleniyor...</div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG NODE COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

function OntologyNode({ node, active, hovered, onHover, onLeave, onClick, delay }: {
  node: NodeDef; active: boolean; hovered: boolean;
  onHover: () => void; onLeave: () => void; onClick: () => void; delay: number;
}) {
  const w = 130, h = 58, rx = 12;
  const glowId = `glow-${node.key}`;
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: "pointer" }}
      onMouseEnter={onHover} onMouseLeave={onLeave} onClick={onClick}
    >
      <defs>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Glow background */}
      {(hovered || active) && (
        <rect x={-w / 2 - 4} y={-h / 2 - 4} width={w + 8} height={h + 8} rx={rx + 2}
          fill={node.color} opacity={0.06} style={{ filter: `blur(8px)` }} />
      )}

      {/* Main rect */}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx}
        fill={`${node.color}0a`}
        stroke={active ? node.color : hovered ? `${node.color}88` : `${node.color}33`}
        strokeWidth={active ? 2 : 1}
        style={{ transition: "all 0.25s ease" }}
      />

      {/* Pulse for loading */}
      {node.count === undefined && (
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill="none" stroke={node.color} strokeWidth={1} opacity={0.3}>
          <animate attributeName="opacity" values="0.3;0.08;0.3" dur="1.5s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Label */}
      <text x={0} y={-4} textAnchor="middle" fill={C.white} fontSize={12} fontWeight={600} fontFamily="Outfit, sans-serif">
        {node.label}
      </text>
      {/* Sub */}
      <text x={0} y={14} textAnchor="middle" fill={C.mid} fontSize={10} fontFamily="JetBrains Mono, monospace">
        {node.sub}
      </text>

      {/* Fade-in animation */}
      <animateTransform attributeName="transform" type="translate" from={`${node.x} ${node.y + 15}`} to={`${node.x} ${node.y}`} dur="0.5s" begin={`${delay}s`} fill="freeze" />
      <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin={`${delay}s`} fill="freeze" />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG EDGE COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

function OntologyEdge({ x1, y1, x2, y2, color, label, delay }: {
  x1: number; y1: number; x2: number; y2: number; color: string; label: string; delay: number;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const cx = mx + (y2 - y1) * 0.15;
  const cy = my - (x2 - x1) * 0.15;
  const pathD = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 1.2;

  // Arrow at 80% of path
  const t = 0.8;
  const ax = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
  const ay = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;

  return (
    <g>
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} opacity={0.2}
        strokeDasharray={len} strokeDashoffset={len}
        style={{ transition: "opacity 0.3s" }}
      >
        <animate attributeName="stroke-dashoffset" from={len} to={0} dur="0.8s" begin={`${delay}s`} fill="freeze" />
      </path>
      {/* Arrow dot */}
      <circle cx={ax} cy={ay} r={3} fill={color} opacity={0.4}>
        <animate attributeName="opacity" from="0" to="0.4" dur="0.3s" begin={`${delay + 0.6}s`} fill="freeze" />
      </circle>
      {/* Label */}
      <text x={mx + (y2 - y1) * 0.06} y={my - (x2 - x1) * 0.06 - 6} textAnchor="middle"
        fill={color} opacity={0.35} fontSize={8} fontFamily="JetBrains Mono, monospace" letterSpacing="0.04em"
      >
        <animate attributeName="opacity" from="0" to="0.35" dur="0.3s" begin={`${delay + 0.5}s`} fill="freeze" />
        {label}
      </text>
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════ */

export default function OntologyMap() {
  const [, navigate] = useLocation();
  const [activeNode, setActiveNode] = useState<NodeKey | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeKey | null>(null);

  // API data caches
  const [facilitiesData, setFacilitiesData] = useState<any>(null);
  const [linesData, setLinesData] = useState<any[]| null>(null);
  const [workersData, setWorkersData] = useState<any[] | null>(null);
  const [opsData, setOpsData] = useState<any[] | null>(null);
  const [schedsData, setSchedsData] = useState<any[] | null>(null);
  const [capsData, setCapsData] = useState<any[] | null>(null);
  const [productCount, setProductCount] = useState<number>(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Load fonts
  useEffect(() => {
    if (!document.querySelector('link[href*="Outfit"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  // Fetch summary counts on mount
  useEffect(() => {
    fetch("/api/v1/dashboard/summary").then((r) => r.json()).then((d) => {
      const totalOps = (d.monthlyData || []).reduce((s: number, m: any) => s + m.e + m.g, 0);
      const totalScheds = (d.weeklySchedules?.elektrikli?.length || 0) + (d.weeklySchedules?.gazli?.length || 0);
      setCounts({
        facility: 1,
        workers: 16,
        operations: d.monthlyData?.length ? 24 : 0,
        products: 21,
        schedules: totalScheds,
        capacity: d.capacityMetrics?.length || 0,
        kpi: 0,
        totalProduction: d.totalProduction || 0,
      });
    }).catch(() => {});
    // Also fetch workers for count
    fetch("/api/v1/workers").then((r) => r.json()).then((d) => {
      setWorkersData(d);
      setCounts((prev) => ({ ...prev, workers: d.length }));
    }).catch(() => {});
  }, []);

  // Fetch detail when node clicked
  const fetchDetail = useCallback((key: NodeKey) => {
    switch (key) {
      case "facility":
        if (!facilitiesData) fetch("/api/v1/facilities").then((r) => r.json()).then(setFacilitiesData).catch(() => {});
        break;
      case "elektrikli":
      case "gazli":
        if (!linesData) fetch("/api/v1/facilities/1/lines").then((r) => r.json()).then(setLinesData).catch(() => {});
        break;
      case "worker":
        if (!workersData) fetch("/api/v1/workers").then((r) => r.json()).then(setWorkersData).catch(() => {});
        break;
      case "operation":
        if (!opsData) {
          Promise.all([
            fetch("/api/v1/lines/1/operations").then((r) => r.json()),
            fetch("/api/v1/lines/2/operations").then((r) => r.json()),
          ]).then(([e, g]) => setOpsData([...e, ...g])).catch(() => {});
        }
        break;
      case "product":
        setProductCount(counts.products || 21);
        break;
      case "schedule":
        if (!schedsData) {
          Promise.all([
            fetch("/api/v1/schedules?line_id=1").then((r) => r.json()),
            fetch("/api/v1/schedules?line_id=2").then((r) => r.json()),
          ]).then(([e, g]) => setSchedsData([...e, ...g])).catch(() => {});
        }
        break;
      case "capacity":
        if (!capsData) {
          Promise.all([
            fetch("/api/v1/lines/1/capacity").then((r) => r.json()),
            fetch("/api/v1/lines/2/capacity").then((r) => r.json()),
          ]).then(([e, g]) => setCapsData([...e, ...g])).catch(() => {});
        }
        break;
    }
  }, [facilitiesData, linesData, workersData, opsData, schedsData, capsData, counts.products]);

  const handleNodeClick = (key: NodeKey) => {
    setActiveNode((prev) => (prev === key ? null : key));
    fetchDetail(key);
  };

  // Node definitions with live counts
  const nodes: NodeDef[] = [
    { key: "facility", label: "Çukurova Isı Fabrikası", sub: "Gebze, Kocaeli", color: C.facility, x: 0, y: 0, count: counts.facility },
    { key: "elektrikli", label: "Elektrikli Hat", sub: "7 çalışan · %64", color: C.line, x: -200, y: 120, count: 1 },
    { key: "gazli", label: "Gazlı Hat", sub: "9 çalışan · %87", color: C.line, x: 200, y: 120, count: 1 },
    { key: "worker", label: `${counts.workers || "..."} Çalışan`, sub: "6 departman", color: C.worker, x: 0, y: -130, count: counts.workers },
    { key: "operation", label: `${counts.operations || "..."} Operasyon`, sub: "2025 üretim", color: C.operation, x: -300, y: 260, count: counts.operations },
    { key: "product", label: `${counts.products || "..."} Ürün`, sub: "Elektrikli + Gazlı", color: C.product, x: 0, y: 260, count: counts.products },
    { key: "schedule", label: `${counts.schedules || "..."} Çizelge`, sub: "Haftalık plan/gerçek", color: C.schedule, x: 300, y: 260, count: counts.schedules },
    { key: "capacity", label: `${counts.capacity || "..."} Kapasite`, sub: "%64 / %87 kullanım", color: C.capacity, x: 340, y: 40, count: counts.capacity },
    { key: "kpi", label: "0 KPI", sub: "Henüz tanımlanmadı", color: C.kpi, x: -340, y: -40, count: 0 },
  ];

  const edges: (Edge & { x1: number; y1: number; x2: number; y2: number; color: string })[] = [
    { from: "facility", to: "elektrikli", label: "has_line", x1: 0, y1: 0, x2: -200, y2: 120, color: C.facility },
    { from: "facility", to: "gazli", label: "has_line", x1: 0, y1: 0, x2: 200, y2: 120, color: C.facility },
    { from: "facility", to: "worker", label: "employs", x1: 0, y1: 0, x2: 0, y2: -130, color: C.worker },
    { from: "facility", to: "kpi", label: "tracks", x1: 0, y1: 0, x2: -340, y2: -40, color: C.kpi },
    { from: "facility", to: "capacity", label: "monitors", x1: 0, y1: 0, x2: 340, y2: 40, color: C.capacity },
    { from: "elektrikli", to: "operation", label: "produces", x1: -200, y1: 120, x2: -300, y2: 260, color: C.operation },
    { from: "gazli", to: "schedule", label: "scheduled", x1: 200, y1: 120, x2: 300, y2: 260, color: C.schedule },
    { from: "elektrikli", to: "product", label: "makes", x1: -200, y1: 120, x2: 0, y2: 260, color: C.product },
    { from: "gazli", to: "product", label: "makes", x1: 200, y1: 120, x2: 0, y2: 260, color: C.product },
  ];

  const renderDetailPanel = () => {
    if (!activeNode) return null;
    switch (activeNode) {
      case "facility": return <FacilityDetail data={facilitiesData} />;
      case "elektrikli":
      case "gazli": return <LineDetail data={linesData} />;
      case "worker": return <WorkerDetail data={workersData} />;
      case "operation": return <OperationDetail ops={opsData} />;
      case "product": return <ProductDetail count={productCount || counts.products || 21} />;
      case "schedule": return <ScheduleDetail scheds={schedsData} />;
      case "capacity": return <CapacityDetail caps={capsData} />;
      case "kpi": return <KpiDetail />;
      default: return null;
    }
  };

  const totalRecords = (counts.facility || 0) + 2 + (counts.workers || 0) + (counts.operations || 0)
    + (counts.products || 0) + (counts.schedules || 0) + (counts.capacity || 0);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: sans, color: C.white }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px 40px" }}>

        {/* ════ HEADER ════ */}
        <header style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20,
              background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)",
              fontSize: 10, fontWeight: 700, color: C.facility, letterSpacing: "0.08em", textTransform: "uppercase",
              fontFamily: mono,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%", background: C.facility, display: "inline-block",
                boxShadow: `0 0 6px ${C.facility}`, animation: "ontoPulse 2s ease-in-out infinite",
              }} />
              ONTOLOGY MAP · LIVE
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Griseus Ontology</h1>
          <p style={{ fontSize: 13, color: C.dim, margin: "4px 0 0" }}>Çukurova Isı — Canlı veri haritası</p>
        </header>

        {/* ════ MAIN LAYOUT ════ */}
        <div style={{ display: "grid", gridTemplateColumns: activeNode ? "1fr 340px" : "1fr", gap: 20, transition: "all 0.3s ease" }}>

          {/* SVG Canvas */}
          <div style={{
            ...cardStyle(), padding: 0, overflow: "hidden", minHeight: 600, position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="-450 -200 900 500" width="100%" height="100%"
              style={{ minHeight: 600, maxHeight: 700 }}
              onClick={(e) => { if ((e.target as Element).tagName === "svg") setActiveNode(null); }}
            >
              {/* Grid dots */}
              {Array.from({ length: 20 }).map((_, i) =>
                Array.from({ length: 12 }).map((_, j) => (
                  <circle key={`${i}-${j}`} cx={-450 + i * 48} cy={-200 + j * 48} r={0.5} fill="rgba(255,255,255,0.04)" />
                ))
              )}

              {/* Edges */}
              {edges.map((e, i) => (
                <OntologyEdge key={`${e.from}-${e.to}`} {...e} delay={0.3 + i * 0.08} />
              ))}

              {/* Nodes */}
              {nodes.map((n, i) => (
                <OntologyNode key={n.key} node={n} delay={0.1 + i * 0.07}
                  active={activeNode === n.key} hovered={hoveredNode === n.key}
                  onHover={() => setHoveredNode(n.key)} onLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(n.key)}
                />
              ))}
            </svg>
          </div>

          {/* Detail Panel */}
          {activeNode && (
            <div style={{
              ...cardStyle(), padding: 20, overflowY: "auto", maxHeight: 700,
              animation: "slideIn 0.25s ease-out",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: mono, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Entity Detail
                </div>
                <button onClick={() => setActiveNode(null)} style={{
                  background: "none", border: "none", color: C.dim, fontSize: 18, cursor: "pointer",
                  padding: "0 4px", lineHeight: 1,
                }}>×</button>
              </div>
              {renderDetailPanel()}
            </div>
          )}
        </div>

        {/* ════ NAV LINKS ════ */}
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          {[
            { label: "Dashboard", path: "/cukurova" },
            { label: "Simülasyon", path: "/cukurova-sim" },
            { label: "Engine", path: "/engine" },
          ].map((link) => (
            <button key={link.path} onClick={() => navigate(link.path)} style={{
              background: "rgba(255,255,255,0.03)", border: `1px solid ${C.cardBorder}`, borderRadius: 8,
              color: C.mid, fontSize: 12, fontWeight: 500, padding: "8px 16px", cursor: "pointer", fontFamily: sans,
              transition: "all 0.2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = C.white; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.mid; e.currentTarget.style.borderColor = C.cardBorder; }}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* ════ BOTTOM BAR ════ */}
        <footer style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
          marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.cardBorder}`,
        }}>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: mono }}>
            9 Entity Type · {totalRecords || "..."} Kayıt · {edges.length} İlişki · 4 Intelligence Fonksiyonu
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>Powered by Griseus Engine v1</div>
        </footer>
      </div>

      {/* ── Animations ── */}
      <style>{`
        @keyframes ontoPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.4); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
        @media (max-width: 900px) {
          div[style*="gridTemplateColumns: 1fr 340px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function cardStyle(): React.CSSProperties {
  return {
    background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: 20,
  };
}
