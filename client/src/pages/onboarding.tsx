import { useEffect, useRef, useState } from "react";

/* ──────────────────── PARTICLE GRID BACKGROUND ────────────────────── */

function ParticleGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const dots: { x: number; y: number; vx: number; vy: number }[] = [];
    const DOTS = 60;

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();

    for (let i = 0; i < DOTS; i++) {
      dots.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      });
    }

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > w) d.vx *= -1;
        if (d.y < 0 || d.y > h) d.vy *= -1;
      }

      // lines
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.strokeStyle = `rgba(59,130,246,${0.08 * (1 - dist / 140)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // dots
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59,130,246,0.25)";
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

/* ──────────────── ISOMETRIC 3D FACTORY ──────────────── */

function IsometricFactory({ ready }: { ready: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const buildings = [
    { id: "kasa", label: "Kasa Üretim", x: 60, y: 120, w: 120, h: 80, d: 45, color: "59,130,246", delay: 400 },
    { id: "fabrika", label: "Ana Fabrika & Montaj", x: 220, y: 95, w: 160, h: 100, d: 55, color: "16,185,129", delay: 600 },
    { id: "yonetim", label: "Yönetim", x: 420, y: 125, w: 100, h: 60, d: 38, color: "245,158,11", delay: 800 },
  ];

  return (
    <svg viewBox="0 0 580 300" className="w-full max-w-[600px]">
      {/* Ground plane */}
      <polygon
        points="290,260 580,200 290,140 0,200"
        fill="rgba(255,255,255,0.015)"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={0.5}
      />

      {/* Ground grid */}
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <line
          key={`h-${f}`}
          x1={290 - 290 * f}
          y1={200 - 60 * f}
          x2={290 + 290 * f}
          y2={200 - 60 * f}
          stroke="rgba(255,255,255,0.025)"
          strokeWidth={0.5}
        />
      ))}

      {buildings.map((b) => {
        const isHovered = hovered === b.id;
        const baseOpacity = isHovered ? 1 : 0.75;
        const glowOpacity = isHovered ? 0.12 : 0;

        return (
          <g
            key={b.id}
            onMouseEnter={() => setHovered(b.id)}
            onMouseLeave={() => setHovered(null)}
            className="cursor-pointer"
            style={{
              opacity: ready ? 1 : 0,
              transform: ready ? "translateY(0)" : "translateY(20px)",
              transition: `opacity 0.8s ease ${b.delay}ms, transform 0.8s ease ${b.delay}ms`,
            }}
          >
            {/* Glow */}
            <ellipse
              cx={b.x + b.w / 2}
              cy={b.y + b.h + 8}
              rx={b.w * 0.6}
              ry={14}
              fill={`rgba(${b.color},${glowOpacity})`}
              style={{ filter: "blur(10px)", transition: "fill 0.3s" }}
            />

            {/* Top face — glass effect */}
            <polygon
              points={`${b.x + b.w / 2},${b.y - b.d} ${b.x + b.w},${b.y - b.d / 2} ${b.x + b.w / 2},${b.y} ${b.x},${b.y - b.d / 2}`}
              fill={`rgba(${b.color},${baseOpacity * 0.35})`}
              stroke={`rgba(${b.color},${baseOpacity * 0.5})`}
              strokeWidth={0.5}
              style={{ transition: "fill 0.3s, stroke 0.3s" }}
            />

            {/* Front face — glass */}
            <polygon
              points={`${b.x},${b.y - b.d / 2} ${b.x + b.w / 2},${b.y} ${b.x + b.w / 2},${b.y + b.h} ${b.x},${b.y + b.h - b.d / 2}`}
              fill={`rgba(${b.color},${baseOpacity * 0.15})`}
              stroke={`rgba(${b.color},${baseOpacity * 0.3})`}
              strokeWidth={0.5}
              style={{ transition: "fill 0.3s, stroke 0.3s" }}
            />

            {/* Right face — glass */}
            <polygon
              points={`${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y - b.d / 2} ${b.x + b.w},${b.y + b.h - b.d / 2} ${b.x + b.w / 2},${b.y + b.h}`}
              fill={`rgba(${b.color},${baseOpacity * 0.1})`}
              stroke={`rgba(${b.color},${baseOpacity * 0.25})`}
              strokeWidth={0.5}
              style={{ transition: "fill 0.3s, stroke 0.3s" }}
            />

            {/* Window strips — front */}
            {Array.from({ length: Math.floor(b.h / 24) }).map((_, i) => (
              <line
                key={`fw-${i}`}
                x1={b.x + 10}
                y1={b.y - b.d / 2 + 16 + i * 24}
                x2={b.x + b.w / 2 - 10}
                y2={b.y + 16 + i * 24}
                stroke={`rgba(${b.color},${baseOpacity * 0.2})`}
                strokeWidth={4}
                strokeLinecap="round"
                style={{ transition: "stroke 0.3s" }}
              />
            ))}

            {/* Window strips — right */}
            {Array.from({ length: Math.floor(b.h / 24) }).map((_, i) => (
              <line
                key={`rw-${i}`}
                x1={b.x + b.w / 2 + 10}
                y1={b.y + 16 + i * 24}
                x2={b.x + b.w - 10}
                y2={b.y - b.d / 2 + 16 + i * 24}
                stroke={`rgba(${b.color},${baseOpacity * 0.12})`}
                strokeWidth={3}
                strokeLinecap="round"
                style={{ transition: "stroke 0.3s" }}
              />
            ))}

            {/* Chimney for main factory */}
            {b.id === "fabrika" && (
              <>
                <rect
                  x={b.x + b.w / 2 - 5}
                  y={b.y - b.d - 18}
                  width={10}
                  height={18}
                  rx={1}
                  fill={`rgba(${b.color},${baseOpacity * 0.2})`}
                  stroke={`rgba(${b.color},${baseOpacity * 0.3})`}
                  strokeWidth={0.5}
                />
                <circle
                  cx={b.x + b.w / 2}
                  cy={b.y - b.d - 22}
                  r={5}
                  fill={`rgba(${b.color},0.08)`}
                  style={{ filter: "blur(3px)" }}
                >
                  <animate
                    attributeName="cy"
                    values={`${b.y - b.d - 22};${b.y - b.d - 38}`}
                    dur="3s"
                    repeatCount="indefinite"
                  />
                  <animate attributeName="opacity" values="0.15;0" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="r" values="5;12" dur="3s" repeatCount="indefinite" />
                </circle>
              </>
            )}

            {/* Label */}
            <text
              x={b.x + b.w / 2}
              y={b.y + b.h + 20}
              textAnchor="middle"
              fill={`rgba(${b.color},${isHovered ? 0.9 : 0.55})`}
              fontSize={11}
              fontWeight={500}
              letterSpacing="0.03em"
              style={{ transition: "fill 0.3s" }}
            >
              {b.label}
            </text>

            {/* Active indicator */}
            <circle
              cx={b.x + b.w / 2}
              cy={b.y + b.h + 30}
              r={2.5}
              fill={`rgba(${b.color},${isHovered ? 0.8 : 0.3})`}
              style={{ transition: "fill 0.3s" }}
            >
              <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
            </circle>

            {/* Connection lines between buildings */}
            {b.id === "kasa" && (
              <line
                x1={b.x + b.w}
                y1={b.y + b.h / 2}
                x2={220}
                y2={95 + 100 / 2}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={0.5}
                strokeDasharray="4 4"
              />
            )}
            {b.id === "fabrika" && (
              <line
                x1={b.x + b.w}
                y1={b.y + b.h / 2}
                x2={420}
                y2={125 + 60 / 2}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={0.5}
                strokeDasharray="4 4"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ──────────────────────── MAIN PAGE ──────────────────────────────── */

export default function OnboardingPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <section
        className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, #0F172A 0%, #1A1A2E 50%, #0F172A 100%)",
        }}
      >
        <ParticleGrid />

        {/* ── Title ── */}
        <div
          className="relative z-10 mb-3 text-center transition-all duration-1000"
          style={{
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <h1 className="text-sm sm:text-base font-semibold tracking-[0.3em] uppercase text-blue-400/70">
            Çukurova Isı Sistemleri
          </h1>
        </div>

        <div
          className="relative z-10 mb-10 text-center transition-all duration-1000 delay-150"
          style={{
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-wide">
            OPERATIONS INTELLIGENCE PLATFORM
          </h2>
        </div>

        {/* ── Stats ── */}
        <div
          className="relative z-10 flex items-center gap-4 sm:gap-8 mb-12 transition-all duration-1000 delay-300"
          style={{
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0)" : "translateY(15px)",
          }}
        >
          {[
            { value: "3", label: "hat aktif", color: "16,185,129" },
            { value: "12", label: "operatör", color: "59,130,246" },
            { value: "Pik sezon", label: "26 hafta", color: "245,158,11" },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              {i > 0 && <div className="w-px h-5 bg-white/10" />}
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: `rgba(${s.color},0.8)` }}
                >
                  <div
                    className="w-2 h-2 rounded-full animate-ping"
                    style={{ backgroundColor: `rgba(${s.color},0.4)` }}
                  />
                </div>
                <span className="text-white font-semibold text-sm sm:text-base">{s.value}</span>
                <span className="text-slate-400 text-xs sm:text-sm">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Isometric Factory ── */}
        <div
          className="relative z-10 w-full max-w-[600px] px-4 transition-all duration-1000 delay-500"
          style={{
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0) scale(1)" : "translateY(30px) scale(0.97)",
          }}
        >
          <IsometricFactory ready={ready} />
        </div>

        {/* ── Bottom prompt ── */}
        <div
          className="relative z-10 mt-8 text-center transition-all duration-1000 delay-[1200ms]"
          style={{
            opacity: ready ? 1 : 0,
          }}
        >
          <p className="text-sm text-slate-500 tracking-wide">
            Bir bölüme girmek için tıklayın
          </p>
        </div>
      </section>
    </div>
  );
}
