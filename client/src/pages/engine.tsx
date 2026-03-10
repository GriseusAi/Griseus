import { useState, useEffect } from "react";

/* ── Google Fonts ── */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

/* ── Palette ── */
const P = {
  bg: "#08080c",
  green: "#34d399",
  indigo: "#818cf8",
  amber: "#fbbf24",
  pink: "#f472b6",
  white: "#fff",
  sec: "#888",
  mute: "#444",
};

const body = "'Outfit', sans-serif";
const mono = "'JetBrains Mono', monospace";

/* ── Layer definitions ── */
const layers = [
  {
    id: "ingestion",
    num: "01",
    title: "Data Ingestion",
    subtitle: "Veri toplama katmanı",
    color: P.pink,
    cubes: ["Excel", "ERP", "IoT", "API"],
    desc: "Herhangi bir kaynaktan veri girer. Format farketmez, Ontology'ye dönüşür.",
  },
  {
    id: "ontology",
    num: "02",
    title: "Griseus Ontology",
    subtitle: "Bağlantı katmanı",
    color: P.amber,
    cubes: ["Worker", "Facility", "Operation", "Schedule"],
    desc: "Evrensel veri modeli. Çukurova da kullanır, data center müteahhidi de. Aynı dil.",
  },
  {
    id: "intelligence",
    num: "03",
    title: "Intelligence Engine",
    subtitle: "Kararları üreten katman",
    color: P.indigo,
    cubes: ["Simülasyon", "Darboğaz", "Optimizasyon", "Risk Skoru"],
    desc: "Şirketten bağımsız akıl katmanı. Veri kaynağı değişir, mantık aynı kalır.",
  },
  {
    id: "applications",
    num: "04",
    title: "Applications",
    subtitle: "Kullanıcının gördüğü katman",
    color: P.green,
    cubes: ["Digital Twin", "Efficiency Engine", "Scheduling", "Trust Score"],
    desc: "Veriyi aksiyona çeviren arayüzler. Aynı motordan beslenir, farklı problemleri çözer.",
  },
];

/* ── CSS Keyframes ── */
const STYLES = `
@keyframes eng-scan {
  0% { transform: translateY(-100%); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(100%); opacity: 0; }
}
@keyframes eng-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.6); }
}
@keyframes eng-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes eng-dash {
  to { stroke-dashoffset: -20; }
}
@keyframes eng-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

/* ── Isometric Cube (3-face) ── */
function IsoCube({ cx, cy, size, color, label, delay, active }: {
  cx: number; cy: number; size: number; color: string; label: string; delay: number; active: boolean;
}) {
  const s = size;
  const hs = s / 2;
  // Isometric diamond offsets
  const dx = s * 0.866;  // cos(30°) * s
  const dy = s * 0.5;    // sin(30°) * s
  const h = s * 0.6;     // cube height

  // top face (diamond)
  const top = `${cx},${cy - dy} ${cx + dx / 2},${cy - dy - dy / 2} ${cx},${cy - dy - dy} ${cx - dx / 2},${cy - dy - dy / 2}`;
  // left face
  const left = `${cx - dx / 2},${cy - dy - dy / 2} ${cx},${cy - dy} ${cx},${cy} ${cx - dx / 2},${cy - dy / 2}`;
  // right face
  const right = `${cx},${cy - dy} ${cx + dx / 2},${cy - dy - dy / 2} ${cx + dx / 2},${cy - dy / 2} ${cx},${cy}`;

  return (
    <g style={{
      opacity: 0,
      animation: `eng-fade-in 0.5s ease ${delay}s forwards`,
    }}>
      <polygon points={right} fill={color} opacity={0.15} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />
      <polygon points={left} fill={color} opacity={0.25} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />
      <polygon points={top} fill={color} opacity={0.4} stroke={color} strokeWidth={0.5} strokeOpacity={0.5} />
      {active && (
        <text
          x={cx}
          y={cy - dy - dy - 8}
          textAnchor="middle"
          fill={color}
          fontSize={8}
          fontFamily={mono}
          fontWeight={500}
          style={{ opacity: 0, animation: "eng-fade-in 0.3s ease 0.1s forwards" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/* ── Isometric Platform (diamond plate) ── */
function IsoPlatform({ cx, cy, w, d, color, opacity }: {
  cx: number; cy: number; w: number; d: number; color: string; opacity: number;
}) {
  const hdx = w * 0.866 / 2;
  const hdy = w * 0.5 / 2;
  const ddx = d * 0.866 / 2;
  const ddy = d * 0.5 / 2;
  const points = `${cx},${cy - hdy - ddy} ${cx + hdx + ddx},${cy} ${cx},${cy + hdy + ddy} ${cx - hdx - ddx},${cy}`;
  return (
    <polygon
      points={points}
      fill={color}
      opacity={opacity}
      stroke={color}
      strokeWidth={0.8}
      strokeOpacity={0.3}
      style={{ transition: "opacity 0.3s ease, filter 0.3s ease" }}
    />
  );
}

/* ════════════════════════════ MAIN COMPONENT ════════════════════════════ */

export default function EnginePage() {
  const [active, setActive] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (!document.querySelector('link[href*="Outfit"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  const activeLayer = layers.find((l) => l.id === active);

  // SVG layout: layers stack bottom-to-top
  const svgW = 660;
  const svgH = 520;
  const centerX = 300;
  const layerGap = 110;
  const baseY = 420;
  const platW = 200;
  const platD = 80;

  return (
    <div style={{ background: P.bg, minHeight: "100vh", fontFamily: body, color: P.white }}>
      <style>{STYLES}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 60px" }}>

        {/* ════ HEADER ════ */}
        <header style={{ marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.indigo, display: "inline-block" }} />
            <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: P.sec, textTransform: "uppercase", letterSpacing: 1.5 }}>
              System Architecture
            </span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
            Griseus /{" "}
            <span style={{
              background: "linear-gradient(135deg, #818cf8, #f472b6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Engine
            </span>
          </h1>
          <p style={{ fontSize: 15, color: P.sec, marginTop: 8, lineHeight: 1.6, maxWidth: 500 }}>
            Workforce Intelligence Engine. Veriyi al, darboğazları bul, verimliliği artır.
          </p>
        </header>

        {/* ════ MAIN LAYOUT ════ */}
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* ── SVG Diagram ── */}
          <div style={{ flex: "1 1 660px", position: "relative", overflow: "hidden" }}>
            {/* Scan line */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent, ${P.indigo}40, transparent)`,
              animation: "eng-scan 6s linear infinite",
              pointerEvents: "none", zIndex: 2,
            }} />

            <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", maxWidth: 660, display: "block" }}>
              {/* Dashed connection lines between layers */}
              {[0, 1, 2].map((i) => {
                const y1 = baseY - i * layerGap;
                const y2 = baseY - (i + 1) * layerGap;
                return (
                  <g key={`conn-${i}`}>
                    <line
                      x1={centerX} y1={y1 - 20} x2={centerX} y2={y2 + 20}
                      stroke={P.mute} strokeWidth={1} strokeDasharray="3 6"
                      style={{ animation: "eng-dash 1.5s linear infinite" }}
                    />
                    {/* Pulse dot */}
                    <circle cx={centerX} cy={y1 - 20} r={2.5} fill={layers[i + 1].color}>
                      <animate attributeName="cy" values={`${y1 - 20};${y2 + 20}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              })}

              {/* Layers (bottom to top) */}
              {layers.map((layer, i) => {
                const cy = baseY - i * layerGap;
                const isActive = active === layer.id;
                const isHovered = hovered === layer.id;
                const platOpacity = isActive ? 0.2 : isHovered ? 0.12 : 0.06;

                // Cube positions across the platform
                const cubeSpacing = 55;
                const cubeStartX = centerX - ((layer.cubes.length - 1) * cubeSpacing) / 2;

                return (
                  <g
                    key={layer.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setActive(active === layer.id ? null : layer.id)}
                    onMouseEnter={() => setHovered(layer.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* Platform */}
                    <IsoPlatform cx={centerX} cy={cy} w={platW} d={platD} color={layer.color} opacity={platOpacity} />

                    {/* Glow on hover/active */}
                    {(isActive || isHovered) && (
                      <ellipse
                        cx={centerX} cy={cy}
                        rx={platW * 0.5} ry={platD * 0.35}
                        fill={layer.color} opacity={isActive ? 0.08 : 0.04}
                        style={{ filter: "blur(20px)", pointerEvents: "none" }}
                      />
                    )}

                    {/* Cubes */}
                    {layer.cubes.map((cube, ci) => (
                      <IsoCube
                        key={cube}
                        cx={cubeStartX + ci * cubeSpacing}
                        cy={cy - 8}
                        size={22}
                        color={layer.color}
                        label={cube}
                        delay={0.3 + i * 0.15 + ci * 0.08}
                        active={isActive}
                      />
                    ))}

                    {/* Left number label */}
                    <text
                      x={centerX - platW * 0.55}
                      y={cy + 4}
                      textAnchor="end"
                      fill={isActive ? layer.color : P.mute}
                      fontSize={24}
                      fontFamily={mono}
                      fontWeight={700}
                      opacity={isActive ? 1 : 0.4}
                      style={{ transition: "all 0.3s ease" }}
                    >
                      {layer.num}
                    </text>

                    {/* Right label */}
                    <g>
                      {/* Active indicator line */}
                      {isActive && (
                        <line
                          x1={centerX + platW * 0.55 + 8}
                          y1={cy - 14}
                          x2={centerX + platW * 0.55 + 8}
                          y2={cy + 14}
                          stroke={layer.color}
                          strokeWidth={2}
                          strokeLinecap="round"
                          opacity={0.8}
                        />
                      )}
                      <text
                        x={centerX + platW * 0.55 + (isActive ? 18 : 14)}
                        y={cy - 4}
                        fill={isActive ? P.white : P.sec}
                        fontSize={12}
                        fontFamily={body}
                        fontWeight={600}
                        style={{ transition: "fill 0.3s ease" }}
                      >
                        {layer.title}
                      </text>
                      <text
                        x={centerX + platW * 0.55 + (isActive ? 18 : 14)}
                        y={cy + 12}
                        fill={P.mute}
                        fontSize={10}
                        fontFamily={body}
                        fontWeight={400}
                      >
                        {layer.subtitle}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Center core diamond (Intelligence Engine) */}
              <g style={{ animation: "eng-float 3s ease-in-out infinite" }}>
                <polygon
                  points={`${centerX},${baseY - 2 * layerGap - 28} ${centerX + 8},${baseY - 2 * layerGap - 20} ${centerX},${baseY - 2 * layerGap - 12} ${centerX - 8},${baseY - 2 * layerGap - 20}`}
                  fill={P.indigo}
                  opacity={0.6}
                  stroke={P.indigo}
                  strokeWidth={0.5}
                />
              </g>
            </svg>
          </div>

          {/* ── Info Panel ── */}
          <div style={{ flex: "0 0 320px", minWidth: 280 }}>
            {activeLayer ? (
              <div style={{
                background: "rgba(255,255,255,0.015)",
                border: `1px solid ${activeLayer.color}20`,
                borderRadius: 14,
                padding: 24,
                animation: "eng-fade-in 0.3s ease",
              }}>
                {/* Layer badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{
                    fontFamily: mono, fontSize: 18, fontWeight: 700, color: activeLayer.color,
                  }}>
                    {activeLayer.num}
                  </span>
                  <span style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                    background: `${activeLayer.color}15`, color: activeLayer.color,
                    border: `1px solid ${activeLayer.color}30`,
                  }}>
                    {activeLayer.title}
                  </span>
                </div>

                {/* Title */}
                <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: P.white }}>
                  {activeLayer.title}
                </h3>
                <p style={{ fontSize: 12, color: P.mute, margin: "0 0 16px" }}>{activeLayer.subtitle}</p>

                {/* Description */}
                <p style={{ fontSize: 14, color: P.sec, lineHeight: 1.7, margin: "0 0 20px" }}>
                  {activeLayer.desc}
                </p>

                {/* Cube pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {activeLayer.cubes.map((c) => (
                    <span key={c} style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                      background: `${activeLayer.color}10`, color: activeLayer.color,
                      border: `1px solid ${activeLayer.color}20`,
                      fontFamily: mono,
                    }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{
                background: "rgba(255,255,255,0.015)",
                border: `1px solid rgba(255,255,255,0.05)`,
                borderRadius: 14,
                padding: 24,
              }}>
                <p style={{ fontSize: 13, color: P.mute, margin: "0 0 20px" }}>
                  Katmana tıklayarak detayları görüntüle
                </p>

                {/* Flow summary */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "Ham Veri", color: P.pink },
                    { label: "Ontology", color: P.amber },
                    { label: "Intelligence", color: P.indigo },
                    { label: "Aksiyon", color: P.green },
                  ].map((step, i) => (
                    <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: 6,
                        background: `${step.color}15`, border: `1px solid ${step.color}30`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700, color: step.color, fontFamily: mono,
                        flexShrink: 0,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13, color: P.sec, fontWeight: 500 }}>{step.label}</span>
                      {i < 3 && (
                        <span style={{ fontSize: 10, color: P.mute, marginLeft: "auto" }}>→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ════ BOTTOM NOTE ════ */}
        <div style={{ marginTop: 56, textAlign: "center" }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: P.sec, margin: "0 0 6px" }}>
            Motor bir kere yazılır, her müşteriye çalışır.
          </p>
          <p style={{ fontSize: 13, color: P.mute, margin: 0 }}>
            Çukurova ilk pilot · Data center inşaatı sonraki hedef
          </p>
        </div>

        {/* ════ FOOTER ════ */}
        <footer style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 40, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)",
          flexWrap: "wrap", gap: 8,
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: P.white }}>Griseus</span>
            <span style={{ fontSize: 12, color: P.mute, marginLeft: 8 }}>Workforce Intelligence Engine</span>
          </div>
          <span style={{ fontFamily: mono, fontSize: 11, color: P.mute }}>v1.0</span>
        </footer>

      </div>
    </div>
  );
}
