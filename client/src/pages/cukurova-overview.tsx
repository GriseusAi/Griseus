import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend,
} from "recharts";

/* ── Google Fonts ── */
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

/* ── Number formatter ── */
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── Data ── */
const monthlyData = [
  { ay: "Oca", e: 1104, g: 528 },
  { ay: "Şub", e: 1343, g: 390 },
  { ay: "Mar", e: 979, g: 617 },
  { ay: "Nis", e: 733, g: 215 },
  { ay: "May", e: 1179, g: 351 },
  { ay: "Haz", e: 817, g: 602 },
  { ay: "Tem", e: 813, g: 319 },
  { ay: "Ağu", e: 1811, g: 545 },
  { ay: "Eyl", e: 1415, g: 445 },
  { ay: "Eki", e: 2144, g: 662 },
  { ay: "Kas", e: 1350, g: 296 },
  { ay: "Ara", e: 717, g: 121 },
];

const weeklyElektrik = [
  { h: "H40", plan: 539, gercek: 539 }, { h: "H41", plan: 550, gercek: 550 },
  { h: "H42", plan: 598, gercek: 598 }, { h: "H43", plan: 635, gercek: 572 },
  { h: "H44", plan: 275, gercek: 237 }, { h: "H45", plan: 530, gercek: 476 },
  { h: "H46", plan: 457, gercek: 357 }, { h: "H47", plan: 436, gercek: 156 },
  { h: "H48", plan: 510, gercek: 220 }, { h: "H49", plan: 440, gercek: 403 },
  { h: "H50", plan: 437, gercek: 67 }, { h: "H51", plan: 140, gercek: 140 },
];

const weeklyGaz = [
  { h: "H40", plan: 189, gercek: 189 }, { h: "H41", plan: 165, gercek: 134 },
  { h: "H42", plan: 168, gercek: 168 }, { h: "H43", plan: 177, gercek: 132 },
  { h: "H44", plan: 178, gercek: 118 }, { h: "H45", plan: 130, gercek: 102 },
  { h: "H46", plan: 146, gercek: 134 }, { h: "H47", plan: 155, gercek: 135 },
  { h: "H48", plan: 100, gercek: 80 }, { h: "H49", plan: 120, gercek: 90 },
  { h: "H50", plan: 111, gercek: 1 },
];

const produktElektrik = [
  { name: "GSS20P", pct: 34 }, { name: "GSS40P", pct: 18 }, { name: "GSN20/40", pct: 15 },
  { name: "GSA Serisi", pct: 12 }, { name: "GSU15/20", pct: 11 }, { name: "Diğer", pct: 10 },
];
const produktGaz = [
  { name: "ELT.7-11", pct: 38 }, { name: "CC.7-11", pct: 20 }, { name: "CPH.33", pct: 16 },
  { name: "BH 55", pct: 10 }, { name: "SSP 40/60", pct: 9 }, { name: "Diğer", pct: 7 },
];

const customers = [
  { flag: "\u{1F1F3}\u{1F1F1}", country: "Hollanda", name: "Infrarod Techniek" },
  { flag: "\u{1F1EE}\u{1F1EA}", country: "\u0130rlanda", name: "Harold Engineering" },
  { flag: "\u{1F1EC}\u{1F1F7}", country: "Yunanistan", name: "Mathioudakis" },
  { flag: "\u{1F1F0}\u{1F1FF}", country: "Kazakistan", name: "Jakko Aktobe" },
  { flag: "\u{1F1E6}\u{1F1FF}", country: "Azerbaycan", name: "Met-AK LLC" },
  { flag: "\u{1F1E9}\u{1F1EA}", country: "Almanya", name: "Fuar" },
  { flag: "\u{1F1F9}\u{1F1F7}", country: "T\u00FCrkiye", name: "Bauhaus + Avrupa Is\u0131 + Sovo" },
];

/* ── SVG Ring ── */
function Ring({ pct, color, size = 120, stroke = 10 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 8px ${color}55)`, transition: "stroke-dashoffset 1s ease" }}
      />
    </svg>
  );
}

/* ── Delivery Bar ── */
function DeliveryBar({ delivered, total, color, label }: { delivered: number; total: number; color: string; label: string }) {
  const pct = Math.round((delivered / total) * 100);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: sans, fontSize: 13, color: C.mid }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 13, color: C.white }}>{fmt(delivered)}/{fmt(total)}</span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 1s ease" }} />
      </div>
      <div style={{ textAlign: "right", marginTop: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color }}>{pct}%</span>
      </div>
    </div>
  );
}

/* ── Product Mix Bar ── */
function ProductMix({ items, color }: { items: { name: string; pct: number }[]; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (
        <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: sans, fontSize: 12, color: C.mid, width: 80, textAlign: "right", flexShrink: 0 }}>{it.name}</span>
          <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.03)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
            <div style={{ width: `${it.pct}%`, height: "100%", background: color, borderRadius: 4, opacity: 0.7, transition: "width 1s ease" }} />
          </div>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.white, width: 36, textAlign: "right" }}>{it.pct}%</span>
        </div>
      ))}
    </div>
  );
}

/* ── Pill Tab ── */
function PillTabs({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, gap: 2 }}>
      {tabs.map((t, i) => (
        <button
          key={t}
          onClick={() => onChange(i)}
          style={{
            fontFamily: sans, fontSize: 13, fontWeight: 500,
            padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: active === i ? "rgba(255,255,255,0.08)" : "transparent",
            color: active === i ? C.white : C.dim,
            transition: "all 0.2s",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* ── Recharts Tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(8,8,12,0.92)", backdropFilter: "blur(12px)", border: `1px solid ${C.cardBorder}`,
      borderRadius: 10, padding: "10px 14px", fontFamily: sans, fontSize: 12,
    }}>
      <div style={{ color: C.white, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span style={{ color: C.mid }}>{p.name}:</span>
          <span style={{ color: C.white, fontFamily: mono }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════ MAIN COMPONENT ════════════════════════════ */

export default function CukurovaOverview() {
  const [chartTab, setChartTab] = useState(0);
  const [weeklyLine, setWeeklyLine] = useState<"e" | "g">("e");
  const [produktTab, setProduktTab] = useState<"e" | "g">("e");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // inject font
    if (!document.querySelector('link[href*="DM+Sans"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
    const t = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14,
    padding: 20, ...extra,
  });

  const weeklyData = weeklyLine === "e" ? weeklyElektrik : weeklyGaz;
  const lineColor = weeklyLine === "e" ? C.elektrik : C.gaz;

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", fontFamily: sans, color: C.white,
      opacity: ready ? 1 : 0, transition: "opacity 0.6s ease",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 60px" }}>

        {/* ════ HEADER ════ */}
        <header style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: sans, fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                Çukurova Isı Sistemleri
              </h1>
              <p style={{ fontFamily: sans, fontSize: 13, color: C.dim, margin: "4px 0 0", letterSpacing: "0.02em" }}>
                Operations Intelligence — 2025 Üretim Verileri
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {/* Live badge */}
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 20,
                background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)",
                fontSize: 12, fontWeight: 600, color: C.ok,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.ok, display: "inline-block", boxShadow: `0 0 6px ${C.ok}` }} />
                Canlı Pilot
              </span>
              {/* Source tags */}
              {["Kapasite", "Üretim", "Netsis"].map((s) => (
                <span key={s} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: "rgba(255,255,255,0.04)", color: C.dim, border: `1px solid ${C.cardBorder}`,
                }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* ════ METRIC CARDS ════ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Toplam Üretim", value: 19496, sub: "2025 YTD", color: C.white },
            { label: "Elektrikli Hat", value: 14405, sub: "7 çalışan · 59 hafta", color: C.elektrik },
            { label: "Gazlı Hat", value: 5091, sub: "9 çalışan · 59 hafta", color: C.gaz },
            { label: "Pik Ay", value: 2806, sub: "Ekim 2025", color: C.warn },
          ].map((m) => (
            <div key={m.label} style={card()}>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 8, fontWeight: 500 }}>{m.label}</div>
              <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: m.color, lineHeight: 1 }}>
                {fmt(m.value)}
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* ════ CAPACITY + DELIVERY ROW ════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>

          {/* Kapasite Kullanımı */}
          <div style={card()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Kapasite Kullanımı</div>
            <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 20 }}>
              {[
                { label: "Elektrikli", pct: 64, color: C.elektrik, workers: 7, capMin: "8.3dk", actMin: "13dk" },
                { label: "Gazlı", pct: 87, color: C.gaz, workers: 9, capMin: "19dk", actMin: "21dk" },
              ].map((h) => (
                <div key={h.label} style={{ textAlign: "center" }}>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <Ring pct={h.pct} color={h.color} />
                    <div style={{
                      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(0deg)",
                    }}>
                      <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: h.color }}>{h.pct}%</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: h.color }}>{h.label}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{h.workers} çalışan</div>
                  <div style={{ fontSize: 11, color: C.dim }}>Kapasite: {h.capMin}/birim</div>
                  <div style={{ fontSize: 11, color: C.dim }}>Mevcut: {h.actMin}/birim</div>
                </div>
              ))}
            </div>
          </div>

          {/* Teslimat + Darboğaz */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Teslimat Oranları */}
            <div style={card({ flex: 1 })}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Teslimat Oranları</div>
              <div style={{ display: "flex", gap: 20 }}>
                <DeliveryBar delivered={4765} total={5547} color={C.elektrik} label="Elektrikli" />
                <DeliveryBar delivered={1183} total={1639} color={C.gaz} label="Gazlı" />
              </div>
            </div>

            {/* Darboğaz Uyarısı */}
            <div style={{
              ...card(),
              background: "rgba(251,191,36,0.04)",
              border: "1px solid rgba(251,191,36,0.15)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.warn, marginBottom: 4 }}>Darboğaz Uyarısı</div>
                  <p style={{ fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6 }}>
                    Elektrikli hatta birim üretim süresi kapasiteden %57 yavaş (13dk vs 8.3dk). H47–H50 arası sevk oranı kritik düşüş gösteriyor.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════ CHARTS ════ */}
        <div style={card({ marginBottom: 24 })}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <PillTabs tabs={["Aylık Üretim", "Haftalık Plan vs Gerçek"]} active={chartTab} onChange={setChartTab} />
            {chartTab === 1 && (
              <PillTabs
                tabs={["Elektrikli", "Gazlı"]}
                active={weeklyLine === "e" ? 0 : 1}
                onChange={(i) => setWeeklyLine(i === 0 ? "e" : "g")}
              />
            )}
          </div>

          <div style={{ width: "100%", height: 320 }}>
            {chartTab === 0 ? (
              <ResponsiveContainer>
                <BarChart data={monthlyData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="ay" tick={{ fill: C.dim, fontSize: 11, fontFamily: sans }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="e" name="Elektrikli" fill={C.elektrik} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="g" name="Gazlı" fill={C.gaz} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="gradPlan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradGercek" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.ok} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={C.ok} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="h" tick={{ fill: C.dim, fontSize: 11, fontFamily: sans }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="plan" name="Plan" stroke={lineColor} fill="url(#gradPlan)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="gercek" name="Gerçek" stroke={C.ok} fill="url(#gradGercek)" strokeWidth={2} dot={false} />
                  <Legend
                    verticalAlign="top" align="right" height={36}
                    formatter={(value: string) => <span style={{ color: C.mid, fontSize: 12, fontFamily: sans }}>{value}</span>}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ════ PRODUCT MIX ════ */}
        <div style={card({ marginBottom: 24 })}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Ürün Karması</div>
            <PillTabs
              tabs={["Elektrikli", "Gazlı"]}
              active={produktTab === "e" ? 0 : 1}
              onChange={(i) => setProduktTab(i === 0 ? "e" : "g")}
            />
          </div>
          <ProductMix
            items={produktTab === "e" ? produktElektrik : produktGaz}
            color={produktTab === "e" ? C.elektrik : C.gaz}
          />
        </div>

        {/* ════ INTERNATIONAL CUSTOMERS ════ */}
        <div style={card({ marginBottom: 24 })}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Uluslararası Müşteriler</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {customers.map((c) => (
              <div key={c.name} style={{
                padding: "12px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.02)", border: `1px solid ${C.cardBorder}`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 22 }}>{c.flag}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{c.country}</div>
                  <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.3 }}>{c.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ════ FOOTER ════ */}
        <footer style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          paddingTop: 20, borderTop: `1px solid ${C.cardBorder}`, flexWrap: "wrap", gap: 8,
        }}>
          <span style={{ fontSize: 12, color: C.dim }}>Griseus × Çukurova Isı A.Ş.</span>
          <span style={{ fontSize: 12, color: C.dim }}>Faz 2 Pilot · Operations Intelligence Platform</span>
        </footer>

      </div>
    </div>
  );
}
