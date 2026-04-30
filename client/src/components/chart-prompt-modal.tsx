import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { SelectedItem } from "@/lib/selection-context";

const C = {
  bg: "#FAF9F5",
  surface: "#FFFFFF",
  surfaceAlt: "#F0EEE6",
  border: "rgba(20,20,19,0.10)",
  borderStrong: "rgba(20,20,19,0.20)",
  ink: "#141413",
  inkMid: "#3D3D3A",
  inkDim: "#5E5D59",
  inkFaint: "#8F99A8",
  accent: "#D97757",
  accentBg: "rgba(217,119,87,0.10)",
  accentBorder: "rgba(217,119,87,0.30)",
  ok: "#238551",
  warn: "#C87619",
  err: "#CD4246",
  blue: "#2D72D2",
};
const mono =
  "'Anthropic Sans', 'Söhne', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

interface ChartSpec {
  type: "line" | "bar" | "area" | "pie";
  title: string;
  xKey?: string;
  yLabel?: string;
  series: { key: string; label: string; color: string }[];
  data: Record<string, any>[];
}

interface PlanSpec {
  title: string;
  bullets: string[];
}

interface ChartResponse {
  chartSpec: ChartSpec;
  plan?: PlanSpec;
}

const QUICK_PROMPTS = [
  "Önümüzdeki 6 ay için 4 BH cihazının üretim forecast grafiği çiz",
  "Seçili bileşenlerin stok / günlük tüketim oranını bar grafik olarak göster",
  "Bu cihazlar arasında darboğaz bileşenlerin dağılımını pasta grafik yap",
  "Aylık satış trendini çizgi grafikle karşılaştır",
];

function renderChart(spec: ChartSpec) {
  const xKey = spec.xKey ?? "name";
  if (spec.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={spec.data}
            dataKey={spec.series[0]?.key ?? "value"}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            outerRadius={110}
            label={(e: any) => `${e.name}: ${e.value}`}
            labelLine={false}
          >
            {spec.data.map((_, i) => (
              <Cell
                key={i}
                fill={spec.series[i % spec.series.length]?.color ?? C.accent}
              />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const ChartCmp = spec.type === "bar" ? BarChart : spec.type === "area" ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ChartCmp data={spec.data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} stroke={C.inkDim} fontSize={12} />
        <YAxis
          stroke={C.inkDim}
          fontSize={12}
          label={
            spec.yLabel
              ? { value: spec.yLabel, angle: -90, position: "insideLeft", fill: C.inkDim, fontSize: 11 }
              : undefined
          }
        />
        <Tooltip
          contentStyle={{
            background: C.surface,
            border: `1px solid ${C.borderStrong}`,
            borderRadius: 6,
            fontSize: 12,
            fontFamily: mono,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: mono }} />
        {spec.series.map((s) =>
          spec.type === "bar" ? (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} />
          ) : spec.type === "area" ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.18}
              strokeWidth={2}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2.5}
              dot={{ r: 4, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          )
        )}
      </ChartCmp>
    </ResponsiveContainer>
  );
}

export default function ChartPromptModal({
  items,
  onClose,
}: {
  items: SelectedItem[];
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChartResponse | null>(null);

  const generate = async (override?: string) => {
    const p = (override ?? prompt).trim();
    if (!p) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chart/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Hata");
      } else {
        setResponse(data);
      }
    } catch (e: any) {
      setError(e?.message ?? "Ağ hatası");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,19,0.45)",
        backdropFilter: "blur(8px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          border: `1px solid ${C.borderStrong}`,
          borderRadius: 12,
          width: "min(1100px, 96vw)",
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: mono,
          boxShadow: "0 24px 64px rgba(20,20,19,0.18)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 28px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            background: C.surface,
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 1.6, fontWeight: 600 }}>
              DİYAGRAM TALEBİ
            </div>
            <div style={{ fontSize: 22, color: C.ink, marginTop: 6, fontWeight: 600 }}>
              Ne çizmek istiyorsun?
            </div>
            <div style={{ fontSize: 12, color: C.inkDim, marginTop: 4 }}>
              {items.length} öğe seçili · {items.slice(0, 4).map((i) => i.code).join(", ")}
              {items.length > 4 && ` +${items.length - 4}`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.inkDim,
              cursor: "pointer",
              fontSize: 16,
              width: 36,
              height: 36,
              borderRadius: 8,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: "auto", flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Prompt area */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  generate();
                }
              }}
              placeholder="Örn: Önümüzdeki 6 ay için 4 BH cihazının aylık üretim forecastını çizgi grafikle göster"
              style={{
                width: "100%",
                minHeight: 80,
                padding: "12px 14px",
                fontSize: 14,
                fontFamily: mono,
                color: C.ink,
                background: C.surface,
                border: `1px solid ${C.borderStrong}`,
                borderRadius: 8,
                resize: "vertical",
                outline: "none",
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp}
                  onClick={() => {
                    setPrompt(qp);
                    generate(qp);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 16,
                    fontSize: 11,
                    fontFamily: mono,
                    background: C.surfaceAlt,
                    border: `1px solid ${C.border}`,
                    color: C.inkMid,
                    cursor: "pointer",
                    letterSpacing: 0.2,
                  }}
                >
                  {qp.length > 60 ? qp.slice(0, 58) + "…" : qp}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: C.inkFaint, letterSpacing: 0.4 }}>
                Cmd/Ctrl + Enter ile gönder
              </span>
              <button
                onClick={() => generate()}
                disabled={loading || !prompt.trim()}
                style={{
                  padding: "10px 22px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: mono,
                  fontWeight: 600,
                  background: prompt.trim() && !loading ? C.accent : C.surfaceAlt,
                  color: prompt.trim() && !loading ? "#FFFFFF" : C.inkFaint,
                  border: "none",
                  cursor: prompt.trim() && !loading ? "pointer" : "not-allowed",
                  letterSpacing: 0.3,
                }}
              >
                {loading ? "Hesaplanıyor…" : "▸ Çiz"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(205,66,70,0.08)",
                border: `1px solid rgba(205,66,70,0.28)`,
                borderRadius: 8,
                fontSize: 12,
                color: C.err,
              }}
            >
              ⚠ {error}
            </div>
          )}

          {/* Chart */}
          {response?.chartSpec && (
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 24,
                boxShadow: "0 1px 3px rgba(20,20,19,0.06)",
              }}
            >
              <div style={{ fontSize: 16, color: C.ink, fontWeight: 600, marginBottom: 16 }}>
                {response.chartSpec.title}
              </div>
              {renderChart(response.chartSpec)}
            </div>
          )}

          {/* Plan */}
          {response?.plan && (
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 24,
                boxShadow: "0 1px 3px rgba(20,20,19,0.06)",
              }}
            >
              <div style={{ fontSize: 11, color: C.accent, letterSpacing: 1.4, fontWeight: 600 }}>
                AKSİYON PLANI
              </div>
              <div style={{ fontSize: 16, color: C.ink, fontWeight: 600, marginTop: 6 }}>
                {response.plan.title}
              </div>
              <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {response.plan.bullets.map((b, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      gap: 12,
                      fontSize: 13,
                      color: C.inkMid,
                      lineHeight: 1.55,
                      padding: "8px 0",
                      borderBottom: i < response.plan!.bullets.length - 1 ? `1px solid ${C.border}` : "none",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: C.accentBg,
                        color: C.accent,
                        fontSize: 11,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Empty state */}
          {!response && !loading && !error && (
            <div
              style={{
                background: C.surface,
                border: `1px dashed ${C.borderStrong}`,
                borderRadius: 12,
                padding: 40,
                textAlign: "center",
                color: C.inkDim,
                fontSize: 13,
              }}
            >
              Bir prompt yaz veya hızlı şablonlardan birini seç → AI sana grafiği + aksiyon planını çıkarır.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
