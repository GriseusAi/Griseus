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

// ── Palantir-style Ontology Diagram ─────────────────────────────────────

// Isometric projection helpers
const ISO_ANGLE = Math.PI / 6; // 30 degrees
const isoTransform = (x: number, y: number, z: number) => ({
  x: (x - y) * Math.cos(ISO_ANGLE),
  y: (x + y) * Math.sin(ISO_ANGLE) - z,
});

// Isometric cube face generator
function IsoCube({ cx, cy, size, topColor, leftColor, rightColor, glowColor, opacity = 1 }: {
  cx: number; cy: number; size: number; topColor: string; leftColor: string; rightColor: string; glowColor?: string; opacity?: number;
}) {
  const s = size / 2;
  const cos30 = Math.cos(ISO_ANGLE);
  const sin30 = Math.sin(ISO_ANGLE);

  const top = `${cx},${cy - s} ${cx + s * cos30},${cy - s + s * sin30} ${cx},${cy} ${cx - s * cos30},${cy - s + s * sin30}`;
  const left = `${cx - s * cos30},${cy - s + s * sin30} ${cx},${cy} ${cx},${cy + s * sin30 * 2} ${cx - s * cos30},${cy + s * sin30}`;
  const right = `${cx + s * cos30},${cy - s + s * sin30} ${cx},${cy} ${cx},${cy + s * sin30 * 2} ${cx + s * cos30},${cy + s * sin30}`;

  return (
    <g opacity={opacity}>
      {glowColor && (
        <ellipse cx={cx} cy={cy + s * sin30} rx={size * 0.7} ry={size * 0.25} fill={glowColor} opacity={0.15} style={{ filter: "blur(8px)" }} />
      )}
      <polygon points={left} fill={leftColor} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
      <polygon points={right} fill={rightColor} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
      <polygon points={top} fill={topColor} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
    </g>
  );
}

// Flowing dot animation along a path
function FlowDot({ x1, y1, x2, y2, color, dur, delay }: {
  x1: number; y1: number; x2: number; y2: number; color: string; dur: number; delay: number;
}) {
  return (
    <circle r={2.5} fill={color}>
      <animate attributeName="cx" values={`${x1};${x2}`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="cy" values={`${y1};${y2}`} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0;0.9;0.9;0" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
    </circle>
  );
}

// Ontology node with label and optional alert badge
function OntologyNode({ cx, cy, label, sublabel, color, alert, size = 32 }: {
  cx: number; cy: number; label: string; sublabel?: string; color: string; alert?: "warning" | "ok"; size?: number;
}) {
  return (
    <g>
      {/* Glow ring */}
      <circle cx={cx} cy={cy} r={size * 0.7} fill="none" stroke={color} strokeWidth={0.8} opacity={0.15}>
        <animate attributeName="r" values={`${size * 0.7};${size * 0.85};${size * 0.7}`} dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.15;0.05;0.15" dur="4s" repeatCount="indefinite" />
      </circle>
      {/* Node body */}
      <IsoCube cx={cx} cy={cy} size={size} topColor={color} leftColor={`${color}cc`} rightColor={`${color}99`} glowColor={color} />
      {/* Inner dot */}
      <circle cx={cx} cy={cy - size * 0.15} r={3} fill="white" opacity={0.6} />
      {/* Label */}
      <text x={cx} y={cy + size * 0.65 + 12} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={9} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
        {label}
      </text>
      {sublabel && (
        <text x={cx} y={cy + size * 0.65 + 23} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={7.5} fontFamily="Inter, system-ui, sans-serif">
          {sublabel}
        </text>
      )}
      {/* Alert badge */}
      {alert === "warning" && (
        <g>
          <circle cx={cx + size * 0.4} cy={cy - size * 0.55} r={7} fill="#f59e0b" />
          <text x={cx + size * 0.4} y={cy - size * 0.55 + 3.5} textAnchor="middle" fill="white" fontSize={9} fontWeight={700}>!</text>
        </g>
      )}
      {alert === "ok" && (
        <g>
          <circle cx={cx + size * 0.4} cy={cy - size * 0.55} r={6} fill="#10b981" />
          <text x={cx + size * 0.4} y={cy - size * 0.55 + 3} textAnchor="middle" fill="white" fontSize={7} fontWeight={700}>✓</text>
        </g>
      )}
    </g>
  );
}

function OntologyDiagram() {
  const { data: factories, isLoading: factoriesLoading, isError: factoriesError } = useQuery<any[]>({
    queryKey: ["/api/ontology/objects/factory"],
    retry: 1,
    staleTime: 60000,
  });

  const factoryId = factories?.[0]?.id;

  const { data: intelligence, isLoading: intelligenceLoading, isError: intelligenceError } = useQuery<any>({
    queryKey: ["/api/ontology/intelligence/factory/" + factoryId],
    enabled: !!factoryId,
    refetchInterval: 30000,
    retry: 1,
    staleTime: 15000,
  });

  if (factoriesLoading || (factoryId && intelligenceLoading)) {
    return (
      <Card className="border-white/10" style={{ background: "#0a0a0f" }}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-teal-400 animate-pulse" />
            <span className="text-sm text-muted-foreground">Ontology graph yükleniyor...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (factoriesError || intelligenceError || !factories?.length || !intelligence) {
    return (
      <Card className="border-white/10" style={{ background: "#0a0a0f" }}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-muted-foreground">Ontology veritabanı henüz oluşturulmadı. <code className="text-xs">npm run db:push</code> çalıştırın.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const lineUtils = intelligence.lineUtilization || [];
  const bottleneckIds = new Set((intelligence.bottlenecks || []).map((b: any) => b.lineId));
  const summary = intelligence.summary || {};

  // Layout constants for the 3-layer diagram
  const W = 780;
  const H = 520;

  // ── DATA LAYER (bottom) ──────────────────────────────
  const dataY = 430;
  const dataSources = [
    { label: "Vardiya Kayıtları", x: 160 },
    { label: "Operatör Profilleri", x: 390 },
    { label: "Üretim Çıktısı", x: 620 },
  ];

  // ── ONTOLOGY LAYER (middle) ──────────────────────────
  const ontoY = 240;
  const ontologyNodes = [
    { label: "Fabrika", sublabel: "Çukurova", x: 80, alert: undefined as "warning" | "ok" | undefined },
    { label: "Lokasyon", sublabel: "2 bina", x: 210 },
    { label: "Hat 1", sublabel: `%${lineUtils[0]?.avgUtilization ?? "—"}`, x: 320, alert: (bottleneckIds.has(lineUtils[0]?.lineId) ? "warning" : "ok") as "warning" | "ok" },
    { label: "Hat 2", sublabel: `%${lineUtils[1]?.avgUtilization ?? "—"}`, x: 410, alert: (bottleneckIds.has(lineUtils[1]?.lineId) ? "warning" : "ok") as "warning" | "ok" },
    { label: "Hat 3", sublabel: `%${lineUtils[2]?.avgUtilization ?? "—"}`, x: 500, alert: (bottleneckIds.has(lineUtils[2]?.lineId) ? "warning" : "ok") as "warning" | "ok" },
    { label: "Hat 4", sublabel: `%${lineUtils[3]?.avgUtilization ?? "—"}`, x: 590, alert: (bottleneckIds.has(lineUtils[3]?.lineId) ? "warning" : "ok") as "warning" | "ok" },
    { label: "Operatör", sublabel: `${summary.totalOperators ?? 10}`, x: 700 },
  ];

  // ── ACTION LAYER (top) ───────────────────────────────
  const actionY = 62;
  const actions = [
    { label: "Darboğaz Tespiti", x: 160, icon: "⚠️" },
    { label: "Vardiya Optimizasyonu", x: 390, icon: "📊" },
    { label: "Maliyet Simülasyonu", x: 620, icon: "💰" },
  ];

  // Connection edges for ontology layer
  const ontoEdges = [
    [0, 1], [1, 2], [1, 3], [1, 4], [1, 5], [2, 6], [3, 6], [4, 6], [5, 6],
  ];

  return (
    <Card className="border-white/10 overflow-hidden" style={{ background: "#0a0a0f" }}>
      <CardHeader className="pb-1">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-teal-400" />
          Ontology Graph
          <Badge variant="outline" className="ml-auto text-xs bg-teal-500/10 text-teal-400 border-teal-500/20">
            LIVE
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {summary.totalLines} hat · {summary.totalOperators} operatör · Genel verimlilik %{summary.overallUtilization}
        </p>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 460 }} className="overflow-visible">
          <defs>
            {/* Ontology layer glow filter */}
            <filter id="onto-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* ═══ LAYER LABELS ═══ */}
          {/* Action label */}
          <text x={28} y={actionY - 28} fill="rgba(16,185,129,0.6)" fontSize={9} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.12em">
            AKSİYON & KARAR
          </text>
          {/* Ontology label */}
          <text x={28} y={ontoY - 58} fill="rgba(20,184,166,0.6)" fontSize={9} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.12em">
            GRİSEUS ONTOLOGY
          </text>
          {/* Data label */}
          <text x={28} y={dataY - 38} fill="rgba(148,163,184,0.4)" fontSize={9} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.12em">
            VERİ KAYNAKLARI
          </text>

          {/* ═══ ONTOLOGY LAYER BACKGROUND (teal glow zone) ═══ */}
          <rect x={20} y={ontoY - 55} width={W - 40} height={120} rx={12} fill="rgba(20,184,166,0.03)" stroke="rgba(20,184,166,0.12)" strokeWidth={1} />
          {/* Inner glow */}
          <ellipse cx={W / 2} cy={ontoY} rx={300} ry={40} fill="rgba(20,184,166,0.04)" style={{ filter: "blur(20px)" }} />

          {/* ═══ DATA LAYER — isometric boxes ═══ */}
          {dataSources.map((src, i) => (
            <g key={src.label}>
              <IsoCube cx={src.x} cy={dataY} size={42} topColor="#1e293b" leftColor="#172032" rightColor="#131b28" />
              {/* Grid/person/chart icon (simplified geometric) */}
              {i === 0 && (
                <g opacity={0.5}>
                  {[0, 5, 10].map(dx => [0, 5, 10].map(dy => (
                    <rect key={`${dx}-${dy}`} x={src.x - 7 + dx} y={dataY - 12 + dy} width={3} height={3} rx={0.5} fill="#94a3b8" />
                  )))}
                </g>
              )}
              {i === 1 && (
                <g opacity={0.5}>
                  <circle cx={src.x} cy={dataY - 10} r={4} fill="#94a3b8" />
                  <path d={`M${src.x - 6},${dataY + 2} Q${src.x},${dataY - 3} ${src.x + 6},${dataY + 2}`} fill="#94a3b8" />
                </g>
              )}
              {i === 2 && (
                <g opacity={0.5}>
                  <rect x={src.x - 8} y={dataY - 4} width={4} height={10} rx={1} fill="#94a3b8" />
                  <rect x={src.x - 2} y={dataY - 10} width={4} height={16} rx={1} fill="#94a3b8" />
                  <rect x={src.x + 4} y={dataY - 7} width={4} height={13} rx={1} fill="#94a3b8" />
                </g>
              )}
              <text x={src.x} y={dataY + 36} textAnchor="middle" fill="rgba(148,163,184,0.5)" fontSize={9} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
                {src.label}
              </text>
            </g>
          ))}

          {/* ═══ FLOW LINES: Data → Ontology ═══ */}
          {dataSources.map((src, i) => {
            const targetX = i === 0 ? 210 : i === 1 ? 410 : 590;
            return (
              <g key={`data-flow-${i}`}>
                <line x1={src.x} y1={dataY - 28} x2={targetX} y2={ontoY + 40} stroke="rgba(20,184,166,0.08)" strokeWidth={1} strokeDasharray="3 4" />
                <FlowDot x1={src.x} y1={dataY - 28} x2={targetX} y2={ontoY + 40} color="#14b8a6" dur={2.5} delay={i * 0.6} />
              </g>
            );
          })}

          {/* ═══ ONTOLOGY LAYER — nodes and edges ═══ */}
          {/* Edges first (behind nodes) */}
          {ontoEdges.map(([from, to], i) => {
            const a = ontologyNodes[from];
            const b = ontologyNodes[to];
            return (
              <g key={`edge-${i}`}>
                <line x1={a.x} y1={ontoY} x2={b.x} y2={ontoY} stroke="rgba(20,184,166,0.18)" strokeWidth={1.2} />
                <FlowDot x1={a.x} y1={ontoY} x2={b.x} y2={ontoY} color="#14b8a6" dur={2 + i * 0.2} delay={i * 0.3} />
              </g>
            );
          })}

          {/* Nodes */}
          {ontologyNodes.map((node) => (
            <OntologyNode
              key={node.label}
              cx={node.x}
              cy={ontoY}
              label={node.label}
              sublabel={node.sublabel}
              color="#14b8a6"
              alert={node.alert}
              size={28}
            />
          ))}

          {/* ═══ FLOW LINES: Ontology → Actions ═══ */}
          {actions.map((action, i) => {
            const sourceX = i === 0 ? 320 : i === 1 ? 500 : 590;
            return (
              <g key={`onto-flow-${i}`}>
                <line x1={sourceX} y1={ontoY - 35} x2={action.x} y2={actionY + 30} stroke="rgba(16,185,129,0.08)" strokeWidth={1} strokeDasharray="3 4" />
                <FlowDot x1={sourceX} y1={ontoY - 35} x2={action.x} y2={actionY + 30} color="#10b981" dur={2.2} delay={i * 0.5} />
              </g>
            );
          })}

          {/* ═══ ACTION LAYER — floating cards ═══ */}
          {actions.map((action) => (
            <g key={action.label}>
              <rect x={action.x - 72} y={actionY - 18} width={144} height={38} rx={8} fill="rgba(16,185,129,0.05)" stroke="rgba(16,185,129,0.2)" strokeWidth={1} />
              <text x={action.x} y={actionY + 6} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={10.5} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
                {action.icon} {action.label}
              </text>
            </g>
          ))}

          {/* ═══ LAYER SEPARATOR LINES ═══ */}
          <line x1={20} y1={ontoY + 62} x2={W - 20} y2={ontoY + 62} stroke="rgba(255,255,255,0.03)" strokeWidth={1} strokeDasharray="6 4" />
          <line x1={20} y1={ontoY - 70} x2={W - 20} y2={ontoY - 70} stroke="rgba(255,255,255,0.03)" strokeWidth={1} strokeDasharray="6 4" />
        </svg>
      </CardContent>
    </Card>
  );
}

// ── Production Intelligence ─────────────────────────────────────────────

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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Production Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time production line monitoring and operator performance</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Weekly Output</p>
                <p className="text-2xl font-bold mt-1">{totalActual.toLocaleString()}</p>
              </div>
              <div className={`p-2 rounded-lg ${fulfillment >= 100 ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                {fulfillment >= 100 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-amber-400" />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <span className={fulfillment >= 100 ? "text-emerald-400" : "text-amber-400"}>{fulfillment}%</span> of target
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active Lines</p>
                <p className="text-2xl font-bold mt-1">
                  {activeLines}/{PRODUCTION_LINES.length}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Factory className="h-5 w-5 text-blue-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <span className="text-amber-400">1 in maintenance</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Operator Utilization</p>
                <p className="text-2xl font-bold mt-1">{avgUtilization}%</p>
              </div>
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Users className="h-5 w-5 text-violet-400" />
              </div>
            </div>
            <Progress value={avgUtilization} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">On-shift Now</p>
                <p className="text-2xl font-bold mt-1">{OPERATORS.filter((o) => o.shift === "morning").length}</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Clock className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Morning shift active</p>
          </CardContent>
        </Card>
      </div>

      {/* Ontology Diagram — Palantir-style architecture visualization */}
      <OntologyDiagram />

      {/* Production Lines */}
      <div className="grid lg:grid-cols-2 gap-4">
        {PRODUCTION_LINES.map((line) => {
          const lineOps = OPERATORS.filter((o) => o.line === line.id);
          const lineUtil =
            lineOps.length > 0 ? Math.round(lineOps.reduce((s, o) => s + o.utilization, 0) / lineOps.length) : 0;
          return (
            <Card key={line.id} className="border-white/10">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{line.name}</h3>
                    <p className="text-xs text-muted-foreground">{line.product}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      line.status === "running"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }
                  >
                    {line.status === "running" ? (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 mr-1" />
                    )}
                    {line.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-lg font-bold">{line.capacity}</p>
                    <p className="text-[10px] text-muted-foreground">units/day</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-lg font-bold">{lineOps.length}</p>
                    <p className="text-[10px] text-muted-foreground">operators</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-lg font-bold">{lineUtil}%</p>
                    <p className="text-[10px] text-muted-foreground">utilization</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Daily Output Chart */}
      <Card className="border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Daily Output — Target vs Actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DAILY_OUTPUT}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                  labelStyle={{ color: "#fff" }}
                />
                <Legend />
                <Bar dataKey="target" fill="#3B82F6" radius={[4, 4, 0, 0]} opacity={0.4} name="Target" />
                <Bar dataKey="actual" fill="#22C55E" radius={[4, 4, 0, 0]} name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Operator Utilization */}
      <Card className="border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-400" />
            Operator Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={OPERATORS.filter((o) => o.utilization > 0).sort((a, b) => b.utilization - a.utilization)}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" domain={[0, 100]} stroke="#64748b" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} width={120} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                  formatter={(v: number) => `${v}%`}
                />
                <Bar dataKey="utilization" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Seasonal Demand Forecast */}
      <SeasonalDemandForecast />
    </div>
  );
}

// ── Seasonal Demand Forecast ────────────────────────────────────────────

const SEASONAL_DEMAND = [
  { month: "Jan", demand: 3 },
  { month: "Feb", demand: 2 },
  { month: "Mar", demand: 3 },
  { month: "Apr", demand: 4 },
  { month: "May", demand: 4 },
  { month: "Jun", demand: 5 },
  { month: "Jul", demand: 5 },
  { month: "Aug", demand: 6 },
  { month: "Sep", demand: 10 },
  { month: "Oct", demand: 9 },
  { month: "Nov", demand: 7 },
  { month: "Dec", demand: 6 },
];

function SeasonalDemandForecast() {
  const peakMonths = new Set(["Sep", "Oct"]);

  return (
    <div className="space-y-4">
      {/* Peak Season Banner */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <p className="font-semibold text-amber-400">Peak season in 26 weeks — recommend hiring 8 additional technicians now</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sep–Oct demand index reaches 9–10. Current workforce will be at 130% capacity without reinforcement.
          </p>
        </div>
      </div>

      {/* Forecast Chart */}
      <Card className="border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-400" />
            Seasonal Demand Forecast — 12-Month Outlook
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SEASONAL_DEMAND} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis domain={[0, 10]} stroke="#64748b" fontSize={12} tickCount={6} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(v: number) => [`${v} / 10`, "Demand Index"]}
                />
                <ReferenceLine y={7} stroke="#F59E0B" strokeDasharray="5 5" label={{ value: "High demand threshold", fill: "#F59E0B", fontSize: 11, position: "insideTopRight" }} />
                <Bar dataKey="demand" radius={[4, 4, 0, 0]}>
                  {SEASONAL_DEMAND.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={
                        peakMonths.has(entry.month)
                          ? entry.demand >= 10
                            ? "#EF4444"
                            : "#F97316"
                          : entry.demand >= 7
                            ? "#F59E0B"
                            : "#3B82F6"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#3B82F6]" />
              Normal (1–6)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#F59E0B]" />
              High (7–8)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#F97316]" />
              Peak (9)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#EF4444]" />
              Critical (10)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Workforce Scheduling ────────────────────────────────────────────────

function WorkforceScheduling() {
  const [selectedLine, setSelectedLine] = useState<string>("all");

  const filteredOps = selectedLine === "all" ? OPERATORS : OPERATORS.filter((o) => o.line === selectedLine);

  // Skills matrix data for radar chart
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

      {/* Shift Calendar */}
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
                      <Badge
                        variant="outline"
                        className="bg-blue-500/10 text-blue-400 border-blue-500/20 min-w-[40px] justify-center"
                      >
                        {row.morning}
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-4">
                      <Badge
                        variant="outline"
                        className="bg-violet-500/10 text-violet-400 border-violet-500/20 min-w-[40px] justify-center"
                      >
                        {row.afternoon}
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-4">
                      <Badge
                        variant="outline"
                        className="bg-gray-500/10 text-gray-400 border-gray-500/20 min-w-[40px] justify-center"
                      >
                        {row.night}
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-4 font-semibold">{row.morning + row.afternoon + row.night}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Technician Assignments */}
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
                <div
                  key={op.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-card hover:border-white/20 transition-all"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {op.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{op.name}</span>
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${op.utilization > 0 ? "bg-emerald-400" : "bg-gray-400"}`}
                      />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{line?.name.split(" — ")[0]}</span>
                      <span className="capitalize">{op.shift} shift</span>
                      <span>{op.utilization}% util.</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 max-w-[200px] justify-end">
                    {op.skills.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px] border-white/10 capitalize">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Skills Matrix Radar */}
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

  // Simulation model (simplified)
  const operatorCostPerDay = 2800; // TRY per operator per day
  const unitRevenue = targetLine === "L1" ? 450 : targetLine === "L2" ? 320 : targetLine === "L3" ? 180 : 95; // TRY per unit
  const marginalOutputPerOperator = Math.round(line.capacity * 0.12); // each new operator adds ~12% of line capacity
  const projectedOutputIncrease = addOperators * marginalOutputPerOperator;
  const additionalDailyCost = addOperators * operatorCostPerDay;
  const additionalDailyRevenue = projectedOutputIncrease * unitRevenue;
  const netDailyImpact = additionalDailyRevenue - additionalDailyCost;
  const monthlyImpact = netDailyImpact * 22; // working days

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

      {/* Scenario Builder */}
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
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCTION_LINES.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                Add Operators: <span className="text-primary font-bold">{addOperators}</span>
              </Label>
              <Slider
                value={[addOperators]}
                onValueChange={(v) => { setAddOperators(v[0]); setSimulated(false); }}
                min={1}
                max={8}
                step={1}
                className="mt-3"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>1</span>
                <span>8</span>
              </div>
            </div>
          </div>

          <div className="bg-background/50 rounded-lg p-4 border text-sm space-y-1">
            <p className="text-muted-foreground">
              Current state: <span className="text-foreground font-medium">{line.name}</span> has{" "}
              <span className="text-foreground font-medium">{currentOps} operators</span> producing{" "}
              <span className="text-foreground font-medium">{line.capacity} units/day</span>
            </p>
            <p className="text-muted-foreground">
              Scenario: Add <span className="text-primary font-medium">{addOperators} operators</span> →{" "}
              <span className="text-foreground font-medium">+{projectedOutputIncrease} units/day</span> projected increase
            </p>
          </div>

          <Button onClick={() => setSimulated(true)} className="w-full" disabled={simulated}>
            {simulated ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Simulation Complete
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Simulation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {simulated && (
        <>
          {/* Impact KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Output Increase</p>
                <p className="text-2xl font-bold mt-1 flex items-center gap-1">
                  +{projectedOutputIncrease}
                  <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                </p>
                <p className="text-xs text-muted-foreground">units/day</p>
              </CardContent>
            </Card>
            <Card className="border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Daily Cost</p>
                <p className="text-2xl font-bold mt-1 flex items-center gap-1">
                  +₺{additionalDailyCost.toLocaleString()}
                  <ArrowDownRight className="h-4 w-4 text-red-400" />
                </p>
                <p className="text-xs text-muted-foreground">per day</p>
              </CardContent>
            </Card>
            <Card className="border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Daily Revenue</p>
                <p className="text-2xl font-bold mt-1 flex items-center gap-1">
                  +₺{additionalDailyRevenue.toLocaleString()}
                  <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                </p>
                <p className="text-xs text-muted-foreground">per day</p>
              </CardContent>
            </Card>
            <Card className={`border-white/10 ${netDailyImpact >= 0 ? "" : "border-red-500/20"}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Monthly Net Impact</p>
                <p
                  className={`text-2xl font-bold mt-1 ${monthlyImpact >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {monthlyImpact >= 0 ? "+" : ""}₺{(monthlyImpact / 1000).toFixed(0)}K
                </p>
                <p className="text-xs text-muted-foreground">per month (22 working days)</p>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Projection Chart */}
          <Card className="border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                6-Month Revenue Projection (₺K)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scenarioData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "#1e293b",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                      }}
                      formatter={(v: number) => `₺${v}K`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="currentRevenue"
                      stroke="#64748b"
                      strokeDasharray="5 5"
                      name="Current Revenue"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="projectedRevenue"
                      stroke="#22C55E"
                      strokeWidth={2}
                      name="Projected Revenue"
                    />
                    <Line
                      type="monotone"
                      dataKey="additionalCost"
                      stroke="#EF4444"
                      strokeDasharray="3 3"
                      name="Additional Cost"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ROI Summary */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-400" />
                ROI Summary
              </h3>
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Payback Period</p>
                  <p className="text-lg font-bold mt-0.5">
                    {netDailyImpact > 0 ? `${Math.ceil(additionalDailyCost / netDailyImpact)} days` : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">6-Month Net Profit</p>
                  <p className={`text-lg font-bold mt-0.5 ${monthlyImpact >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {monthlyImpact >= 0 ? "+" : ""}₺{((monthlyImpact * 6) / 1000).toFixed(0)}K
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recommendation</p>
                  <p className="text-lg font-bold mt-0.5">
                    {netDailyImpact > 0 ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Profitable
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" /> Not Recommended
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={() => setSimulated(false)} className="w-full">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset & Try New Scenario
          </Button>
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
