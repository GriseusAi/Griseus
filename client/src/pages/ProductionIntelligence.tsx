import { useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCTION INTELLIGENCE — Overview + Kasa Uretim Drill-Down
   ═══════════════════════════════════════════════════════════════════════ */

const GREEN = "#10B981";
const BG_DARK = "#0F172A";
const CARD_BG = "#1A1A2E";
const AMBER = "#F59E0B";

/* ────────────── ISOMETRIC CUBE (SVG) ────────────── */

function IsometricCube({
  x,
  y,
  size,
  label,
  sublabel,
  color,
  delay = 0,
  onClick,
}: {
  x: number;
  y: number;
  size: number;
  label: string;
  sublabel: string;
  color: string;
  delay?: number;
  onClick?: () => void;
}) {
  const h = size * 0.6;
  const topFace = `${x},${y - h} ${x + size},${y - h + size * 0.3} ${x},${y - h + size * 0.6} ${x - size},${y - h + size * 0.3}`;
  const leftFace = `${x - size},${y - h + size * 0.3} ${x},${y - h + size * 0.6} ${x},${y + size * 0.6 - h + h} ${x - size},${y + size * 0.3}`;
  const rightFace = `${x + size},${y - h + size * 0.3} ${x},${y - h + size * 0.6} ${x},${y + size * 0.6 - h + h} ${x + size},${y + size * 0.3}`;

  return (
    <g
      style={{
        cursor: onClick ? "pointer" : "default",
        opacity: 0,
        animation: `cubeIn 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s forwards`,
      }}
      onClick={onClick}
    >
      {/* Glow */}
      <ellipse cx={x} cy={y + size * 0.35} rx={size * 0.8} ry={size * 0.2} fill={color} opacity="0.06">
        <animate attributeName="opacity" values="0.04;0.08;0.04" dur="4s" repeatCount="indefinite" />
      </ellipse>
      {/* Left face */}
      <polygon points={leftFace} fill={color} opacity="0.15" stroke={color} strokeWidth="0.5" strokeOpacity="0.3" />
      {/* Right face */}
      <polygon points={rightFace} fill={color} opacity="0.1" stroke={color} strokeWidth="0.5" strokeOpacity="0.3" />
      {/* Top face */}
      <polygon points={topFace} fill={color} opacity="0.25" stroke={color} strokeWidth="1" strokeOpacity="0.5">
        <animate attributeName="opacity" values="0.2;0.3;0.2" dur="5s" repeatCount="indefinite" />
      </polygon>
      {/* Grid lines on top face */}
      {[0.25, 0.5, 0.75].map((t, i) => {
        const lx1 = x - size + size * t;
        const ly1 = y - h + size * 0.3 - size * 0.3 * t;
        const lx2 = x + size * t;
        const ly2 = y - h + size * 0.6 - size * 0.3 * t;
        return (
          <line key={i} x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={color} strokeOpacity="0.1" strokeWidth="0.5" />
        );
      })}
      {/* Label */}
      <text x={x} y={y + size * 0.55} textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="'Inter', sans-serif">
        {label}
      </text>
      <text x={x} y={y + size * 0.55 + 14} textAnchor="middle" fill="white" fontSize="9" opacity="0.5" fontFamily="'JetBrains Mono', monospace">
        {sublabel}
      </text>
    </g>
  );
}

/* ────────────── OVERVIEW SCREEN (3 CUBES) ────────────── */

function OverviewScreen({ onKasaClick }: { onKasaClick: () => void }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: BG_DARK,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle grid bg */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)`,
          backgroundSize: "40px 40px",
          pointerEvents: "none",
        }}
      />

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 48, position: "relative", zIndex: 1 }}>
        <h1
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 28,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          PRODUCTION INTELLIGENCE
        </h1>
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            marginTop: 8,
            letterSpacing: "0.08em",
          }}
        >
          URETIM KATMAN MODELI -- 3 BIRIM
        </p>
      </div>

      {/* Cubes */}
      <svg viewBox="0 0 700 320" style={{ width: "100%", maxWidth: 700, position: "relative", zIndex: 1 }}>
        <style>{`
          @keyframes cubeIn {
            from { opacity: 0; transform: translateY(20px) scale(0.9); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Connecting lines */}
        <line x1="175" y1="180" x2="350" y2="160" stroke={GREEN} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4 4">
          <animate attributeName="strokeDashoffset" from="0" to="-16" dur="3s" repeatCount="indefinite" />
        </line>
        <line x1="350" y1="160" x2="525" y2="180" stroke={GREEN} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4 4">
          <animate attributeName="strokeDashoffset" from="0" to="-16" dur="3s" repeatCount="indefinite" />
        </line>

        <IsometricCube x={175} y={200} size={70} label="Kasa Uretim" sublabel="4 model" color={GREEN} delay={0.1} onClick={onKasaClick} />
        <IsometricCube x={350} y={180} size={70} label="Montaj Hatti" sublabel="3 hat" color="#3B82F6" delay={0.3} />
        <IsometricCube x={525} y={200} size={70} label="Kalite Kontrol" sublabel="2 istasyon" color="#8B5CF6" delay={0.5} />
      </svg>

      {/* Hint */}
      <p
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: "rgba(255,255,255,0.25)",
          marginTop: 40,
          position: "relative",
          zIndex: 1,
        }}
      >
        bir birime tiklayin
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DRILL-DOWN: KASA URETIM ONTOLOJI
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Card Data ── */

interface KasaCard {
  id: string;
  name: string;
  status: "AKTIF" | "PLANLAMA";
  urunTipi: string;
  malzeme: string;
  boyut: string;
  hedef: string;
  agirlik: string;
  hat: string;
}

const KASA_CARDS: KasaCard[] = [
  {
    id: "KASA-001",
    name: "Goldsun Elite",
    status: "AKTIF",
    urunTipi: "Premium Konut",
    malzeme: "Galvaniz \u00C7elik",
    boyut: "820\u00D7420\u00D7210 mm",
    hedef: "25 adet/g\u00FCn",
    agirlik: "4.2 kg/kasa",
    hat: "Hat 1 \u2014 Kombi Kasa",
  },
  {
    id: "KASA-002",
    name: "S\u0131cak Hava \u00DCreticisi",
    status: "AKTIF",
    urunTipi: "End\u00FCstriyel",
    malzeme: "Al\u00FCminyum Pro",
    boyut: "1200\u00D7600\u00D7320 mm",
    hedef: "18 adet/g\u00FCn",
    agirlik: "8.7 kg/kasa",
    hat: "Hat 2 \u2014 E\u015Fanj\u00F6r Kasa",
  },
  {
    id: "KASA-003",
    name: "Radyant Is\u0131t\u0131c\u0131",
    status: "AKTIF",
    urunTipi: "Seramik Panel",
    malzeme: "\u00C7elik + Seramik",
    boyut: "640\u00D7420\u00D790 mm",
    hedef: "30 adet/g\u00FCn",
    agirlik: "3.1 kg/kasa",
    hat: "Hat 1 \u2014 Kombi Kasa",
  },
  {
    id: "KASA-004",
    name: "Elektrikli Is\u0131t\u0131c\u0131",
    status: "PLANLAMA",
    urunTipi: "Kompakt Elektrik",
    malzeme: "Galvaniz \u00C7elik",
    boyut: "420\u00D7310\u00D7160 mm",
    hedef: "25 adet/g\u00FCn",
    agirlik: "2.8 kg/kasa",
    hat: "Hat 3 \u2014 Planlan\u0131yor",
  },
];

const ACTION_BUTTONS = [
  { label: "\u00DCRET\u0130M PLANI OLU\u015ETUR", sub: "hat atama \u00B7 kapasite \u00B7 takvim" },
  { label: "MALZEME S\u0130PAR\u0130\u015E ET", sub: "galvaniz \u00B7 al\u00FCminyum \u00B7 sa\u00E7aya\u011F\u0131" },
  { label: "KAL\u0130TE KONTROL BA\u015ELAT", sub: "\u00F6l\u00E7\u00FC do\u011Frulama \u00B7 y\u00FCzey kalitesi" },
  { label: "MONTAJA SEVK ET", sub: "4 hat \u00B7 montaj fabrikas\u0131na ak\u0131\u015F" },
];

const DATA_SOURCES = [
  {
    name: "Sipari\u015F Sistemi",
    sub: "m\u00FC\u015Fteri talepleri",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.5">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    ),
  },
  {
    name: "Hammadde Deposu",
    sub: "\u00E7elik \u00B7 stok",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.5">
        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    name: "Hat Kapasitesi",
    sub: "hat 1\u00B72\u00B73 durum",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.5">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 4 6-6" />
      </svg>
    ),
  },
  {
    name: "\u00C7al\u0131\u015Fma Takvimi",
    sub: "vardiya \u00B7 izin",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </svg>
    ),
  },
];

/* ── Animated SVG Connector Overlay ── */

function ConnectorOverlay() {
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <defs>
        <marker id="fxDot" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="6" markerHeight="6">
          <circle cx="3" cy="3" r="2" fill={GREEN} opacity="0.3" />
        </marker>
      </defs>
      {/* Data sources to cards region */}
      {[15, 35, 60, 82].map((xPct, i) => (
        <g key={`up-${i}`}>
          <line
            x1={`${xPct}%`}
            y1="92%"
            x2={`${12 + i * 22}%`}
            y2="60%"
            stroke={GREEN}
            strokeOpacity="0.12"
            strokeWidth="1"
            strokeDasharray="6 4"
          >
            <animate attributeName="strokeDashoffset" from="0" to="-20" dur="4s" repeatCount="indefinite" />
          </line>
          {/* fx label */}
          <rect x={`${(xPct + 12 + i * 22) / 2 - 1}%`} y="76%" width="24" height="12" rx="2" fill={CARD_BG} stroke={GREEN} strokeOpacity="0.2" strokeWidth="0.5" />
          <text x={`${(xPct + 12 + i * 22) / 2 + 0.5}%`} y="76.8%" dy="9" textAnchor="middle" fill={GREEN} fontSize="7" opacity="0.4" fontFamily="'JetBrains Mono', monospace">
            fx
          </text>
        </g>
      ))}
      {/* Cards to action buttons */}
      {[12, 34, 56, 78].map((xPct, i) => (
        <g key={`down-${i}`}>
          <line
            x1={`${xPct + 5}%`}
            y1="38%"
            x2={`${12 + i * 22}%`}
            y2="20%"
            stroke={GREEN}
            strokeOpacity="0.12"
            strokeWidth="1"
            strokeDasharray="6 4"
          >
            <animate attributeName="strokeDashoffset" from="0" to="-20" dur="4s" repeatCount="indefinite" />
          </line>
          <rect x={`${(xPct + 5 + 12 + i * 22) / 2 - 1}%`} y="28%" width="24" height="12" rx="2" fill={CARD_BG} stroke={GREEN} strokeOpacity="0.2" strokeWidth="0.5" />
          <text x={`${(xPct + 5 + 12 + i * 22) / 2 + 0.5}%`} y="28.8%" dy="9" textAnchor="middle" fill={GREEN} fontSize="7" opacity="0.4" fontFamily="'JetBrains Mono', monospace">
            fx
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── Kasa Product Card ── */

function KasaProductCard({ card, index }: { card: KasaCard; index: number }) {
  const isActive = card.status === "AKTIF";
  const statusColor = isActive ? GREEN : AMBER;
  const hedefColor = isActive ? GREEN : AMBER;
  const hatColor = card.id === "KASA-004" ? AMBER : "rgba(255,255,255,0.5)";

  const properties = [
    { key: "\u00DCR\u00DCN T\u0130P\u0130", value: card.urunTipi },
    { key: "MALZEME", value: card.malzeme },
    { key: "BOYUT", value: card.boyut },
    { key: "HEDEF", value: card.hedef, color: hedefColor },
    { key: "A\u011EIRLIK", value: card.agirlik },
  ];

  return (
    <div
      style={{
        background: CARD_BG,
        border: "1.5px solid rgba(16,185,129,0.2)",
        borderRadius: 8,
        padding: 18,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        opacity: 0,
        animation: `cardSlideUp 0.6s cubic-bezier(0.16,1,0.3,1) ${0.15 + index * 0.1}s forwards`,
        transition: "all 0.2s ease",
        display: "flex",
        flexDirection: "column" as const,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.borderColor = GREEN;
        e.currentTarget.style.boxShadow = "0 0 24px rgba(16,185,129,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "rgba(16,185,129,0.2)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Top green accent line */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: GREEN, opacity: 0.6 }} />

      {/* Circuit grid background pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(16,185,129,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16,185,129,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
          pointerEvents: "none",
        }}
      />

      {/* ID Tag */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: "rgba(16,185,129,0.4)",
          marginBottom: 10,
          position: "relative",
        }}
      >
        {card.id}
      </div>

      {/* Name */}
      <div
        style={{
          fontFamily: "Syne, sans-serif",
          fontSize: 18,
          fontWeight: 800,
          color: "white",
          lineHeight: 1.15,
          marginBottom: 14,
          position: "relative",
        }}
      >
        {card.name}
      </div>

      {/* Status pill */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 4,
          background: isActive ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
          border: `1px solid ${isActive ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
          marginBottom: 14,
          position: "relative",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: statusColor,
            animation: isActive ? "pulse 2s ease-in-out infinite" : "none",
          }}
        />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            color: statusColor,
            letterSpacing: "0.05em",
          }}
        >
          {card.status}
        </span>
      </div>

      {/* Properties */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, position: "relative" }}>
        {properties.map((p) => (
          <div key={p.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: "0.04em",
              }}
            >
              {p.key}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 600,
                color: p.color || "white",
              }}
            >
              {p.value}
            </span>
          </div>
        ))}
      </div>

      {/* Footer hat */}
      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid rgba(16,185,129,0.1)",
          paddingTop: 12,
          position: "relative",
        }}
      >
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 3 }}>
          HAT
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: hatColor,
            fontWeight: 600,
          }}
        >
          {card.hat}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════ */

export default function ProductionIntelligence() {
  const [activeView, setActiveView] = useState<"overview" | "kasa">("overview");

  return (
    <div style={{ width: "100%", height: "100vh", overflow: "hidden", position: "relative" }}>
      <style>{`
        @keyframes cubeIn {
          from { opacity: 0; transform: translateY(20px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cardSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* OVERVIEW LAYER */}
      <div
        style={{
          opacity: activeView === "overview" ? 1 : 0,
          transform: activeView === "overview" ? "scale(1)" : "scale(0.96)",
          transition: "all 0.6s cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: activeView === "overview" ? "auto" : "none",
          position: "absolute",
          inset: 0,
        }}
      >
        <OverviewScreen onKasaClick={() => setActiveView("kasa")} />
      </div>

      {/* KASA DRILL-DOWN LAYER */}
      <div
        style={{
          opacity: activeView === "kasa" ? 1 : 0,
          transform: activeView === "kasa" ? "scale(1)" : "scale(1.04)",
          transition: "all 0.6s cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: activeView === "kasa" ? "auto" : "none",
          position: "absolute",
          inset: 0,
          background: BG_DARK,
          display: "flex",
          flexDirection: "column" as const,
        }}
      >
        {/* ZONE 1: NAV BAR */}
        <div
          style={{
            height: 54,
            flexShrink: 0,
            background: BG_DARK,
            borderBottom: "1px solid rgba(16,185,129,0.2)",
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            gap: 0,
          }}
        >
          <button
            onClick={() => setActiveView("overview")}
            style={{
              background: "none",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: 4,
              color: "rgba(16,185,129,0.7)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              padding: "5px 12px",
              cursor: "pointer",
              marginRight: 24,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = GREEN;
              e.currentTarget.style.color = GREEN;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(16,185,129,0.3)";
              e.currentTarget.style.color = "rgba(16,185,129,0.7)";
            }}
          >
            &#8592; GER\u0130
          </button>
          <span style={{ fontFamily: "Syne, sans-serif", fontSize: 16, fontWeight: 800, color: GREEN, letterSpacing: "0.04em" }}>
            KASA \u00DCRET\u0130M
          </span>
          <span style={{ fontSize: 10, color: "rgba(16,185,129,0.4)", marginLeft: 12, letterSpacing: "0.06em" }}>
            / \u00DCRUN ONTOLOJ\u0130S\u0130 / 4 MODEL
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: GREEN, fontWeight: 700, letterSpacing: "0.1em" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN, boxShadow: `0 0 8px ${GREEN}`, animation: "pulse 1s infinite" }} />
            CANLI &middot; YAPIM A\u015EAMASI
          </div>
        </div>

        {/* ZONE 2: ACTION ROW */}
        <div
          style={{
            height: 96,
            flexShrink: 0,
            borderBottom: "1px dashed rgba(16,185,129,0.18)",
            display: "flex",
            alignItems: "center",
            padding: "0 72px",
            gap: 14,
          }}
        >
          {ACTION_BUTTONS.map((btn, i) => (
            <button
              key={i}
              style={{
                flex: 1,
                background: "rgba(16,185,129,0.08)",
                border: "1.5px solid rgba(16,185,129,0.35)",
                borderRadius: 6,
                padding: "10px 16px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(16,185,129,0.15)";
                e.currentTarget.style.borderColor = GREEN;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(16,185,129,0.08)";
                e.currentTarget.style.borderColor = "rgba(16,185,129,0.35)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace" }}>
                {btn.label}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {btn.sub}
              </div>
            </button>
          ))}
        </div>

        {/* ZONE 3: 4 KASA CARDS */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <ConnectorOverlay />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 14,
              padding: "20px 60px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {KASA_CARDS.map((card, i) => (
              <KasaProductCard key={card.id} card={card} index={i} />
            ))}
          </div>
        </div>

        {/* ZONE 4: DATA SOURCES BAR */}
        <div
          style={{
            height: 80,
            flexShrink: 0,
            borderTop: "1px solid rgba(16,185,129,0.12)",
            display: "flex",
            alignItems: "center",
            padding: "0 72px",
            gap: 14,
          }}
        >
          {DATA_SOURCES.map((src, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "rgba(16,185,129,0.04)",
                border: "1px solid rgba(16,185,129,0.12)",
                borderRadius: 5,
                padding: "8px 14px",
              }}
            >
              <div style={{ opacity: 0.5, flexShrink: 0 }}>{src.icon}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
                  {src.name}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                  {src.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
