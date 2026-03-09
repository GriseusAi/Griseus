import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Factory, Users, DollarSign, TrendingUp, Clock, Zap, AlertTriangle,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Play, RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

// ── Static Data ─────────────────────────────────────────────────────────

const PRODUCTION_LINES = [
  { id: "L1", name: "Line 1 — Kombi Assembly", product: "Wall-hung Boilers", capacity: 120, status: "running" as const },
  { id: "L2", name: "Line 2 — Heat Exchanger", product: "Plate Heat Exchangers", capacity: 80, status: "running" as const },
  { id: "L3", name: "Line 3 — Panel Radiator", product: "Steel Panel Radiators", capacity: 200, status: "maintenance" as const },
  { id: "L4", name: "Line 4 — Expansion Tank", product: "Expansion Vessels", capacity: 300, status: "running" as const },
];
const DAILY_OUTPUT = [
  { day: "Mon", target: 700, actual: 665 }, { day: "Tue", target: 700, actual: 712 },
  { day: "Wed", target: 700, actual: 688 }, { day: "Thu", target: 700, actual: 735 },
  { day: "Fri", target: 700, actual: 698 }, { day: "Sat", target: 350, actual: 341 },
  { day: "Sun", target: 0, actual: 0 },
];
const OPERATORS = [
  { id: "O1", name: "Ahmet Yıldız", line: "L1", shift: "morning", skills: ["welding","assembly","testing"], utilization: 92 },
  { id: "O2", name: "Fatma Demir", line: "L1", shift: "morning", skills: ["assembly","quality"], utilization: 88 },
  { id: "O3", name: "Mehmet Kaya", line: "L2", shift: "morning", skills: ["welding","brazing","testing"], utilization: 95 },
  { id: "O4", name: "Ayşe Çelik", line: "L2", shift: "afternoon", skills: ["assembly","packaging"], utilization: 78 },
  { id: "O5", name: "Hasan Arslan", line: "L3", shift: "morning", skills: ["press-op","welding","painting"], utilization: 0 },
  { id: "O6", name: "Elif Şahin", line: "L3", shift: "morning", skills: ["quality","testing","painting"], utilization: 0 },
  { id: "O7", name: "Ali Öztürk", line: "L4", shift: "morning", skills: ["welding","assembly"], utilization: 85 },
  { id: "O8", name: "Zeynep Koç", line: "L4", shift: "afternoon", skills: ["assembly","testing","packaging"], utilization: 91 },
  { id: "O9", name: "Emre Aydın", line: "L1", shift: "afternoon", skills: ["welding","testing"], utilization: 82 },
  { id: "O10", name: "Deniz Yılmaz", line: "L4", shift: "morning", skills: ["press-op","welding","assembly"], utilization: 87 },
  { id: "O11", name: "Selin Aksoy", line: "L2", shift: "afternoon", skills: ["quality","testing"], utilization: 76 },
  { id: "O12", name: "Burak Güneş", line: "L1", shift: "morning", skills: ["assembly","brazing","testing"], utilization: 90 },
];
const SHIFTS = [
  { name: "Morning", time: "06:00–14:00", color: "#3B82F6" },
  { name: "Afternoon", time: "14:00–22:00", color: "#8B5CF6" },
  { name: "Night", time: "22:00–06:00", color: "#6B7280" },
];
const SHIFT_CALENDAR = [
  { day: "Mon", morning: 6, afternoon: 4, night: 2 },
  { day: "Tue", morning: 6, afternoon: 4, night: 2 },
  { day: "Wed", morning: 5, afternoon: 5, night: 2 },
  { day: "Thu", morning: 6, afternoon: 4, night: 2 },
  { day: "Fri", morning: 6, afternoon: 4, night: 2 },
  { day: "Sat", morning: 4, afternoon: 2, night: 0 },
  { day: "Sun", morning: 0, afternoon: 0, night: 0 },
];
const ALL_SKILLS = ["welding","brazing","assembly","testing","quality","press-op","painting","packaging"];

// ── Isometric Projection Helpers ────────────────────────────────────────

const COS30 = Math.cos(Math.PI / 6); // 0.866
const SIN30 = Math.sin(Math.PI / 6); // 0.5

function isoX(x: number, y: number): number { return (x - y) * COS30; }
function isoY(x: number, y: number, z: number = 0): number { return (x + y) * SIN30 - z; }

/** Compute the 4 corner points of an isometric parallelogram top face */
function isoParallelogram(cx: number, cy: number, w: number, d: number, z: number): string {
  // 4 corners of a rectangle in world space, projected to iso
  const hw = w / 2, hd = d / 2;
  const corners = [
    [cx + isoX(-hw, -hd), cy + isoY(-hw, -hd, z)], // left
    [cx + isoX(hw, -hd),  cy + isoY(hw, -hd, z)],  // top
    [cx + isoX(hw, hd),   cy + isoY(hw, hd, z)],    // right
    [cx + isoX(-hw, hd),  cy + isoY(-hw, hd, z)],   // bottom
  ];
  return corners.map(c => `${c[0]},${c[1]}`).join(" ");
}

/** Left side face of iso platform */
function isoLeftFace(cx: number, cy: number, w: number, d: number, z: number, h: number): string {
  const hw = w / 2, hd = d / 2;
  return [
    [cx + isoX(-hw, -hd), cy + isoY(-hw, -hd, z)],
    [cx + isoX(-hw, hd),  cy + isoY(-hw, hd, z)],
    [cx + isoX(-hw, hd),  cy + isoY(-hw, hd, z - h)],
    [cx + isoX(-hw, -hd), cy + isoY(-hw, -hd, z - h)],
  ].map(c => `${c[0]},${c[1]}`).join(" ");
}

/** Right side face of iso platform */
function isoRightFace(cx: number, cy: number, w: number, d: number, z: number, h: number): string {
  const hw = w / 2, hd = d / 2;
  return [
    [cx + isoX(-hw, hd),  cy + isoY(-hw, hd, z)],
    [cx + isoX(hw, hd),   cy + isoY(hw, hd, z)],
    [cx + isoX(hw, hd),   cy + isoY(hw, hd, z - h)],
    [cx + isoX(-hw, hd),  cy + isoY(-hw, hd, z - h)],
  ].map(c => `${c[0]},${c[1]}`).join(" ");
}

/** Point on iso platform surface */
function isoPoint(cx: number, cy: number, gx: number, gy: number, z: number): [number, number] {
  return [cx + isoX(gx, gy), cy + isoY(gx, gy, z)];
}

// ── Micro Cube for Data Floor ───────────────────────────────────────────

function MicroCube({ cx, cy, w, h, topColor, leftColor, rightColor }: {
  cx: number; cy: number; w: number; h: number; topColor: string; leftColor: string; rightColor: string;
}) {
  const hw = w / 2;
  const top = [
    `${cx},${cy - h}`,
    `${cx + hw * COS30},${cy - h + hw * SIN30}`,
    `${cx},${cy - h + hw}`,
    `${cx - hw * COS30},${cy - h + hw * SIN30}`,
  ].join(" ");
  const left = [
    `${cx - hw * COS30},${cy - h + hw * SIN30}`,
    `${cx},${cy - h + hw}`,
    `${cx},${cy}`,
    `${cx - hw * COS30},${cy + hw * SIN30 - h + hw}`,
  ].join(" ");
  const right = [
    `${cx + hw * COS30},${cy - h + hw * SIN30}`,
    `${cx},${cy - h + hw}`,
    `${cx},${cy}`,
    `${cx + hw * COS30},${cy + hw * SIN30 - h + hw}`,
  ].join(" ");
  return (
    <g>
      <polygon points={left} fill={leftColor} />
      <polygon points={right} fill={rightColor} />
      <polygon points={top} fill={topColor} />
    </g>
  );
}

// ── Animated Particle on a path ─────────────────────────────────────────

function PathParticle({ x1, y1, x2, y2, color, dur, delay, r = 2.5 }: {
  x1: number; y1: number; x2: number; y2: number; color: string; dur: number; delay: number; r?: number;
}) {
  return (
    <circle r={r} fill={color} opacity={0}>
      <animate attributeName="cx" values={`${x1};${x2}`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="cy" values={`${y1};${y2}`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0;0.8;0.8;0" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
    </circle>
  );
}

// ── "fx" Badge on connection midpoint ───────────────────────────────────

function FxBadge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 10} y={y - 7} width={20} height={14} rx={4} fill="#0d1520" stroke="#14b8a6" strokeWidth={0.7} opacity={0.8} />
      <text x={x} y={y + 3} textAnchor="middle" fill="#14b8a6" fontSize={7} fontWeight={700} fontFamily="'JetBrains Mono', monospace" opacity={0.7}>fx</text>
    </g>
  );
}

// ── Ontology Object Node ────────────────────────────────────────────────

function OntologyNode({ x, y, label, icon, glowColor = "#14b8a6", pulse = false, alert = false }: {
  x: number; y: number; label: string; icon: string; glowColor?: string; pulse?: boolean; alert?: boolean;
}) {
  const r = 28;
  return (
    <g>
      {/* Outer glow */}
      <circle cx={x} cy={y} r={r + 8} fill={glowColor} opacity={0.04} style={{ filter: "blur(8px)" }} />
      {/* Main circle */}
      <circle cx={x} cy={y} r={r} fill="#0d1520" stroke={glowColor} strokeWidth={1.5} opacity={0.9}>
        {pulse && <animate attributeName="stroke-opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />}
      </circle>
      {/* Inner subtle glow */}
      <circle cx={x} cy={y} r={r - 4} fill={glowColor} opacity={0.03} />
      {/* Icon text (emoji placeholder for SVG simplicity) */}
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={16} opacity={0.7}>
        {icon}
      </text>
      {/* Label */}
      <text x={x} y={y + r + 14} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={9} fontWeight={600} fontFamily="system-ui, sans-serif">
        {label}
      </text>
      {/* Alert badge */}
      {alert && (
        <g>
          <circle cx={x + r * 0.7} cy={y - r * 0.7} r={7} fill="#ef4444">
            <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <text x={x + r * 0.7} y={y - r * 0.7 + 3.5} textAnchor="middle" fill="white" fontSize={8} fontWeight={800}>!</text>
        </g>
      )}
    </g>
  );
}

// ── Circuit-Board Connection (L-shaped routing) ─────────────────────────

function CircuitConnection({ x1, y1, x2, y2, color = "#14b8a6", opacity: op = 0.15, strokeWidth: sw = 1, dashed = false, particleColor, particleDur = 3, showFx = true }: {
  x1: number; y1: number; x2: number; y2: number; color?: string; opacity?: number; strokeWidth?: number; dashed?: boolean; particleColor?: string; particleDur?: number; showFx?: boolean;
}) {
  // L-shaped routing: go horizontal first, then vertical
  const mx = x2;
  const my = y1;
  const pathD = `M${x1},${y1} L${mx},${my} L${x2},${y2}`;
  const midX = (x1 + mx) / 2;
  const midY = (my + y2) / 2;
  const fxX = (mx + x1) / 2;
  const fxY = y1;

  return (
    <g>
      <path d={pathD} fill="none" stroke={color} strokeWidth={sw} opacity={op} strokeDasharray={dashed ? "4 3" : "none"} />
      {/* Particle along horizontal segment */}
      {particleColor && (
        <>
          <PathParticle x1={x1} y1={y1} x2={mx} y2={my} color={particleColor} dur={particleDur * 0.6} delay={Math.random() * 2} r={2} />
          <PathParticle x1={mx} y1={my} x2={x2} y2={y2} color={particleColor} dur={particleDur * 0.4} delay={particleDur * 0.6 + Math.random()} r={2} />
        </>
      )}
      {showFx && <FxBadge x={fxX} y={fxY} />}
    </g>
  );
}

// ── Floating Action Card ────────────────────────────────────────────────

function FloatingCard({ x, y, width, height, borderColor, title, rows, buttonText, buttonColor, targetX, targetY, particleColor, animDelay = 0 }: {
  x: number; y: number; width: number; height: number; borderColor: string; title: string; rows: string[]; buttonText: string; buttonColor: string; targetX: number; targetY: number; particleColor: string; animDelay?: number;
}) {
  const cardStyle: React.CSSProperties = {
    transform: "perspective(800px) rotateX(12deg) rotateY(-8deg)",
    transformOrigin: "center bottom",
  };

  return (
    <g>
      {/* Connection line from card to platform object */}
      <line x1={x + width / 2} y1={y + height + 4} x2={targetX} y2={targetY} stroke={borderColor} strokeWidth={0.7} opacity={0.2} strokeDasharray="3 3" />
      <PathParticle x1={x + width / 2} y1={y + height} x2={targetX} y2={targetY} color={particleColor} dur={2.5} delay={animDelay} r={2} />
      <PathParticle x1={x + width / 2} y1={y + height} x2={targetX} y2={targetY} color={particleColor} dur={2.5} delay={animDelay + 1.2} r={1.5} />

      {/* Card shadow */}
      <rect x={x + 3} y={y + 3} width={width} height={height} rx={8} fill="black" opacity={0.3} style={{ filter: "blur(6px)" }} />

      {/* Card body — we use SVG foreignObject for CSS transform */}
      <foreignObject x={x - 4} y={y - 4} width={width + 8} height={height + 8}>
        <div style={cardStyle}>
          <div style={{
            width, height, borderRadius: 8, background: "#0d1117",
            border: `1.5px solid ${borderColor}`, padding: "10px 12px",
            display: "flex", flexDirection: "column", gap: 3,
            boxShadow: `0 0 20px ${borderColor}22`,
          }}>
            <div style={{ color: borderColor, fontSize: 10, fontWeight: 700, fontFamily: "system-ui, sans-serif", letterSpacing: "0.04em" }}>
              {title}
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ color: "rgba(255,255,255,0.45)", fontSize: 8.5, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.4 }}>
                {r}
              </div>
            ))}
            <div style={{
              marginTop: "auto", padding: "4px 10px", borderRadius: 4,
              background: `${buttonColor}18`, border: `1px solid ${buttonColor}40`,
              color: buttonColor, fontSize: 8, fontWeight: 700, fontFamily: "system-ui, sans-serif",
              textAlign: "center", cursor: "pointer", letterSpacing: "0.03em",
            }}>
              {buttonText}
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ██ PRODUCTION INTELLIGENCE — Full Palantir Isometric Canvas            ██
// ══════════════════════════════════════════════════════════════════════════

function ProductionIntelligence() {
  const { data: factories } = useQuery<any[]>({
    queryKey: ["/api/ontology/objects/factory"],
    retry: 1, staleTime: 60000,
  });
  const factoryId = factories?.[0]?.id;
  const { data: intelligence } = useQuery<any>({
    queryKey: ["/api/ontology/intelligence/factory/" + factoryId],
    enabled: !!factoryId, refetchInterval: 30000, retry: 1, staleTime: 15000,
  });

  const summary = intelligence?.summary || {};
  const totalActual = DAILY_OUTPUT.reduce((s, d) => s + d.actual, 0);
  const totalTarget = DAILY_OUTPUT.reduce((s, d) => s + d.target, 0);
  const fulfillment = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
  const activeLines = PRODUCTION_LINES.filter(l => l.status === "running").length;
  const avgUtil = summary.overallUtilization || 86;

  // ── Canvas dimensions and center ──
  const W = 1400, H = 1000;
  const CX = 580, CY = 520; // center point offset left to leave room for right panel

  // ── Platform Z levels ──
  const Z_DATA = 0;
  const Z_GOV = 80;
  const Z_ONTO = 200;

  // ── Ontology object positions on platform (grid coords) ──
  const objs = {
    fabrika:   isoPoint(CX, CY, 0, 0, Z_ONTO),
    lokasyon:  isoPoint(CX, CY, -180, 0, Z_ONTO),
    tedarikci: isoPoint(CX, CY, -300, -60, Z_ONTO),
    hat1:      isoPoint(CX, CY, -120, -140, Z_ONTO),
    hat2:      isoPoint(CX, CY, 0, -160, Z_ONTO),
    hat3:      isoPoint(CX, CY, 140, -140, Z_ONTO),
    hat4:      isoPoint(CX, CY, 260, -100, Z_ONTO),
    operator:  isoPoint(CX, CY, 200, 60, Z_ONTO),
    siparis:   isoPoint(CX, CY, -40, 140, Z_ONTO),
    bakim:     isoPoint(CX, CY, 260, -20, Z_ONTO),
  };

  // Seasonal months
  const months = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

  return (
    <div style={{ background: "#000000", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* CSS Keyframes */}
      <style>{`
        @keyframes pulse-red { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes pulse-teal { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }
        @keyframes float-card { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes data-rise { 0% { opacity: 0; } 20% { opacity: 0.6; } 80% { opacity: 0.6; } 100% { opacity: 0; } }
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
      `}</style>

      {/* ═══ KPI STRIP ═══ */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid #0d1520" }}>
        {[
          { label: "Üretim", value: `${totalActual.toLocaleString()} ünite`, sub: `hedefin %${fulfillment}'i`, color: "#14b8a6" },
          { label: "Hatlar", value: `${activeLines}/${PRODUCTION_LINES.length} hat`, sub: "1 bakımda", color: "#f59e0b" },
          { label: "Verimlilik", value: `%${avgUtil}`, sub: "ort. operatör", color: "#14b8a6" },
          { label: "Vardiyada", value: `${OPERATORS.filter(o => o.shift === "morning").length}`, sub: "sabah vardiyası", color: "#14b8a6" },
        ].map(kpi => (
          <div key={kpi.label} style={{ flex: 1, background: "#060810", border: "1px solid #111827", borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "white", fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: kpi.color }} />
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{kpi.label} · {kpi.sub}</div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#14b8a6", letterSpacing: "0.1em" }}>LIVE</span>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", animation: "pulse-teal 2s infinite" }} />
        </div>
      </div>

      {/* ═══ MAIN CANVAS + RIGHT PANEL ═══ */}
      <div style={{ display: "flex", position: "relative" }}>

        {/* ══ SVG CANVAS ══ */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
            <defs>
              {/* Dot grid pattern */}
              <pattern id="bg-dots" width={28} height={28} patternUnits="userSpaceOnUse">
                <circle cx={14} cy={14} r={0.8} fill="rgba(255,255,255,0.02)" />
              </pattern>
              {/* Teal glow filter */}
              <filter id="glow-teal" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="15" result="blur" />
                <feFlood floodColor="#14b8a6" floodOpacity="0.2" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* Red glow filter */}
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="10" result="blur" />
                <feFlood floodColor="#ef4444" floodOpacity="0.15" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* Circuit grid pattern for ontology platform */}
              <pattern id="circuit-grid" width={60} height={60} patternUnits="userSpaceOnUse">
                <line x1={0} y1={30} x2={60} y2={30} stroke="#14b8a6" strokeWidth={0.5} opacity={0.03} />
                <line x1={30} y1={0} x2={30} y2={60} stroke="#14b8a6" strokeWidth={0.5} opacity={0.03} />
                <rect x={28} y={28} width={4} height={4} fill="#14b8a6" opacity={0.04} transform="rotate(45 30 30)" />
              </pattern>
            </defs>

            {/* Background */}
            <rect width={W} height={H} fill="url(#bg-dots)" />

            {/* ════════════════════════════════════════════════════════ */}
            {/* LAYER 1: ENTERPRISE DATA PLATFORM (z=0)                */}
            {/* ════════════════════════════════════════════════════════ */}
            <g>
              {/* Top face */}
              <polygon points={isoParallelogram(CX, CY + 120, 600, 260, Z_DATA)} fill="#0a0f1a" stroke="#1e3a5f" strokeWidth={1} opacity={0.8} />
              {/* Left side face */}
              <polygon points={isoLeftFace(CX, CY + 120, 600, 260, Z_DATA, 40)} fill="#060b14" stroke="#1e3a5f" strokeWidth={0.5} opacity={0.8} />
              {/* Right side face */}
              <polygon points={isoRightFace(CX, CY + 120, 600, 260, Z_DATA, 40)} fill="#04080f" stroke="#1e3a5f" strokeWidth={0.5} opacity={0.8} />

              {/* Micro-cube grid on top face (8x5 = 40 cubes) */}
              {Array.from({ length: 8 }, (_, col) =>
                Array.from({ length: 5 }, (_, row) => {
                  const gx = -180 + col * 52;
                  const gy = -80 + row * 40;
                  const [px, py] = isoPoint(CX, CY + 120, gx, gy, Z_DATA + 2);
                  const colorIdx = (col + row) % 3;
                  const tops = ["#0d2d2d", "#0d1a2d", "#1a0d2d"];
                  const lefts = ["#082020", "#081218", "#120818"];
                  const rights = ["#061818", "#060e14", "#0e0614"];
                  return (
                    <MicroCube key={`mc${col}-${row}`} cx={px} cy={py} w={32} h={12}
                      topColor={tops[colorIdx]} leftColor={lefts[colorIdx]} rightColor={rights[colorIdx]} />
                  );
                })
              )}

              {/* Side label */}
              {(() => {
                const [lx, ly] = isoPoint(CX, CY + 120, -300, -100, Z_DATA - 20);
                return (
                  <text x={lx + 10} y={ly + 20} fill="#4a7fa5" fontSize={8} fontWeight={600} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.12em" opacity={0.6}
                    transform={`rotate(-26 ${lx + 10} ${ly + 20})`}>
                    VERİ KAYNAKLARI · MANTIK · AKSİYON
                  </text>
                );
              })()}

              {/* Data-rise particles from Layer 1 upward */}
              {[0, 1, 2, 3, 4].map(i => {
                const gx = -100 + i * 60;
                const [bx, by] = isoPoint(CX, CY + 120, gx, 0, Z_DATA);
                const [tx, ty] = isoPoint(CX, CY, gx * 0.6, 0, Z_ONTO);
                return <PathParticle key={`rise${i}`} x1={bx} y1={by} x2={tx} y2={ty} color="#14b8a6" dur={4} delay={i * 0.8} r={1.5} />;
              })}
            </g>

            {/* ════════════════════════════════════════════════════════ */}
            {/* LAYER 2: GOVERNANCE PLATFORM (z=80)                    */}
            {/* ════════════════════════════════════════════════════════ */}
            <g>
              <polygon points={isoParallelogram(CX, CY + 60, 500, 200, Z_GOV)} fill="#080c14" stroke="#1e3a5f" strokeWidth={0.7} opacity={0.7} />
              <polygon points={isoLeftFace(CX, CY + 60, 500, 200, Z_GOV, 25)} fill="#060a12" stroke="#1e3a5f" strokeWidth={0.3} opacity={0.7} />
              <polygon points={isoRightFace(CX, CY + 60, 500, 200, Z_GOV, 25)} fill="#040810" stroke="#1e3a5f" strokeWidth={0.3} opacity={0.7} />

              {/* Dot pattern overlay (simulated with circles) */}
              {Array.from({ length: 12 }, (_, col) =>
                Array.from({ length: 5 }, (_, row) => {
                  const gx = -180 + col * 36;
                  const gy = -60 + row * 30;
                  const [px, py] = isoPoint(CX, CY + 60, gx, gy, Z_GOV + 1);
                  return <circle key={`gov${col}-${row}`} cx={px} cy={py} r={1.2} fill="white" opacity={0.03} />;
                })
              )}

              {/* Teal pulse line across governance platform */}
              {(() => {
                const [lx, ly] = isoPoint(CX, CY + 60, -200, 0, Z_GOV + 1);
                const [rx, ry] = isoPoint(CX, CY + 60, 200, 0, Z_GOV + 1);
                return (
                  <line x1={lx} y1={ly} x2={rx} y2={ry} stroke="#14b8a6" strokeWidth={1} opacity={0.06}>
                    <animate attributeName="opacity" values="0.03;0.1;0.03" dur="4s" repeatCount="indefinite" />
                  </line>
                );
              })()}

              {/* Side label */}
              {(() => {
                const [lx, ly] = isoPoint(CX, CY + 60, -250, -80, Z_GOV - 12);
                return (
                  <text x={lx + 10} y={ly + 15} fill="#3d5a7a" fontSize={7.5} fontWeight={600} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em" opacity={0.5}
                    transform={`rotate(-26 ${lx + 10} ${ly + 15})`}>
                    YÖNETİŞİM · İNSAN + AI
                  </text>
                );
              })()}
            </g>

            {/* ════════════════════════════════════════════════════════ */}
            {/* LAYER 3: MAIN ONTOLOGY PLATFORM (z=200)                */}
            {/* ════════════════════════════════════════════════════════ */}
            <g filter="url(#glow-teal)">
              <polygon points={isoParallelogram(CX, CY, 700, 380, Z_ONTO)} fill="#0a0d14" stroke="#14b8a6" strokeWidth={1.5} opacity={0.6} />
            </g>
            <polygon points={isoParallelogram(CX, CY, 700, 380, Z_ONTO)} fill="#0a0d14" stroke="#14b8a6" strokeWidth={1.5} opacity={0.85} />
            <polygon points={isoLeftFace(CX, CY, 700, 380, Z_ONTO, 30)} fill="#070a10" stroke="#14b8a6" strokeWidth={0.5} opacity={0.5} />
            <polygon points={isoRightFace(CX, CY, 700, 380, Z_ONTO, 30)} fill="#050810" stroke="#14b8a6" strokeWidth={0.5} opacity={0.5} />

            {/* Platform side label */}
            {(() => {
              const [lx, ly] = isoPoint(CX, CY, -350, -150, Z_ONTO - 15);
              return (
                <text x={lx + 10} y={ly + 12} fill="#14b8a6" fontSize={8} fontWeight={700} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em" opacity={0.45}
                  transform={`rotate(-26 ${lx + 10} ${ly + 12})`}>
                  GRİSEUS ONTOLOJİSİ · DİJİTAL İKİZ
                </text>
              );
            })()}

            {/* Circuit-board grid lines on platform surface */}
            {Array.from({ length: 13 }, (_, i) => {
              const gy = -180 + i * 30;
              const [lx, ly] = isoPoint(CX, CY, -320, gy, Z_ONTO + 1);
              const [rx, ry] = isoPoint(CX, CY, 320, gy, Z_ONTO + 1);
              return <line key={`gh${i}`} x1={lx} y1={ly} x2={rx} y2={ry} stroke="#14b8a6" strokeWidth={0.4} opacity={0.025} />;
            })}
            {Array.from({ length: 13 }, (_, i) => {
              const gx = -300 + i * 50;
              const [tx, ty] = isoPoint(CX, CY, gx, -180, Z_ONTO + 1);
              const [bx, by] = isoPoint(CX, CY, gx, 180, Z_ONTO + 1);
              return <line key={`gv${i}`} x1={tx} y1={ty} x2={bx} y2={by} stroke="#14b8a6" strokeWidth={0.4} opacity={0.025} />;
            })}

            {/* ── CIRCUIT-BOARD CONNECTIONS ── */}
            {/* Fabrika ↔ Hat 1 */}
            <CircuitConnection x1={objs.fabrika[0]} y1={objs.fabrika[1]} x2={objs.hat1[0]} y2={objs.hat1[1]}
              particleColor="#14b8a6" particleDur={3} />
            {/* Fabrika ↔ Hat 2 */}
            <CircuitConnection x1={objs.fabrika[0]} y1={objs.fabrika[1]} x2={objs.hat2[0]} y2={objs.hat2[1]}
              particleColor="#14b8a6" particleDur={2.8} />
            {/* Fabrika ↔ Hat 3 — RED alert */}
            <CircuitConnection x1={objs.fabrika[0]} y1={objs.fabrika[1]} x2={objs.hat3[0]} y2={objs.hat3[1]}
              color="#ef4444" opacity={0.25} strokeWidth={1.5} particleColor="#ef4444" particleDur={2} />
            {/* Fabrika ↔ Hat 4 */}
            <CircuitConnection x1={objs.fabrika[0]} y1={objs.fabrika[1]} x2={objs.hat4[0]} y2={objs.hat4[1]}
              particleColor="#14b8a6" particleDur={3.5} />
            {/* Fabrika ↔ Lokasyon */}
            <CircuitConnection x1={objs.fabrika[0]} y1={objs.fabrika[1]} x2={objs.lokasyon[0]} y2={objs.lokasyon[1]}
              particleColor="#14b8a6" particleDur={2.5} />
            {/* Hat 3 ↔ Bakım — amber dashed */}
            <CircuitConnection x1={objs.hat3[0]} y1={objs.hat3[1]} x2={objs.bakim[0]} y2={objs.bakim[1]}
              color="#f59e0b" dashed particleColor="#f59e0b" particleDur={2} />
            {/* Operatör ↔ Hats — thin gray */}
            {[objs.hat1, objs.hat2, objs.hat3, objs.hat4].map((h, i) => (
              <CircuitConnection key={`op-h${i}`} x1={objs.operator[0]} y1={objs.operator[1]} x2={h[0]} y2={h[1]}
                color="#64748b" opacity={0.08} strokeWidth={0.7} showFx={false} particleColor="rgba(100,116,139,0.5)" particleDur={4} />
            ))}
            {/* Tedarikçi ↔ Fabrika — blue */}
            <CircuitConnection x1={objs.tedarikci[0]} y1={objs.tedarikci[1]} x2={objs.fabrika[0]} y2={objs.fabrika[1]}
              color="#3b82f6" opacity={0.15} particleColor="#3b82f6" particleDur={3} />
            {/* Sipariş ↔ Fabrika */}
            <CircuitConnection x1={objs.siparis[0]} y1={objs.siparis[1]} x2={objs.fabrika[0]} y2={objs.fabrika[1]}
              color="#3b82f6" opacity={0.12} particleColor="#3b82f6" particleDur={3.2} />

            {/* ── ONTOLOGY NODES ── */}
            <OntologyNode x={objs.fabrika[0]} y={objs.fabrika[1]} label="Fabrika" icon="🏭" />
            <OntologyNode x={objs.lokasyon[0]} y={objs.lokasyon[1]} label="Lokasyon" icon="📍" />
            <OntologyNode x={objs.tedarikci[0]} y={objs.tedarikci[1]} label="Tedarikçi" icon="🚛" glowColor="#3b82f6" />
            <OntologyNode x={objs.hat1[0]} y={objs.hat1[1]} label="Hat 1" icon="⚙️" glowColor="#10b981" />
            <OntologyNode x={objs.hat2[0]} y={objs.hat2[1]} label="Hat 2" icon="⚙️" glowColor="#10b981" />
            <OntologyNode x={objs.hat3[0]} y={objs.hat3[1]} label="Hat 3" icon="⚙️" glowColor="#ef4444" pulse alert />
            <OntologyNode x={objs.hat4[0]} y={objs.hat4[1]} label="Hat 4" icon="⚙️" glowColor="#10b981" />
            <OntologyNode x={objs.operator[0]} y={objs.operator[1]} label="Operatör" icon="👤" />
            <OntologyNode x={objs.siparis[0]} y={objs.siparis[1]} label="Sipariş" icon="📋" glowColor="#3b82f6" />
            <OntologyNode x={objs.bakim[0]} y={objs.bakim[1]} label="Bakım" icon="🔧" glowColor="#f59e0b" />

            {/* ════════════════════════════════════════════════════════ */}
            {/* LAYER 4: FLOATING ACTION CARDS (z=400+)                */}
            {/* ════════════════════════════════════════════════════════ */}

            {/* Card A: Hat 3 Acil Bakım — above Hat 3 */}
            <FloatingCard
              x={objs.hat3[0] - 100} y={objs.hat3[1] - 190}
              width={200} height={120} borderColor="#ef4444"
              title="⚠ HAT 3 — PANEL RADYATİR"
              rows={[
                "Durum: Bakımda · 14:08'den beri",
                "Etki: -29 ünite/vardiya",
                "Maliyet: ₺8,400/gün",
              ]}
              buttonText="⚡ Bakım Planla →"
              buttonColor="#ef4444"
              targetX={objs.hat3[0]} targetY={objs.hat3[1]}
              particleColor="#ef4444"
              animDelay={0}
            />

            {/* Card B: Pik Sezonu — above Fabrika */}
            <FloatingCard
              x={objs.fabrika[0] - 100} y={objs.fabrika[1] - 210}
              width={200} height={120} borderColor="#14b8a6"
              title="📊 PİK SEZONU UYARISI"
              rows={[
                "26 hafta · Eyl-Eki",
                "Kapasite: %130 dolacak",
                "Erken planlama gerekli",
              ]}
              buttonText="+ Teknisyen İşe Al →"
              buttonColor="#14b8a6"
              targetX={objs.fabrika[0]} targetY={objs.fabrika[1]}
              particleColor="#14b8a6"
              animDelay={0.8}
            />

            {/* Card C: Vardiya Optimizasyonu — above Operatör */}
            <FloatingCard
              x={objs.operator[0] - 100} y={objs.operator[1] - 190}
              width={200} height={120} borderColor="#10b981"
              title="⚡ VARDİYA OPTİMİZASYONU"
              rows={[
                `%${avgUtil} verimlilik`,
                "2 düşük performanslı operatör",
                "Sabah vardiyası optimize edilebilir",
              ]}
              buttonText="Yeniden Ata →"
              buttonColor="#10b981"
              targetX={objs.operator[0]} targetY={objs.operator[1]}
              particleColor="#10b981"
              animDelay={1.5}
            />

            {/* Card D: İşgücü Tahmini — higher, right area */}
            <FloatingCard
              x={objs.hat4[0] + 30} y={objs.hat4[1] - 210}
              width={190} height={110} borderColor="#14b8a6"
              title="👷 İŞGÜCÜ TAHMİNİ"
              rows={[
                "Pik için 8 HVAC teknisyen",
                "4 bölge açık pozisyon",
              ]}
              buttonText="Eşleştir →"
              buttonColor="#14b8a6"
              targetX={objs.hat4[0]} targetY={objs.hat4[1]}
              particleColor="#14b8a6"
              animDelay={2}
            />

            {/* Card E: Güven Skoru — right, above Bakım */}
            <FloatingCard
              x={objs.bakim[0] + 40} y={objs.bakim[1] - 170}
              width={190} height={110} borderColor="#f59e0b"
              title="🏆 GÜVEN SKORU"
              rows={[
                "3 operatör: skor güncellendi",
                "Mehmet K: 94 → Öneri",
              ]}
              buttonText="Profil Gör →"
              buttonColor="#f59e0b"
              targetX={objs.bakim[0]} targetY={objs.bakim[1]}
              particleColor="#f59e0b"
              animDelay={2.5}
            />

            {/* ════════════════════════════════════════════════════════ */}
            {/* SEASONAL TIMELINE STRIP (bottom of SVG)                */}
            {/* ════════════════════════════════════════════════════════ */}
            <g>
              <rect x={30} y={940} width={W - 280} height={42} rx={4} fill="#060810" stroke="#111827" strokeWidth={0.5} />
              <text x={46} y={956} fill="rgba(255,255,255,0.2)" fontSize={7} fontWeight={600} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">
                MEVSİMSEL TALEP ZAMANÇİZELGESİ
              </text>
              {months.map((m, i) => {
                const segW = (W - 330) / 12;
                const sx = 46 + i * segW;
                const isPeak = i === 8 || i === 9;
                const isHigh = i === 10;
                const isSummer = i === 6 || i === 7;
                const isCurrent = i === 2;
                const bg = isPeak ? "#2d0d0d" : isHigh ? "#2d1a0d" : isSummer ? "#0d1a2d" : "#0d1520";
                return (
                  <g key={m}>
                    <rect x={sx} y={960} width={segW - 2} height={16} rx={2} fill={bg} />
                    <text x={sx + segW / 2} y={971} textAnchor="middle" fill={isCurrent ? "white" : "rgba(255,255,255,0.3)"} fontSize={7} fontWeight={isCurrent ? 700 : 400} fontFamily="'JetBrains Mono', monospace">
                      {m}
                    </text>
                    {isPeak && <text x={sx + segW / 2} y={957} textAnchor="middle" fill="#ef4444" fontSize={6} fontWeight={700} fontFamily="'JetBrains Mono', monospace">PİK</text>}
                    {isHigh && <text x={sx + segW / 2} y={957} textAnchor="middle" fill="#f59e0b" fontSize={6} fontWeight={700}>Yüksek</text>}
                    {isCurrent && (
                      <g>
                        <line x1={sx + segW / 2} y1={958} x2={sx + segW / 2} y2={978} stroke="white" strokeWidth={1} opacity={0.7} />
                        <text x={sx + segW / 2} y={955} textAnchor="middle" fill="white" fontSize={6} fontWeight={700} opacity={0.8}>ŞU AN</text>
                      </g>
                    )}
                    {!isPeak && !isHigh && !isCurrent && isSummer && (
                      <circle cx={sx + segW / 2} cy={970} r={1.5} fill="#3b82f6" opacity={0.4} />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* ══ RIGHT SIDE PANEL ══ */}
        <div style={{
          width: 220, minHeight: "calc(100vh - 56px)", background: "#040608",
          borderLeft: "1px solid rgba(20,184,166,0.15)", padding: "16px 14px",
          flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#14b8a6", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "'JetBrains Mono', monospace" }}>CANLI İSTİHBARAT</span>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", marginLeft: "auto", animation: "pulse-teal 2s infinite" }} />
          </div>

          {/* Alert rows */}
          {[
            { dot: "#ef4444", text: "Hat 3 durdu — 14:08", time: "2dk önce", action: "→ Aksiyon", ac: "#ef4444" },
            { dot: "#f59e0b", text: "Pik sezonu 26 hafta", time: "12dk önce", action: "→ Plan", ac: "#f59e0b" },
            { dot: "#10b981", text: `Vardiya verimi %${avgUtil}`, time: "30dk önce", action: "✓ Normal", ac: "#10b981" },
            { dot: "#10b981", text: `${totalActual.toLocaleString()} haftalık`, time: "1sa önce", action: "✓ Normal", ac: "#10b981" },
            { dot: "#f59e0b", text: `${OPERATORS.filter(o => o.utilization > 0).length} operatör aktif`, time: "45dk önce", action: "→ İncele", ac: "#f59e0b" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: "1px solid #111827" }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: item.dot, marginTop: 3, flexShrink: 0,
                animation: item.dot === "#ef4444" ? "pulse-red 1.5s infinite" : undefined,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, fontFamily: "system-ui, sans-serif", lineHeight: 1.3 }}>{item.text}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 7.5, fontFamily: "'JetBrains Mono', monospace" }}>{item.time}</span>
                  <span style={{ color: item.ac, fontSize: 7.5, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>[{item.action}]</span>
                </div>
              </div>
            </div>
          ))}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(239,68,68,0.15)", margin: "4px 0" }} />

          {/* DARBOĞAZ section */}
          <div>
            <div style={{ color: "rgba(239,68,68,0.6)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>DARBOĞAZ</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, marginBottom: 3, fontFamily: "system-ui, sans-serif" }}>Hat 3 — Panel Radyatör</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }}>
              Durum: Bakımda (14:08'den beri)<br />
              <span style={{ color: "rgba(239,68,68,0.6)" }}>Etki: -29 units/vardiya</span><br />
              <span style={{ color: "rgba(239,68,68,0.5)" }}>Maliyet: ~₺8,400/gün</span>
            </div>
            <div style={{
              marginTop: 8, padding: "5px 8px", borderRadius: 4,
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)",
              color: "rgba(245,158,11,0.6)", fontSize: 8, fontWeight: 600,
              fontFamily: "system-ui, sans-serif", textAlign: "center",
            }}>
              2 operatör yeniden atanabilir
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#111827", margin: "4px 0" }} />

          {/* Platform info */}
          <div style={{ marginTop: "auto" }}>
            <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 7, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>
              GRİSEUS v0.1 · ONTOLOJİ MOTORU
            </div>
            <div style={{ color: "rgba(255,255,255,0.1)", fontSize: 7, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              {summary.totalLines || 4} hat · {summary.totalOperators || 10} operatör
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ██ WORKFORCE SCHEDULING (unchanged)                                    ██
// ══════════════════════════════════════════════════════════════════════════

function WorkforceScheduling() {
  const [selectedLine, setSelectedLine] = useState<string>("all");
  const filteredOps = selectedLine === "all" ? OPERATORS : OPERATORS.filter(o => o.line === selectedLine);
  const skillCounts = ALL_SKILLS.map(skill => ({ skill, count: filteredOps.filter(o => o.skills.includes(skill)).length }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workforce Scheduling</h1>
          <p className="text-sm text-muted-foreground mt-1">Shift calendar, line assignments, and skills matrix</p>
        </div>
        <Select value={selectedLine} onValueChange={setSelectedLine}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lines</SelectItem>
            {PRODUCTION_LINES.map(l => <SelectItem key={l.id} value={l.id}>{l.name.split(" — ")[0]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card className="border-white/10">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Weekly Shift Calendar</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10"><th className="text-left py-2 pr-4 text-muted-foreground font-medium">Day</th>{SHIFTS.map(s => <th key={s.name} className="text-center py-2 px-4 text-muted-foreground font-medium"><div>{s.name}</div><div className="text-[10px] font-normal">{s.time}</div></th>)}<th className="text-center py-2 px-4 text-muted-foreground font-medium">Total</th></tr></thead>
              <tbody>{SHIFT_CALENDAR.map(row => (
                <tr key={row.day} className="border-b border-white/5">
                  <td className="py-3 pr-4 font-medium">{row.day}</td>
                  <td className="text-center py-3 px-4"><Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 min-w-[40px] justify-center">{row.morning}</Badge></td>
                  <td className="text-center py-3 px-4"><Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/20 min-w-[40px] justify-center">{row.afternoon}</Badge></td>
                  <td className="text-center py-3 px-4"><Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20 min-w-[40px] justify-center">{row.night}</Badge></td>
                  <td className="text-center py-3 px-4 font-semibold">{row.morning + row.afternoon + row.night}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card className="border-white/10">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-emerald-400" />Technician Assignments ({filteredOps.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {filteredOps.map(op => {
              const line = PRODUCTION_LINES.find(l => l.id === op.line);
              return (
                <div key={op.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-card hover:border-white/20 transition-all">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">{op.name.split(" ").map(n => n[0]).join("")}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium truncate">{op.name}</span><span className={`w-2 h-2 rounded-full shrink-0 ${op.utilization > 0 ? "bg-emerald-400" : "bg-gray-400"}`} /></div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5"><span>{line?.name.split(" — ")[0]}</span><span className="capitalize">{op.shift} shift</span><span>{op.utilization}% util.</span></div>
                  </div>
                  <div className="flex flex-wrap gap-1 max-w-[200px] justify-end">{op.skills.map(s => <Badge key={s} variant="outline" className="text-[10px] border-white/10 capitalize">{s}</Badge>)}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card className="border-white/10">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" />Skills Matrix</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={skillCounts}><PolarGrid stroke="rgba(255,255,255,0.1)" /><PolarAngleAxis dataKey="skill" stroke="#64748b" fontSize={12} className="capitalize" /><PolarRadiusAxis stroke="#64748b" fontSize={10} /><Radar name="Operators" dataKey="count" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} /></RadarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ██ FINANCIAL SIMULATION (unchanged)                                    ██
// ══════════════════════════════════════════════════════════════════════════

function FinancialSimulation() {
  const [targetLine, setTargetLine] = useState("L1");
  const [addOperators, setAddOperators] = useState(2);
  const [simulated, setSimulated] = useState(false);
  const line = PRODUCTION_LINES.find(l => l.id === targetLine)!;
  const currentOps = OPERATORS.filter(o => o.line === targetLine).length;
  const operatorCostPerDay = 2800;
  const unitRevenue = targetLine === "L1" ? 450 : targetLine === "L2" ? 320 : targetLine === "L3" ? 180 : 95;
  const marginalOutputPerOperator = Math.round(line.capacity * 0.12);
  const projectedOutputIncrease = addOperators * marginalOutputPerOperator;
  const additionalDailyCost = addOperators * operatorCostPerDay;
  const additionalDailyRevenue = projectedOutputIncrease * unitRevenue;
  const netDailyImpact = additionalDailyRevenue - additionalDailyCost;
  const monthlyImpact = netDailyImpact * 22;
  const scenarioData = Array.from({ length: 6 }, (_, i) => ({
    month: `Month ${i + 1}`,
    currentRevenue: Math.round(line.capacity * unitRevenue * 22 / 1000),
    projectedRevenue: Math.round((line.capacity + projectedOutputIncrease) * unitRevenue * 22 / 1000),
    additionalCost: Math.round(additionalDailyCost * 22 / 1000),
  }));

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Financial Simulation</h1><p className="text-sm text-muted-foreground mt-1">"What if" scenarios — model the impact of workforce changes on output and revenue</p></div>
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4 text-primary" />Scenario Builder</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Target Production Line</Label><Select value={targetLine} onValueChange={v => { setTargetLine(v); setSimulated(false); }}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{PRODUCTION_LINES.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Add Operators: <span className="text-primary font-bold">{addOperators}</span></Label><Slider value={[addOperators]} onValueChange={v => { setAddOperators(v[0]); setSimulated(false); }} min={1} max={8} step={1} className="mt-3" /><div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>1</span><span>8</span></div></div>
          </div>
          <div className="bg-background/50 rounded-lg p-4 border text-sm space-y-1">
            <p className="text-muted-foreground">Current: <span className="text-foreground font-medium">{line.name}</span> — {currentOps} ops, {line.capacity} units/day</p>
            <p className="text-muted-foreground">Scenario: +<span className="text-primary font-medium">{addOperators} operators</span> → +{projectedOutputIncrease} units/day</p>
          </div>
          <Button onClick={() => setSimulated(true)} className="w-full" disabled={simulated}>{simulated ? <><CheckCircle2 className="h-4 w-4 mr-2" />Done</> : <><Play className="h-4 w-4 mr-2" />Run Simulation</>}</Button>
        </CardContent>
      </Card>
      {simulated && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-white/10"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Output Increase</p><p className="text-2xl font-bold mt-1 flex items-center gap-1">+{projectedOutputIncrease}<ArrowUpRight className="h-4 w-4 text-emerald-400" /></p><p className="text-xs text-muted-foreground">units/day</p></CardContent></Card>
            <Card className="border-white/10"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Daily Cost</p><p className="text-2xl font-bold mt-1 flex items-center gap-1">+₺{additionalDailyCost.toLocaleString()}<ArrowDownRight className="h-4 w-4 text-red-400" /></p><p className="text-xs text-muted-foreground">per day</p></CardContent></Card>
            <Card className="border-white/10"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Daily Revenue</p><p className="text-2xl font-bold mt-1 flex items-center gap-1">+₺{additionalDailyRevenue.toLocaleString()}<ArrowUpRight className="h-4 w-4 text-emerald-400" /></p><p className="text-xs text-muted-foreground">per day</p></CardContent></Card>
            <Card className={`border-white/10 ${netDailyImpact >= 0 ? "" : "border-red-500/20"}`}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Monthly Net</p><p className={`text-2xl font-bold mt-1 ${monthlyImpact >= 0 ? "text-emerald-400" : "text-red-400"}`}>{monthlyImpact >= 0 ? "+" : ""}₺{(monthlyImpact / 1000).toFixed(0)}K</p><p className="text-xs text-muted-foreground">per month</p></CardContent></Card>
          </div>
          <Card className="border-white/10">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" />6-Month Revenue Projection (₺K)</CardTitle></CardHeader>
            <CardContent><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={scenarioData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="month" stroke="#64748b" fontSize={12} /><YAxis stroke="#64748b" fontSize={12} /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} formatter={(v: number) => `₺${v}K`} /><Legend /><Line type="monotone" dataKey="currentRevenue" stroke="#64748b" strokeDasharray="5 5" name="Current" dot={false} /><Line type="monotone" dataKey="projectedRevenue" stroke="#22C55E" strokeWidth={2} name="Projected" /><Line type="monotone" dataKey="additionalCost" stroke="#EF4444" strokeDasharray="3 3" name="Cost" /></LineChart></ResponsiveContainer></div></CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2"><DollarSign className="h-5 w-5 text-emerald-400" />ROI Summary</h3>
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground">Payback</p><p className="text-lg font-bold mt-0.5">{netDailyImpact > 0 ? `${Math.ceil(additionalDailyCost / netDailyImpact)} days` : "N/A"}</p></div>
                <div><p className="text-muted-foreground">6-Month Net</p><p className={`text-lg font-bold mt-0.5 ${monthlyImpact >= 0 ? "text-emerald-400" : "text-red-400"}`}>{monthlyImpact >= 0 ? "+" : ""}₺{((monthlyImpact * 6) / 1000).toFixed(0)}K</p></div>
                <div><p className="text-muted-foreground">Recommendation</p><p className="text-lg font-bold mt-0.5">{netDailyImpact > 0 ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Profitable</span> : <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Not Recommended</span>}</p></div>
              </div>
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => setSimulated(false)} className="w-full"><RotateCcw className="h-4 w-4 mr-2" />Reset</Button>
        </>
      )}
    </div>
  );
}

// ── Route Selector ──────────────────────────────────────────────────────

export default function Operations() {
  const [location] = useLocation();
  if (location === "/operations/scheduling") return <WorkforceScheduling />;
  if (location === "/operations/finance") return <FinancialSimulation />;
  return <ProductionIntelligence />;
}
