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

// ══════════════════════════════════════════════════════════════════════════
// ██ SVG PRIMITIVES FOR ISOMETRIC PLATFORMS                              ██
// ══════════════════════════════════════════════════════════════════════════

/** Animated dot traveling between two points */
function FlowDot({ x1, y1, x2, y2, color, dur, delay, r = 2.5 }: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; dur: number; delay: number; r?: number;
}) {
  return (
    <circle r={r} fill={color} opacity={0}>
      <animate attributeName="cx" values={`${x1};${x2}`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="cy" values={`${y1};${y2}`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0;0.8;0.8;0" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
    </circle>
  );
}

/** "fx" badge on a connection midpoint */
function FxBadge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 11} y={y - 8} width={22} height={16} rx={4} fill="#0d1520" stroke="#14b8a6" strokeWidth={0.7} opacity={0.85} />
      <text x={x} y={y + 4} textAnchor="middle" fill="#14b8a6" fontSize={9} fontWeight={700} fontFamily="'JetBrains Mono', monospace" opacity={0.7}>fx</text>
    </g>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ██ PRODUCTION INTELLIGENCE — 3-Layer Isometric Factory                 ██
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

  const W = 1100, H = 850;
  const months = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

  // ── Platform parallelogram helper ──
  // Diamond shape: top, right, bottom, left
  function platform(cx: number, cy: number, w: number, d: number): string {
    return `${cx},${cy} ${cx + w / 2},${cy + d / 2} ${cx},${cy + d} ${cx - w / 2},${cy + d / 2}`;
  }
  // Left side face (3D depth)
  function leftFace(cx: number, cy: number, w: number, d: number, depth: number): string {
    return `${cx},${cy + d} ${cx - w / 2},${cy + d / 2} ${cx - w / 2},${cy + d / 2 + depth} ${cx},${cy + d + depth}`;
  }
  // Right side face (3D depth)
  function rightFace(cx: number, cy: number, w: number, d: number, depth: number): string {
    return `${cx},${cy + d} ${cx + w / 2},${cy + d / 2} ${cx + w / 2},${cy + d / 2 + depth} ${cx},${cy + d + depth}`;
  }

  // ── Platform specs ──
  const P1 = { cx: 550, cy: 620, w: 500, d: 120, label: "KASA ÜRETİM" };
  const P2 = { cx: 550, cy: 420, w: 560, d: 130, label: "MONTAJ & ÜRETİM" };
  const P3 = { cx: 550, cy: 230, w: 420, d: 110, label: "İDARİ YÖNETİM" };

  return (
    <div style={{ background: "#000000", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        @keyframes pulse-red { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes float-card { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes blink-dot { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>

      {/* ═══ KPI STRIP ═══ */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", height: 52, alignItems: "center", borderBottom: "1px solid #111827" }}>
        {[
          { dot: "#14b8a6", value: `${totalActual.toLocaleString()} ünite`, sub: `Üretim · hedef %${fulfillment}` },
          { dot: "#f59e0b", value: `${activeLines}/${PRODUCTION_LINES.length} hat`, sub: "Hatlar · 1 bakımda" },
          { dot: "#14b8a6", value: `%${avgUtil}`, sub: "Verimlilik · ort. operatör" },
          { dot: "#14b8a6", value: "8", sub: "Vardiyada · sabah" },
        ].map((kpi, i) => (
          <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#060810", border: "1px solid #111827", borderRadius: 8, padding: "6px 14px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: kpi.dot, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "white", fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{kpi.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ MAIN CONTENT: SVG + RIGHT PANEL ═══ */}
      <div style={{ display: "flex", position: "relative" }}>

        {/* ══ SVG CANVAS ══ */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
            <defs>
              <pattern id="bg-dots" width={28} height={28} patternUnits="userSpaceOnUse">
                <circle cx={14} cy={14} r={0.7} fill="rgba(255,255,255,0.02)" />
              </pattern>
              <filter id="glow-teal" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="12" result="blur" />
                <feFlood floodColor="#14b8a6" floodOpacity="0.15" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-amber" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="10" result="blur" />
                <feFlood floodColor="#f59e0b" floodOpacity="0.12" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Background dots */}
            <rect width={W} height={H} fill="url(#bg-dots)" />

            {/* ════════════════════════════════════════════════════════════ */}
            {/* PLATFORM 1 — KASA ÜRETİM (bottom, z=0)                    */}
            {/* ════════════════════════════════════════════════════════════ */}
            <polygon points={platform(P1.cx, P1.cy, P1.w, P1.d)} fill="#0a1628" stroke="#1e3a5f" strokeWidth={1.5} />
            <polygon points={leftFace(P1.cx, P1.cy, P1.w, P1.d, 28)} fill="#060e1a" stroke="#1e3a5f" strokeWidth={0.5} />
            <polygon points={rightFace(P1.cx, P1.cy, P1.w, P1.d, 28)} fill="#08121f" stroke="#1e3a5f" strokeWidth={0.5} />
            {/* Side label on left face */}
            <text x={P1.cx - P1.w / 2 - 6} y={P1.cy + P1.d / 2 + 18} fill="#4a90d9" fontSize={14} fontWeight={700}
              fontFamily="'JetBrains Mono', monospace" textAnchor="end">
              {P1.label}
            </text>

            {/* ── Object A: Hat 1 at (400, 660) ── */}
            <circle cx={400} cy={660} r={22} fill="#0d1f38" stroke="#4a90d9" strokeWidth={1.5} />
            <text x={400} y={665} textAnchor="middle" fontSize={18}>⚙️</text>
            <text x={400} y={698} textAnchor="middle" fill="white" fontSize={13} fontWeight={600} fontFamily="system-ui, sans-serif">Hat 1</text>
            <text x={400} y={712} textAnchor="middle" fill="#888" fontSize={11} fontFamily="system-ui, sans-serif">Kombi Kasa</text>
            {/* Status badge */}
            <rect x={362} y={717} width={76} height={18} rx={4} fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" strokeWidth={0.5} />
            <text x={400} y={730} textAnchor="middle" fill="#10b981" fontSize={10} fontWeight={600} fontFamily="'JetBrains Mono', monospace">✓ 47 adet/gün</text>

            {/* ── Object B: Hat 2 at (550, 645) ── */}
            <circle cx={550} cy={645} r={22} fill="#0d1f38" stroke="#4a90d9" strokeWidth={1.5} />
            <text x={550} y={650} textAnchor="middle" fontSize={18}>⚙️</text>
            <text x={550} y={683} textAnchor="middle" fill="white" fontSize={13} fontWeight={600} fontFamily="system-ui, sans-serif">Hat 2</text>
            <text x={550} y={697} textAnchor="middle" fill="#888" fontSize={11} fontFamily="system-ui, sans-serif">Eşanjör Kasa</text>
            <rect x={512} y={702} width={76} height={18} rx={4} fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" strokeWidth={0.5} />
            <text x={550} y={715} textAnchor="middle" fill="#10b981" fontSize={10} fontWeight={600} fontFamily="'JetBrains Mono', monospace">✓ 31 adet/gün</text>

            {/* ── Object C: Hat 3 at (700, 660) — RED pulse ── */}
            <circle cx={700} cy={660} r={22} fill="#1f0a0a" stroke="#ef4444" strokeWidth={1.5}>
              <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <text x={700} y={665} textAnchor="middle" fontSize={18}>⚠️</text>
            <text x={700} y={698} textAnchor="middle" fill="white" fontSize={13} fontWeight={600} fontFamily="system-ui, sans-serif">Hat 3</text>
            <text x={700} y={712} textAnchor="middle" fill="#888" fontSize={11} fontFamily="system-ui, sans-serif">Panel Kasa</text>
            <rect x={662} y={717} width={76} height={18} rx={4} fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.3)" strokeWidth={0.5} />
            <text x={700} y={730} textAnchor="middle" fill="#ef4444" fontSize={10} fontWeight={600} fontFamily="'JetBrains Mono', monospace">⚠ Bakımda</text>

            {/* Horizontal connecting line Hat1 → Hat2 → Hat3 */}
            <line x1={424} y1={660} x2={528} y2={649} stroke="#4a90d9" strokeWidth={1} strokeDasharray="6 4">
              <animate attributeName="stroke-dashoffset" values="0;-20" dur="2s" repeatCount="indefinite" />
            </line>
            <line x1={572} y1={649} x2={676} y2={660} stroke="#4a90d9" strokeWidth={1} strokeDasharray="6 4">
              <animate attributeName="stroke-dashoffset" values="0;-20" dur="2s" repeatCount="indefinite" />
            </line>
            <FlowDot x1={424} y1={660} x2={676} y2={660} color="#4a90d9" dur={3} delay={0} r={2} />
            <FlowDot x1={424} y1={660} x2={676} y2={660} color="#4a90d9" dur={3} delay={1.5} r={2} />
            <text x={550} y={637} textAnchor="middle" fill="#4a90d9" fontSize={11} fontFamily="'JetBrains Mono', monospace" opacity={0.7}>
              MONTAJ'A GÖNDERİLİYOR →
            </text>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* VERTICAL CONNECTORS: Platform 1 → Platform 2               */}
            {/* ════════════════════════════════════════════════════════════ */}
            {/* Hat 1 up to Montaj */}
            <line x1={400} y1={638} x2={380} y2={558} stroke="#14b8a6" strokeWidth={1} strokeDasharray="4 4" opacity={0.3} />
            <FlowDot x1={400} y1={636} x2={380} y2={558} color="#14b8a6" dur={2} delay={0} r={2} />
            {/* Hat 2 up to Montaj */}
            <line x1={550} y1={623} x2={520} y2={548} stroke="#14b8a6" strokeWidth={1} strokeDasharray="4 4" opacity={0.3} />
            <FlowDot x1={550} y1={623} x2={520} y2={548} color="#14b8a6" dur={2} delay={0.6} r={2} />
            {/* Hat 3 up to Bakım (amber) */}
            <line x1={700} y1={638} x2={670} y2={555} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" opacity={0.3} />
            <FlowDot x1={700} y1={638} x2={670} y2={555} color="#f59e0b" dur={2} delay={1} r={2} />
            {/* Flow label */}
            <text x={340} y={590} fill="#14b8a6" fontSize={11} fontFamily="'JetBrains Mono', monospace" opacity={0.5}
              transform="rotate(-70 340 590)">Kasa Akışı ↑</text>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* PLATFORM 2 — MONTAJ FABRİKASI (middle)                     */}
            {/* ════════════════════════════════════════════════════════════ */}
            <g filter="url(#glow-teal)">
              <polygon points={platform(P2.cx, P2.cy, P2.w, P2.d)} fill="#0a1a14" stroke="#14b8a6" strokeWidth={1.5} />
            </g>
            <polygon points={platform(P2.cx, P2.cy, P2.w, P2.d)} fill="#0a1a14" stroke="#14b8a6" strokeWidth={1.5} />
            <polygon points={leftFace(P2.cx, P2.cy, P2.w, P2.d, 30)} fill="#060f0d" stroke="#14b8a6" strokeWidth={0.5} opacity={0.7} />
            <polygon points={rightFace(P2.cx, P2.cy, P2.w, P2.d, 30)} fill="#08150f" stroke="#14b8a6" strokeWidth={0.5} opacity={0.7} />
            <text x={P2.cx - P2.w / 2 - 6} y={P2.cy + P2.d / 2 + 20} fill="#14b8a6" fontSize={14} fontWeight={700}
              fontFamily="'JetBrains Mono', monospace" textAnchor="end">
              {P2.label}
            </text>

            {/* ── Object D: Montaj Hattı at (370, 460) ── */}
            <circle cx={370} cy={460} r={26} fill="#0d2420" stroke="#14b8a6" strokeWidth={2} />
            <text x={370} y={466} textAnchor="middle" fontSize={20}>🏭</text>
            <text x={370} y={500} textAnchor="middle" fill="white" fontSize={13} fontWeight={600}>Montaj Hattı</text>
            <text x={370} y={514} textAnchor="middle" fill="#888" fontSize={11}>Ana üretim</text>
            <text x={370} y={530} textAnchor="middle" fill="#14b8a6" fontSize={12} fontWeight={700} fontFamily="'JetBrains Mono', monospace">107 ünite/gün</text>

            {/* ── Object E: Operatörler at (520, 442) + avatar circles ── */}
            <circle cx={520} cy={442} r={22} fill="#0d2420" stroke="#14b8a6" strokeWidth={1.5} />
            <text x={520} y={448} textAnchor="middle" fontSize={18}>👷</text>
            <text x={520} y={478} textAnchor="middle" fill="white" fontSize={13} fontWeight={600}>Operatörler</text>
            <text x={520} y={492} textAnchor="middle" fill="#888" fontSize={11}>8 aktif vardiya</text>
            {/* Small avatar initials */}
            {["AY", "FD", "MK"].map((initials, i) => (
              <g key={initials}>
                <circle cx={558 + i * 24} cy={440} r={10} fill="#0a1a14" stroke="rgba(20,184,166,0.4)" strokeWidth={0.7} />
                <text x={558 + i * 24} y={444} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={7} fontWeight={700} fontFamily="'JetBrains Mono', monospace">{initials}</text>
              </g>
            ))}

            {/* ── Object F: Bakım at (670, 458) — amber ── */}
            <circle cx={670} cy={458} r={22} fill="#1a1408" stroke="#f59e0b" strokeWidth={1.5} />
            <text x={670} y={464} textAnchor="middle" fontSize={18}>🔧</text>
            <text x={670} y={494} textAnchor="middle" fill="white" fontSize={13} fontWeight={600}>Bakım</text>
            <text x={670} y={508} textAnchor="middle" fill="#f59e0b" fontSize={11}>Hat 3 bağlantısı</text>
            <rect x={641} y={513} width={58} height={18} rx={4} fill="rgba(245,158,11,0.15)" stroke="rgba(245,158,11,0.3)" strokeWidth={0.5} />
            <text x={670} y={526} textAnchor="middle" fill="#f59e0b" fontSize={10} fontWeight={600} fontFamily="'JetBrains Mono', monospace">Acil</text>

            {/* ── Object G: Sevkiyat at (790, 472) ── */}
            <circle cx={790} cy={472} r={20} fill="#0d2420" stroke="#14b8a6" strokeWidth={1.5} />
            <text x={790} y={478} textAnchor="middle" fontSize={16}>📦</text>
            <text x={790} y={506} textAnchor="middle" fill="white" fontSize={13} fontWeight={600}>Sevkiyat</text>
            <text x={790} y={520} textAnchor="middle" fill="#888" fontSize={11}>Hazır ürün</text>

            {/* Circuit-board connections on Platform 2 */}
            {/* D → E: horizontal L-route */}
            <line x1={396} y1={460} x2={498} y2={460} stroke="#14b8a6" strokeWidth={1} opacity={0.2} />
            <line x1={498} y1={460} x2={498} y2={442} stroke="#14b8a6" strokeWidth={1} opacity={0.2} />
            <FlowDot x1={396} y1={460} x2={498} y2={442} color="#14b8a6" dur={2.5} delay={0} />
            <FxBadge x={448} y={460} />
            {/* E → F */}
            <line x1={542} y1={442} x2={610} y2={442} stroke="#14b8a6" strokeWidth={1} opacity={0.2} />
            <line x1={610} y1={442} x2={648} y2={458} stroke="#14b8a6" strokeWidth={1} opacity={0.2} />
            <FlowDot x1={542} y1={442} x2={648} y2={458} color="#14b8a6" dur={2.5} delay={0.8} />
            <FxBadge x={576} y={442} />
            {/* F → G */}
            <line x1={692} y1={458} x2={740} y2={458} stroke="#14b8a6" strokeWidth={1} opacity={0.2} />
            <line x1={740} y1={458} x2={770} y2={472} stroke="#14b8a6" strokeWidth={1} opacity={0.2} />
            <FlowDot x1={692} y1={458} x2={770} y2={472} color="#14b8a6" dur={2} delay={1.5} />
            <FxBadge x={716} y={458} />
            {/* D → G (long route along bottom) */}
            <line x1={370} y1={486} x2={370} y2={498} stroke="#14b8a6" strokeWidth={0.7} opacity={0.1} />
            <line x1={370} y1={498} x2={790} y2={498} stroke="#14b8a6" strokeWidth={0.7} opacity={0.1} />
            <line x1={790} y1={498} x2={790} y2={492} stroke="#14b8a6" strokeWidth={0.7} opacity={0.1} />
            <FlowDot x1={370} y1={486} x2={790} y2={492} color="rgba(20,184,166,0.4)" dur={4} delay={0.5} r={1.5} />

            {/* ════════════════════════════════════════════════════════════ */}
            {/* VERTICAL CONNECTORS: Platform 2 → Platform 3               */}
            {/* ════════════════════════════════════════════════════════════ */}
            <line x1={420} y1={430} x2={450} y2={370} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" opacity={0.25} />
            <FlowDot x1={420} y1={430} x2={450} y2={370} color="#f59e0b" dur={2.5} delay={0} r={2} />
            <line x1={550} y1={420} x2={555} y2={360} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" opacity={0.25} />
            <FlowDot x1={550} y1={420} x2={555} y2={360} color="#f59e0b" dur={2.5} delay={0.8} r={2} />
            <text x={415} y={398} fill="#f59e0b" fontSize={11} fontFamily="'JetBrains Mono', monospace" opacity={0.4}
              transform="rotate(-75 415 398)">Rapor ↑</text>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* PLATFORM 3 — İDARİ YÖNETİM (top)                          */}
            {/* ════════════════════════════════════════════════════════════ */}
            <g filter="url(#glow-amber)">
              <polygon points={platform(P3.cx, P3.cy, P3.w, P3.d)} fill="#12100a" stroke="#f59e0b" strokeWidth={1.5} />
            </g>
            <polygon points={platform(P3.cx, P3.cy, P3.w, P3.d)} fill="#12100a" stroke="#f59e0b" strokeWidth={1.5} />
            <polygon points={leftFace(P3.cx, P3.cy, P3.w, P3.d, 24)} fill="#0a0e06" stroke="#f59e0b" strokeWidth={0.5} opacity={0.6} />
            <polygon points={rightFace(P3.cx, P3.cy, P3.w, P3.d, 24)} fill="#0e0c08" stroke="#f59e0b" strokeWidth={0.5} opacity={0.6} />
            <text x={P3.cx - P3.w / 2 - 6} y={P3.cy + P3.d / 2 + 16} fill="#f59e0b" fontSize={14} fontWeight={700}
              fontFamily="'JetBrains Mono', monospace" textAnchor="end">
              {P3.label}
            </text>

            {/* ── Object H: Genel Müdür at (440, 262) ── */}
            <circle cx={440} cy={262} r={22} fill="#1a1408" stroke="#f59e0b" strokeWidth={1.5} />
            <text x={440} y={268} textAnchor="middle" fontSize={18}>👔</text>
            <text x={440} y={298} textAnchor="middle" fill="white" fontSize={13} fontWeight={600}>Genel Müdür</text>
            <text x={440} y={312} textAnchor="middle" fill="#888" fontSize={11}>Operasyon kontrolü</text>

            {/* ── Object I: Finans at (555, 248) ── */}
            <circle cx={555} cy={248} r={22} fill="#1a1408" stroke="#f59e0b" strokeWidth={1.5} />
            <text x={555} y={254} textAnchor="middle" fontSize={18}>📊</text>
            <text x={555} y={284} textAnchor="middle" fill="white" fontSize={13} fontWeight={600}>Finans</text>
            <text x={555} y={298} textAnchor="middle" fill="#888" fontSize={11}>₺ akışı takibi</text>

            {/* ── Object J: Planlama at (668, 262) ── */}
            <circle cx={668} cy={262} r={22} fill="#1a1408" stroke="#f59e0b" strokeWidth={1.5} />
            <text x={668} y={268} textAnchor="middle" fontSize={18}>📅</text>
            <text x={668} y={298} textAnchor="middle" fill="white" fontSize={13} fontWeight={600}>Planlama</text>
            <text x={668} y={312} textAnchor="middle" fill="#888" fontSize={11}>Sipariş yönetimi</text>

            {/* Connections on Platform 3 */}
            <line x1={462} y1={262} x2={533} y2={248} stroke="#f59e0b" strokeWidth={1} opacity={0.2} />
            <line x1={577} y1={248} x2={646} y2={262} stroke="#f59e0b" strokeWidth={1} opacity={0.2} />
            <FlowDot x1={462} y1={262} x2={646} y2={262} color="#f59e0b" dur={3} delay={0} r={2} />

            {/* ════════════════════════════════════════════════════════════ */}
            {/* FLOATING ACTION CARDS (above platform 3)                   */}
            {/* ════════════════════════════════════════════════════════════ */}

            {/* Card 1 — Hat 3 Acil (left) */}
            <line x1={280} y1={175} x2={700} y2={660} stroke="#ef4444" strokeWidth={0.7} opacity={0.15} strokeDasharray="4 4" />
            <FlowDot x1={280} y1={175} x2={700} y2={660} color="#ef4444" dur={3} delay={0} r={2} />
            <FlowDot x1={280} y1={175} x2={700} y2={660} color="#ef4444" dur={3} delay={1.5} r={1.5} />
            <foreignObject x={180} y={52} width={200} height={128}>
              <div style={{ animation: "float-card 4s ease-in-out infinite" }}>
                <div style={{
                  background: "#0d0808", border: "1.5px solid #ef4444", borderRadius: 8,
                  padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>⚠ HAT 3 ACİL</div>
                  <div style={{ color: "white", fontSize: 12 }}>Panel Kasa · Bakımda</div>
                  <div style={{ color: "#f87171", fontSize: 12 }}>−29 ünite/vardiya</div>
                  <div style={{ color: "#fca5a5", fontSize: 11 }}>₺8,400/gün kayıp</div>
                  <div onClick={() => alert("Bakım planı açılıyor...")} style={{
                    marginTop: 2, padding: "5px 0", borderRadius: 4, background: "#ef4444",
                    color: "white", fontSize: 11, fontWeight: 600, textAlign: "center", cursor: "pointer",
                  }}>Bakım Planla →</div>
                </div>
              </div>
            </foreignObject>

            {/* Card 2 — Pik Sezonu (center) */}
            <line x1={545} y1={165} x2={370} y2={460} stroke="#14b8a6" strokeWidth={0.7} opacity={0.15} strokeDasharray="4 4" />
            <FlowDot x1={545} y1={165} x2={370} y2={460} color="#14b8a6" dur={3} delay={0.5} r={2} />
            <foreignObject x={440} y={35} width={210} height={128}>
              <div style={{ animation: "float-card 4s ease-in-out infinite", animationDelay: "1s" }}>
                <div style={{
                  background: "#070d0c", border: "1.5px solid #14b8a6", borderRadius: 8,
                  padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ color: "#14b8a6", fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>📊 PİK SEZONU</div>
                  <div style={{ color: "white", fontSize: 12 }}>26 hafta kaldı · Eyl-Eki</div>
                  <div style={{ color: "#6ee7b7", fontSize: 12 }}>%130 kapasite dolacak</div>
                  <div style={{ color: "#94d5cc", fontSize: 11 }}>8 teknisyen gerekli</div>
                  <div onClick={() => alert("Sezon planı açılıyor...")} style={{
                    marginTop: 2, padding: "5px 0", borderRadius: 4, background: "#14b8a6",
                    color: "white", fontSize: 11, fontWeight: 600, textAlign: "center", cursor: "pointer",
                  }}>Planla →</div>
                </div>
              </div>
            </foreignObject>

            {/* Card 3 — Vardiya (right) */}
            <line x1={805} y1={165} x2={520} y2={442} stroke="#10b981" strokeWidth={0.7} opacity={0.15} strokeDasharray="4 4" />
            <FlowDot x1={805} y1={165} x2={520} y2={442} color="#10b981" dur={3} delay={1} r={2} />
            <foreignObject x={710} y={52} width={190} height={128}>
              <div style={{ animation: "float-card 4s ease-in-out infinite", animationDelay: "2s" }}>
                <div style={{
                  background: "#070d0a", border: "1.5px solid #10b981", borderRadius: 8,
                  padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ color: "#10b981", fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>⚡ VARDİYA</div>
                  <div style={{ color: "white", fontSize: 12 }}>%{avgUtil} verimlilik</div>
                  <div style={{ color: "#86efac", fontSize: 12 }}>2 düşük perf. operatör</div>
                  <div style={{ color: "#888", fontSize: 11 }}>Sabah vardiyası aktif</div>
                  <div onClick={() => alert("Vardiya yönetimi açılıyor...")} style={{
                    marginTop: 2, padding: "5px 0", borderRadius: 4, background: "#10b981",
                    color: "white", fontSize: 11, fontWeight: 600, textAlign: "center", cursor: "pointer",
                  }}>Yeniden Ata →</div>
                </div>
              </div>
            </foreignObject>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* SEASONAL TIMELINE (bottom strip)                           */}
            {/* ════════════════════════════════════════════════════════════ */}
            <rect x={20} y={800} width={W - 40} height={36} rx={4} fill="#060810" stroke="#111827" strokeWidth={0.5} />
            <text x={36} y={816} fill="rgba(255,255,255,0.25)" fontSize={10} fontWeight={600} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">
              MEVSİMSEL TALEP
            </text>
            {months.map((m, i) => {
              const segW = (W - 200) / 12;
              const sx = 160 + i * segW;
              const isPeak = i === 8 || i === 9;
              const isHigh = i === 10;
              const isSummer = i === 6 || i === 7;
              const isCurrent = i === 2;
              const bg = isPeak ? "#2d0d0d" : isHigh ? "#2d1a0d" : isSummer ? "#0d1a2d" : "#0d1520";
              return (
                <g key={m}>
                  <rect x={sx} y={806} width={segW - 3} height={20} rx={3} fill={bg} />
                  <text x={sx + segW / 2} y={820} textAnchor="middle" fill={isCurrent ? "white" : "rgba(255,255,255,0.35)"} fontSize={10} fontWeight={isCurrent ? 700 : 400} fontFamily="'JetBrains Mono', monospace">
                    {m}
                  </text>
                  {isPeak && <text x={sx + segW / 2} y={804} textAnchor="middle" fill="#ef4444" fontSize={9} fontWeight={700}>PİK</text>}
                  {isHigh && <text x={sx + segW / 2} y={804} textAnchor="middle" fill="#f59e0b" fontSize={9} fontWeight={700}>Yüksek</text>}
                  {isCurrent && (
                    <g>
                      <line x1={sx + segW / 2} y1={804} x2={sx + segW / 2} y2={828} stroke="white" strokeWidth={1} opacity={0.7} />
                      <text x={sx + segW / 2} y={802} textAnchor="middle" fill="white" fontSize={9} fontWeight={700} opacity={0.8}>ŞU AN</text>
                    </g>
                  )}
                  {!isPeak && !isHigh && !isCurrent && isSummer && (
                    <circle cx={sx + segW / 2} cy={816} r={2} fill="#3b82f6" opacity={0.5} />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* ══ RIGHT SIDE PANEL ══ */}
        <div style={{
          width: 210, minHeight: "calc(100vh - 52px)", background: "#040608",
          borderLeft: "1px solid rgba(20,184,166,0.3)", padding: "16px 14px",
          flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
          fontFamily: "system-ui, sans-serif",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#14b8a6", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace" }}>CANLI İSTİHBARAT</span>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", marginLeft: "auto", animation: "blink-dot 1s infinite" }} />
          </div>

          {/* Alert rows */}
          {[
            { dot: "#ef4444", text: "Hat 3 durdu — 14:08", action: "→ Aksiyon", ac: "#ef4444" },
            { dot: "#f59e0b", text: "Pik sezonu 26 hafta", action: "→ Plan", ac: "#f59e0b" },
            { dot: "#10b981", text: `Vardiya verimi %${avgUtil}`, action: "✓", ac: "#10b981" },
            { dot: "#10b981", text: `${totalActual.toLocaleString()} haftalık üretim`, action: "✓", ac: "#10b981" },
            { dot: "#f59e0b", text: "10 operatör aktif", action: "→ İncele", ac: "#f59e0b" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderBottom: "1px solid #111827" }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: item.dot, marginTop: 4, flexShrink: 0,
                animation: item.dot === "#ef4444" ? "pulse-red 1.5s infinite" : undefined,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 1.3 }}>{item.text}</div>
                <div style={{ textAlign: "right", marginTop: 2 }}>
                  <span style={{ color: item.ac, fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>[{item.action}]</span>
                </div>
              </div>
            </div>
          ))}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(239,68,68,0.2)", margin: "4px 0" }} />

          {/* DARBOĞAZ */}
          <div>
            <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>DARBOĞAZ</div>
            <div style={{ color: "white", fontSize: 12, marginBottom: 3 }}>Hat 3 — Panel Kasa</div>
            <div style={{ color: "#888", fontSize: 11, marginBottom: 3 }}>Bakımda (14:08'den beri)</div>
            <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 2 }}>Etki: −28 ünite/vardiya</div>
            <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>Maliyet: ₺8,400/gün</div>
            <div onClick={() => alert("Operatör yeniden atama")} style={{
              padding: "6px 10px", borderRadius: 4,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
              color: "#f59e0b", fontSize: 11, fontWeight: 600, textAlign: "center", cursor: "pointer",
            }}>
              2 operatör yeniden atanabilir
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: "auto" }}>
            <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
              GRİSEUS v0.1 · ONTOLOJİ
            </div>
            <div style={{ color: "rgba(255,255,255,0.1)", fontSize: 9, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
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
