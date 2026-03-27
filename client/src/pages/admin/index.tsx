import { usePageMeta } from "@/hooks/use-page-meta";
import { AdminSidebar } from "@/components/admin-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useState } from "react";

/* ───────────────────────────────────────────────────────
   Palantir-style Isometric Platform View for Griseus
   Adapted for Çukurova Isı Sistemleri admin overview
   ─────────────────────────────────────────────────────── */

// Node data for the main platform grid
const platformNodes = [
  { id: "factory", label: "Fabrika", icon: "factory", x: 0, y: 0 },
  { id: "stok", label: "Stok", icon: "box", x: -120, y: -30 },
  { id: "uretim", label: "Üretim", icon: "gear", x: -80, y: -70 },
  { id: "tedarik", label: "Tedarik", icon: "truck", x: 0, y: -90 },
  { id: "kalite", label: "Kalite", icon: "check", x: 80, y: -70 },
  { id: "finans", label: "Finans", icon: "coin", x: 120, y: -30 },
  { id: "sevkiyat", label: "Sevkiyat", icon: "ship", x: 120, y: 30 },
  { id: "bakim", label: "Bakım", icon: "wrench", x: 80, y: 70 },
  { id: "ik", label: "İK", icon: "people", x: 0, y: 90 },
  { id: "satis", label: "Satış", icon: "chart", x: -80, y: 70 },
  { id: "depo", label: "Depo", icon: "warehouse", x: -120, y: 30 },
];

// Connections between nodes (from center factory to each)
const connections = [
  ["factory", "stok"], ["factory", "uretim"], ["factory", "tedarik"],
  ["factory", "kalite"], ["factory", "finans"], ["factory", "sevkiyat"],
  ["factory", "bakim"], ["factory", "ik"], ["factory", "satis"], ["factory", "depo"],
  // Cross-connections
  ["stok", "uretim"], ["uretim", "tedarik"], ["tedarik", "kalite"],
  ["kalite", "finans"], ["stok", "depo"], ["satis", "sevkiyat"],
  ["bakim", "ik"], ["depo", "satis"],
];

// Floating panels above the platform
const floatingPanels = [
  { id: "app-stok", label: "Stok Dashboard", type: "Application", x: -280, y: -160 },
  { id: "app-intel", label: "Intelligence", type: "Application", x: -180, y: -220 },
  { id: "auto-alert", label: "Alert Engine", type: "Automation", x: -60, y: -250 },
  { id: "auto-schedule", label: "Scheduling", type: "Automation", x: 60, y: -250 },
  { id: "agent-ceo", label: "CEO Agent", type: "Agent", x: 180, y: -220 },
  { id: "agent-uretim", label: "Üretim Agent", type: "Agent", x: 280, y: -160 },
  { id: "whatif", label: "What-If Motor", type: "IDE", x: 0, y: -280 },
];

// Panel connections to platform nodes
const panelLinks: Record<string, string[]> = {
  "app-stok": ["stok", "depo"],
  "app-intel": ["uretim", "kalite"],
  "auto-alert": ["stok", "tedarik"],
  "auto-schedule": ["uretim", "bakim"],
  "agent-ceo": ["finans", "satis"],
  "agent-uretim": ["uretim", "kalite"],
  "whatif": ["factory"],
};

function NodeIcon({ icon, x, y }: { icon: string; x: number; y: number }) {
  const s = 8;
  switch (icon) {
    case "factory":
      return (
        <g transform={`translate(${x},${y})`}>
          {/* Main building */}
          <rect x="-10" y="-14" width="20" height="18" rx="1" fill="rgba(139,92,246,0.3)" stroke="rgba(139,92,246,0.8)" strokeWidth="0.8" />
          {/* Chimney */}
          <rect x="-6" y="-20" width="4" height="8" fill="rgba(139,92,246,0.25)" stroke="rgba(139,92,246,0.6)" strokeWidth="0.6" />
          <rect x="2" y="-18" width="4" height="6" fill="rgba(139,92,246,0.25)" stroke="rgba(139,92,246,0.6)" strokeWidth="0.6" />
          {/* Windows */}
          <rect x="-6" y="-8" width="4" height="4" rx="0.5" fill="rgba(139,92,246,0.5)" />
          <rect x="2" y="-8" width="4" height="4" rx="0.5" fill="rgba(139,92,246,0.5)" />
          {/* Door */}
          <rect x="-2" y="-2" width="4" height="6" rx="0.5" fill="rgba(139,92,246,0.6)" />
        </g>
      );
    case "box":
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x={-s/2} y={-s/2} width={s} height={s} rx="1" fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,0.7)" strokeWidth="0.8" />
          <line x1={-s/2} y1="0" x2={s/2} y2="0" stroke="rgba(59,130,246,0.4)" strokeWidth="0.5" />
        </g>
      );
    case "gear":
      return <circle cx={x} cy={y} r={s/2} fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.7)" strokeWidth="0.8" />;
    case "truck":
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x="-5" y="-3" width="7" height="6" rx="0.5" fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,0.7)" strokeWidth="0.7" />
          <rect x="2" y="-1" width="4" height="4" rx="0.5" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.5)" strokeWidth="0.6" />
        </g>
      );
    case "check":
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x="-4" y="-4" width="8" height="8" rx="1" fill="rgba(16,185,129,0.2)" stroke="rgba(16,185,129,0.7)" strokeWidth="0.8" />
          <polyline points="-2,0 -0.5,2 2.5,-2" fill="none" stroke="rgba(16,185,129,0.8)" strokeWidth="1" />
        </g>
      );
    case "coin":
      return <circle cx={x} cy={y} r={s/2} fill="rgba(245,158,11,0.2)" stroke="rgba(245,158,11,0.7)" strokeWidth="0.8" />;
    case "ship":
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x="-5" y="-2" width="10" height="5" rx="0.5" fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,0.7)" strokeWidth="0.7" />
          <polygon points="-5,-2 0,-5 5,-2" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.5)" strokeWidth="0.6" />
        </g>
      );
    case "wrench":
      return (
        <g transform={`translate(${x},${y})`}>
          <circle r="4" fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.6)" strokeWidth="0.8" />
          <line x1="-2" y1="-2" x2="2" y2="2" stroke="rgba(239,68,68,0.7)" strokeWidth="1" />
        </g>
      );
    case "people":
      return (
        <g transform={`translate(${x},${y})`}>
          <circle r="2.5" cy="-2" fill="rgba(59,130,246,0.3)" stroke="rgba(59,130,246,0.7)" strokeWidth="0.7" />
          <ellipse rx="4" ry="2.5" cy="2.5" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.5)" strokeWidth="0.6" />
        </g>
      );
    case "chart":
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x="-4" y="-4" width="8" height="8" rx="1" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.6)" strokeWidth="0.7" />
          <polyline points="-2,2 0,0 1,1 3,-2" fill="none" stroke="rgba(59,130,246,0.8)" strokeWidth="0.8" />
        </g>
      );
    case "warehouse":
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x="-5" y="-2" width="10" height="6" rx="0.5" fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,0.7)" strokeWidth="0.7" />
          <polygon points="-6,-2 0,-5 6,-2" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.5)" strokeWidth="0.6" />
        </g>
      );
    default:
      return <circle cx={x} cy={y} r={4} fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,0.7)" strokeWidth="0.8" />;
  }
}

function PlatformIsometric() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredPanel, setHoveredPanel] = useState<string | null>(null);

  const cx = 420;
  const cy = 380;

  const getNodePos = (id: string) => {
    const n = platformNodes.find(n => n.id === id);
    return n ? { x: cx + n.x, y: cy + n.y } : { x: cx, y: cy };
  };

  const getPanelPos = (id: string) => {
    const p = floatingPanels.find(p => p.id === id);
    return p ? { x: cx + p.x, y: cy + p.y } : { x: cx, y: cy };
  };

  const isConnectedToHovered = (nodeId: string) => {
    if (!hoveredNode && !hoveredPanel) return false;
    if (hoveredNode) {
      return connections.some(([a, b]) =>
        (a === hoveredNode && b === nodeId) || (b === hoveredNode && a === nodeId)
      );
    }
    if (hoveredPanel) {
      return panelLinks[hoveredPanel]?.includes(nodeId) ?? false;
    }
    return false;
  };

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 840 760"
      xmlns="http://www.w3.org/2000/svg"
      style={{ maxWidth: 900 }}
    >
      <defs>
        <filter id="glow-blue">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-purple">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="platform-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(59,130,246,0.08)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0.04)" />
        </linearGradient>
        <linearGradient id="base-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(139,92,246,0.06)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0.02)" />
        </linearGradient>
      </defs>

      {/* ─── LAYER 01: Enterprise Data • Logic • Action ─── */}
      <g transform={`translate(${cx}, 680)`}>
        {/* 3D block base */}
        <polygon points="0,-35 180,0 0,35 -180,0" fill="url(#base-fill)" stroke="rgba(139,92,246,0.25)" strokeWidth="0.8" />
        <line x1="-180" y1="0" x2="-180" y2="20" stroke="rgba(139,92,246,0.15)" strokeWidth="0.8" />
        <line x1="180" y1="0" x2="180" y2="20" stroke="rgba(139,92,246,0.15)" strokeWidth="0.8" />
        <line x1="0" y1="35" x2="0" y2="55" stroke="rgba(139,92,246,0.15)" strokeWidth="0.8" />
        <polygon points="0,55 180,20 0,-15 -180,20" fill="rgba(139,92,246,0.03)" stroke="rgba(139,92,246,0.12)" strokeWidth="0.6" />
        {/* Cubes pattern */}
        {[-100, -60, -20, 20, 60, 100].map(bx =>
          [-8, 0, 8].map(by => (
            <rect key={`cube-${bx}-${by}`} x={bx - 4} y={by - 4} width="8" height="8" rx="1.5"
              fill="rgba(139,92,246,0.12)" stroke="rgba(139,92,246,0.3)" strokeWidth="0.5" />
          ))
        )}
        <text x="-180" y="42" fontSize="9" fill="rgba(139,92,246,0.6)" fontFamily="var(--font-sans)" fontWeight="500">
          → Enterprise Data • Logic • Action
        </text>
      </g>

      {/* ─── LAYER 02: Governance Humans + AI ─── */}
      <g transform={`translate(${cx}, 610)`}>
        <polygon points="0,-30 160,0 0,30 -160,0" fill="rgba(139,92,246,0.04)" stroke="rgba(139,92,246,0.2)" strokeWidth="0.8" />
        {/* Connected dots pattern */}
        {[
          [-90, -5], [-50, -12], [-20, -2], [20, -8], [50, -3], [90, -8],
          [-70, 5], [-30, 8], [10, 5], [40, 10], [70, 3],
        ].map(([dx, dy], i) => (
          <g key={`gov-${i}`}>
            <circle cx={dx} cy={dy} r="3" fill="rgba(139,92,246,0.15)" stroke="rgba(139,92,246,0.4)" strokeWidth="0.6" />
            {i > 0 && (
              <line
                x1={[[-90, -5], [-50, -12], [-20, -2], [20, -8], [50, -3], [90, -8], [-70, 5], [-30, 8], [10, 5], [40, 10], [70, 3]][i-1][0]}
                y1={[[-90, -5], [-50, -12], [-20, -2], [20, -8], [50, -3], [90, -8], [-70, 5], [-30, 8], [10, 5], [40, 10], [70, 3]][i-1][1]}
                x2={dx} y2={dy}
                stroke="rgba(139,92,246,0.15)" strokeWidth="0.5"
              />
            )}
          </g>
        ))}
        <text x="-160" y="22" fontSize="9" fill="rgba(139,92,246,0.5)" fontFamily="var(--font-sans)" fontWeight="500">
          → Governance: Humans + AI
        </text>
        <text x="100" y="-8" fontSize="8" fill="rgba(139,92,246,0.45)" fontFamily="var(--font-sans)">OSDK</text>
      </g>

      {/* ─── LAYER 03: Ontology Language + Toolchain ─── */}
      <g transform={`translate(${cx}, 545)`}>
        <polygon points="0,-25 150,0 0,25 -150,0" fill="rgba(59,130,246,0.05)" stroke="rgba(59,130,246,0.25)" strokeWidth="0.8" />
        <text x="-150" y="18" fontSize="9" fill="rgba(59,130,246,0.55)" fontFamily="var(--font-sans)" fontWeight="500">
          → Griseus Ontology Language + Toolchain
        </text>
      </g>

      {/* Dashed connector lines between base layers */}
      <line x1={cx} y1="570" x2={cx} y2="580" stroke="rgba(139,92,246,0.2)" strokeWidth="0.8" strokeDasharray="3,3" />
      <line x1={cx} y1="640" x2={cx} y2="645" stroke="rgba(139,92,246,0.2)" strokeWidth="0.8" strokeDasharray="3,3" />

      {/* ─── LAYER 04: Main Platform Grid ─── */}
      <g>
        {/* Large isometric platform surface */}
        <polygon
          points={`${cx},${ cy - 120} ${cx + 220},${cy} ${cx},${cy + 120} ${cx - 220},${cy}`}
          fill="url(#platform-fill)"
          stroke="rgba(59,130,246,0.3)"
          strokeWidth="1"
        />
        {/* Platform side faces */}
        <polygon
          points={`${cx - 220},${cy} ${cx},${cy + 120} ${cx},${cy + 135} ${cx - 220},${cy + 15}`}
          fill="rgba(59,130,246,0.04)"
          stroke="rgba(59,130,246,0.15)"
          strokeWidth="0.6"
        />
        <polygon
          points={`${cx + 220},${cy} ${cx},${cy + 120} ${cx},${cy + 135} ${cx + 220},${cy + 15}`}
          fill="rgba(59,130,246,0.03)"
          stroke="rgba(59,130,246,0.12)"
          strokeWidth="0.6"
        />

        {/* Grid lines on platform */}
        {[-150, -100, -50, 0, 50, 100, 150].map(offset => (
          <line
            key={`grid-h-${offset}`}
            x1={cx + offset - 60} y1={cy + offset * 0.3 - 30}
            x2={cx + offset + 60} y2={cy + offset * 0.3 + 30}
            stroke="rgba(59,130,246,0.08)"
            strokeWidth="0.5"
          />
        ))}

        {/* Connection lines between nodes */}
        {connections.map(([fromId, toId]) => {
          const from = getNodePos(fromId);
          const to = getNodePos(toId);
          const isHighlighted = hoveredNode === fromId || hoveredNode === toId;
          return (
            <line
              key={`conn-${fromId}-${toId}`}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke={isHighlighted ? "rgba(59,130,246,0.7)" : "rgba(59,130,246,0.2)"}
              strokeWidth={isHighlighted ? 1.5 : 0.8}
              filter={isHighlighted ? "url(#glow-blue)" : undefined}
            />
          );
        })}

        {/* Node circles with icons */}
        {platformNodes.map(node => {
          const x = cx + node.x;
          const y = cy + node.y;
          const isCenter = node.id === "factory";
          const isHovered = hoveredNode === node.id;
          const isLinked = isConnectedToHovered(node.id);
          const r = isCenter ? 28 : 18;
          const opacity = (hoveredNode && !isHovered && !isLinked && hoveredNode !== node.id) ? 0.3 : 1;

          return (
            <g
              key={node.id}
              style={{ cursor: "pointer", opacity, transition: "opacity 0.2s" }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Outer glow ring */}
              <circle cx={x} cy={y} r={r + 4}
                fill="none"
                stroke={isCenter ? "rgba(139,92,246,0.15)" : "rgba(59,130,246,0.1)"}
                strokeWidth={isHovered ? 1.5 : 0.5}
              />
              {/* Main circle */}
              <circle cx={x} cy={y} r={r}
                fill={isCenter ? "rgba(139,92,246,0.1)" : "rgba(59,130,246,0.06)"}
                stroke={isCenter ? "rgba(139,92,246,0.6)" : "rgba(59,130,246,0.4)"}
                strokeWidth={isHovered ? 2 : 1}
                filter={isHovered ? "url(#glow-blue)" : undefined}
              />
              {/* Icon */}
              <NodeIcon icon={node.icon} x={x} y={y - (isCenter ? 4 : 2)} />
              {/* Label */}
              <text
                x={x} y={y + (isCenter ? 18 : 12)}
                textAnchor="middle"
                fontSize={isCenter ? "9" : "7.5"}
                fill={isCenter ? "rgba(139,92,246,0.9)" : "rgba(255,255,255,0.7)"}
                fontFamily="var(--font-sans)"
                fontWeight={isCenter ? "600" : "500"}
              >
                {node.label}
              </text>
              {isCenter && (
                <text x={x} y={y + 26} textAnchor="middle" fontSize="6.5"
                  fill="rgba(139,92,246,0.5)" fontFamily="var(--font-sans)">
                  Çukurova Isı
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Dashed connector from platform to ontology layer */}
      <line x1={cx} y1={cy + 135} x2={cx} y2="520" stroke="rgba(59,130,246,0.2)" strokeWidth="0.8" strokeDasharray="4,4" />

      {/* ─── LAYER 05: Floating Panels ─── */}
      {floatingPanels.map(panel => {
        const px = cx + panel.x;
        const py = cy + panel.y;
        const isHovered = hoveredPanel === panel.id;
        const typeColors: Record<string, { bg: string; border: string; text: string }> = {
          Application: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.4)", text: "rgba(59,130,246,0.7)" },
          Automation: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.4)", text: "rgba(245,158,11,0.7)" },
          Agent: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.4)", text: "rgba(16,185,129,0.7)" },
          IDE: { bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.4)", text: "rgba(139,92,246,0.7)" },
        };
        const c = typeColors[panel.type] || typeColors.Application;

        // Lines from panel to linked nodes
        const links = panelLinks[panel.id] || [];

        return (
          <g
            key={panel.id}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredPanel(panel.id)}
            onMouseLeave={() => setHoveredPanel(null)}
          >
            {/* Connection lines to platform nodes */}
            {links.map(nodeId => {
              const np = getNodePos(nodeId);
              return (
                <line
                  key={`pl-${panel.id}-${nodeId}`}
                  x1={px} y1={py + 20}
                  x2={np.x} y2={np.y - 20}
                  stroke={isHovered ? c.border : "rgba(59,130,246,0.12)"}
                  strokeWidth={isHovered ? 1.2 : 0.6}
                  strokeDasharray={isHovered ? "none" : "3,3"}
                />
              );
            })}

            {/* Panel card */}
            <rect
              x={px - 50} y={py - 18}
              width="100" height="36"
              rx="4"
              fill={isHovered ? c.bg.replace("0.08", "0.15") : c.bg}
              stroke={c.border}
              strokeWidth={isHovered ? 1.5 : 0.8}
              filter={isHovered ? "url(#glow-blue)" : undefined}
            />
            {/* Panel type label */}
            <text x={px} y={py - 6} textAnchor="middle" fontSize="6.5"
              fill={c.text} fontFamily="var(--font-sans)" fontWeight="500">
              {panel.type}
            </text>
            {/* Panel name */}
            <text x={px} y={py + 8} textAnchor="middle" fontSize="8"
              fill="rgba(255,255,255,0.85)" fontFamily="var(--font-sans)" fontWeight="600">
              {panel.label}
            </text>
            {/* Mini decorations inside panel */}
            <line x1={px - 35} y1={py + 13} x2={px - 15} y2={py + 13}
              stroke={c.border} strokeWidth="0.5" opacity="0.4" />
            <line x1={px - 35} y1={py + 16} x2={px - 5} y2={py + 16}
              stroke={c.border} strokeWidth="0.3" opacity="0.3" />
          </g>
        );
      })}

      {/* Title */}
      <text x={cx} y="60" textAnchor="middle" fontSize="14" fill="rgba(255,255,255,0.9)"
        fontFamily="var(--font-sans)" fontWeight="700" letterSpacing="2">
        GRISEUS PLATFORM ARCHITECTURE
      </text>
      <text x={cx} y="78" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)"
        fontFamily="var(--font-sans)" letterSpacing="3">
        ONTOLOGY-DRIVEN INTELLIGENCE FOR MANUFACTURING
      </text>
    </svg>
  );
}

export default function AdminPage() {
  usePageMeta("Griseus Admin", "Platform architecture and administration");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full" style={{ background: "#08080c" }}>
        <AdminSidebar />
        <SidebarInset className="flex-1" style={{ background: "#08080c" }}>
          <div className="flex flex-col min-h-screen">
            {/* Header bar */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">G</span>
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-white">Griseus Admin</h1>
                  <p className="text-[10px] text-white/40">Çukurova Isı Sistemleri</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] text-white/30 uppercase tracking-widest">Ontology Engine v1</span>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </header>

            {/* Main isometric view */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
              <PlatformIsometric />
            </div>

            {/* Bottom legend */}
            <footer className="px-6 py-3 border-t border-white/5 flex items-center gap-6 flex-wrap">
              {[
                { color: "bg-blue-500", label: "Application" },
                { color: "bg-amber-500", label: "Automation" },
                { color: "bg-emerald-500", label: "Agent" },
                { color: "bg-purple-500", label: "IDE / Engine" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${item.color}`} />
                  <span className="text-[10px] text-white/50">{item.label}</span>
                </div>
              ))}
              <div className="ml-auto text-[10px] text-white/20">
                Hover nodes to explore connections
              </div>
            </footer>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
