import { useLocation } from "wouter";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";

/* ───────────────────────── ANIMATED COUNTER ───────────────────────── */

function AnimatedCounter({
  end,
  duration = 1800,
  suffix = "",
  active,
}: {
  end: number;
  duration?: number;
  suffix?: string;
  active: boolean;
}) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(ease * end));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, end, duration]);

  return (
    <span className="tabular-nums">
      {value}
      {suffix}
    </span>
  );
}

/* ──────────────────── INTERSECTION OBSERVER HOOK ──────────────────── */

function useInView(threshold = 0.25) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setInView(true);
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, inView };
}

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

/* ──────────────────── ONTOLOGY GRAPH (SVG) ────────────────────────── */

const TRADES = [
  "Electrician", "HVAC Tech", "Plumber", "Ironworker", "Concrete",
  "Fire Protection", "Low Voltage", "Insulator", "Sheet Metal",
  "Controls/BMS", "Welder", "General Labor",
];

const TRADE_COLORS: Record<string, string> = {
  trade: "#3B82F6",
  cert: "#F59E0B",
  skill: "#10B981",
};

function OntologyGraph({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 700, h: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setDims({ w: el.offsetWidth, h: Math.min(el.offsetWidth * 0.7, 520) });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const cx = dims.w / 2;
  const cy = dims.h / 2;
  const radius = Math.min(cx, cy) * 0.65;

  return (
    <div ref={containerRef} className="w-full max-w-4xl mx-auto">
      <svg
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="w-full"
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Center glow */}
        <circle cx={cx} cy={cy} r={radius * 0.35} fill="url(#centerGlow)" />

        {/* Trade nodes + lines */}
        {TRADES.map((trade, i) => {
          const angle = (i / TRADES.length) * Math.PI * 2 - Math.PI / 2;
          const tx = cx + Math.cos(angle) * radius;
          const ty = cy + Math.sin(angle) * radius;
          const delay = i * 0.08;

          // Small satellite nodes (certs/skills)
          const sats = [0.3, -0.3, 0.18].map((offset, si) => {
            const sa = angle + offset;
            const sr = radius * 1.2;
            return {
              x: cx + Math.cos(sa) * sr,
              y: cy + Math.sin(sa) * sr,
              color: si < 2 ? TRADE_COLORS.cert : TRADE_COLORS.skill,
              r: si < 2 ? 3 : 2.5,
            };
          });

          return (
            <g
              key={trade}
              style={{
                opacity: active ? 1 : 0,
                transform: active ? "scale(1)" : "scale(0.8)",
                transformOrigin: `${tx}px ${ty}px`,
                transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
              }}
            >
              {/* Line to center */}
              <line
                x1={cx} y1={cy} x2={tx} y2={ty}
                stroke="#3B82F6" strokeOpacity="0.15" strokeWidth="1"
              />
              {/* Satellite lines + dots */}
              {sats.map((s, si) => (
                <g key={si}>
                  <line
                    x1={tx} y1={ty} x2={s.x} y2={s.y}
                    stroke={s.color} strokeOpacity="0.2" strokeWidth="0.5"
                  />
                  <circle cx={s.x} cy={s.y} r={s.r} fill={s.color} opacity="0.5">
                    <animate
                      attributeName="opacity" values="0.3;0.7;0.3"
                      dur={`${3 + si}s`} repeatCount="indefinite"
                    />
                  </circle>
                </g>
              ))}
              {/* Trade node */}
              <circle cx={tx} cy={ty} r="20" fill="#3B82F6" opacity="0.12">
                <animate
                  attributeName="r" values="18;22;18"
                  dur={`${4 + (i % 3)}s`} repeatCount="indefinite"
                />
              </circle>
              <circle cx={tx} cy={ty} r="6" fill="#3B82F6" />
              {/* Label */}
              <text
                x={tx}
                y={ty + (ty > cy ? 22 : -16)}
                textAnchor="middle"
                fill="#334155"
                fontSize="10"
                fontWeight="500"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {trade}
              </text>
            </g>
          );
        })}

        {/* Center node */}
        <circle cx={cx} cy={cy} r="28" fill="#0F172A" opacity={active ? 1 : 0}
          style={{ transition: "opacity 0.6s 0.3s" }}
        />
        <circle cx={cx} cy={cy} r="28" fill="none" stroke="#3B82F6" strokeWidth="1.5"
          opacity={active ? 0.5 : 0} style={{ transition: "opacity 0.6s 0.3s" }}
        >
          <animate attributeName="r" values="28;34;28" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.15;0.5" dur="4s" repeatCount="indefinite" />
        </circle>
        <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="8"
          fontWeight="600" fontFamily="Inter, system-ui, sans-serif"
          opacity={active ? 1 : 0} style={{ transition: "opacity 0.6s 0.5s" }}
        >
          Data Center
        </text>
        <text x={cx} y={cy + 7} textAnchor="middle" fill="white" fontSize="8"
          fontWeight="600" fontFamily="Inter, system-ui, sans-serif"
          opacity={active ? 1 : 0} style={{ transition: "opacity 0.6s 0.5s" }}
        >
          Construction
        </text>
      </svg>
    </div>
  );
}

/* ──────────────────────── TYPING EFFECT ───────────────────────────── */

function TypeWriter({ text, active, speed = 35 }: { text: string; active: boolean; speed?: number }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!active) { setDisplayed(""); return; }
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, speed);
    return () => clearInterval(iv);
  }, [active, text, speed]);

  return (
    <span>
      {displayed}
      <span className="animate-pulse opacity-60">|</span>
    </span>
  );
}

/* ──────────────────────── FLOATING NAVBAR ──────────────────────────── */

function FloatingNav({
  scrolled,
  onGetStarted,
}: {
  scrolled: boolean;
  onGetStarted: () => void;
}) {
  const [, setLocation] = useLocation();

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${
        scrolled
          ? "bg-[#1A1A2E]/95 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <span
          className="text-base sm:text-lg font-bold tracking-[0.15em] uppercase text-white"
          style={{
            textShadow:
              "0 0 20px rgba(59,130,246,0.4), 0 0 40px rgba(59,130,246,0.2)",
          }}
        >
          GRISEUS
        </span>
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => setLocation("/login")}
            className="px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/25 transition-all hover:scale-105 active:scale-95"
          >
            Sign In
          </button>
          <button
            onClick={() => setLocation("/register")}
            className="onb-nav-btn relative px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #3B82F6, #10B981)",
            }}
          >
            Sign Up
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ──────────────────────── ANIMATED BUILDING ICON ──────────────────── */

function BuildingAnimation() {
  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 mx-auto">
      {/* Pulsing glow */}
      <div
        className="absolute inset-[-20%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
          animation: "onb-pulse-glow 3s ease-in-out infinite",
        }}
      />
      <svg viewBox="0 0 100 100" className="relative w-full h-full">
        {/* Building */}
        <rect
          x="25"
          y="28"
          width="50"
          height="52"
          rx="3"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="1.5"
          opacity="0.7"
        />
        {/* Windows - animated glow */}
        {[
          [32, 36],
          [45, 36],
          [58, 36],
          [32, 49],
          [45, 49],
          [58, 49],
          [32, 62],
          [45, 62],
          [58, 62],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="10" height="8" rx="1.5" fill="#3B82F6">
            <animate
              attributeName="opacity"
              values="0.1;0.55;0.1"
              dur={`${2 + (i % 3) * 0.5}s`}
              begin={`${i * 0.15}s`}
              repeatCount="indefinite"
            />
          </rect>
        ))}
        {/* Antenna */}
        <line
          x1="50"
          y1="14"
          x2="50"
          y2="28"
          stroke="#3B82F6"
          strokeWidth="1.5"
          opacity="0.5"
        />
        {/* Signal pulse */}
        <circle cx="50" cy="11" r="3" fill="#3B82F6" opacity="0.6">
          <animate
            attributeName="opacity"
            values="0.3;1;0.3"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          cx="50"
          cy="11"
          r="5"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="0.8"
          opacity="0"
        >
          <animate
            attributeName="r"
            values="5;18"
            dur="2.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.5;0"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          cx="50"
          cy="11"
          r="5"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="0.5"
          opacity="0"
        >
          <animate
            attributeName="r"
            values="5;28"
            dur="2.5s"
            begin="0.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.3;0"
            dur="2.5s"
            begin="0.8s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}

/* ──────────────────────── ANIMATED WORKER ICON ────────────────────── */

function WorkerAnimation() {
  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 mx-auto">
      {/* Pulsing glow */}
      <div
        className="absolute inset-[-20%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)",
          animation: "onb-pulse-glow 3s ease-in-out infinite 0.5s",
        }}
      />
      <svg viewBox="0 0 100 100" className="relative w-full h-full">
        {/* Hard hat */}
        <path
          d="M30 42 C30 25 70 25 70 42"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="1.5"
          opacity="0.7"
        />
        <rect
          x="26"
          y="41"
          width="48"
          height="5"
          rx="2.5"
          fill="#F59E0B"
          opacity="0.35"
        />
        {/* Head */}
        <circle
          cx="50"
          cy="54"
          r="9"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="1.5"
          opacity="0.6"
        />
        {/* Body */}
        <path
          d="M34 78 C34 68 42 64 50 64 C58 64 66 68 66 78"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="1.5"
          opacity="0.5"
        />
        {/* Arms */}
        <line
          x1="34"
          y1="72"
          x2="24"
          y2="65"
          stroke="#F59E0B"
          strokeWidth="1.5"
          opacity="0.4"
        />
        <line
          x1="66"
          y1="72"
          x2="76"
          y2="62"
          stroke="#F59E0B"
          strokeWidth="1.5"
          opacity="0.4"
        />
        {/* Tool in hand */}
        <line
          x1="76"
          y1="62"
          x2="83"
          y2="52"
          stroke="#F59E0B"
          strokeWidth="2"
          opacity="0.5"
        >
          <animate
            attributeName="opacity"
            values="0.3;0.7;0.3"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </line>
        {/* Glow pulse */}
        <circle
          cx="50"
          cy="50"
          r="30"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="0.5"
          opacity="0"
        >
          <animate
            attributeName="r"
            values="25;42"
            dur="3s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.3;0"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}

/* ─────────────────── FLOATING PARTICLES (CTA BG) ─────────────────── */

const CTA_PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  size: 1.5 + Math.random() * 2.5,
  left: Math.random() * 100,
  duration: 18 + Math.random() * 22,
  delay: Math.random() * 20,
  color:
    i % 3 === 0
      ? "59,130,246"
      : i % 3 === 1
        ? "16,185,129"
        : "245,158,11",
}));

function CtaParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {CTA_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            bottom: 0,
            background: `rgba(${p.color}, 0.5)`,
            boxShadow: `0 0 ${p.size * 4}px rgba(${p.color}, 0.3)`,
            animation: `onb-float-particle ${p.duration}s linear infinite`,
            animationDelay: `-${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ──────────────────────── CSS KEYFRAMES ───────────────────────────── */

const CTA_STYLES = `
@keyframes onb-border-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes onb-pulse-glow {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.25); opacity: 0.4; }
}
@keyframes onb-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes onb-float-particle {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  5% { opacity: 1; }
  95% { opacity: 1; }
  100% { transform: translateY(-100vh) translateX(30px); opacity: 0; }
}
@keyframes onb-nav-glow {
  0%, 100% { box-shadow: 0 0 12px rgba(59,130,246,0.3), 0 0 24px rgba(16,185,129,0.1); }
  50% { box-shadow: 0 0 20px rgba(59,130,246,0.5), 0 0 40px rgba(16,185,129,0.25); }
}
@keyframes onb-bg-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes onb-card-flash {
  0% { opacity: 0; }
  50% { opacity: 0.6; }
  100% { opacity: 0; }
}
.onb-nav-btn {
  animation: onb-nav-glow 2.5s ease-in-out infinite;
}
.onb-shimmer-text {
  background: linear-gradient(
    90deg,
    white 0%,
    white 35%,
    #60A5FA 50%,
    white 65%,
    white 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: onb-shimmer 4s ease-in-out infinite;
}
.onb-cta-card {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.4s ease;
  will-change: transform;
}
.onb-cta-card:hover {
  transform: perspective(800px) rotateY(2deg) rotateX(-1.5deg) scale(1.03) translateY(-4px);
}
.onb-cta-card .onb-hover-text {
  opacity: 0;
  transform: translateY(6px);
  transition: all 0.35s ease;
}
.onb-cta-card:hover .onb-hover-text {
  opacity: 1;
  transform: translateY(0);
}
.onb-cta-card .onb-rotating-border {
  opacity: 0.25;
  transition: opacity 0.4s ease;
}
.onb-cta-card:hover .onb-rotating-border {
  opacity: 0.7;
}
`;

/* ──────────────────────── MAIN PAGE ──────────────────────────────── */

export default function OnboardingPage() {
  const [, setLocation] = useLocation();

  // Section visibility
  const hero = useInView(0.3);
  const ontology = useInView(0.2);
  const stats = useInView(0.15);
  const hook = useInView(0.3);
  const cta = useInView(0.2);

  // Stagger hero counters
  const [heroReady, setHeroReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHeroReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Navbar scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      setNavScrolled(el.scrollTop > window.innerHeight * 0.3);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Card click animation
  const [navigating, setNavigating] = useState<string | null>(null);

  const handleCardClick = useCallback(
    (path: string) => {
      if (navigating) return;
      setNavigating(path);
      setTimeout(() => setLocation(path), 550);
    },
    [navigating, setLocation],
  );

  const scrollToNext = useCallback(() => {
    const sections = document.querySelectorAll("[data-section]");
    if (sections[1]) sections[1].scrollIntoView({ behavior: "smooth" });
  }, []);

  const goToCukurova = useCallback(() => {
    setLocation("/cukurova");
  }, [setLocation]);

  const statCounters = [
    { n: 12, label: "Trades", delay: 0 },
    { n: 29, label: "Certifications", delay: 200 },
    { n: 96, label: "Wage Data Points", delay: 400 },
    { n: 28, label: "Phase Requirements", delay: 600 },
    { n: 18, label: "Cross-Trade Pathways", delay: 800 },
  ];

  return (
    <div
      ref={scrollContainerRef}
      className="fixed inset-0 z-50 overflow-y-auto scroll-smooth"
      style={{ scrollSnapType: "y proximity" }}
    >
      <style>{CTA_STYLES}</style>

      {/* ━━━━━━━━━━ FLOATING NAVBAR ━━━━━━━━━━ */}
      <FloatingNav scrolled={navScrolled} onGetStarted={goToCukurova} />

      {/* ━━━━━━━━━━ SECTION 1: HERO ━━━━━━━━━━ */}
      <section
        data-section
        ref={hero.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, #0F172A 0%, #1A1A2E 50%, #0F172A 100%)",
          scrollSnapAlign: "start",
        }}
      >
        <ParticleGrid />

        {/* Logo */}
        <div
          className="relative z-10 mb-12 transition-all duration-1000"
          style={{
            opacity: heroReady ? 1 : 0,
            transform: heroReady ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <h1 className="text-lg font-medium tracking-[0.3em] uppercase text-blue-400/70 text-center">
            Griseus
          </h1>
        </div>

        {/* Animated counters */}
        <div className="relative z-10 flex flex-wrap justify-center gap-x-6 gap-y-4 sm:gap-x-10 mb-14 max-w-4xl">
          {statCounters.map((s, i) => (
            <div
              key={s.label}
              className="text-center transition-all duration-700"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? "translateY(0)" : "translateY(30px)",
                transitionDelay: `${s.delay}ms`,
              }}
            >
              <div
                className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-1"
                style={{
                  textShadow: heroReady
                    ? "0 0 40px rgba(59,130,246,0.3)"
                    : "none",
                  transition: "text-shadow 1.5s",
                }}
              >
                <AnimatedCounter
                  end={s.n}
                  active={heroReady}
                  duration={1400 + i * 200}
                />
              </div>
              <div className="text-xs sm:text-sm text-slate-400 font-medium tracking-wide uppercase">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Tagline */}
        <div
          className="relative z-10 text-center max-w-2xl transition-all duration-1000 delay-[1100ms]"
          style={{
            opacity: heroReady ? 1 : 0,
            transform: heroReady ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p className="text-lg sm:text-xl text-slate-300 font-light leading-relaxed">
            This is not a job board.{" "}
            <span className="text-white font-medium">
              This is workforce intelligence.
            </span>
          </p>
        </div>

        {/* Scroll indicator */}
        <button
          onClick={scrollToNext}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          <span className="text-xs tracking-widest uppercase">
            Scroll to explore
          </span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </button>
      </section>

      {/* ━━━━━━━━━━ SECTION 2: ONTOLOGY GRAPH ━━━━━━━━━━ */}
      <section
        data-section
        ref={ontology.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20"
        style={{
          background: "#F8FAFC",
          scrollSnapAlign: "start",
        }}
      >
        <div
          className="text-center mb-10 transition-all duration-700"
          style={{
            opacity: ontology.inView ? 1 : 0,
            transform: ontology.inView ? "translateY(0)" : "translateY(40px)",
          }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4 leading-tight">
            We mapped the entire
            <br />
            <span className="text-blue-500">
              data center construction workforce.
            </span>
          </h2>
        </div>

        <OntologyGraph active={ontology.inView} />

        <div
          className="text-center mt-8 transition-all duration-700 delay-500"
          style={{
            opacity: ontology.inView ? 1 : 0,
            transform: ontology.inView ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p className="text-slate-500 text-lg font-light">
            Every trade. Every certification. Every skill.{" "}
            <span className="text-slate-800 font-medium">Connected.</span>
          </p>
        </div>

        {/* Legend */}
        <div className="flex gap-6 mt-6 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Trades
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />{" "}
            Certifications
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Skills
          </span>
        </div>
      </section>

      {/* ━━━━━━━━━━ SECTION 3: THREE POWER STATS ━━━━━━━━━━ */}
      <section
        data-section
        ref={stats.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20"
        style={{
          background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)",
          scrollSnapAlign: "start",
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl w-full">
          {/* Card 1: Wage Intelligence */}
          <div
            className="group rounded-2xl p-8 transition-all duration-700"
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(203,213,225,0.4)",
              opacity: stats.inView ? 1 : 0,
              transform: stats.inView ? "translateY(0)" : "translateY(50px)",
              transitionDelay: "0ms",
            }}
          >
            {/* Mini bar chart */}
            <div className="flex items-end gap-1.5 h-16 mb-6">
              {[40, 58, 72, 65, 80, 56, 68].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all duration-1000"
                  style={{
                    height: stats.inView ? `${h}%` : "8%",
                    background: `linear-gradient(to top, #3B82F6, #60A5FA)`,
                    opacity: 0.3 + (h / 100) * 0.7,
                    transitionDelay: `${200 + i * 80}ms`,
                  }}
                />
              ))}
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-2">
              Wage Intelligence
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">
              Real-time compensation data across 4 major data center regions
            </h3>
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
              <div className="text-xs text-slate-400 mb-0.5">Sample</div>
              <div className="text-sm font-semibold text-slate-700">
                Senior Electrician, Northern Virginia
              </div>
              <div className="text-lg font-bold text-blue-600">
                $56 &ndash; $73/hr
              </div>
            </div>
          </div>

          {/* Card 2: Phase Planning */}
          <div
            className="group rounded-2xl p-8 transition-all duration-700"
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(203,213,225,0.4)",
              opacity: stats.inView ? 1 : 0,
              transform: stats.inView ? "translateY(0)" : "translateY(50px)",
              transitionDelay: "150ms",
            }}
          >
            {/* Mini gantt */}
            <div className="flex flex-col gap-2 mb-6 h-16 justify-center">
              {[
                { w: "85%", color: "#3B82F6", label: "Elec" },
                { w: "65%", color: "#10B981", label: "HVAC" },
                { w: "50%", color: "#F59E0B", label: "Plumb" },
              ].map((bar, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-400 w-8 text-right">
                    {bar.label}
                  </span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: stats.inView ? bar.w : "0%",
                        background: bar.color,
                        transitionDelay: `${400 + i * 150}ms`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-2">
              Phase Planning
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">
              Know exactly who you need, when you need them
            </h3>
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
              <div className="text-xs text-slate-400 mb-0.5">
                MEP Rough-In Phase
              </div>
              <div className="text-sm font-semibold text-slate-700">
                60 Electricians &middot; 40 HVAC &middot; 30 Plumbers
              </div>
              <div className="text-lg font-bold text-emerald-600">20 weeks</div>
            </div>
          </div>

          {/* Card 3: Career Pathways */}
          <div
            className="group rounded-2xl p-8 transition-all duration-700"
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(203,213,225,0.4)",
              opacity: stats.inView ? 1 : 0,
              transform: stats.inView ? "translateY(0)" : "translateY(50px)",
              transitionDelay: "300ms",
            }}
          >
            {/* Mini pathway */}
            <div className="flex items-center justify-center h-16 mb-6 gap-3">
              <div
                className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-500 text-xs font-bold transition-all duration-700"
                style={{
                  opacity: stats.inView ? 1 : 0,
                  transform: stats.inView ? "scale(1)" : "scale(0.5)",
                  transitionDelay: "500ms",
                }}
              >
                HVAC
              </div>
              <div className="flex items-center gap-0.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-0.5 rounded-full bg-amber-400 transition-all duration-500"
                    style={{
                      opacity: stats.inView ? 1 : 0,
                      transitionDelay: `${700 + i * 100}ms`,
                    }}
                  />
                ))}
                <ChevronDown className="w-3 h-3 text-amber-400 -rotate-90" />
              </div>
              <div
                className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 text-[9px] font-bold leading-tight text-center transition-all duration-700"
                style={{
                  opacity: stats.inView ? 1 : 0,
                  transform: stats.inView ? "scale(1)" : "scale(0.5)",
                  transitionDelay: "900ms",
                }}
              >
                Controls
                <br />
                BMS
              </div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-2">
              Career Pathways
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">
              AI-powered cross-trade transition recommendations
            </h3>
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
              <div className="text-xs text-slate-400 mb-0.5">Transition</div>
              <div className="text-sm font-semibold text-slate-700">
                HVAC Tech &rarr; Controls/BMS Tech
              </div>
              <div className="text-lg font-bold text-amber-600">
                moderate &middot; +$15/hr
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━ SECTION 4: THE HOOK ━━━━━━━━━━ */}
      <section
        data-section
        ref={hook.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20"
        style={{
          background: "linear-gradient(145deg, #0F172A 0%, #1A1A2E 100%)",
          scrollSnapAlign: "start",
        }}
      >
        <div className="max-w-3xl text-center">
          <h2
            className="text-2xl sm:text-3xl lg:text-[2.75rem] font-bold text-white leading-snug mb-8 transition-all duration-1000"
            style={{
              opacity: hook.inView ? 1 : 0,
              transform: hook.inView ? "translateY(0)" : "translateY(30px)",
            }}
          >
            <TypeWriter
              text="The construction industry runs on relationships and phone calls. We built the operating system."
              active={hook.inView}
              speed={30}
            />
          </h2>
          <p
            className="text-slate-400 text-base sm:text-lg font-light transition-all duration-700 delay-[3000ms]"
            style={{
              opacity: hook.inView ? 1 : 0,
              transform: hook.inView ? "translateY(0)" : "translateY(20px)",
            }}
          >
            Powered by proprietary workforce ontology. Not another job board.
          </p>
        </div>

        {/* Decorative line */}
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 w-16 h-px transition-all duration-1000 delay-[3500ms]"
          style={{
            background:
              "linear-gradient(90deg, transparent, #3B82F6, transparent)",
            opacity: hook.inView ? 0.5 : 0,
          }}
        />
      </section>

      {/* ━━━━━━━━━━ SECTION 5: CTA — MAGICAL ROLE SELECTION ━━━━━━━━━━ */}
      <section
        id="cta-section"
        data-section
        ref={cta.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-20 overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, #0F172A, #1A1A2E, #0F172A, #161637)",
          backgroundSize: "400% 400%",
          animation: "onb-bg-shift 20s ease infinite",
          scrollSnapAlign: "start",
        }}
      >
        {/* Floating particles */}
        <CtaParticles />

        {/* Heading with shimmer */}
        <div
          className="relative z-10 text-center mb-12 sm:mb-16 transition-all duration-700"
          style={{
            opacity: cta.inView ? 1 : 0,
            transform: cta.inView ? "translateY(0)" : "translateY(30px)",
          }}
        >
          <h2 className="onb-shimmer-text text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
            Ready to experience it?
          </h2>
          <p className="text-slate-400 text-base sm:text-lg font-light">
            See the platform in action
          </p>
        </div>

        {/* Single CTA card */}
        <div
          className="relative z-10 w-full max-w-[480px] transition-all duration-700 delay-200"
          style={{
            opacity: cta.inView ? 1 : 0,
            transform: cta.inView ? "translateY(0)" : "translateY(40px)",
          }}
        >
          <button
            onClick={() => { setNavigating("/cukurova"); setTimeout(() => setLocation("/cukurova"), 550); }}
            className="onb-cta-card group relative w-full min-h-[300px] sm:min-h-[340px] cursor-pointer text-left"
            disabled={!!navigating}
          >
            {/* Rotating gradient border */}
            <div className="absolute -inset-[1px] rounded-2xl overflow-hidden">
              <div
                className="onb-rotating-border absolute top-[-50%] left-[-50%] w-[200%] h-[200%]"
                style={{
                  background:
                    "conic-gradient(from 0deg, #3B82F6, transparent 25%, transparent 50%, #10B981, transparent 75%, #3B82F6)",
                  animation: "onb-border-rotate 4s linear infinite",
                }}
              />
            </div>

            {/* Card content */}
            <div
              className="relative z-10 h-full rounded-2xl flex flex-col items-center justify-center p-8 sm:p-10 transition-all duration-500"
              style={{
                background:
                  navigating === "/cukurova"
                    ? "rgba(59,130,246,0.15)"
                    : "rgba(13,17,23,0.95)",
                boxShadow:
                  navigating === "/cukurova"
                    ? "0 0 80px 20px rgba(59,130,246,0.3)"
                    : "none",
              }}
            >
              {/* Click flash overlay */}
              {navigating === "/cukurova" && (
                <div
                  className="absolute inset-0 rounded-2xl bg-blue-500/20 pointer-events-none"
                  style={{ animation: "onb-card-flash 0.5s ease-out" }}
                />
              )}

              <BuildingAnimation />

              <h3 className="text-2xl sm:text-[28px] font-bold text-white mt-6 mb-2 text-center">
                Operations Intelligence Platform
              </h3>
              <p className="text-slate-400 text-sm sm:text-base text-center leading-relaxed max-w-[320px]">
                Çukurova Isı Sistemleri — üretim hattı izleme ve fabrika operasyonları
              </p>

              {/* Hover reveal text */}
              <div className="onb-hover-text mt-4 flex items-center gap-2 text-xs font-medium text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Enter Platform
              </div>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
