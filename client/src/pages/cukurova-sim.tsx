import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";

/* ── Fonts ── */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap";

/* ── Palette ── */
const C = {
  bg: "#08080c",
  card: "rgba(255,255,255,0.015)",
  cardBorder: "rgba(255,255,255,0.05)",
  elektrik: "#818cf8",
  gaz: "#f472b6",
  ok: "#34d399",
  warn: "#fbbf24",
  err: "#ef4444",
  white: "#fff",
  mid: "#999",
  dim: "#555",
};
const mono = "'Space Mono', monospace";
const sans = "'DM Sans', sans-serif";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── Types ── */
interface Line {
  id: number; name: string; type: string;
  workerCount: number; capacityUnitTimeMin: string; currentUnitTimeMin: string;
  dailyHours: string; monthlyDays: number; productionMonths: number;
}
interface SimResult {
  baseline: { yearly_capacity: number; daily_capacity: number; monthly_capacity: number; utilization_pct: number };
  simulated: { yearly_capacity: number; daily_capacity: number; monthly_capacity: number; utilization_pct: number };
  delta: { units: number; percent: number };
  parameters_used: Record<string, number>;
  insights: string[];
}
interface BottleneckResult {
  line_id: number; line_name: string; total_weeks: number;
  on_track_weeks: number; critical_weeks: number; average_deviation_pct: number;
  worst_week: { period_value: string; planned: number; actual: number; deviation_pct: number };
  best_week: { period_value: string; planned: number; actual: number; deviation_pct: number };
  trend: string; bottleneck_severity: string; insights: string[];
}
interface WorkforceRisk {
  facility_id: number; total_workers: number; total_capabilities: number;
  unique_capabilities: number;
  single_point_failures: { capability_name: string; sole_worker_name: string }[];
  critical_workers: { name: string; department: string; capability_count: number; unique_capabilities: string[] }[];
  risk_score: number; risk_level: string; insights: string[];
}

/* ── Ring chart ── */
function Ring({ pct, color, size = 100, stroke = 8 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}55)`, transition: "stroke-dashoffset 0.5s ease" }} />
    </svg>
  );
}

/* ── Custom Slider ── */
function Slider({ label, value, min, max, step, baseline, color, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  baseline: number; color: string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const diff = value - baseline;
  const diffColor = diff > 0 ? C.ok : diff < 0 ? C.err : C.dim;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: sans, fontSize: 12, color: C.mid, fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 13, color: diff !== 0 ? diffColor : C.white, fontWeight: 700 }}>
          {step < 1 ? value.toFixed(1) : value}
          {diff !== 0 && <span style={{ fontSize: 11, marginLeft: 4 }}>{diff > 0 ? "+" : ""}{step < 1 ? diff.toFixed(1) : diff}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%", height: 4, appearance: "none", background: `linear-gradient(to right, ${color} ${pct}%, #333 ${pct}%)`,
          borderRadius: 2, outline: "none", cursor: "pointer",
        }}
      />
      <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 4 }}>
        baseline: {step < 1 ? baseline.toFixed(1) : baseline}
      </div>
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: ${color}; cursor: pointer; box-shadow: 0 0 8px ${color}66;
          transition: box-shadow 0.2s;
        }
        input[type=range]::-webkit-slider-thumb:hover { box-shadow: 0 0 14px ${color}aa; }
      `}</style>
    </div>
  );
}

/* ── Severity badge ── */
function SeverityBadge({ level }: { level: string }) {
  const colors: Record<string, string> = { low: C.ok, medium: C.warn, high: "#f97316", critical: C.err };
  const c = colors[level] || C.dim;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: `${c}18`, color: c, border: `1px solid ${c}33`, fontFamily: sans, textTransform: "uppercase",
    }}>{level}</span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════ */

export default function CukurovaSim() {
  const [, navigate] = useLocation();
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedLine, setSelectedLine] = useState<"elektrikli" | "gazli">("elektrikli");
  const [params, setParams] = useState({ worker_count: 7, unit_time_min: 13, daily_hours: 9, monthly_days: 22, production_months: 10 });
  const [baselines, setBaselines] = useState({ worker_count: 7, unit_time_min: 13, daily_hours: 9, monthly_days: 22, production_months: 10 });
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [bottleneck, setBottleneck] = useState<BottleneckResult | null>(null);
  const [wfRisk, setWfRisk] = useState<WorkforceRisk | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load fonts
  useEffect(() => {
    if (!document.querySelector('link[href*="DM+Sans"]')) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  // Fetch lines
  useEffect(() => {
    fetch("/api/v1/facilities/1/lines").then((r) => r.json()).then((data: Line[]) => {
      setLines(data);
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch("/api/v1/analyze/workforce-risk/1").then((r) => r.json()).then(setWfRisk).catch(() => {});
  }, []);

  // Set slider defaults when line changes
  useEffect(() => {
    const line = lines.find((l) => l.type === selectedLine);
    if (!line) return;
    const defaults = {
      worker_count: line.workerCount,
      unit_time_min: Number(line.currentUnitTimeMin),
      daily_hours: Number(line.dailyHours),
      monthly_days: line.monthlyDays,
      production_months: line.productionMonths,
    };
    setParams(defaults);
    setBaselines(defaults);
  }, [selectedLine, lines]);

  // Simulate on param change
  const simulate = useCallback(() => {
    const line = lines.find((l) => l.type === selectedLine);
    if (!line) return;
    fetch("/api/v1/simulate/capacity", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_id: line.id, ...params }),
    }).then((r) => r.json()).then(setSimResult).catch(() => {});

    fetch(`/api/v1/analyze/bottleneck/${line.id}`).then((r) => r.json()).then(setBottleneck).catch(() => {});
  }, [lines, selectedLine, params]);

  useEffect(() => {
    if (lines.length === 0) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(simulate, 200);
  }, [simulate, lines]);

  const resetToBaseline = () => setParams({ ...baselines });

  const line = lines.find((l) => l.type === selectedLine);
  const color = selectedLine === "elektrikli" ? C.elektrik : C.gaz;

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: 20, ...extra,
  });

  const applyScenario = (overrides: Partial<typeof params>) => {
    setParams({ ...baselines, ...overrides });
  };

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.mid, fontFamily: sans }}>
        Yükleniyor...
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: sans, color: C.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 60px" }}>

        {/* ════ HEADER ════ */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <div>
            <button onClick={() => navigate("/cukurova")} style={{
              background: "none", border: "none", color: C.mid, fontSize: 13, cursor: "pointer",
              fontFamily: sans, padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ fontSize: 16 }}>←</span> Dashboard
            </button>
            <h1 style={{ fontFamily: sans, fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Efficiency Engine</h1>
            <p style={{ fontFamily: sans, fontSize: 13, color: C.dim, margin: "4px 0 0" }}>Digital Twin Simülasyonu — Parametre değiştir, etkiyi gör</p>
          </div>
          <button onClick={resetToBaseline} style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.cardBorder}`, borderRadius: 8,
            color: C.mid, fontSize: 12, fontWeight: 600, padding: "8px 16px", cursor: "pointer", fontFamily: sans,
            transition: "all 0.2s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = C.white; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = C.mid; }}
          >
            Baseline'a Dön
          </button>
        </header>

        {/* ════ TWO-COLUMN LAYOUT ════ */}
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, marginBottom: 24 }}>

          {/* ── LEFT: CONTROL PANEL ── */}
          <div style={card()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Kontrol Paneli</div>

            {/* Line toggle */}
            <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, gap: 2, marginBottom: 20 }}>
              {(["elektrikli", "gazli"] as const).map((t) => (
                <button key={t} onClick={() => setSelectedLine(t)} style={{
                  flex: 1, fontFamily: sans, fontSize: 13, fontWeight: 600, padding: "8px 0", borderRadius: 8,
                  border: "none", cursor: "pointer", transition: "all 0.2s",
                  background: selectedLine === t ? (t === "elektrikli" ? `${C.elektrik}22` : `${C.gaz}22`) : "transparent",
                  color: selectedLine === t ? (t === "elektrikli" ? C.elektrik : C.gaz) : C.dim,
                }}>
                  {t === "elektrikli" ? "Elektrikli" : "Gazlı"}
                </button>
              ))}
            </div>

            <Slider label="Çalışan sayısı" value={params.worker_count} min={1} max={20} step={1}
              baseline={baselines.worker_count} color={color}
              onChange={(v) => setParams((p) => ({ ...p, worker_count: v }))} />
            <Slider label="Birim üretim süresi (dk)" value={params.unit_time_min} min={5} max={30} step={0.5}
              baseline={baselines.unit_time_min} color={color}
              onChange={(v) => setParams((p) => ({ ...p, unit_time_min: v }))} />
            <Slider label="Günlük çalışma saati" value={params.daily_hours} min={6} max={12} step={1}
              baseline={baselines.daily_hours} color={color}
              onChange={(v) => setParams((p) => ({ ...p, daily_hours: v }))} />
            <Slider label="Aylık çalışma günü" value={params.monthly_days} min={15} max={30} step={1}
              baseline={baselines.monthly_days} color={color}
              onChange={(v) => setParams((p) => ({ ...p, monthly_days: v }))} />
            <Slider label="Üretim sezonu (ay)" value={params.production_months} min={6} max={12} step={1}
              baseline={baselines.production_months} color={color}
              onChange={(v) => setParams((p) => ({ ...p, production_months: v }))} />
          </div>

          {/* ── RIGHT: RESULTS ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {/* Yearly capacity */}
              <div style={card({ textAlign: "center" })}>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 8, fontWeight: 500 }}>Yıllık Kapasite</div>
                <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.white, lineHeight: 1 }}>
                  {fmt(simResult?.simulated.yearly_capacity || 0)}
                </div>
                {simResult && simResult.delta.units !== 0 && (
                  <div style={{ fontFamily: mono, fontSize: 13, color: simResult.delta.units > 0 ? C.ok : C.err, marginTop: 6 }}>
                    {simResult.delta.units > 0 ? "↑" : "↓"} {fmt(Math.abs(simResult.delta.units))} ({simResult.delta.percent > 0 ? "+" : ""}{simResult.delta.percent}%)
                  </div>
                )}
                <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 4 }}>
                  baseline: {fmt(simResult?.baseline.yearly_capacity || 0)}
                </div>
              </div>

              {/* Daily capacity */}
              <div style={card({ textAlign: "center" })}>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 8, fontWeight: 500 }}>Günlük Kapasite</div>
                <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.white, lineHeight: 1 }}>
                  {fmt(simResult?.simulated.daily_capacity || 0)}
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 10 }}>
                  baseline: {fmt(simResult?.baseline.daily_capacity || 0)}
                </div>
              </div>

              {/* Utilization ring */}
              <div style={card({ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" })}>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 8, fontWeight: 500 }}>Kapasite Kullanım</div>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <Ring pct={simResult?.simulated.utilization_pct || 0} color={color} size={80} stroke={7} />
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
                    <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color }}>{simResult?.simulated.utilization_pct || 0}%</div>
                  </div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 4 }}>
                  baseline: {simResult?.baseline.utilization_pct || 0}%
                </div>
              </div>
            </div>

            {/* Insights */}
            {simResult && simResult.insights.length > 0 && (
              <div style={card()}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Insights</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {simResult.insights.map((ins, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                        {ins.includes("darboğaz") || ins.includes("kaybı") || ins.includes("eğitim") ? "⚠" : ins.includes("gerçekçi") ? "⛔" : "💡"}
                      </span>
                      <span style={{ fontSize: 13, color: C.mid, lineHeight: 1.5 }}>{ins}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scenario presets */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {[
                { title: "Vardiya Artışı", desc: "12 saat/gün", icon: "🕐", apply: () => applyScenario({ daily_hours: 12 }) },
                { title: "Kadro Genişletme", desc: `+3 çalışan`, icon: "👷", apply: () => applyScenario({ worker_count: baselines.worker_count + 3 }) },
                { title: "Proses İyileştirme", desc: `Teorik süreye indir`, icon: "⚡", apply: () => applyScenario({ unit_time_min: Number(line?.capacityUnitTimeMin || baselines.unit_time_min) }) },
              ].map((sc) => (
                <button key={sc.title} onClick={sc.apply} style={{
                  ...card(), cursor: "pointer", textAlign: "left", transition: "all 0.2s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}44`; e.currentTarget.style.background = `${color}08`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.cardBorder; e.currentTarget.style.background = C.card; }}
                >
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{sc.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 4 }}>{sc.title}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{sc.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ════ BOTTLENECK ANALYSIS ════ */}
        {bottleneck && bottleneck.total_weeks > 0 && (
          <div style={{ ...card(), marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Darboğaz Analizi — {bottleneck.line_name}</div>
              <SeverityBadge level={bottleneck.bottleneck_severity} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 16 }}>
              {[
                { label: "Toplam Hafta", value: bottleneck.total_weeks },
                { label: "On Track", value: bottleneck.on_track_weeks, color: C.ok },
                { label: "Kritik", value: bottleneck.critical_weeks, color: C.err },
                { label: "Ort. Sapma", value: `%${bottleneck.average_deviation_pct}`, color: bottleneck.average_deviation_pct < -10 ? C.err : C.ok },
                { label: "Trend", value: bottleneck.trend === "improving" ? "İyileşiyor ↑" : bottleneck.trend === "declining" ? "Kötüleşiyor ↓" : "Stabil →", color: bottleneck.trend === "improving" ? C.ok : bottleneck.trend === "declining" ? C.err : C.warn },
              ].map((m) => (
                <div key={m.label} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: (m as any).color || C.white }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Worst week detail */}
            <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.err, marginBottom: 4 }}>En Kötü Hafta: {bottleneck.worst_week.period_value}</div>
              <div style={{ fontSize: 12, color: C.mid }}>
                Plan: {fmt(bottleneck.worst_week.planned)} → Gerçek: {fmt(bottleneck.worst_week.actual)} ({bottleneck.worst_week.deviation_pct}%)
              </div>
            </div>

            {/* Insights */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bottleneck.insights.map((ins, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.mid }}>
                  <span style={{ color: C.warn }}>⚠</span> {ins}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ WORKFORCE RISK ════ */}
        {wfRisk && (
          <div style={{ ...card(), marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Personel Risk Analizi</div>
              <SeverityBadge level={wfRisk.risk_level} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 20 }}>
              {/* Risk score big number */}
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <Ring pct={wfRisk.risk_score} color={wfRisk.risk_score > 40 ? C.err : wfRisk.risk_score > 25 ? "#f97316" : wfRisk.risk_score > 10 ? C.warn : C.ok} size={100} stroke={8} />
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
                    <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 700 }}>{wfRisk.risk_score}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Risk Skoru</div>
              </div>

              <div>
                {/* Single point failures */}
                {wfRisk.single_point_failures.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.err, marginBottom: 8 }}>Tek Kişi Bağımlılıkları</div>
                    {wfRisk.single_point_failures.map((spf, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.mid, marginBottom: 4 }}>
                        <span style={{ color: C.err }}>●</span>
                        <span style={{ color: C.white, fontWeight: 500 }}>{spf.capability_name}</span>
                        <span>→ {spf.sole_worker_name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Critical workers */}
                {wfRisk.critical_workers.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.warn, marginBottom: 8 }}>Kritik Çalışanlar</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {wfRisk.critical_workers.slice(0, 6).map((w, i) => (
                        <div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{w.name}</div>
                          <div style={{ fontSize: 11, color: C.dim }}>{w.department} · {w.capability_count} yetki · {w.unique_capabilities.length} benzersiz</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Insights */}
                <div style={{ marginTop: 12 }}>
                  {wfRisk.insights.map((ins, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.mid, marginBottom: 4 }}>
                      <span style={{ color: C.warn }}>⚠</span> {ins}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ FOOTER ════ */}
        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 20, borderTop: `1px solid ${C.cardBorder}`, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.dim }}>Griseus × Çukurova Isı A.Ş.</span>
          <span style={{ fontSize: 12, color: C.dim }}>Efficiency Engine v1</span>
        </footer>
      </div>

      {/* ── Responsive ── */}
      <style>{`
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: 340px"] { grid-template-columns: 1fr !important; }
          div[style*="gridTemplateColumns: 160px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
