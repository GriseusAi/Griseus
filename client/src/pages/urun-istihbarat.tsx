import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";

/* ═══════════════════════════════════════════════════════════
   PALETTE — same Palantir dark theme as stok-durum
   ═══════════════════════════════════════════════════════════ */
const C = {
  bg: "#050505", surface: "rgba(255,255,255,0.03)", surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderActive: "rgba(255,255,255,0.15)",
  accent: "#818cf8", accentDim: "rgba(99,102,241,0.10)", accentGlow: "rgba(99,102,241,0.20)",
  ok: "#34d399", okDim: "rgba(52,211,153,0.06)", okBorder: "rgba(52,211,153,0.15)",
  warn: "#fbbf24", warnDim: "rgba(251,191,36,0.06)", warnBorder: "rgba(251,191,36,0.15)",
  err: "#ef4444", errDim: "rgba(239,68,68,0.05)", errBorder: "rgba(239,68,68,0.12)",
  blue: "#60a5fa", blueDim: "rgba(96,165,250,0.06)", blueBorder: "rgba(96,165,250,0.15)",
  purple: "#a78bfa",
  white: "#f0f0f5", mid: "#7a7a90", dim: "#4a4a60", dimmer: "#1a1a2a",
};
const mono = "'Outfit', sans-serif";
const sans = "'Outfit', sans-serif";

const GLOBAL_STYLES = `
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes flowRight { from { background-position: 0 0; } to { background-position: 24px 0; } }
`;

/* ── Types ── */
interface BomComponent {
  code: string; name: string; requiredPerUnit: number; unit: string;
  tier: number; parentComponentCode: string | null;
  currentStock: number; maxProducts: number | null; status: string;
}

interface Bottleneck {
  code: string; name: string; tier: number; stock: number;
  required: number; maxProducts: number; note?: string;
}

interface SubAssembly {
  name: string; currentStock: number; producibleFromParts: number;
  partBottleneck: string;
  parts: Array<{ code: string; name: string; stock: number; required: number; maxProducts: number }>;
}

interface CapacityData {
  product: string; maxProducible: number;
  bottlenecks: Bottleneck[];
  subAssemblyStatus: Record<string, SubAssembly>;
}

interface StockData {
  product: string;
  components: BomComponent[];
}

interface IntelComponent {
  code: string; name: string; tier: number; unit: string;
  currentStock: number; requiredPerUnit: number;
  dailyBurnRate: number; weeklyBurnRate: number;
  daysToStockout: number | null; reorderPoint: number;
  isAboveReorderPoint: boolean;
  trend: "accelerating" | "stable" | "decelerating";
  trendRatio: number; suggestedOrderQty: number;
  urgency: "critical" | "warning" | "ok" | "abundant";
}

interface IntelData {
  product: string; salesLast30Days: number; dailySalesRate: number;
  leadTimeDays: number; components: IntelComponent[];
  criticalCount: number; warningCount: number;
  topRisks: IntelComponent[];
}

interface SimulationData {
  product: string; requestedQuantity: number; canProduce: boolean;
  maxProducible: number;
  shortages: Array<{ code: string; name: string; need: number; have: number; shortage: number }>;
  materialsNeeded: Array<{ code: string; name: string; need: number; have: number; remaining: number; mustAssemble?: number; tier: number }>;
  subAssemblyStatus: Record<string, SubAssembly>;
}

/* ── Status helpers ── */
function getStatusColor(status: string): string {
  switch (status) {
    case "critical": return C.err;
    case "warning": return C.warn;
    case "ok": return C.ok;
    case "abundant": return C.blue;
    default: return C.mid;
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case "critical": return C.errDim;
    case "warning": return C.warnDim;
    case "ok": return C.okDim;
    case "abundant": return C.blueDim;
    default: return C.surface;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "critical": return "KRİTİK";
    case "warning": return "DİKKAT";
    case "ok": return "NORMAL";
    case "abundant": return "BOL";
    default: return "—";
  }
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function UrunIstihbarat() {
  const [, params] = useRoute("/stok/urun/:sku");
  const [, navigate] = useLocation();
  const sku = params?.sku || "ELT.7-11";
  const [simQty, setSimQty] = useState<number>(100);
  const [runSim, setRunSim] = useState(false);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [showAllComponents, setShowAllComponents] = useState(false);

  // WebSocket for live updates
  const { connected } = useStockWebSocket((event) => {
    // Refetch on component stock updates
    if (event.movementType === "component_stock_update") {
      capacityQuery.refetch();
      stockQuery.refetch();
      if (runSim) simQuery.refetch();
    }
  });

  const capacityQuery = useQuery<CapacityData>({
    queryKey: ["/api/bom", sku, "production-capacity"],
    queryFn: () => fetch(`/api/bom/${sku}/production-capacity`).then(r => r.json()),
  });

  const stockQuery = useQuery<StockData>({
    queryKey: ["/api/bom", sku, "stock"],
    queryFn: () => fetch(`/api/bom/${sku}/stock`).then(r => r.json()),
  });

  const simQuery = useQuery<SimulationData>({
    queryKey: ["/api/bom", sku, "simulate", simQty],
    queryFn: () => fetch(`/api/bom/${sku}/simulate?quantity=${simQty}`).then(r => r.json()),
    enabled: runSim,
  });

  const intelQuery = useQuery<IntelData>({
    queryKey: ["/api/bom", sku, "intelligence"],
    queryFn: () => fetch(`/api/bom/${sku}/intelligence`).then(r => r.json()),
  });

  const seasonQuery = useQuery<any>({
    queryKey: ["/api/palantir/demo/6-ay-plan"],
    queryFn: () => fetch("/api/palantir/demo/6-ay-plan").then(r => r.json()),
  });

  const MONTHLY_DEMAND = [0, 340, 278, 131, 222, 162, 234, 108, 269, 98, 169, 22, 325]; // PDF kaynak
  const MONTH_NAMES_SHORT = ["", "Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];
  const SEASONAL_INDICES_FE = [1.73, 1.41, 0.67, 1.13, 0.82, 1.19, 0.55, 1.37, 0.50, 0.86, 0.11, 1.65]; // Oca-Ara (PDF kaynak)
  const currentMonth = new Date().getMonth() + 1;
  const thisMonthDemand = MONTHLY_DEMAND[currentMonth];

  const capacity = capacityQuery.data;
  const stock = stockQuery.data;
  const sim = simQuery.data;
  const intel = intelQuery.data;

  // Sort components for tree view
  const sortedComponents = useMemo(() => {
    if (!stock?.components) return [];
    const tier1 = stock.components.filter(c => c.tier === 1);
    const tier2 = stock.components.filter(c => c.tier === 2);
    const tier3 = stock.components.filter(c => c.tier === 3);
    // Group: tier 2 with its children, then tier 1
    const result: BomComponent[] = [];
    for (const sa of tier2) {
      result.push(sa);
      result.push(...tier3.filter(c => c.parentComponentCode === sa.code));
    }
    result.push(...tier1);
    return result;
  }, [stock]);

  const topBottleneck = capacity?.bottlenecks?.[0];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: sans, position: "relative", overflow: "hidden" }}>
      <div className="glass-bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <style>{GLOBAL_STYLES}</style>

      <TopNav connected={connected} />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px", position: "relative", zIndex: 1 }}>
        {/* ═══ Section 1: Production Capacity Card ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "32px 40px", marginBottom: 24, textAlign: "center", position: "relative",
            overflow: "hidden", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, ${C.accent}, ${C.ok}, ${C.accent})`,
            opacity: 0.6,
          }} />
          <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 2, marginBottom: 12 }}>
            MEVCUT STOKLA ÜRETİLEBİLİR
          </div>
          <div style={{
            fontSize: 72, fontWeight: 400, fontFamily: mono, lineHeight: 1,
            color: capacity ? (capacity.maxProducible > 200 ? C.ok : capacity.maxProducible > 50 ? C.warn : C.err) : C.dim,
            marginBottom: 8,
          }}>
            {capacity?.maxProducible ?? "—"}
          </div>
          <div style={{ fontSize: 16, fontFamily: sans, color: C.mid, marginBottom: 16 }}>
            adet {sku}
          </div>
          {topBottleneck && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px",
              borderRadius: 24, background: C.warnDim, border: `1px solid ${C.warnBorder}`,
            }}>
              <span style={{ fontSize: 12, fontFamily: mono, color: C.warn }}>
                Darboğaz: {topBottleneck.name} ({topBottleneck.stock}/{topBottleneck.required} = {topBottleneck.maxProducts})
              </span>
            </div>
          )}
        </motion.div>

        {/* ═══ Sub-Assembly Status ═══ */}
        {capacity?.subAssemblyStatus && Object.entries(capacity.subAssemblyStatus).map(([code, sub]) => (
          <motion.div key={code}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
            style={{
              background: C.surface, border: `1px solid ${sub.currentStock === 0 ? C.errBorder : C.border}`,
              borderRadius: 12, padding: "16px 24px", marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 400, color: C.white }}>
                    {sub.name} <span style={{ color: C.dim, fontFamily: mono, fontSize: 11 }}>({code})</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.mid, fontFamily: mono }}>YARI MAMÜL</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, letterSpacing: 1 }}>STOKTA</div>
                  <div style={{
                    fontSize: 24, fontWeight: 400, fontFamily: mono,
                    color: sub.currentStock > 0 ? C.ok : C.err,
                  }}>
                    {sub.currentStock}
                  </div>
                </div>
                <div style={{ width: 1, height: 32, background: C.border }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, letterSpacing: 1 }}>ÜRETİLEBİLİR</div>
                  <div style={{ fontSize: 24, fontWeight: 400, fontFamily: mono, color: C.accent }}>
                    {sub.producibleFromParts}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, fontFamily: mono, color: C.mid }}>
              Alt bileşen darboğazı: {sub.partBottleneck}
            </div>
            {/* Toggle sub-assembly parts */}
            <button
              onClick={() => setExpandedSub(expandedSub === code ? null : code)}
              style={{
                marginTop: 8, background: "none", border: "none", color: C.accent,
                fontFamily: mono, fontSize: 11, cursor: "pointer", padding: 0,
              }}
            >
              {expandedSub === code ? "▼ Alt bileşenleri gizle" : "► Alt bileşenleri göster"}
            </button>
            {expandedSub === code && sub.parts && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {sub.parts.map(p => (
                  <div key={p.code} style={{
                    padding: "8px 12px", borderRadius: 8, background: C.bg,
                    border: `1px solid ${p.maxProducts < 50 ? C.errBorder : p.maxProducts < 200 ? C.warnBorder : C.border}`,
                  }}>
                    <div style={{ fontSize: 10, fontFamily: mono, color: C.dim }}>{p.code}</div>
                    <div style={{ fontSize: 12, color: C.white, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: mono }}>
                      <span style={{ color: C.mid }}>Stok: <span style={{ color: C.white }}>{p.stock}</span></span>
                      <span style={{ color: p.maxProducts < 50 ? C.err : p.maxProducts < 200 ? C.warn : C.ok }}>
                        {p.maxProducts} ürün
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ))}

        {/* ═══ Seasonal Demand Pattern ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.12 }}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "24px", marginBottom: 24,
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1, marginBottom: 20 }}>
            MEVSIMSEL TALEP PATERNI — 3 YIL ORTALAMASI (2023-2025)
          </div>

          {/* Bar chart */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 220, marginBottom: 20 }}>
            {MONTHLY_DEMAND.slice(1).map((demand, i) => {
              const monthIndex = i + 1;
              const maxDemand = 340;
              const barHeight = (demand / maxDemand) * 170;
              const isCurrent = monthIndex === currentMonth;
              const barColor = isCurrent ? C.accent
                : demand > 250 ? C.err
                : demand < 120 ? C.blue
                : C.ok;
              return (
                <div key={monthIndex} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.white, fontWeight: 400, marginBottom: 4 }}>
                    {demand}
                  </div>
                  <div style={{
                    width: "70%", height: barHeight, borderRadius: "4px 4px 0 0",
                    background: `linear-gradient(180deg, ${barColor}, ${barColor}33)`,
                    transition: "height 0.5s ease",
                    ...(isCurrent ? {
                      boxShadow: `0 0 12px ${C.accentGlow}, inset 0 0 8px ${C.accentDim}`,
                      border: `1px solid ${C.accent}`,
                    } : {}),
                  }} />
                  <div style={{
                    fontSize: 10, fontFamily: mono, marginTop: 6,
                    color: isCurrent ? C.accent : C.dim,
                    fontWeight: isCurrent ? 600 : 400,
                  }}>
                    {MONTH_NAMES_SHORT[monthIndex]}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary stats */}
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{
              padding: "8px 16px", borderRadius: 8, background: C.accentDim, border: `1px solid ${C.borderActive}`,
              fontSize: 12, fontFamily: mono, color: C.accent, fontWeight: 400,
            }}>
              Bu Ay: {MONTH_NAMES_SHORT[currentMonth]} — {thisMonthDemand} adet
            </div>
            <div style={{
              padding: "8px 16px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
              fontSize: 12, fontFamily: mono, color: C.mid, fontWeight: 400,
            }}>
              Yillik: 2,358 adet
            </div>
            <div style={{
              padding: "8px 16px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
              fontSize: 12, fontFamily: mono, color: C.mid, fontWeight: 400,
            }}>
              Mevsim Endeksi: {(thisMonthDemand / 196.5).toFixed(2)}x
            </div>
          </div>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          {/* ═══ Section 2: Simulation Card ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}
            style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "24px",
            }}
          >
            <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1, marginBottom: 16 }}>
              SİPARİŞ SİMÜLASYONU
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
              <div style={{ fontSize: 13, color: C.mid }}>Kaç adet üretmek istiyorsun?</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                type="number" value={simQty}
                onChange={e => { setSimQty(parseInt(e.target.value) || 0); setRunSim(false); }}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 8,
                  background: C.bg, border: `1px solid ${C.border}`, color: C.white,
                  fontFamily: mono, fontSize: 16, fontWeight: 400, outline: "none",
                }}
                onFocus={e => { e.target.style.borderColor = C.accent; }}
                onBlur={e => { e.target.style.borderColor = C.border; }}
              />
              <button onClick={() => setRunSim(true)} style={{
                padding: "10px 24px", borderRadius: 8, border: "none",
                background: C.accent, color: "#fff", fontFamily: mono, fontSize: 12,
                fontWeight: 400, cursor: "pointer", letterSpacing: 0.5, transition: "all 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "#6366f1"; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.accent; }}
              >
                Simüle Et
              </button>
            </div>
            {/* Quick presets */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {[50, thisMonthDemand, 200, 500].map(n => (
                <button key={n} onClick={() => { setSimQty(n); setRunSim(true); }} style={{
                  padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
                  background: simQty === n ? C.accentDim : "transparent", color: simQty === n ? C.accent : C.mid,
                  fontFamily: mono, fontSize: 11, cursor: "pointer",
                }}>
                  {n}
                </button>
              ))}
            </div>

            {/* Simulation Result */}
            {sim && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                <div style={{
                  padding: "16px", borderRadius: 10,
                  background: sim.canProduce ? C.okDim : C.errDim,
                  border: `1px solid ${sim.canProduce ? C.okBorder : C.errBorder}`,
                  marginBottom: 16,
                }}>
                  <div style={{
                    fontSize: 16, fontWeight: 400, fontFamily: mono,
                    color: sim.canProduce ? C.ok : C.err, marginBottom: 4,
                  }}>
                    {sim.canProduce ? `✓ EVET — ${simQty} adet üretilebilir` : `✗ HAYIR — maksimum ${sim.maxProducible} adet`}
                  </div>
                  {!sim.canProduce && sim.shortages.length > 0 && (
                    <div style={{ fontSize: 12, color: C.mid, marginTop: 8 }}>
                      <div style={{ fontFamily: mono, color: C.err, fontWeight: 400, marginBottom: 4 }}>Eksik malzemeler:</div>
                      {sim.shortages.map(s => (
                        <div key={s.code} style={{ fontFamily: mono, fontSize: 11, color: C.mid, marginBottom: 2 }}>
                          {s.code} — {s.name}: {s.shortage} {s.need > 0 ? "eksik" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top materials needed */}
                {sim.materialsNeeded.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, letterSpacing: 1, marginBottom: 8 }}>
                      MALZEME İHTİYACI
                    </div>
                    {sim.materialsNeeded.slice(0, 8).map(m => (
                      <div key={m.code} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "6px 10px", borderRadius: 6, marginBottom: 4,
                        background: m.remaining < 0 ? C.errDim : "transparent",
                        border: `1px solid ${m.remaining < 0 ? C.errBorder : "transparent"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, width: 48 }}>{m.code}</span>
                          <span style={{ fontSize: 12, color: C.white }}>{m.name}</span>
                          {m.mustAssemble !== undefined && m.mustAssemble > 0 && (
                            <span style={{
                              fontSize: 9, fontFamily: mono, padding: "1px 6px", borderRadius: 4,
                              background: C.accentDim, color: C.accent,
                            }}>
                              {m.mustAssemble} montaj
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 11, display: "flex", gap: 16 }}>
                          <span style={{ color: C.mid }}>İhtiyaç: <span style={{ color: C.white }}>{m.need}</span></span>
                          <span style={{ color: m.remaining < 0 ? C.err : C.ok }}>
                            {m.remaining < 0 ? `${Math.abs(m.remaining)} eksik` : `${m.remaining} fazla`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* ═══ Section 3: Top Bottlenecks ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}
            style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "24px",
            }}
          >
            <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1, marginBottom: 16 }}>
              DARBOĞAZ ANALİZİ — İLK 10
            </div>
            {capacity?.bottlenecks.map((b, i) => {
              const maxCap = capacity.maxProducible;
              const barWidth = maxCap > 0 ? Math.min(100, (b.maxProducts / (maxCap * 3)) * 100) : 0;
              const barColor = b.maxProducts < 50 ? C.err : b.maxProducts < 200 ? C.warn : b.maxProducts < 500 ? C.ok : C.blue;
              return (
                <div key={b.code} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontFamily: mono, fontSize: 10, color: C.dim, width: 20, textAlign: "right",
                      }}>
                        #{i + 1}
                      </span>
                      <span style={{ fontFamily: mono, fontSize: 10, color: C.mid }}>{b.code}</span>
                      <span style={{ fontSize: 12, color: C.white }}>{b.name}</span>
                      {b.tier === 2 && (
                        <span style={{
                          fontSize: 8, fontFamily: mono, padding: "1px 6px", borderRadius: 4,
                          background: C.accentDim, color: C.accent, fontWeight: 400,
                        }}>
                          YARI MAMÜL
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 400, color: barColor }}>
                      {b.maxProducts}
                    </span>
                  </div>
                  <div style={{ height: 4, background: C.dimmer, borderRadius: 2, overflow: "hidden" }}>
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${barWidth}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                      style={{ height: "100%", borderRadius: 2, background: barColor }}
                    />
                  </div>
                  {b.note && (
                    <div style={{ fontSize: 10, fontFamily: mono, color: C.accent, marginTop: 2 }}>
                      {b.note}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* ═══ Section 4: Full Component Table ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "24px", marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
              BİLEŞEN STOK TABLOSU — {stock?.components.length || 0} PARÇA
            </div>
            <button onClick={() => setShowAllComponents(!showAllComponents)} style={{
              background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
              padding: "4px 12px", color: C.mid, fontFamily: mono, fontSize: 10, cursor: "pointer",
            }}>
              {showAllComponents ? "Sadece kritik göster" : "Tümünü göster"}
            </button>
          </div>

          {/* Table Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "70px 1fr 90px 80px 80px 90px 80px",
            gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
          }}>
            {["KOD", "BİLEŞEN ADI", "GEREKLİ", "BİRİM", "STOK", "ÜRETEBİLİR", "DURUM"].map(h => (
              <div key={h} style={{ fontSize: 9, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
                {h}
              </div>
            ))}
          </div>

          {/* Table Rows */}
          {sortedComponents
            .filter(c => showAllComponents || c.status === "critical" || c.status === "warning" || c.tier === 2)
            .map((c) => {
              const statusColor = getStatusColor(c.status);
              const isSub = c.tier === 3;
              const isSubAssembly = c.tier === 2;
              return (
                <div key={c.code} style={{
                  display: "grid", gridTemplateColumns: "70px 1fr 90px 80px 80px 90px 80px",
                  gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
                  background: isSubAssembly ? C.accentDim : isSub ? "rgba(255,255,255,0.01)" : "transparent",
                  paddingLeft: isSub ? 32 : 12,
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => { if (!isSubAssembly && !isSub) e.currentTarget.style.background = C.surfaceHover; }}
                  onMouseLeave={e => { if (!isSubAssembly && !isSub) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.mid }}>
                    {isSub ? "└ " : ""}{c.code}
                  </div>
                  <div style={{ fontSize: 12, color: C.white, display: "flex", alignItems: "center", gap: 6 }}>
                    {c.name}
                    {isSubAssembly && <span style={{ fontSize: 9, color: C.accent, fontFamily: mono }}>⚡ YARI MAMÜL</span>}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 12, color: C.white, fontWeight: 400 }}>
                    {c.requiredPerUnit}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>
                    {c.unit}
                  </div>
                  <div style={{
                    fontFamily: mono, fontSize: 12, fontWeight: 400,
                    color: c.currentStock < 0 ? C.err : c.currentStock === 0 ? C.err : c.currentStock < 100 ? C.warn : C.white,
                  }}>
                    {c.currentStock < 0 && "⚠️ "}
                    {c.currentStock % 1 === 0 ? c.currentStock : c.currentStock.toFixed(2)}
                  </div>
                  <div style={{
                    fontFamily: mono, fontSize: 12, fontWeight: 400,
                    color: c.maxProducts === null ? C.dim :
                      c.maxProducts === 0 ? C.err :
                      c.maxProducts < 50 ? C.err :
                      c.maxProducts < 200 ? C.warn : C.ok,
                  }}>
                    {c.maxProducts ?? "—"}
                  </div>
                  <div>
                    <span style={{
                      fontSize: 9, fontFamily: mono, fontWeight: 400, padding: "2px 8px",
                      borderRadius: 4, background: getStatusBg(c.status), color: statusColor,
                    }}>
                      {getStatusLabel(c.status)}
                    </span>
                  </div>
                </div>
              );
            })}
        </motion.div>

        {/* ═══ Section 5: Consumption Intelligence ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "24px", marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
              TÜKETİM İSTİHBARATI
            </div>
            {intel && (
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{
                  fontSize: 9, fontFamily: mono, padding: "3px 10px", borderRadius: 12,
                  background: C.accentDim, color: C.accent, fontWeight: 400,
                }}>
                  {intel.dailySalesRate} adet/gün satış
                </span>
                {intel.criticalCount > 0 && (
                  <span style={{
                    fontSize: 9, fontFamily: mono, padding: "3px 10px", borderRadius: 12,
                    background: C.errDim, color: C.err, fontWeight: 400,
                  }}>
                    {intel.criticalCount} KRİTİK
                  </span>
                )}
                {intel.warningCount > 0 && (
                  <span style={{
                    fontSize: 9, fontFamily: mono, padding: "3px 10px", borderRadius: 12,
                    background: C.warnDim, color: C.warn, fontWeight: 400,
                  }}>
                    {intel.warningCount} DİKKAT
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Intelligence Table Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "70px 1fr 80px 80px 80px 70px 80px",
            gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
          }}>
            {["KOD", "BİLEŞEN", "TÜKETİM/GÜN", "KAÇ GÜN", "SİP.NOKTASI", "BİTİŞ AYI", "ACİLİYET"].map(h => (
              <div key={h} style={{ fontSize: 9, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1 }}>
                {h}
              </div>
            ))}
          </div>

          {/* Intelligence Rows — Seasonal Only */}
          {intel?.components.map((c: any) => {
            const urgencyColor = c.urgency === "critical" ? C.err : c.urgency === "warning" ? C.warn : c.urgency === "ok" ? C.ok : C.blue;
            const urgencyBg = c.urgency === "critical" ? C.errDim : c.urgency === "warning" ? C.warnDim : c.urgency === "ok" ? C.okDim : C.blueDim;
            const urgencyLabel = c.urgency === "critical" ? "KRİTİK" : c.urgency === "warning" ? "DİKKAT" : c.urgency === "ok" ? "NORMAL" : "BOL";
            const riskColor = c.depletionRisk === "KRİTİK" ? C.err : c.depletionRisk === "YÜKSEK" ? C.warn : c.depletionRisk === "ORTA" ? C.blue : C.ok;

            return (
              <div key={c.code} style={{
                display: "grid", gridTemplateColumns: "70px 1fr 80px 80px 80px 70px 80px",
                gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
                background: c.urgency === "critical" ? C.errDim : c.winterStress ? "rgba(249,115,22,0.03)" : "transparent",
                transition: "background 0.15s",
              }}
                onMouseEnter={e => { if (c.urgency !== "critical") e.currentTarget.style.background = C.surfaceHover; }}
                onMouseLeave={e => { if (c.urgency !== "critical") e.currentTarget.style.background = c.winterStress ? "rgba(249,115,22,0.03)" : "transparent"; }}
              >
                <div style={{ fontFamily: mono, fontSize: 11, color: C.mid }}>{c.code}</div>
                <div style={{ fontSize: 12, color: C.white, display: "flex", alignItems: "center", gap: 6 }}>
                  {c.name}
                  {c.tier === 2 && <span style={{ fontSize: 8, color: C.accent, fontFamily: mono }}>YARI MAMÜL</span>}
                  {c.winterStress && <span style={{ fontSize: 8, color: "#f97316", fontFamily: mono }}>KIS RISKI</span>}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: C.white, fontWeight: 400 }}>
                  {c.dailyBurnRate}
                </div>
                {/* Kaç Gün (seasonal) */}
                <div style={{
                  fontFamily: mono, fontSize: 13, fontWeight: 600,
                  color: c.seasonalDays === 0 ? C.err
                    : c.seasonalDays !== null && c.seasonalDays < 30 ? C.err
                    : c.seasonalDays !== null && c.seasonalDays < 90 ? C.warn : C.ok,
                }}>
                  {c.seasonalDays !== null ? `${c.seasonalDays}g` : "—"}
                </div>
                {/* Sipariş Noktası (seasonal) */}
                <div style={{
                  fontFamily: mono, fontSize: 11,
                  color: c.currentStock > c.seasonalReorderPoint ? C.ok : C.err,
                }}>
                  {c.seasonalReorderPoint}
                  {c.currentStock <= c.seasonalReorderPoint && <span style={{ color: C.err, fontSize: 9 }}> !</span>}
                </div>
                {/* Bitiş Ayı */}
                <div style={{ fontFamily: mono, fontSize: 10, color: riskColor, fontWeight: 400 }}>
                  {c.depletionMonth ? `${c.depletionMonth} ${c.depletionYear}` : "—"}
                </div>
                <div>
                  <span style={{
                    fontSize: 9, fontFamily: mono, fontWeight: 400, padding: "2px 8px",
                    borderRadius: 4, background: urgencyBg, color: urgencyColor,
                  }}>
                    {urgencyLabel}
                  </span>
                </div>
              </div>
            );
          })}

          {!intel && (
            <div style={{ textAlign: "center", padding: 24, color: C.dim, fontSize: 12 }}>
              İstihbarat verisi yükleniyor...
            </div>
          )}
        </motion.div>

        {/* ═══ Section 6: Palantir Ontology Summary ═══ */}
        {intel && (intel as any).ontology && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.35 }}
            style={{
              background: C.surface, border: `1px solid ${C.accentGlow}`, borderRadius: 12,
              padding: "24px", marginBottom: 24, position: "relative", overflow: "hidden",
            }}
          >
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, ${C.accent}, ${C.ok}, ${C.blue})`,
              opacity: 0.6,
            }} />
            <div style={{ fontSize: 11, fontFamily: mono, color: C.dim, fontWeight: 400, letterSpacing: 1, marginBottom: 20 }}>
              PALANTİR ONTOLOJİ — BAĞLAMSAL ZEKA
            </div>

            {/* Ontology Graph SVG */}
            <div style={{ maxWidth: 600, margin: "0 auto 24px", opacity: 0.9 }}>
              <svg viewBox="0 0 600 180" width="100%" xmlns="http://www.w3.org/2000/svg">
                <rect x="230" y="5" width="140" height="45" rx="8" fill="#1e1b4b" stroke="#6366f1" strokeWidth="2" />
                <text x="300" y="24" textAnchor="middle" fill="#a5b4fc" fontSize="10" fontWeight="600">ELT 7-11</text>
                <text x="300" y="40" textAnchor="middle" fill="#6b7280" fontSize="9">{capacity?.maxProducible ?? "—"} adet üretilebilir</text>

                <rect x="450" y="70" width="130" height="45" rx="8" fill="#1a1a2e" stroke="#06b6d4" strokeWidth="2" />
                <text x="515" y="89" textAnchor="middle" fill="#67e8f9" fontSize="10" fontWeight="600">MEVSİM</text>
                <text x="515" y="105" textAnchor="middle" fill="#6b7280" fontSize="9">{(intel as any).ontology.currentMonth}: {(intel as any).ontology.currentSeasonalIndex}x</text>

                <rect x="20" y="70" width="130" height="45" rx="8" fill="#1a1a2e" stroke="#22c55e" strokeWidth="2" />
                <text x="85" y="89" textAnchor="middle" fill="#86efac" fontSize="10" fontWeight="600">{intel.components.length} PARÇA</text>
                <text x="85" y="105" textAnchor="middle" fill="#6b7280" fontSize="9">{intel.criticalCount} kritik</text>

                <rect x="230" y="135" width="140" height="35" rx="8" fill="#1a1a2e" stroke="#f97316" strokeWidth="2" />
                <text x="300" y="157" textAnchor="middle" fill="#fdba74" fontSize="10" fontWeight="600">TEDARİKÇİ: Çukurova Isı</text>

                <line x1="150" y1="92" x2="230" y2="35" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4" />
                <line x1="370" y1="35" x2="450" y2="85" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4" />
                <line x1="85" y1="115" x2="230" y2="148" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4" />
                <line x1="300" y1="50" x2="300" y2="135" stroke="#4b5563" strokeWidth="1" strokeDasharray="4" />

                <text x="175" y="58" textAnchor="middle" fill="#4b5563" fontSize="8" transform="rotate(-25, 175, 58)">BOM/Reçete</text>
                <text x="425" y="53" textAnchor="middle" fill="#4b5563" fontSize="8" transform="rotate(25, 425, 53)">talep_paterni</text>
                <text x="145" y="138" textAnchor="middle" fill="#4b5563" fontSize="8" transform="rotate(15, 145, 138)">supplied_by</text>
              </svg>
            </div>

            {/* Stats Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Toplam Parça", value: intel.components.length, color: C.white },
                { label: "Kritik Parça", value: intel.criticalCount, color: C.err },
                { label: "Kış Riski", value: (intel as any).ontology.winterRiskCount, color: "#f97316" },
                { label: "Ort. Gün Farkı", value: `+${(intel as any).ontology.avgDaysDifference}g`, color: C.ok },
              ].map(s => (
                <div key={s.label} style={{
                  background: C.bg, borderRadius: 8, padding: 12, textAlign: "center",
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: mono }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: C.dim, marginTop: 4, fontFamily: mono }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* 12-Month Seasonal Runway */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, fontFamily: mono, color: C.dim, letterSpacing: 1, marginBottom: 8 }}>
                12-AY MEVSİMSEL PİST
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {((intel as any).ontology.seasonalIndices as Array<{month: string; index: number}>).map((s, i) => {
                  const height = Math.max(12, s.index * 36);
                  const monthIdx = ["Oca","Sub","Mar","Nis","May","Haz","Tem","Agu","Eyl","Eki","Kas","Ara"].indexOf(s.month);
                  const isCurrent = monthIdx === currentMonth - 1;
                  const barColor = s.index >= 1.3 ? "rgba(239,68,68,0.6)" : s.index >= 0.8 ? "rgba(249,115,22,0.4)" : "rgba(34,197,94,0.3)";
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <div style={{
                        width: "100%", borderRadius: "3px 3px 0 0", background: barColor,
                        height, transition: "height 0.3s",
                        ...(isCurrent ? { border: `1px solid ${C.accent}`, boxShadow: `0 0 8px ${C.accentGlow}` } : {}),
                      }} />
                      <span style={{ fontSize: 8, color: isCurrent ? C.accent : C.dim, fontFamily: mono, fontWeight: isCurrent ? 700 : 400 }}>
                        {s.month}
                      </span>
                      <span style={{ fontSize: 7, color: C.dim, fontFamily: mono }}>{s.index}x</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ontology Insight */}
            <div style={{
              padding: 12, borderRadius: 8, background: C.accentDim, border: `1px solid ${C.borderActive}`,
            }}>
              <div style={{ fontSize: 11, color: C.white, lineHeight: 1.6 }}>
                <span style={{ color: C.accent, fontWeight: 600 }}>Ontoloji İçgörüsü: </span>
                Düz model "rahat" diyor, ontoloji "şimdi rahat ama kışa hazırlan" diyor.
                Ortalama <span style={{ color: C.ok, fontWeight: 600 }}>+{(intel as any).ontology.avgDaysDifference} gün</span> fark var
                çünkü düşük sezondayız. Ama bu <span style={{ color: C.err, fontWeight: 600 }}>sahte güvenlik</span> —
                kış geldiğinde tüketim {(SEASONAL_INDICES_FE[0] / SEASONAL_INDICES_FE[currentMonth - 1]).toFixed(1)}x artacak.
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Footer ── */}
        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 10, fontFamily: mono, color: C.dim }}>
          GRISEUS ÜRÜN İSTİHBARATI — {sku} — Palantir Ontoloji Motoru v1.0 — Veriler Çukurova Netsis'ten içe aktarıldı
        </div>
      </div>
    </div>
  );
}
