import { useState, useEffect } from "react";
import { useLocation } from "wouter";

/* ── Fonts ── */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

/* ── Palette ── */
const C = {
  bg: "#08080c", surface: "#0c0c12", card: "rgba(255,255,255,0.02)", cardBorder: "rgba(255,255,255,0.06)",
  green: "#34d399", indigo: "#818cf8", amber: "#fbbf24", pink: "#f472b6",
  white: "#fff", mid: "#888", dim: "#555", err: "#ef4444", blue: "#3B8BD4",
};
const sans = "'Outfit', sans-serif";
const mono = "'JetBrains Mono', monospace";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ── RAG color map ── */
const ragColor: Record<string, string> = { red: C.err, amber: C.amber, green: C.green, blue: C.indigo };

/* ── Types ── */
interface TierItem {
  id: string; title: string; externalId: string; rag: string;
  stock: number; monthlyAvg?: number; unit?: string; supplier?: string;
  leadTimeDays?: number; requiresNewFacility?: boolean;
}
interface Tier {
  id: string; tier: number; label: string; subtitle: string;
  stages: string[]; badge?: string; itemCount: number;
  rag: { red: number; amber: number; green: number; total: number };
  metric: { label: string; value: number; unit: string };
  items: TierItem[];
}
interface FlowData {
  tiers: Tier[];
  summary: { totalProducts: number; totalSemiFinished: number; totalRawMaterials: number; totalCapacity: number; totalProduction: number; productionLines: number };
}

/* ── Keyframes (injected once) ── */
const KEYFRAMES = `
@keyframes flowPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.9; }
}
@keyframes flowDash {
  to { stroke-dashoffset: -20; }
}
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

/* ── Arrow SVG between stages ── */
function FlowArrow({ color = C.dim }: { color?: string }) {
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" style={{ flexShrink: 0, margin: "0 2px" }}>
      <line x1="0" y1="12" x2="38" y2="12" stroke={color} strokeWidth="2"
        strokeDasharray="6 4" style={{ animation: "flowDash 1.2s linear infinite" }} />
      <polygon points="36,6 48,12 36,18" fill={color} style={{ animation: "flowPulse 2s ease-in-out infinite" }} />
    </svg>
  );
}

/* ── Stage Card ── */
function StageCard({ label, count, ragDist, isActive, onClick }: {
  label: string; count: number; ragDist?: { red: number; amber: number; green: number };
  isActive?: boolean; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      padding: "14px 18px", borderRadius: 10, minWidth: 110, cursor: onClick ? "pointer" : "default",
      background: isActive ? "rgba(129,140,248,0.1)" : C.card,
      border: `1px solid ${isActive ? "rgba(129,140,248,0.3)" : C.cardBorder}`,
      transition: "all 0.2s",
    }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = "rgba(129,140,248,0.25)"; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.borderColor = isActive ? "rgba(129,140,248,0.3)" : C.cardBorder; }}
    >
      <div style={{ fontSize: 11, color: C.mid, fontFamily: mono, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.white, fontFamily: sans }}>{fmt(count)}</div>
      {ragDist && (
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {ragDist.red > 0 && <span style={{ fontSize: 10, color: C.err, fontFamily: mono }}>{ragDist.red}R</span>}
          {ragDist.amber > 0 && <span style={{ fontSize: 10, color: C.amber, fontFamily: mono }}>{ragDist.amber}A</span>}
          {ragDist.green > 0 && <span style={{ fontSize: 10, color: C.green, fontFamily: mono }}>{ragDist.green}G</span>}
        </div>
      )}
    </div>
  );
}

/* ── RAG Dot ── */
function RagDot({ status }: { status: string }) {
  const color = ragColor[status] || C.dim;
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, boxShadow: `0 0 6px ${color}40`, flexShrink: 0,
    }} />
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function ProductionFlow() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<TierItem | null>(null);

  useEffect(() => {
    fetch("/api/ontology/production-flow")
      .then(r => { if (!r.ok) throw new Error("API error"); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.mid, fontFamily: sans, fontSize: 14 }}>Üretim akışı yükleniyor...</div>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.err, fontFamily: sans, fontSize: 14 }}>Hata: {error || "Veri alınamadı"}</div>
    </div>
  );

  const tierColors: Record<string, string> = { mamul: C.green, yari_mamul: C.amber, ham_madde: C.indigo };
  const tierIcons: Record<string, string> = { mamul: "📦", yari_mamul: "🔧", ham_madde: "🪨" };
  const activeTier = data.tiers.find(t => t.id === selectedTier);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, color: C.white }}>
      <style>{KEYFRAMES}</style>
      <link href={FONT_LINK} rel="stylesheet" />

      {/* ── Header ── */}
      <div style={{ padding: "20px 32px", borderBottom: `1px solid ${C.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => navigate("/engine")} style={{
            background: "none", border: `1px solid ${C.cardBorder}`, borderRadius: 8,
            color: C.mid, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontFamily: sans,
          }}>← Motor</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Üretim Akış Haritası</div>
            <div style={{ fontSize: 12, color: C.mid }}>3 Katmanlı Üretim Süreci — Çukurova Isı Sistemleri</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "Ürün", value: data.summary.totalProducts, color: C.green },
            { label: "Yarı Mamül", value: data.summary.totalSemiFinished, color: C.amber },
            { label: "Hammadde", value: data.summary.totalRawMaterials, color: C.indigo },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: mono }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.mid }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ display: "flex", height: "calc(100vh - 73px)" }}>

        {/* ── Left: Flow Diagram ── */}
        <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>

          {/* Summary bar */}
          <div style={{
            display: "flex", gap: 12, marginBottom: 28, padding: "14px 20px", borderRadius: 12,
            background: C.card, border: `1px solid ${C.cardBorder}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: C.mid, fontFamily: mono }}>TOPLAM KAPASİTE</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(data.summary.totalCapacity)} <span style={{ fontSize: 11, color: C.mid }}>adet/yıl</span></div>
            </div>
            <div style={{ width: 1, background: C.cardBorder }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: C.mid, fontFamily: mono }}>TOPLAM ÜRETİM</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(data.summary.totalProduction)} <span style={{ fontSize: 11, color: C.mid }}>adet/yıl</span></div>
            </div>
            <div style={{ width: 1, background: C.cardBorder }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: C.mid, fontFamily: mono }}>ÜRETİM HATLARI</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{data.summary.productionLines} <span style={{ fontSize: 11, color: C.mid }}>hat</span></div>
            </div>
          </div>

          {/* Tier Lanes */}
          {data.tiers.map((tier, idx) => {
            const tc = tierColors[tier.id] || C.mid;
            const isSelected = selectedTier === tier.id;
            return (
              <div key={tier.id} style={{
                marginBottom: 20, padding: "20px 24px", borderRadius: 14,
                background: isSelected ? `${tc}08` : C.card,
                border: `1px solid ${isSelected ? `${tc}40` : C.cardBorder}`,
                animation: `fadeIn 0.4s ease ${idx * 0.1}s both`,
                cursor: "pointer", transition: "all 0.25s",
              }}
                onClick={() => setSelectedTier(isSelected ? null : tier.id)}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = `${tc}30`; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = C.cardBorder; }}
              >
                {/* Tier Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{tierIcons[tier.id]}</span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, fontFamily: mono, color: tc,
                          padding: "2px 8px", borderRadius: 4, background: `${tc}15`,
                        }}>TIER {tier.tier}</span>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{tier.label}</span>
                        {tier.badge && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, fontFamily: mono,
                            padding: "2px 8px", borderRadius: 4,
                            background: "rgba(251,191,36,0.15)", color: C.amber,
                            border: "1px solid rgba(251,191,36,0.3)",
                          }}>{tier.badge}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{tier.subtitle}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, color: tc }}>{tier.itemCount}</div>
                    <div style={{ fontSize: 10, color: C.mid }}>{tier.metric.label}: {fmt(tier.metric.value)} {tier.metric.unit}</div>
                  </div>
                </div>

                {/* Flow Stages */}
                <div style={{ display: "flex", alignItems: "center", gap: 0, justifyContent: "center" }}>
                  {tier.stages.map((stage, si) => (
                    <div key={stage} style={{ display: "flex", alignItems: "center" }}>
                      {si > 0 && <FlowArrow color={tc} />}
                      <StageCard
                        label={stage}
                        count={tier.itemCount}
                        ragDist={si === 0 ? tier.rag : undefined}
                        isActive={isSelected}
                      />
                    </div>
                  ))}
                </div>

                {/* RAG Bar */}
                <div style={{ marginTop: 14, display: "flex", gap: 4, height: 4, borderRadius: 2, overflow: "hidden" }}>
                  {tier.rag.red > 0 && <div style={{ flex: tier.rag.red, background: C.err, borderRadius: 2 }} />}
                  {tier.rag.amber > 0 && <div style={{ flex: tier.rag.amber, background: C.amber, borderRadius: 2 }} />}
                  {tier.rag.green > 0 && <div style={{ flex: tier.rag.green, background: C.green, borderRadius: 2 }} />}
                </div>
              </div>
            );
          })}

          {/* Cross-tier flow summary */}
          <div style={{
            marginTop: 8, padding: "16px 20px", borderRadius: 12,
            background: C.card, border: `1px solid ${C.cardBorder}`, textAlign: "center",
          }}>
            <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, marginBottom: 8 }}>ÜRETİM AKIŞ YÖNELTİCİSİ</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontFamily: mono, color: C.indigo }}>HAM MADDE</span>
              <FlowArrow color={C.indigo} />
              <span style={{ fontSize: 11, fontFamily: mono, color: C.amber }}>YARI MAMÜL</span>
              <FlowArrow color={C.amber} />
              <span style={{ fontSize: 11, fontFamily: mono, color: C.green }}>MAMÜL</span>
              <FlowArrow color={C.green} />
              <span style={{ fontSize: 11, fontFamily: mono, color: C.mid }}>SATIŞ</span>
            </div>
          </div>
        </div>

        {/* ── Right: Detail Panel ── */}
        <div style={{
          width: activeTier ? 380 : 0, overflow: "hidden", transition: "width 0.3s ease",
          borderLeft: activeTier ? `1px solid ${C.cardBorder}` : "none",
          background: C.surface,
        }}>
          {activeTier && (
            <div style={{ padding: "20px", animation: "slideIn 0.3s ease", overflowY: "auto", height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{tierIcons[activeTier.id]}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{activeTier.label}</span>
                  {activeTier.badge && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, fontFamily: mono,
                      padding: "2px 6px", borderRadius: 4,
                      background: "rgba(251,191,36,0.15)", color: C.amber,
                    }}>{activeTier.badge}</span>
                  )}
                </div>
                <button onClick={(e) => { e.stopPropagation(); setSelectedTier(null); setSelectedItem(null); }} style={{
                  background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 18, lineHeight: 1,
                }}>×</button>
              </div>

              {/* Item list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeTier.items.map(item => {
                  const isItemSelected = selectedItem?.id === item.id;
                  const tc = tierColors[activeTier.id] || C.mid;
                  return (
                    <div key={item.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedItem(isItemSelected ? null : item); }}
                      style={{
                        padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                        background: isItemSelected ? `${tc}10` : C.card,
                        border: `1px solid ${isItemSelected ? `${tc}30` : C.cardBorder}`,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={e => { if (!isItemSelected) e.currentTarget.style.borderColor = `${tc}20`; }}
                      onMouseLeave={e => { if (!isItemSelected) e.currentTarget.style.borderColor = isItemSelected ? `${tc}30` : C.cardBorder; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <RagDot status={item.rag} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</div>
                            <div style={{ fontSize: 10, color: C.dim, fontFamily: mono }}>{item.externalId}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: mono }}>{fmt(item.stock)}</div>
                          <div style={{ fontSize: 9, color: C.dim }}>stok</div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isItemSelected && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.cardBorder}` }}>
                          {item.monthlyAvg !== undefined && (
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: C.mid }}>Aylık Ortalama</span>
                              <span style={{ fontSize: 10, fontFamily: mono }}>{fmt(item.monthlyAvg)} adet</span>
                            </div>
                          )}
                          {item.supplier && (
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: C.mid }}>Tedarikçi</span>
                              <span style={{ fontSize: 10, fontFamily: mono }}>{item.supplier}</span>
                            </div>
                          )}
                          {item.leadTimeDays !== undefined && item.leadTimeDays > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: C.mid }}>Teslim Süresi</span>
                              <span style={{ fontSize: 10, fontFamily: mono }}>{item.leadTimeDays} gün</span>
                            </div>
                          )}
                          {item.unit && (
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: C.mid }}>Birim</span>
                              <span style={{ fontSize: 10, fontFamily: mono }}>{item.unit}</span>
                            </div>
                          )}
                          {item.requiresNewFacility && (
                            <div style={{
                              marginTop: 6, padding: "4px 8px", borderRadius: 4, fontSize: 10,
                              background: "rgba(251,191,36,0.1)", color: C.amber, fontWeight: 600,
                              border: "1px solid rgba(251,191,36,0.2)", textAlign: "center",
                            }}>
                              🏭 Yeni Tesis Gerekli
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tier summary at bottom */}
              <div style={{
                marginTop: 16, padding: "12px 14px", borderRadius: 10,
                background: C.card, border: `1px solid ${C.cardBorder}`,
              }}>
                <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, marginBottom: 8 }}>DURUM DAĞILIMI</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.err }}>{activeTier.rag.red}</div>
                    <div style={{ fontSize: 9, color: C.mid }}>Kritik</div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.amber }}>{activeTier.rag.amber}</div>
                    <div style={{ fontSize: 9, color: C.mid }}>Uyarı</div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{activeTier.rag.green}</div>
                    <div style={{ fontSize: 9, color: C.mid }}>Normal</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
