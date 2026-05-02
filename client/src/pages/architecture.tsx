import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Color Palette ──
const P = {
  bg: "#0a0a0f",
  grid: "rgba(99,102,241,0.06)",
  accent: "#6366f1",
  accentDim: "rgba(99,102,241,0.15)",
  accentGlow: "rgba(99,102,241,0.3)",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  green: "#34d399",
  orange: "#f59e0b",
  red: "#ef4444",
  white: "#f1f5f9",
  dim: "#64748b",
  surface: "rgba(15,15,25,0.85)",
  border: "rgba(99,102,241,0.2)",
};

const mono = "'SF Mono', 'Fira Code', 'Consolas', monospace";

// ── Layer definitions ──
interface LayerNode {
  id: string;
  label: string;
  sublabel?: string;
  icon: string;
  color: string;
  x: number; // percentage position
  y: number;
}

interface Layer {
  id: string;
  label: string;
  sublabel: string;
  color: string;
  zIndex: number;
  nodes: LayerNode[];
}

const layers: Layer[] = [
  {
    id: "data",
    label: "Enterprise Data",
    sublabel: "PostgreSQL + Netsis ERP + WebSocket",
    color: P.dim,
    zIndex: 0,
    nodes: [
      { id: "pg", label: "PostgreSQL", sublabel: "Ana veritabanı", icon: "🗄️", color: P.blue, x: 20, y: 50 },
      { id: "netsis", label: "Netsis ERP", sublabel: "Stok import", icon: "📊", color: P.orange, x: 50, y: 50 },
      { id: "ws", label: "WebSocket", sublabel: "Canlı veri akışı", icon: "↔", color: P.cyan, x: 80, y: 50 },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    sublabel: "Humans + AI · Roles & Permissions",
    color: P.dim,
    zIndex: 1,
    nodes: [
      { id: "auth", label: "Authentication", sublabel: "Passport.js", icon: "🔐", color: P.accent, x: 30, y: 50 },
      { id: "roles", label: "Role-Based Access", sublabel: "Üretim / Yönetim", icon: "👥", color: P.accent, x: 70, y: 50 },
    ],
  },
  {
    id: "ontology",
    label: "Ontology Language",
    sublabel: "Objects · Links · Actions · Rules",
    color: P.accent,
    zIndex: 2,
    nodes: [
      { id: "products", label: "Products", sublabel: "ELT.7-11", icon: "📦", color: P.green, x: 12, y: 50 },
      { id: "bom", label: "BOM Ağacı", sublabel: "43 bileşen · 3 tier", icon: "🌳", color: P.green, x: 32, y: 50 },
      { id: "stock", label: "Stock Levels", sublabel: "Üretim · Depo · Satış", icon: "📈", color: P.cyan, x: 52, y: 50 },
      { id: "movements", label: "Movements", sublabel: "Stok hareketleri", icon: "🔄", color: P.blue, x: 72, y: 50 },
      { id: "suggestions", label: "Suggestions", sublabel: "Satın alma önerileri", icon: "💡", color: P.orange, x: 92, y: 50 },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence + Actions",
    sublabel: "OODA Loop · Rules Engine · Agent Tools",
    color: P.cyan,
    zIndex: 3,
    nodes: [
      { id: "intel", label: "Intelligence API", sublabel: "Tüketim hızı · Trend", icon: "🧠", color: P.cyan, x: 15, y: 50 },
      { id: "rules", label: "Rules Engine", sublabel: "Proaktif uyarılar", icon: "⚙️", color: P.orange, x: 38, y: 50 },
      { id: "tools", label: "Agent Tools", sublabel: "5 tool · OAG", icon: "🔧", color: P.accent, x: 62, y: 50 },
      { id: "ooda", label: "OODA Loop", sublabel: "Observe→Act", icon: "🎯", color: P.red, x: 85, y: 50 },
    ],
  },
  {
    id: "apps",
    label: "Applications",
    sublabel: "User-Facing Interfaces",
    color: P.green,
    zIndex: 4,
    nodes: [
      { id: "stok", label: "Stok Durumu", sublabel: "Komuta Merkezi", icon: "🏠", color: P.green, x: 10, y: 50 },
      { id: "hizli", label: "Hızlı Giriş", sublabel: "Üretim girişi", icon: "▸", color: P.orange, x: 30, y: 50 },
      { id: "istihbarat", label: "Ürün İstihbaratı", sublabel: "BOM · Simülasyon", icon: "🔍", color: P.blue, x: 50, y: 50 },
      { id: "agent", label: "gix", sublabel: "Doğal dil arayüzü", icon: "∴", color: P.accent, x: 70, y: 50 },
      { id: "auto", label: "Automations", sublabel: "Otomatik aksiyonlar", icon: "🔁", color: P.cyan, x: 90, y: 50 },
    ],
  },
];

// ── Isometric helpers ──
const ISO_ANGLE = 30; // degrees
const LAYER_HEIGHT = 130;
const LAYER_WIDTH = 720;
const LAYER_DEPTH = 180;

function isoTransform(layerIndex: number, totalLayers: number): string {
  const yOffset = (totalLayers - 1 - layerIndex) * LAYER_HEIGHT;
  return `translateY(${-yOffset}px)`;
}

// ── Isometric Layer Component ──
function IsoLayer({
  layer,
  index,
  total,
  isHovered,
  isSelected,
  onHover,
  onClick,
}: {
  layer: Layer;
  index: number;
  total: number;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const yBase = (total - 1 - index) * LAYER_HEIGHT;
  const lift = isHovered ? 12 : 0;
  const glow = isSelected ? `0 0 30px ${layer.color}40` : isHovered ? `0 0 20px ${layer.color}25` : "none";

  return (
    <motion.div
      onMouseEnter={() => onHover(layer.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(layer.id)}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: -yBase - lift }}
      transition={{ duration: 0.6, delay: index * 0.12, ease: "easeOut" }}
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: LAYER_WIDTH,
        height: LAYER_DEPTH,
        cursor: "pointer",
        zIndex: index + 1,
      }}
    >
      {/* Isometric platform */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: isSelected
            ? `linear-gradient(135deg, ${layer.color}18, ${layer.color}08)`
            : `linear-gradient(135deg, rgba(20,20,35,0.9), rgba(15,15,25,0.95))`,
          border: `1px solid ${isSelected ? layer.color + "60" : isHovered ? layer.color + "40" : P.border}`,
          borderRadius: 16,
          boxShadow: glow,
          transition: "all 0.3s ease",
          overflow: "hidden",
        }}
      >
        {/* Grid pattern */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.3,
          backgroundImage: `
            linear-gradient(${P.grid} 1px, transparent 1px),
            linear-gradient(90deg, ${P.grid} 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }} />

        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${layer.color}, transparent)`,
          opacity: isSelected ? 0.8 : 0.4,
        }} />

        {/* Layer label */}
        <div style={{
          position: "absolute", top: 10, left: 16,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{
            fontSize: 9, fontFamily: mono, fontWeight: 700, letterSpacing: 1.5,
            color: layer.color, textTransform: "uppercase", opacity: 0.9,
          }}>
            → {layer.label}
          </div>
          <div style={{ fontSize: 9, fontFamily: mono, color: P.dim }}>
            {layer.sublabel}
          </div>
        </div>

        {/* Nodes */}
        <div style={{
          position: "absolute", top: 36, left: 0, right: 0, bottom: 8,
          display: "flex", justifyContent: "center", alignItems: "center",
          gap: 0, padding: "0 12px",
        }}>
          {layer.nodes.map((node) => (
            <motion.div
              key={node.id}
              whileHover={{ scale: 1.08, y: -4 }}
              style={{
                flex: `0 0 ${100 / layer.nodes.length}%`,
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 2, padding: "4px 2px",
              }}
            >
              {/* Node icon bubble */}
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: `${node.color}15`,
                border: `1px solid ${node.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
                boxShadow: isSelected ? `0 0 12px ${node.color}20` : "none",
                transition: "all 0.3s",
              }}>
                {node.icon}
              </div>
              <div style={{
                fontSize: 9, fontFamily: mono, fontWeight: 600,
                color: P.white, textAlign: "center", lineHeight: 1.2,
              }}>
                {node.label}
              </div>
              <div style={{
                fontSize: 7, fontFamily: mono, color: P.dim,
                textAlign: "center", lineHeight: 1.1,
              }}>
                {node.sublabel}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Connection lines to layer above (small dots rising) */}
        {index < total - 1 && (
          <div style={{
            position: "absolute", top: -LAYER_HEIGHT + LAYER_DEPTH, left: "50%",
            transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            opacity: isHovered ? 0.6 : 0.2, transition: "opacity 0.3s",
          }}>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -6, 0], opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 1.5, delay: i * 0.3, repeat: Infinity }}
                style={{
                  width: 3, height: 3, borderRadius: "50%",
                  background: layer.color,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Connection Lines (SVG overlay) ──
function ConnectionLines({ selectedLayer }: { selectedLayer: string | null }) {
  if (!selectedLayer) return null;

  const layerIdx = layers.findIndex((l) => l.id === selectedLayer);
  if (layerIdx < 0 || layerIdx >= layers.length - 1) return null;

  const layer = layers[layerIdx];
  const above = layers[layerIdx + 1];

  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "absolute", inset: 0, zIndex: 100,
        pointerEvents: "none",
      }}
    >
      {layer.nodes.map((fromNode, i) => {
        const toNode = above.nodes[Math.min(i, above.nodes.length - 1)];
        const fromX = (fromNode.x / 100) * LAYER_WIDTH + (window.innerWidth - LAYER_WIDTH) / 2;
        const toX = (toNode.x / 100) * LAYER_WIDTH + (window.innerWidth - LAYER_WIDTH) / 2;
        // Simplified Y calculation
        const total = layers.length;
        const fromY = window.innerHeight - 60 - (total - 1 - layerIdx) * LAYER_HEIGHT - LAYER_DEPTH / 2;
        const toY = window.innerHeight - 60 - (total - 1 - (layerIdx + 1)) * LAYER_HEIGHT - LAYER_DEPTH / 2;

        return (
          <motion.line
            key={fromNode.id}
            x1={fromX} y1={fromY} x2={toX} y2={toY}
            stroke={layer.color}
            strokeWidth={1}
            strokeDasharray="4 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            opacity={0.4}
          />
        );
      })}
    </motion.svg>
  );
}

// ── Detail Panel ──
function DetailPanel({ layer }: { layer: Layer | null }) {
  if (!layer) return null;

  const descriptions: Record<string, string> = {
    data: "Tüm veriler PostgreSQL'de saklanır. Netsis ERP'den stok verileri import edilir. WebSocket ile tüm istemcilere anlık güncelleme yapılır.",
    governance: "Kullanıcı rolleri ve yetkilendirme. Üretim şefi sadece Hızlı Giriş'i, yönetim tüm sayfaları görebilir. AI agent'ın yapabilecekleri de kontrollüdür.",
    ontology: "Sistemin kalbi. Ürünler, BOM ağacı (43 bileşen, 3 tier), stok seviyeleri, hareketler ve satın alma önerileri birbirine bağlı ontoloji objeleri olarak modellenir.",
    intelligence: "OODA döngüsünün beyni. Tüketim hızı analizi, trend tespiti, proaktif uyarılar ve 5 agent tool'u ile gerçek zamanlı karar destek sistemi.",
    apps: "Son kullanıcı arayüzleri. Her biri ontoloji katmanının farklı bir görünümü — Stok Durumu komuta merkezi, Hızlı Giriş üretim akışı, gix doğal dil arayüzü.",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      style={{
        position: "fixed", top: 100, right: 32,
        width: 280, padding: 20,
        background: P.surface,
        border: `1px solid ${layer.color}30`,
        borderRadius: 16,
        backdropFilter: "blur(20px)",
        zIndex: 200,
      }}
    >
      <div style={{
        fontSize: 10, fontFamily: mono, fontWeight: 700,
        color: layer.color, letterSpacing: 1.5, marginBottom: 4,
      }}>
        LAYER {layers.indexOf(layer)}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 700, color: P.white, marginBottom: 4,
      }}>
        {layer.label}
      </div>
      <div style={{
        fontSize: 10, fontFamily: mono, color: P.dim, marginBottom: 12,
      }}>
        {layer.sublabel}
      </div>
      <div style={{
        fontSize: 12, color: P.dim, lineHeight: 1.6,
      }}>
        {descriptions[layer.id]}
      </div>

      {/* Node list */}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        {layer.nodes.map((node) => (
          <div key={node.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 8px", borderRadius: 8,
            background: `${node.color}08`,
            border: `1px solid ${node.color}15`,
          }}>
            <span style={{ fontSize: 14 }}>{node.icon}</span>
            <div>
              <div style={{ fontSize: 10, fontFamily: mono, fontWeight: 600, color: P.white }}>
                {node.label}
              </div>
              <div style={{ fontSize: 8, fontFamily: mono, color: P.dim }}>
                {node.sublabel}
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Main Architecture Page ──
export default function Architecture() {
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);

  const selectedLayerObj = layers.find((l) => l.id === selectedLayer) || null;

  return (
    <div style={{
      width: "100vw", height: "100vh", background: P.bg,
      position: "relative", overflow: "hidden",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Background grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          radial-gradient(circle at 50% 50%, ${P.accentDim} 0%, transparent 70%),
          linear-gradient(${P.grid} 1px, transparent 1px),
          linear-gradient(90deg, ${P.grid} 1px, transparent 1px)
        `,
        backgroundSize: "100% 100%, 40px 40px, 40px 40px",
      }} />

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        style={{
          position: "absolute", top: 32, left: "50%", transform: "translateX(-50%)",
          textAlign: "center", zIndex: 300,
        }}
      >
        <div style={{
          fontSize: 11, fontFamily: mono, fontWeight: 700, letterSpacing: 3,
          color: P.accent, marginBottom: 6,
        }}>
          GRISEUS ARCHITECTURE
        </div>
        <div style={{
          fontSize: 28, fontWeight: 800, color: P.white,
          letterSpacing: -0.5,
        }}>
          Platform Overview
        </div>
        <div style={{
          fontSize: 12, color: P.dim, marginTop: 4,
        }}>
          Stok İstihbarat Platformu · 5 Katman · Palantir-Inspired
        </div>
      </motion.div>

      {/* Isometric Stack */}
      <div style={{
        position: "absolute",
        bottom: 60,
        left: 0, right: 0,
        height: LAYER_HEIGHT * layers.length + LAYER_DEPTH,
        perspective: "1200px",
        transformStyle: "preserve-3d",
      }}>
        {/* Isometric tilt wrapper */}
        <div style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: `rotateX(${ISO_ANGLE}deg)`,
          transformStyle: "preserve-3d",
          transformOrigin: "center bottom",
        }}>
          {layers.map((layer, i) => (
            <IsoLayer
              key={layer.id}
              layer={layer}
              index={i}
              total={layers.length}
              isHovered={hoveredLayer === layer.id}
              isSelected={selectedLayer === layer.id}
              onHover={setHoveredLayer}
              onClick={(id) => setSelectedLayer(selectedLayer === id ? null : id)}
            />
          ))}
        </div>
      </div>

      {/* Connection lines */}
      <AnimatePresence>
        <ConnectionLines selectedLayer={selectedLayer} />
      </AnimatePresence>

      {/* Detail panel */}
      <AnimatePresence>
        <DetailPanel layer={selectedLayerObj} />
      </AnimatePresence>

      {/* Layer legend (bottom left) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        style={{
          position: "fixed", bottom: 24, left: 24,
          display: "flex", flexDirection: "column", gap: 4,
          zIndex: 200,
        }}
      >
        {[...layers].reverse().map((layer, i) => (
          <div
            key={layer.id}
            onClick={() => setSelectedLayer(selectedLayer === layer.id ? null : layer.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              background: selectedLayer === layer.id ? `${layer.color}15` : "transparent",
              border: `1px solid ${selectedLayer === layer.id ? layer.color + "30" : "transparent"}`,
              transition: "all 0.2s",
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: layer.color, opacity: 0.8,
            }} />
            <div style={{
              fontSize: 9, fontFamily: mono, fontWeight: 600,
              color: selectedLayer === layer.id ? P.white : P.dim,
              letterSpacing: 0.5,
            }}>
              {layer.label}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Floating label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        style={{
          position: "fixed", bottom: 24, right: 24,
          fontSize: 9, fontFamily: mono, color: P.dim,
          letterSpacing: 1,
          zIndex: 200,
        }}
      >
        GRISEUS.IO · STOCK INTELLIGENCE PLATFORM
      </motion.div>
    </div>
  );
}
