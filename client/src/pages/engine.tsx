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

/* ── Status Badge ── */
function StatusBadge({ status }: { status: "active" | "planned" | "faz3" }) {
  const map = {
    active: { label: "Aktif", bg: `${P.green}18`, border: `${P.green}35`, color: P.green },
    planned: { label: "Tasarlandı", bg: `${P.amber}18`, border: `${P.amber}35`, color: P.amber },
    faz3: { label: "Faz 3", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", color: P.mute },
  };
  const s = map[status];
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: mono,
    }}>
      {s.label}
    </span>
  );
}

/* ── Layer detail data ── */
const layerDetails: Record<string, React.ReactNode> = {
  applications: (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: P.white, marginBottom: 12 }}>Routes</div>
      {[
        { path: "/cukurova", name: "Digital Twin", status: "active" as const },
        { path: "/cukurova-sim", name: "Efficiency Engine", status: "planned" as const },
        { path: "/schedule", name: "Scheduling Board", status: "faz3" as const },
        { path: "/trust", name: "Trust Score Panel", status: "faz3" as const },
        { path: "/engine", name: "Engine Architecture", status: "active" as const },
      ].map((r) => (
        <div key={r.path} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 10px", borderRadius: 8, marginBottom: 4,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: P.green }}>{r.path}</span>
            <span style={{ fontSize: 11, color: P.sec }}>→ {r.name}</span>
          </div>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  ),

  intelligence: (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: P.white, marginBottom: 12 }}>Computation Functions</div>
      {[
        { fn: "simulateCapacity()", endpoint: "POST /simulate/capacity", desc: "What-if kapasite analizi" },
        { fn: "detectBottleneck()", endpoint: "GET /analyze/bottleneck/:id", desc: "Otomatik darboğaz tespiti" },
        { fn: "optimizeSchedule()", endpoint: "POST /optimize/schedule", desc: "Optimal plan önerisi" },
        { fn: "scoreWorkerRisk()", endpoint: "GET /analyze/workforce-risk/:id", desc: "Personel bağımlılık riski" },
        { fn: "forecastOutput()", endpoint: "POST /forecast/output", desc: "Üretim tahmini" },
        { fn: "calculateTrustScore()", endpoint: "GET /score/trust/:id", desc: "Trust Score hesaplama" },
      ].map((f) => (
        <div key={f.fn} style={{
          padding: "8px 10px", borderRadius: 8, marginBottom: 4,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: P.indigo, marginBottom: 2 }}>{f.fn}</div>
          <div style={{ fontFamily: mono, fontSize: 9, color: P.mute, marginBottom: 3 }}>{f.endpoint}</div>
          <div style={{ fontSize: 11, color: P.sec }}>{f.desc}</div>
        </div>
      ))}
    </div>
  ),

  ontology: (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: P.white, marginBottom: 12 }}>Entity Types</div>
      {[
        { name: "Facility", fields: "name, type, location, status", rels: "ProductionLine, Worker" },
        { name: "ProductionLine", fields: "worker_count, capacity_time, current_time", rels: "Facility, Operation" },
        { name: "Worker", fields: "department, capabilities[], trust_score", rels: "Facility, Operation" },
        { name: "Operation", fields: "planned_qty, actual_qty, status", rels: "Line, Worker, Product" },
        { name: "Product", fields: "sku, category, unit_time", rels: "Line, Operation" },
        { name: "Schedule", fields: "planned, actual, deviation", rels: "Line, Operation" },
        { name: "CapacityMetric", fields: "theoretical, actual, utilization%", rels: "Line" },
        { name: "KPI", fields: "formula, target, actual", rels: "Facility" },
      ].map((e) => (
        <div key={e.name} style={{
          padding: "8px 10px", borderRadius: 8, marginBottom: 4,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ fontFamily: mono, fontSize: 12, color: P.amber, fontWeight: 600, marginBottom: 2 }}>{e.name}</div>
          <div style={{ fontSize: 10, color: P.sec, marginBottom: 2 }}>{e.fields}</div>
          <div style={{ fontSize: 9, color: P.mute }}>→ {e.rels}</div>
        </div>
      ))}
    </div>
  ),

  ingestion: (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: P.white, marginBottom: 12 }}>Parsers</div>
      {[
        { src: "Excel (Üretim)", parser: "ExcelProductionParser", target: "operations" },
        { src: "Excel (Kapasite)", parser: "ExcelCapacityParser", target: "production_lines" },
        { src: "Excel (Personel)", parser: "ExcelWorkforceParser", target: "workers" },
        { src: "Excel (KPI)", parser: "ExcelKPIParser", target: "kpi_definitions" },
        { src: "Netsis ERP", parser: "NetsisAdapter", target: "tüm tablolar" },
        { src: "CSV / Manuel", parser: "GenericCSVParser", target: "dinamik" },
      ].map((p) => (
        <div key={p.parser} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 10px", borderRadius: 8, marginBottom: 4,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <span style={{ fontSize: 11, color: P.sec, width: 100, flexShrink: 0 }}>{p.src}</span>
          <span style={{ fontSize: 9, color: P.mute }}>→</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: P.pink }}>{p.parser}</span>
          <span style={{ fontSize: 9, color: P.mute }}>→</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: P.sec }}>{p.target}</span>
        </div>
      ))}
      {/* Endpoint card */}
      <div style={{
        marginTop: 10, padding: "10px 12px", borderRadius: 8,
        background: `${P.pink}08`, border: `1px solid ${P.pink}20`,
      }}>
        <div style={{ fontFamily: mono, fontSize: 11, color: P.pink, fontWeight: 600 }}>POST /api/v1/ingest/upload</div>
        <div style={{ fontSize: 10, color: P.sec, marginTop: 4 }}>Dosya yükleme endpoint'i — Excel, CSV, JSON kabul eder</div>
      </div>
    </div>
  ),
};

/* ── Layer definitions ── */
const layers = [
  { id: "ingestion", num: "01", title: "Data Ingestion", subtitle: "Veri toplama katmanı", color: P.pink, cubes: ["Excel", "ERP", "IoT", "API"] },
  { id: "ontology", num: "02", title: "Griseus Ontology", subtitle: "Bağlantı katmanı", color: P.amber, cubes: ["Worker", "Facility", "Operation", "Schedule"] },
  { id: "intelligence", num: "03", title: "Intelligence Engine", subtitle: "Kararları üreten katman", color: P.indigo, cubes: ["Simülasyon", "Darboğaz", "Optimizasyon", "Risk Skoru"] },
  { id: "applications", num: "04", title: "Applications", subtitle: "Kullanıcının gördüğü katman", color: P.green, cubes: ["Digital Twin", "Efficiency", "Scheduling", "Trust Score"] },
];

const layerDescriptions: Record<string, string> = {
  ingestion: "Herhangi bir kaynaktan veri girer. Format farketmez, Ontology'ye dönüşür.",
  ontology: "Evrensel veri modeli. Çukurova da kullanır, data center müteahhidi de. Aynı dil.",
  intelligence: "Şirketten bağımsız akıl katmanı. Veri kaynağı değişir, mantık aynı kalır.",
  applications: "Veriyi aksiyona çeviren arayüzler. Aynı motordan beslenir, farklı problemleri çözer.",
};

/* ── CSS Keyframes ── */
const STYLES = `
@keyframes eng-scan {
  0% { transform: translateY(-100%); opacity: 0; }
  8% { opacity: 1; }
  92% { opacity: 1; }
  100% { transform: translateY(100%); opacity: 0; }
}
@keyframes eng-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.5); }
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
  const dx = size * 0.866;
  const dy = size * 0.5;

  const top = `${cx},${cy - dy} ${cx + dx / 2},${cy - dy - dy / 2} ${cx},${cy - dy - dy} ${cx - dx / 2},${cy - dy - dy / 2}`;
  const left = `${cx - dx / 2},${cy - dy - dy / 2} ${cx},${cy - dy} ${cx},${cy} ${cx - dx / 2},${cy - dy / 2}`;
  const right = `${cx},${cy - dy} ${cx + dx / 2},${cy - dy - dy / 2} ${cx + dx / 2},${cy - dy / 2} ${cx},${cy}`;

  return (
    <g style={{ opacity: 0, animation: `eng-fade-in 0.5s ease ${delay}s forwards` }}>
      <polygon points={right} fill={color} opacity={0.15} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />
      <polygon points={left} fill={color} opacity={0.25} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />
      <polygon points={top} fill={color} opacity={0.4} stroke={color} strokeWidth={0.5} strokeOpacity={0.5} />
      {active && (
        <text x={cx} y={cy - dy - dy - 8} textAnchor="middle" fill={color} fontSize={7.5} fontFamily={mono} fontWeight={500}
          style={{ opacity: 0, animation: "eng-fade-in 0.3s ease 0.1s forwards" }}>
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
    <polygon points={points} fill={color} opacity={opacity} stroke={color} strokeWidth={0.8} strokeOpacity={0.3}
      style={{ transition: "opacity 0.3s ease" }} />
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

  const centerX = 280;
  const layerGap = 105;
  const baseY = 400;
  const platW = 190;
  const platD = 75;

  return (
    <div style={{ background: P.bg, minHeight: "100vh", fontFamily: body, color: P.white }}>
      <style>{STYLES}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 60px" }}>

        {/* ════ HEADER ════ */}
        <header style={{ marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.indigo, display: "inline-block" }} />
            <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: P.sec, textTransform: "uppercase", letterSpacing: 1.5 }}>
              System Architecture · Blueprint v1
            </span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
            Griseus /{" "}
            <span style={{ background: "linear-gradient(135deg, #818cf8, #f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Engine
            </span>
          </h1>
          <p style={{ fontSize: 14, color: P.sec, marginTop: 8, lineHeight: 1.6, maxWidth: 480 }}>
            Workforce Intelligence Engine. Veriyi al, darboğazları bul, verimliliği artır.
          </p>
        </header>

        {/* ════ MAIN LAYOUT ════ */}
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* ── SVG Diagram ── */}
          <div style={{ flex: "1 1 620px", position: "relative", overflow: "hidden" }}>
            {/* Scan line */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent, ${P.indigo}40, transparent)`,
              animation: "eng-scan 7s linear infinite", pointerEvents: "none", zIndex: 2,
            }} />

            <svg viewBox="0 0 620 480" style={{ width: "100%", maxWidth: 620, display: "block" }}>

              {/* Connection lines */}
              {[0, 1, 2].map((i) => {
                const y1 = baseY - i * layerGap;
                const y2 = baseY - (i + 1) * layerGap;
                return (
                  <g key={`conn-${i}`}>
                    <line x1={centerX} y1={y1 - 18} x2={centerX} y2={y2 + 18}
                      stroke={P.mute} strokeWidth={1} strokeDasharray="3 6"
                      style={{ animation: "eng-dash 1.5s linear infinite" }} />
                    <circle cx={centerX} cy={y1 - 18} r={2.5} fill={layers[i + 1].color}>
                      <animate attributeName="cy" values={`${y1 - 18};${y2 + 18}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              })}

              {/* Layers */}
              {layers.map((layer, i) => {
                const cy = baseY - i * layerGap;
                const isActive = active === layer.id;
                const isHovered = hovered === layer.id;
                const platOpacity = isActive ? 0.22 : isHovered ? 0.13 : 0.06;
                const cubeSpacing = 52;
                const cubeStartX = centerX - ((layer.cubes.length - 1) * cubeSpacing) / 2;

                return (
                  <g key={layer.id} style={{ cursor: "pointer" }}
                    onClick={() => setActive(active === layer.id ? null : layer.id)}
                    onMouseEnter={() => setHovered(layer.id)}
                    onMouseLeave={() => setHovered(null)}>

                    <IsoPlatform cx={centerX} cy={cy} w={platW} d={platD} color={layer.color} opacity={platOpacity} />

                    {(isActive || isHovered) && (
                      <ellipse cx={centerX} cy={cy} rx={platW * 0.5} ry={platD * 0.35}
                        fill={layer.color} opacity={isActive ? 0.08 : 0.04}
                        style={{ filter: "blur(20px)", pointerEvents: "none" }} />
                    )}

                    {layer.cubes.map((cube, ci) => (
                      <IsoCube key={cube} cx={cubeStartX + ci * cubeSpacing} cy={cy - 8}
                        size={21} color={layer.color} label={cube}
                        delay={0.3 + i * 0.15 + ci * 0.08} active={isActive} />
                    ))}

                    {/* Left number */}
                    <text x={centerX - platW * 0.55} y={cy + 5} textAnchor="end"
                      fill={isActive ? layer.color : P.mute} fontSize={22} fontFamily={mono} fontWeight={700}
                      opacity={isActive ? 1 : 0.35} style={{ transition: "all 0.3s ease" }}>
                      {layer.num}
                    </text>

                    {/* Right labels */}
                    <g>
                      {isActive && (
                        <line x1={centerX + platW * 0.55 + 8} y1={cy - 13} x2={centerX + platW * 0.55 + 8} y2={cy + 13}
                          stroke={layer.color} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
                      )}
                      <text x={centerX + platW * 0.55 + (isActive ? 18 : 14)} y={cy - 3}
                        fill={isActive ? P.white : P.sec} fontSize={12} fontFamily={body} fontWeight={600}
                        style={{ transition: "fill 0.3s ease" }}>
                        {layer.title}
                      </text>
                      <text x={centerX + platW * 0.55 + (isActive ? 18 : 14)} y={cy + 12}
                        fill={P.mute} fontSize={10} fontFamily={body}>
                        {layer.subtitle}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Core diamond */}
              <g style={{ animation: "eng-float 3s ease-in-out infinite" }}>
                <polygon
                  points={`${centerX},${baseY - 2 * layerGap - 26} ${centerX + 8},${baseY - 2 * layerGap - 18} ${centerX},${baseY - 2 * layerGap - 10} ${centerX - 8},${baseY - 2 * layerGap - 18}`}
                  fill={P.indigo} opacity={0.6} stroke={P.indigo} strokeWidth={0.5} />
              </g>
            </svg>
          </div>

          {/* ── Info Panel ── */}
          <div style={{ flex: "0 1 340px", minWidth: 280 }}>
            {activeLayer ? (
              <div key={activeLayer.id} style={{
                background: "rgba(255,255,255,0.015)", border: `1px solid ${activeLayer.color}20`,
                borderRadius: 14, padding: 20, animation: "eng-fade-in 0.3s ease",
                maxHeight: "75vh", overflowY: "auto",
              }}>
                {/* Badge row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: activeLayer.color }}>
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

                {/* Description */}
                <p style={{ fontSize: 13, color: P.sec, lineHeight: 1.6, margin: "0 0 16px" }}>
                  {layerDescriptions[activeLayer.id]}
                </p>

                {/* Detail content */}
                {layerDetails[activeLayer.id]}
              </div>
            ) : (
              <div style={{
                background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 14, padding: 20,
              }}>
                <p style={{ fontSize: 13, color: P.mute, margin: "0 0 20px" }}>
                  Katmana tıklayarak detayları görüntüle
                </p>

                {/* Flow summary */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
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
                        fontSize: 10, fontWeight: 700, color: step.color, fontFamily: mono, flexShrink: 0,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13, color: P.sec, fontWeight: 500 }}>{step.label}</span>
                      {i < 3 && <span style={{ fontSize: 10, color: P.mute, marginLeft: "auto" }}>→</span>}
                    </div>
                  ))}
                </div>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { n: "10", label: "DB Tablosu" },
                    { n: "8", label: "Entity Type" },
                    { n: "6", label: "Fonksiyon" },
                    { n: "5", label: "Uygulama" },
                  ].map((s) => (
                    <div key={s.label} style={{
                      padding: "10px 12px", borderRadius: 8,
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                      textAlign: "center",
                    }}>
                      <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: P.white }}>{s.n}</div>
                      <div style={{ fontSize: 10, color: P.mute, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ════ BOTTOM NOTE ════ */}
        <div style={{ marginTop: 48, textAlign: "center" }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: P.sec, margin: "0 0 6px" }}>
            Motor bir kere yazılır, her müşteriye çalışır.
          </p>
          <p style={{ fontSize: 12, color: P.mute, margin: 0 }}>
            Çukurova ilk pilot · Data center inşaatı sonraki hedef
          </p>
        </div>

        {/* ════ FOOTER ════ */}
        <footer style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 36, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)",
          flexWrap: "wrap", gap: 8,
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: P.white }}>Griseus</span>
            <span style={{ fontSize: 12, color: P.mute, marginLeft: 8 }}>Workforce Intelligence Engine</span>
          </div>
          <span style={{ fontFamily: mono, fontSize: 11, color: P.mute }}>Blueprint v1.0</span>
        </footer>
      </div>
    </div>
  );
}
