import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import TopNav from "@/components/top-nav";
import { useStockWebSocket } from "@/lib/useStockWebSocket";

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
const mono = "'Outfit', sans-serif";

/* ═══════════════════════════════════════════════════════════
   SIHIR — 6 Aylik Strateji Penceresi
   ═══════════════════════════════════════════════════════════ */

export default function PalantirPage() {
  const queryClient = useQueryClient();
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  const onStockUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/palantir/demo/6-ay-plan"] });
  }, [queryClient]);
  const { connected } = useStockWebSocket(onStockUpdate);

  const plan = useQuery<any>({
    queryKey: ["/api/palantir/demo/6-ay-plan"],
    queryFn: () => fetch("/api/palantir/demo/6-ay-plan").then(r => r.json()),
  });

  const d = plan.data;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: mono }}>
      <TopNav connected={connected} />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

        {plan.isLoading && <LoadingPulse />}

        {d && (
          <>
            {/* ═══ HERO: Üretim Hazırlık Skoru ═══ */}
            <div style={{
              ...glass, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: "32px 40px", marginBottom: 20, position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${C.err}, ${C.warn}, ${C.ok})`,
                opacity: 0.6,
              }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", gap: 32, alignItems: "center" }}>
                {/* Score */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.dim, letterSpacing: 2, marginBottom: 8 }}>URETIM HAZIRLIK SKORU</div>
                  <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto" }}>
                    <svg viewBox="0 0 120 120" width="120" height="120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke={C.dimmer} strokeWidth="8" />
                      <circle cx="60" cy="60" r="52" fill="none"
                        stroke={d.skor <= 30 ? C.err : d.skor <= 60 ? C.warn : C.ok}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(d.skor / 100) * 327} 327`}
                        transform="rotate(-90 60 60)"
                        style={{ transition: "stroke-dasharray 1s ease" }}
                      />
                    </svg>
                    <div style={{
                      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                      textAlign: "center",
                    }}>
                      <div style={{
                        fontSize: 36, fontWeight: 800, letterSpacing: -2,
                        color: d.skor <= 30 ? C.err : d.skor <= 60 ? C.warn : C.ok,
                      }}>{d.skor}</div>
                      <div style={{ fontSize: 9, color: C.dim }}>/100</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.mid, marginTop: 8 }}>{d.skorYorum}</div>
                </div>

                <div style={{ background: C.border, width: 1, height: 80 }} />

                {/* Next Peak */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.dim, letterSpacing: 2, marginBottom: 8 }}>SONRAKI PIK SEZON</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: C.err }}>{d.sonrakiPik?.ay}</div>
                  <div style={{ fontSize: 13, color: C.mid }}>{d.sonrakiPik?.indeks}x talep</div>
                  <div style={{
                    marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "4px 12px", borderRadius: 20, background: C.errDim, border: `1px solid ${C.errBorder}`,
                  }}>
                    <div style={{ fontSize: 11, color: C.err, fontWeight: 600 }}>{d.sonrakiPik?.kalanGun} gun kaldi</div>
                  </div>
                </div>

                <div style={{ background: C.border, width: 1, height: 80 }} />

                {/* 6-Month Need */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.dim, letterSpacing: 2, marginBottom: 8 }}>6 AY TOPLAM TALEP</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: C.accent }}>
                    {d.ozet?.onumuzdeki6AyToplamTalep?.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, color: C.mid }}>adet ELT.7-11</div>
                  <div style={{ marginTop: 8, fontSize: 11, color: C.dim }}>
                    Uretilebilir: <span style={{ color: d.ozet?.mevcutMamulStok > 0 ? C.ok : C.err, fontWeight: 600 }}>
                      {d.ozet?.mevcutMamulStok}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ Kritik Karar Kutusu ═══ */}
            {d.kritikAksiyonlar?.length > 0 && (
              <div style={{
                ...glass, background: C.errDim, border: `1px solid ${C.errBorder}`,
                borderRadius: 12, padding: 20, marginBottom: 20,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.err, marginBottom: 12, letterSpacing: 1 }}>
                  HEMEN AKSIYON AL
                </div>
                {d.kritikAksiyonlar.map((a: any, i: number) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px", borderRadius: 8, marginBottom: 8,
                    background: "rgba(0,0,0,0.3)", border: `1px solid ${C.errBorder}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, color: C.white, fontWeight: 500 }}>{a.aksiyon}</div>
                      <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{a.neden}</div>
                    </div>
                    <div style={{
                      fontSize: 11, padding: "6px 14px", borderRadius: 6,
                      background: C.err, color: "#fff", fontWeight: 600, cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}>
                      {a.buton}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ═══ 6 Aylık Strateji Takvimi ═══ */}
            <div style={{
              ...glass, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 20, marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, color: C.dim, letterSpacing: 1, marginBottom: 16 }}>
                6 AYLIK STRATEJİ TAKVİMİ
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                {d.aylikPlan?.map((m: any, i: number) => {
                  const isExpanded = expandedMonth === i;
                  const maxTalep = Math.max(...(d.aylikPlan?.map((x: any) => x.tapinenTalep) || [1]));
                  const barH = (m.tapinenTalep / maxTalep) * 100;
                  const borderColor = m.aksiyonTipi === "KRITIK" ? C.err
                    : m.aksiyonTipi === "FIRSAT" ? C.ok
                    : m.aksiyonTipi === "HAZIRLIK" ? C.warn
                    : C.border;

                  return (
                    <div key={i}
                      onClick={() => setExpandedMonth(isExpanded ? null : i)}
                      style={{
                        borderRadius: 10, padding: 12, cursor: "pointer",
                        background: isExpanded ? `${borderColor}15` : C.surface,
                        border: `1px solid ${isExpanded ? borderColor : C.border}`,
                        transition: "all 0.2s",
                      }}
                    >
                      {/* Month header */}
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.white, marginBottom: 4 }}>{m.ay}</div>
                      <div style={{ fontSize: 9, color: borderColor, fontWeight: 500, marginBottom: 8 }}>{m.aksiyonEtiketi}</div>

                      {/* Bar */}
                      <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 8 }}>
                        <div style={{
                          width: "60%", height: barH, borderRadius: "4px 4px 0 0",
                          background: `linear-gradient(180deg, ${borderColor}, ${borderColor}33)`,
                          transition: "height 0.5s",
                        }} />
                      </div>

                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.white }}>{m.tapinenTalep}</div>
                        <div style={{ fontSize: 9, color: C.dim }}>adet talep</div>
                      </div>

                      {/* Risk indicator */}
                      {m.tukenenBilesenSayisi > 0 && (
                        <div style={{
                          marginTop: 8, textAlign: "center", fontSize: 10, padding: "3px 0",
                          borderRadius: 4, background: C.errDim, color: C.err,
                        }}>
                          {m.tukenenBilesenSayisi} parca tukenir
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Expanded month detail */}
              {expandedMonth !== null && d.aylikPlan?.[expandedMonth] && (
                <div style={{
                  marginTop: 12, padding: 16, borderRadius: 10,
                  background: C.dimmer, border: `1px solid ${C.border}`,
                }}>
                  {(() => {
                    const m = d.aylikPlan[expandedMonth];
                    return (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{m.ay} — Detay</div>
                          <div style={{ fontSize: 11, color: C.mid }}>
                            Mevsim indeksi: <span style={{ color: C.accent }}>{m.mevsimIndex}x</span>
                          </div>
                        </div>

                        {/* Strategy recommendation */}
                        <div style={{
                          padding: 12, borderRadius: 8, marginBottom: 12,
                          background: C.accentDim, border: `1px solid ${C.borderActive}`,
                        }}>
                          <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 4 }}>STRATEJİ</div>
                          <div style={{ fontSize: 12, color: C.white }}>{m.strateji}</div>
                        </div>

                        {/* Depleting parts */}
                        {m.tukenenler?.length > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: C.err, fontWeight: 500, marginBottom: 6 }}>
                              TUKENEN PARCALAR ({m.tukenenBilesenSayisi})
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {m.tukenenler.map((t: string, j: number) => (
                                <span key={j} style={{
                                  fontSize: 10, padding: "3px 8px", borderRadius: 4,
                                  background: C.errDim, border: `1px solid ${C.errBorder}`, color: C.err,
                                }}>{t}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.tukenenBilesenSayisi === 0 && (
                          <div style={{ fontSize: 11, color: C.ok }}>
                            Bu ayda tukenen parca yok.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ═══ Sezonsel İçgörü ═══ */}
            {d.sezonselIcgoru && (
              <div style={{
                ...glass, background: C.accentDim, border: `1px solid ${C.borderActive}`,
                borderRadius: 12, padding: 16,
              }}>
                <div style={{ fontSize: 12, color: C.accent, fontWeight: 600, marginBottom: 6 }}>ICERIK</div>
                <div style={{ fontSize: 12, color: C.white, lineHeight: 1.6 }}>{d.sezonselIcgoru}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LoadingPulse() {
  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <div style={{ fontSize: 14, color: C.accent, animation: "pulse 1.5s infinite" }}>Hesapliyor...</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
