import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

/* ── Fonts ── */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

/* ── Palette ── */
const C = {
  bg: "#08080c", surface: "#0c0c12", card: "rgba(255,255,255,0.02)", cardBorder: "rgba(255,255,255,0.06)",
  green: "#34d399", indigo: "#818cf8", amber: "#fbbf24", pink: "#f472b6",
  white: "#fff", mid: "#888", dim: "#555", err: "#ef4444",
};
const sans = "'Outfit', sans-serif";
const mono = "'JetBrains Mono', monospace";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── Types ── */
type LayerKey = "applications" | "intelligence" | "ontology" | "ingestion";
type OntoNode = "facility" | "elektrikli" | "gazli" | "workers" | "operations" | "products" | "schedules" | "capacity" | "kpi" | null;
type IntelTab = "simulation" | "bottleneck";
type AppChartTab = "monthly" | "weekly";

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
interface ForecastResult {
  line_name: string; planned_qty: number; avg_realization_rate: number;
  predicted_output: number; gap: number; is_realistic: boolean; confidence: number;
  scenarios: { name: string; description: string; predicted_output: number; realization_rate: number }[];
  recommendation: string;
  weekly_history: { period: string; planned: number; actual: number; realization_pct: number }[];
  stats: { min_rate: number; max_rate: number; total_weeks: number };
  motor_generation?: number; data_source?: string; data_points?: number; accuracy_trend?: string;
  seasonal_factor?: number | null; historical_same_week?: number | null;
  risk_flags?: string[]; current_week?: number; current_month?: number;
}
interface MotorAccuracy {
  total_plans: number; completed_plans: number; active_plans: number;
  avg_realization_rate: number; avg_prediction_accuracy: number; best_accuracy: number;
  motor_generation: number; trend: string;
  history: { week: string; planned: number; predicted: number | null; actual: number | null; realization_rate: number; prediction_accuracy: number | null }[];
  active_list: { id: number; week_label: string; line_id: number | null; planned_qty: number; predicted_qty: number | null; created_at: string }[];
  top_deviation?: { reason: string; label: string; count: number } | null;
  deviation_counts?: Record<string, number>;
  monthly_avg?: { month: number; label: string; avg_rate: number; count: number }[];
  risk_flags?: string[];
}
interface WorkforceRisk {
  total_workers: number; unique_capabilities: number; risk_score: number; risk_level: string;
  single_point_failures: { capability_name: string; sole_worker_name: string }[];
  critical_workers: { name: string; department: string; capability_count: number; unique_capabilities: string[] }[];
  insights: string[];
}

/* ── Small components ── */
function Ring({ pct, color, size = 64, stroke = 5 }: { pct: number; color: string; size?: number; stroke?: number }) {
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
  const map: Record<string, { bg: string; color: string }> = {
    low: { bg: "rgba(52,211,153,0.12)", color: C.green },
    medium: { bg: "rgba(251,191,36,0.12)", color: C.amber },
    high: { bg: "rgba(239,68,68,0.12)", color: C.err },
    critical: { bg: "rgba(239,68,68,0.2)", color: "#ff6b6b" },
  };
  const s = map[level] || map.medium;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 13, fontWeight: 700, fontFamily: mono,
      background: s.bg, color: s.color, textTransform: "uppercase" }}>{level}</span>
  );
}

function PanelSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: mono, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      {children}
    </div>
  );
}

function MetricCard({ value, label, color, large }: { value: string; label: string; color: string; large?: boolean }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 10, background: C.card, border: `1px solid ${C.cardBorder}`, textAlign: "center" }}>
      <div style={{ fontFamily: mono, fontSize: large ? 50 : 34, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 17, color: C.mid, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, unit }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 14, color: C.mid }}>{label}</span>
        <span style={{ fontSize: 14, fontFamily: mono, color: C.white }}>{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", height: 3, appearance: "none", background: "rgba(255,255,255,0.08)", borderRadius: 2, outline: "none", cursor: "pointer" }} />
    </div>
  );
}

/* ── Markdown renderer ── */
const renderMarkdown = (text: string) =>
  text
    .replace(/### (.*?)(\n|$)/g, '<div style="font-size:13px;font-weight:700;color:#fff;margin:10px 0 4px">$1</div>')
    .replace(/## (.*?)(\n|$)/g, '<div style="font-size:14px;font-weight:700;color:#fff;margin:12px 0 6px">$1</div>')
    .replace(/\*\*(.*?)\*\*/g, '<span style="font-weight:600;color:#e2e8f0">$1</span>')
    .replace(/- (.*?)(\n|$)/g, '<div style="padding-left:12px;margin:2px 0">\u2022 $1</div>')
    .replace(/\n/g, '<br/>');

/* ── Isometric helpers ── */
function IsoPlatform({ cx, cy, w, d, color, opacity }: { cx: number; cy: number; w: number; d: number; color: string; opacity: number }) {
  const hdx = w * 0.866 / 2, hdy = w * 0.5 / 2, ddx = d * 0.866 / 2, ddy = d * 0.5 / 2;
  const points = `${cx},${cy - hdy - ddy} ${cx + hdx + ddx},${cy} ${cx},${cy + hdy + ddy} ${cx - hdx - ddx},${cy}`;
  return <polygon points={points} fill={color} opacity={opacity} stroke={color} strokeWidth={0.8} strokeOpacity={0.3} style={{ transition: "opacity 0.3s" }} />;
}

function IsoCube({ cx, cy, size, color, label, delay, active }: {
  cx: number; cy: number; size: number; color: string; label: string; delay: number; active: boolean;
}) {
  const dx = size * 0.866, dy = size * 0.5;
  const top = `${cx},${cy - dy} ${cx + dx / 2},${cy - dy - dy / 2} ${cx},${cy - dy - dy} ${cx - dx / 2},${cy - dy - dy / 2}`;
  const left = `${cx - dx / 2},${cy - dy - dy / 2} ${cx},${cy - dy} ${cx},${cy} ${cx - dx / 2},${cy - dy / 2}`;
  const right = `${cx},${cy - dy} ${cx + dx / 2},${cy - dy - dy / 2} ${cx + dx / 2},${cy - dy / 2} ${cx},${cy}`;
  return (
    <g style={{ opacity: 0, animation: `engFadeIn 0.5s ease ${delay}s forwards` }}>
      <polygon points={right} fill={color} opacity={0.15} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />
      <polygon points={left} fill={color} opacity={0.25} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />
      <polygon points={top} fill={color} opacity={0.4} stroke={color} strokeWidth={0.5} strokeOpacity={0.5} />
      {active && (
        <text x={cx} y={cy - dy - dy - 8} textAnchor="middle" fill={color} fontSize={7} fontFamily={mono} fontWeight={500}
          style={{ opacity: 0, animation: "engFadeIn 0.3s ease 0.1s forwards" }}>{label}</text>
      )}
    </g>
  );
}

/* ── Layer definitions ── */
const LAYERS = [
  { id: "ingestion" as LayerKey, num: "01", title: "Data Ingestion", subtitle: "Veri toplama katmani", color: C.pink, cubes: ["Excel", "ERP", "CSV", "API"] },
  { id: "ontology" as LayerKey, num: "02", title: "Griseus Ontology", subtitle: "Baglanti katmani", color: C.amber, cubes: ["Worker", "Facility", "Operation", "Schedule"] },
  { id: "intelligence" as LayerKey, num: "03", title: "Intelligence Engine", subtitle: "Karar katmani", color: C.indigo, cubes: ["Simulasyon", "Darbogaz", "Optimizasyon", "Risk"] },
  { id: "applications" as LayerKey, num: "04", title: "Applications", subtitle: "Sonuc katmani", color: C.green, cubes: ["Digital Twin", "Efficiency", "Scheduling", "Trust"] },
];

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════ */

export default function EnginePage() {
  /* ── Layer state ── */
  const [activeLayer, setActiveLayer] = useState<LayerKey | null>(null);
  const [hoveredLayer, setHoveredLayer] = useState<LayerKey | null>(null);

  /* ── Applications layer data ── */
  const [summary, setSummary] = useState<any>(null);
  const [appChartTab, setAppChartTab] = useState<AppChartTab>("monthly");
  const [weeklyLineType, setWeeklyLineType] = useState<"elektrikli" | "gazli">("elektrikli");

  /* ── Intelligence layer state ── */
  const [intelTab, setIntelTab] = useState<IntelTab>("simulation");
  const [simLineId, setSimLineId] = useState(1);
  const [linesData, setLinesData] = useState<any[]>([]);
  const [simParams, setSimParams] = useState({ worker_count: 7, unit_time_min: 13, daily_hours: 9, monthly_days: 22, production_months: 10 });
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [bottleneckLineId, setBottleneckLineId] = useState(1);
  const [bottleneck, setBottleneck] = useState<BottleneckResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  /* ── Ontology layer state ── */
  const [ontoNode, setOntoNode] = useState<OntoNode>(null);
  const [ontoHover, setOntoHover] = useState<OntoNode>(null);
  const [workersData, setWorkersData] = useState<any[]>([]);
  const [wfRisk, setWfRisk] = useState<WorkforceRisk | null>(null);
  const [trustScores, setTrustScores] = useState<Record<number, any>>({});
  const [schedsData, setSchedsData] = useState<any[]>([]);
  const [opsData, setOpsData] = useState<any[]>([]);
  const [capsData, setCapsData] = useState<any[]>([]);
  const [forecastLineId, setForecastLineId] = useState(1);
  const [forecastPlanQty, setForecastPlanQty] = useState("");
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [currentWeekPlan, setCurrentWeekPlan] = useState<{ id: number; status: string; planned_qty: number; predicted_qty: number | null; actual_qty: number | null; realization_rate: string | null; week_label: string } | null | undefined>(undefined); // undefined=loading, null=no plan
  const [motorAccuracy, setMotorAccuracy] = useState<MotorAccuracy | null>(null);
  const [completeLoading, setCompleteLoading] = useState<number | null>(null);
  const [completeInputs, setCompleteInputs] = useState<Record<number, string>>({});
  const [deviationReasons, setDeviationReasons] = useState<Record<number, string>>({});
  const [deviationNotes, setDeviationNotes] = useState<Record<number, string>>({});
  const [justCompleted, setJustCompleted] = useState<Record<number, { actual: number; rate: number }>>({});
  const [riskPlans, setRiskPlans] = useState<any[]>([]);
  const [motorRecs, setMotorRecs] = useState<{ recommendations: any[]; generated_at: string; data_points: any } | null>(null);
  const [motorRecsLoading, setMotorRecsLoading] = useState(false);

  /* ── Upload state ── */
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── AI Chat state ── */
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "assistant"; content: string; tools?: string[] }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const aiScrollRef = useRef<HTMLDivElement>(null);

  /* ── Load fonts ── */
  useEffect(() => {
    if (!document.querySelector('link[href*="Outfit"]')) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = FONT_LINK; document.head.appendChild(link);
    }
  }, []);

  /* ── Fetch core data on mount ── */
  useEffect(() => {
    fetch("/api/v1/dashboard/summary").then(r => r.json()).then(setSummary).catch(() => {});
    fetch("/api/v1/facilities/1/lines").then(r => r.json()).then((lines: any[]) => {
      setLinesData(lines);
      if (lines[0]) {
        setSimParams({
          worker_count: lines[0].workerCount || 7,
          unit_time_min: lines[0].currentUnitTimeMin || 13,
          daily_hours: lines[0].dailyHours || 9,
          monthly_days: lines[0].monthlyDays || 22,
          production_months: lines[0].productionMonths || 10,
        });
      }
    }).catch(() => {});
  }, []);

  /* ── Simulation debounced fetch ── */
  const runSimulation = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch("/api/v1/simulate/capacity", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_id: simLineId, ...simParams }),
      }).then(r => r.json()).then(setSimResult).catch(() => {});
    }, 200);
  }, [simLineId, simParams]);

  useEffect(() => { if (activeLayer === "intelligence" && intelTab === "simulation") runSimulation(); }, [activeLayer, intelTab, runSimulation]);

  /* ── Bottleneck fetch ── */
  const fetchBottleneck = useCallback((lineId: number) => {
    fetch(`/api/v1/analyze/bottleneck/${lineId}`).then(r => r.json()).then(setBottleneck).catch(() => {});
  }, []);
  useEffect(() => { if (activeLayer === "intelligence" && intelTab === "bottleneck") fetchBottleneck(bottleneckLineId); }, [activeLayer, intelTab, bottleneckLineId, fetchBottleneck]);

  /* ── Ontology data loaders ── */
  const fetchWorkers = useCallback(() => {
    if (workersData.length > 0) return;
    fetch("/api/v1/workers").then(r => r.json()).then(d => setWorkersData(d.workers || d)).catch(() => {});
    fetch("/api/v1/analyze/workforce-risk/1").then(r => r.json()).then(setWfRisk).catch(() => {});
  }, [workersData.length]);

  const fetchSchedules = useCallback(() => {
    if (schedsData.length > 0) return;
    Promise.all([fetch("/api/v1/schedules?line_id=1").then(r => r.json()), fetch("/api/v1/schedules?line_id=2").then(r => r.json())])
      .then(([a, b]) => setSchedsData([...a, ...b])).catch(() => {});
  }, [schedsData.length]);

  const fetchOps = useCallback(() => {
    if (opsData.length > 0) return;
    Promise.all([fetch("/api/v1/lines/1/operations").then(r => r.json()), fetch("/api/v1/lines/2/operations").then(r => r.json())])
      .then(([a, b]) => setOpsData([...a, ...b])).catch(() => {});
  }, [opsData.length]);

  const fetchCaps = useCallback(() => {
    if (capsData.length > 0) return;
    Promise.all([fetch("/api/v1/lines/1/capacity").then(r => r.json()), fetch("/api/v1/lines/2/capacity").then(r => r.json())])
      .then(([a, b]) => setCapsData([...a, ...b])).catch(() => {});
  }, [capsData.length]);

  const fetchTrustScore = useCallback((wId: number) => {
    if (trustScores[wId]) return;
    fetch(`/api/v1/score/trust/${wId}`).then(r => r.json()).then(d => setTrustScores(prev => ({ ...prev, [wId]: d }))).catch(() => {});
  }, [trustScores]);

  /* ── Forecast ── */
  const runForecast = useCallback(async () => {
    const qty = Number(forecastPlanQty);
    if (!qty || qty <= 0) return;
    setForecastLoading(true); setPlanSaved(false);
    try {
      const r = await fetch("/api/v1/forecast/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: forecastLineId, planned_qty: qty }) });
      setForecastResult(await r.json());
    } catch { /* */ }
    setForecastLoading(false);
  }, [forecastLineId, forecastPlanQty]);

  /* ── Motor Accuracy & Plans ── */
  const fetchMotorAccuracy = useCallback(() => {
    fetch("/api/v1/plans/accuracy").then(r => r.json()).then(setMotorAccuracy).catch(() => {});
  }, []);

  const currentWeekLabel = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-H${String(weekNum).padStart(2, "0")}`;
  })();

  const fetchCurrentWeekPlan = useCallback((lineId: number) => {
    setCurrentWeekPlan(undefined);
    fetch(`/api/v1/plans?line_id=${lineId}`, { credentials: "include" })
      .then(r => r.json())
      .then((plans: any[]) => {
        const match = plans.find((p: any) => p.weekLabel === currentWeekLabel);
        setCurrentWeekPlan(match ? { id: match.id, status: match.status, planned_qty: match.plannedQty, predicted_qty: match.predictedQty, actual_qty: match.actualQty, realization_rate: match.realizationRate, week_label: match.weekLabel } : null);
      })
      .catch(() => setCurrentWeekPlan(null));
  }, [currentWeekLabel]);

  const completePlan = useCallback(async (planId: number) => {
    const val = completeInputs[planId];
    if (!val || Number(val) <= 0) return;
    setCompleteLoading(planId);
    try {
      const body: any = { actual_qty: Number(val) };
      if (deviationReasons[planId]) body.deviation_reason = deviationReasons[planId];
      if (deviationNotes[planId]) body.deviation_notes = deviationNotes[planId];
      const r = await fetch(`/api/v1/plans/${planId}/complete`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (r.ok) {
        const data = await r.json();
        setJustCompleted(prev => ({ ...prev, [planId]: { actual: Number(val), rate: Math.round((data.realization_rate || 0) * 100) } }));
        setCompleteInputs(prev => { const n = { ...prev }; delete n[planId]; return n; });
        setDeviationReasons(prev => { const n = { ...prev }; delete n[planId]; return n; });
        setDeviationNotes(prev => { const n = { ...prev }; delete n[planId]; return n; });
        fetchMotorAccuracy();
      }
    } catch { /* */ }
    setCompleteLoading(null);
  }, [completeInputs, deviationReasons, deviationNotes, fetchMotorAccuracy]);

  /* ── AI Chat ── */
  const sendAiMessage = useCallback(async () => {
    const msg = aiInput.trim();
    if (!msg || aiLoading) return;
    setAiInput(""); setAiError("");
    const newMsgs = [...aiMessages, { role: "user" as const, content: msg }];
    setAiMessages(newMsgs);
    setAiLoading(true);
    try {
      const history = aiMessages.map(m => ({ role: m.role, content: m.content }));
      const resp = await fetch("/api/v1/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg, history }) });
      const data = await resp.json();
      if (!resp.ok) { setAiError(data.error || "Hata"); setAiLoading(false); return; }
      setAiMessages([...newMsgs, { role: "assistant", content: data.response, tools: data.tools_used }]);
    } catch { setAiError("AI Assistant'a baglanilamadi."); }
    setAiLoading(false);
  }, [aiInput, aiLoading, aiMessages]);

  useEffect(() => { if (aiScrollRef.current) aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight; }, [aiMessages, aiLoading]);

  /* ── Upload handler ── */
  const handleUpload = useCallback(async () => {
    if (!uploadFile) return;
    setUploadLoading(true); setUploadResult(null); setUploadError("");
    try {
      const fd = new FormData(); fd.append("file", uploadFile);
      const r = await fetch("/api/v1/ingest/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.success) {
        setUploadResult(d);
        localStorage.setItem("griseus_last_upload", JSON.stringify({ name: uploadFile.name, date: new Date().toLocaleString("tr-TR") }));
      } else { setUploadError(d.error || "Hata"); }
    } catch { setUploadError("Yukleme hatasi"); }
    setUploadLoading(false);
  }, [uploadFile]);

  /* ── Layer click handler ── */
  const fetchRiskPlans = useCallback(() => {
    fetch("/api/v1/plans/risk", { credentials: "include" }).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setRiskPlans(data);
    }).catch(() => {});
  }, []);

  const fetchMotorRecs = useCallback(() => {
    setMotorRecsLoading(true);
    fetch("/api/v1/motor/recommendations", { credentials: "include" }).then(r => r.json()).then(data => {
      setMotorRecs(data);
    }).catch(() => {}).finally(() => setMotorRecsLoading(false));
  }, []);

  const handleLayerClick = (id: LayerKey) => {
    if (activeLayer === id) { setActiveLayer(null); return; }
    setActiveLayer(id);
    setOntoNode(null);
    if (id === "ontology") { fetchWorkers(); fetchSchedules(); fetchOps(); fetchCaps(); fetchMotorAccuracy(); }
    if (id === "applications") { fetchRiskPlans(); fetchMotorRecs(); }
  };

  /* ── Ontology node click ── */
  const handleOntoNodeClick = (key: OntoNode) => {
    setOntoNode(prev => prev === key ? null : key);
    if (key === "workers") workersData.slice(0, 5).forEach((w: any) => fetchTrustScore(w.id));
    if (key === "schedules") fetchCurrentWeekPlan(forecastLineId);
  };

  /* ── Sim line change ── */
  const handleSimLineChange = (lineId: number) => {
    setSimLineId(lineId);
    const line = linesData.find((l: any) => l.id === lineId);
    if (line) {
      setSimParams({
        worker_count: line.workerCount || 7,
        unit_time_min: line.currentUnitTimeMin || 13,
        daily_hours: line.dailyHours || 9,
        monthly_days: line.monthlyDays || 22,
        production_months: line.productionMonths || 10,
      });
    }
  };

  /* ── Iso diagram constants ── */
  const CX = 260, BASE_Y = 380, GAP = 100, PW = 180, PD = 70;

  /* ── Derived data ── */
  const entityCounts = summary ? {
    facilities: 1, lines: summary.lines?.length || 2, products: 21,
    workers: 16, operations: 24, schedules: 23,
  } : null;

  const activeLayerDef = LAYERS.find(l => l.id === activeLayer);

  /* ════════════════════════════════════════════ RENDER ════════════════════════════════════════════ */
  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: sans, color: C.white, display: "flex", flexDirection: "column" }}>

      {/* ════ HEADER ════ */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.cardBorder}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 21, fontWeight: 700 }}>Griseus Engine</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 600, color: C.green }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}`, animation: "engPulse 2s ease-in-out infinite" }} />
            Live
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { setAiOpen(true); setActiveLayer(null); }}
            style={{ padding: "6px 14px", fontSize: 17, fontWeight: 600, fontFamily: mono, background: "rgba(52,211,153,0.1)",
              border: "1px solid rgba(52,211,153,0.25)", borderRadius: 8, color: C.green, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(52,211,153,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(52,211,153,0.1)"; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            AI Assistant
          </button>
          <button onClick={() => { setUploadOpen(true); setUploadFile(null); setUploadResult(null); setUploadError(""); }}
            style={{ padding: "6px 14px", fontSize: 17, fontWeight: 600, fontFamily: mono, background: "rgba(129,140,248,0.1)",
              border: "1px solid rgba(129,140,248,0.25)", borderRadius: 8, color: C.indigo, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(129,140,248,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(129,140,248,0.1)"; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Dosya Yukle
          </button>
          <button onClick={async () => {
            if (!window.confirm("Tum veriyi sifirlayip seed verilerine donmek istediginize emin misiniz?")) return;
            try {
              const r = await fetch("/api/v1/ingest/reset", { method: "POST" });
              const j = await r.json();
              if (j.success) window.location.reload();
              else alert("Hata: " + j.error);
            } catch (e: any) { alert("Hata: " + e.message); }
          }}
            style={{ padding: "6px 14px", fontSize: 17, fontWeight: 600, fontFamily: mono, background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, color: "#ef4444", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 119 9"/><path d="M3 3v9h9"/></svg>
            Sifirla
          </button>
          <span style={{ fontSize: 17, color: C.mid, fontWeight: 500 }}>Cukurova Isi</span>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, display: "inline-block", boxShadow: `0 0 6px ${C.green}`, animation: "engPulse 2s ease-in-out infinite" }} />
        </div>
      </div>

      {/* ════ MAIN: DIAGRAM + PANEL ════ */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", overflow: "hidden" }}>

        {/* ── LEFT: Isometric Diagram ── */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", minHeight: 520 }}
          onClick={(e) => { if ((e.target as Element).tagName === "DIV") { setActiveLayer(null); setAiOpen(false); } }}>
          {/* Scan line */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent, ${C.indigo}40, transparent)`,
            animation: "engScan 7s linear infinite", pointerEvents: "none", zIndex: 2 }} />

          <svg viewBox="0 0 560 460" style={{ width: "100%", maxWidth: 580, display: "block" }}>
            {/* Connection lines between layers */}
            {[0, 1, 2].map(i => {
              const y1 = BASE_Y - i * GAP, y2 = BASE_Y - (i + 1) * GAP;
              return (
                <g key={`conn-${i}`}>
                  <line x1={CX} y1={y1 - 18} x2={CX} y2={y2 + 18} stroke={C.dim} strokeWidth={1} strokeDasharray="3 6" style={{ animation: "engDash 1.5s linear infinite" }} />
                  <circle cx={CX} cy={y1 - 18} r={2.5} fill={LAYERS[i + 1].color}>
                    <animate attributeName="cy" values={`${y1 - 18};${y2 + 18}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}

            {/* Layers */}
            {LAYERS.map((layer, i) => {
              const cy = BASE_Y - i * GAP;
              const isActive = activeLayer === layer.id;
              const isHovered = hoveredLayer === layer.id;
              const anyActive = activeLayer !== null;
              const platOpacity = isActive ? 0.22 : isHovered ? 0.13 : anyActive ? 0.03 : 0.06;
              const groupOpacity = anyActive && !isActive ? 0.4 : 1;
              const cubeSpacing = 50;
              const cubeStartX = CX - ((layer.cubes.length - 1) * cubeSpacing) / 2;

              return (
                <g key={layer.id} style={{ cursor: "pointer", opacity: groupOpacity, transition: "opacity 0.3s" }}
                  onClick={() => handleLayerClick(layer.id)}
                  onMouseEnter={() => setHoveredLayer(layer.id)}
                  onMouseLeave={() => setHoveredLayer(null)}>
                  <IsoPlatform cx={CX} cy={cy} w={PW} d={PD} color={layer.color} opacity={platOpacity} />
                  {(isActive || isHovered) && (
                    <ellipse cx={CX} cy={cy} rx={PW * 0.5} ry={PD * 0.35} fill={layer.color} opacity={isActive ? 0.08 : 0.04}
                      style={{ filter: "blur(20px)", pointerEvents: "none" }} />
                  )}
                  {layer.cubes.map((cube, ci) => (
                    <IsoCube key={cube} cx={cubeStartX + ci * cubeSpacing} cy={cy - 8}
                      size={20} color={layer.color} label={cube}
                      delay={0.3 + i * 0.15 + ci * 0.08} active={isActive || isHovered} />
                  ))}
                  <text x={CX - PW * 0.55} y={cy + 5} textAnchor="end"
                    fill={isActive ? layer.color : C.dim} fontSize={20} fontFamily={mono} fontWeight={700}
                    opacity={isActive ? 1 : 0.35} style={{ transition: "all 0.3s" }}>{layer.num}</text>
                  <g>
                    {isActive && (
                      <line x1={CX + PW * 0.55 + 8} y1={cy - 12} x2={CX + PW * 0.55 + 8} y2={cy + 12}
                        stroke={layer.color} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
                    )}
                    <text x={CX + PW * 0.55 + (isActive ? 18 : 14)} y={cy - 3}
                      fill={isActive ? C.white : C.mid} fontSize={11} fontFamily={sans} fontWeight={600}
                      style={{ transition: "fill 0.3s" }}>{layer.title}</text>
                    <text x={CX + PW * 0.55 + (isActive ? 18 : 14)} y={cy + 11}
                      fill={C.dim} fontSize={9} fontFamily={sans}>{layer.subtitle}</text>
                  </g>
                </g>
              );
            })}

            {/* Core diamond */}
            <g style={{ animation: "engFloat 3s ease-in-out infinite" }}>
              <polygon points={`${CX},${BASE_Y - 2 * GAP - 26} ${CX + 8},${BASE_Y - 2 * GAP - 18} ${CX},${BASE_Y - 2 * GAP - 10} ${CX - 8},${BASE_Y - 2 * GAP - 18}`}
                fill={C.indigo} opacity={0.6} stroke={C.indigo} strokeWidth={0.5} />
            </g>
          </svg>
        </div>

        {/* ── RIGHT: Context Panel ── */}
        <div style={{ borderLeft: `1px solid ${C.cardBorder}`, background: C.surface, overflowY: "auto", padding: 20 }}>

          {/* ── AI Chat Panel ── */}
          {aiOpen ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 21, fontWeight: 700 }}>Griseus AI</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 600, color: C.green }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />Live
                  </span>
                </div>
                <button onClick={() => setAiOpen(false)} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 22 }}>✕</button>
              </div>

              <div ref={aiScrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                {aiMessages.length === 0 && !aiError && (
                  <div style={{ textAlign: "center", marginTop: 32 }}>
                    <div style={{ fontSize: 34, marginBottom: 10 }}>🤖</div>
                    <div style={{ fontSize: 17, color: C.mid, marginBottom: 16 }}>Uretim verilerine dayali sorular sorun</div>
                    {["Bu hafta ne planlamaliyim?", "Darbogaz nerede?", "En kritik calisanim kim?", "Kapasiteyi artirmak icin ne yapmaliyim?"].map(q => (
                      <button key={q} onClick={() => setAiInput(q)} style={{
                        display: "block", width: "100%", textAlign: "left", marginBottom: 6,
                        background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8,
                        padding: "8px 12px", fontSize: 15, color: C.mid, cursor: "pointer", fontFamily: sans,
                      }}>{q}</button>
                    ))}
                  </div>
                )}
                {aiMessages.map((m, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "85%", padding: "10px 14px", borderRadius: 12, fontSize: 17, lineHeight: 1.7, fontFamily: sans,
                      whiteSpace: m.role === "user" ? "pre-wrap" : undefined,
                      background: m.role === "user" ? "rgba(99,102,241,0.2)" : C.card,
                      border: m.role === "user" ? "1px solid rgba(99,102,241,0.3)" : `1px solid ${C.cardBorder}`,
                      color: m.role === "user" ? "#c7d2fe" : C.white,
                    }}>
                      {m.role === "user" ? m.content : <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />}
                    </div>
                    {m.tools && m.tools.length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                        {m.tools.map((t, j) => (
                          <span key={j} style={{ fontSize: 13, fontFamily: mono, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
                            borderRadius: 4, padding: "2px 6px", color: C.green }}>📊 {t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {aiLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, alignSelf: "flex-start" }}>
                    <span style={{ animation: "engPulse 1.5s ease-in-out infinite", fontSize: 17 }}>●</span>
                    <span style={{ fontSize: 15, color: C.mid }}>Dusunuyor...</span>
                  </div>
                )}
                {aiError && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, fontSize: 15, color: C.err }}>{aiError}</div>}
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                  placeholder="Bir soru sorun..."
                  style={{ flex: 1, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 17, color: C.white, fontFamily: sans, outline: "none" }} />
                <button onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()}
                  style={{ padding: "10px 16px", background: aiInput.trim() ? "rgba(52,211,153,0.15)" : C.card,
                    border: `1px solid ${aiInput.trim() ? "rgba(52,211,153,0.3)" : C.cardBorder}`, borderRadius: 8,
                    color: aiInput.trim() ? C.green : C.dim, cursor: aiInput.trim() ? "pointer" : "default", fontSize: 17, fontWeight: 600 }}>
                  Gonder
                </button>
              </div>
            </div>

          /* ── LAYER 04: Applications ── */
          ) : activeLayer === "applications" ? (
            <div key="applications" style={{ animation: "engSlideIn 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 14, fontWeight: 600, background: `${C.green}15`, color: C.green, border: `1px solid ${C.green}30` }}>04</span>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Sonuclar</span>
                </div>
                <button onClick={() => setActiveLayer(null)} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 22 }}>✕</button>
              </div>

              {/* Risk warning card */}
              {riskPlans.length > 0 && (
                <div style={{
                  padding: "12px 14px", borderRadius: 10, marginBottom: 14,
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>⚠</span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: C.err }}>
                      {riskPlans.length} plan %70 alti gerceklesme
                    </span>
                  </div>
                  {riskPlans.slice(0, 3).map((p: any) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", fontSize: 14, fontFamily: mono, borderBottom: `1px solid rgba(239,68,68,0.1)` }}>
                      <span style={{ color: C.mid }}>{p.weekLabel} · Hat {p.lineId}</span>
                      <span style={{ color: C.err, fontWeight: 700 }}>%{Math.round(parseFloat(p.realizationRate || "0") * 100)} gerceklesme</span>
                    </div>
                  ))}
                </div>
              )}

              {summary ? (() => {
                const eL = summary.lines?.find((l: any) => l.type === "elektrikli");
                const gL = summary.lines?.find((l: any) => l.type === "gazli");
                const weeklyE = summary.weeklySchedules?.elektrikli || [];
                const weeklyG = summary.weeklySchedules?.gazli || [];
                const eDelivered = weeklyE.reduce((s: number, w: any) => s + (w.gercek || 0), 0);
                const ePlanned = weeklyE.reduce((s: number, w: any) => s + (w.plan || 0), 0);
                const gDelivered = weeklyG.reduce((s: number, w: any) => s + (w.gercek || 0), 0);
                const gPlanned = weeklyG.reduce((s: number, w: any) => s + (w.plan || 0), 0);
                const ePct = ePlanned ? Math.round(eDelivered / ePlanned * 100) : 0;
                const gPct = gPlanned ? Math.round(gDelivered / gPlanned * 100) : 0;
                const weeklyData = weeklyLineType === "elektrikli" ? weeklyE : weeklyG;
                const lineColor = weeklyLineType === "elektrikli" ? C.indigo : C.pink;
                return (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                      <MetricCard value={fmt(summary.totalProduction || 0)} label="Toplam Uretim" color={C.green} />
                      <MetricCard value={fmt(eL?.totalOutput || 0)} label="Elektrikli Hat" color={C.indigo} />
                      <MetricCard value={fmt(gL?.totalOutput || 0)} label="Gazli Hat" color={C.pink} />
                      <MetricCard value={fmt(summary.peakMonth?.total || 0)} label={`Pik Ay (${summary.peakMonth?.ay || ""})`} color={C.amber} />
                    </div>

                    <PanelSection title="Kapasite Kullanimi" color={C.green}>
                      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 8 }}>
                        {(summary.lines || []).map((line: any) => (
                          <div key={line.id} style={{ textAlign: "center" }}>
                            <Ring pct={line.utilizationPct || 0} color={line.type === "elektrikli" ? C.indigo : C.pink} />
                            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>%{Math.round(line.utilizationPct || 0)}</div>
                            <div style={{ fontSize: 13, color: C.mid }}>{line.name}</div>
                            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{line.workerCount} kisi · {line.currentUnitTimeMin}dk</div>
                          </div>
                        ))}
                      </div>
                    </PanelSection>

                    <PanelSection title="Teslimat Orani" color={C.green}>
                      {[{ label: "Elektrikli", pct: ePct, delivered: eDelivered, planned: ePlanned, color: C.indigo },
                        { label: "Gazli", pct: gPct, delivered: gDelivered, planned: gPlanned, color: C.pink }].map(d => (
                        <div key={d.label} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 3 }}>
                            <span style={{ color: C.mid }}>{d.label}</span>
                            <span style={{ fontFamily: mono, color: d.color }}>%{d.pct} ({fmt(d.delivered)}/{fmt(d.planned)})</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(d.pct, 100)}%`, background: d.color, borderRadius: 3, transition: "width 0.6s ease" }} />
                          </div>
                        </div>
                      ))}
                    </PanelSection>

                    {/* Chart tabs */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                      {([["monthly", "Aylik Uretim"], ["weekly", "Haftalik Plan vs Gercek"]] as [AppChartTab, string][]).map(([k, lbl]) => (
                        <button key={k} onClick={() => setAppChartTab(k)} style={{
                          padding: "5px 10px", fontSize: 14, fontWeight: 600, fontFamily: sans, cursor: "pointer",
                          background: appChartTab === k ? `${C.green}12` : "transparent",
                          border: `1px solid ${appChartTab === k ? C.green + "30" : C.cardBorder}`,
                          borderRadius: 6, color: appChartTab === k ? C.green : C.mid,
                        }}>{lbl}</button>
                      ))}
                    </div>

                    {appChartTab === "monthly" && summary.monthlyData?.length > 0 && (
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={summary.monthlyData} barGap={1}>
                          <XAxis dataKey="ay" tick={{ fontSize: 13, fill: C.dim }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.cardBorder}`, borderRadius: 8, fontSize: 15, fontFamily: mono }} />
                          <Bar dataKey="e" fill={C.indigo} radius={[3, 3, 0, 0]} name="Elektrikli" />
                          <Bar dataKey="g" fill={C.pink} radius={[3, 3, 0, 0]} name="Gazli" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}

                    {appChartTab === "weekly" && (
                      <>
                        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                          {(["elektrikli", "gazli"] as const).map(t => (
                            <button key={t} onClick={() => setWeeklyLineType(t)} style={{
                              padding: "4px 10px", fontSize: 13, fontFamily: mono, fontWeight: 600, borderRadius: 5, cursor: "pointer",
                              background: weeklyLineType === t ? `${t === "elektrikli" ? C.indigo : C.pink}15` : "transparent",
                              border: `1px solid ${weeklyLineType === t ? (t === "elektrikli" ? C.indigo : C.pink) + "40" : C.cardBorder}`,
                              color: weeklyLineType === t ? (t === "elektrikli" ? C.indigo : C.pink) : C.dim,
                            }}>{t === "elektrikli" ? "Elektrikli" : "Gazli"}</button>
                          ))}
                        </div>
                        {weeklyData.length > 0 && (
                          <ResponsiveContainer width="100%" height={160}>
                            <AreaChart data={weeklyData}>
                              <defs>
                                <linearGradient id="gPlan" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
                                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gReal" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={C.green} stopOpacity={0.15} />
                                  <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                              <XAxis dataKey="h" tick={{ fill: C.dim, fontSize: 13 }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: C.dim, fontSize: 13, fontFamily: mono }} axisLine={false} tickLine={false} width={40} />
                              <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.cardBorder}`, borderRadius: 8, fontSize: 14, fontFamily: mono }} />
                              <Area type="monotone" dataKey="plan" name="Plan" stroke={lineColor} fill="url(#gPlan)" strokeWidth={2} dot={false} />
                              <Area type="monotone" dataKey="gercek" name="Gercek" stroke={C.green} fill="url(#gReal)" strokeWidth={2} dot={false} />
                              <Legend verticalAlign="top" align="right" height={28} formatter={(v: string) => <span style={{ color: C.mid, fontSize: 14 }}>{v}</span>} />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </>
                    )}
                  </>
                );
              })() : (
                <div style={{ textAlign: "center", padding: 40, color: C.dim }}>Yukleniyor...</div>
              )}

              {/* Motor Önerileri */}
              <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 12, background: "rgba(129,140,248,0.04)", border: `1px solid rgba(129,140,248,0.15)` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>⚡</span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: C.indigo }}>Motor Onerileri</span>
                  </div>
                  <button onClick={fetchMotorRecs} disabled={motorRecsLoading}
                    style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontFamily: mono, cursor: "pointer",
                      background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", color: C.indigo }}>
                    {motorRecsLoading ? "..." : "Yenile"}
                  </button>
                </div>

                {motorRecsLoading ? (
                  <div style={{ textAlign: "center", padding: 20, color: C.dim, fontSize: 14 }}>Analiz ediliyor...</div>
                ) : motorRecs && motorRecs.recommendations.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {motorRecs.recommendations.map((rec: any, i: number) => {
                      const priorityMap = {
                        red: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", color: C.err, label: "Kritik" },
                        yellow: { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.2)", color: C.amber, label: "Uyari" },
                        green: { bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.2)", color: C.green, label: "Firsat" },
                      };
                      const p = priorityMap[rec.priority as keyof typeof priorityMap] || priorityMap.yellow;
                      return (
                        <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: p.bg, border: `1px solid ${p.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, fontFamily: mono,
                              background: p.color, color: "#000", letterSpacing: 0.5 }}>{p.label}</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: C.white, lineHeight: 1.3 }}>{rec.title}</span>
                          </div>
                          <div style={{ fontSize: 14, color: C.mid, lineHeight: 1.5, marginBottom: 4 }}>{rec.reason}</div>
                          <div style={{ fontSize: 13, color: p.color, fontFamily: mono, fontWeight: 600 }}>↳ {rec.impact}</div>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 10, color: C.dim, fontFamily: mono, textAlign: "right" }}>
                      {motorRecs.data_points.plans} plan · {motorRecs.data_points.schedules} schedule · {new Date(motorRecs.generated_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: 16, color: C.dim, fontSize: 14 }}>
                    Henuz yeterli veri yok. Plan ekleyip tamamladikca oneriler olusacak.
                  </div>
                )}
              </div>
            </div>

          /* ── LAYER 03: Intelligence ── */
          ) : activeLayer === "intelligence" ? (
            <div key="intelligence" style={{ animation: "engSlideIn 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 14, fontWeight: 600, background: `${C.indigo}15`, color: C.indigo, border: `1px solid ${C.indigo}30` }}>03</span>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Analiz</span>
                </div>
                <button onClick={() => setActiveLayer(null)} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 22 }}>✕</button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                {(["simulation", "bottleneck"] as IntelTab[]).map(tab => (
                  <button key={tab} onClick={() => setIntelTab(tab)} style={{
                    padding: "6px 14px", fontSize: 15, fontWeight: 600, fontFamily: sans, cursor: "pointer",
                    background: intelTab === tab ? "rgba(129,140,248,0.12)" : "transparent",
                    border: intelTab === tab ? `1px solid rgba(129,140,248,0.3)` : `1px solid ${C.cardBorder}`,
                    borderRadius: 6, color: intelTab === tab ? C.indigo : C.mid, transition: "all 0.2s",
                  }}>{tab === "simulation" ? "Simulasyon" : "Darbogaz"}</button>
                ))}
              </div>

              {intelTab === "simulation" ? (
                <>
                  {/* Line toggle */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                    {linesData.map((line: any) => (
                      <button key={line.id} onClick={() => handleSimLineChange(line.id)} style={{
                        padding: "5px 12px", fontSize: 14, fontWeight: 600, fontFamily: mono, cursor: "pointer",
                        background: simLineId === line.id ? `${C.indigo}15` : "transparent",
                        border: `1px solid ${simLineId === line.id ? C.indigo + "40" : C.cardBorder}`,
                        borderRadius: 6, color: simLineId === line.id ? C.indigo : C.dim,
                      }}>{line.name || `Hat ${line.id}`}</button>
                    ))}
                  </div>

                  <Slider label="Calisan Sayisi" value={simParams.worker_count} min={1} max={20} step={1} unit="kisi" onChange={v => { setSimParams(p => ({ ...p, worker_count: v })); runSimulation(); }} />
                  <Slider label="Birim Sure" value={simParams.unit_time_min} min={5} max={30} step={0.5} unit="dk" onChange={v => { setSimParams(p => ({ ...p, unit_time_min: v })); runSimulation(); }} />
                  <Slider label="Gunluk Saat" value={simParams.daily_hours} min={4} max={16} step={0.5} unit="sa" onChange={v => { setSimParams(p => ({ ...p, daily_hours: v })); runSimulation(); }} />
                  <Slider label="Aylik Gun" value={simParams.monthly_days} min={15} max={30} step={1} unit="gun" onChange={v => { setSimParams(p => ({ ...p, monthly_days: v })); runSimulation(); }} />
                  <Slider label="Uretim Sezonu" value={simParams.production_months} min={6} max={12} step={1} unit="ay" onChange={v => { setSimParams(p => ({ ...p, production_months: v })); runSimulation(); }} />

                  {simResult && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <MetricCard value={fmt(simResult.simulated.yearly_capacity)} label="Yillik" color={C.indigo} />
                        <MetricCard value={fmt(simResult.simulated.daily_capacity)} label="Gunluk" color={C.indigo} />
                        <MetricCard value={`${simResult.delta.percent >= 0 ? "+" : ""}${simResult.delta.percent.toFixed(1)}%`}
                          label={`${simResult.delta.units >= 0 ? "+" : ""}${fmt(simResult.delta.units)}`}
                          color={simResult.delta.percent >= 0 ? C.green : C.err} />
                      </div>

                      {/* Capacity utilization rings: baseline vs simulated */}
                      <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 12, padding: "8px 0" }}>
                        <div style={{ textAlign: "center" }}>
                          <Ring pct={simResult.baseline.utilization_pct} color={C.dim} size={52} stroke={4} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.dim, marginTop: 2 }}>%{Math.round(simResult.baseline.utilization_pct)}</div>
                          <div style={{ fontSize: 11, color: C.dim }}>Mevcut</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", color: C.dim, fontSize: 22 }}>→</div>
                        <div style={{ textAlign: "center" }}>
                          <Ring pct={simResult.simulated.utilization_pct} color={simResult.delta.percent >= 0 ? C.green : C.err} size={52} stroke={4} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: simResult.delta.percent >= 0 ? C.green : C.err, marginTop: 2 }}>%{Math.round(simResult.simulated.utilization_pct)}</div>
                          <div style={{ fontSize: 11, color: C.dim }}>Simulasyon</div>
                        </div>
                      </div>

                      {/* Bottleneck warning */}
                      {(() => {
                        const line = linesData.find((l: any) => l.id === simLineId);
                        if (!line) return null;
                        const cap = line.capacityUnitTimeMin || 0;
                        const cur = simParams.unit_time_min || 0;
                        if (cur <= cap || cap === 0) return null;
                        const pct = ((cur - cap) / cap * 100).toFixed(0);
                        return (
                          <div style={{ padding: 10, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, marginBottom: 10 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.amber, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                              ⚠ Darbogaz Uyarisi
                            </div>
                            <div style={{ fontSize: 14, color: C.mid, lineHeight: 1.5 }}>
                              Birim sure ({cur}dk) teorik kapasiteden ({cap}dk) <strong style={{ color: C.amber }}>%{pct}</strong> daha yavas. Bu hat darbogaz olusturuyor.
                            </div>
                          </div>
                        );
                      })()}

                      {simResult.insights.map((ins, i) => (
                        <div key={i} style={{ fontSize: 15, color: C.mid, padding: "4px 0", lineHeight: 1.5 }}>• {ins}</div>
                      ))}
                    </div>
                  )}

                  {/* Preset scenarios */}
                  <PanelSection title="Hizli Senaryolar" color={C.indigo}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { label: "Fazla Mesai", desc: "+2 saat/gun", params: { daily_hours: (simParams.daily_hours || 9) + 2 } },
                        { label: "Ek Calisan", desc: "+3 kisi", params: { worker_count: (simParams.worker_count || 7) + 3 } },
                        { label: "Verimlilik", desc: "-2dk birim sure", params: { unit_time_min: Math.max(5, (simParams.unit_time_min || 13) - 2) } },
                      ].map(s => (
                        <button key={s.label} onClick={() => { setSimParams(p => ({ ...p, ...s.params })); runSimulation(); }}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 12px", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8,
                            color: C.white, cursor: "pointer", fontFamily: sans, fontSize: 15, textAlign: "left" }}>
                          <span style={{ fontWeight: 600 }}>{s.label}</span>
                          <span style={{ fontSize: 14, color: C.dim }}>{s.desc}</span>
                        </button>
                      ))}
                    </div>
                  </PanelSection>
                </>
              ) : (
                /* Bottleneck tab */
                <>
                  <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                    {linesData.map((line: any) => (
                      <button key={line.id} onClick={() => { setBottleneckLineId(line.id); fetchBottleneck(line.id); }} style={{
                        padding: "5px 12px", fontSize: 14, fontWeight: 600, fontFamily: mono, cursor: "pointer",
                        background: bottleneckLineId === line.id ? `${C.amber}15` : "transparent",
                        border: `1px solid ${bottleneckLineId === line.id ? C.amber + "40" : C.cardBorder}`,
                        borderRadius: 6, color: bottleneckLineId === line.id ? C.amber : C.dim,
                      }}>{line.name || `Hat ${line.id}`}</button>
                    ))}
                  </div>

                  {bottleneck ? (
                    <>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                        <SeverityBadge level={bottleneck.bottleneck_severity} />
                        <span style={{ fontSize: 15, color: C.mid }}>{bottleneck.line_name}</span>
                        <span style={{ fontSize: 14, fontFamily: mono, color: bottleneck.trend === "improving" ? C.green : bottleneck.trend === "declining" ? C.err : C.amber, marginLeft: "auto" }}>
                          {bottleneck.trend === "improving" ? "↑ Iyilesiyor" : bottleneck.trend === "declining" ? "↓ Kotuye" : "→ Stabil"}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <MetricCard value={String(bottleneck.total_weeks)} label="Toplam Hafta" color={C.white} />
                        <MetricCard value={String(bottleneck.on_track_weeks)} label="Hedefteki" color={C.green} />
                        <MetricCard value={String(bottleneck.critical_weeks)} label="Kritik" color={C.err} />
                      </div>

                      <div style={{ padding: 12, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.err, marginBottom: 6, fontFamily: mono }}>EN KOTU HAFTA</div>
                        <div style={{ fontSize: 15, color: C.mid }}>
                          {bottleneck.worst_week.period_value}: Plan {bottleneck.worst_week.planned} → Gercek {bottleneck.worst_week.actual}
                          <span style={{ color: C.err, fontWeight: 600 }}> ({bottleneck.worst_week.deviation_pct.toFixed(1)}%)</span>
                        </div>
                      </div>

                      {bottleneck.insights.map((ins, i) => (
                        <div key={i} style={{ fontSize: 15, color: C.mid, padding: "4px 0", lineHeight: 1.5 }}>• {ins}</div>
                      ))}
                    </>
                  ) : (
                    <div style={{ textAlign: "center", padding: 40, color: C.dim }}>Yukleniyor...</div>
                  )}
                </>
              )}
            </div>

          /* ── LAYER 02: Ontology ── */
          ) : activeLayer === "ontology" ? (
            <div key="ontology" style={{ animation: "engSlideIn 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 14, fontWeight: 600, background: `${C.amber}15`, color: C.amber, border: `1px solid ${C.amber}30` }}>02</span>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Ontology</span>
                </div>
                <button onClick={() => setActiveLayer(null)} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 22 }}>✕</button>
              </div>

              {/* ── Mini Ontology Node-Link Map ── */}
              {(() => {
                const eOut = summary?.lines?.[0]?.totalOutput || 0;
                const gOut = summary?.lines?.[1]?.totalOutput || 0;
                const nds: { key: OntoNode; label: string; sub: string; color: string; x: number; y: number }[] = [
                  { key: "facility", label: "Cukurova Isi", sub: "Gebze · Aktif", color: C.green, x: 0, y: 0 },
                  { key: "elektrikli", label: "Elektrikli Hat", sub: `${fmt(eOut)} uretim`, color: C.indigo, x: -140, y: 80 },
                  { key: "gazli", label: "Gazli Hat", sub: `${fmt(gOut)} uretim`, color: C.pink, x: 140, y: 80 },
                  { key: "workers", label: `${workersData.length || 16} Calisan`, sub: "6 dept", color: C.amber, x: 0, y: -90 },
                  { key: "operations", label: "24 Operasyon", sub: `${fmt(summary?.totalProduction || 0)} toplam`, color: C.pink, x: -170, y: 170 },
                  { key: "products", label: "21 Urun", sub: "E + G", color: "#a78bfa", x: 0, y: 180 },
                  { key: "schedules", label: `${schedsData.length || 23} Cizelge`, sub: "Haftalik", color: "#fb923c", x: 170, y: 170 },
                  { key: "capacity", label: "Kapasite", sub: "%64 / %87", color: "#38bdf8", x: 195, y: -30 },
                  { key: "kpi", label: "KPI", sub: "Tanimlanmadi", color: "#f87171", x: -195, y: -40 },
                ];
                const eds = [
                  { from: "facility", to: "elektrikli", label: "has_line" },
                  { from: "facility", to: "gazli", label: "has_line" },
                  { from: "facility", to: "workers", label: "employs" },
                  { from: "facility", to: "capacity", label: "monitors" },
                  { from: "facility", to: "kpi", label: "tracks" },
                  { from: "elektrikli", to: "operations", label: "produces" },
                  { from: "gazli", to: "schedules", label: "scheduled" },
                  { from: "elektrikli", to: "products", label: "makes" },
                  { from: "gazli", to: "products", label: "makes" },
                ];
                const getPos = (k: string) => nds.find(n => n.key === k) || { x: 0, y: 0 };
                const isConn = (k: string) => !ontoNode || k === ontoNode || eds.some(e => (e.from === ontoNode && e.to === k) || (e.to === ontoNode && e.from === k));
                const NW = 90, NH = 36;
                return (
                  <svg viewBox="-230 -120 460 320" style={{ width: "100%", marginBottom: 8 }}>
                    {/* Dot grid */}
                    {Array.from({ length: 12 }).map((_, i) => Array.from({ length: 8 }).map((_, j) => (
                      <circle key={`${i}-${j}`} cx={-230 + i * 42} cy={-120 + j * 42} r={0.3} fill="rgba(255,255,255,0.03)" />
                    )))}
                    {/* Edges */}
                    {eds.map((e, i) => {
                      const f = getPos(e.from), t = getPos(e.to);
                      const mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2;
                      const cx = mx + (t.y - f.y) * 0.12, cy2 = my - (t.x - f.x) * 0.12;
                      const dim = ontoNode !== null && !isConn(e.from) && !isConn(e.to);
                      const ec = nds.find(n => n.key === e.to)?.color || C.dim;
                      return (
                        <g key={i} style={{ transition: "opacity 0.3s" }}>
                          <path d={`M${f.x},${f.y} Q${cx},${cy2} ${t.x},${t.y}`} fill="none" stroke={ec} strokeWidth={1} opacity={dim ? 0.06 : 0.18} />
                          <text x={mx + (t.y - f.y) * 0.04} y={my - (t.x - f.x) * 0.04 - 4} textAnchor="middle" fill={ec} opacity={dim ? 0.08 : 0.25} fontSize={6} fontFamily={mono}>{e.label}</text>
                        </g>
                      );
                    })}
                    {/* Nodes */}
                    {nds.map(n => {
                      const isAct = ontoNode === n.key;
                      const isHov = ontoHover === n.key;
                      const dim = ontoNode !== null && !isConn(n.key);
                      return (
                        <g key={n.key} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer", opacity: dim ? 0.35 : 1, transition: "opacity 0.3s" }}
                          onMouseEnter={() => setOntoHover(n.key)} onMouseLeave={() => setOntoHover(null)}
                          onClick={() => handleOntoNodeClick(n.key)}>
                          {(isAct || isHov) && <rect x={-NW / 2 - 4} y={-NH / 2 - 4} width={NW + 8} height={NH + 8} rx={10} fill={n.color} opacity={0.06} style={{ filter: "blur(8px)" }} />}
                          <rect x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={8}
                            fill={`${n.color}08`} stroke={isAct ? n.color : isHov ? `${n.color}88` : `${n.color}30`}
                            strokeWidth={isAct ? 1.5 : 0.8} style={{ transition: "all 0.2s", transform: isHov ? "scale(1.04)" : "scale(1)", transformOrigin: "center" }} />
                          {isAct && <rect x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={8} fill="none" stroke={n.color} strokeWidth={0.8}>
                            <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" /></rect>}
                          <text x={0} y={-2} textAnchor="middle" fill={C.white} fontSize={8.5} fontWeight={600} fontFamily={sans}>{n.label}</text>
                          <text x={0} y={10} textAnchor="middle" fill={C.mid} fontSize={6.5} fontFamily={mono}>{n.sub}</text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}

              {/* ── Node Detail Panel ── */}
              {ontoNode === null && (
                <div style={{ fontSize: 14, color: C.dim, textAlign: "center", padding: "8px 0", lineHeight: 1.7 }}>
                  1 Tesis · 2 Hat · {workersData.length || 16} Calisan · 21 Urun · 24 Operasyon · {schedsData.length || 23} Cizelge
                  <br />Node'a tiklayarak detay gorun
                </div>
              )}

              {/* Facility */}
              {ontoNode === "facility" && (
                <PanelSection title="Tesis" color={C.green}>
                  <div style={{ padding: 10, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Cukurova Isi Sistemleri</div>
                    <div style={{ fontSize: 14, color: C.mid, lineHeight: 1.6 }}>Gebze, Kocaeli · Aktif</div>
                    <div style={{ fontSize: 14, color: C.mid }}>2 Uretim Hatti · {workersData.length || 16} Calisan</div>
                    {summary && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                        <MetricCard value={fmt(summary.totalProduction || 0)} label="Toplam" color={C.green} />
                        <MetricCard value={summary.peakMonth?.ay || "-"} label={`Pik: ${fmt(summary.peakMonth?.total || 0)}`} color={C.amber} />
                      </div>
                    )}
                  </div>
                </PanelSection>
              )}

              {/* Elektrikli / Gazli */}
              {(ontoNode === "elektrikli" || ontoNode === "gazli") && (() => {
                const idx = ontoNode === "elektrikli" ? 0 : 1;
                const line = summary?.lines?.[idx];
                if (!line) return null;
                return (
                  <PanelSection title={line.name || ontoNode} color={ontoNode === "elektrikli" ? C.indigo : C.pink}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                      <MetricCard value={fmt(line.totalOutput || 0)} label="Toplam Uretim" color={ontoNode === "elektrikli" ? C.indigo : C.pink} />
                      <MetricCard value={`%${Math.round(line.utilizationPct || 0)}`} label="Kapasite" color={line.utilizationPct > 80 ? C.green : C.amber} />
                    </div>
                    <div style={{ fontSize: 14, color: C.mid, lineHeight: 1.7 }}>
                      {line.workerCount} calisan · Teorik: {line.capacityUnitTimeMin}dk · Gercek: {line.currentUnitTimeMin}dk
                    </div>
                  </PanelSection>
                );
              })()}

              {/* Workers */}
              {ontoNode === "workers" && (
                <>
                  {wfRisk && (
                    <PanelSection title="Risk Analizi" color={C.amber}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <SeverityBadge level={wfRisk.risk_level} />
                        <span style={{ fontSize: 15, color: C.mid }}>Skor: <strong style={{ color: C.white }}>{wfRisk.risk_score}/100</strong></span>
                      </div>
                      {wfRisk.single_point_failures.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.err, marginBottom: 3 }}>TEK KISIYE BAGLI</div>
                          {wfRisk.single_point_failures.map((f, i) => (
                            <div key={i} style={{ fontSize: 14, color: C.mid, padding: "1px 0" }}>{f.capability_name} → <span style={{ color: C.amber }}>{f.sole_worker_name}</span></div>
                          ))}
                        </div>
                      )}
                      {wfRisk.critical_workers.slice(0, 3).map((w, i) => (
                        <div key={i} style={{ padding: "5px 8px", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, marginBottom: 3 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{w.name} <span style={{ color: C.dim, fontWeight: 400 }}>({w.department})</span></div>
                          <div style={{ fontSize: 11, color: C.amber }}>{w.capability_count} yetkinlik, {w.unique_capabilities.length} benzersiz</div>
                        </div>
                      ))}
                    </PanelSection>
                  )}
                  <PanelSection title="Calisanlar" color={C.amber}>
                    <div style={{ maxHeight: 180, overflowY: "auto" }}>
                      {workersData.slice(0, 12).map((w: any) => (
                        <div key={w.id} onClick={() => fetchTrustScore(w.id)}
                          style={{ padding: "6px 8px", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, marginBottom: 3, cursor: "pointer" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{w.name}</div>
                              <div style={{ fontSize: 11, color: C.dim }}>{w.department}</div>
                            </div>
                            {trustScores[w.id] && (
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, color: trustScores[w.id].trust_score >= 70 ? C.green : trustScores[w.id].trust_score >= 40 ? C.amber : C.err }}>
                                  {trustScores[w.id].trust_score}
                                </div>
                                <div style={{ fontSize: 10, color: C.dim }}>trust</div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PanelSection>
                </>
              )}

              {/* Operations */}
              {ontoNode === "operations" && (
                <PanelSection title="Operasyonlar" color={C.pink}>
                  {summary ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                        <MetricCard value={fmt(summary.totalProduction || 0)} label="Toplam" color={C.green} />
                        <MetricCard value={fmt(summary.lines?.[0]?.totalOutput || 0)} label="Elektrikli" color={C.indigo} />
                      </div>
                      {summary.monthlyData?.length > 0 && (
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={summary.monthlyData} barGap={1}>
                            <XAxis dataKey="ay" tick={{ fontSize: 11, fill: C.dim }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.cardBorder}`, borderRadius: 8, fontSize: 14, fontFamily: mono }} />
                            <Bar dataKey="e" fill={C.indigo} radius={[2, 2, 0, 0]} name="E" />
                            <Bar dataKey="g" fill={C.pink} radius={[2, 2, 0, 0]} name="G" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </>
                  ) : <div style={{ color: C.dim, fontSize: 14 }}>Yukleniyor...</div>}
                </PanelSection>
              )}

              {/* Products */}
              {ontoNode === "products" && (
                <PanelSection title="Urunler" color="#a78bfa">
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.indigo, marginBottom: 4 }}>ELEKTRIKLI</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {["GSS20P", "GSS40P", "GSN20", "GSN40", "GSA", "GSU15", "GSU20", "MGS", "GSSP", "GSSK", "GST"].map(p => (
                        <span key={p} style={{ padding: "3px 8px", borderRadius: 12, fontSize: 13, fontFamily: mono, background: `${C.indigo}10`, border: `1px solid ${C.indigo}20`, color: C.indigo }}>{p}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.pink, marginBottom: 4 }}>GAZLI</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {["ELT.7-11", "CC.7-11", "CPH.33", "BH 55", "SSP 40", "SSP 60", "DHP 33", "DHP 50", "WHP 20", "WHP 33"].map(p => (
                        <span key={p} style={{ padding: "3px 8px", borderRadius: 12, fontSize: 13, fontFamily: mono, background: `${C.pink}10`, border: `1px solid ${C.pink}20`, color: C.pink }}>{p}</span>
                      ))}
                    </div>
                  </div>
                </PanelSection>
              )}

              {/* Schedules — Single Flow */}
              {ontoNode === "schedules" && (
                <>
                  {/* Motor accuracy badge — always visible top-right */}
                  {motorAccuracy && motorAccuracy.completed_plans > 0 && (
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)" }}>
                      <Ring pct={Math.round(motorAccuracy.avg_prediction_accuracy * 100)} color="#fb923c" size={32} stroke={3} />
                      <div>
                        <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: "#fb923c" }}>%{Math.round(motorAccuracy.avg_prediction_accuracy * 100)}</div>
                        <div style={{ fontSize: 13, color: C.dim }}>Motor Dogrulugu</div>
                      </div>
                    </div>
                  )}

                  {/* 1. Hat secici — big toggle */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                    {linesData.map((line: any) => (
                      <button key={line.id} onClick={() => { setForecastLineId(line.id); setForecastResult(null); setPlanSaved(false); fetchCurrentWeekPlan(line.id); }} style={{
                        flex: 1, padding: "14px 0", fontSize: 21, fontFamily: sans, fontWeight: 700, borderRadius: 10, cursor: "pointer",
                        background: forecastLineId === line.id ? "rgba(251,146,60,0.15)" : "transparent",
                        border: `2px solid ${forecastLineId === line.id ? "#fb923c" : C.cardBorder}`,
                        color: forecastLineId === line.id ? "#fb923c" : C.dim, textAlign: "center", transition: "all 0.2s",
                      }}>{line.name || `Hat ${line.id}`}</button>
                    ))}
                  </div>

                  {/* Week status label */}
                  <div style={{ fontSize: 17, fontFamily: mono, color: C.dim, marginBottom: 10, textAlign: "center" }}>
                    {currentWeekLabel}
                  </div>

                  {/* STATE A: Loading */}
                  {currentWeekPlan === undefined && (
                    <div style={{ textAlign: "center", padding: 20, color: C.dim, fontSize: 18 }}>Kontrol ediliyor...</div>
                  )}

                  {/* STATE B: Plan exists + completed → done message */}
                  {currentWeekPlan && currentWeekPlan.status === "completed" && (
                    <div style={{ padding: "16px", borderRadius: 12, background: "rgba(52,211,153,0.06)", border: `1px solid ${C.green}30`, textAlign: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: C.green, marginBottom: 6 }}>Bu hafta tamamlandi</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                        <MetricCard value={fmt(currentWeekPlan.planned_qty)} label="Plan" color={C.mid} />
                        <MetricCard value={fmt(currentWeekPlan.actual_qty || 0)} label="Gercek" color={C.green} />
                        <MetricCard value={`%${Math.round(parseFloat(currentWeekPlan.realization_rate || "0") * 100)}`} label="Oran"
                          color={parseFloat(currentWeekPlan.realization_rate || "0") >= 0.9 ? C.green : parseFloat(currentWeekPlan.realization_rate || "0") >= 0.7 ? "#fb923c" : C.err} />
                      </div>
                    </div>
                  )}

                  {/* STATE C: Plan exists + not completed → show complete input */}
                  {currentWeekPlan && currentWeekPlan.status === "planned" && (
                    <PanelSection title="Gercekleseni Gir" color={C.green}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                        <MetricCard value={fmt(currentWeekPlan.planned_qty)} label="Plan" color="#fb923c" />
                        {currentWeekPlan.predicted_qty && <MetricCard value={fmt(currentWeekPlan.predicted_qty)} label="Motor Tahmini" color={C.indigo} />}
                      </div>
                      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                        <input type="number" value={completeInputs[currentWeekPlan.id] || ""} onChange={e => setCompleteInputs(prev => ({ ...prev, [currentWeekPlan.id]: e.target.value }))}
                          placeholder="Gerceklesen miktar" autoFocus
                          style={{ flex: 1, padding: "14px 12px", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10,
                            color: C.white, fontSize: 34, fontFamily: mono, fontWeight: 700, textAlign: "center", outline: "none" }} />
                      </div>
                      <select value={deviationReasons[currentWeekPlan.id] || ""} onChange={e => setDeviationReasons(prev => ({ ...prev, [currentWeekPlan.id]: e.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", marginBottom: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.cardBorder}`, borderRadius: 6, color: C.mid, fontSize: 17, fontFamily: mono, outline: "none", appearance: "auto" as any }}>
                        <option value="">Sapma Nedeni (opsiyonel)</option>
                        <option value="personnel">Personel</option>
                        <option value="material">Hammadde</option>
                        <option value="machine">Makine</option>
                        <option value="holiday">Tatil</option>
                        <option value="other">Diger</option>
                      </select>
                      {deviationReasons[currentWeekPlan.id] && (
                        <input value={deviationNotes[currentWeekPlan.id] || ""} onChange={e => setDeviationNotes(prev => ({ ...prev, [currentWeekPlan.id]: e.target.value }))}
                          placeholder="Detay notu (opsiyonel)" style={{ width: "100%", marginBottom: 8, padding: "8px 10px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.cardBorder}`, borderRadius: 6, color: C.white, fontSize: 17, fontFamily: mono, outline: "none" }} />
                      )}
                      <button onClick={() => { completePlan(currentWeekPlan.id); }} disabled={completeLoading === currentWeekPlan.id || !completeInputs[currentWeekPlan.id]}
                        style={{ width: "100%", padding: "14px", borderRadius: 10, fontSize: 24, fontWeight: 700, cursor: "pointer",
                          background: justCompleted[currentWeekPlan.id] ? "rgba(52,211,153,0.12)" : C.green, color: justCompleted[currentWeekPlan.id] ? C.green : "#000", border: justCompleted[currentWeekPlan.id] ? `1px solid ${C.green}30` : "none",
                          opacity: !completeInputs[currentWeekPlan.id] && !justCompleted[currentWeekPlan.id] ? 0.4 : 1, transition: "all 0.2s",
                        }}>{completeLoading === currentWeekPlan.id ? "..." : justCompleted[currentWeekPlan.id] ? `Tamamlandi — %${justCompleted[currentWeekPlan.id].rate}` : "Tamamla"}</button>
                    </PanelSection>
                  )}

                  {/* STATE D: No plan → normal new plan form */}
                  {currentWeekPlan === null && (
                    <>
                      <PanelSection title="Bu hafta ne planliyorsunuz?" color="#fb923c">
                        <div style={{ textAlign: "center", marginBottom: 10 }}>
                          <input type="number" value={forecastPlanQty} onChange={e => setForecastPlanQty(e.target.value)} placeholder="Hedef miktar"
                            style={{ width: "100%", padding: "16px 14px", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10,
                              color: C.white, fontSize: 39, fontFamily: mono, fontWeight: 700, textAlign: "center", outline: "none" }} />
                          <div style={{ fontSize: 17, color: C.dim, marginTop: 6 }}>Haftalik uretim hedefi (adet)</div>
                        </div>
                        <button onClick={runForecast} disabled={forecastLoading || !forecastPlanQty}
                          style={{ width: "100%", padding: "14px", borderRadius: 10, fontSize: 24, fontWeight: 700, cursor: "pointer",
                            background: forecastLoading ? C.dim : "linear-gradient(135deg, #fb923c, #f97316)", color: "#000", border: "none",
                            opacity: !forecastPlanQty ? 0.4 : 1, transition: "all 0.2s",
                          }}>{forecastLoading ? "Hesaplaniyor..." : "Motoru Sor"}</button>
                      </PanelSection>

                      {/* Motor tahmini — inline result */}
                      {forecastResult && (
                        <PanelSection title="Motor Tahmini" color="#fb923c">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <span style={{ fontSize: 15, fontFamily: mono, padding: "3px 8px", borderRadius: 4, background: "rgba(251,146,60,0.1)", color: "#fb923c" }}>
                              Gen {forecastResult.motor_generation || 0} · {forecastResult.data_points || 0} veri
                            </span>
                            {forecastResult.accuracy_trend && forecastResult.accuracy_trend !== "neutral" && (
                              <span style={{ fontSize: 15, fontFamily: mono, color: forecastResult.accuracy_trend === "improving" ? C.green : C.err }}>
                                {forecastResult.accuracy_trend === "improving" ? "Gelisiyor" : "Dusuk"}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 8 }}>
                            <MetricCard value={fmt(forecastResult.predicted_output)} label="Tahmini Uretim" color="#fb923c" large />
                            <MetricCard value={`%${forecastResult.confidence}`} label="Guven" color={forecastResult.is_realistic ? C.green : C.err} large />
                            <MetricCard value={`${forecastResult.gap >= 0 ? "+" : ""}${fmt(forecastResult.gap)}`} label="Fark" color={forecastResult.gap >= 0 ? C.green : C.err} large />
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <Ring pct={forecastResult.confidence} color={forecastResult.is_realistic ? C.green : C.err} size={48} stroke={4} />
                            <div style={{ flex: 1, fontSize: 18, color: C.mid, lineHeight: 1.5 }}>{forecastResult.recommendation}</div>
                          </div>
                          {forecastResult.risk_flags && forecastResult.risk_flags.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              {forecastResult.risk_flags.map((flag, i) => (
                                <div key={i} style={{ padding: "5px 10px", marginBottom: 3, borderRadius: 4, fontSize: 15, fontFamily: mono, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: C.err }}>
                                  {flag}
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 17, color: C.dim, fontFamily: mono, marginBottom: 6 }}>SENARYOLAR</div>
                            {forecastResult.scenarios.map((s, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: 17, background: i === 0 ? "rgba(251,146,60,0.06)" : "transparent", borderRadius: 4, marginBottom: 3 }}>
                                <span style={{ color: C.mid }}>{s.name}</span>
                                <span style={{ fontFamily: mono, fontWeight: 600, color: "#fb923c" }}>{fmt(s.predicted_output)} (%{s.realization_rate})</span>
                              </div>
                            ))}
                          </div>
                        </PanelSection>
                      )}

                      {/* Save plan */}
                      {forecastResult && (
                        <button disabled={planSaved} onClick={async () => {
                          try {
                            const r = await fetch("/api/v1/plans/create", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                              body: JSON.stringify({ line_id: forecastLineId, week_label: currentWeekLabel, planned_qty: Number(forecastPlanQty), predicted_qty: forecastResult.predicted_output,
                                motor_generation: forecastResult.motor_generation || 0, predicted_rate: forecastResult.avg_realization_rate }) });
                            if (r.ok) { setPlanSaved(true); fetchMotorAccuracy(); fetchCurrentWeekPlan(forecastLineId); }
                            else if (r.status === 409) { alert("Bu hat icin bu hafta zaten bir plan mevcut."); fetchCurrentWeekPlan(forecastLineId); }
                            else { const t = await r.text(); alert("Hata: " + (t || r.statusText)); }
                          } catch { alert("Ag hatasi"); }
                        }} style={{
                          width: "100%", padding: "14px", borderRadius: 10, fontSize: 24, fontWeight: 700, cursor: planSaved ? "default" : "pointer",
                          background: planSaved ? "rgba(52,211,153,0.12)" : "linear-gradient(135deg, #34d399, #10b981)", color: planSaved ? C.green : "#000",
                          border: planSaved ? `1px solid ${C.green}30` : "none", marginBottom: 12, transition: "all 0.2s",
                        }}>{planSaved ? "Kaydedildi" : "Plani Kaydet"}</button>
                      )}
                    </>
                  )}

                  {/* 5. Son Planlar — unified table with inline complete */}
                  {motorAccuracy && (motorAccuracy.active_list.some(p => p.line_id === forecastLineId) || motorAccuracy.history.some(h => h.line_id === forecastLineId)) && (
                    <PanelSection title="Son Planlar" color="#fb923c">
                      <div style={{ fontSize: 15, fontFamily: mono, color: C.dim, marginBottom: 8 }}>
                        {forecastLineId === 1 ? "Elektrikli" : "Gazli"} hatti
                      </div>
                      {/* Header */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2, padding: "6px 8px", marginBottom: 6, borderBottom: `1px solid ${C.cardBorder}` }}>
                        <span style={{ fontSize: 18, fontFamily: mono, color: C.dim, fontWeight: 600 }}>Hafta</span>
                        <span style={{ fontSize: 18, fontFamily: mono, color: C.dim, fontWeight: 600, textAlign: "right" }}>Plan</span>
                        <span style={{ fontSize: 18, fontFamily: mono, color: C.dim, fontWeight: 600, textAlign: "right" }}>Gercek</span>
                        <span style={{ fontSize: 18, fontFamily: mono, color: C.dim, fontWeight: 600, textAlign: "right" }}>Dogruluk</span>
                      </div>
                      {/* Active plans — inline complete */}
                      {motorAccuracy.active_list.filter(p => p.line_id === forecastLineId).map(p => {
                        const done = justCompleted[p.id];
                        return (
                        <div key={`active-${p.id}`} style={{ borderBottom: `1px solid ${done ? `${C.green}30` : C.cardBorder}`,
                          background: done ? "rgba(52,211,153,0.06)" : "transparent", transition: "background 0.4s ease" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2, padding: "8px 8px", alignItems: "center" }}>
                            <span style={{ fontSize: 18, fontFamily: mono, color: done ? C.green : "#fb923c", fontWeight: 600 }}>{p.week_label}</span>
                            <span style={{ fontSize: 18, fontFamily: mono, color: C.white, textAlign: "right" }}>{p.planned_qty}</span>
                            <span style={{ fontSize: 18, fontFamily: mono, textAlign: "right", color: done ? C.green : C.white, fontWeight: done ? 700 : 400 }}>
                              {done ? done.actual : "-"}
                            </span>
                            <span style={{ fontSize: 18, fontFamily: mono, textAlign: "right" }}>
                              {done ? (
                                <span style={{ fontWeight: 700, color: done.rate >= 90 ? C.green : done.rate >= 70 ? "#fb923c" : C.err }}>%{done.rate}</span>
                              ) : (
                                <button onClick={() => setCompleteInputs(prev => ({ ...prev, [p.id]: "" }))}
                                  style={{ padding: "3px 10px", borderRadius: 4, fontSize: 15, fontWeight: 700, cursor: "pointer",
                                    background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.3)", color: "#fb923c" }}>
                                  Tamamla
                                </button>
                              )}
                            </span>
                          </div>
                          {/* Expanded inline input */}
                          {!done && completeInputs[p.id] !== undefined && (
                            <div style={{ padding: "10px", background: "rgba(251,146,60,0.04)", borderRadius: 8, margin: "4px 8px 8px" }}>
                              <div style={{ fontSize: 17, color: C.mid, marginBottom: 8 }}>Gerceklesen miktari girin:</div>
                              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                                <input type="number" value={completeInputs[p.id]} onChange={e => setCompleteInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  placeholder="ornegin: 420" autoFocus
                                  style={{ flex: 1, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.cardBorder}`, borderRadius: 6, color: C.white, fontSize: 24, fontFamily: mono, fontWeight: 700, outline: "none" }} />
                                <button onClick={() => completePlan(p.id)} disabled={completeLoading === p.id || !completeInputs[p.id]}
                                  style={{ padding: "10px 16px", borderRadius: 6, fontSize: 18, fontWeight: 700, cursor: "pointer", background: C.green, color: "#000", border: "none", opacity: !completeInputs[p.id] ? 0.4 : 1 }}>
                                  {completeLoading === p.id ? "..." : "Kaydet"}
                                </button>
                                <button onClick={() => setCompleteInputs(prev => { const n = { ...prev }; delete n[p.id]; return n; })}
                                  style={{ padding: "10px", borderRadius: 6, fontSize: 18, cursor: "pointer", background: "transparent", border: `1px solid ${C.cardBorder}`, color: C.dim }}>✕</button>
                              </div>
                              <select value={deviationReasons[p.id] || ""} onChange={e => setDeviationReasons(prev => ({ ...prev, [p.id]: e.target.value }))}
                                style={{ width: "100%", padding: "7px 8px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.cardBorder}`, borderRadius: 5, color: C.mid, fontSize: 17, fontFamily: mono, outline: "none", appearance: "auto" as any }}>
                                <option value="">Sapma Nedeni (opsiyonel)</option>
                                <option value="personnel">Personel</option>
                                <option value="material">Hammadde</option>
                                <option value="machine">Makine</option>
                                <option value="holiday">Tatil</option>
                                <option value="other">Diger</option>
                              </select>
                              {deviationReasons[p.id] && (
                                <input value={deviationNotes[p.id] || ""} onChange={e => setDeviationNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  placeholder="Detay notu (opsiyonel)" style={{ width: "100%", marginTop: 6, padding: "7px 8px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.cardBorder}`, borderRadius: 5, color: C.white, fontSize: 17, fontFamily: mono, outline: "none" }} />
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                      {/* Completed plans — green tinted */}
                      {motorAccuracy.history.filter(h => h.line_id === forecastLineId).slice(0, 3).map((h, i) => {
                        const rate = h.realization_rate != null ? Math.round(h.realization_rate * 100) : null;
                        const rowColor = rate != null && rate >= 90 ? C.green : rate != null && rate >= 70 ? "#fb923c" : C.err;
                        return (
                        <div key={`hist-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2, padding: "8px 8px",
                          borderBottom: `1px solid ${C.cardBorder}`, background: "rgba(52,211,153,0.03)", borderLeft: `2px solid ${rowColor}` }}>
                          <span style={{ fontSize: 18, fontFamily: mono, color: C.green }}>{h.week}</span>
                          <span style={{ fontSize: 18, fontFamily: mono, color: C.white, textAlign: "right" }}>{h.planned}</span>
                          <span style={{ fontSize: 18, fontFamily: mono, color: C.white, textAlign: "right", fontWeight: 600 }}>{h.actual ?? "-"}</span>
                          <span style={{ fontSize: 18, fontFamily: mono, textAlign: "right", fontWeight: 700, color: rowColor }}>
                            {rate != null ? `%${rate}` : "-"}
                          </span>
                        </div>
                        );
                      })}
                    </PanelSection>
                  )}
                </>
              )}

              {/* Capacity */}
              {ontoNode === "capacity" && (
                <PanelSection title="Kapasite Metrikleri" color="#38bdf8">
                  <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 10 }}>
                    {(summary?.lines || []).map((line: any) => (
                      <div key={line.id} style={{ textAlign: "center" }}>
                        <Ring pct={line.utilizationPct || 0} color={line.type === "elektrikli" ? C.indigo : C.pink} size={56} stroke={4} />
                        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>%{Math.round(line.utilizationPct || 0)}</div>
                        <div style={{ fontSize: 11, color: C.mid }}>{line.name}</div>
                      </div>
                    ))}
                  </div>
                  {(summary?.lines || []).map((line: any) => (
                    <div key={line.id} style={{ padding: "6px 8px", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, marginBottom: 4, fontSize: 14 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{line.name}</div>
                      <div style={{ color: C.mid }}>Teorik Max: {fmt(line.theoreticalMax || 0)} · Gercek: {fmt(line.totalOutput || 0)}</div>
                    </div>
                  ))}
                </PanelSection>
              )}

              {/* KPI */}
              {ontoNode === "kpi" && (
                <PanelSection title="KPI" color="#f87171">
                  <div style={{ textAlign: "center", padding: "20px 0", color: C.dim }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
                    <div style={{ fontSize: 15 }}>Henuz KPI tanimlanmadi</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Katman 05'te aktif olacak</div>
                  </div>
                </PanelSection>
              )}
            </div>

          /* ── LAYER 01: Ingestion ── */
          ) : activeLayer === "ingestion" ? (
            <div key="ingestion" style={{ animation: "engSlideIn 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 14, fontWeight: 600, background: `${C.pink}15`, color: C.pink, border: `1px solid ${C.pink}30` }}>01</span>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Veri Kaynaklari</span>
                </div>
                <button onClick={() => setActiveLayer(null)} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 22 }}>✕</button>
              </div>

              {/* Source format cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {[
                  { label: "Excel", icon: "📊", desc: "XLSX, XLS", active: true },
                  { label: "CSV", icon: "📄", desc: "Virgul ayracli", active: true },
                  { label: "ERP", icon: "🏭", desc: "Netsis/SAP", active: false },
                  { label: "API", icon: "🔗", desc: "REST/JSON", active: false },
                ].map(s => (
                  <div key={s.label} style={{ padding: "12px", borderRadius: 10, background: C.card, border: `1px solid ${C.cardBorder}`, textAlign: "center", opacity: s.active ? 1 : 0.4 }}>
                    <div style={{ fontSize: 28 }}>{s.icon}</div>
                    <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 13, color: C.dim }}>{s.desc}</div>
                    {s.active && <div style={{ fontSize: 11, color: C.green, marginTop: 4, fontWeight: 600 }}>AKTIF</div>}
                  </div>
                ))}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setUploadDragging(true); }}
                onDragLeave={() => setUploadDragging(false)}
                onDrop={e => { e.preventDefault(); setUploadDragging(false); if (e.dataTransfer.files[0]) setUploadFile(e.dataTransfer.files[0]); }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "32px 20px", borderRadius: 12, textAlign: "center", cursor: "pointer",
                  border: `2px dashed ${uploadDragging ? C.pink : C.cardBorder}`, background: uploadDragging ? "rgba(244,114,182,0.04)" : "transparent",
                  transition: "all 0.2s", marginBottom: 16,
                }}>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.[0]) { setUploadFile(e.target.files[0]); } }} />
                <div style={{ fontSize: 34, marginBottom: 8 }}>📂</div>
                {uploadFile ? (
                  <div style={{ fontSize: 17, color: C.pink, fontWeight: 600 }}>{uploadFile.name}</div>
                ) : (
                  <div style={{ fontSize: 15, color: C.dim }}>Dosya surukle veya tikla</div>
                )}
              </div>

              {uploadFile && !uploadLoading && !uploadResult && (
                <button onClick={handleUpload} style={{
                  width: "100%", padding: "10px", borderRadius: 8, background: C.pink, color: "#000", fontSize: 17, fontWeight: 600,
                  border: "none", cursor: "pointer", marginBottom: 12,
                }}>Yukle ve Islem Yap</button>
              )}
              {uploadLoading && <div style={{ textAlign: "center", fontSize: 15, color: C.mid, padding: 16 }}>Isleniyor...</div>}
              {uploadResult && (
                <div style={{ padding: 12, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.green, marginBottom: 4 }}>Basarili</div>
                  <div style={{ fontSize: 14, color: C.mid }}>{uploadResult.message || "Veri islendi"}</div>
                </div>
              )}
              {uploadError && (
                <div style={{ padding: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.err }}>Hata</div>
                  <div style={{ fontSize: 14, color: C.mid }}>{uploadError}</div>
                </div>
              )}

              {/* Last upload info */}
              {(() => {
                const last = localStorage.getItem("griseus_last_upload");
                if (!last) return null;
                try {
                  const info = JSON.parse(last);
                  return (
                    <div style={{ padding: 10, background: "rgba(52,211,153,0.04)", border: `1px solid rgba(52,211,153,0.15)`, borderRadius: 10, marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 3 }}>SON YUKLEME</div>
                      <div style={{ fontSize: 14, color: C.mid }}>{info.name} — {info.date}</div>
                    </div>
                  );
                } catch { return null; }
              })()}

              {/* Parser list */}
              <PanelSection title="Parser'lar" color={C.pink}>
                {[
                  { name: "ElektrikliParser", target: "operations (elektrikli)", hint: "Elektrikli Imalat Raporu" },
                  { name: "GazliParser", target: "operations (gazli)", hint: "Gazli Imalat Raporu" },
                  { name: "KapasiteParser", target: "production_lines", hint: "Kapasite Analizi" },
                  { name: "PersonelParser", target: "workers, capabilities", hint: "Personel Listesi" },
                  { name: "KPIParser", target: "kpi_definitions", hint: "KPI Dosyasi" },
                  { name: "IsAkisParser", target: "operations (akis)", hint: "Is Akis Plani" },
                ].map(p => (
                  <div key={p.name} style={{ padding: "6px 0", fontSize: 14, borderBottom: `1px solid ${C.cardBorder}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: mono, color: C.pink }}>{p.name}</span>
                      <span style={{ color: C.dim }}>→ {p.target}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>Tetikleyici: "{p.hint}"</div>
                  </div>
                ))}
              </PanelSection>
            </div>

          /* ── DEFAULT: Overview ── */
          ) : (
            <div style={{ animation: "engSlideIn 0.3s ease" }}>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Genel Bakis</div>

              {summary ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                  <MetricCard value={fmt(summary.totalProduction || 0)} label="Toplam Uretim" color={C.green} />
                  <MetricCard value={String(summary.lines?.length || 2)} label="Uretim Hatti" color={C.indigo} />
                  <MetricCard value="16" label="Calisan" color={C.amber} />
                  <MetricCard value="24" label="Operasyon" color={C.pink} />
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: 20, color: C.dim, fontSize: 15 }}>Yukleniyor...</div>
              )}

              <div style={{ fontSize: 15, color: C.dim, textAlign: "center", padding: "16px 0", lineHeight: 1.7 }}>
                Katmana tiklayarak detay gorun
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                {[
                  { n: "10", label: "Tablo", color: C.pink },
                  { n: "8", label: "Entity", color: C.amber },
                  { n: "5", label: "Fonksiyon", color: C.indigo },
                  { n: "5", label: "Uygulama", color: C.green },
                ].map(s => (
                  <div key={s.label} style={{ padding: "12px", borderRadius: 10, background: C.card, border: `1px solid ${C.cardBorder}`, textAlign: "center" }}>
                    <div style={{ fontFamily: mono, fontSize: 31, fontWeight: 700, color: s.color }}>{s.n}</div>
                    <div style={{ fontSize: 14, color: C.dim, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Flow summary */}
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Ham Veri", color: C.pink },
                  { label: "Ontology", color: C.amber },
                  { label: "Intelligence", color: C.indigo },
                  { label: "Aksiyon", color: C.green },
                ].map((step, i) => (
                  <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, background: `${step.color}15`, border: `1px solid ${step.color}30`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: step.color, fontFamily: mono, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 17, color: C.mid, fontWeight: 500 }}>{step.label}</span>
                    {i < 3 && <span style={{ fontSize: 14, color: C.dim, marginLeft: "auto" }}>→</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════ STATUS BAR ════ */}
      <div style={{ background: C.surface, borderTop: `1px solid ${C.cardBorder}`, padding: "0 24px", height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 14, color: C.dim, fontFamily: mono }}>9 Entity · 89 Kayit · 5 Fonksiyon</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {["Excel", "ERP", "CSV", "API"].map(s => (
            <span key={s} style={{ padding: "2px 6px", borderRadius: 3, fontSize: 11, fontFamily: mono, background: `${C.pink}10`, color: C.pink, border: `1px solid ${C.pink}20` }}>{s}</span>
          ))}
          <span style={{ width: 1, height: 12, background: C.cardBorder, margin: "0 4px" }} />
          {["simulateCapacity", "detectBottleneck", "scoreWorkerRisk", "forecastOutput"].map(f => (
            <span key={f} style={{ padding: "2px 6px", borderRadius: 3, fontSize: 11, fontFamily: mono, background: `${C.indigo}10`, color: C.indigo, border: `1px solid ${C.indigo}20` }}>{f}</span>
          ))}
        </div>
        <span style={{ fontSize: 13, color: C.dim, fontFamily: mono }}>Powered by Griseus Engine v1</span>
      </div>

      {/* ════ UPLOAD MODAL ════ */}
      {uploadOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setUploadOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 24, width: 420, maxWidth: "90vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 21, fontWeight: 700 }}>Dosya Yukle</span>
              <button onClick={() => setUploadOpen(false)} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 22 }}>✕</button>
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setUploadDragging(true); }}
              onDragLeave={() => setUploadDragging(false)}
              onDrop={e => { e.preventDefault(); setUploadDragging(false); if (e.dataTransfer.files[0]) setUploadFile(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: "40px 20px", borderRadius: 12, textAlign: "center", cursor: "pointer",
                border: `2px dashed ${uploadDragging ? C.indigo : C.cardBorder}`, transition: "all 0.2s", marginBottom: 16 }}>
              <div style={{ fontSize: 39, marginBottom: 8 }}>📂</div>
              {uploadFile ? (
                <div style={{ fontSize: 17, color: C.indigo, fontWeight: 600 }}>{uploadFile.name}</div>
              ) : (
                <div style={{ fontSize: 17, color: C.dim }}>Dosya surukle veya tikla</div>
              )}
            </div>
            {uploadFile && !uploadLoading && !uploadResult && (
              <button onClick={async () => { setUploadOpen(false); handleUpload(); }}
                style={{ width: "100%", padding: "12px", borderRadius: 8, background: C.indigo, color: "#000", fontSize: 18, fontWeight: 600, border: "none", cursor: "pointer" }}>
                Yukle
              </button>
            )}
            {uploadResult && (
              <div style={{ padding: 12, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 10 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.green }}>Basarili</div>
              </div>
            )}
            <div style={{ fontSize: 13, color: C.dim, marginTop: 12, textAlign: "center" }}>
              Desteklenen: Elektrikli/Gazli Imalat, Kapasite, Personel, KPI, Is Akis
            </div>
          </div>
        </div>
      )}

      {/* ════ KEYFRAMES ════ */}
      <style>{`
        @keyframes engPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.5); } }
        @keyframes engScan { 0% { transform:translateY(-100%); opacity:0; } 8% { opacity:1; } 92% { opacity:1; } 100% { transform:translateY(100%); opacity:0; } }
        @keyframes engDash { to { stroke-dashoffset:-20; } }
        @keyframes engFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-3px); } }
        @keyframes engFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes engSlideIn { from { opacity:0; transform:translateX(12px); } to { opacity:1; transform:translateX(0); } }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:${C.indigo}; cursor:pointer; box-shadow:0 0 6px ${C.indigo}55; }
        input[type=range]::-webkit-slider-thumb:hover { box-shadow:0 0 12px ${C.indigo}88; }
        @media (max-width: 900px) {
          div[style*="gridTemplateColumns: 1fr 380px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
