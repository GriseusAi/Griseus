/* ═══════════════════════════════════════════════════════════════════════
   PRODUCTION INTELLIGENCE — Overview (Isometric Factory Visualization)
   ═══════════════════════════════════════════════════════════════════════ */

const GREEN = "#10B981";
const BG_DARK = "#0F172A";

/* ────────────── ISOMETRIC CUBE (SVG) ────────────── */

function IsometricCube({
  x,
  y,
  size,
  label,
  sublabel,
  color,
  delay = 0,
}: {
  x: number;
  y: number;
  size: number;
  label: string;
  sublabel: string;
  color: string;
  delay?: number;
}) {
  const h = size * 0.6;
  const topFace = `${x},${y - h} ${x + size},${y - h + size * 0.3} ${x},${y - h + size * 0.6} ${x - size},${y - h + size * 0.3}`;
  const leftFace = `${x - size},${y - h + size * 0.3} ${x},${y - h + size * 0.6} ${x},${y + size * 0.6 - h + h} ${x - size},${y + size * 0.3}`;
  const rightFace = `${x + size},${y - h + size * 0.3} ${x},${y - h + size * 0.6} ${x},${y + size * 0.6 - h + h} ${x + size},${y + size * 0.3}`;

  return (
    <g
      style={{
        cursor: "default",
        pointerEvents: "all",
        opacity: 0,
        animation: `cubeIn 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s forwards`,
      }}
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

/* ════════════════════════════════════════════════════════════════════════
   MAIN EXPORT — Overview Screen
   ════════════════════════════════════════════════════════════════════════ */

export default function ProductionIntelligence() {
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
      <style>{`
        @keyframes cubeIn {
          from { opacity: 0; transform: translateY(20px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

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
        {/* Connecting lines */}
        <line x1="175" y1="180" x2="350" y2="160" stroke={GREEN} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4 4">
          <animate attributeName="strokeDashoffset" from="0" to="-16" dur="3s" repeatCount="indefinite" />
        </line>
        <line x1="350" y1="160" x2="525" y2="180" stroke={GREEN} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4 4">
          <animate attributeName="strokeDashoffset" from="0" to="-16" dur="3s" repeatCount="indefinite" />
        </line>

        <IsometricCube x={175} y={200} size={70} label="Kasa Uretim" sublabel="4 model" color={GREEN} delay={0.1} />
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
