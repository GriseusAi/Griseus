import { useLocation } from "wouter";
import { useState, useCallback, useEffect } from "react";

/* ─────────────────── STYLES ─────────────────── */

const STYLES = `
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes smoke {
  0% { opacity: 0.4; transform: translateY(0) scaleX(1); }
  100% { opacity: 0; transform: translateY(-18px) scaleX(1.5); }
}
`;

/* ─────── ISOMETRIC BUILDING COMPONENT ─────── */

function IsometricBuilding({
  label,
  color,
  x,
  y,
  w,
  h,
  depth,
  delay,
  onClick,
  active,
}: {
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  delay: number;
  onClick: () => void;
  active: boolean;
}) {
  const topColor = color;
  const rightColor =
    color === "#3B82F6"
      ? "#2563EB"
      : color === "#10B981"
        ? "#059669"
        : "#D97706";
  const frontColor =
    color === "#3B82F6"
      ? "#1D4ED8"
      : color === "#10B981"
        ? "#047857"
        : "#B45309";

  return (
    <g
      onClick={onClick}
      className="cursor-pointer"
      style={{
        animation: `fade-in-up 0.8s ease-out ${delay}ms both`,
      }}
    >
      {/* Glow effect on hover/active */}
      {active && (
        <ellipse
          cx={x + w / 2}
          cy={y + 10}
          rx={w * 0.7}
          ry={16}
          fill={color}
          opacity={0.15}
          style={{ filter: "blur(12px)" }}
        />
      )}

      {/* Top face (isometric) */}
      <polygon
        points={`${x + w / 2},${y - depth} ${x + w},${y - depth / 2} ${x + w / 2},${y} ${x},${y - depth / 2}`}
        fill={topColor}
        opacity={active ? 0.95 : 0.7}
        style={{ transition: "opacity 0.3s" }}
      />

      {/* Front face */}
      <polygon
        points={`${x},${y - depth / 2} ${x + w / 2},${y} ${x + w / 2},${y + h} ${x},${y + h - depth / 2}`}
        fill={frontColor}
        opacity={active ? 0.95 : 0.7}
        style={{ transition: "opacity 0.3s" }}
      />

      {/* Right face */}
      <polygon
        points={`${x + w / 2},${y} ${x + w},${y - depth / 2} ${x + w},${y + h - depth / 2} ${x + w / 2},${y + h}`}
        fill={rightColor}
        opacity={active ? 0.95 : 0.7}
        style={{ transition: "opacity 0.3s" }}
      />

      {/* Windows on front face */}
      {Array.from({ length: Math.floor(h / 22) }).map((_, i) => (
        <rect
          key={`fw-${i}`}
          x={x + 8}
          y={y - depth / 2 + 12 + i * 22}
          width={w / 2 - 16}
          height={8}
          rx={1}
          fill="rgba(255,255,255,0.08)"
        />
      ))}

      {/* Windows on right face */}
      {Array.from({ length: Math.floor(h / 22) }).map((_, i) => (
        <rect
          key={`rw-${i}`}
          x={x + w / 2 + 8}
          y={y - depth / 2 + 12 + i * 22}
          width={w / 2 - 16}
          height={8}
          rx={1}
          fill="rgba(255,255,255,0.05)"
        />
      ))}

      {/* Smoke/chimney for factory building */}
      {label === "Ana Fabrika & Montaj" && (
        <>
          <rect
            x={x + w / 2 - 4}
            y={y - depth - 14}
            width={8}
            height={14}
            rx={1}
            fill={rightColor}
            opacity={0.8}
          />
          <circle
            cx={x + w / 2}
            cy={y - depth - 18}
            r={4}
            fill="rgba(255,255,255,0.15)"
            style={{ animation: "smoke 2s ease-out infinite" }}
          />
        </>
      )}

      {/* Label */}
      <text
        x={x + w / 2}
        y={y + h + 18}
        textAnchor="middle"
        fill="rgba(255,255,255,0.7)"
        fontSize={11}
        fontWeight={500}
        letterSpacing="0.02em"
      >
        {label}
      </text>

      {/* Active indicator dot */}
      <circle
        cx={x + w / 2}
        cy={y + h + 28}
        r={3}
        fill={active ? color : "rgba(255,255,255,0.15)"}
        style={{ animation: active ? "pulse-dot 1.5s ease-in-out infinite" : "none" }}
      />
    </g>
  );
}

/* ─────── MAIN PAGE ─────── */

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [navigating, setNavigating] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  const handleBuildingClick = useCallback(
    (path: string) => {
      if (navigating) return;
      setNavigating(path);
      setTimeout(() => setLocation(path), 500);
    },
    [navigating, setLocation],
  );

  const buildings = [
    {
      label: "Kasa Üretim",
      color: "#3B82F6",
      x: 40,
      y: 100,
      w: 110,
      h: 70,
      depth: 40,
      delay: 400,
      path: "/login",
    },
    {
      label: "Ana Fabrika & Montaj",
      color: "#10B981",
      x: 195,
      y: 80,
      w: 140,
      h: 90,
      depth: 50,
      delay: 600,
      path: "/login",
    },
    {
      label: "Yönetim",
      color: "#F59E0B",
      x: 385,
      y: 105,
      w: 100,
      h: 55,
      depth: 35,
      delay: 800,
      path: "/login",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(145deg, #0F172A 0%, #1A1A2E 50%, #0F172A 100%)",
      }}
    >
      <style>{STYLES}</style>

      {/* ── Header ── */}
      <div
        className="text-center mb-8 transition-all duration-1000"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(-20px)",
        }}
      >
        <h1 className="text-sm sm:text-base font-semibold tracking-[0.25em] uppercase text-blue-400/80 mb-1">
          Çukurova Isı Sistemleri
        </h1>
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-wide">
          OPERATIONS INTELLIGENCE PLATFORM
        </h2>
      </div>

      {/* ── Stats bar ── */}
      <div
        className="flex items-center gap-3 sm:gap-6 mb-10 transition-all duration-1000 delay-200"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(10px)",
        }}
      >
        {[
          { value: "3", label: "hat aktif", color: "#10B981" },
          { value: "12", label: "operatör", color: "#3B82F6" },
          { value: "Pik sezon", label: "26 hafta", color: "#F59E0B" },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-2 sm:gap-3">
            {i > 0 && (
              <div className="w-px h-5 bg-white/10 mr-1 sm:mr-2" />
            )}
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: s.color, animation: "pulse-dot 2s ease-in-out infinite", animationDelay: `${i * 300}ms` }}
            />
            <div className="text-sm sm:text-base">
              <span className="text-white font-semibold">{s.value}</span>{" "}
              <span className="text-slate-400 text-xs sm:text-sm">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Isometric Factory SVG ── */}
      <div
        className="w-full max-w-[560px] px-4 transition-all duration-1000 delay-300"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0) scale(1)" : "translateY(30px) scale(0.95)",
          animation: ready ? "float 6s ease-in-out infinite" : "none",
          animationDelay: "1.5s",
        }}
      >
        <svg
          viewBox="0 0 530 260"
          className="w-full"
          onMouseLeave={() => setHovered(null)}
        >
          {/* Ground plane */}
          <polygon
            points="265,230 530,180 265,130 0,180"
            fill="rgba(255,255,255,0.02)"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
          {/* Ground grid lines */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={265 * f}
              y1={180 - (180 - 130) * f}
              x2={265 + 265 * f}
              y2={180 + (230 - 180) * f}
              stroke="rgba(255,255,255,0.03)"
              strokeWidth={0.5}
            />
          ))}

          {/* Buildings */}
          {buildings.map((b) => (
            <IsometricBuilding
              key={b.label}
              {...b}
              onClick={() => handleBuildingClick(b.path)}
              active={hovered === b.label || navigating === b.path}
            />
          ))}

          {/* Interactive hover areas (invisible, on top) */}
          {buildings.map((b) => (
            <rect
              key={`hover-${b.label}`}
              x={b.x}
              y={b.y - b.depth}
              width={b.w}
              height={b.h + b.depth + 35}
              fill="transparent"
              onMouseEnter={() => setHovered(b.label)}
              className="cursor-pointer"
            />
          ))}
        </svg>
      </div>

      {/* ── Bottom text ── */}
      <div
        className="mt-6 text-center transition-all duration-1000 delay-[1200ms]"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(10px)",
        }}
      >
        <p className="text-sm text-slate-500 tracking-wide">
          Bir bölüme girmek için tıklayın
        </p>
      </div>

      {/* ── Sign in link ── */}
      <button
        onClick={() => setLocation("/login")}
        className="mt-6 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        style={{
          opacity: ready ? 1 : 0,
          transition: "opacity 1s 1.5s, color 0.2s",
        }}
      >
        Giriş yap →
      </button>
    </div>
  );
}
