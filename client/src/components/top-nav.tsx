import { useLocation } from "wouter";
import { useAgentPanel, useGlobalAlerts } from "../App";
import { useState, useRef, useEffect } from "react";
import type { ProactiveAlertData } from "../lib/useStockWebSocket";
import { Bell, CircleAlert, CircleCheck, CircleHelp, Clock3, Factory, GitBranch, Network, Sigma } from "lucide-react";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";

const C = {
  bg: "rgba(250,249,245,0.88)",
  panel: "rgba(255,255,255,0.98)",
  border: CT.border,
  accent: CT.accent,
  accentDim: CT.accentSoft,
  borderActive: CT.borderStrong,
  white: CT.ink,
  mid: CT.inkSub,
  dim: CT.inkMuted,
  ok: CT.ok,
  err: CT.err,
  warn: CT.warn,
  blue: CT.info,
  errBorder: "rgba(179,64,55,0.28)",
  warnBorder: "rgba(184,118,28,0.28)",
  blueBorder: "rgba(61,111,176,0.28)",
};
const mono = CT_MONO;

type NavItem = {
  path: string;
  label: string;
  icon?: string;
  iconNode?: React.ReactNode;
  matchPrefix?: string;
};

function useNavItems(): NavItem[] {
  return [
    {
      path: "/",
      label: "",
      iconNode: <Factory size={18} />,
    },
    { path: "/lineage", label: "LineAge", iconNode: <Sigma size={16} /> },
    { path: "/ontology-layers", label: "Ontology", iconNode: <Network size={16} /> },
    { path: "/pipeline-builder", label: "Pipeline", iconNode: <GitBranch size={16} /> },
  ];
}

export default function TopNav({ connected, alerts: propAlerts }: { connected?: boolean; alerts?: ProactiveAlertData[] }) {
  const [location, navigate] = useLocation();
  const { agentOpen, toggleAgent } = useAgentPanel();
  const { alerts: globalAlerts } = useGlobalAlerts();
  const NAV_ITEMS = useNavItems();
  const alerts = propAlerts ?? globalAlerts;
  const [panelOpen, setPanelOpen] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = Math.max(0, alerts.length - readCount);

  // Türkiye saati — canlı
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const trTime = now.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const trDate = now.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });

  const handleToggle = () => {
    setPanelOpen(prev => !prev);
    if (!panelOpen) setReadCount(alerts.length);
  };

  // Dışına tıklanınca kapat
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    if (panelOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [panelOpen]);

  const isActive = (path: string) => location === path;

  const SeverityIcon = ({ severity }: { severity: string }) => {
    if (severity === "critical") return <CircleAlert size={14} />;
    if (severity === "warning") return <CircleHelp size={14} />;
    return <CircleCheck size={14} />;
  };
  const severityColor: Record<string, string> = { critical: C.err, warning: C.warn, info: C.blue };
  const severityBg: Record<string, string> = {
    critical: CT.errSoft,
    warning: CT.warnSoft,
    info: CT.infoSoft,
  };
  const severityBorder: Record<string, string> = {
    critical: C.errBorder,
    warning: C.warnBorder,
    info: C.blueBorder,
  };

  return (
    <nav style={{
      padding: "0 16px", height: 48, display: "flex", alignItems: "center",
      justifyContent: "space-between", borderBottom: `1px solid ${C.border}`,
      background: C.bg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      color: C.white, fontFamily: CT_FONT,
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {NAV_ITEMS.map(n => {
          const active = isActive(n.path);
          return (
            <button
              key={n.path}
              onClick={() => navigate(n.path)}
              style={{
                padding: n.label ? "6px 14px" : "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 400,
                background: active ? C.accentDim : "transparent",
                border: `1px solid ${active ? C.borderActive : "transparent"}`,
                color: active ? C.accent : C.dim,
                cursor: "pointer", fontFamily: CT_FONT,
                transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 14, display: "inline-flex", alignItems: "center" }}>
                {n.iconNode ?? n.icon}
              </span>
              {n.label && <span className="nav-label">{n.label}</span>}
            </button>
          );
        })}

        {/* gix — toggle panel */}
        <button
          onClick={toggleAgent}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 400,
            background: agentOpen ? C.accentDim : "transparent",
            border: `1px solid ${agentOpen ? C.accent : "transparent"}`,
            color: agentOpen ? C.accent : C.dim,
            cursor: "pointer", fontFamily: CT_FONT,
            transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, fontFamily: "'STIX Two Math', 'Cambria Math', 'Latin Modern Math', serif" }}>∴</span>
          <span className="nav-label">gix</span>
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Türkiye Saati */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "4px 12px",
          borderRadius: 8, background: CT.surfaceMuted,
          border: `1px solid ${C.border}`,
        }}>
          <Clock3 size={13} color={C.accent} />
          <span style={{ fontSize: 12, fontFamily: mono, color: C.accent, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
            {trTime}
          </span>
          <span className="nav-date" style={{ fontSize: 9, fontFamily: mono, color: C.mid }}>
            {trDate}
          </span>
        </div>

        {/* Bildirim Zili */}
        <div ref={panelRef} style={{ position: "relative" }}>
          <button
            onClick={handleToggle}
            style={{
              position: "relative", background: panelOpen ? C.accentDim : "transparent",
              border: `1px solid ${panelOpen ? C.borderActive : "transparent"}`,
              borderRadius: 8, padding: "6px 10px", cursor: "pointer",
              color: panelOpen ? C.accent : C.dim, fontSize: 14,
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 2, right: 2,
                minWidth: 14, height: 14, borderRadius: 7,
                background: C.err, color: "#fff",
                fontSize: 8, fontWeight: 600, fontFamily: mono,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 3px",
              }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Bildirim Paneli */}
          {panelOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              width: 400, maxHeight: 520, overflowY: "auto",
              background: C.panel, backdropFilter: "blur(20px)",
              border: `1px solid ${C.border}`, borderRadius: 14,
              boxShadow: "0 16px 48px rgba(20,20,19,0.12)",
              zIndex: 999,
            }}>
              {/* Header */}
              <div style={{
                padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 10, fontFamily: mono, color: C.accent, letterSpacing: 1, fontWeight: 400 }}>
                  PROACTIVE INTELLIGENCE
                </span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.dim }}>
                  {alerts.length} bildirim
                </span>
              </div>

              {/* Alert listesi */}
              {alerts.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.dim, fontSize: 11, fontFamily: mono }}>
                  Hen\u00FCz bildirim yok
                </div>
              ) : (
                <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {alerts.map(a => (
                    <div key={a.id} style={{
                      padding: "10px 12px", borderRadius: 10,
                      background: severityBg[a.severity] || severityBg.info,
                      border: `1px solid ${severityBorder[a.severity] || severityBorder.info}`,
                    }}>
                      {/* Ba\u015Fl\u0131k */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ display: "inline-flex", color: severityColor[a.severity] || C.blue }}>
                          <SeverityIcon severity={a.severity} />
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 400, fontFamily: mono,
                          color: severityColor[a.severity] || C.blue,
                        }}>
                          {a.title}
                        </span>
                        <span style={{ fontSize: 8, color: C.dim, fontFamily: mono, marginLeft: "auto" }}>
                          {new Date(a.timestamp).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      {/* Mesaj */}
                      <div style={{ fontSize: 10, color: C.mid, lineHeight: 1.5, marginBottom: a.suggestedAction ? 6 : 0 }}>
                        {a.message}
                      </div>

                      {/* \u00D6nerilen Aksiyon */}
                      {a.suggestedAction && (
                        <div style={{
                          fontSize: 9, fontFamily: mono, fontWeight: 400, padding: "3px 8px", borderRadius: 5,
                          background: CT.accentSoft, color: C.accent, display: "inline-block",
                          border: `1px solid ${CT.accentEdge}`, marginBottom: a.rootCause ? 6 : 0,
                        }}>
                          \u2192 {a.suggestedAction}
                        </div>
                      )}

                      {/* Sebep Zinciri */}
                      {a.rootCause && a.rootCause.length > 0 && (
                        <div style={{
                          marginTop: 4, padding: "5px 8px", borderRadius: 6,
                          background: CT.surfaceMuted, border: `1px solid ${CT.border}`,
                        }}>
                          <div style={{ fontSize: 8, fontFamily: mono, color: C.dim, marginBottom: 3, letterSpacing: 0.5 }}>
                            SEBEP Z\u0130NC\u0130R\u0130
                          </div>
                          {a.rootCause.map((step: any, i: number) => (
                            <div key={i} style={{ fontSize: 9, color: C.mid, lineHeight: 1.5, paddingLeft: 6 }}>
                              {step.order}. {step.cause}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {connected !== undefined && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
            borderRadius: 16, background: connected ? CT.okSoft : CT.errSoft,
            border: `1px solid ${connected ? "rgba(63,143,91,0.28)" : C.errBorder}`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connected ? C.ok : C.err,
            }} />
            <span style={{ fontSize: 9, fontFamily: mono, color: connected ? C.ok : C.err, fontWeight: 400 }}>
              {connected ? "CANLI" : "KOPUK"}
            </span>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .nav-label { display: none; }
          .nav-date { display: none; }
        }
      `}</style>
    </nav>
  );
}
