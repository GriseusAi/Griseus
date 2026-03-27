import { useLocation } from "wouter";

/* ═══════════════════════════════════════════════════════════════
   Palantir-style Isometric Platform Architecture — SVG recreation
   Faithful reproduction of the layered ontology diagram
   ═══════════════════════════════════════════════════════════════ */

// Colors matching Palantir's palette
const P = {
  blue: "#6366f1",
  blueLine: "#818cf8",
  blueLight: "#c7d2fe",
  purple: "#7c3aed",
  purpleLight: "#ddd6fe",
  gray: "#e5e7eb",
  grayMid: "#9ca3af",
  grayDark: "#6b7280",
  dark: "#374151",
  cubePurple1: "#8b5cf6",
  cubePurple2: "#a78bfa",
  cubePurple3: "#c4b5fd",
  cubeBlue1: "#6366f1",
  cubeBlue2: "#818cf8",
  cubeGray: "#d1d5db",
};

/* ── Isometric 3D cube primitive ── */
function IsoCube({ x, y, s = 12, c1 = P.cubePurple1, c2 = P.cubePurple2, c3 = P.cubePurple3 }: {
  x: number; y: number; s?: number; c1?: string; c2?: string; c3?: string;
}) {
  const h = s * 0.6;
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Top face */}
      <polygon points={`0,${-h} ${s/2},${-h/2} 0,0 ${-s/2},${-h/2}`} fill={c3} stroke="white" strokeWidth="0.5" />
      {/* Left face */}
      <polygon points={`${-s/2},${-h/2} 0,0 0,${h*0.5} ${-s/2},0`} fill={c1} stroke="white" strokeWidth="0.5" />
      {/* Right face */}
      <polygon points={`0,0 ${s/2},${-h/2} ${s/2},0 0,${h*0.5}`} fill={c2} stroke="white" strokeWidth="0.5" />
    </g>
  );
}

/* ── Isometric platform (diamond shape with depth) ── */
function IsoPlatform({ x, y, w, h, depth = 12, fill = "#f9fafb", stroke = P.blueLight, gridColor = "rgba(99,102,241,0.12)" }: {
  x: number; y: number; w: number; h: number; depth?: number; fill?: string; stroke?: string; gridColor?: string;
}) {
  const hw = w / 2;
  const hh = h / 2;
  return (
    <g>
      {/* Side faces */}
      <polygon
        points={`${x - hw},${y} ${x},${y + hh} ${x},${y + hh + depth} ${x - hw},${y + depth}`}
        fill="#e5e7eb" stroke="#d1d5db" strokeWidth="0.5"
      />
      <polygon
        points={`${x},${y + hh} ${x + hw},${y} ${x + hw},${y + depth} ${x},${y + hh + depth}`}
        fill="#f3f4f6" stroke="#d1d5db" strokeWidth="0.5"
      />
      {/* Top face */}
      <polygon
        points={`${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`}
        fill={fill} stroke={stroke} strokeWidth="0.8"
      />
      {/* Grid lines */}
      {Array.from({ length: 9 }, (_, i) => {
        const t = (i + 1) / 10;
        // Lines going from top-left edge to bottom-right edge
        const x1 = x - hw + hw * t;
        const y1 = y - hh * (1 - t);
        const x2 = x - hw * (1 - t);
        const y2 = y + hh * t;
        return <line key={`g1-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={gridColor} strokeWidth="0.4" />;
      })}
      {Array.from({ length: 9 }, (_, i) => {
        const t = (i + 1) / 10;
        const x1 = x + hw * t;
        const y1 = y - hh * (1 - t);
        const x2 = x + hw * (1 - t);
        const y2 = y + hh * t;
        return <line key={`g2-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={gridColor} strokeWidth="0.4" />;
      })}
    </g>
  );
}

/* ── Circle node on platform (with "fx" badge) ── */
function PlatformNode({ x, y, r = 22, label, showFx = true }: {
  x: number; y: number; r?: number; label?: string; showFx?: boolean;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="white" stroke={P.blueLine} strokeWidth="1.5" />
      <circle cx={x} cy={y} r={r - 3} fill="rgba(99,102,241,0.04)" stroke="none" />
      {showFx && (
        <text x={x} y={y + 3} textAnchor="middle" fontSize="9" fontWeight="600"
          fill={P.grayDark} fontFamily="'Inter',sans-serif" fontStyle="italic">fx</text>
      )}
      {label && (
        <text x={x} y={y + r + 12} textAnchor="middle" fontSize="8" fill={P.grayDark}
          fontFamily="'Inter',sans-serif" fontWeight="500">{label}</text>
      )}
    </g>
  );
}

/* ── Factory building (center piece) ── */
function FactoryBuilding({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Main building body */}
      <rect x="-28" y="-20" width="56" height="40" rx="2" fill="#f3f4f6" stroke={P.grayMid} strokeWidth="0.8" />
      {/* Roof detail */}
      <rect x="-28" y="-20" width="56" height="6" rx="2" fill="#e5e7eb" stroke={P.grayMid} strokeWidth="0.5" />
      {/* Chimneys */}
      <rect x="-18" y="-38" width="6" height="20" fill="#e5e7eb" stroke={P.grayMid} strokeWidth="0.6" />
      <rect x="-8" y="-34" width="6" height="16" fill="#e5e7eb" stroke={P.grayMid} strokeWidth="0.6" />
      <rect x="12" y="-32" width="6" height="14" fill="#e5e7eb" stroke={P.grayMid} strokeWidth="0.6" />
      {/* Chimney tops */}
      <rect x="-20" y="-40" width="10" height="3" rx="1" fill={P.grayMid} />
      <rect x="-10" y="-36" width="10" height="3" rx="1" fill={P.grayMid} />
      <rect x="10" y="-34" width="10" height="3" rx="1" fill={P.grayMid} />
      {/* Windows */}
      {[-16, -4, 8].map(wx => (
        <g key={wx}>
          <rect x={wx} y="-10" width="10" height="8" rx="1" fill="white" stroke={P.gray} strokeWidth="0.5" />
          <line x1={wx + 5} y1="-10" x2={wx + 5} y2="-2" stroke={P.gray} strokeWidth="0.3" />
          <line x1={wx} y1="-6" x2={wx + 10} y2="-6" stroke={P.gray} strokeWidth="0.3" />
        </g>
      ))}
      {/* Door */}
      <rect x="-5" y="4" width="10" height="16" rx="1" fill="white" stroke={P.grayMid} strokeWidth="0.6" />
      <circle cx="3" cy="12" r="1" fill={P.grayMid} />
      {/* Label */}
      <text x="0" y="32" textAnchor="middle" fontSize="7.5" fontWeight="600" fill={P.dark}
        fontFamily="'Inter',sans-serif">Tool Factory</text>
    </g>
  );
}

/* ── Floating tilted panel (Application/Automation/IDE/Agent) ── */
function FloatingPanel({ x, y, label, type, variant = "default" }: {
  x: number; y: number; label: string; type: string; variant?: string;
}) {
  const w = 90;
  const h = 65;
  // Isometric tilt via skew transform
  const isLeft = x < 420;
  const skewAngle = isLeft ? 8 : -8;

  return (
    <g transform={`translate(${x},${y}) skewY(${skewAngle})`}>
      {/* Card shadow */}
      <rect x="-2" y="2" width={w} height={h} rx="4" fill="rgba(0,0,0,0.06)" />
      {/* Card body */}
      <rect x="0" y="0" width={w} height={h} rx="4" fill="white" stroke={P.blueLight} strokeWidth="0.8" />
      {/* Header bar */}
      <rect x="0" y="0" width={w} height="14" rx="4" fill="#f9fafb" />
      <rect x="0" y="10" width={w} height="4" fill="#f9fafb" />
      <line x1="0" y1="14" x2={w} y2="14" stroke={P.gray} strokeWidth="0.4" />
      {/* Window dots */}
      <circle cx="8" cy="7" r="2" fill="#fca5a5" />
      <circle cx="15" cy="7" r="2" fill="#fcd34d" />
      <circle cx="22" cy="7" r="2" fill="#86efac" />
      {/* Type label */}
      <text x={w - 5} y="10" textAnchor="end" fontSize="6" fill={P.grayMid}
        fontFamily="'Inter',sans-serif" fontWeight="500">{type}</text>

      {/* Content mock based on variant */}
      {variant === "chart" && (
        <g>
          {/* Bar chart mock */}
          {[12, 24, 36, 48, 60].map((bx, i) => {
            const bh = [18, 28, 22, 32, 14][i];
            return <rect key={bx} x={bx} y={h - 8 - bh} width="8" height={bh} rx="1"
              fill={i === 3 ? P.cubePurple2 : "#e5e7eb"} />;
          })}
          {/* Percentage text */}
          <text x="14" y="28" fontSize="12" fontWeight="700" fill={P.dark}
            fontFamily="'Inter',sans-serif">85%</text>
        </g>
      )}
      {variant === "workflow" && (
        <g>
          {/* Progress bars */}
          {[20, 30, 40, 50].map((py, i) => (
            <g key={py}>
              <rect x="8" y={py} width="74" height="5" rx="2" fill="#f3f4f6" />
              <rect x="8" y={py} width={[60, 45, 74, 30][i]} height="5" rx="2"
                fill={i === 2 ? P.cubePurple2 : i === 0 ? "#93c5fd" : "#e5e7eb"} />
            </g>
          ))}
          {/* Status dots */}
          <circle cx="12" cy="26" r="2" fill="#86efac" />
          <circle cx="20" cy="26" r="2" fill="#86efac" />
          <circle cx="28" cy="26" r="2" fill="#fcd34d" />
        </g>
      )}
      {variant === "code" && (
        <g>
          {/* Code lines */}
          {[22, 28, 34, 40, 46, 52].map((ly, i) => (
            <rect key={ly} x={8 + (i % 3) * 4} y={ly} width={[40, 55, 30, 50, 25, 45][i]} height="3" rx="1"
              fill={i === 1 || i === 4 ? P.blueLight : "#e5e7eb"} />
          ))}
        </g>
      )}
      {variant === "agent" && (
        <g>
          {/* Neural network nodes */}
          {[
            [20, 30], [40, 25], [60, 30], [70, 25],
            [25, 42], [45, 45], [65, 40],
            [30, 55], [55, 52],
          ].map(([nx, ny], i) => (
            <g key={i}>
              <circle cx={nx} cy={ny} r="4" fill={i < 4 ? P.purpleLight : "#f3f4f6"}
                stroke={P.blueLine} strokeWidth="0.5" />
              {i >= 4 && i < 7 && (
                <>
                  <line x1={nx} y1={ny} x2={[20, 40, 60][i - 4]} y2={[30, 25, 30][i - 4]}
                    stroke={P.blueLight} strokeWidth="0.4" />
                </>
              )}
            </g>
          ))}
          {/* AI label */}
          <text x={w / 2} y={h - 6} textAnchor="middle" fontSize="7" fontWeight="600"
            fill={P.purple} fontFamily="'Inter',sans-serif">AI</text>
        </g>
      )}
      {variant === "default" && (
        <g>
          {/* Generic list items */}
          {[22, 32, 42, 52].map((ly, i) => (
            <g key={ly}>
              <rect x="8" y={ly} width={[50, 65, 40, 55][i]} height="4" rx="1" fill="#e5e7eb" />
              <circle cx={w - 10} cy={ly + 2} r="2" fill={i === 0 ? "#86efac" : "#e5e7eb"} />
            </g>
          ))}
        </g>
      )}

      {/* Bottom label */}
      <text x={w / 2} y={h + 14} textAnchor="middle" fontSize="8" fontWeight="600"
        fill={P.dark} fontFamily="'Inter',sans-serif"
        transform={`skewY(${-skewAngle})`}>{label}</text>
    </g>
  );
}

/* ── Small scattered cubes (particles between layers) ── */
function ScatteredCubes({ cx, cy }: { cx: number; cy: number }) {
  const cubes = [
    { x: -30, y: -20, s: 6 }, { x: 10, y: -35, s: 5 }, { x: -15, y: -40, s: 4 },
    { x: 25, y: -15, s: 5 }, { x: -5, y: -50, s: 6 }, { x: 15, y: -45, s: 4 },
    { x: -25, y: -55, s: 5 }, { x: 30, y: -30, s: 4 }, { x: 5, y: -25, s: 5 },
    { x: -10, y: -10, s: 4 }, { x: 20, y: -55, s: 3 }, { x: -20, y: -30, s: 3 },
  ];
  return (
    <g>
      {cubes.map((c, i) => (
        <IsoCube key={i} x={cx + c.x} y={cy + c.y} s={c.s}
          c1={P.cubeBlue1} c2={P.cubeBlue2} c3={P.blueLight} />
      ))}
    </g>
  );
}

/* ════════════════════════════════════════════════════════
   Main SVG Component
   ════════════════════════════════════════════════════════ */
function PlatformArchitecture() {
  const W = 900;
  const H = 850;
  const cx = W / 2;

  // Platform center
  const platY = 420;

  // Node positions around factory (on the platform)
  const nodes = [
    { x: cx - 140, y: platY - 50, label: "" },
    { x: cx - 100, y: platY - 90, label: "" },
    { x: cx - 40, y: platY - 105, label: "" },
    { x: cx + 40, y: platY - 105, label: "" },
    { x: cx + 100, y: platY - 90, label: "" },
    { x: cx + 140, y: platY - 50, label: "" },
    { x: cx + 150, y: platY + 10, label: "" },
    { x: cx + 110, y: platY + 60, label: "" },
    { x: cx + 40, y: platY + 80, label: "" },
    { x: cx - 40, y: platY + 80, label: "" },
    { x: cx - 110, y: platY + 60, label: "" },
    { x: cx - 150, y: platY + 10, label: "" },
  ];

  // Connection lines between nodes and factory center
  const nodeConnections = nodes.map((n, i) => ({
    from: { x: cx, y: platY },
    to: n,
    key: `fc-${i}`,
  }));

  // Cross connections
  const crossConns = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
    [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 0],
  ];

  // Floating panels
  const panels = [
    { x: 30, y: 60, label: "Application", type: "Application", variant: "default", lineTarget: 0 },
    { x: 50, y: 170, label: "Application", type: "Application", variant: "chart", lineTarget: 11 },
    { x: 190, y: 30, label: "Automation", type: "Automation", variant: "workflow", lineTarget: 1 },
    { x: 230, y: 140, label: "Automation", type: "Automation", variant: "chart", lineTarget: 2 },
    { x: 390, y: -10, label: "IDE", type: "IDE", variant: "code", lineTarget: 3 },
    { x: 620, y: -10, label: "IDE", type: "IDE", variant: "code", lineTarget: 4 },
    { x: 660, y: 80, label: "Agent", type: "Gemini", variant: "agent", lineTarget: 5 },
    { x: 700, y: 180, label: "Agent", type: "AI", variant: "agent", lineTarget: 6 },
    { x: 740, y: 290, label: "Agent", type: "Agent", variant: "agent", lineTarget: 7 },
    { x: 680, y: 370, label: "Agent", type: "Agent", variant: "default", lineTarget: 8 },
  ];

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
      style={{ maxWidth: 960, fontFamily: "'Inter', 'system-ui', sans-serif" }}>

      {/* Background */}
      <rect width={W} height={H} fill="#fafafa" />

      {/* ═══ LAYER 1: Enterprise Data • Logic • Action (bottom) ═══ */}
      <g>
        <IsoPlatform x={cx} y={720} w={380} h={100} depth={40} fill="#f3f4f6" stroke="#d1d5db" gridColor="rgba(0,0,0,0)" />
        {/* 3D cubes grid */}
        {Array.from({ length: 8 }, (_, row) =>
          Array.from({ length: 10 - Math.abs(row - 3.5) * 1.2 }, (_, col) => {
            const bx = cx - 100 + col * 22 + (row % 2) * 11;
            const by = 698 + row * 10 - Math.abs(col - 4) * 2;
            const isPurple = (row + col) % 3 === 0;
            return (
              <IsoCube key={`base-${row}-${col}`} x={bx} y={by} s={14}
                c1={isPurple ? P.cubePurple1 : "#9ca3af"}
                c2={isPurple ? P.cubePurple2 : "#d1d5db"}
                c3={isPurple ? P.cubePurple3 : "#e5e7eb"}
              />
            );
          })
        )}
        <text x={cx - 170} y={770} fontSize="10" fontWeight="600" fill={P.grayDark}
          fontFamily="'Inter',sans-serif">Enterprise Data • Logic • Action</text>
      </g>

      {/* ═══ LAYER 2: Governance Humans + AI ═══ */}
      <g>
        <IsoPlatform x={cx} y={645} w={340} h={70} depth={8} fill="#f9fafb" stroke="#e5e7eb" />
        {/* Connected dots */}
        {[
          [-120, -8], [-80, -18], [-40, -5], [0, -15], [40, -8], [80, -18], [120, -5],
          [-100, 8], [-60, 12], [-20, 5], [20, 10], [60, 5], [100, 12],
        ].map(([dx, dy], i) => (
          <g key={`gov-${i}`}>
            <circle cx={cx + dx} cy={645 + dy} r="4"
              fill={i % 4 === 0 ? "#d4d4d8" : "#f3f4f6"}
              stroke="#a1a1aa" strokeWidth="0.6" />
            {i > 0 && i < 7 && (
              <line x1={cx + [[-120, -80, -40, 0, 40, 80, 120][i - 1]]}
                y1={645 + [[-8, -18, -5, -15, -8, -18, -5][i - 1]]}
                x2={cx + dx} y2={645 + dy}
                stroke="#d4d4d8" strokeWidth="0.5" />
            )}
          </g>
        ))}
        <text x={cx - 150} y={668} fontSize="9" fontWeight="600" fill={P.grayDark}
          fontFamily="'Inter',sans-serif">→ Governance Humans + AI</text>
        {/* OSDK badge */}
        <g transform={`translate(${cx + 110}, ${645 - 5})`}>
          <rect x="-14" y="-8" width="28" height="16" rx="3" fill="white" stroke={P.purple} strokeWidth="0.8" />
          <polygon points="0,-3 4,0 0,3 -4,0" fill={P.purple} />
          <text x="0" y="14" textAnchor="middle" fontSize="6.5" fontWeight="600" fill={P.grayDark}
            fontFamily="'Inter',sans-serif">OSDK</text>
        </g>
      </g>

      {/* ═══ LAYER 3: Ontology Language + Toolchain ═══ */}
      <g>
        <IsoPlatform x={cx} y={590} w={320} h={50} depth={6} fill="white" stroke={P.blueLight} />
        <text x={cx - 140} y={605} fontSize="9" fontWeight="600" fill={P.grayDark}
          fontFamily="'Inter',sans-serif">→ Ontology Language + Toolchain</text>
      </g>

      {/* ═══ LAYER 4: Main Platform ═══ */}
      <IsoPlatform x={cx} y={platY} w={420} h={230} depth={15}
        fill="white" stroke={P.blueLine} gridColor="rgba(99,102,241,0.1)" />

      {/* Blue connection lines (cross-connections between nodes) */}
      {crossConns.map(([a, b]) => (
        <line key={`cc-${a}-${b}`}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke={P.blueLine} strokeWidth="1" opacity="0.5" />
      ))}

      {/* Blue connection lines (factory to each node) */}
      {nodeConnections.map(c => (
        <line key={c.key}
          x1={c.from.x} y1={c.from.y}
          x2={c.to.x} y2={c.to.y}
          stroke={P.blueLine} strokeWidth="1.2" />
      ))}

      {/* Factory center piece */}
      <FactoryBuilding x={cx} y={platY} />

      {/* Platform nodes */}
      {nodes.map((n, i) => (
        <PlatformNode key={i} x={n.x} y={n.y} r={20} />
      ))}

      {/* Scattered cubes between platform and panels */}
      <ScatteredCubes cx={cx} cy={platY - 130} />

      {/* ═══ LAYER 5: Floating Panels ═══ */}
      {panels.map((panel, i) => {
        const target = nodes[panel.lineTarget];
        return (
          <g key={i}>
            {/* Connection line from panel to platform node */}
            <line
              x1={panel.x + 45} y1={panel.y + 65}
              x2={target.x} y2={target.y}
              stroke={P.blueLine} strokeWidth="0.8" opacity="0.6"
            />
            {/* Small dot at connection point */}
            <circle cx={panel.x + 45} cy={panel.y + 65} r="2" fill={P.blueLine} />
            <FloatingPanel
              x={panel.x} y={panel.y}
              label={panel.label} type={panel.type} variant={panel.variant}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ════════════════════════════════════════════════════════
   Admin Page Export
   ════════════════════════════════════════════════════════ */
export default function AdminPage() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col min-h-screen w-full" style={{ background: "#fafafa" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e5e7eb" }}>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center cursor-pointer"
            onClick={() => navigate("/")}>
            <span className="text-white text-xs font-bold">G</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">Griseus Admin</h1>
            <p className="text-[10px] text-gray-400">Çukurova Isı Sistemleri</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-gray-400 uppercase tracking-widest">Ontology Engine v1</span>
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <PlatformArchitecture />
      </div>
    </div>
  );
}
