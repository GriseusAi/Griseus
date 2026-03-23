import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, Cell,
} from "recharts";

/* ── Fonts ── */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

/* ── Palette ── */
const C = {
  bg: "#08080c", surface: "#0c0c12", card: "rgba(255,255,255,0.02)", cardBorder: "rgba(255,255,255,0.06)",
  green: "#1D9E75", amber: "#EF9F27", red: "#E24B4A", blue: "#3B8BD4",
  white: "#fff", mid: "#888", dim: "#555",
  greenGlow: "rgba(29,158,117,0.15)", amberGlow: "rgba(239,159,39,0.15)",
  redGlow: "rgba(226,75,74,0.15)", blueGlow: "rgba(59,139,212,0.15)",
};
const sans = "'Outfit', sans-serif";
const mono = "'JetBrains Mono', monospace";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── RAG helpers ── */
const RAG_COLORS: Record<string, string> = { red: C.red, amber: C.amber, green: C.green, blue: C.blue };
const RAG_GLOWS: Record<string, string> = { red: C.redGlow, amber: C.amberGlow, green: C.greenGlow, blue: C.blueGlow };
const RAG_LABELS: Record<string, string> = { red: "Kritik", amber: "Uyarı", green: "Normal", blue: "Fazla Stok" };

/* ── Types ── */
interface StockProduct {
  id: string;
  sku: string;
  title: string;
  properties: {
    total_production?: number;
    stock_percent?: number;
    order_percent?: number;
    unit_cost?: number;
    monthly_production?: number[];
    current_stock?: number;
    [key: string]: any;
  };
  computed: {
    rag_status?: string;
    stock_risk_score?: number;
    days_of_supply?: number;
    safety_stock?: number;
    reorder_point?: number;
    abc_class?: string;
    excess_inventory?: number;
    excess_inventory_value?: number;
    stock_to_order_ratio?: number;
    avg_monthly_demand?: number;
    current_month_demand_forecast?: number;
    next_3_months_forecast?: number[];
    holt_winters_seasonal?: number[];
    overstock_risk?: number;
    stockout_risk?: number;
    capital_risk?: number;
    daily_demand?: number;
    current_stock?: number;
    computed_at?: string;
    [key: string]: any;
  };
}

interface ForecastProduct {
  id: string;
  sku: string;
  title: string;
  forecast: { month: string; predicted_demand: number }[];
  total_forecast: number;
  avg_monthly_demand: number;
  seasonal_factors: number[];
}

interface CapitalExposure {
  total_capital_exposure: number;
  total_stock_value: number;
  exposure_percent: number;
  products: { sku: string; title: string; excess_units: number; excess_value: number; rag_status: string }[];
}

interface Dashboard {
  total_products: number;
  rag_distribution: { red: number; amber: number; green: number; blue: number };
  total_stock_value: number;
  total_excess_value: number;
  capital_efficiency: number;
  reorder_alerts: string[];
}

/* ── RAG Dot ── */
function RagDot({ status, size = 10 }: { status: string; size?: number }) {
  const color = RAG_COLORS[status] || C.mid;
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      backgroundColor: color, boxShadow: `0 0 6px ${color}88`,
    }} />
  );
}

/* ── Badge ── */
function AbcBadge({ cls }: { cls: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    A: { bg: "rgba(251,191,36,0.15)", fg: "#fbbf24" },
    B: { bg: "rgba(129,140,248,0.12)", fg: "#818cf8" },
    C: { bg: "rgba(255,255,255,0.06)", fg: C.mid },
  };
  const s = colors[cls] || colors.C;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
      fontFamily: mono, background: s.bg, color: s.fg,
    }}>{cls}</span>
  );
}

/* ── Metric Card ── */
function MetricCard({ value, label, sub, color, icon }: {
  value: string; label: string; sub?: string; color: string; icon: string;
}) {
  return (
    <div style={{
      flex: 1, padding: "20px 22px", borderRadius: 12, background: C.card,
      border: `1px solid ${C.cardBorder}`, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 12, right: 14, fontSize: 22, opacity: 0.3,
      }}>{icon}</div>
      <div style={{ fontSize: 10, color: C.mid, fontFamily: mono, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/* ── Risk Bar ── */
function RiskBar({ score }: { score: number }) {
  const color = score >= 60 ? C.red : score >= 30 ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
        <div style={{
          width: `${Math.min(score, 100)}%`, height: "100%", borderRadius: 2,
          background: color, boxShadow: `0 0 4px ${color}66`,
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ fontFamily: mono, fontSize: 12, color, fontWeight: 600 }}>{score}</span>
    </div>
  );
}

/* ── Product Detail Panel ── */
function ProductDetail({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const c = product.computed;
  const p = product.properties;
  const rag = c.rag_status || "green";
  const ragColor = RAG_COLORS[rag];

  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const monthlyData = (p.monthly_production || []).map((v: number, i: number) => ({
    month: months[i], production: v,
  }));

  // Add forecast
  const forecast = c.next_3_months_forecast || [];
  const currentMonth = new Date().getMonth();
  const forecastData = forecast.map((v: number, i: number) => ({
    month: months[(currentMonth + i + 1) % 12], forecast: v,
  }));

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 480, zIndex: 100,
      background: C.surface, borderLeft: `1px solid ${C.cardBorder}`,
      boxShadow: "-20px 0 60px rgba(0,0,0,0.5)", overflow: "auto",
      animation: "slideIn 0.25s ease",
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>

      {/* Header */}
      <div style={{ padding: "24px 24px 20px", borderBottom: `1px solid ${C.cardBorder}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <RagDot status={rag} size={12} />
              <span style={{ fontFamily: mono, fontSize: 11, color: ragColor, fontWeight: 700, textTransform: "uppercase" }}>
                {RAG_LABELS[rag]}
              </span>
              <AbcBadge cls={c.abc_class || "B"} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.white, fontFamily: sans }}>{product.title}</div>
            <div style={{ fontSize: 13, color: C.mid, fontFamily: mono, marginTop: 2 }}>{product.sku}</div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.06)", border: "none", color: C.mid,
            width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>
      </div>

      {/* Key Metrics */}
      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
          <div style={{ padding: "14px 12px", borderRadius: 10, background: C.card, border: `1px solid ${C.cardBorder}`, textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: ragColor }}>{c.days_of_supply || 0}</div>
            <div style={{ fontSize: 9, color: C.mid, marginTop: 2, textTransform: "uppercase" }}>Gün Stok</div>
          </div>
          <div style={{ padding: "14px 12px", borderRadius: 10, background: C.card, border: `1px solid ${C.cardBorder}`, textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.amber }}>{c.safety_stock || 0}</div>
            <div style={{ fontSize: 9, color: C.mid, marginTop: 2, textTransform: "uppercase" }}>Emniyet Stok</div>
          </div>
          <div style={{ padding: "14px 12px", borderRadius: 10, background: C.card, border: `1px solid ${C.cardBorder}`, textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.white }}>{c.reorder_point || 0}</div>
            <div style={{ fontSize: 9, color: C.mid, marginTop: 2, textTransform: "uppercase" }}>Sipariş Noktası</div>
          </div>
        </div>

        {/* Risk Breakdown */}
        <div style={{ fontSize: 11, fontWeight: 700, color: C.white, fontFamily: mono, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          Risk Analizi
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {[
            { label: "Fazla Stok Riski", value: c.overstock_risk || 0, weight: "40%" },
            { label: "Stok Tükenme Riski", value: c.stockout_risk || 0, weight: "30%" },
            { label: "Sermaye Riski", value: c.capital_risk || 0, weight: "30%" },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.mid, flex: 1 }}>{r.label} <span style={{ color: C.dim, fontSize: 10 }}>({r.weight})</span></span>
              <RiskBar score={r.value} />
            </div>
          ))}
        </div>

        {/* Production Stats */}
        <div style={{ fontSize: 11, fontWeight: 700, color: C.white, fontFamily: mono, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          Üretim Verileri
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
          {[
            { label: "Toplam Üretim", value: fmt(p.total_production || 0), unit: "adet" },
            { label: "Mevcut Stok", value: fmt(c.current_stock || 0), unit: "adet" },
            { label: "Stok / Sipariş", value: `${p.stock_percent || 0}% / ${p.order_percent || 0}%`, unit: "" },
            { label: "Birim Maliyet", value: fmt(p.unit_cost || 0), unit: "TRY" },
            { label: "Ort. Aylık Talep", value: fmt(c.avg_monthly_demand || 0), unit: "adet" },
            { label: "Günlük Talep", value: String(c.daily_demand || 0), unit: "adet" },
          ].map(s => (
            <div key={s.label} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.cardBorder}` }}>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 600, color: C.white }}>
                {s.value} <span style={{ fontSize: 10, color: C.dim, fontWeight: 400 }}>{s.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Monthly Production Chart */}
        <div style={{ fontSize: 11, fontWeight: 700, color: C.white, fontFamily: mono, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          Aylık Üretim
        </div>
        <div style={{ height: 160, marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fill: C.dim, fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.dim, fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.cardBorder}`, borderRadius: 8, fontFamily: mono, fontSize: 12 }} />
              <Bar dataKey="production" radius={[3, 3, 0, 0]}>
                {monthlyData.map((_: any, i: number) => (
                  <Cell key={i} fill={i >= 9 || i <= 0 ? C.amber : "rgba(255,255,255,0.15)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Seasonality Factors */}
        {c.holt_winters_seasonal && c.holt_winters_seasonal.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.white, fontFamily: mono, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
              Mevsimsellik (Holt-Winters)
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
              {c.holt_winters_seasonal.map((f: number, i: number) => {
                const height = Math.max(8, f * 30);
                const isHigh = f > 1.2;
                const isLow = f < 0.6;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{
                      width: "100%", height, borderRadius: 3,
                      background: isHigh ? C.amber : isLow ? C.blue : "rgba(255,255,255,0.1)",
                      transition: "height 0.3s ease",
                    }} />
                    <span style={{ fontSize: 8, color: C.dim, fontFamily: mono }}>{months[i]}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Excess Value */}
        {(c.excess_inventory || 0) > 0 && (
          <div style={{
            padding: 14, borderRadius: 10, background: C.blueGlow,
            border: `1px solid rgba(59,139,212,0.2)`, marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, fontFamily: mono, marginBottom: 4 }}>FAZLA STOK UYARISI</div>
            <div style={{ fontSize: 13, color: C.white }}>
              <span style={{ fontFamily: mono, fontWeight: 700 }}>{fmt(c.excess_inventory || 0)}</span> adet fazla stok,{" "}
              <span style={{ fontFamily: mono, fontWeight: 700, color: C.amber }}>{fmt(c.excess_inventory_value || 0)} TRY</span> sermaye bağlı.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ════════════════════════════════════════════════════════════════════════ */

export default function IntelligencePage() {
  const [, navigate] = useLocation();
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(null);

  // Fetch all data in parallel
  const { data: stockStatus, isLoading: loadingStock } = useQuery<StockProduct[]>({
    queryKey: ["/api/ontology/intelligence/stock-status"],
  });

  const { data: dashboard, isLoading: loadingDash } = useQuery<Dashboard>({
    queryKey: ["/api/ontology/compute/dashboard"],
  });

  const { data: forecast } = useQuery<ForecastProduct[]>({
    queryKey: ["/api/ontology/intelligence/seasonal-forecast"],
  });

  const { data: capitalExposure } = useQuery<CapitalExposure>({
    queryKey: ["/api/ontology/intelligence/capital-exposure"],
  });

  const products = stockStatus || [];
  const isLoading = loadingStock || loadingDash;

  // Compute summary metrics
  const totalProducts = dashboard?.total_products || products.length;
  const atRisk = (dashboard?.rag_distribution?.red || 0) + (dashboard?.rag_distribution?.amber || 0);
  const excessValue = dashboard?.total_excess_value || 0;
  const avgStockRatio = products.length > 0
    ? Math.round(products.reduce((sum, p) => sum + (p.computed?.stock_to_order_ratio || 0), 0) / products.length)
    : 0;

  // Seasonal chart data — aggregate all products' monthly production
  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const currentMonth = new Date().getMonth();

  const aggregateMonthly = months.map((m, i) => ({
    month: m,
    production: products.reduce((sum, p) => sum + ((p.properties?.monthly_production || [])[i] || 0), 0),
  }));

  // Forecast data — aggregate next 3 months
  const forecastMonths = forecast ? [0, 1, 2].map(i => ({
    month: months[(currentMonth + i + 1) % 12],
    forecast: forecast.reduce((sum, p) => sum + (p.forecast[i]?.predicted_demand || 0), 0),
  })) : [];

  // Combined chart data
  const chartData = aggregateMonthly.map(m => ({ ...m, forecast: null as number | null }));
  forecastMonths.forEach(fm => {
    const existing = chartData.find(d => d.month === fm.month);
    if (existing) {
      existing.forecast = fm.forecast;
    } else {
      chartData.push({ month: fm.month, production: 0, forecast: fm.forecast });
    }
  });

  return (
    <>
      <link href={FONT_LINK} rel="stylesheet" />
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        .intel-row { transition: background 0.15s ease; cursor: pointer; }
        .intel-row:hover { background: rgba(255,255,255,0.03) !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
      `}</style>

      <div style={{
        minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans,
        position: "relative",
      }}>
        {/* Backdrop overlay when detail panel is open */}
        {selectedProduct && (
          <div
            onClick={() => setSelectedProduct(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 90,
              background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)",
            }}
          />
        )}

        {/* Header */}
        <div style={{
          padding: "24px 32px 20px", borderBottom: `1px solid ${C.cardBorder}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => navigate("/engine")}
                style={{
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.cardBorder}`,
                  color: C.mid, width: 36, height: 36, borderRadius: 8, cursor: "pointer",
                  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >←</button>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>
                  Stok İstihbarat
                </h1>
                <p style={{ fontSize: 12, color: C.mid, margin: 0, fontFamily: mono }}>
                  Çukurova Isı Sistemleri — Gerçek Zamanlı Stok Analizi
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{
              padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)",
              border: `1px solid ${C.cardBorder}`, fontSize: 11, color: C.dim, fontFamily: mono,
            }}>
              {dashboard ? `Son güncelleme: ${new Date(dashboard.reorder_alerts ? Date.now() : 0).toLocaleString("tr-TR")}` : "Yükleniyor..."}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

          {/* ── Summary Cards ── */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28,
            animation: "fadeUp 0.4s ease",
          }}>
            <MetricCard
              icon="📦"
              label="İzlenen Ürün"
              value={String(totalProducts)}
              sub={`${dashboard?.rag_distribution?.green || 0} normal, ${dashboard?.rag_distribution?.blue || 0} fazla`}
              color={C.white}
            />
            <MetricCard
              icon="⚠"
              label="Risk Altında"
              value={String(atRisk)}
              sub={`${dashboard?.rag_distribution?.red || 0} kritik, ${dashboard?.rag_distribution?.amber || 0} uyarı`}
              color={atRisk > 0 ? C.red : C.green}
            />
            <MetricCard
              icon="💰"
              label="Bağlı Sermaye (Fazla)"
              value={`${fmt(excessValue)} ₺`}
              sub={`Toplam stok: ${fmt(dashboard?.total_stock_value || 0)} ₺`}
              color={C.amber}
            />
            <MetricCard
              icon="📊"
              label="Ort. Stok/Sipariş"
              value={`%${avgStockRatio}`}
              sub={avgStockRatio > 70 ? "Yüksek spekülatif üretim" : avgStockRatio > 40 ? "Orta seviye" : "Talep odaklı"}
              color={avgStockRatio > 70 ? C.red : avgStockRatio > 40 ? C.amber : C.green}
            />
          </div>

          {/* ── RAG Distribution Mini-bar ── */}
          {dashboard?.rag_distribution && (
            <div style={{
              display: "flex", height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 28,
              background: "rgba(255,255,255,0.04)",
            }}>
              {(["red", "amber", "green", "blue"] as const).map(rag => {
                const count = dashboard.rag_distribution[rag];
                const pct = totalProducts > 0 ? (count / totalProducts) * 100 : 0;
                return pct > 0 ? (
                  <div key={rag} style={{
                    width: `${pct}%`, background: RAG_COLORS[rag],
                    boxShadow: `0 0 8px ${RAG_COLORS[rag]}44`,
                  }} />
                ) : null;
              })}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20 }}>
            {/* ── Products Table ── */}
            <div style={{
              borderRadius: 12, background: C.card, border: `1px solid ${C.cardBorder}`,
              overflow: "hidden", animation: "fadeUp 0.5s ease",
            }}>
              {/* Table Header */}
              <div style={{
                padding: "14px 20px", borderBottom: `1px solid ${C.cardBorder}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>
                  Ürün Stok Durumu
                </div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: mono }}>
                  {products.length} ürün — risk sıralı
                </div>
              </div>

              {/* Column Headers */}
              <div style={{
                display: "grid", gridTemplateColumns: "36px 1fr 70px 80px 80px 80px 50px 90px",
                padding: "10px 20px", borderBottom: `1px solid rgba(255,255,255,0.03)`,
                fontSize: 10, color: C.dim, fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.5,
              }}>
                <span>RAG</span>
                <span>Ürün</span>
                <span style={{ textAlign: "right" }}>Risk</span>
                <span style={{ textAlign: "right" }}>Gün Stok</span>
                <span style={{ textAlign: "right" }}>Stok %</span>
                <span style={{ textAlign: "right" }}>Sipariş %</span>
                <span style={{ textAlign: "center" }}>ABC</span>
                <span style={{ textAlign: "right" }}>Fazla (₺)</span>
              </div>

              {/* Rows */}
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                {isLoading ? (
                  <div style={{ padding: 40, textAlign: "center", color: C.dim }}>Yükleniyor...</div>
                ) : products.map((product, i) => (
                  <div
                    key={product.id}
                    className="intel-row"
                    onClick={() => setSelectedProduct(product)}
                    style={{
                      display: "grid", gridTemplateColumns: "36px 1fr 70px 80px 80px 80px 50px 90px",
                      padding: "12px 20px", alignItems: "center",
                      borderBottom: `1px solid rgba(255,255,255,0.02)`,
                      animation: `fadeUp 0.3s ease ${i * 0.03}s both`,
                    }}
                  >
                    <RagDot status={product.computed?.rag_status || "green"} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.white }}>{product.title}</div>
                      <div style={{ fontSize: 10, color: C.dim, fontFamily: mono }}>{product.sku}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <RiskBar score={product.computed?.stock_risk_score || 0} />
                    </div>
                    <div style={{ textAlign: "right", fontFamily: mono, fontSize: 13, color: C.white }}>
                      {product.computed?.days_of_supply || 0}
                      <span style={{ fontSize: 10, color: C.dim }}> gün</span>
                    </div>
                    <div style={{ textAlign: "right", fontFamily: mono, fontSize: 13, color: C.mid }}>
                      {product.properties?.stock_percent || 0}%
                    </div>
                    <div style={{ textAlign: "right", fontFamily: mono, fontSize: 13, color: C.mid }}>
                      {product.properties?.order_percent || 0}%
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <AbcBadge cls={product.computed?.abc_class || "C"} />
                    </div>
                    <div style={{
                      textAlign: "right", fontFamily: mono, fontSize: 13,
                      color: (product.computed?.excess_inventory_value || 0) > 0 ? C.amber : C.dim,
                    }}>
                      {(product.computed?.excess_inventory_value || 0) > 0
                        ? `${fmt(product.computed?.excess_inventory_value || 0)} ₺`
                        : "—"
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right Column: Charts & Alerts ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Seasonal Chart */}
              <div style={{
                borderRadius: 12, background: C.card, border: `1px solid ${C.cardBorder}`,
                padding: 20, animation: "fadeUp 0.6s ease",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: C.white, fontFamily: mono,
                  marginBottom: 16, textTransform: "uppercase", letterSpacing: 1,
                }}>
                  Mevsimsel Üretim & Tahmin
                </div>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barCategoryGap="15%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="month" tick={{ fill: C.dim, fontSize: 9, fontFamily: mono }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: C.dim, fontSize: 9, fontFamily: mono }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip
                        contentStyle={{ background: C.surface, border: `1px solid ${C.cardBorder}`, borderRadius: 8, fontFamily: mono, fontSize: 11 }}
                        formatter={(value: any, name: string) => [value, name === "production" ? "Üretim" : "Tahmin"]}
                      />
                      <Bar dataKey="production" fill="rgba(255,255,255,0.12)" radius={[3, 3, 0, 0]} name="Üretim">
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.production > 0 ? "rgba(255,255,255,0.15)" : "transparent"} />
                        ))}
                      </Bar>
                      <Bar dataKey="forecast" fill={C.amber} radius={[3, 3, 0, 0]} name="Tahmin" opacity={0.7} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 10, justifyContent: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.dim }}>
                    <div style={{ width: 12, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
                    Gerçekleşen
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.dim }}>
                    <div style={{ width: 12, height: 4, borderRadius: 2, background: C.amber }} />
                    Tahmin (3 ay)
                  </div>
                </div>
              </div>

              {/* Capital Exposure */}
              <div style={{
                borderRadius: 12, background: C.card, border: `1px solid ${C.cardBorder}`,
                padding: 20, animation: "fadeUp 0.7s ease",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: C.white, fontFamily: mono,
                  marginBottom: 14, textTransform: "uppercase", letterSpacing: 1,
                }}>
                  Sermaye Maruziyeti
                </div>
                {capitalExposure && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: C.mid }}>Fazla stok değeri</span>
                      <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: C.amber }}>
                        {fmt(capitalExposure.total_capital_exposure)} ₺
                      </span>
                    </div>
                    <div style={{
                      height: 6, borderRadius: 3, background: "rgba(255,255,255,0.04)", marginBottom: 14,
                    }}>
                      <div style={{
                        width: `${Math.min(capitalExposure.exposure_percent, 100)}%`,
                        height: "100%", borderRadius: 3, background: C.amber,
                        boxShadow: `0 0 8px ${C.amber}44`,
                      }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {capitalExposure.products.slice(0, 5).map(p => (
                        <div key={p.sku} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <RagDot status={p.rag_status || "blue"} size={6} />
                            <span style={{ fontSize: 12, color: C.white }}>{p.sku}</span>
                          </div>
                          <span style={{ fontFamily: mono, fontSize: 11, color: C.amber }}>
                            {fmt(p.excess_value)} ₺
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Reorder Alerts */}
              {dashboard && dashboard.reorder_alerts.length > 0 && (
                <div style={{
                  borderRadius: 12, background: C.redGlow, border: `1px solid rgba(226,75,74,0.2)`,
                  padding: 20, animation: "fadeUp 0.8s ease",
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: C.red, fontFamily: mono,
                    marginBottom: 10, textTransform: "uppercase", letterSpacing: 1,
                  }}>
                    Sipariş Noktası Altı
                  </div>
                  {dashboard.reorder_alerts.map(title => (
                    <div key={title} style={{
                      padding: "8px 0", borderBottom: `1px solid rgba(226,75,74,0.1)`,
                      fontSize: 13, color: C.white, display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <RagDot status="red" size={6} />
                      {title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Detail Panel */}
        {selectedProduct && (
          <ProductDetail product={selectedProduct} onClose={() => setSelectedProduct(null)} />
        )}
      </div>
    </>
  );
}
