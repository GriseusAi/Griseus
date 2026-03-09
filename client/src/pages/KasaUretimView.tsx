import { useState } from "react";
import { useLocation } from "wouter";

/* ═══════════════════════════════════════════════════════════════════════
   KASA URETIM VIEW — Isometric drill-down for steel case production lines
   ═══════════════════════════════════════════════════════════════════════ */

const BG = "#060a13";
const CARD_BG = "#0a0f1a";
const CARD_BORDER = "#141c2e";
const PANEL_BORDER = "#111827";
const GRID_STROKE = "#0f172a";
const MUTED = "#64748b";
const DASH_COLOR = "#1e293b";

interface LineData {
  id: string;
  name: string;
  color: string;
  accent: string;
  status: "active" | "idle";
  efficiency: number;
  dailyOutput: number;
  operators: number;
  description: string;
  cx: number;
  cy: number;
}

const LINES: LineData[] = [
  {
    id: "goldsun",
    name: "Goldsun Elite",
    color: "#F59E0B",
    accent: "#FCD34D",
    status: "active",
    efficiency: 87,
    dailyOutput: 42,
    operators: 4,
    description: "Premium konut tipi kombi kasalar\u0131 \u00FCretim hatt\u0131.",
    cx: 210,
    cy: 100,
  },
  {
    id: "radyant",
    name: "Radyant Is\u0131t\u0131c\u0131lar",
    color: "#EF4444",
    accent: "#FCA5A5",
    status: "active",
    efficiency: 74,
    dailyOutput: 36,
    operators: 3,
    description: "Seramik panel radyant \u0131s\u0131t\u0131c\u0131 kasa \u00FCretimi.",
    cx: 460,
    cy: 100,
  },
  {
    id: "elektrikli",
    name: "Elektrikli Is\u0131t\u0131c\u0131lar",
    color: "#3B82F6",
    accent: "#93C5FD",
    status: "active",
    efficiency: 91,
    dailyOutput: 58,
    operators: 3,
    description: "Kompakt elektrikli \u0131s\u0131t\u0131c\u0131 kasa \u00FCretimi.",
    cx: 210,
    cy: 310,
  },
  {
    id: "sicakhava",
    name: "S\u0131cak Hava \u00DCreteçleri",
    color: "#10B981",
    accent: "#6EE7B7",
    status: "idle",
    efficiency: 62,
    dailyOutput: 18,
    operators: 2,
    description: "End\u00FCstriyel s\u0131cak hava \u00FCreteci kasa hatt\u0131.",
    cx: 460,
    cy: 310,
  },
];

/* ────────────── ISOMETRIC CUBE (SVG) ────────────── */

function Cube({
  cx,
  cy,
  size,
  color,
  accent,
  name,
  efficiency,
  status,
  isSelected,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
  delay,
}: {
  cx: number;
  cy: number;
  size: number;
  color: string;
  accent: string;
  name: string;
  efficiency: number;
  status: "active" | "idle";
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
  delay: number;
}) {
  const s = isHovered || isSelected ? 78 : size;
  const h = s * 0.6;

  const topFace = `${cx},${cy - h} ${cx + s},${cy - h + s * 0.3} ${cx},${cy - h + s * 0.6} ${cx - s},${cy - h + s * 0.3}`;
  const leftFace = `${cx - s},${cy - h + s * 0.3} ${cx},${cy - h + s * 0.6} ${cx},${cy + s * 0.6 - h + h} ${cx - s},${cy + s * 0.3}`;
  const rightFace = `${cx + s},${cy - h + s * 0.3} ${cx},${cy - h + s * 0.6} ${cx},${cy + s * 0.6 - h + h} ${cx + s},${cy + s * 0.3}`;

  const filterId = `glow-${cx}-${cy}`;

  // Mini product cubes
  const minis = [0, 1, 2, 3].map((i) => ({
    mx: cx - 24 + i * 16,
    my: cy + s * 0.38 + 18,
    delay: delay + 0.3 + i * 0.08,
  }));

  return (
    <g
      style={{
        cursor: "pointer",
        pointerEvents: "all",
        opacity: 0,
        animation: `cubeIn 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s forwards`,
        transition: "transform 0.25s ease",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={isSelected || isHovered ? 10 : 0} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow ellipse */}
      {(isSelected || isHovered) && (
        <ellipse
          cx={cx}
          cy={cy + s * 0.35}
          rx={s * 1.1}
          ry={s * 0.3}
          fill={color}
          opacity="0.08"
        />
      )}

      {/* Left face */}
      <polygon
        points={leftFace}
        fill={color}
        opacity="0.38"
        stroke={color}
        strokeWidth="1.2"
        strokeOpacity="0.5"
        style={{ transition: "all 0.25s ease" }}
      />
      {/* Right face */}
      <polygon
        points={rightFace}
        fill={accent}
        opacity="0.18"
        stroke={accent}
        strokeWidth="1.2"
        strokeOpacity="0.4"
        style={{ transition: "all 0.25s ease" }}
      />
      {/* Top face */}
      <polygon
        points={topFace}
        fill={color}
        opacity="0.22"
        stroke={color}
        strokeWidth="1.2"
        strokeOpacity="0.6"
        style={{ transition: "all 0.25s ease" }}
        filter={isSelected || isHovered ? `url(#${filterId})` : undefined}
      />

      {/* Status LED on top */}
      <circle
        cx={cx}
        cy={cy - h - 6}
        r={4}
        fill={status === "active" ? color : "#475569"}
        style={{
          filter: status === "active" ? `drop-shadow(0 0 4px ${color})` : "none",
        }}
      >
        {status === "active" && (
          <animate
            attributeName="opacity"
            values="0.5;1;0.5"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Mini product cubes */}
      {minis.map((m, i) => (
        <g
          key={i}
          style={{
            opacity: 0,
            animation: `fadeIn 0.5s cubic-bezier(0.16,1,0.3,1) ${m.delay}s forwards`,
          }}
        >
          <rect
            x={m.mx - 5}
            y={m.my - 5}
            width={10}
            height={10}
            rx={1.5}
            fill={color}
            opacity="0.2"
            stroke={color}
            strokeWidth="0.5"
            strokeOpacity="0.3"
          />
        </g>
      ))}

      {/* Name label */}
      <text
        x={cx}
        y={cy + s * 0.38 + 46}
        textAnchor="middle"
        fill={isHovered || isSelected ? color : "white"}
        fontSize="13"
        fontWeight="700"
        fontFamily="'Inter', sans-serif"
        style={{ transition: "fill 0.25s ease" }}
      >
        {name}
      </text>

      {/* Efficiency label */}
      <text
        x={cx}
        y={cy + s * 0.38 + 62}
        textAnchor="middle"
        fill={MUTED}
        fontSize="10"
        fontFamily="monospace"
      >
        Verimlilik: {efficiency}%
      </text>
    </g>
  );
}

/* ────────────── RIGHT PANEL CARD ────────────── */

function LineCard({
  line,
  isSelected,
  onClick,
  delay,
}: {
  line: LineData;
  isSelected: boolean;
  onClick: () => void;
  delay: number;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? `${line.color}08` : CARD_BG,
        border: `1px solid ${isSelected ? `${line.color}44` : CARD_BORDER}`,
        borderRadius: 8,
        padding: "12px 14px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        opacity: 0,
        animation: `fadeIn 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}s forwards`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: line.status === "active" ? line.color : "#475569",
            boxShadow: line.status === "active" ? `0 0 6px ${line.color}` : "none",
            animation: line.status === "active" ? "pulse 2s infinite" : "none",
          }}
        />
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            color: isSelected ? line.color : "white",
            transition: "color 0.2s",
          }}
        >
          {line.name}
        </span>
      </div>

      {/* Efficiency bar */}
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: DASH_COLOR,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: `${line.efficiency}%`,
            height: "100%",
            borderRadius: 3,
            background: `linear-gradient(90deg, ${line.color}88, ${line.color})`,
            transition: "width 0.6s ease",
          }}
        />
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, fontSize: 10, fontFamily: "monospace", color: MUTED }}>
        <span>{line.dailyOutput} adet/g\u00FCn</span>
        <span>{line.operators} operat\u00F6r</span>
      </div>

      {/* Expanded detail */}
      {isSelected && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${line.color}22`,
          }}
        >
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, marginBottom: 6 }}>
            {line.description}
          </div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: line.color, fontWeight: 600 }}>
            Hedef verimlilik: 95%
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ════════════════════════════════════════════════════════════════════════ */

export default function KasaUretimView() {
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const totalOutput = LINES.reduce((s, l) => s + l.dailyOutput, 0);
  const avgEfficiency = Math.round(LINES.reduce((s, l) => s + l.efficiency, 0) / LINES.length);
  const totalOperators = LINES.reduce((s, l) => s + l.operators, 0);

  const toggle = (id: string) => setSelected((prev) => (prev === id ? null : id));

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: BG,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <style>{`
        @keyframes cubeIn {
          from { opacity: 0; transform: translateY(16px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* ── HEADER BAR ── */}
      <div
        style={{
          flexShrink: 0,
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderImage: `linear-gradient(90deg, ${PANEL_BORDER}, ${PANEL_BORDER}88, ${PANEL_BORDER}) 1`,
        }}
      >
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <button
            onClick={() => setLocation("/production-intelligence")}
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 5,
              color: "rgba(255,255,255,0.5)",
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 14px",
              cursor: "pointer",
              transition: "all 0.2s",
              marginRight: 16,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "rgba(255,255,255,0.5)";
            }}
          >
            &#8592; Ana Sayfa
          </button>
          <div
            style={{
              width: 1,
              height: 24,
              background: "rgba(255,255,255,0.08)",
              marginRight: 16,
            }}
          />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "white", letterSpacing: "-0.01em" }}>
              KASA \u00DCRET\u0130M
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
              \u00C7elik kasa \u00FCretim hatlar\u0131 \u2014 4 \u00FCr\u00FCn grubu
            </div>
          </div>
        </div>

        {/* Right — summary stats */}
        <div style={{ display: "flex", gap: 28 }}>
          {[
            { label: "G\u00FCnl\u00FCk \u00DCretim", value: `${totalOutput}`, unit: "adet" },
            { label: "Ort. Verimlilik", value: `${avgEfficiency}`, unit: "%" },
            { label: "Operat\u00F6r", value: `${totalOperators}`, unit: "ki\u015Fi" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{stat.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 3 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: "white", fontFamily: "monospace" }}>
                  {stat.value}
                </span>
                <span style={{ fontSize: 10, color: MUTED }}>{stat.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* LEFT — ISOMETRIC DIAGRAM */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <svg
            viewBox="0 0 670 520"
            style={{ width: "100%", maxWidth: 720, overflow: "visible" }}
          >
            {/* Grid floor lines */}
            {Array.from({ length: 14 }, (_, i) => (
              <line
                key={`h-${i}`}
                x1="40"
                y1={40 + i * 34}
                x2="630"
                y2={40 + i * 34}
                stroke={GRID_STROKE}
                strokeWidth="0.5"
              />
            ))}
            {Array.from({ length: 18 }, (_, i) => (
              <line
                key={`v-${i}`}
                x1={40 + i * 35}
                y1="40"
                x2={40 + i * 35}
                y2="490"
                stroke={GRID_STROKE}
                strokeWidth="0.5"
              />
            ))}

            {/* Dashed connection lines between cubes */}
            {/* Top row */}
            <line
              x1={LINES[0].cx}
              y1={LINES[0].cy}
              x2={LINES[1].cx}
              y2={LINES[1].cy}
              stroke={DASH_COLOR}
              strokeWidth="1"
              strokeDasharray="6 4"
            />
            {/* Bottom row */}
            <line
              x1={LINES[2].cx}
              y1={LINES[2].cy}
              x2={LINES[3].cx}
              y2={LINES[3].cy}
              stroke={DASH_COLOR}
              strokeWidth="1"
              strokeDasharray="6 4"
            />
            {/* Left column */}
            <line
              x1={LINES[0].cx}
              y1={LINES[0].cy}
              x2={LINES[2].cx}
              y2={LINES[2].cy}
              stroke={DASH_COLOR}
              strokeWidth="1"
              strokeDasharray="6 4"
            />
            {/* Right column */}
            <line
              x1={LINES[1].cx}
              y1={LINES[1].cy}
              x2={LINES[3].cx}
              y2={LINES[3].cy}
              stroke={DASH_COLOR}
              strokeWidth="1"
              strokeDasharray="6 4"
            />
            {/* Diagonals */}
            <line
              x1={LINES[0].cx}
              y1={LINES[0].cy}
              x2={LINES[3].cx}
              y2={LINES[3].cy}
              stroke={DASH_COLOR}
              strokeWidth="0.5"
              strokeDasharray="4 6"
              opacity="0.5"
            />
            <line
              x1={LINES[1].cx}
              y1={LINES[1].cy}
              x2={LINES[2].cx}
              y2={LINES[2].cy}
              stroke={DASH_COLOR}
              strokeWidth="0.5"
              strokeDasharray="4 6"
              opacity="0.5"
            />

            {/* Center hub */}
            <circle cx="335" cy="205" r="18" fill="none" stroke={DASH_COLOR} strokeWidth="1" />
            <circle cx="335" cy="205" r="3" fill={MUTED} opacity="0.4" />
            <text
              x="335"
              y="235"
              textAnchor="middle"
              fill={MUTED}
              fontSize="8"
              fontFamily="monospace"
              letterSpacing="0.06em"
            >
              KASA \u00DCRET\u0130M HATLARI
            </text>

            {/* 4 cubes */}
            {LINES.map((line, i) => (
              <Cube
                key={line.id}
                cx={line.cx}
                cy={line.cy}
                size={70}
                color={line.color}
                accent={line.accent}
                name={line.name}
                efficiency={line.efficiency}
                status={line.status}
                isSelected={selected === line.id}
                isHovered={hovered === line.id}
                onMouseEnter={() => setHovered(line.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => toggle(line.id)}
                delay={0.15 + i * 0.15}
              />
            ))}
          </svg>
        </div>

        {/* RIGHT PANEL */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderLeft: `1px solid ${PANEL_BORDER}`,
            display: "flex",
            flexDirection: "column",
            padding: "20px 16px",
            gap: 12,
            overflowY: "auto",
          }}
        >
          {/* Section header */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: MUTED,
              letterSpacing: "0.12em",
              marginBottom: 4,
              fontFamily: "monospace",
            }}
          >
            \u00DCRET\u0130M HATLARI
          </div>

          {/* Line cards */}
          {LINES.map((line, i) => (
            <LineCard
              key={line.id}
              line={line}
              isSelected={selected === line.id}
              onClick={() => toggle(line.id)}
              delay={0.2 + i * 0.1}
            />
          ))}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Summary card */}
          <div
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 8,
              padding: "14px 14px 12px",
              opacity: 0,
              animation: "fadeIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.7s forwards",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: MUTED,
                letterSpacing: "0.1em",
                marginBottom: 10,
                fontFamily: "monospace",
              }}
            >
              \u00D6ZET
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { k: "Toplam \u00DCretim", v: `${totalOutput} adet/g\u00FCn` },
                { k: "Ort. Verimlilik", v: `${avgEfficiency}%` },
                { k: "Aktif Hat", v: `${LINES.filter((l) => l.status === "active").length} / ${LINES.length}` },
                { k: "Operat\u00F6r", v: `${totalOperators} ki\u015Fi` },
              ].map((row) => (
                <div
                  key={row.k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: MUTED }}>{row.k}</span>
                  <span style={{ color: "white", fontWeight: 600, fontFamily: "monospace" }}>
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
