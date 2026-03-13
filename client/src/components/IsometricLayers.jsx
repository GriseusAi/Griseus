import { useState } from "react";

/* ── Fonts ── */
const sans = "'Outfit', sans-serif";
const mono = "'JetBrains Mono', monospace";

/* ── Layer definitions ── */
const LAYERS = [
  { id: "ingestion", num: "01", title: "Data Ingestion", subtitle: "Veri toplama katmani", cubes: ["Excel", "ERP", "CSV", "API"] },
  { id: "ontology", num: "02", title: "Griseus Ontology", subtitle: "Baglanti katmani", cubes: ["Worker", "Facility", "Operation", "Schedule"] },
  { id: "intelligence", num: "03", title: "Intelligence Engine", subtitle: "Karar katmani", cubes: ["Simulasyon", "Darbogaz", "Optimizasyon", "Risk"] },
  { id: "applications", num: "04", title: "Applications", subtitle: "Sonuc katmani", cubes: ["Digital Twin", "Efficiency", "Scheduling", "Trust"] },
];

/* ── Iso constants ── */
const CX = 285;
const BASE_Y = 420;
const GAP = 112;
const PW = 202;
const PD = 79;

/* ── Isometric platform (diamond base) ── */
function IsoPlatform({ cx, cy, w, d, opacity }) {
  const hdx = (w * 0.866) / 2;
  const hdy = (w * 0.5) / 2;
  const ddx = (d * 0.866) / 2;
  const ddy = (d * 0.5) / 2;
  const points = `${cx},${cy - hdy - ddy} ${cx + hdx + ddx},${cy} ${cx},${cy + hdy + ddy} ${cx - hdx - ddx},${cy}`;
  return (
    <polygon
      points={points}
      fill="rgba(255,255,255,0.06)"
      opacity={opacity > 0.1 ? 1 : opacity / 0.06}
      stroke="rgba(255,255,255,0.5)"
      strokeWidth={1}
      style={{ transition: "opacity 0.3s" }}
    />
  );
}

/* ── Isometric cube (3 visible faces + vertical edges) ── */
function IsoCube({ cx, cy, size, label, delay, active }) {
  const dx = size * 0.866;
  const dy = size * 0.5;
  const top = `${cx},${cy - dy} ${cx + dx / 2},${cy - dy - dy / 2} ${cx},${cy - dy - dy} ${cx - dx / 2},${cy - dy - dy / 2}`;
  const left = `${cx - dx / 2},${cy - dy - dy / 2} ${cx},${cy - dy} ${cx},${cy} ${cx - dx / 2},${cy - dy / 2}`;
  const right = `${cx},${cy - dy} ${cx + dx / 2},${cy - dy - dy / 2} ${cx + dx / 2},${cy - dy / 2} ${cx},${cy}`;
  return (
    <g style={{ opacity: 0, animation: `isoFadeIn 0.5s ease ${delay}s forwards` }}>
      <polygon points={right} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.18)" strokeWidth={0.5} />
      <polygon points={left} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.18)" strokeWidth={0.5} />
      <polygon points={top} fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.45)" strokeWidth={0.5} />
      {/* Vertical edges */}
      <line x1={cx} y1={cy - dy} x2={cx} y2={cy} stroke="rgba(255,255,255,0.25)" strokeWidth={0.5} />
      <line x1={cx - dx / 2} y1={cy - dy - dy / 2} x2={cx - dx / 2} y2={cy - dy / 2} stroke="rgba(255,255,255,0.25)" strokeWidth={0.5} />
      <line x1={cx + dx / 2} y1={cy - dy - dy / 2} x2={cx + dx / 2} y2={cy - dy / 2} stroke="rgba(255,255,255,0.25)" strokeWidth={0.5} />
      {active && (
        <text
          x={cx}
          y={cy - dy - dy - 8}
          textAnchor="middle"
          fill="rgba(255,255,255,0.55)"
          fontSize={8}
          fontFamily={mono}
          fontWeight={500}
          style={{ opacity: 0, animation: "isoFadeIn 0.3s ease 0.1s forwards" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/* ── CSS keyframes (injected once) ── */
const KEYFRAMES = `
@keyframes isoFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes isoDash {
  to { stroke-dashoffset: -12; }
}
@keyframes isoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes isoScan {
  0% { top: 0; }
  100% { top: 100%; }
}
`;

/**
 * IsometricLayers — monochrome 4-layer isometric architecture diagram.
 *
 * Props:
 *   activeLayer  — currently selected layer id (string | null)
 *   onLayerClick — callback(layerId) when a layer is clicked
 *   className    — optional wrapper className
 *   style        — optional wrapper inline style
 */
export default function IsometricLayers({
  activeLayer: controlledActive,
  onLayerClick,
  className = "",
  style = {},
}) {
  const [internalActive, setInternalActive] = useState(null);
  const [hoveredLayer, setHoveredLayer] = useState(null);

  const activeLayer = controlledActive !== undefined ? controlledActive : internalActive;

  const handleClick = (id) => {
    if (onLayerClick) {
      onLayerClick(id);
    } else {
      setInternalActive((prev) => (prev === id ? null : id));
    }
  };

  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "#08080c",
        ...style,
      }}
    >
      {/* Inject keyframes */}
      <style>{KEYFRAMES}</style>

      {/* Scan line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
          animation: "isoScan 7s linear infinite",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      <svg viewBox="0 0 585 510" style={{ width: "100%", maxHeight: "calc(100vh - 80px)", display: "block" }}>
        {/* Connection lines between layers */}
        {[0, 1, 2].map((i) => {
          const y1 = BASE_Y - i * GAP;
          const y2 = BASE_Y - (i + 1) * GAP;
          return (
            <g key={`conn-${i}`}>
              <line
                x1={CX} y1={y1 - 18} x2={CX} y2={y2 + 18}
                stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3 3"
                style={{ animation: "isoDash 1.5s linear infinite" }}
              />
              <circle cx={CX} cy={y1 - 18} r={2.5} fill="rgba(255,255,255,0.4)">
                <animate attributeName="cy" values={`${y1 - 18};${y2 + 18}`} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {/* Layers */}
        {LAYERS.map((layer, i) => {
          const cy = BASE_Y - i * GAP;
          const isActive = activeLayer === layer.id;
          const isHovered = hoveredLayer === layer.id;
          const anyActive = activeLayer !== null;
          const platOpacity = isActive ? 0.22 : isHovered ? 0.13 : anyActive ? 0.03 : 0.06;
          const groupOpacity = anyActive && !isActive ? 0.4 : 1;
          const cubeSpacing = 56;
          const cubeStartX = CX - ((layer.cubes.length - 1) * cubeSpacing) / 2;

          return (
            <g
              key={layer.id}
              style={{ cursor: "pointer", opacity: groupOpacity, transition: "opacity 0.3s" }}
              onClick={() => handleClick(layer.id)}
              onMouseEnter={() => setHoveredLayer(layer.id)}
              onMouseLeave={() => setHoveredLayer(null)}
            >
              <IsoPlatform cx={CX} cy={cy} w={PW} d={PD} opacity={platOpacity} />
              {(isActive || isHovered) && (
                <ellipse
                  cx={CX} cy={cy} rx={PW * 0.5} ry={PD * 0.35}
                  fill="rgba(255,255,255,0.08)" opacity={isActive ? 0.6 : 0.3}
                  style={{ filter: "blur(20px)", pointerEvents: "none" }}
                />
              )}
              {layer.cubes.map((cube, ci) => (
                <IsoCube
                  key={cube}
                  cx={cubeStartX + ci * cubeSpacing}
                  cy={cy - 8}
                  size={22}
                  label={cube}
                  delay={0.3 + i * 0.15 + ci * 0.08}
                  active={isActive || isHovered}
                />
              ))}
              <text
                x={CX - PW * 0.55} y={cy + 5} textAnchor="end"
                fill="rgba(255,255,255,0.8)" fontSize={18} fontFamily={mono} fontWeight={700}
                opacity={isActive ? 1 : 0.35} style={{ transition: "all 0.3s" }}
              >
                {layer.num}
              </text>
              <g>
                {isActive && (
                  <line
                    x1={CX + PW * 0.55 + 8} y1={cy - 12} x2={CX + PW * 0.55 + 8} y2={cy + 12}
                    stroke="rgba(255,255,255,0.5)" strokeWidth={2} strokeLinecap="round" opacity={0.8}
                  />
                )}
                <text
                  x={CX + PW * 0.55 + (isActive ? 18 : 12)} y={cy - 3}
                  fill={isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)"}
                  fontSize={12} fontFamily={sans} fontWeight={600}
                  style={{ transition: "fill 0.3s" }}
                >
                  {layer.title}
                </text>
                <text
                  x={CX + PW * 0.55 + (isActive ? 18 : 12)} y={cy + 10}
                  fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily={sans}
                >
                  {layer.subtitle}
                </text>
              </g>
            </g>
          );
        })}

        {/* Core diamond */}
        <g style={{ animation: "isoFloat 3s ease-in-out infinite" }}>
          <polygon
            points={`${CX},${BASE_Y - 2 * GAP - 26} ${CX + 8},${BASE_Y - 2 * GAP - 18} ${CX},${BASE_Y - 2 * GAP - 10} ${CX - 8},${BASE_Y - 2 * GAP - 18}`}
            fill="rgba(255,255,255,0.15)" opacity={0.6} stroke="rgba(255,255,255,0.5)" strokeWidth={0.5}
          />
        </g>
      </svg>
    </div>
  );
}
