import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend,
} from "recharts";

/* ── Google Fonts ── */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap";

/* ── Palette ── */
const C = {
  bg: "#08080c",
  card: "rgba(255,255,255,0.015)",
  cardBorder: "rgba(255,255,255,0.05)",
  elektrik: "#818cf8",
  gaz: "#f472b6",
  ok: "#34d399",
  warn: "#fbbf24",
  err: "#ef4444",
  white: "#fff",
  mid: "#999",
  dim: "#555",
};

const mono = "'Space Mono', monospace";
const sans = "'DM Sans', sans-serif";
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ═══════════════════════════════════════════════════════════════════════════
   ISOMETRIC FACTORY COMPONENTS
   ⚠️ DOKUNMA — İzometrik tesis görünümü sabit kalacak. Silme, değiştirme.
   ═══════════════════════════════════════════════════════════════════════════ */

function SmokeParticles({ x, y, count = 6 }: { x: number; y: number; count?: number }) {
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => (
        <circle
          key={i}
          r={2 + Math.random() * 2}
          fill="rgba(180,190,210,0.15)"
          cx={x + (Math.random() - 0.5) * 8}
          cy={y}
        >
          <animate attributeName="cy" values={`${y};${y - 30 - Math.random() * 20}`} dur={`${2.5 + Math.random() * 2}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
          <animate attributeName="cx" values={`${x + (Math.random() - 0.5) * 8};${x + (Math.random() - 0.5) * 20}`} dur={`${2.5 + Math.random() * 2}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.25;0" dur={`${2.5 + Math.random() * 2}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
          <animate attributeName="r" values={`${2 + Math.random() * 2};${4 + Math.random() * 3}`} dur={`${2.5 + Math.random() * 2}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  );
}

function StatusDot({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5} fill="#10b981" opacity={0.3}>
        <animate attributeName="r" values="5;10;5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.08;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={x} cy={y} r={3.5} fill="#10b981" />
    </g>
  );
}

function WindowGrid({ x, y, cols, rows, w, h, gap }: { x: number; y: number; cols: number; rows: number; w: number; h: number; gap: number }) {
  return (
    <g>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const flickerDur = 3 + Math.random() * 4;
          const delay = Math.random() * 3;
          const baseOpacity = 0.3 + Math.random() * 0.5;
          return (
            <rect key={`${r}-${c}`} x={x + c * (w + gap)} y={y + r * (h + gap)} width={w} height={h} rx={0.5} fill="#f59e0b" opacity={baseOpacity}>
              <animate attributeName="opacity" values={`${baseOpacity};${baseOpacity * 0.4};${baseOpacity}`} dur={`${flickerDur}s`} begin={`${delay}s`} repeatCount="indefinite" />
            </rect>
          );
        })
      )}
    </g>
  );
}

function IsometricBuilding({ label, sublabel, x, y, width, height, depth, roofColor, wallLeftColor, wallRightColor, accentColor, hovered, onHover, onLeave, chimneyX, windowConfig, statusDotOffset }: {
  label: string; sublabel: string; x: number; y: number; width: number; height: number; depth: number;
  roofColor: string; wallLeftColor: string; wallRightColor: string; accentColor: string;
  hovered: boolean; onHover: () => void; onLeave: () => void;
  chimneyX?: number; windowConfig?: { x: number; y: number; cols: number; rows: number }; statusDotOffset?: { x: number; y: number };
}) {
  const isoX = (lx: number, ly: number) => (lx - ly) * 0.866;
  const isoY = (lx: number, ly: number, lz: number) => (lx + ly) * 0.5 - lz;
  const hw = width / 2;
  const hd = depth / 2;
  const topFace = [[isoX(-hw, -hd), isoY(-hw, -hd, height)], [isoX(hw, -hd), isoY(hw, -hd, height)], [isoX(hw, hd), isoY(hw, hd, height)], [isoX(-hw, hd), isoY(-hw, hd, height)]].map(p => `${p[0]},${p[1]}`).join(" ");
  const leftFace = [[isoX(-hw, hd), isoY(-hw, hd, height)], [isoX(-hw, hd), isoY(-hw, hd, 0)], [isoX(-hw, -hd), isoY(-hw, -hd, 0)], [isoX(-hw, -hd), isoY(-hw, -hd, height)]].map(p => `${p[0]},${p[1]}`).join(" ");
  const rightFace = [[isoX(-hw, hd), isoY(-hw, hd, height)], [isoX(-hw, hd), isoY(-hw, hd, 0)], [isoX(hw, hd), isoY(hw, hd, 0)], [isoX(hw, hd), isoY(hw, hd, height)]].map(p => `${p[0]},${p[1]}`).join(" ");
  const liftY = hovered ? -6 : 0;
  const glowOpacity = hovered ? 0.5 : 0;

  return (
    <g transform={`translate(${x}, ${y + liftY})`} style={{ cursor: "default", transition: "transform 0.3s ease" }} onMouseEnter={onHover} onMouseLeave={onLeave}>
      <ellipse cx={0} cy={isoY(0, 0, 0) + 8} rx={width * 0.7} ry={depth * 0.25} fill={accentColor} opacity={glowOpacity} style={{ transition: "opacity 0.3s ease", filter: "blur(12px)" }} />
      <ellipse cx={0} cy={isoY(0, 0, 0) + 4} rx={width * 0.6} ry={depth * 0.2} fill="rgba(0,0,0,0.4)" style={{ filter: "blur(8px)" }} />
      <polygon points={leftFace} fill={wallLeftColor} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
      <polygon points={rightFace} fill={wallRightColor} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
      <polygon points={topFace} fill={roofColor} stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />
      <line x1={isoX(-hw, -hd)} y1={isoY(-hw, -hd, height)} x2={isoX(hw, -hd)} y2={isoY(hw, -hd, height)} stroke={accentColor} strokeWidth={2} opacity={hovered ? 1 : 0.6} style={{ transition: "opacity 0.3s ease" }} />
      <line x1={isoX(-hw, -hd)} y1={isoY(-hw, -hd, height)} x2={isoX(-hw, hd)} y2={isoY(-hw, hd, height)} stroke={accentColor} strokeWidth={1.5} opacity={hovered ? 0.8 : 0.4} style={{ transition: "opacity 0.3s ease" }} />
      {windowConfig && <WindowGrid x={windowConfig.x} y={windowConfig.y} cols={windowConfig.cols} rows={windowConfig.rows} w={6} h={5} gap={4} />}
      {chimneyX != null && (
        <>
          <rect x={chimneyX} y={isoY(0, 0, height) - 22} width={6} height={18} fill={wallLeftColor} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
          <SmokeParticles x={chimneyX + 3} y={isoY(0, 0, height) - 24} />
        </>
      )}
      <StatusDot x={statusDotOffset?.x ?? isoX(hw, -hd) - 4} y={statusDotOffset?.y ?? isoY(hw, -hd, height) - 8} />
      {hovered && (
        <g>
          <rect x={-60} y={isoY(0, 0, height) - 52} width={120} height={36} rx={6} fill="rgba(15,15,25,0.92)" stroke={accentColor} strokeWidth={1} />
          <text x={0} y={isoY(0, 0, height) - 38} textAnchor="middle" fill="white" fontSize={11} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">{label}</text>
          <text x={0} y={isoY(0, 0, height) - 24} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={8.5} fontFamily="Inter, system-ui, sans-serif">{sublabel}</text>
        </g>
      )}
    </g>
  );
}

function FlowArrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = dx / len;
  const ny = dy / len;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(56,189,248,0.25)" strokeWidth={2} strokeDasharray="6 4">
        <animate attributeName="stroke-dashoffset" values="0;-20" dur="1.5s" repeatCount="indefinite" />
      </line>
      <circle r={3.5} fill="#38bdf8">
        <animate attributeName="cx" values={`${x1};${x2}`} dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="cy" values={`${y1};${y2}`} dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.6;1" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <polygon points={`${x2},${y2} ${x2 - nx * 8 - ny * 4},${y2 - ny * 8 + nx * 4} ${x2 - nx * 8 + ny * 4},${y2 - ny * 8 - nx * 4}`} fill="rgba(56,189,248,0.5)" />
      <text x={midX} y={midY - 12} textAnchor="middle" fill="rgba(56,189,248,0.5)" fontSize={8} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.05em">KASA AKIŞI</text>
    </g>
  );
}

function IsometricGrid() {
  const lines = [];
  for (let i = -10; i <= 10; i++) {
    lines.push(<line key={`a${i}`} x1={i * 40 * 0.866 - 10 * 40 * 0.866} y1={i * 40 * 0.5 + 10 * 40 * 0.5} x2={i * 40 * 0.866 + 10 * 40 * 0.866} y2={i * 40 * 0.5 - 10 * 40 * 0.5} stroke="rgba(255,255,255,0.02)" strokeWidth={0.5} />);
    lines.push(<line key={`b${i}`} x1={-i * 40 * 0.866 - 10 * 40 * 0.866} y1={i * 40 * 0.5 + 10 * 40 * 0.5} x2={-i * 40 * 0.866 + 10 * 40 * 0.866} y2={i * 40 * 0.5 - 10 * 40 * 0.5} stroke="rgba(255,255,255,0.02)" strokeWidth={0.5} />);
  }
  return <g>{lines}</g>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ISOMETRIC SCENE (full-viewport hero)
   ═══════════════════════════════════════════════════════════════════════════ */

function IsometricScene({ onKasaClick }: { onKasaClick: () => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [kasaGlow, setKasaGlow] = useState(false);

  return (
    <section style={{
      position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#0a0a0f",
      fontFamily: "Inter, system-ui, -apple-system, sans-serif", overflow: "hidden",
    }}>
      {/* Ambient gradient orbs */}
      <div style={{ position: "absolute", top: "20%", left: "30%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "20%", right: "25%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.03) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }} style={{ textAlign: "center", marginBottom: 12, position: "relative", zIndex: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.02em", margin: 0 }}>Çukurova Isı Sistemleri</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "4px 0 0 0", fontWeight: 500 }}>Operations Intelligence Platform</p>
      </motion.div>

      {/* Status bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }} style={{ display: "flex", gap: 20, marginBottom: 32, position: "relative", zIndex: 10 }}>
        {[{ label: "3 hat aktif", dot: "#10b981" }, { label: "12 operatör", dot: "#38bdf8" }, { label: "Pik sezon 26 hafta", dot: "#f59e0b" }].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.dot, display: "inline-block" }} />
            {item.label}
          </div>
        ))}
      </motion.div>

      {/* Isometric SVG Scene */}
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }} style={{ position: "relative", zIndex: 10 }}>
        <svg viewBox="-400 -220 800 440" width={800} height={440} style={{ maxWidth: "90vw", overflow: "visible" }}>
          <defs>
            <filter id="glow-teal"><feGaussianBlur stdDeviation="4" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
          </defs>
          <IsometricGrid />
          <ellipse cx={0} cy={120} rx={350} ry={60} fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />

          {/* Kasa Üretim — clickable */}
          <g
            style={{ cursor: "pointer" }}
            onClick={onKasaClick}
            onMouseEnter={() => { setHovered("kasa"); setKasaGlow(true); }}
            onMouseLeave={() => { setHovered(null); setKasaGlow(false); }}
          >
            <IsometricBuilding label="Kasa Üretim" sublabel="Production Intelligence" x={-180} y={30} width={100} height={70} depth={80} roofColor="#1e293b" wallLeftColor="#1a2332" wallRightColor="#151d2b" accentColor="#38bdf8" hovered={hovered === "kasa"} onHover={() => {}} onLeave={() => {}} chimneyX={-20} windowConfig={{ x: -48, y: -12, cols: 4, rows: 2 }} statusDotOffset={{ x: 50, y: -48 }} />
            {/* Clickable glow overlay */}
            {kasaGlow && <ellipse cx={-180} cy={105} rx={80} ry={25} fill="rgba(56,189,248,0.06)" style={{ filter: "blur(16px)", pointerEvents: "none" }} />}
          </g>

          <FlowArrow x1={-100} y1={40} x2={40} y2={10} />

          {/* Ana Fabrika & Montaj */}
          <IsometricBuilding label="Ana Fabrika & Montaj" sublabel="Workforce Scheduling" x={140} y={0} width={140} height={90} depth={100} roofColor="#1e293b" wallLeftColor="#1a2332" wallRightColor="#151d2b" accentColor="#8b5cf6" hovered={hovered === "fabrika"} onHover={() => setHovered("fabrika")} onLeave={() => setHovered(null)} chimneyX={30} windowConfig={{ x: -60, y: -25, cols: 5, rows: 3 }} statusDotOffset={{ x: 72, y: -60 }} />

          {/* Yönetim */}
          <IsometricBuilding label="Yönetim" sublabel="Financial Simulation" x={260} y={-100} width={70} height={50} depth={55} roofColor="#1e293b" wallLeftColor="#1f2937" wallRightColor="#1a2332" accentColor="#f59e0b" hovered={hovered === "yonetim"} onHover={() => setHovered("yonetim")} onLeave={() => setHovered(null)} windowConfig={{ x: -28, y: -5, cols: 3, rows: 2 }} statusDotOffset={{ x: 34, y: -35 }} />

          {/* Labels */}
          <text x={-180} y={115} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">Kasa Üretim</text>
          <text x={140} y={105} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">Ana Fabrika & Montaj</text>
          <text x={260} y={-10} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">Yönetim</text>
        </svg>
      </motion.div>

      {/* ── Overlay indicators under SVG ── */}
      <div style={{ position: "relative", zIndex: 20, display: "flex", justifyContent: "center", gap: 80, marginTop: -12, width: "100%", maxWidth: 800, padding: "0 20px" }}>

        {/* Kasa Üretim indicator */}
        <div
          onClick={onKasaClick}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "6px 14px", borderRadius: 12, border: "1px solid rgba(56,189,248,0.15)", background: "rgba(56,189,248,0.04)", transition: "all 0.3s ease" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(56,189,248,0.1)"; e.currentTarget.style.borderColor = "rgba(56,189,248,0.35)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(56,189,248,0.04)"; e.currentTarget.style.borderColor = "rgba(56,189,248,0.15)"; }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.ok, display: "inline-block", boxShadow: `0 0 6px ${C.ok}`, animation: "pulse-dot 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 10, color: C.ok, fontWeight: 600, letterSpacing: "0.04em" }}>Canlı Veri</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 2 }}>↓</span>
        </div>

        {/* Ana Fabrika badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px" }}>
          <span style={{ fontSize: 9, color: C.dim, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>Yakında</span>
        </div>

        {/* Yönetim badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px" }}>
          <span style={{ fontSize: 9, color: C.dim, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>Yakında</span>
        </div>
      </div>

      {/* Scroll hint */}
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.5 }} style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 24, letterSpacing: "0.04em", position: "relative", zIndex: 10 }}>
        Kasa Üretim'e tıklayarak dashboard'a geçin
      </motion.p>

      {/* Pulse keyframes */}
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.4); } }`}</style>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

/* Dashboard data types — populated from API */
interface LineSummary {
  id: number;
  name: string;
  type: string;
  workerCount: number;
  capacityUnitTimeMin: string;
  currentUnitTimeMin: string;
  totalOutput: number;
  theoreticalMax: number;
  utilizationPct: number;
}
interface DashboardData {
  totalProduction: number;
  lines: LineSummary[];
  monthlyData: { ay: string; e: number; g: number }[];
  weeklySchedules: {
    elektrikli: { h: string; plan: number; gercek: number }[];
    gazli: { h: string; plan: number; gercek: number }[];
  };
  peakMonth: { ay: string; total: number };
}

const produktElektrik = [
  { name: "GSS20P", pct: 34 }, { name: "GSS40P", pct: 18 }, { name: "GSN20/40", pct: 15 },
  { name: "GSA Serisi", pct: 12 }, { name: "GSU15/20", pct: 11 }, { name: "Diğer", pct: 10 },
];
const produktGaz = [
  { name: "ELT.7-11", pct: 38 }, { name: "CC.7-11", pct: 20 }, { name: "CPH.33", pct: 16 },
  { name: "BH 55", pct: 10 }, { name: "SSP 40/60", pct: 9 }, { name: "Diğer", pct: 7 },
];

const customers = [
  { flag: "\u{1F1F3}\u{1F1F1}", country: "Hollanda", name: "Infrarod Techniek" },
  { flag: "\u{1F1EE}\u{1F1EA}", country: "\u0130rlanda", name: "Harold Engineering" },
  { flag: "\u{1F1EC}\u{1F1F7}", country: "Yunanistan", name: "Mathioudakis" },
  { flag: "\u{1F1F0}\u{1F1FF}", country: "Kazakistan", name: "Jakko Aktobe" },
  { flag: "\u{1F1E6}\u{1F1FF}", country: "Azerbaycan", name: "Met-AK LLC" },
  { flag: "\u{1F1E9}\u{1F1EA}", country: "Almanya", name: "Fuar" },
  { flag: "\u{1F1F9}\u{1F1F7}", country: "T\u00FCrkiye", name: "Bauhaus + Avrupa Is\u0131 + Sovo" },
];

function Ring({ pct, color, size = 120, stroke = 10 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${color}55)`, transition: "stroke-dashoffset 1s ease" }} />
    </svg>
  );
}

function DeliveryBar({ delivered, total, color, label }: { delivered: number; total: number; color: string; label: string }) {
  const pct = Math.round((delivered / total) * 100);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: sans, fontSize: 13, color: C.mid }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 13, color: C.white }}>{fmt(delivered)}/{fmt(total)}</span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 1s ease" }} />
      </div>
      <div style={{ textAlign: "right", marginTop: 4 }}><span style={{ fontFamily: mono, fontSize: 12, color }}>{pct}%</span></div>
    </div>
  );
}

function ProductMix({ items, color }: { items: { name: string; pct: number }[]; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (
        <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: sans, fontSize: 12, color: C.mid, width: 80, textAlign: "right", flexShrink: 0 }}>{it.name}</span>
          <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.03)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
            <div style={{ width: `${it.pct}%`, height: "100%", background: color, borderRadius: 4, opacity: 0.7, transition: "width 1s ease" }} />
          </div>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.white, width: 36, textAlign: "right" }}>{it.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function PillTabs({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, gap: 2 }}>
      {tabs.map((t, i) => (
        <button key={t} onClick={() => onChange(i)} style={{
          fontFamily: sans, fontSize: 13, fontWeight: 500, padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
          background: active === i ? "rgba(255,255,255,0.08)" : "transparent", color: active === i ? C.white : C.dim, transition: "all 0.2s",
        }}>{t}</button>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(8,8,12,0.92)", backdropFilter: "blur(12px)", border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: "10px 14px", fontFamily: sans, fontSize: 12 }}>
      <div style={{ color: C.white, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span style={{ color: C.mid }}>{p.name}:</span>
          <span style={{ color: C.white, fontFamily: mono }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function CukurovaOverview() {
  const [, navigate] = useLocation();
  const [chartTab, setChartTab] = useState(0);
  const [weeklyLine, setWeeklyLine] = useState<"e" | "g">("e");
  const [produktTab, setProduktTab] = useState<"e" | "g">("e");
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!document.querySelector('link[href*="DM+Sans"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
    const t = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/v1/dashboard/summary")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: 20, ...extra,
  });

  // Derive from API data
  const elektrikLine = data?.lines.find((l) => l.type === "elektrikli");
  const gazliLine = data?.lines.find((l) => l.type === "gazli");
  const monthlyData = data?.monthlyData || [];
  const weeklyElektrik = data?.weeklySchedules.elektrikli || [];
  const weeklyGaz = data?.weeklySchedules.gazli || [];

  const weeklyData = weeklyLine === "e" ? weeklyElektrik : weeklyGaz;
  const lineColor = weeklyLine === "e" ? C.elektrik : C.gaz;

  const scrollToDashboard = () => {
    document.getElementById("operations-dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>

      {/* ⚠️ DOKUNMA — İzometrik tesis görünümü sabit kalacak. Silme, değiştirme, üzerine yazma. */}
      <IsometricScene onKasaClick={scrollToDashboard} />

      {/* ════ OPERATIONS DASHBOARD ════ */}
      <div
        id="operations-dashboard"
        style={{
          maxWidth: 1200, margin: "0 auto", padding: "48px 24px 60px",
          fontFamily: sans, color: C.white,
          opacity: ready ? 1 : 0, transition: "opacity 0.6s ease",
        }}
      >

        {/* ════ HEADER ════ */}
        <header style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: sans, fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Çukurova Isı Sistemleri</h1>
              <p style={{ fontFamily: sans, fontSize: 13, color: C.dim, margin: "4px 0 0", letterSpacing: "0.02em" }}>Operations Intelligence — 2025 Üretim Verileri</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", fontSize: 12, fontWeight: 600, color: C.ok }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.ok, display: "inline-block", boxShadow: `0 0 6px ${C.ok}` }} />
                Canlı Pilot
              </span>
              <button onClick={() => navigate("/cukurova-sim")} style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 20,
                background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.25)",
                fontSize: 12, fontWeight: 600, color: C.elektrik, cursor: "pointer", fontFamily: sans,
                transition: "all 0.2s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(129,140,248,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(129,140,248,0.08)"; }}
              >
                Simülasyon →
              </button>
              {["Kapasite", "Üretim", "Netsis"].map((s) => (
                <span key={s} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: "rgba(255,255,255,0.04)", color: C.dim, border: `1px solid ${C.cardBorder}` }}>{s}</span>
              ))}
            </div>
          </div>
        </header>

        {/* ════ METRIC CARDS ════ */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: C.dim, fontSize: 14 }}>Veriler yükleniyor...</div>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Toplam Üretim", value: data?.totalProduction || 0, sub: "2025 YTD", color: C.white },
            { label: "Elektrikli Hat", value: elektrikLine?.totalOutput || 0, sub: `${elektrikLine?.workerCount || 0} çalışan`, color: C.elektrik },
            { label: "Gazlı Hat", value: gazliLine?.totalOutput || 0, sub: `${gazliLine?.workerCount || 0} çalışan`, color: C.gaz },
            { label: "Pik Ay", value: data?.peakMonth.total || 0, sub: `${data?.peakMonth.ay || ""} 2025`, color: C.warn },
          ].map((m) => (
            <div key={m.label} style={card()}>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 8, fontWeight: 500 }}>{m.label}</div>
              <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: m.color, lineHeight: 1 }}>{fmt(m.value)}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>{m.sub}</div>
            </div>
          ))}
        </div>
        )}

        {/* ════ CAPACITY + DELIVERY ROW ════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
          <div style={card()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Kapasite Kullanımı</div>
            <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 20 }}>
              {[
                { label: "Elektrikli", pct: elektrikLine?.utilizationPct || 0, color: C.elektrik, workers: elektrikLine?.workerCount || 0, capMin: `${elektrikLine?.capacityUnitTimeMin || "0"}dk`, actMin: `${elektrikLine?.currentUnitTimeMin || "0"}dk` },
                { label: "Gazlı", pct: gazliLine?.utilizationPct || 0, color: C.gaz, workers: gazliLine?.workerCount || 0, capMin: `${gazliLine?.capacityUnitTimeMin || "0"}dk`, actMin: `${gazliLine?.currentUnitTimeMin || "0"}dk` },
              ].map((h) => (
                <div key={h.label} style={{ textAlign: "center" }}>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <Ring pct={h.pct} color={h.color} />
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(0deg)" }}>
                      <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: h.color }}>{h.pct}%</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: h.color }}>{h.label}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{h.workers} çalışan</div>
                  <div style={{ fontSize: 11, color: C.dim }}>Kapasite: {h.capMin}/birim</div>
                  <div style={{ fontSize: 11, color: C.dim }}>Mevcut: {h.actMin}/birim</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card({ flex: 1 })}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Teslimat Oranları</div>
              <div style={{ display: "flex", gap: 20 }}>
                <DeliveryBar delivered={weeklyElektrik.reduce((s, w) => s + w.gercek, 0)} total={weeklyElektrik.reduce((s, w) => s + w.plan, 0)} color={C.elektrik} label="Elektrikli" />
                <DeliveryBar delivered={weeklyGaz.reduce((s, w) => s + w.gercek, 0)} total={weeklyGaz.reduce((s, w) => s + w.plan, 0)} color={C.gaz} label="Gazlı" />
              </div>
            </div>
            <div style={{ ...card(), background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.15)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.warn, marginBottom: 4 }}>Darboğaz Uyarısı</div>
                  <p style={{ fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6 }}>Elektrikli hatta birim üretim süresi kapasiteden %{elektrikLine ? Math.round(((Number(elektrikLine.currentUnitTimeMin) - Number(elektrikLine.capacityUnitTimeMin)) / Number(elektrikLine.capacityUnitTimeMin)) * 100) : 0} yavaş ({elektrikLine?.currentUnitTimeMin || 0}dk vs {elektrikLine?.capacityUnitTimeMin || 0}dk). H47–H50 arası sevk oranı kritik düşüş gösteriyor.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════ CHARTS ════ */}
        <div style={card({ marginBottom: 24 })}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <PillTabs tabs={["Aylık Üretim", "Haftalık Plan vs Gerçek"]} active={chartTab} onChange={setChartTab} />
            {chartTab === 1 && (
              <PillTabs tabs={["Elektrikli", "Gazlı"]} active={weeklyLine === "e" ? 0 : 1} onChange={(i) => setWeeklyLine(i === 0 ? "e" : "g")} />
            )}
          </div>
          <div style={{ width: "100%", height: 320 }}>
            {chartTab === 0 ? (
              <ResponsiveContainer>
                <BarChart data={monthlyData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="ay" tick={{ fill: C.dim, fontSize: 11, fontFamily: sans }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="e" name="Elektrikli" fill={C.elektrik} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="g" name="Gazlı" fill={C.gaz} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="gradPlan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradGercek" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.ok} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={C.ok} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="h" tick={{ fill: C.dim, fontSize: 11, fontFamily: sans }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 11, fontFamily: mono }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="plan" name="Plan" stroke={lineColor} fill="url(#gradPlan)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="gercek" name="Gerçek" stroke={C.ok} fill="url(#gradGercek)" strokeWidth={2} dot={false} />
                  <Legend verticalAlign="top" align="right" height={36} formatter={(value: string) => <span style={{ color: C.mid, fontSize: 12, fontFamily: sans }}>{value}</span>} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ════ PRODUCT MIX ════ */}
        <div style={card({ marginBottom: 24 })}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Ürün Karması</div>
            <PillTabs tabs={["Elektrikli", "Gazlı"]} active={produktTab === "e" ? 0 : 1} onChange={(i) => setProduktTab(i === 0 ? "e" : "g")} />
          </div>
          <ProductMix items={produktTab === "e" ? produktElektrik : produktGaz} color={produktTab === "e" ? C.elektrik : C.gaz} />
        </div>

        {/* ════ INTERNATIONAL CUSTOMERS ════ */}
        <div style={card({ marginBottom: 24 })}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Uluslararası Müşteriler</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {customers.map((c) => (
              <div key={c.name} style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.cardBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>{c.flag}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{c.country}</div>
                  <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.3 }}>{c.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ════ FOOTER ════ */}
        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 20, borderTop: `1px solid ${C.cardBorder}`, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.dim }}>Griseus × Çukurova Isı A.Ş.</span>
          <span style={{ fontSize: 12, color: C.dim }}>Faz 2 Pilot · Operations Intelligence Platform</span>
        </footer>
      </div>
    </div>
  );
}
