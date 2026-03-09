import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Factory,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Zap,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Cell,
  ReferenceLine,
} from "recharts";

// ── Dummy Data ──────────────────────────────────────────────────────────

const PRODUCTION_LINES = [
  { id: "L1", name: "Line 1 — Kombi Assembly", product: "Wall-hung Boilers", capacity: 120, status: "running" as const },
  { id: "L2", name: "Line 2 — Heat Exchanger", product: "Plate Heat Exchangers", capacity: 80, status: "running" as const },
  { id: "L3", name: "Line 3 — Panel Radiator", product: "Steel Panel Radiators", capacity: 200, status: "maintenance" as const },
  { id: "L4", name: "Line 4 — Expansion Tank", product: "Expansion Vessels", capacity: 300, status: "running" as const },
];

const DAILY_OUTPUT = [
  { day: "Mon", target: 700, actual: 665 },
  { day: "Tue", target: 700, actual: 712 },
  { day: "Wed", target: 700, actual: 688 },
  { day: "Thu", target: 700, actual: 735 },
  { day: "Fri", target: 700, actual: 698 },
  { day: "Sat", target: 350, actual: 341 },
  { day: "Sun", target: 0, actual: 0 },
];

const OPERATORS = [
  { id: "O1", name: "Ahmet Yıldız", line: "L1", shift: "morning", skills: ["welding", "assembly", "testing"], utilization: 92 },
  { id: "O2", name: "Fatma Demir", line: "L1", shift: "morning", skills: ["assembly", "quality"], utilization: 88 },
  { id: "O3", name: "Mehmet Kaya", line: "L2", shift: "morning", skills: ["welding", "brazing", "testing"], utilization: 95 },
  { id: "O4", name: "Ayşe Çelik", line: "L2", shift: "afternoon", skills: ["assembly", "packaging"], utilization: 78 },
  { id: "O5", name: "Hasan Arslan", line: "L3", shift: "morning", skills: ["press-op", "welding", "painting"], utilization: 0 },
  { id: "O6", name: "Elif Şahin", line: "L3", shift: "morning", skills: ["quality", "testing", "painting"], utilization: 0 },
  { id: "O7", name: "Ali Öztürk", line: "L4", shift: "morning", skills: ["welding", "assembly"], utilization: 85 },
  { id: "O8", name: "Zeynep Koç", line: "L4", shift: "afternoon", skills: ["assembly", "testing", "packaging"], utilization: 91 },
  { id: "O9", name: "Emre Aydın", line: "L1", shift: "afternoon", skills: ["welding", "testing"], utilization: 82 },
  { id: "O10", name: "Deniz Yılmaz", line: "L4", shift: "morning", skills: ["press-op", "welding", "assembly"], utilization: 87 },
  { id: "O11", name: "Selin Aksoy", line: "L2", shift: "afternoon", skills: ["quality", "testing"], utilization: 76 },
  { id: "O12", name: "Burak Güneş", line: "L1", shift: "morning", skills: ["assembly", "brazing", "testing"], utilization: 90 },
];

const SHIFTS = [
  { name: "Morning", time: "06:00 – 14:00", color: "#3B82F6" },
  { name: "Afternoon", time: "14:00 – 22:00", color: "#8B5CF6" },
  { name: "Night", time: "22:00 – 06:00", color: "#6B7280" },
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

const ALL_SKILLS = ["welding", "brazing", "assembly", "testing", "quality", "press-op", "painting", "packaging"];

// ── SVG Primitives ──────────────────────────────────────────────────────

const ISO_ANGLE = Math.PI / 6;

function IsoCube({ cx, cy, size, topColor, leftColor, rightColor, glowColor, opacity = 1, strokeColor }: {
  cx: number; cy: number; size: number; topColor: string; leftColor: string; rightColor: string; glowColor?: string; opacity?: number; strokeColor?: string;
}) {
  const s = size / 2;
  const cos30 = Math.cos(ISO_ANGLE);
  const sin30 = Math.sin(ISO_ANGLE);
  const top = `${cx},${cy - s} ${cx + s * cos30},${cy - s + s * sin30} ${cx},${cy} ${cx - s * cos30},${cy - s + s * sin30}`;
  const left = `${cx - s * cos30},${cy - s + s * sin30} ${cx},${cy} ${cx},${cy + s * sin30 * 2} ${cx - s * cos30},${cy + s * sin30}`;
  const right = `${cx + s * cos30},${cy - s + s * sin30} ${cx},${cy} ${cx},${cy + s * sin30 * 2} ${cx + s * cos30},${cy + s * sin30}`;
  const stroke = strokeColor || "rgba(255,255,255,0.03)";
  return (
    <g opacity={opacity}>
      {glowColor && <ellipse cx={cx} cy={cy + s * sin30} rx={size * 0.7} ry={size * 0.25} fill={glowColor} opacity={0.12} style={{ filter: "blur(8px)" }} />}
      <polygon points={left} fill={leftColor} stroke={stroke} strokeWidth={0.5} />
      <polygon points={right} fill={rightColor} stroke={stroke} strokeWidth={0.5} />
      <polygon points={top} fill={topColor} stroke={strokeColor || "rgba(255,255,255,0.06)"} strokeWidth={0.5} />
    </g>
  );
}

function FlowDot({ x1, y1, x2, y2, color, dur, delay }: {
  x1: number; y1: number; x2: number; y2: number; color: string; dur: number; delay: number;
}) {
  return (
    <circle r={2} fill={color}>
      <animate attributeName="cx" values={`${x1};${x2}`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="cy" values={`${y1};${y2}`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0;0.9;0.9;0" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
    </circle>
  );
}

// ── Isometric Machine Block with positioned operators ─────────────────

function MachineBlock({ cx, cy, label, sublabel, status, output, operators, utilization, size = 52 }: {
  cx: number; cy: number; label: string; sublabel: string; status: "running" | "maintenance"; output?: string; operators?: { initials: string; x: number; y: number }[]; utilization?: number; size?: number;
}) {
  const isDown = status === "maintenance";
  const accent = isDown ? "#ef4444" : "#14b8a6";
  const topC = isDown ? "#1a0808" : "#0a1a1a";
  const leftC = isDown ? "#120505" : "#071414";
  const rightC = isDown ? "#0f0404" : "#051010";

  return (
    <g>
      {/* Glow under machine */}
      <ellipse cx={cx} cy={cy + size * 0.3} rx={size * 0.8} ry={size * 0.22} fill={accent} opacity={isDown ? 0.08 : 0.06} style={{ filter: "blur(10px)" }}>
        {isDown && <animate attributeName="opacity" values="0.04;0.12;0.04" dur="2s" repeatCount="indefinite" />}
      </ellipse>
      {/* Machine body */}
      <IsoCube cx={cx} cy={cy} size={size} topColor={topC} leftColor={leftC} rightColor={rightC} />
      {/* Top accent line */}
      <line x1={cx - size * 0.43} y1={cy - size * 0.25} x2={cx + size * 0.43} y2={cy - size * 0.25} stroke={accent} strokeWidth={1.5} opacity={0.7} />
      {/* Status indicator */}
      <circle cx={cx + size * 0.35} cy={cy - size * 0.45} r={4} fill={isDown ? "#ef4444" : "#10b981"}>
        {isDown && <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />}
      </circle>
      {/* Label */}
      <text x={cx} y={cy - size * 0.55} textAnchor="middle" fill="white" fontSize={10} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" opacity={0.9}>
        {label}
      </text>
      <text x={cx} y={cy - size * 0.55 + 13} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="Inter, system-ui, sans-serif">
        {sublabel}
      </text>
      {/* Status badge with output or maintenance */}
      <rect x={cx - 32} y={cy + size * 0.35} width={64} height={16} rx={4} fill={isDown ? "rgba(239,68,68,0.12)" : "rgba(20,184,166,0.1)"} stroke={isDown ? "rgba(239,68,68,0.3)" : "rgba(20,184,166,0.25)"} strokeWidth={0.5} />
      <text x={cx} y={cy + size * 0.35 + 11.5} textAnchor="middle" fill={isDown ? "#ef4444" : "#10b981"} fontSize={7.5} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
        {isDown ? "⚠ Bakımda" : `✓ ${output}`}
      </text>
      {/* Utilization badge */}
      {utilization !== undefined && !isDown && (
        <g>
          <rect x={cx - 18} y={cy + size * 0.35 + 20} width={36} height={12} rx={3} fill="rgba(20,184,166,0.06)" stroke="rgba(20,184,166,0.15)" strokeWidth={0.5} />
          <text x={cx} y={cy + size * 0.35 + 29} textAnchor="middle" fill="rgba(20,184,166,0.7)" fontSize={7} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
            %{utilization}
          </text>
        </g>
      )}
      {/* Positioned operator circles with initials */}
      {operators?.map((op) => (
        <g key={op.initials}>
          <circle cx={op.x} cy={op.y} r={9} fill="#0a0a0f" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
          <circle cx={op.x} cy={op.y} r={9} fill={isDown ? "rgba(239,68,68,0.06)" : "rgba(20,184,166,0.06)"} stroke={isDown ? "rgba(239,68,68,0.2)" : "rgba(20,184,166,0.2)"} strokeWidth={0.5} />
          <text x={op.x} y={op.y + 3} textAnchor="middle" fill={isDown ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.6)"} fontSize={6.5} fontWeight={700} fontFamily="Inter, system-ui, sans-serif">
            {op.initials}
          </text>
        </g>
      ))}
    </g>
  );
}

// ── Operations Intelligence Canvas (680px) ───────────────────────────

function OperationsCanvas() {
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
  const bottlenecks = intelligence?.bottlenecks || [];

  const W = 960;
  const H = 680;

  // Seasonal months data
  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const monthDemand = [3, 2, 3, 4, 4, 5, 5, 6, 10, 9, 7, 6];
  const currentMonth = 2; // March (0-indexed)

  return (
    <div style={{ background: "#000000", borderRadius: 12, border: "1px solid #1a1a2e", overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <defs>
          <pattern id="grid-dots" width={20} height={20} patternUnits="userSpaceOnUse">
            <circle cx={10} cy={10} r={0.5} fill="rgba(255,255,255,0.03)" />
          </pattern>
        </defs>

        {/* Background grid */}
        <rect width={W} height={H} fill="url(#grid-dots)" />

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TOP: AKSİYON ZONU — Action Cards with Object/Property/Button */}
        {/* ═══════════════════════════════════════════════════════ */}
        <text x={30} y={28} fill="rgba(16,185,129,0.5)" fontSize={8.5} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.15em">
          AKSİYON ZONU
        </text>

        {/* Action card 1: Vardiya Optimize Et */}
        <rect x={30} y={38} width={220} height={62} rx={6} fill="rgba(16,185,129,0.04)" stroke="rgba(16,185,129,0.25)" strokeWidth={1} />
        <text x={46} y={56} fill="#e8eaf0" fontSize={11} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">⚡ Vardiya Optimize Et</text>
        <text x={46} y={70} fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="Inter, system-ui, sans-serif">
          Nesne: Vardiya Planı · Tip: Eylem
        </text>
        <text x={46} y={82} fill="rgba(255,255,255,0.3)" fontSize={7.5} fontFamily="Inter, system-ui, sans-serif">
          Sabah vardiyasında 2 operatör fazlası tespit edildi
        </text>
        {/* Action button */}
        <rect x={46} y={87} width={70} height={14} rx={3} fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.3)" strokeWidth={0.5} />
        <text x={81} y={97} textAnchor="middle" fill="#10b981" fontSize={7} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
          Planla →
        </text>

        {/* Action card 2: Hat 3 Bakım — pulsing amber */}
        <rect x={280} y={38} width={220} height={62} rx={6} fill="rgba(245,158,11,0.04)" stroke="rgba(245,158,11,0.3)" strokeWidth={1}>
          <animate attributeName="stroke-opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
        </rect>
        <text x={296} y={56} fill="#e8eaf0" fontSize={11} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">⚠️ Hat 3 Acil Bakım</text>
        <text x={296} y={70} fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="Inter, system-ui, sans-serif">
          Nesne: Hat 3 · Tip: Uyarı
        </text>
        <text x={296} y={82} fill="rgba(255,255,255,0.3)" fontSize={7.5} fontFamily="Inter, system-ui, sans-serif">
          Panel radyatör hattı 14:08'den beri durdu
        </text>
        {/* Action button */}
        <rect x={296} y={87} width={82} height={14} rx={3} fill="rgba(245,158,11,0.12)" stroke="rgba(245,158,11,0.3)" strokeWidth={0.5} />
        <text x={337} y={97} textAnchor="middle" fill="#f59e0b" fontSize={7} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
          Bakım Ata →
        </text>

        {/* Action card 3: Pik Sezon Hazırlık */}
        <rect x={530} y={38} width={220} height={62} rx={6} fill="rgba(20,184,166,0.04)" stroke="rgba(20,184,166,0.25)" strokeWidth={1} />
        <text x={546} y={56} fill="#e8eaf0" fontSize={11} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">📊 Pik Sezonu Hazırlık</text>
        <text x={546} y={70} fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="Inter, system-ui, sans-serif">
          Nesne: Sezon Planı · Tip: Strateji
        </text>
        <text x={546} y={82} fill="rgba(255,255,255,0.3)" fontSize={7.5} fontFamily="Inter, system-ui, sans-serif">
          Pik sezona 26 hafta — kapasite planı gerekli
        </text>
        {/* Action button */}
        <rect x={546} y={87} width={76} height={14} rx={3} fill="rgba(20,184,166,0.12)" stroke="rgba(20,184,166,0.3)" strokeWidth={0.5} />
        <text x={584} y={97} textAnchor="middle" fill="#14b8a6" fontSize={7} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
          Planla →
        </text>

        {/* Flow lines from action cards DOWN into factory */}
        {[140, 390, 640].map((x, i) => (
          <g key={`action-flow-${i}`}>
            <line x1={x} y1={102} x2={x} y2={150} stroke="rgba(16,185,129,0.06)" strokeWidth={1} strokeDasharray="3 3" />
            <FlowDot x1={x} y1={102} x2={x} y2={150} color="#10b981" dur={2} delay={i * 0.5} />
          </g>
        ))}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* MIDDLE: FABRİKA OPERASYONLARI PLATFORMU               */}
        {/* ═══════════════════════════════════════════════════════ */}

        {/* Platform background */}
        <rect x={20} y={130} width={720} height={340} rx={8} fill="#0d1117" stroke="#1a1a2e" strokeWidth={1} />

        {/* Zone labels */}
        <text x={40} y={155} fill="rgba(20,184,166,0.5)" fontSize={8} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.12em">
          KASA ÜRETİM
        </text>
        <text x={400} y={155} fill="rgba(20,184,166,0.5)" fontSize={8} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.12em">
          ANA FABRİKA & MONTAJ
        </text>

        {/* Divider line between zones */}
        <line x1={365} y1={145} x2={365} y2={420} stroke="rgba(255,255,255,0.04)" strokeWidth={1} strokeDasharray="4 4" />

        {/* ── LEFT: Kasa Üretim ── */}
        <MachineBlock
          cx={140} cy={240} label="Hat 1" sublabel="Kombi Montaj" status="running" output="47 ünite" utilization={92}
          operators={[
            { initials: "AY", x: 95, y: 225 },
            { initials: "FD", x: 185, y: 225 },
            { initials: "BG", x: 100, y: 265 },
          ]}
          size={56}
        />
        <MachineBlock
          cx={280} cy={320} label="Hat 2" sublabel="Isı Eşanjör" status="running" output="31 ünite" utilization={87}
          operators={[
            { initials: "MK", x: 235, y: 305 },
            { initials: "AÇ", x: 325, y: 305 },
          ]}
          size={52}
        />

        {/* ── RIGHT: Ana Fabrika ── */}
        <MachineBlock
          cx={500} cy={240} label="Hat 3" sublabel="Panel Radyatör" status="maintenance"
          operators={[
            { initials: "HA", x: 455, y: 225 },
            { initials: "EŞ", x: 545, y: 225 },
          ]}
          size={56}
        />
        <MachineBlock
          cx={620} cy={320} label="Hat 4" sublabel="Genleşme Tankı" status="running" output="29 ünite" utilization={88}
          operators={[
            { initials: "AÖ", x: 575, y: 305 },
            { initials: "ZK", x: 665, y: 305 },
            { initials: "DY", x: 620, y: 355 },
          ]}
          size={52}
        />

        {/* ── CENTER: Flow arrow Kasa → Ana Fabrika — dims when Hat 3 offline ── */}
        <line x1={310} y1={270} x2={440} y2={270} stroke="rgba(20,184,166,0.08)" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.4}>
          <animate attributeName="stroke-dashoffset" values="0;-20" dur="3s" repeatCount="indefinite" />
        </line>
        {/* Arrow head - dimmed */}
        <polygon points="440,270 432,265 432,275" fill="rgba(20,184,166,0.15)" />
        <text x={375} y={263} textAnchor="middle" fill="rgba(20,184,166,0.2)" fontSize={7.5} fontWeight={600} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.06em">
          MONTAJ AKIŞI →
        </text>
        {/* Dimmed flow dot (slower, lower opacity because Hat 3 down) */}
        <FlowDot x1={310} y1={270} x2={440} y2={270} color="rgba(20,184,166,0.4)" dur={4} delay={0} />

        {/* ── BOTTOM STRIP: Mevsimsel Talep Zaman Çizelgesi ── */}
        <rect x={35} y={400} width={690} height={60} rx={6} fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
        <text x={50} y={415} fill="rgba(255,255,255,0.25)" fontSize={7} fontWeight={600} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.1em">
          MEVSİMSEL TALEP ZAMANÇİZELGESİ
        </text>
        {months.map((m, i) => {
          const barX = 50 + i * 56;
          const barH = (monthDemand[i] / 10) * 25;
          const isPeak = i === 8 || i === 9; // Sep, Oct
          const isHigh = i === 10; // Nov
          const isCurrent = i === currentMonth;
          const color = isPeak ? "#ef4444" : isHigh ? "#f59e0b" : i >= 6 && i <= 7 ? "#3b82f6" : "rgba(255,255,255,0.12)";
          return (
            <g key={m}>
              <rect x={barX} y={448 - barH} width={40} height={barH} rx={2} fill={color} opacity={isPeak ? 0.7 : isHigh ? 0.5 : 0.3} />
              <text x={barX + 20} y={456} textAnchor="middle" fill={isCurrent ? "white" : "rgba(255,255,255,0.3)"} fontSize={7} fontWeight={isCurrent ? 700 : 400} fontFamily="Inter, system-ui, sans-serif">
                {m}
              </text>
              {isCurrent && (
                <g>
                  <line x1={barX + 20} y1={420} x2={barX + 20} y2={452} stroke="white" strokeWidth={1} opacity={0.6} />
                  <text x={barX + 20} y={418} textAnchor="middle" fill="white" fontSize={6} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" opacity={0.7}>
                    Şu An
                  </text>
                </g>
              )}
              {isPeak && (
                <text x={barX + 20} y={448 - barH - 4} textAnchor="middle" fill="#ef4444" fontSize={6} fontWeight={700} fontFamily="Inter, system-ui, sans-serif">
                  PİK
                </text>
              )}
              {isHigh && (
                <text x={barX + 20} y={448 - barH - 4} textAnchor="middle" fill="#f59e0b" fontSize={6} fontWeight={700} fontFamily="Inter, system-ui, sans-serif">
                  Yüksek
                </text>
              )}
            </g>
          );
        })}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* RIGHT PANEL: Canlı İstihbarat                          */}
        {/* ═══════════════════════════════════════════════════════ */}
        <rect x={755} y={130} width={185} height={340} rx={8} fill="#0a0a0f" stroke="#1a1a2e" strokeWidth={1} />
        <text x={770} y={152} fill="rgba(20,184,166,0.5)" fontSize={8} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.12em">
          CANLI İSTİHBARAT
        </text>
        <circle cx={917} cy={148} r={3} fill="#10b981">
          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* 5 Alert rows with action links */}
        {[
          { dot: "#ef4444", text: "Hat 3 durdu — 14:08", action: "→ Aksiyon", actionColor: "#ef4444", y: 175 },
          { dot: "#f59e0b", text: "Pik sezonu 26 hafta", action: "→ Plan", actionColor: "#f59e0b", y: 200 },
          { dot: "#10b981", text: `Vardiya verimi %${summary.overallUtilization || 86}`, action: "✓ Normal", actionColor: "#10b981", y: 225 },
          { dot: "#10b981", text: `${DAILY_OUTPUT.reduce((s, d) => s + d.actual, 0).toLocaleString()} haftalık üretim`, action: "✓ Normal", actionColor: "#10b981", y: 250 },
          { dot: "#f59e0b", text: `${OPERATORS.filter(o => o.utilization > 0).length} operatör aktif`, action: "→ İncele", actionColor: "#f59e0b", y: 275 },
        ].map((item, i) => (
          <g key={i}>
            <circle cx={775} cy={item.y} r={3.5} fill={item.dot} opacity={0.8}>
              {item.dot === "#ef4444" && <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1.5s" repeatCount="indefinite" />}
            </circle>
            <text x={788} y={item.y + 3.5} fill="rgba(255,255,255,0.6)" fontSize={8.5} fontFamily="Inter, system-ui, sans-serif">
              {item.text}
            </text>
            {/* Action link */}
            <text x={925} y={item.y + 3.5} textAnchor="end" fill={item.actionColor} fontSize={7} fontWeight={600} fontFamily="Inter, system-ui, sans-serif" opacity={0.7} style={{ cursor: "pointer" }}>
              [{item.action}]
            </text>
          </g>
        ))}

        {/* DARBOĞAZ section */}
        <line x1={770} y1={298} x2={925} y2={298} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
        <text x={770} y={316} fill="rgba(239,68,68,0.6)" fontSize={7.5} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.08em">
          DARBOĞAZ
        </text>
        <text x={770} y={332} fill="rgba(255,255,255,0.5)" fontSize={8} fontFamily="Inter, system-ui, sans-serif">
          Hat 3 — Panel Radyatör
        </text>
        <text x={770} y={348} fill="rgba(255,255,255,0.35)" fontSize={7.5} fontFamily="Inter, system-ui, sans-serif">
          Durum: Bakımda (14:08'den beri)
        </text>
        <text x={770} y={364} fill="rgba(239,68,68,0.6)" fontSize={7.5} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
          Etki: -29 units/vardiya
        </text>
        <text x={770} y={380} fill="rgba(239,68,68,0.5)" fontSize={7.5} fontFamily="Inter, system-ui, sans-serif">
          Maliyet: ~₺8,400/gün
        </text>
        {/* Operator reassignment hint */}
        <rect x={770} y={390} width={155} height={16} rx={3} fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.15)" strokeWidth={0.5} />
        <text x={848} y={401} textAnchor="middle" fill="rgba(245,158,11,0.6)" fontSize={7} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
          2 operatör yeniden atanabilir
        </text>
        {bottlenecks.length > 0 && bottlenecks.slice(0, 2).map((b: any, i: number) => (
          <text key={i} x={770} y={422 + i * 14} fill="rgba(255,255,255,0.25)" fontSize={7} fontFamily="Inter, system-ui, sans-serif">
            {b.lineName?.split(" — ")[0] || "Hat"}: {b.reason === "maintenance" ? "Bakım" : `%${b.avgUtilization}`}
          </text>
        ))}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* BOTTOM: VERİ KAYNAKLARI — 4 cubes                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <text x={30} y={498} fill="rgba(148,163,184,0.3)" fontSize={8} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.12em">
          VERİ KAYNAKLARI
        </text>

        {/* 4 data source cubes */}
        {[
          { label: "Vardiya Kayıtları", x: 120, comingSoon: false },
          { label: "Operatör Profilleri", x: 340, comingSoon: false },
          { label: "Üretim Çıktısı", x: 560, comingSoon: false },
          { label: "Gerçek Zamanlı Sensör", x: 780, comingSoon: true },
        ].map((src, i) => (
          <g key={src.label}>
            <IsoCube
              cx={src.x} cy={560} size={38}
              topColor={src.comingSoon ? "#1a1500" : "#1e293b"}
              leftColor={src.comingSoon ? "#141100" : "#151d2b"}
              rightColor={src.comingSoon ? "#100e00" : "#111827"}
              strokeColor={src.comingSoon ? "rgba(245,158,11,0.25)" : undefined}
            />
            {/* Icon representations */}
            {i === 0 && <g opacity={0.4}>{[0, 5, 10].map(dx => [0, 5].map(dy => <rect key={`${dx}-${dy}`} x={src.x - 6 + dx} y={560 - 8 + dy} width={3} height={3} rx={0.5} fill="#94a3b8" />))}</g>}
            {i === 1 && <g opacity={0.4}><circle cx={src.x} cy={560 - 6} r={4} fill="#94a3b8" /><path d={`M${src.x - 6},${560 + 3} Q${src.x},${560 - 2} ${src.x + 6},${560 + 3}`} fill="#94a3b8" /></g>}
            {i === 2 && <g opacity={0.4}><rect x={src.x - 7} y={560 - 2} width={4} height={8} rx={1} fill="#94a3b8" /><rect x={src.x - 1} y={560 - 8} width={4} height={14} rx={1} fill="#94a3b8" /><rect x={src.x + 5} y={560 - 5} width={4} height={11} rx={1} fill="#94a3b8" /></g>}
            {i === 3 && <g opacity={0.3}><circle cx={src.x} cy={560 - 4} r={5} fill="none" stroke="#f59e0b" strokeWidth={1} /><circle cx={src.x} cy={560 - 4} r={2} fill="#f59e0b" opacity={0.4} /><line x1={src.x} y1={560 + 2} x2={src.x} y2={560 + 7} stroke="#f59e0b" strokeWidth={1} opacity={0.4} /></g>}
            <text x={src.x} y={590} textAnchor="middle" fill={src.comingSoon ? "rgba(245,158,11,0.4)" : "rgba(148,163,184,0.4)"} fontSize={8} fontWeight={500} fontFamily="Inter, system-ui, sans-serif">
              {src.label}
            </text>
            {/* Coming soon badge */}
            {src.comingSoon && (
              <g>
                <rect x={src.x - 24} y={598} width={48} height={12} rx={3} fill="rgba(245,158,11,0.08)" stroke="rgba(245,158,11,0.2)" strokeWidth={0.5} />
                <text x={src.x} y={607} textAnchor="middle" fill="rgba(245,158,11,0.5)" fontSize={6} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
                  coming soon
                </text>
              </g>
            )}
            {/* Flow dots upward into factory platform (skip for coming soon) */}
            {!src.comingSoon && (
              <g>
                <FlowDot x1={src.x} y1={538} x2={i === 0 ? 180 : i === 1 ? 400 : 620} y2={400} color="#14b8a6" dur={3} delay={i * 0.7} />
                <line x1={src.x} y1={538} x2={i === 0 ? 180 : i === 1 ? 400 : 620} y2={400} stroke="rgba(20,184,166,0.05)" strokeWidth={0.5} strokeDasharray="3 4" />
              </g>
            )}
          </g>
        ))}

        {/* Separator lines */}
        <line x1={20} y1={485} x2={W - 20} y2={485} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} strokeDasharray="6 4" />
        <line x1={20} y1={118} x2={W - 20} y2={118} stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} strokeDasharray="6 4" />
      </svg>
    </div>
  );
}

// ── Ontology Graph (compact, dark) ──────────────────────────────────────

function OntologyDiagram() {
  const { data: factories } = useQuery<any[]>({
    queryKey: ["/api/ontology/objects/factory"],
    retry: 1, staleTime: 60000,
  });
  const factoryId = factories?.[0]?.id;
  const { data: intelligence } = useQuery<any>({
    queryKey: ["/api/ontology/intelligence/factory/" + factoryId],
    enabled: !!factoryId, refetchInterval: 30000, retry: 1, staleTime: 15000,
  });

  if (!intelligence) return null;

  const lineUtils = intelligence.lineUtilization || [];
  const bottleneckIds = new Set((intelligence.bottlenecks || []).map((b: any) => b.lineId));
  const summary = intelligence.summary || {};

  const W = 780;
  const H = 140;

  const nodes = [
    { label: "Fabrika", x: 60 },
    { label: "Lokasyon", x: 170 },
    { label: "Hat 1", x: 280, alert: bottleneckIds.has(lineUtils[0]?.lineId) },
    { label: "Hat 2", x: 370, alert: bottleneckIds.has(lineUtils[1]?.lineId) },
    { label: "Hat 3", x: 460, alert: bottleneckIds.has(lineUtils[2]?.lineId) },
    { label: "Hat 4", x: 550, alert: bottleneckIds.has(lineUtils[3]?.lineId) },
    { label: "Operatör", x: 660 },
    { label: "Vardiya", x: 740 },
  ];
  const edges = [[0,1],[1,2],[1,3],[1,4],[1,5],[2,6],[3,6],[4,6],[5,6],[6,7]];

  return (
    <div style={{ background: "#000000", borderRadius: 12, border: "1px solid #1a1a2e", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: "#14b8a6", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
          GRİSEUS ONTOLOJİSİ — Çukurova Isı Sistemleri Fabrikası
        </span>
        <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
          {summary.totalLines} hat · {summary.totalOperators} operatör · %{summary.overallUtilization} verimlilik
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {/* Glow background */}
        <ellipse cx={W / 2} cy={H / 2} rx={300} ry={35} fill="rgba(20,184,166,0.03)" style={{ filter: "blur(20px)" }} />
        {/* Edges */}
        {edges.map(([from, to], i) => (
          <g key={`e${i}`}>
            <line x1={nodes[from].x} y1={H / 2} x2={nodes[to].x} y2={H / 2} stroke="rgba(20,184,166,0.12)" strokeWidth={1} />
            <FlowDot x1={nodes[from].x} y1={H / 2} x2={nodes[to].x} y2={H / 2} color="#14b8a6" dur={2.5} delay={i * 0.25} />
          </g>
        ))}
        {/* Nodes */}
        {nodes.map((n) => (
          <g key={n.label}>
            <circle cx={n.x} cy={H / 2} r={16} fill="rgba(20,184,166,0.06)" stroke="rgba(20,184,166,0.25)" strokeWidth={1}>
              <animate attributeName="r" values="16;18;16" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx={n.x} cy={H / 2} r={3} fill="#14b8a6" opacity={0.6} />
            <text x={n.x} y={H / 2 + 30} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={8} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
              {n.label}
            </text>
            {n.alert && (
              <g>
                <circle cx={n.x + 12} cy={H / 2 - 14} r={5} fill="#f59e0b" />
                <text x={n.x + 12} y={H / 2 - 11} textAnchor="middle" fill="white" fontSize={7} fontWeight={800}>!</text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Production Intelligence (Palantir-style) ────────────────────────────

function ProductionIntelligence() {
  const totalTarget = DAILY_OUTPUT.reduce((s, d) => s + d.target, 0);
  const totalActual = DAILY_OUTPUT.reduce((s, d) => s + d.actual, 0);
  const fulfillment = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
  const activeLines = PRODUCTION_LINES.filter((l) => l.status === "running").length;
  const avgUtilization = Math.round(
    OPERATORS.filter((o) => o.utilization > 0).reduce((s, o) => s + o.utilization, 0) /
      OPERATORS.filter((o) => o.utilization > 0).length,
  );

  return (
    <div className="space-y-3" style={{ background: "#000000", minHeight: "100vh", padding: "16px" }}>
      {/* Command Strip — Title + KPIs */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Production Intelligence</h1>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Tek panel fabrika operasyonları · Çukurova Isı Sistemleri</p>
        </div>
        <Badge variant="outline" className="text-[10px] bg-teal-500/10 text-teal-400 border-teal-500/20">
          LIVE
        </Badge>
      </div>

      {/* KPI Pills — Command Strip format */}
      <div className="flex gap-2">
        {[
          { label: "Üretim", value: totalActual.toLocaleString(), sub: `hedefin %${fulfillment}'i`, color: fulfillment >= 100 ? "#10b981" : "#f59e0b" },
          { label: "Hatlar", value: `${activeLines}/${PRODUCTION_LINES.length}`, sub: "1 bakımda", color: "#ef4444" },
          { label: "Verimlilik", value: `%${avgUtilization}`, sub: "ort. operatör", color: "#14b8a6" },
          { label: "Vardiyada", value: `${OPERATORS.filter(o => o.shift === "morning").length}`, sub: "sabah vardiyası", color: "#10b981" },
        ].map((kpi) => (
          <div key={kpi.label} className="flex-1 rounded-lg px-3 py-2" style={{ background: "#0a0a0f", border: "1px solid #1a1a2e" }}>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{kpi.value}</span>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: kpi.color, display: "inline-block" }} />
            </div>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{kpi.label} · {kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Operations Intelligence Canvas */}
      <OperationsCanvas />

      {/* Ontology Graph */}
      <OntologyDiagram />
    </div>
  );
}

// ── Workforce Scheduling ────────────────────────────────────────────────

function WorkforceScheduling() {
  const [selectedLine, setSelectedLine] = useState<string>("all");

  const filteredOps = selectedLine === "all" ? OPERATORS : OPERATORS.filter((o) => o.line === selectedLine);

  const skillCounts = ALL_SKILLS.map((skill) => ({
    skill,
    count: filteredOps.filter((o) => o.skills.includes(skill)).length,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workforce Scheduling</h1>
          <p className="text-sm text-muted-foreground mt-1">Shift calendar, line assignments, and skills matrix</p>
        </div>
        <Select value={selectedLine} onValueChange={setSelectedLine}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lines</SelectItem>
            {PRODUCTION_LINES.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name.split(" — ")[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Weekly Shift Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Day</th>
                  {SHIFTS.map((s) => (
                    <th key={s.name} className="text-center py-2 px-4 text-muted-foreground font-medium">
                      <div>{s.name}</div>
                      <div className="text-[10px] font-normal">{s.time}</div>
                    </th>
                  ))}
                  <th className="text-center py-2 px-4 text-muted-foreground font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {SHIFT_CALENDAR.map((row) => (
                  <tr key={row.day} className="border-b border-white/5">
                    <td className="py-3 pr-4 font-medium">{row.day}</td>
                    <td className="text-center py-3 px-4">
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 min-w-[40px] justify-center">{row.morning}</Badge>
                    </td>
                    <td className="text-center py-3 px-4">
                      <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/20 min-w-[40px] justify-center">{row.afternoon}</Badge>
                    </td>
                    <td className="text-center py-3 px-4">
                      <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20 min-w-[40px] justify-center">{row.night}</Badge>
                    </td>
                    <td className="text-center py-3 px-4 font-semibold">{row.morning + row.afternoon + row.night}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-400" />
            Technician Assignments ({filteredOps.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {filteredOps.map((op) => {
              const line = PRODUCTION_LINES.find((l) => l.id === op.line);
              return (
                <div key={op.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-card hover:border-white/20 transition-all">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {op.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{op.name}</span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${op.utilization > 0 ? "bg-emerald-400" : "bg-gray-400"}`} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{line?.name.split(" — ")[0]}</span>
                      <span className="capitalize">{op.shift} shift</span>
                      <span>{op.utilization}% util.</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 max-w-[200px] justify-end">
                    {op.skills.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px] border-white/10 capitalize">{s}</Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Skills Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={skillCounts}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="skill" stroke="#64748b" fontSize={12} className="capitalize" />
                <PolarRadiusAxis stroke="#64748b" fontSize={10} />
                <Radar name="Operators" dataKey="count" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Financial Simulation ────────────────────────────────────────────────

function FinancialSimulation() {
  const [targetLine, setTargetLine] = useState("L1");
  const [addOperators, setAddOperators] = useState(2);
  const [simulated, setSimulated] = useState(false);

  const line = PRODUCTION_LINES.find((l) => l.id === targetLine)!;
  const currentOps = OPERATORS.filter((o) => o.line === targetLine).length;

  const operatorCostPerDay = 2800;
  const unitRevenue = targetLine === "L1" ? 450 : targetLine === "L2" ? 320 : targetLine === "L3" ? 180 : 95;
  const marginalOutputPerOperator = Math.round(line.capacity * 0.12);
  const projectedOutputIncrease = addOperators * marginalOutputPerOperator;
  const additionalDailyCost = addOperators * operatorCostPerDay;
  const additionalDailyRevenue = projectedOutputIncrease * unitRevenue;
  const netDailyImpact = additionalDailyRevenue - additionalDailyCost;
  const monthlyImpact = netDailyImpact * 22;

  const scenarioData = Array.from({ length: 6 }, (_, i) => {
    const month = i + 1;
    const currentRevenue = line.capacity * unitRevenue * 22;
    const projectedRevenue = (line.capacity + projectedOutputIncrease) * unitRevenue * 22;
    const additionalCost = additionalDailyCost * 22;
    return {
      month: `Month ${month}`,
      currentRevenue: Math.round(currentRevenue / 1000),
      projectedRevenue: Math.round(projectedRevenue / 1000),
      additionalCost: Math.round(additionalCost / 1000),
    };
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financial Simulation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          "What if" scenarios — model the impact of workforce changes on output and revenue
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            Scenario Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Target Production Line</Label>
              <Select value={targetLine} onValueChange={(v) => { setTargetLine(v); setSimulated(false); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCTION_LINES.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Add Operators: <span className="text-primary font-bold">{addOperators}</span></Label>
              <Slider value={[addOperators]} onValueChange={(v) => { setAddOperators(v[0]); setSimulated(false); }} min={1} max={8} step={1} className="mt-3" />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>1</span><span>8</span></div>
            </div>
          </div>
          <div className="bg-background/50 rounded-lg p-4 border text-sm space-y-1">
            <p className="text-muted-foreground">Current state: <span className="text-foreground font-medium">{line.name}</span> has <span className="text-foreground font-medium">{currentOps} operators</span> producing <span className="text-foreground font-medium">{line.capacity} units/day</span></p>
            <p className="text-muted-foreground">Scenario: Add <span className="text-primary font-medium">{addOperators} operators</span> → <span className="text-foreground font-medium">+{projectedOutputIncrease} units/day</span> projected increase</p>
          </div>
          <Button onClick={() => setSimulated(true)} className="w-full" disabled={simulated}>
            {simulated ? <><CheckCircle2 className="h-4 w-4 mr-2" />Simulation Complete</> : <><Play className="h-4 w-4 mr-2" />Run Simulation</>}
          </Button>
        </CardContent>
      </Card>

      {simulated && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-white/10"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Output Increase</p><p className="text-2xl font-bold mt-1 flex items-center gap-1">+{projectedOutputIncrease}<ArrowUpRight className="h-4 w-4 text-emerald-400" /></p><p className="text-xs text-muted-foreground">units/day</p></CardContent></Card>
            <Card className="border-white/10"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Daily Cost</p><p className="text-2xl font-bold mt-1 flex items-center gap-1">+₺{additionalDailyCost.toLocaleString()}<ArrowDownRight className="h-4 w-4 text-red-400" /></p><p className="text-xs text-muted-foreground">per day</p></CardContent></Card>
            <Card className="border-white/10"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Daily Revenue</p><p className="text-2xl font-bold mt-1 flex items-center gap-1">+₺{additionalDailyRevenue.toLocaleString()}<ArrowUpRight className="h-4 w-4 text-emerald-400" /></p><p className="text-xs text-muted-foreground">per day</p></CardContent></Card>
            <Card className={`border-white/10 ${netDailyImpact >= 0 ? "" : "border-red-500/20"}`}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Monthly Net Impact</p><p className={`text-2xl font-bold mt-1 ${monthlyImpact >= 0 ? "text-emerald-400" : "text-red-400"}`}>{monthlyImpact >= 0 ? "+" : ""}₺{(monthlyImpact / 1000).toFixed(0)}K</p><p className="text-xs text-muted-foreground">per month (22 working days)</p></CardContent></Card>
          </div>

          <Card className="border-white/10">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" />6-Month Revenue Projection (₺K)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scenarioData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} formatter={(v: number) => `₺${v}K`} />
                    <Legend />
                    <Line type="monotone" dataKey="currentRevenue" stroke="#64748b" strokeDasharray="5 5" name="Current Revenue" dot={false} />
                    <Line type="monotone" dataKey="projectedRevenue" stroke="#22C55E" strokeWidth={2} name="Projected Revenue" />
                    <Line type="monotone" dataKey="additionalCost" stroke="#EF4444" strokeDasharray="3 3" name="Additional Cost" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2"><DollarSign className="h-5 w-5 text-emerald-400" />ROI Summary</h3>
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground">Payback Period</p><p className="text-lg font-bold mt-0.5">{netDailyImpact > 0 ? `${Math.ceil(additionalDailyCost / netDailyImpact)} days` : "N/A"}</p></div>
                <div><p className="text-muted-foreground">6-Month Net Profit</p><p className={`text-lg font-bold mt-0.5 ${monthlyImpact >= 0 ? "text-emerald-400" : "text-red-400"}`}>{monthlyImpact >= 0 ? "+" : ""}₺{((monthlyImpact * 6) / 1000).toFixed(0)}K</p></div>
                <div><p className="text-muted-foreground">Recommendation</p><p className="text-lg font-bold mt-0.5">{netDailyImpact > 0 ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Profitable</span> : <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Not Recommended</span>}</p></div>
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={() => setSimulated(false)} className="w-full"><RotateCcw className="h-4 w-4 mr-2" />Reset & Try New Scenario</Button>
        </>
      )}
    </div>
  );
}

// ── Route-based Section Selector ────────────────────────────────────────

export default function Operations() {
  const [location] = useLocation();

  if (location === "/operations/scheduling") return <WorkforceScheduling />;
  if (location === "/operations/finance") return <FinancialSimulation />;
  return <ProductionIntelligence />;
}
