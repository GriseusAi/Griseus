import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
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

/* ═══════════════════════════════════════════════════════════
   PALANTIR INTELLIGENCE DASHBOARD
   "Competition is for losers." — Peter Thiel
   ═══════════════════════════════════════════════════════════ */

export default function PalantirPage() {
  const [adet, setAdet] = useState(222);
  const [inputVal, setInputVal] = useState("222");
  const [activeTab, setActiveTab] = useState<"uretim" | "plan6" | "siparis" | "tenx">("uretim");
  const queryClient = useQueryClient();

  // WebSocket — kalp atisi: stok degisince tum sihir yeniden hesaplanir
  const onStockUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/palantir/demo/uretim-plani"] });
    queryClient.invalidateQueries({ queryKey: ["/api/palantir/demo/6-ay-plan"] });
    queryClient.invalidateQueries({ queryKey: ["/api/palantir/demo/acil-siparis"] });
    queryClient.invalidateQueries({ queryKey: ["/api/palantir/demo/10x"] });
  }, [queryClient]);
  const { connected } = useStockWebSocket(onStockUpdate);

  // Queries
  const uretim = useQuery<any>({
    queryKey: ["/api/palantir/demo/uretim-plani", adet],
    queryFn: () => fetch(`/api/palantir/demo/uretim-plani?adet=${adet}`).then(r => r.json()),
  });

  const plan6 = useQuery<any>({
    queryKey: ["/api/palantir/demo/6-ay-plan"],
    queryFn: () => fetch("/api/palantir/demo/6-ay-plan").then(r => r.json()),
  });

  const siparis = useQuery<any>({
    queryKey: ["/api/palantir/demo/acil-siparis"],
    queryFn: () => fetch("/api/palantir/demo/acil-siparis?ay=3").then(r => r.json()),
  });

  const tenx = useQuery<any>({
    queryKey: ["/api/palantir/demo/10x"],
    queryFn: () => fetch("/api/palantir/demo/10x").then(r => r.json()),
  });

  const handleSubmit = () => {
    const val = parseInt(inputVal);
    if (val > 0) setAdet(val);
  };

  const tabs = [
    { key: "uretim" as const, label: "Uretim Plani", icon: "⚙" },
    { key: "plan6" as const, label: "6 Ay Strateji", icon: "📊" },
    { key: "siparis" as const, label: "Acil Siparis", icon: "🚨" },
    { key: "tenx" as const, label: "10X Skor", icon: "⚡" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: "'Outfit', sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>⬡</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: C.white, margin: 0, letterSpacing: "-0.5px" }}>
              Palantir Intelligence Engine
            </h1>
            <p style={{ fontSize: 12, color: C.mid, margin: "2px 0 0" }}>
              ELT.7-11 — Holt-Winters + MRP + ABC-XYZ + Safety Stock
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {connected && (
              <div style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                borderRadius: 20, background: C.okDim, border: `1px solid ${C.okBorder}`,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.ok, animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 10, color: C.ok, fontWeight: 600 }}>CANLI</span>
              </div>
            )}
            <span style={{ fontSize: 11, color: C.dim }}>
              {uretim.data?._hesapSuresi && `Son hesap: ${uretim.data._hesapSuresi}`}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 400,
              background: activeTab === tab.key ? C.accentDim : "transparent",
              border: `1px solid ${activeTab === tab.key ? C.borderActive : "transparent"}`,
              color: activeTab === tab.key ? C.accent : C.dim,
              cursor: "pointer", fontFamily: "'Outfit', sans-serif", transition: "all 0.15s",
            }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ TAB 1: ÜRETIM PLANI ═══ */}
        {activeTab === "uretim" && (
          <div>
            {/* Input */}
            <div style={{
              ...glass, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 20, marginBottom: 16,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{ fontSize: 14, color: C.mid }}>Kac adet ELT.7-11 uretmek istiyorsun?</span>
              <input
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                style={{
                  width: 100, padding: "8px 12px", borderRadius: 8, fontSize: 18, fontWeight: 600,
                  background: C.dimmer, border: `1px solid ${C.borderActive}`, color: C.accent,
                  textAlign: "center", fontFamily: "'Outfit', sans-serif",
                }}
              />
              <button onClick={handleSubmit} style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: C.accent, color: "#fff", border: "none", cursor: "pointer",
              }}>Hesapla</button>
            </div>

            {uretim.isLoading && <LoadingPulse />}
            {uretim.data && (
              <AnimatePresence mode="wait">
                <motion.div key={adet} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  {/* Result cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <StatCard
                      label="Uretilebilir mi?"
                      value={uretim.data.cevap.uretilebilirMi}
                      sub={`Max: ${uretim.data.cevap.maxUretilebilir} adet`}
                      color={uretim.data.cevap.maxUretilebilir >= adet ? C.ok : C.err}
                    />
                    <StatCard
                      label="Darbogaz"
                      value={uretim.data.cevap.darbogaz.kod || "-"}
                      sub={uretim.data.cevap.darbogaz.parca || ""}
                      color={C.warn}
                    />
                    <StatCard
                      label="Hesap Suresi"
                      value={uretim.data._hesapSuresi}
                      sub={uretim.data.pisinHesapladigi?.hizFarki || ""}
                      color={C.accent}
                    />
                  </div>

                  {/* Eksik parcalar */}
                  {uretim.data.eksikParcalar?.toplam > 0 && (
                    <div style={{
                      ...glass, background: C.errDim, border: `1px solid ${C.errBorder}`,
                      borderRadius: 12, padding: 16, marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.err, marginBottom: 8 }}>
                        {uretim.data.eksikParcalar.mesaj}
                      </div>
                      {uretim.data.eksikParcalar.liste?.map((p: any) => (
                        <div key={p.kod} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "8px 0", borderBottom: `1px solid ${C.errBorder}`,
                        }}>
                          <div>
                            <span style={{ color: C.err, fontWeight: 600, fontSize: 13 }}>{p.kod}</span>
                            <span style={{ color: C.mid, fontSize: 12, marginLeft: 8 }}>{p.parca}</span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ color: C.err, fontWeight: 600, fontSize: 14 }}>{p.eksik} eksik</span>
                            <div style={{ color: C.dim, fontSize: 11 }}>{p.siparisVer}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Az kalan */}
                  {uretim.data.azKalanParcalar?.length > 0 && (
                    <div style={{
                      ...glass, background: C.warnDim, border: `1px solid ${C.warnBorder}`,
                      borderRadius: 12, padding: 16, marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.warn, marginBottom: 8 }}>
                        Dikkat — Sonraki uretimde eksik kalacak parcalar
                      </div>
                      {uretim.data.azKalanParcalar.map((p: any) => (
                        <div key={p.kod} style={{
                          display: "flex", justifyContent: "space-between", padding: "6px 0",
                          borderBottom: `1px solid ${C.warnBorder}`,
                        }}>
                          <span style={{ color: C.warn, fontSize: 12 }}>{p.kod} — {p.parca}</span>
                          <span style={{ color: C.mid, fontSize: 12 }}>Stok: {p.stokta} → Kalan: {p.uretimSonrasiKalan}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tüm parcalar tablosu */}
                  <div style={{
                    ...glass, background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: 16, overflow: "auto",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.mid, marginBottom: 12 }}>
                      Tum Bilesen Analizi — {uretim.data.tumParcalar?.length} parca
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {["Kod", "Parca", "Recete", "Stok", "Gerekli", "Kalan", "Max Uretim", "Durum"].map(h => (
                            <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: C.dim, fontWeight: 400, fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {uretim.data.tumParcalar?.map((p: any) => (
                          <tr key={p.kod} style={{
                            borderBottom: `1px solid ${C.border}`,
                            background: p.acilSiparis ? C.errDim : p.durum?.includes("AZ") ? C.warnDim : "transparent",
                          }}>
                            <td style={{ padding: "6px", color: C.accent, fontWeight: 500 }}>{p.kod}</td>
                            <td style={{ padding: "6px", color: C.mid, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.parca}</td>
                            <td style={{ padding: "6px", color: C.white }}>{p.receteMiktari}</td>
                            <td style={{ padding: "6px", color: C.white, fontWeight: 500 }}>{p.stokta?.toLocaleString()}</td>
                            <td style={{ padding: "6px", color: C.white }}>{p.gerekli?.toLocaleString()}</td>
                            <td style={{ padding: "6px", color: p.kalan < 0 ? C.err : p.kalan < 100 ? C.warn : C.ok, fontWeight: 600 }}>
                              {p.kalan?.toLocaleString()}
                            </td>
                            <td style={{ padding: "6px", color: C.white }}>{p.maxUretim}</td>
                            <td style={{ padding: "6px", fontSize: 11 }}>{p.durum}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        )}

        {/* ═══ TAB 2: 6 AY PLAN ═══ */}
        {activeTab === "plan6" && (
          <div>
            {plan6.isLoading && <LoadingPulse />}
            {plan6.data && (
              <div>
                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <StatCard label="Mamul Stok" value={plan6.data.ozet?.mevcutMamulStok ?? 0} sub="adet ELT.7-11" color={C.blue} />
                  <StatCard label="6 Ay Talep" value={plan6.data.ozet?.onumuzdeki6AyToplamTalep ?? 0} sub="adet toplam" color={C.purple} />
                  <StatCard label="En Yogun" value={plan6.data.ozet?.enYogunAy?.ay || "-"} sub={`${plan6.data.ozet?.enYogunAy?.tapinenTalep || 0} adet`} color={C.err} />
                  <StatCard label="En Dusuk" value={plan6.data.ozet?.enDusukAy?.ay || "-"} sub={`${plan6.data.ozet?.enDusukAy?.tapinenTalep || 0} adet`} color={C.ok} />
                </div>

                {/* Kritik uyarılar */}
                {plan6.data.kritikUyarilar?.length > 0 && (
                  <div style={{
                    ...glass, background: C.errDim, border: `1px solid ${C.errBorder}`,
                    borderRadius: 12, padding: 16, marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.err, marginBottom: 8 }}>Kritik Uyarilar</div>
                    {plan6.data.kritikUyarilar.map((u: string, i: number) => (
                      <div key={i} style={{ padding: "4px 0", fontSize: 12, color: C.white }}>{u}</div>
                    ))}
                  </div>
                )}

                {/* Sezonsel fırsatlar */}
                {plan6.data.sezonselFirsatlar?.length > 0 && (
                  <div style={{
                    ...glass, background: C.okDim, border: `1px solid ${C.okBorder}`,
                    borderRadius: 12, padding: 16, marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ok, marginBottom: 8 }}>Sezonsel Firsatlar</div>
                    {plan6.data.sezonselFirsatlar.map((f: string, i: number) => (
                      <div key={i} style={{ padding: "4px 0", fontSize: 12, color: C.white }}>{f}</div>
                    ))}
                  </div>
                )}

                {/* Monthly bars */}
                <div style={{
                  ...glass, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: 20,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.mid, marginBottom: 16 }}>Aylik Talep Projeksiyonu</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 200 }}>
                    {plan6.data.aylikPlan?.map((m: any) => {
                      const maxTalep = Math.max(...(plan6.data.aylikPlan?.map((x: any) => x.tapinenTalep) || [1]));
                      const h = (m.tapinenTalep / maxTalep) * 160;
                      const barColor = m.mevsimsellik?.includes("YOGUN") ? C.err
                        : m.mevsimsellik?.includes("DUSUK") ? C.blue : C.accent;
                      return (
                        <div key={m.ayNo} style={{ flex: 1, textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: C.white, fontWeight: 600, marginBottom: 4 }}>{m.tapinenTalep}</div>
                          <div style={{
                            height: h, borderRadius: "6px 6px 0 0",
                            background: `linear-gradient(180deg, ${barColor}, ${barColor}33)`,
                            transition: "height 0.5s ease",
                          }} />
                          <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{m.ay}</div>
                          <div style={{ fontSize: 9, color: C.dim }}>{m.mevsimsellik}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tükenen bilesen timeline */}
                <div style={{
                  ...glass, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: 16, marginTop: 12,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.mid, marginBottom: 12 }}>
                    Bilesen Tukenme Haritasi
                  </div>
                  {plan6.data.aylikPlan?.map((m: any) => (
                    <div key={m.ayNo} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 60, fontSize: 12, fontWeight: 500, color: C.white }}>{m.ay}</div>
                        <div style={{
                          flex: 1, height: 24, borderRadius: 6, position: "relative", overflow: "hidden",
                          background: C.dimmer,
                        }}>
                          <div style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${Math.min(100, (m.tukenenBilesenSayisi / 43) * 100)}%`,
                            background: m.tukenenBilesenSayisi > 10 ? C.err : m.tukenenBilesenSayisi > 0 ? C.warn : C.ok,
                            borderRadius: 6, transition: "width 0.5s ease",
                          }} />
                        </div>
                        <div style={{ width: 80, textAlign: "right", fontSize: 11, color: m.tukenenBilesenSayisi > 0 ? C.err : C.ok }}>
                          {m.tukenenBilesenSayisi}/43 tukenir
                        </div>
                      </div>
                      {m.tukenenler?.length > 0 && (
                        <div style={{ marginLeft: 72, marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {m.tukenenler.map((t: string, i: number) => (
                            <span key={i} style={{
                              fontSize: 10, padding: "2px 6px", borderRadius: 4,
                              background: C.errDim, border: `1px solid ${C.errBorder}`, color: C.err,
                            }}>{t}</span>
                          ))}
                          {m.tukenenBilesenSayisi > 3 && (
                            <span style={{ fontSize: 10, color: C.dim }}>+{m.tukenenBilesenSayisi - 3} daha</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 3: ACİL SİPARİŞ ═══ */}
        {activeTab === "siparis" && (
          <div>
            {siparis.isLoading && <LoadingPulse />}
            {siparis.data && (
              <div>
                {/* Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <StatCard label="Planlama Ufku" value={siparis.data.parametreler?.planlamaUfku || "3 ay"} sub={siparis.data.parametreler?.aylar || ""} color={C.accent} />
                  <StatCard label="Toplam Talep" value={siparis.data.parametreler?.toplamTapinenTalep || "-"} sub="" color={C.purple} />
                  <StatCard label="Acil" value={siparis.data.ozet?.acil || "0"} sub="BUGUN siparis ver!" color={C.err} />
                  <StatCard label="Yakin" value={siparis.data.ozet?.yakin || "0"} sub="Bu hafta siparis ver" color={C.warn} />
                </div>

                {/* Acil liste */}
                {siparis.data.acilSiparisler?.length > 0 && (
                  <div style={{
                    ...glass, background: C.errDim, border: `1px solid ${C.errBorder}`,
                    borderRadius: 12, padding: 16, marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.err, marginBottom: 12 }}>
                      🔴 ACIL — Bugun Siparis Ver
                    </div>
                    {siparis.data.acilSiparisler.map((s: any) => (
                      <div key={s.kod} style={{
                        background: C.surface, borderRadius: 8, padding: 12, marginBottom: 8,
                        border: `1px solid ${C.errBorder}`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <span style={{ color: C.err, fontWeight: 600, fontSize: 15 }}>{s.kod}</span>
                            <span style={{ color: C.mid, fontSize: 12, marginLeft: 8 }}>{s.parca}</span>
                          </div>
                          <div style={{ color: C.err, fontWeight: 700, fontSize: 18 }}>{s.siparisMiktari}</div>
                        </div>
                        <div style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>{s.neden}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Yakın */}
                {siparis.data.yakinSiparisler?.length > 0 && (
                  <div style={{
                    ...glass, background: C.warnDim, border: `1px solid ${C.warnBorder}`,
                    borderRadius: 12, padding: 16, marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.warn, marginBottom: 12 }}>
                      🟡 YAKIN — Bu Hafta Siparis Ver
                    </div>
                    {siparis.data.yakinSiparisler.map((s: any) => (
                      <div key={s.kod} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 0", borderBottom: `1px solid ${C.warnBorder}`,
                      }}>
                        <div>
                          <span style={{ color: C.warn, fontWeight: 600, fontSize: 13 }}>{s.kod}</span>
                          <span style={{ color: C.mid, fontSize: 11, marginLeft: 8 }}>{s.parca}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: C.warn, fontWeight: 600 }}>{s.siparisMiktari} {s.birim}</span>
                          <div style={{ color: C.dim, fontSize: 10 }}>Son tarih: {s.sonSiparisTarihi}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Planlı */}
                {siparis.data.planliSiparisler?.length > 0 && (
                  <div style={{
                    ...glass, background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: 16,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.ok, marginBottom: 12 }}>
                      🟢 PLANLI — 2 Hafta Icinde
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {["Kod", "Parca", "Stok", "Gerekli", "Siparis", "Gun"].map(h => (
                            <th key={h} style={{ padding: "6px", textAlign: "left", color: C.dim, fontWeight: 400, fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {siparis.data.planliSiparisler.map((s: any) => (
                          <tr key={s.kod} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: "6px", color: C.accent }}>{s.kod}</td>
                            <td style={{ padding: "6px", color: C.mid }}>{s.parca}</td>
                            <td style={{ padding: "6px", color: C.white }}>{s.mevcutStok?.toLocaleString()}</td>
                            <td style={{ padding: "6px", color: C.white }}>{s.gerekli?.toLocaleString()}</td>
                            <td style={{ padding: "6px", color: C.ok, fontWeight: 600 }}>{s.siparisMiktari} {s.birim}</td>
                            <td style={{ padding: "6px", color: C.mid }}>{s.gundeStokYeter}g</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 4: 10X SCORE ═══ */}
        {activeTab === "tenx" && (
          <div>
            {tenx.isLoading && <LoadingPulse />}
            {tenx.data && (
              <div>
                {/* Thiel quote */}
                <div style={{
                  ...glass, background: `linear-gradient(135deg, ${C.accentDim}, ${C.surface})`,
                  border: `1px solid ${C.borderActive}`, borderRadius: 12, padding: 20, marginBottom: 16,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 15, fontStyle: "italic", color: C.accent, lineHeight: 1.6 }}>
                    "{tenx.data.peterThiel?.alinti}"
                  </div>
                  <div style={{ fontSize: 12, color: C.mid, marginTop: 8 }}>
                    {tenx.data.peterThiel?.uyarlama}
                  </div>
                </div>

                {/* Comparison table */}
                <div style={{
                  ...glass, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: 16, marginBottom: 12,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 16 }}>
                    Manuel vs. Griseus Palantir
                  </div>
                  {tenx.data.karsilastirma?.map((k: any, i: number) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "180px 1fr 1fr 120px",
                      gap: 12, padding: "12px 0",
                      borderBottom: `1px solid ${C.border}`,
                      alignItems: "center",
                    }}>
                      <div style={{ color: C.accent, fontWeight: 600, fontSize: 12 }}>{k.kategori}</div>
                      <div style={{ color: C.err, fontSize: 11, opacity: 0.7 }}>
                        <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>MANUEL</div>
                        {k.manuel}
                      </div>
                      <div style={{ color: C.ok, fontSize: 11 }}>
                        <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>GRISEUS</div>
                        {k.griseus}
                      </div>
                      <div style={{
                        textAlign: "center", padding: "4px 8px", borderRadius: 6,
                        background: C.accentDim, color: C.accent, fontWeight: 700, fontSize: 13,
                      }}>
                        {k.fark}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Result */}
                <div style={{
                  ...glass, background: C.okDim, border: `1px solid ${C.okBorder}`,
                  borderRadius: 12, padding: 16,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.ok, marginBottom: 8 }}>Sonuc</div>
                  <div style={{ fontSize: 12, color: C.white, lineHeight: 1.8 }}>
                    <div>📈 {tenx.data.sonuc?.toplamKazanim}</div>
                    <div>🏆 {tenx.data.sonuc?.rakipFarki}</div>
                    <div>💰 {tenx.data.sonuc?.yatirimGeriDonusu}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper Components ── */
function StatCard({ label, value, sub, color }: { label: string; value: any; sub: string; color: string }) {
  return (
    <div style={{
      ...glass, background: `${color}08`, border: `1px solid ${color}25`,
      borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.5px" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function LoadingPulse() {
  return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 14, color: C.accent, animation: "pulse 1.5s infinite" }}>
        Palantir hesapliyor...
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
