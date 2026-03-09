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

/* ──────────────────────── MAIN PAGE ──────────────────────────────── */

export default function OnboardingPage() {
  const [, setLocation] = useLocation();

  const hero = useInView(0.3);

  // Stagger hero counters
  const [heroReady, setHeroReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHeroReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  const statCounters = [
    { n: 12, label: "Trades", delay: 0 },
    { n: 29, label: "Certifications", delay: 200 },
    { n: 96, label: "Wage Data Points", delay: 400 },
    { n: 28, label: "Phase Requirements", delay: 600 },
    { n: 18, label: "Cross-Trade Pathways", delay: 800 },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* ━━━━━━━━━━ HERO ━━━━━━━━━━ */}
      <section
        ref={hero.ref}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, #0F172A 0%, #1A1A2E 50%, #0F172A 100%)",
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

        {/* Bottom prompt */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-slate-500 transition-all duration-1000 delay-[1400ms]"
          style={{
            opacity: heroReady ? 1 : 0,
          }}
        >
          <button
            onClick={() => setLocation("/login")}
            className="text-xs tracking-widest uppercase hover:text-slate-300 transition-colors cursor-pointer"
          >
            Sign in to get started
          </button>
        </div>
      </section>
    </div>
  );
}
