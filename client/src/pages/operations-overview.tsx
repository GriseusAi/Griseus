import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Smoke Particle System ────────────────────────────────────────────────
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
          <animate
            attributeName="cy"
            values={`${y};${y - 30 - Math.random() * 20}`}
            dur={`${2.5 + Math.random() * 2}s`}
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cx"
            values={`${x + (Math.random() - 0.5) * 8};${x + (Math.random() - 0.5) * 20}`}
            dur={`${2.5 + Math.random() * 2}s`}
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0.25;0"
            dur={`${2.5 + Math.random() * 2}s`}
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values={`${2 + Math.random() * 2};${4 + Math.random() * 3}`}
            dur={`${2.5 + Math.random() * 2}s`}
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </g>
  );
}

// ── Pulsing Status Dot ───────────────────────────────────────────────────
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

// ── Window Lights ────────────────────────────────────────────────────────
function WindowGrid({
  x, y, cols, rows, w, h, gap,
}: { x: number; y: number; cols: number; rows: number; w: number; h: number; gap: number }) {
  return (
    <g>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const flickerDur = 3 + Math.random() * 4;
          const delay = Math.random() * 3;
          const baseOpacity = 0.3 + Math.random() * 0.5;
          return (
            <rect
              key={`${r}-${c}`}
              x={x + c * (w + gap)}
              y={y + r * (h + gap)}
              width={w}
              height={h}
              rx={0.5}
              fill="#f59e0b"
              opacity={baseOpacity}
            >
              <animate
                attributeName="opacity"
                values={`${baseOpacity};${baseOpacity * 0.4};${baseOpacity}`}
                dur={`${flickerDur}s`}
                begin={`${delay}s`}
                repeatCount="indefinite"
              />
            </rect>
          );
        })
      )}
    </g>
  );
}

// ── Isometric Building Component ─────────────────────────────────────────
function IsometricBuilding({
  id,
  label,
  sublabel,
  x, y,
  width, height, depth,
  roofColor, wallLeftColor, wallRightColor, accentColor,
  hovered,
  onHover,
  onLeave,
  onClick,
  chimneyX,
  windowConfig,
  statusDotOffset,
}: {
  id: string;
  label: string;
  sublabel: string;
  x: number; y: number;
  width: number; height: number; depth: number;
  roofColor: string; wallLeftColor: string; wallRightColor: string; accentColor: string;
  hovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
  chimneyX?: number;
  windowConfig?: { x: number; y: number; cols: number; rows: number };
  statusDotOffset?: { x: number; y: number };
}) {
  // Isometric projection helpers
  const isoX = (lx: number, ly: number) => (lx - ly) * 0.866;
  const isoY = (lx: number, ly: number, lz: number) => (lx + ly) * 0.5 - lz;

  const hw = width / 2;
  const hd = depth / 2;

  // Top face
  const topFace = [
    [isoX(-hw, -hd), isoY(-hw, -hd, height)],
    [isoX(hw, -hd), isoY(hw, -hd, height)],
    [isoX(hw, hd), isoY(hw, hd, height)],
    [isoX(-hw, hd), isoY(-hw, hd, height)],
  ].map(p => `${p[0]},${p[1]}`).join(" ");

  // Left face
  const leftFace = [
    [isoX(-hw, hd), isoY(-hw, hd, height)],
    [isoX(-hw, hd), isoY(-hw, hd, 0)],
    [isoX(-hw, -hd), isoY(-hw, -hd, 0)],
    [isoX(-hw, -hd), isoY(-hw, -hd, height)],
  ].map(p => `${p[0]},${p[1]}`).join(" ");

  // Right face
  const rightFace = [
    [isoX(-hw, hd), isoY(-hw, hd, height)],
    [isoX(-hw, hd), isoY(-hw, hd, 0)],
    [isoX(hw, hd), isoY(hw, hd, 0)],
    [isoX(hw, hd), isoY(hw, hd, height)],
  ].map(p => `${p[0]},${p[1]}`).join(" ");

  const liftY = hovered ? -6 : 0;
  const glowOpacity = hovered ? 0.5 : 0;

  return (
    <g
      transform={`translate(${x}, ${y + liftY})`}
      style={{ cursor: "pointer", transition: "transform 0.3s ease" }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {/* Glow effect */}
      <ellipse
        cx={0}
        cy={isoY(0, 0, 0) + 8}
        rx={width * 0.7}
        ry={depth * 0.25}
        fill={accentColor}
        opacity={glowOpacity}
        style={{ transition: "opacity 0.3s ease", filter: "blur(12px)" }}
      />

      {/* Shadow */}
      <ellipse
        cx={0}
        cy={isoY(0, 0, 0) + 4}
        rx={width * 0.6}
        ry={depth * 0.2}
        fill="rgba(0,0,0,0.4)"
        style={{ filter: "blur(8px)" }}
      />

      {/* Left wall */}
      <polygon points={leftFace} fill={wallLeftColor} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />

      {/* Right wall */}
      <polygon points={rightFace} fill={wallRightColor} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />

      {/* Top face */}
      <polygon points={topFace} fill={roofColor} stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />

      {/* Accent stripe on top edge */}
      <line
        x1={isoX(-hw, -hd)}
        y1={isoY(-hw, -hd, height)}
        x2={isoX(hw, -hd)}
        y2={isoY(hw, -hd, height)}
        stroke={accentColor}
        strokeWidth={2}
        opacity={hovered ? 1 : 0.6}
        style={{ transition: "opacity 0.3s ease" }}
      />
      <line
        x1={isoX(-hw, -hd)}
        y1={isoY(-hw, -hd, height)}
        x2={isoX(-hw, hd)}
        y2={isoY(-hw, hd, height)}
        stroke={accentColor}
        strokeWidth={1.5}
        opacity={hovered ? 0.8 : 0.4}
        style={{ transition: "opacity 0.3s ease" }}
      />

      {/* Windows */}
      {windowConfig && (
        <WindowGrid
          x={windowConfig.x}
          y={windowConfig.y}
          cols={windowConfig.cols}
          rows={windowConfig.rows}
          w={6}
          h={5}
          gap={4}
        />
      )}

      {/* Chimney */}
      {chimneyX != null && (
        <>
          <rect
            x={chimneyX}
            y={isoY(0, 0, height) - 22}
            width={6}
            height={18}
            fill={wallLeftColor}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={0.5}
          />
          <SmokeParticles x={chimneyX + 3} y={isoY(0, 0, height) - 24} />
        </>
      )}

      {/* Status dot */}
      <StatusDot
        x={statusDotOffset?.x ?? isoX(hw, -hd) - 4}
        y={statusDotOffset?.y ?? isoY(hw, -hd, height) - 8}
      />

      {/* Tooltip label */}
      {hovered && (
        <g>
          <rect
            x={-60}
            y={isoY(0, 0, height) - 52}
            width={120}
            height={36}
            rx={6}
            fill="rgba(15,15,25,0.92)"
            stroke={accentColor}
            strokeWidth={1}
          />
          <text
            x={0}
            y={isoY(0, 0, height) - 38}
            textAnchor="middle"
            fill="white"
            fontSize={11}
            fontWeight={600}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {label}
          </text>
          <text
            x={0}
            y={isoY(0, 0, height) - 24}
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize={8.5}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {sublabel}
          </text>
        </g>
      )}
    </g>
  );
}

// ── Flow Arrow ───────────────────────────────────────────────────────────
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
      {/* Dashed path */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="rgba(56,189,248,0.25)"
        strokeWidth={2}
        strokeDasharray="6 4"
      >
        <animate attributeName="stroke-dashoffset" values="0;-20" dur="1.5s" repeatCount="indefinite" />
      </line>

      {/* Moving dot */}
      <circle r={3.5} fill="#38bdf8">
        <animate attributeName="cx" values={`${x1};${x2}`} dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="cy" values={`${y1};${y2}`} dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.6;1" dur="2.5s" repeatCount="indefinite" />
      </circle>

      {/* Arrowhead */}
      <polygon
        points={`${x2},${y2} ${x2 - nx * 8 - ny * 4},${y2 - ny * 8 + nx * 4} ${x2 - nx * 8 + ny * 4},${y2 - ny * 8 - nx * 4}`}
        fill="rgba(56,189,248,0.5)"
      />

      {/* Label */}
      <text
        x={midX}
        y={midY - 12}
        textAnchor="middle"
        fill="rgba(56,189,248,0.5)"
        fontSize={8}
        fontFamily="Inter, system-ui, sans-serif"
        letterSpacing="0.05em"
      >
        KASA AKIŞI
      </text>
    </g>
  );
}

// ── Grid Pattern ─────────────────────────────────────────────────────────
function IsometricGrid() {
  const lines = [];
  for (let i = -10; i <= 10; i++) {
    // Lines going one direction
    lines.push(
      <line
        key={`a${i}`}
        x1={i * 40 * 0.866 - 10 * 40 * 0.866}
        y1={i * 40 * 0.5 + 10 * 40 * 0.5}
        x2={i * 40 * 0.866 + 10 * 40 * 0.866}
        y2={i * 40 * 0.5 - 10 * 40 * 0.5}
        stroke="rgba(255,255,255,0.02)"
        strokeWidth={0.5}
      />
    );
    lines.push(
      <line
        key={`b${i}`}
        x1={-i * 40 * 0.866 - 10 * 40 * 0.866}
        y1={i * 40 * 0.5 + 10 * 40 * 0.5}
        x2={-i * 40 * 0.866 + 10 * 40 * 0.866}
        y2={i * 40 * 0.5 - 10 * 40 * 0.5}
        stroke="rgba(255,255,255,0.02)"
        strokeWidth={0.5}
      />
    );
  }
  return <g>{lines}</g>;
}

// ── Main Component ───────────────────────────────────────────────────────
export default function OperationsOverview() {
  const [, navigate] = useLocation();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        background: "#0a0a0f",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Ambient gradient orbs */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "30%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,189,248,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "20%",
          right: "25%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.03) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ textAlign: "center", marginBottom: 12, position: "relative", zIndex: 10 }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "rgba(255,255,255,0.95)",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Çukurova Isı Sistemleri
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: "4px 0 0 0",
            fontWeight: 500,
          }}
        >
          Operations Intelligence Platform
        </p>
      </motion.div>

      {/* Status bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        style={{
          display: "flex",
          gap: 20,
          marginBottom: 32,
          position: "relative",
          zIndex: 10,
        }}
      >
        {[
          { label: "3 hat aktif", dot: "#10b981" },
          { label: "12 operatör", dot: "#38bdf8" },
          { label: "Pik sezon 26 hafta", dot: "#f59e0b" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: item.dot,
                display: "inline-block",
              }}
            />
            {item.label}
          </div>
        ))}
      </motion.div>

      {/* Isometric SVG Scene */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }}
        style={{ position: "relative", zIndex: 10 }}
      >
        <svg
          viewBox="-400 -220 800 440"
          width={800}
          height={440}
          style={{ maxWidth: "90vw", overflow: "visible" }}
        >
          <defs>
            <filter id="glow-teal">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Isometric grid */}
          <IsometricGrid />

          {/* Ground plane */}
          <ellipse
            cx={0}
            cy={120}
            rx={350}
            ry={60}
            fill="rgba(255,255,255,0.01)"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth={0.5}
          />

          {/* Building 1: Kasa Üretim (left, smaller) */}
          <IsometricBuilding
            id="kasa"
            label="Kasa Üretim"
            sublabel="Production Intelligence →"
            x={-180}
            y={30}
            width={100}
            height={70}
            depth={80}
            roofColor="#1e293b"
            wallLeftColor="#1a2332"
            wallRightColor="#151d2b"
            accentColor="#38bdf8"
            hovered={hovered === "kasa"}
            onHover={() => setHovered("kasa")}
            onLeave={() => setHovered(null)}
            onClick={() => navigate("/operations")}
            chimneyX={-20}
            windowConfig={{ x: -48, y: -12, cols: 4, rows: 2 }}
            statusDotOffset={{ x: 50, y: -48 }}
          />

          {/* Flow arrow */}
          <FlowArrow x1={-100} y1={40} x2={40} y2={10} />

          {/* Building 2: Ana Fabrika & Montaj (right, larger) */}
          <IsometricBuilding
            id="fabrika"
            label="Ana Fabrika & Montaj"
            sublabel="Workforce Scheduling →"
            x={140}
            y={0}
            width={140}
            height={90}
            depth={100}
            roofColor="#1e293b"
            wallLeftColor="#1a2332"
            wallRightColor="#151d2b"
            accentColor="#8b5cf6"
            hovered={hovered === "fabrika"}
            onHover={() => setHovered("fabrika")}
            onLeave={() => setHovered(null)}
            onClick={() => navigate("/operations/scheduling")}
            chimneyX={30}
            windowConfig={{ x: -60, y: -25, cols: 5, rows: 3 }}
            statusDotOffset={{ x: 72, y: -60 }}
          />

          {/* Building 3: Yönetim (office, top right, smaller) */}
          <IsometricBuilding
            id="yonetim"
            label="Yönetim"
            sublabel="Financial Simulation →"
            x={260}
            y={-100}
            width={70}
            height={50}
            depth={55}
            roofColor="#1e293b"
            wallLeftColor="#1f2937"
            wallRightColor="#1a2332"
            accentColor="#f59e0b"
            hovered={hovered === "yonetim"}
            onHover={() => setHovered("yonetim")}
            onLeave={() => setHovered(null)}
            onClick={() => navigate("/operations/finance")}
            windowConfig={{ x: -28, y: -5, cols: 3, rows: 2 }}
            statusDotOffset={{ x: 34, y: -35 }}
          />

          {/* Building labels (always visible) */}
          <text x={-180} y={115} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
            Kasa Üretim
          </text>
          <text x={140} y={105} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
            Ana Fabrika & Montaj
          </text>
          <text x={260} y={-10} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
            Yönetim
          </text>
        </svg>
      </motion.div>

      {/* Bottom CTA */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.25)",
          marginTop: 24,
          letterSpacing: "0.04em",
          position: "relative",
          zIndex: 10,
        }}
      >
        Bir bölüme girmek için tıklayın
      </motion.p>
    </div>
  );
}
