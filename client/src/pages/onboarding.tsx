import { useLocation } from "wouter";
import { Building2, HardHat, ChevronDown } from "lucide-react";
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

  const scrollToNext = useCallback(() => {
    const sections = document.querySelectorAll("[data-section]");
    if (sections[1]) sections[1].scrollIntoView({ behavior: "smooth" });
  }, []);

  const statCounters = [
    { n: 12, label: "Trades", delay: 0 },
    { n: 29, label: "Certifications", delay: 200 },
    { n: 96, label: "Wage Data Points", delay: 400 },
    { n: 28, label: "Phase Requirements", delay: 600 },
    { n: 18, label: "Cross-Trade Pathways", delay: 800 },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto scroll-smooth"
      style={{ scrollSnapType: "y proximity" }}
    >
      {/* ━━━━━━━━━━ SECTION 1: HERO ━━━━━━━━━━ */}
      <section
        data-section
        ref={hero.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #0F172A 0%, #1A1A2E 50%, #0F172A 100%)",
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
              <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-1"
                style={{
                  textShadow: heroReady ? "0 0 40px rgba(59,130,246,0.3)" : "none",
                  transition: "text-shadow 1.5s",
                }}
              >
                <AnimatedCounter end={s.n} active={heroReady} duration={1400 + i * 200} />
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
          <span className="text-xs tracking-widest uppercase">Scroll to explore</span>
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
            We mapped the entire<br />
            <span className="text-blue-500">data center construction workforce.</span>
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
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Certifications
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
              <div className="text-lg font-bold text-blue-600">$56 – $73/hr</div>
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
                  <span className="text-[9px] text-slate-400 w-8 text-right">{bar.label}</span>
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
              <div className="text-xs text-slate-400 mb-0.5">MEP Rough-In Phase</div>
              <div className="text-sm font-semibold text-slate-700">
                60 Electricians · 40 HVAC · 30 Plumbers
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
                {[0, 1, 2].map(i => (
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
                Controls<br />BMS
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
                HVAC Tech → Controls/BMS Tech
              </div>
              <div className="text-lg font-bold text-amber-600">moderate · +$15/hr</div>
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
            background: "linear-gradient(90deg, transparent, #3B82F6, transparent)",
            opacity: hook.inView ? 0.5 : 0,
          }}
        />
      </section>

      {/* ━━━━━━━━━━ SECTION 5: CTA — ROLE SELECTION ━━━━━━━━━━ */}
      <section
        data-section
        ref={cta.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20"
        style={{
          backgroundColor: "#EEE7DD",
          scrollSnapAlign: "start",
        }}
      >
        <div
          className="text-center mb-10 transition-all duration-700"
          style={{
            opacity: cta.inView ? 1 : 0,
            transform: cta.inView ? "translateY(0)" : "translateY(30px)",
          }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-[#2D2D2D] mb-3">
            Ready to experience it?
          </h2>
          <p className="text-[#5A5A5A] text-base">
            Choose your path to get started
          </p>
        </div>

        {/* Role cards — elevated Coastal Ibiza */}
        <div
          className="w-full max-w-lg flex flex-col sm:flex-row gap-5 transition-all duration-700 delay-200"
          style={{
            opacity: cta.inView ? 1 : 0,
            transform: cta.inView ? "translateY(0)" : "translateY(30px)",
          }}
        >
          {/* Company */}
          <button
            onClick={() => setLocation("/onboarding/company")}
            className="flex-1 group rounded-2xl border border-[#CEB298]/30 bg-white/80 backdrop-blur-sm p-8 text-left transition-all duration-200 hover:shadow-lg hover:border-[#9F6C52]/40 hover:scale-[1.03] hover:-translate-y-1"
          >
            <div className="w-14 h-14 rounded-xl bg-[#9F6C52]/10 flex items-center justify-center mb-5 group-hover:bg-[#9F6C52]/20 transition-colors">
              <Building2 className="w-7 h-7 text-[#9F6C52]" />
            </div>
            <h3 className="text-xl font-semibold text-[#2D2D2D] mb-1">
              I'm Hiring
            </h3>
            <p className="text-[#5A5A5A] text-sm leading-relaxed">
              Find skilled workers for your data center projects
            </p>
          </button>

          {/* Worker */}
          <button
            onClick={() => setLocation("/onboarding/worker")}
            className="flex-1 group rounded-2xl bg-[#92ABBB] p-8 text-left transition-all duration-200 hover:bg-[#839dae] hover:shadow-lg hover:scale-[1.03] hover:-translate-y-1"
          >
            <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center mb-5 group-hover:bg-white/30 transition-colors">
              <HardHat className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-1">
              I'm Looking for Work
            </h3>
            <p className="text-white/80 text-sm leading-relaxed">
              Showcase your skills and find the right jobs
            </p>
          </button>
        </div>

        {/* Sign-in link */}
        <div
          className="mt-10 transition-all duration-700 delay-500"
          style={{
            opacity: cta.inView ? 1 : 0,
          }}
        >
          <button
            onClick={() => setLocation("/login")}
            className="text-sm text-[#5A5A5A] hover:text-[#2D2D2D] transition-colors"
          >
            Already have an account?{" "}
            <span className="text-[#92ABBB] font-medium hover:text-[#7a97a8]">
              Sign in
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
