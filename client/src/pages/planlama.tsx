import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useStockWebSocket } from "@/lib/useStockWebSocket";
import TopNav from "@/components/top-nav";
import { motion, AnimatePresence } from "framer-motion";

/* ═══════════════════════════════════════════════════════════
   PALETTE — Palantir Foundry dark operational UI
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
const glass = {
  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.3)",
} as const;

const MONTH_NAMES = ["", "Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];
const MONTH_FULL = ["", "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran", "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"];

const SKU = "ELT.7-11";

/* ── Types ── */
interface MonthlyAvg {
  month: number; monthName: string; avgQuantity: number;
  years: { year: number; quantity: number }[];
  trend: "increasing" | "stable" | "decreasing";
}
interface ForecastData {
  product: string;
  dataRange: { years: number[]; totalRecords: number };
  monthlyAverages: MonthlyAvg[];
  yearlyTotals: Record<string, number>;
}
interface Shortage {
  code: string; name: string; required: number;
  currentStock: number; shortage: number; unit: string;
}
interface Prediction {
  targetYear: number; targetMonth: number; targetMonthName: string;
  forecastedDemand: number; historicalData: { year: number; quantity: number }[];
  trend: string;
  componentAnalysis: {
    totalComponentsNeeded: number;
    shortages: Shortage[];
    sufficient: Array<{ code: string; name: string; required: number; currentStock: number; surplus: number; unit: string }>;
  };
  canProduce: boolean; maxProducibleWithCurrentStock: number;
}
interface PredictData {
  product: string; currentDate: string; planningHorizon: string;
  predictions: Prediction[];
  purchaseSummary: {
    totalItemsToOrder: number;
    items: Array<{ code: string; name: string; totalShortage: number; unit: string; months: string[] }>;
  };
  currentProductionCapacity: {
    maxProducible: number;
    topBottlenecks: Array<{ code: string; name: string; maxProducts: number }>;
  };
}
interface ImportResult {
  success: boolean; totalImported: number; totalSkipped: number; message: string;
}

export default function PlanlamaPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [monthsAhead, setMonthsAhead] = useState(3);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"forecast" | "predict" | "import">("predict");

  // WebSocket — cross-page live sync (stock changes refresh planning forecasts)
  const { connected } = useStockWebSocket(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/planning/forecast"] });
    queryClient.invalidateQueries({ queryKey: ["/api/planning/predict"] });
  });

  // Queries
  const forecast = useQuery<ForecastData>({
    queryKey: ["/api/planning/forecast", SKU],
    queryFn: () => fetch(`/api/planning/forecast/${SKU}`).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const predict = useQuery<PredictData>({
    queryKey: ["/api/planning/predict", SKU, monthsAhead],
    queryFn: () => fetch(`/api/planning/predict/${SKU}?months_ahead=${monthsAhead}`).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  // Import mutation
  const importMut = useMutation<ImportResult, Error, FormData>({
    mutationFn: async (formData) => {
      const res = await fetch("/api/planning/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      setImportMsg(data.message);
      queryClient.invalidateQueries({ queryKey: ["/api/planning/forecast"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning/predict"] });
    },
    onError: (err) => setImportMsg(`Hata: ${err.message}`),
  });

  const handleImport = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("product_sku", SKU);
    importMut.mutate(fd);
  };

  const trendIcon = (t: string) => t === "increasing" ? "\u2191" : t === "decreasing" ? "\u2193" : "\u2192";
  const trendColor = (t: string) => t === "increasing" ? C.ok : t === "decreasing" ? C.err : C.mid;

  const hasData = forecast.data && forecast.data.monthlyAverages?.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: "'Outfit', sans-serif" }}>
      <TopNav />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: C.white, margin: 0 }}>
            Prediktif Planlama
          </h1>
          <p style={{ fontSize: 13, color: C.mid, margin: "4px 0 0" }}>
            ELT.7-11 — Tarihsel satis verileri + ileriye donuk uretim planlama + BOM gap analizi
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {([
            { key: "predict", label: "Planlama" },
            { key: "forecast", label: "Aylik Ortalamalar" },
            { key: "import", label: "Veri Import" },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 400,
                background: activeTab === tab.key ? C.accentDim : "transparent",
                border: `1px solid ${activeTab === tab.key ? C.borderActive : "transparent"}`,
                color: activeTab === tab.key ? C.accent : C.dim,
                cursor: "pointer", fontFamily: "'Outfit', sans-serif", transition: "all 0.15s",
              }}
            >{tab.label}</button>
          ))}
        </div>

        {/* ═══ PREDICT TAB — Prediktif Planlama ═══ */}
        {activeTab === "predict" && (
          <div>
            {/* Months ahead selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.mid }}>Planlama ufku:</span>
              {[1, 2, 3, 4, 5, 6].map(m => (
                <button key={m} onClick={() => setMonthsAhead(m)}
                  style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 11,
                    background: monthsAhead === m ? C.accent : C.surface,
                    border: `1px solid ${monthsAhead === m ? C.accent : C.border}`,
                    color: monthsAhead === m ? "#fff" : C.mid,
                    cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                  }}
                >{m} ay</button>
              ))}
            </div>

            {!hasData && (
              <div style={{
                padding: 40, textAlign: "center", ...glass, borderRadius: 12,
                border: `1px solid ${C.border}`, background: C.surface,
              }}>
                <p style={{ fontSize: 16, color: C.mid, margin: 0 }}>Henuz satis verisi yok</p>
                <p style={{ fontSize: 13, color: C.dim, margin: "8px 0 16px" }}>
                  Oncelikle "Veri Import" sekmesinden son 3 yilin Excel belgelerini yukleyin
                </p>
                <button onClick={() => setActiveTab("import")}
                  style={{
                    padding: "8px 20px", borderRadius: 8, fontSize: 12,
                    background: C.accent, border: "none", color: "#fff",
                    cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                  }}
                >Excel Yukle</button>
              </div>
            )}

            {predict.data && predict.data.predictions && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Summary Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <SummaryCard label="Mevcut Uretim Kapasitesi" value={`${predict.data.currentProductionCapacity.maxProducible} adet`} color={C.accent} />
                  <SummaryCard label="Satin Alma Gereken Komponent" value={`${predict.data.purchaseSummary.totalItemsToOrder} kalem`} color={predict.data.purchaseSummary.totalItemsToOrder > 0 ? C.err : C.ok} />
                  <SummaryCard label="Planlama Ufku" value={predict.data.planningHorizon} color={C.blue} />
                </div>

                {/* Per-month predictions */}
                {predict.data.predictions.map((pred, idx) => (
                  <motion.div key={idx} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                    style={{
                      ...glass, borderRadius: 12, padding: 20,
                      border: `1px solid ${pred.canProduce ? C.okBorder : C.errBorder}`,
                      background: pred.canProduce ? C.okDim : C.errDim,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 16, color: C.white }}>
                          {pred.targetMonthName} {pred.targetYear}
                        </h3>
                        <span style={{ fontSize: 11, color: C.mid }}>
                          Tahmin: {pred.forecastedDemand} adet | Trend: {trendIcon(pred.trend)}
                        </span>
                      </div>
                      <div style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                        background: pred.canProduce ? C.okDim : C.errDim,
                        border: `1px solid ${pred.canProduce ? C.okBorder : C.errBorder}`,
                        color: pred.canProduce ? C.ok : C.err,
                      }}>
                        {pred.canProduce ? "STOK YETERLI" : `${pred.componentAnalysis.shortages.length} EKSIK`}
                      </div>
                    </div>

                    {/* Historical reference */}
                    {pred.historicalData.length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                        {pred.historicalData.map(h => (
                          <span key={h.year} style={{
                            padding: "3px 10px", borderRadius: 6, fontSize: 10,
                            background: C.surface, border: `1px solid ${C.border}`, color: C.mid,
                          }}>
                            {h.year}: {h.quantity} adet
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Shortages */}
                    {pred.componentAnalysis.shortages.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <p style={{ fontSize: 11, color: C.err, margin: "0 0 8px", fontWeight: 500 }}>
                          Eksik Komponentler:
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 6 }}>
                          {pred.componentAnalysis.shortages.slice(0, 10).map(s => (
                            <div key={s.code} style={{
                              padding: "8px 12px", borderRadius: 8, fontSize: 11,
                              background: C.errDim, border: `1px solid ${C.errBorder}`,
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                            }}>
                              <div>
                                <span style={{ color: C.white }}>{s.name}</span>
                                <span style={{ color: C.dim, marginLeft: 6, fontSize: 10 }}>{s.code}</span>
                              </div>
                              <span style={{ color: C.err, fontWeight: 500 }}>
                                -{s.shortage} {s.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Purchase Summary */}
                {predict.data.purchaseSummary.items.length > 0 && (
                  <div style={{
                    ...glass, borderRadius: 12, padding: 20,
                    border: `1px solid ${C.warnBorder}`, background: C.warnDim,
                  }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 14, color: C.warn }}>
                      Satin Alma Listesi
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
                      {predict.data.purchaseSummary.items.map(item => (
                        <div key={item.code} style={{
                          padding: "10px 14px", borderRadius: 8,
                          background: C.surface, border: `1px solid ${C.border}`,
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <div>
                            <div style={{ fontSize: 12, color: C.white }}>{item.name}</div>
                            <div style={{ fontSize: 10, color: C.dim }}>{item.code} | {item.months.join(", ")}</div>
                          </div>
                          <div style={{
                            padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                            background: C.warnDim, border: `1px solid ${C.warnBorder}`, color: C.warn,
                          }}>
                            {item.totalShortage} {item.unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ FORECAST TAB — Aylik Ortalamalar ═══ */}
        {activeTab === "forecast" && (
          <div>
            {!hasData && (
              <div style={{
                padding: 40, textAlign: "center", ...glass, borderRadius: 12,
                border: `1px solid ${C.border}`, background: C.surface,
              }}>
                <p style={{ fontSize: 14, color: C.mid }}>Henuz veri yok. Excel import yapiniz.</p>
              </div>
            )}

            {forecast.data && forecast.data.monthlyAverages && (
              <>
                {/* Yearly totals */}
                <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  {Object.entries(forecast.data.yearlyTotals).map(([year, total]) => (
                    <div key={year} style={{
                      ...glass, padding: "12px 20px", borderRadius: 10,
                      border: `1px solid ${C.border}`, background: C.surface,
                    }}>
                      <div style={{ fontSize: 11, color: C.mid }}>{year}</div>
                      <div style={{ fontSize: 18, color: C.white, fontWeight: 500 }}>{total} adet</div>
                    </div>
                  ))}
                </div>

                {/* Monthly bar chart (simple) */}
                <div style={{
                  ...glass, borderRadius: 12, padding: 20,
                  border: `1px solid ${C.border}`, background: C.surface,
                }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 14, color: C.white }}>Aylik Satis Ortalamalari</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6, alignItems: "end", minHeight: 160 }}>
                    {forecast.data.monthlyAverages.map(m => {
                      const maxAvg = Math.max(...forecast.data!.monthlyAverages.map(a => a.avgQuantity), 1);
                      const height = (m.avgQuantity / maxAvg) * 120;
                      return (
                        <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 10, color: trendColor(m.trend) }}>{trendIcon(m.trend)}</span>
                          <span style={{ fontSize: 10, color: C.mid }}>{m.avgQuantity}</span>
                          <div style={{
                            width: "100%", height: Math.max(height, 4), borderRadius: 4,
                            background: `linear-gradient(180deg, ${C.accent}, rgba(99,102,241,0.3))`,
                            transition: "height 0.5s ease",
                          }} />
                          <span style={{ fontSize: 9, color: C.dim }}>{MONTH_NAMES[m.month]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detailed table */}
                <div style={{
                  ...glass, borderRadius: 12, padding: 20, marginTop: 16,
                  border: `1px solid ${C.border}`, background: C.surface,
                }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14, color: C.white }}>Detayli Tablo</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "8px 12px", color: C.mid, borderBottom: `1px solid ${C.border}` }}>Ay</th>
                          {forecast.data.dataRange.years.map(y => (
                            <th key={y} style={{ textAlign: "center", padding: "8px 12px", color: C.mid, borderBottom: `1px solid ${C.border}` }}>{y}</th>
                          ))}
                          <th style={{ textAlign: "center", padding: "8px 12px", color: C.accent, borderBottom: `1px solid ${C.border}` }}>Ortalama</th>
                          <th style={{ textAlign: "center", padding: "8px 12px", color: C.mid, borderBottom: `1px solid ${C.border}` }}>Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecast.data.monthlyAverages.map(m => (
                          <tr key={m.month}>
                            <td style={{ padding: "8px 12px", color: C.white, borderBottom: `1px solid ${C.border}` }}>
                              {m.monthName}
                            </td>
                            {forecast.data!.dataRange.years.map(y => {
                              const entry = m.years.find(e => e.year === y);
                              return (
                                <td key={y} style={{ textAlign: "center", padding: "8px 12px", color: entry ? C.white : C.dim, borderBottom: `1px solid ${C.border}` }}>
                                  {entry ? entry.quantity : "-"}
                                </td>
                              );
                            })}
                            <td style={{ textAlign: "center", padding: "8px 12px", color: C.accent, fontWeight: 500, borderBottom: `1px solid ${C.border}` }}>
                              {m.avgQuantity}
                            </td>
                            <td style={{ textAlign: "center", padding: "8px 12px", color: trendColor(m.trend), borderBottom: `1px solid ${C.border}` }}>
                              {trendIcon(m.trend)} {m.trend === "increasing" ? "Artis" : m.trend === "decreasing" ? "Dusus" : "Stabil"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ IMPORT TAB — Excel Yukle ═══ */}
        {activeTab === "import" && (
          <div style={{
            ...glass, borderRadius: 12, padding: 24,
            border: `1px solid ${C.border}`, background: C.surface,
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, color: C.white }}>Satis Verisi Import</h3>
            <p style={{ fontSize: 12, color: C.mid, margin: "0 0 20px" }}>
              Son 3 yilin ELT.7-11 satis belgelerini yukleyin. Excel dosyasinda su kolonlar olmali:
            </p>

            {/* Format guide */}
            <div style={{
              padding: 16, borderRadius: 8, marginBottom: 20,
              background: C.accentDim, border: `1px solid ${C.borderActive}`,
            }}>
              <p style={{ fontSize: 11, color: C.accent, margin: "0 0 8px", fontWeight: 500 }}>
                Beklenen Excel formati:
              </p>
              <table style={{ fontSize: 11, color: C.mid, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "4px 16px 4px 0", textAlign: "left", color: C.white }}>yil</th>
                    <th style={{ padding: "4px 16px 4px 0", textAlign: "left", color: C.white }}>ay</th>
                    <th style={{ padding: "4px 16px 4px 0", textAlign: "left", color: C.white }}>adet</th>
                    <th style={{ padding: "4px 16px 4px 0", textAlign: "left", color: C.dim }}>ciro (opsiyonel)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "2px 16px 2px 0" }}>2023</td>
                    <td style={{ padding: "2px 16px 2px 0" }}>1</td>
                    <td style={{ padding: "2px 16px 2px 0" }}>45</td>
                    <td style={{ padding: "2px 16px 2px 0" }}>125000</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "2px 16px 2px 0" }}>2023</td>
                    <td style={{ padding: "2px 16px 2px 0" }}>2</td>
                    <td style={{ padding: "2px 16px 2px 0" }}>38</td>
                    <td style={{ padding: "2px 16px 2px 0" }}>98000</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: 10, color: C.dim, margin: "8px 0 0" }}>
                Kolon isimleri esnek: yil/year, ay/month, adet/miktar/quantity, ciro/revenue hepsi kabul edilir.
              </p>
            </div>

            {/* Upload area */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                style={{
                  fontSize: 12, color: C.mid, fontFamily: "'Outfit', sans-serif",
                }}
              />
              <button onClick={handleImport} disabled={importMut.isPending}
                style={{
                  padding: "8px 20px", borderRadius: 8, fontSize: 12,
                  background: importMut.isPending ? C.dim : C.accent, border: "none", color: "#fff",
                  cursor: importMut.isPending ? "wait" : "pointer",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {importMut.isPending ? "Yukleniyor..." : "Import Et"}
              </button>
            </div>

            {/* Result */}
            {importMsg && (
              <div style={{
                marginTop: 16, padding: 12, borderRadius: 8,
                background: importMut.isError ? C.errDim : C.okDim,
                border: `1px solid ${importMut.isError ? C.errBorder : C.okBorder}`,
                fontSize: 12, color: importMut.isError ? C.err : C.ok,
              }}>
                {importMsg}
              </div>
            )}

            {/* Existing data info */}
            {forecast.data && (
              <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 11, color: C.mid, margin: 0 }}>
                  Mevcut veri: {forecast.data.dataRange.years.join(", ")} yillari, {forecast.data.dataRange.totalRecords} kayit
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Summary Card Component ── */
function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      ...glass, padding: "14px 18px", borderRadius: 10,
      border: `1px solid rgba(255,255,255,0.08)`, background: "rgba(255,255,255,0.03)",
    }}>
      <div style={{ fontSize: 10, color: "#7a7a90", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: 20, color, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
