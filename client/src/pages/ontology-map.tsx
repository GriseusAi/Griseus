import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Legend } from "recharts";

/* ── Fonts ── */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

/* ── Palette ── */
const C = {
  bg: "#08080c",
  surface: "#0c0c12",
  card: "rgba(255,255,255,0.02)",
  cardBorder: "rgba(255,255,255,0.06)",
  facility: "#34d399",
  line: "#818cf8",
  gaz: "#f472b6",
  worker: "#fbbf24",
  operation: "#f472b6",
  product: "#a78bfa",
  schedule: "#fb923c",
  capacity: "#38bdf8",
  kpi: "#f87171",
  ok: "#34d399",
  warn: "#fbbf24",
  err: "#ef4444",
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
  key: NodeKey; label: string; sub: string; color: string; x: number; y: number;
}
interface Edge { from: NodeKey; to: NodeKey; label: string }
interface SimResult {
  baseline: { yearly_capacity: number; daily_capacity: number; utilization_pct: number };
  simulated: { yearly_capacity: number; daily_capacity: number; utilization_pct: number };
  delta: { units: number; percent: number };
  insights: string[];
}
interface BottleneckResult {
  line_name: string; total_weeks: number; on_track_weeks: number; critical_weeks: number;
  average_deviation_pct: number; trend: string; bottleneck_severity: string;
  worst_week: { period_value: string; planned: number; actual: number; deviation_pct: number };
  insights: string[];
}
interface WorkforceRisk {
  total_workers: number; unique_capabilities: number; risk_score: number; risk_level: string;
  single_point_failures: { capability_name: string; sole_worker_name: string }[];
  critical_workers: { name: string; department: string; capability_count: number; unique_capabilities: string[] }[];
  insights: string[];
}

/* ═══════════════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

function Ring({ pct, color, size = 72, stroke = 6 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(pct, 100) / 100)} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}44)`, transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

function SeverityBadge({ level }: { level: string }) {
  const colors: Record<string, string> = { low: C.ok, medium: C.warn, high: "#f97316", critical: C.err };
  const c = colors[level] || C.dim;
  return <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${c}18`, color: c, border: `1px solid ${c}33`, fontFamily: mono, textTransform: "uppercase" }}>{level}</span>;
}

function Pill({ label, color }: { label: string; color: string }) {
  return <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: `${color}12`, color, border: `1px solid ${color}25`, fontFamily: mono }}>{label}</span>;
}

function KV({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
      <span style={{ color: C.mid }}>{label}</span>
      <span style={{ color: color || C.white, fontFamily: mono, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function PanelSection({ title, children, color }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: color || C.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10, fontFamily: mono }}>{title}</div>
      {children}
    </div>
  );
}

function SimSlider({ label, value, min, max, step, baseline, color, onChange }: {
  label: string; value: number; min: number; max: number; step: number; baseline: number; color: string; onChange: (v: number) => void;
}) {
  const diff = value - baseline;
  const diffColor = diff > 0 ? C.ok : diff < 0 ? C.err : C.dim;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.mid }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 12, color: diff !== 0 ? diffColor : C.white, fontWeight: 700 }}>
          {step < 1 ? value.toFixed(1) : value}
          {diff !== 0 && <span style={{ fontSize: 10, marginLeft: 3 }}>{diff > 0 ? "+" : ""}{step < 1 ? diff.toFixed(1) : diff}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", height: 3, appearance: "none", background: `linear-gradient(to right, ${color} ${pct}%, #222 ${pct}%)`, borderRadius: 2, outline: "none", cursor: "pointer" }} />
      <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginTop: 2 }}>base: {step < 1 ? baseline.toFixed(1) : baseline}</div>
    </div>
  );
}

function SkeletonBox({ h = 16 }: { h?: number }) {
  return <div style={{ height: h, borderRadius: 6, background: "rgba(255,255,255,0.03)", animation: "skPulse 1.5s ease-in-out infinite" }} />;
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG NODE
   ═══════════════════════════════════════════════════════════════════════ */

function ONode({ node, active, hovered, dimmed, onHover, onLeave, onClick, delay }: {
  node: NodeDef; active: boolean; hovered: boolean; dimmed: boolean;
  onHover: () => void; onLeave: () => void; onClick: () => void; delay: number;
}) {
  const w = 134, h = 56, rx = 12;
  const opacity = dimmed ? 0.35 : 1;
  const scale = hovered ? 1.05 : 1;
  return (
    <g transform={`translate(${node.x}, ${node.y})`} style={{ cursor: "pointer", opacity, transition: "opacity 0.3s" }}
      onMouseEnter={onHover} onMouseLeave={onLeave} onClick={onClick}>
      {/* Glow */}
      {(hovered || active) && <rect x={-w / 2 - 6} y={-h / 2 - 6} width={w + 12} height={h + 12} rx={rx + 4} fill={node.color} opacity={active ? 0.08 : 0.05} style={{ filter: "blur(10px)" }} />}
      {/* Box */}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx}
        fill={`${node.color}08`} stroke={active ? node.color : hovered ? `${node.color}88` : `${node.color}30`}
        strokeWidth={active ? 1.8 : 1} style={{ transition: "all 0.25s", transform: `scale(${scale})`, transformOrigin: "center" }} />
      {/* Active pulse ring */}
      {active && <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rx} fill="none" stroke={node.color} strokeWidth={1}>
        <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
      </rect>}
      <text x={0} y={-3} textAnchor="middle" fill={C.white} fontSize={11.5} fontWeight={600} fontFamily={sans}>{node.label}</text>
      <text x={0} y={13} textAnchor="middle" fill={C.mid} fontSize={9.5} fontFamily={mono}>{node.sub}</text>
      {/* Staggered entrance */}
      <animateTransform attributeName="transform" type="translate" from={`${node.x} ${node.y + 12}`} to={`${node.x} ${node.y}`} dur="0.4s" begin={`${delay}s`} fill="freeze" />
      <animate attributeName="opacity" from="0" to={dimmed ? "0.35" : "1"} dur="0.4s" begin={`${delay}s`} fill="freeze" />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG EDGE
   ═══════════════════════════════════════════════════════════════════════ */

function OEdge({ x1, y1, x2, y2, color, label, delay, dimmed }: {
  x1: number; y1: number; x2: number; y2: number; color: string; label: string; delay: number; dimmed: boolean;
}) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const cx = mx + (y2 - y1) * 0.12, cy = my - (x2 - x1) * 0.12;
  const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 1.2;
  const op = dimmed ? 0.06 : 0.18;
  return (
    <g style={{ transition: "opacity 0.3s" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.2} opacity={op} strokeDasharray={len} strokeDashoffset={len}>
        <animate attributeName="stroke-dashoffset" from={len} to={0} dur="0.7s" begin={`${delay}s`} fill="freeze" />
      </path>
      <text x={mx + (y2 - y1) * 0.04} y={my - (x2 - x1) * 0.04 - 5} textAnchor="middle" fill={color} opacity={dimmed ? 0.1 : 0.28} fontSize={7.5} fontFamily={mono} letterSpacing="0.04em">
        <animate attributeName="opacity" from="0" to={dimmed ? "0.1" : "0.28"} dur="0.3s" begin={`${delay + 0.5}s`} fill="freeze" />
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
  const [appTab, setAppTab] = useState<string>("analytics");

  // ── Data caches ──
  const [summary, setSummary] = useState<any>(null);
  const [linesData, setLinesData] = useState<any[]>([]);
  const [workersData, setWorkersData] = useState<any[]>([]);
  const [opsData, setOpsData] = useState<any[]>([]);
  const [schedsData, setSchedsData] = useState<any[]>([]);
  const [capsData, setCapsData] = useState<any[]>([]);
  const [wfRisk, setWfRisk] = useState<WorkforceRisk | null>(null);
  const [trustScores, setTrustScores] = useState<Record<number, any>>({});

  // ── Simulation state ──
  const [simLineId, setSimLineId] = useState<number>(1);
  const [simParams, setSimParams] = useState({ worker_count: 7, unit_time_min: 13, daily_hours: 9, monthly_days: 22, production_months: 10 });
  const [simBaselines, setSimBaselines] = useState({ worker_count: 7, unit_time_min: 13, daily_hours: 9, monthly_days: 22, production_months: 10 });
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [bottleneck, setBottleneck] = useState<BottleneckResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Load fonts ──
  useEffect(() => {
    if (!document.querySelector('link[href*="Outfit"]')) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = FONT_LINK; document.head.appendChild(link);
    }
  }, []);

  // ── Fetch core data on mount ──
  useEffect(() => {
    fetch("/api/v1/dashboard/summary").then(r => r.json()).then(setSummary).catch(() => {});
    fetch("/api/v1/facilities/1/lines").then(r => r.json()).then(setLinesData).catch(() => {});
    fetch("/api/v1/workers").then(r => r.json()).then(setWorkersData).catch(() => {});
    fetch("/api/v1/analyze/workforce-risk/1").then(r => r.json()).then(setWfRisk).catch(() => {});
  }, []);

  // ── Lazy fetchers ──
  const fetchOps = useCallback(() => {
    if (opsData.length > 0) return;
    Promise.all([fetch("/api/v1/lines/1/operations").then(r => r.json()), fetch("/api/v1/lines/2/operations").then(r => r.json())])
      .then(([a, b]) => setOpsData([...a, ...b])).catch(() => {});
  }, [opsData.length]);

  const fetchScheds = useCallback(() => {
    if (schedsData.length > 0) return;
    Promise.all([fetch("/api/v1/schedules?line_id=1").then(r => r.json()), fetch("/api/v1/schedules?line_id=2").then(r => r.json())])
      .then(([a, b]) => setSchedsData([...a, ...b])).catch(() => {});
  }, [schedsData.length]);

  const fetchCaps = useCallback(() => {
    if (capsData.length > 0) return;
    Promise.all([fetch("/api/v1/lines/1/capacity").then(r => r.json()), fetch("/api/v1/lines/2/capacity").then(r => r.json())])
      .then(([a, b]) => setCapsData([...a, ...b])).catch(() => {});
  }, [capsData.length]);

  const fetchTrustScore = useCallback((wId: number) => {
    if (trustScores[wId]) return;
    fetch(`/api/v1/score/trust/${wId}`).then(r => r.json()).then(d => setTrustScores(prev => ({ ...prev, [wId]: d }))).catch(() => {});
  }, [trustScores]);

  // ── Simulation logic ──
  const initSimForLine = useCallback((lineId: number) => {
    const line = linesData.find((l: any) => l.id === lineId);
    if (!line) return;
    const defaults = { worker_count: line.workerCount, unit_time_min: Number(line.currentUnitTimeMin), daily_hours: Number(line.dailyHours), monthly_days: line.monthlyDays, production_months: line.productionMonths };
    setSimParams(defaults);
    setSimBaselines(defaults);
    setSimLineId(lineId);
  }, [linesData]);

  const runSim = useCallback(() => {
    fetch("/api/v1/simulate/capacity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: simLineId, ...simParams }) })
      .then(r => r.json()).then(setSimResult).catch(() => {});
    fetch(`/api/v1/analyze/bottleneck/${simLineId}`).then(r => r.json()).then(setBottleneck).catch(() => {});
  }, [simLineId, simParams]);

  useEffect(() => {
    if (linesData.length === 0) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSim, 250);
  }, [runSim, linesData.length]);

  // ── Node click handlers ──
  const handleNodeClick = (key: NodeKey) => {
    setActiveNode(prev => prev === key ? null : key);
    if (key === "elektrikli") initSimForLine(1);
    else if (key === "gazli") initSimForLine(2);
    else if (key === "operation") fetchOps();
    else if (key === "schedule") { fetchScheds(); fetch("/api/v1/analyze/bottleneck/1").then(r => r.json()).then(setBottleneck).catch(() => {}); }
    else if (key === "capacity") fetchCaps();
    else if (key === "worker") {
      // Fetch trust scores for first few workers
      workersData.slice(0, 5).forEach((w: any) => fetchTrustScore(w.id));
    }
  };

  // App bar tab handler
  const handleAppTab = (tab: string) => {
    setAppTab(tab);
    if (tab === "simulation") { setActiveNode("elektrikli"); initSimForLine(1); }
    else if (tab === "scheduling") { setActiveNode("schedule"); fetchScheds(); fetch("/api/v1/analyze/bottleneck/1").then(r => r.json()).then(setBottleneck).catch(() => {}); }
    else if (tab === "trustscore") { setActiveNode("worker"); workersData.slice(0, 5).forEach((w: any) => fetchTrustScore(w.id)); }
    else if (tab === "analytics") setActiveNode(null);
  };

  // ── Node definitions ──
  const eOut = summary?.lines?.find((l: any) => l.type === "elektrikli")?.totalOutput || 0;
  const gOut = summary?.lines?.find((l: any) => l.type === "gazli")?.totalOutput || 0;
  const totalScheds = (summary?.weeklySchedules?.elektrikli?.length || 0) + (summary?.weeklySchedules?.gazli?.length || 0);

  const nodes: NodeDef[] = [
    { key: "facility", label: "Çukurova Isı Fabrikası", sub: "Gebze · Aktif", color: C.facility, x: 0, y: -10 },
    { key: "elektrikli", label: "Elektrikli Hat", sub: `${fmt(eOut)} üretim · %64`, color: C.line, x: -220, y: 120 },
    { key: "gazli", label: "Gazlı Hat", sub: `${fmt(gOut)} üretim · %87`, color: C.gaz, x: 220, y: 120 },
    { key: "worker", label: `${workersData.length || "..."} Çalışan`, sub: "6 departman", color: C.worker, x: 0, y: -150 },
    { key: "operation", label: `${summary?.monthlyData?.length ? 24 : "..."} Operasyon`, sub: `${fmt(summary?.totalProduction || 0)} toplam`, color: C.operation, x: -320, y: 250 },
    { key: "product", label: "21 Ürün", sub: "Elektrikli + Gazlı", color: C.product, x: 0, y: 260 },
    { key: "schedule", label: `${totalScheds || "..."} Çizelge`, sub: "Haftalık plan/gerçek", color: C.schedule, x: 320, y: 250 },
    { key: "capacity", label: "Kapasite", sub: `%64 / %87`, color: C.capacity, x: 360, y: 20 },
    { key: "kpi", label: "0 KPI", sub: "Tanımlanmadı", color: C.kpi, x: -360, y: -60 },
  ];

  const edges: Edge[] = [
    { from: "facility", to: "elektrikli", label: "has_line" },
    { from: "facility", to: "gazli", label: "has_line" },
    { from: "facility", to: "worker", label: "employs" },
    { from: "facility", to: "kpi", label: "tracks" },
    { from: "facility", to: "capacity", label: "monitors" },
    { from: "elektrikli", to: "operation", label: "produces" },
    { from: "gazli", to: "schedule", label: "scheduled" },
    { from: "elektrikli", to: "product", label: "makes" },
    { from: "gazli", to: "product", label: "makes" },
  ];

  const getPos = (key: NodeKey) => {
    const n = nodes.find(n => n.key === key)!;
    return { x: n.x, y: n.y };
  };

  const isConnected = (key: NodeKey) => {
    if (!activeNode) return true;
    if (key === activeNode) return true;
    return edges.some(e => (e.from === activeNode && e.to === key) || (e.to === activeNode && e.from === key));
  };

  const totalRecords = 1 + 2 + workersData.length + 24 + 21 + totalScheds + (summary?.capacityMetrics?.length || 0);

  /* ═══════════════════════════════════════════════════════════════════
     RIGHT PANEL CONTENT
     ═══════════════════════════════════════════════════════════════════ */

  const renderPanel = () => {
    // Default overview
    if (!activeNode) return (
      <div>
        <PanelSection title="Genel Özet" color={C.facility}>
          {summary ? (<>
            <KV label="Toplam Üretim" value={fmt(summary.totalProduction)} color={C.ok} />
            <KV label="Üretim Hatları" value="2 (Elektrikli + Gazlı)" />
            <KV label="Çalışan Sayısı" value={workersData.length} />
            <KV label="Pik Ay" value={`${summary.peakMonth?.ay} (${fmt(summary.peakMonth?.total)})`} color={C.warn} />
            <KV label="Kayıt Sayısı" value={totalRecords} />
          </>) : <>{[1,2,3,4].map(i => <SkeletonBox key={i} />)}</>}
        </PanelSection>
        <PanelSection title="Intelligence" color={C.capacity}>
          {["simulateCapacity", "detectBottleneck", "scoreWorkerRisk", "scoreTrust"].map(fn => (
            <div key={fn} style={{ padding: "6px 10px", marginBottom: 4, borderRadius: 6, background: "rgba(255,255,255,0.02)", fontSize: 11, color: C.mid, fontFamily: mono }}>{fn}()</div>
          ))}
        </PanelSection>
      </div>
    );

    switch (activeNode) {
      case "facility": return (
        <div>
          <PanelSection title="Tesis Bilgisi" color={C.facility}>
            <KV label="Ad" value="Çukurova Isı Fabrikası" />
            <KV label="Lokasyon" value="Gebze, Kocaeli" />
            <KV label="Status" value="Aktif" color={C.ok} />
            <KV label="Hatlar" value="2" />
            <KV label="Çalışan" value={workersData.length} />
          </PanelSection>
          {summary && (
            <PanelSection title="Üretim Özeti" color={C.white}>
              <KV label="Toplam" value={fmt(summary.totalProduction)} color={C.ok} />
              <KV label="Elektrikli" value={fmt(eOut)} color={C.line} />
              <KV label="Gazlı" value={fmt(gOut)} color={C.gaz} />
              <KV label="Pik" value={`${summary.peakMonth?.ay} — ${fmt(summary.peakMonth?.total)}`} color={C.warn} />
            </PanelSection>
          )}
        </div>
      );

      case "elektrikli":
      case "gazli": {
        const isE = activeNode === "elektrikli";
        const lineColor = isE ? C.line : C.gaz;
        const line = linesData.find((l: any) => l.id === simLineId);
        return (
          <div>
            <PanelSection title="Efficiency Engine" color={lineColor}>
              {line && <>
                <KV label="Hat" value={line.name} color={lineColor} />
                <KV label="Çalışan" value={line.workerCount} />
                <KV label="Teorik süre" value={`${line.capacityUnitTimeMin} dk`} />
                <KV label="Mevcut süre" value={`${line.currentUnitTimeMin} dk`} />
              </>}
            </PanelSection>
            <PanelSection title="Simülasyon" color={C.white}>
              <SimSlider label="Çalışan" value={simParams.worker_count} min={1} max={20} step={1} baseline={simBaselines.worker_count} color={lineColor} onChange={v => setSimParams(p => ({ ...p, worker_count: v }))} />
              <SimSlider label="Birim süre (dk)" value={simParams.unit_time_min} min={5} max={30} step={0.5} baseline={simBaselines.unit_time_min} color={lineColor} onChange={v => setSimParams(p => ({ ...p, unit_time_min: v }))} />
              <SimSlider label="Günlük saat" value={simParams.daily_hours} min={6} max={12} step={1} baseline={simBaselines.daily_hours} color={lineColor} onChange={v => setSimParams(p => ({ ...p, daily_hours: v }))} />
              <SimSlider label="Aylık gün" value={simParams.monthly_days} min={15} max={30} step={1} baseline={simBaselines.monthly_days} color={lineColor} onChange={v => setSimParams(p => ({ ...p, monthly_days: v }))} />
              <SimSlider label="Sezon (ay)" value={simParams.production_months} min={6} max={12} step={1} baseline={simBaselines.production_months} color={lineColor} onChange={v => setSimParams(p => ({ ...p, production_months: v }))} />
              <button onClick={() => setSimParams({ ...simBaselines })} style={{ width: "100%", padding: "6px 0", borderRadius: 6, border: `1px solid ${C.cardBorder}`, background: "transparent", color: C.dim, fontSize: 11, cursor: "pointer", fontFamily: sans, marginTop: 4 }}>Baseline'a Dön</button>
            </PanelSection>
            {simResult && (
              <PanelSection title="Sonuç" color={simResult.delta.units >= 0 ? C.ok : C.err}>
                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: C.white }}>{fmt(simResult.simulated.yearly_capacity)}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>Yıllık</div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: simResult.delta.units >= 0 ? C.ok : C.err }}>
                      {simResult.delta.units >= 0 ? "+" : ""}{fmt(simResult.delta.units)}
                    </div>
                    <div style={{ fontSize: 10, color: C.dim }}>Delta ({simResult.delta.percent}%)</div>
                  </div>
                </div>
                <KV label="Günlük" value={fmt(simResult.simulated.daily_capacity)} />
                <KV label="Kullanım" value={`%${simResult.simulated.utilization_pct}`} color={simResult.simulated.utilization_pct > 90 ? C.err : C.ok} />
              </PanelSection>
            )}
            {simResult && simResult.insights.length > 0 && (
              <PanelSection title="Insights">
                {simResult.insights.map((ins, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, fontSize: 11, color: C.mid, lineHeight: 1.5 }}>
                    <span style={{ flexShrink: 0 }}>⚡</span> {ins}
                  </div>
                ))}
              </PanelSection>
            )}
            {bottleneck && bottleneck.total_weeks > 0 && (
              <PanelSection title="Darboğaz" color={C.warn}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <SeverityBadge level={bottleneck.bottleneck_severity} />
                  <span style={{ fontSize: 11, color: C.mid }}>Ort. sapma: %{bottleneck.average_deviation_pct}</span>
                </div>
                <KV label="En kötü" value={`${bottleneck.worst_week.period_value} (%${bottleneck.worst_week.deviation_pct})`} color={C.err} />
                <KV label="Trend" value={bottleneck.trend === "improving" ? "İyileşiyor ↑" : bottleneck.trend === "declining" ? "Kötüleşiyor ↓" : "Stabil →"} color={bottleneck.trend === "declining" ? C.err : C.ok} />
              </PanelSection>
            )}
          </div>
        );
      }

      case "worker": return (
        <div>
          <PanelSection title="Workforce Intelligence" color={C.worker}>
            <KV label="Toplam Çalışan" value={workersData.length} />
            <KV label="Departmanlar" value="6" />
          </PanelSection>
          {wfRisk && (
            <PanelSection title="Risk Analizi" color={wfRisk.risk_score > 25 ? C.err : C.ok}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ position: "relative" }}>
                  <Ring pct={wfRisk.risk_score} color={wfRisk.risk_score > 40 ? C.err : wfRisk.risk_score > 25 ? C.warn : C.ok} size={56} stroke={5} />
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontFamily: mono, fontSize: 14, fontWeight: 700 }}>{wfRisk.risk_score}</div>
                </div>
                <div>
                  <SeverityBadge level={wfRisk.risk_level} />
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{wfRisk.single_point_failures.length} tek kişi bağımlılığı</div>
                </div>
              </div>
              {wfRisk.single_point_failures.slice(0, 5).map((spf, i) => (
                <div key={i} style={{ display: "flex", gap: 6, fontSize: 11, color: C.mid, marginBottom: 3 }}>
                  <span style={{ color: C.err }}>●</span> <span style={{ color: C.white }}>{spf.capability_name}</span> → {spf.sole_worker_name}
                </div>
              ))}
            </PanelSection>
          )}
          <PanelSection title="Çalışanlar" color={C.white}>
            {workersData.slice(0, 10).map((w: any) => {
              const ts = trustScores[w.id];
              return (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{w.name}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{w.department} · {w.capabilities?.length || 0} yetki</div>
                  </div>
                  {ts ? (
                    <div style={{ width: 36, textAlign: "right" }}>
                      <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: ts.trust_score >= 70 ? C.ok : C.warn }}>{ts.trust_score}</div>
                      <div style={{ height: 3, width: 36, background: "#222", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: 3, width: `${ts.trust_score}%`, background: ts.trust_score >= 70 ? C.ok : C.warn, borderRadius: 2, transition: "width 0.5s" }} />
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => fetchTrustScore(w.id)} style={{ background: "none", border: `1px solid ${C.cardBorder}`, borderRadius: 4, color: C.dim, fontSize: 9, padding: "2px 6px", cursor: "pointer", fontFamily: mono }}>score</button>
                  )}
                </div>
              );
            })}
          </PanelSection>
          {wfRisk && wfRisk.critical_workers.length > 0 && (
            <PanelSection title="Kritik Çalışanlar" color={C.err}>
              {wfRisk.critical_workers.slice(0, 3).map((w, i) => (
                <div key={i} style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 8, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{w.name}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{w.department} · {w.capability_count} yetki · {w.unique_capabilities.length} benzersiz</div>
                </div>
              ))}
            </PanelSection>
          )}
        </div>
      );

      case "operation": {
        const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
        const monthly = monthNames.map((ay, i) => {
          const m = String(i + 1).padStart(2, "0");
          const e = opsData.filter((o: any) => o.lineId === 1 && o.plannedDate?.includes(`-${m}-`)).reduce((s: number, o: any) => s + (o.actualQty || 0), 0);
          const g = opsData.filter((o: any) => o.lineId === 2 && o.plannedDate?.includes(`-${m}-`)).reduce((s: number, o: any) => s + (o.actualQty || 0), 0);
          return { ay, e, g };
        }).filter(d => d.e > 0 || d.g > 0);
        const totalE = opsData.filter((o: any) => o.lineId === 1).reduce((s: number, o: any) => s + (o.actualQty || 0), 0);
        const totalG = opsData.filter((o: any) => o.lineId === 2).reduce((s: number, o: any) => s + (o.actualQty || 0), 0);
        const peak = monthly.reduce((best, m) => (m.e + m.g) > (best.e + best.g) ? m : best, monthly[0] || { ay: "-", e: 0, g: 0 });

        return (
          <div>
            <PanelSection title="Üretim Analizi" color={C.operation}>
              {opsData.length === 0 ? <SkeletonBox h={100} /> : <>
                <KV label="Toplam" value={fmt(totalE + totalG)} color={C.ok} />
                <KV label="Elektrikli" value={fmt(totalE)} color={C.line} />
                <KV label="Gazlı" value={fmt(totalG)} color={C.gaz} />
                <KV label="Pik Ay" value={`${peak.ay} (${fmt(peak.e + peak.g)})`} color={C.warn} />
              </>}
            </PanelSection>
            {monthly.length > 0 && (
              <PanelSection title="Aylık Dağılım">
                <div style={{ height: 160, marginLeft: -8 }}>
                  <ResponsiveContainer>
                    <BarChart data={monthly} barGap={1}>
                      <XAxis dataKey="ay" tick={{ fill: C.dim, fontSize: 8 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: C.dim, fontSize: 8, fontFamily: mono }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8, fontSize: 10 }} />
                      <Bar dataKey="e" name="Elektrikli" fill={C.line} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="g" name="Gazlı" fill={C.gaz} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </PanelSection>
            )}
          </div>
        );
      }

      case "schedule": {
        const eScheds = schedsData.filter((s: any) => s.lineId === 1);
        const gScheds = schedsData.filter((s: any) => s.lineId === 2);
        const avgDev = (arr: any[]) => {
          if (arr.length === 0) return 0;
          return Math.round(arr.map(s => { const p = s.plannedQty || 1; return ((s.actualQty || 0) - p) / p * 100; }).reduce((a, b) => a + b, 0) / arr.length);
        };
        const eTotal = eScheds.reduce((s: number, x: any) => s + (x.plannedQty || 0), 0);
        const eActual = eScheds.reduce((s: number, x: any) => s + (x.actualQty || 0), 0);
        const realizationPct = eTotal > 0 ? Math.round((eActual / eTotal) * 100) : 0;

        return (
          <div>
            <PanelSection title="Scheduling Intelligence" color={C.schedule}>
              {schedsData.length === 0 ? <SkeletonBox h={80} /> : <>
                <KV label="Toplam hafta" value={schedsData.length} />
                <KV label="Elek. sapma" value={`%${avgDev(eScheds)}`} color={avgDev(eScheds) < -15 ? C.err : C.ok} />
                <KV label="Gazlı sapma" value={`%${avgDev(gScheds)}`} color={avgDev(gScheds) < -15 ? C.err : C.ok} />
              </>}
            </PanelSection>
            {bottleneck && (
              <PanelSection title="Darboğaz" color={C.warn}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <SeverityBadge level={bottleneck.bottleneck_severity} />
                  <span style={{ fontSize: 11, color: C.mid }}>{bottleneck.line_name}</span>
                </div>
                <KV label="Kritik haftalar" value={bottleneck.critical_weeks} color={C.err} />
                <KV label="En kötü" value={`${bottleneck.worst_week.period_value} (%${bottleneck.worst_week.deviation_pct})`} color={C.err} />
                <KV label="Trend" value={bottleneck.trend === "improving" ? "İyileşiyor ↑" : bottleneck.trend === "declining" ? "Kötüleşiyor ↓" : "Stabil →"} />
                {bottleneck.insights.map((ins, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.mid, marginTop: 6, display: "flex", gap: 5 }}><span style={{ color: C.warn }}>⚠</span> {ins}</div>
                ))}
              </PanelSection>
            )}
            {realizationPct > 0 && (
              <PanelSection title="Insight">
                <div style={{ fontSize: 11, color: C.mid, lineHeight: 1.6, padding: "10px 12px", background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 8 }}>
                  ⚡ Bu ürün karmasında ortalama gerçekleşme oranı <span style={{ color: C.white, fontWeight: 600 }}>%{realizationPct}</span>. Planlama buna göre ayarlanmalı.
                </div>
              </PanelSection>
            )}
          </div>
        );
      }

      case "product": return (
        <div>
          <PanelSection title="Ürünler" color={C.product}>
            <KV label="Toplam SKU" value="21" />
            <KV label="Elektrikli" value="11 SKU" color={C.line} />
            <KV label="Gazlı" value="10 SKU" color={C.gaz} />
          </PanelSection>
          <PanelSection title="Kategoriler">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {["GSS20P", "GSS40P", "GSN20", "GSN40", "GSA20", "GSU15", "GSU20", "6TD120", "9TD180", "3TY60", "4TY80"].map(s => <Pill key={s} label={s} color={C.line} />)}
            </div>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["ELT.7-11", "CC.7-11", "CC.5-7", "CPH.22", "CPH.33", "CPH.44", "BH55", "SSP40/60", "SSE20/30", "MELT.7-11"].map(s => <Pill key={s} label={s} color={C.gaz} />)}
            </div>
          </PanelSection>
        </div>
      );

      case "capacity": return (
        <div>
          <PanelSection title="Kapasite Metrikleri" color={C.capacity}>
            {capsData.length === 0 ? <SkeletonBox h={60} /> : capsData.map((c: any, i: number) => {
              const pct = Number(c.utilizationPct) || 0;
              const clr = c.lineId === 1 ? C.line : C.gaz;
              return (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <Ring pct={pct} color={clr} size={52} stroke={5} />
                    <div>
                      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: clr }}>%{pct}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{c.lineId === 1 ? "Elektrikli" : "Gazlı"}</div>
                    </div>
                  </div>
                  <KV label="Teorik Max" value={fmt(c.theoreticalMax)} />
                  <KV label="Gerçek" value={fmt(c.actualOutput)} />
                </div>
              );
            })}
          </PanelSection>
        </div>
      );

      case "kpi": return (
        <div>
          <PanelSection title="KPI Tanımları" color={C.kpi}>
            <div style={{ textAlign: "center", padding: "30px 0", color: C.dim, fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>📊</div>
              Henüz KPI tanımlanmadı.<br />Katman 05'te aktif olacak.
            </div>
          </PanelSection>
        </div>
      );

      default: return null;
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: sans, color: C.white, display: "flex", flexDirection: "column" }}>

      {/* ════ TOP: APPLICATIONS BAR ════ */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.cardBorder}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 2 }}>
          {[
            { key: "analytics", label: "Analytics" },
            { key: "simulation", label: "Simülasyon" },
            { key: "scheduling", label: "Scheduling" },
            { key: "trustscore", label: "Trust Score" },
          ].map(tab => (
            <button key={tab.key} onClick={() => handleAppTab(tab.key)} style={{
              background: appTab === tab.key ? "rgba(255,255,255,0.06)" : "transparent",
              border: "none", borderBottom: appTab === tab.key ? `2px solid ${C.facility}` : "2px solid transparent",
              color: appTab === tab.key ? C.white : C.dim, fontSize: 12, fontWeight: 600,
              padding: "14px 16px", cursor: "pointer", fontFamily: sans, transition: "all 0.2s",
            }}>{tab.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.mid, fontWeight: 500 }}>Çukurova Isı Sistemleri</span>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.ok, display: "inline-block", boxShadow: `0 0 6px ${C.ok}`, animation: "ontoPulse 2s ease-in-out infinite" }} />
        </div>
      </div>

      {/* ════ MIDDLE: MAP + PANEL ════ */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: activeNode ? "1fr 380px" : "1fr", transition: "all 0.3s ease", overflow: "hidden" }}>

        {/* SVG Canvas */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", minHeight: 520 }}
          onClick={(e) => { if ((e.target as Element).tagName === "DIV") setActiveNode(null); }}>
          <svg viewBox="-460 -210 920 510" width="100%" style={{ maxHeight: "calc(100vh - 150px)" }}>
            {/* Dot grid */}
            {Array.from({ length: 24 }).map((_, i) => Array.from({ length: 14 }).map((_, j) => (
              <circle key={`${i}-${j}`} cx={-460 + i * 40} cy={-210 + j * 40} r={0.4} fill="rgba(255,255,255,0.03)" />
            )))}

            {/* Edges */}
            {edges.map((e, i) => {
              const f = getPos(e.from), t = getPos(e.to);
              const dimmed = activeNode !== null && !isConnected(e.from) && !isConnected(e.to);
              return <OEdge key={`${e.from}-${e.to}`} x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                color={nodes.find(n => n.key === e.to)?.color || C.dim} label={e.label} delay={0.3 + i * 0.06} dimmed={dimmed} />;
            })}

            {/* Nodes */}
            {nodes.map((n, i) => (
              <ONode key={n.key} node={n} delay={0.1 + i * 0.07}
                active={activeNode === n.key} hovered={hoveredNode === n.key}
                dimmed={activeNode !== null && !isConnected(n.key)}
                onHover={() => setHoveredNode(n.key)} onLeave={() => setHoveredNode(null)}
                onClick={() => handleNodeClick(n.key)} />
            ))}
          </svg>
        </div>

        {/* Right Panel */}
        {activeNode !== null || true ? (
          <div style={{
            background: C.surface, borderLeft: `1px solid ${C.cardBorder}`,
            padding: activeNode ? 20 : 20, overflowY: "auto",
            width: activeNode ? 380 : 0, opacity: activeNode ? 1 : 0,
            transition: "all 0.3s ease", maxHeight: "calc(100vh - 150px)",
            ...(activeNode ? {} : { padding: 0, width: 0, borderLeft: "none" }),
          }}>
            {activeNode !== null && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: nodes.find(n => n.key === activeNode)?.color, display: "inline-block" }} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{nodes.find(n => n.key === activeNode)?.label}</span>
                  </div>
                  <button onClick={() => setActiveNode(null)} style={{ background: "none", border: "none", color: C.dim, fontSize: 18, cursor: "pointer", padding: "0 4px" }}>×</button>
                </div>
                {renderPanel()}
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* ════ BOTTOM: SOURCES BAR ════ */}
      <div style={{ background: C.surface, borderTop: `1px solid ${C.cardBorder}`, padding: "14px 24px", flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, maxWidth: 1200, margin: "0 auto" }}>
          {/* Data Sources */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontFamily: mono }}>Data Sources</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["Excel", "Netsis ERP", "CSV", "API"].map(s => <Pill key={s} label={s} color={C.capacity} />)}
            </div>
          </div>
          {/* Logic */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontFamily: mono }}>Logic</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["simulateCapacity", "detectBottleneck", "scoreWorkerRisk", "forecastOutput"].map(s => <Pill key={s} label={s} color={C.line} />)}
            </div>
          </div>
          {/* Systems of Action */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontFamily: mono }}>Systems of Action</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {[
                { label: "Dashboard", action: () => navigate("/cukurova") },
                { label: "Digital Twin", action: () => navigate("/cukurova") },
                { label: "Scheduling", action: () => { setActiveNode("schedule"); fetchScheds(); } },
                { label: "Engine", action: () => navigate("/engine") },
              ].map(s => (
                <button key={s.label} onClick={s.action} style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                  background: `${C.ok}12`, color: C.ok, border: `1px solid ${C.ok}25`,
                  fontFamily: mono, cursor: "pointer", transition: "all 0.2s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${C.ok}22`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${C.ok}12`; }}
                >{s.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.cardBorder}` }}>
          <span style={{ fontSize: 10, color: C.dim, fontFamily: mono }}>9 Entity Type · {totalRecords} Kayıt · {edges.length} İlişki · 4 Intelligence Fonksiyonu</span>
          <span style={{ fontSize: 10, color: C.dim }}>Powered by Griseus Engine v1</span>
        </div>
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes ontoPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.5); } }
        @keyframes skPulse { 0%,100% { opacity:0.3; } 50% { opacity:0.08; } }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:${C.line}; cursor:pointer; box-shadow:0 0 6px ${C.line}55; }
        input[type=range]::-webkit-slider-thumb:hover { box-shadow:0 0 12px ${C.line}88; }
        @media (max-width: 900px) {
          div[style*="gridTemplateColumns: 1fr 380px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
