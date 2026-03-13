import { useEffect, useRef, useState } from "react";

/* ── Shared tokens ──────────────────────────────────────────── */
const C = {
  bg:     "#07070b",
  card:   "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  dim:    "rgba(255,255,255,0.35)",
  mid:    "rgba(255,255,255,0.60)",
  bright: "rgba(255,255,255,0.92)",
  green:  "#34d399",
  red:    "#f87171",
};

/* ── Animated counter ───────────────────────────────────────── */
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const step = Math.ceil(target / 40);
      const t = setInterval(() => {
        start = Math.min(start + step, target);
        setVal(start);
        if (start >= target) clearInterval(t);
      }, 28);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ── Ontology diagram ───────────────────────────────────────── */
function OntologyDiagram() {
  const trades = ["Electrical","HVAC","Plumbing","Controls/BMS","Sheet Metal","Fire Protection","Ironwork","Low Voltage"];
  const phases = ["Site Prep","Civil","MEP Rough-In","Commissioning","Go-Live"];
  const cx = 300, cy = 210, r = 150;
  const nodes = trades.map((t, i) => {
    const a = (i / trades.length) * 2 * Math.PI - Math.PI / 2;
    return { label: t, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  return (
    <svg width="100%" viewBox="0 0 600 420" style={{ display: "block" }}>
      {/* spokes */}
      {nodes.map((n, i) => (
        <line key={i} x1={cx} y1={cy} x2={n.x} y2={n.y}
          stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,3" />
      ))}
      {/* orbit ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* phase arc (inner) */}
      <circle cx={cx} cy={cy} r={68} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      {/* center node */}
      <circle cx={cx} cy={cy} r={42} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <text x={cx} y={cy - 6} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="11" fontWeight="600" fontFamily="inherit">DATA CENTER</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="11" fontWeight="600" fontFamily="inherit">ONTOLOGY</text>

      {/* inner phase nodes */}
      {phases.map((_p, i) => {
        const a = (i / phases.length) * 2 * Math.PI - Math.PI / 2;
        const px = cx + 68 * Math.cos(a), py = cy + 68 * Math.sin(a);
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={5} fill={C.bg} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          </g>
        );
      })}

      {/* trade nodes */}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={22} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
          <text x={n.x} y={n.y - 3} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="8.5" fontFamily="inherit" fontWeight="500">
            {n.label.split("/")[0]}
          </text>
          {n.label.includes("/") && (
            <text x={n.x} y={n.y + 7} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="7.5" fontFamily="inherit">{n.label.split("/")[1]}</text>
          )}
        </g>
      ))}

      {/* cert dots scattered on spokes */}
      {nodes.map((_n, i) => {
        const a = (i / trades.length) * 2 * Math.PI - Math.PI / 2;
        return [0.38, 0.62].map((t, j) => (
          <circle key={`${i}-${j}`}
            cx={cx + r * t * Math.cos(a)}
            cy={cy + r * t * Math.sin(a)}
            r="3" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.7" />
        ));
      })}

      {/* legend */}
      <g transform="translate(20,370)">
        <circle cx="6" cy="6" r="6" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
        <text x="16" y="10" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="inherit">Trade</text>
        <circle cx="70" cy="6" r="3" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.7"/>
        <text x="78" y="10" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="inherit">Certification</text>
        <circle cx="170" cy="6" r="5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
        <text x="179" y="10" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="inherit">Phase</text>
      </g>
    </svg>
  );
}

/* ── Scheduling diagram ─────────────────────────────────────── */
function SchedulingDiagram() {
  const phases = [
    { label: "Civil", w: 60 },
    { label: "MEP Rough-In", w: 110 },
    { label: "Commissioning", w: 90 },
    { label: "Go-Live", w: 50 },
  ];
  const trades = ["Electrical", "HVAC", "Plumbing", "Controls"];
  const colors = ["rgba(255,255,255,0.55)", "rgba(255,255,255,0.40)", "rgba(255,255,255,0.28)", "rgba(255,255,255,0.18)"];
  let xOff = 90;
  const bars = phases.map((p) => { const x = xOff; xOff += p.w + 4; return { ...p, x }; });

  return (
    <svg width="100%" viewBox="0 0 340 180" style={{ display: "block" }}>
      {/* trade labels */}
      {trades.map((t, i) => (
        <text key={i} x="82" y={30 + i * 30 + 9} textAnchor="end" fill="rgba(255,255,255,0.45)" fontSize="9.5" fontFamily="inherit">{t}</text>
      ))}
      {/* phase headers */}
      {bars.map((b, i) => (
        <text key={i} x={b.x + b.w / 2} y="14" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="8" fontFamily="inherit">{b.label}</text>
      ))}
      {/* grid lines */}
      {[0,1,2,3].map(i => (
        <line key={i} x1="90" y1={22 + i * 30} x2="330" y2={22 + i * 30} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
      ))}
      {/* gantt bars */}
      {trades.map((_t, ti) =>
        bars.map((b, bi) => {
          const active = (ti === 0 && bi <= 2) || (ti === 1 && bi >= 1 && bi <= 2) || (ti === 2 && bi === 1) || (ti === 3 && bi === 2);
          if (!active) return null;
          return (
            <rect key={`${ti}-${bi}`} x={b.x} y={22 + ti * 30} width={b.w} height="20" rx="3"
              fill={colors[ti]} />
          );
        })
      )}
      {/* worker count badges */}
      <text x="140" y="35" fill="rgba(255,255,255,0.9)" fontSize="9" fontFamily="inherit" fontWeight="600">24 workers</text>
      <text x="155" y="65" fill="rgba(255,255,255,0.9)" fontSize="9" fontFamily="inherit" fontWeight="600">18 workers</text>
      <text x="155" y="95" fill="rgba(255,255,255,0.9)" fontSize="9" fontFamily="inherit" fontWeight="600">12 workers</text>
      <text x="200" y="125" fill="rgba(255,255,255,0.9)" fontSize="9" fontFamily="inherit" fontWeight="600">6 workers</text>
    </svg>
  );
}

/* ── Trust score diagram ────────────────────────────────────── */
function TrustDiagram() {
  const segments = [
    { label: "Certifications", pct: 30, color: "rgba(255,255,255,0.85)" },
    { label: "Project History", pct: 25, color: "rgba(255,255,255,0.60)" },
    { label: "Employer Ratings", pct: 25, color: "rgba(255,255,255,0.40)" },
    { label: "Attendance", pct: 20, color: "rgba(255,255,255,0.20)" },
  ];
  const cx = 90, cy = 90, r = 68, ir = 44;
  let angle = -Math.PI / 2;
  const arcs = segments.map((s) => {
    const sweep = (s.pct / 100) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep);
    const ix1 = cx + ir * Math.cos(angle), iy1 = cy + ir * Math.sin(angle);
    const ix2 = cx + ir * Math.cos(angle + sweep), iy2 = cy + ir * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const mid = angle + sweep / 2;
    const lx = cx + (r + 18) * Math.cos(mid), ly = cy + (r + 18) * Math.sin(mid);
    const path = `M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${large},0 ${ix1},${iy1} Z`;
    angle += sweep;
    return { ...s, path, lx, ly };
  });

  return (
    <svg width="100%" viewBox="0 0 340 180" style={{ display: "block" }}>
      {arcs.map((a, i) => (
        <g key={i}>
          <path d={a.path} fill={a.color} stroke={C.bg} strokeWidth="2" />
        </g>
      ))}
      {/* center score */}
      <text x={cx} y={cy - 8} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="22" fontWeight="700" fontFamily="inherit">741</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="inherit">TRUST SCORE</text>
      {/* legend */}
      {arcs.map((a, i) => (
        <g key={i} transform={`translate(200, ${20 + i * 34})`}>
          <rect width="10" height="10" rx="2" fill={a.color} />
          <text x="16" y="9" fill="rgba(255,255,255,0.6)" fontSize="10" fontFamily="inherit">{a.label}</text>
          <text x="16" y="22" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="inherit">{a.pct}% weight</text>
        </g>
      ))}
    </svg>
  );
}

/* ── Main landing page ──────────────────────────────────────── */
export default function LandingPage() {
  const stats = [
    { n: 12, label: "Trades mapped" },
    { n: 29, label: "Certifications" },
    { n: 96, label: "Wage data points" },
    { n: 28, label: "Phase requirements" },
    { n: 18, label: "Cross-trade pathways" },
  ];

  const pillars = [
    {
      num: "01",
      title: "Scheduling Intelligence",
      sub: "Know exactly who you need, and when.",
      body: "Our phase-trade matrix maps every construction phase of a 60MW+ data center to the exact trades, headcounts, and lead times required — weeks before critical path.",
      diagram: <SchedulingDiagram />,
    },
    {
      num: "02",
      title: "Workforce Ontology",
      sub: "The first structured map of data center labor.",
      body: "12 trades, 29 certifications, 96 regional wage data points, 18 cross-trade pathways. A machine-readable knowledge graph that no competitor has built.",
      diagram: <OntologyDiagram />,
    },
    {
      num: "03",
      title: "Workforce Trust Score",
      sub: "A FICO score for blue-collar workers.",
      body: "Built from employer-verified installation records, service histories, and performance ratings — a proprietary data moat unavailable from any public source.",
      diagram: <TrustDiagram />,
    },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.bright, fontFamily: "'Inter','Outfit',sans-serif", lineHeight: 1.6 }}>

      {/* ── NAV ── */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 48px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.bg, zIndex: 50 }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.08em" }}>GRISEUS</span>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={{ padding: "8px 20px", border: `1px solid ${C.border}`, borderRadius: 6, background: "transparent", color: C.mid, cursor: "pointer", fontSize: 13 }}>Sign In</button>
          <button style={{ padding: "8px 20px", border: "none", borderRadius: 6, background: "rgba(255,255,255,0.92)", color: "#07070b", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Sign Up</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ padding: "100px 48px 80px", maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
        <div style={{ display: "inline-block", border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 14px", fontSize: 11, color: C.dim, letterSpacing: "0.12em", marginBottom: 32, textTransform: "uppercase" }}>
          Workforce Intelligence · Data Center Construction
        </div>
        <h1 style={{ fontSize: "clamp(36px,5.5vw,68px)", fontWeight: 800, lineHeight: 1.12, margin: "0 0 28px", letterSpacing: "-0.02em" }}>
          Schedule the right worker.<br />
          <span style={{ color: C.mid }}>Before you even break ground.</span>
        </h1>
        <p style={{ fontSize: 18, color: C.mid, maxWidth: 560, margin: "0 auto 48px", lineHeight: 1.7 }}>
          Griseus is the intelligence layer for data center construction workforce planning — from phase scheduling to verified worker trust scores.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{ padding: "14px 32px", background: C.bright, color: C.bg, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer", letterSpacing: "0.02em" }}>
            See the Platform →
          </button>
          <button style={{ padding: "14px 32px", background: "transparent", color: C.mid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 500, fontSize: 15, cursor: "pointer" }}>
            Request Demo
          </button>
        </div>
      </section>

      {/* ── STAT BAR ── */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "36px 48px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "clamp(24px,4vw,72px)", flexWrap: "wrap", maxWidth: 960, margin: "0 auto" }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "clamp(28px,3vw,42px)", fontWeight: 800, letterSpacing: "-0.03em", color: C.bright }}>
                <Counter target={s.n} />
              </div>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOOK ── */}
      <section style={{ padding: "80px 48px", textAlign: "center" }}>
        <p style={{ fontSize: "clamp(18px,2.5vw,26px)", color: C.mid, maxWidth: 700, margin: "0 auto", lineHeight: 1.7 }}>
          This is not a job board.<br />
          <strong style={{ color: C.bright }}>This is workforce intelligence.</strong>
        </p>
      </section>

      {/* ── THREE PILLARS ── */}
      {pillars.map((p, i) => (
        <section key={i} style={{
          borderTop: `1px solid ${C.border}`,
          padding: "80px 48px",
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 64,
          alignItems: "center",
        }}>
          {/* text side */}
          <div style={{ order: i % 2 === 0 ? 0 : 1 }}>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>{p.num}</div>
            <h2 style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 700, margin: "0 0 12px", lineHeight: 1.2, letterSpacing: "-0.02em" }}>{p.title}</h2>
            <p style={{ fontSize: 15, color: C.mid, margin: "0 0 16px", fontStyle: "italic" }}>{p.sub}</p>
            <p style={{ fontSize: 15, color: C.dim, lineHeight: 1.75 }}>{p.body}</p>
          </div>
          {/* diagram side */}
          <div style={{
            order: i % 2 === 0 ? 1 : 0,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "24px 16px",
            overflow: "hidden",
          }}>
            {p.diagram}
          </div>
        </section>
      ))}

      {/* ── HOW IT WORKS ── */}
      <section style={{ borderTop: `1px solid ${C.border}`, padding: "80px 48px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>How it works</div>
          <h2 style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Three layers. One platform.</h2>
        </div>
        {/* Flow diagram */}
        <svg width="100%" viewBox="0 0 860 120" style={{ display: "block", overflow: "visible" }}>
          {/* arrow lines */}
          {[1,2].map(i => (
            <g key={i}>
              <line x1={160 + i*220} y1="60" x2={200 + i*220} y2="60" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="4,3"/>
              <polygon points={`${205+i*220},56 ${218+i*220},60 ${205+i*220},64`} fill="rgba(255,255,255,0.35)"/>
            </g>
          ))}
          {[
            { x: 30, label: "Scheduling\nIntelligence", sub: "Phase-aware\nworkforce planning" },
            { x: 250, label: "Workforce\nMatching", sub: "Verified workers\non-demand" },
            { x: 470, label: "Trust\nScore", sub: "Employer-verified\nperformance data" },
          ].map((box, i) => (
            <g key={i}>
              <rect x={box.x} y="16" width="160" height="88" rx="8"
                fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
              <text x={box.x + 80} y="50" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="13" fontWeight="600" fontFamily="inherit">
                {box.label.split("\n")[0]}
              </text>
              <text x={box.x + 80} y="66" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="13" fontWeight="600" fontFamily="inherit">
                {box.label.split("\n")[1]}
              </text>
              <text x={box.x + 80} y="84" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="inherit">
                {box.sub.split("\n")[0]}
              </text>
              <text x={box.x + 80} y="96" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="inherit">
                {box.sub.split("\n")[1]}
              </text>
            </g>
          ))}
          {/* moat label */}
          <g>
            <rect x="680" y="16" width="160" height="88" rx="8"
              fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
            <text x="760" y="50" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="13" fontWeight="700" fontFamily="inherit">Proprietary</text>
            <text x="760" y="66" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="13" fontWeight="700" fontFamily="inherit">Data Moat</text>
            <text x="760" y="84" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="inherit">Unavailable from</text>
            <text x="760" y="96" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="inherit">any public source</text>
            <line x1="632" y1="60" x2="678" y2="60" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="4,3"/>
            <polygon points="673,56 686,60 673,64" fill="rgba(255,255,255,0.35)"/>
          </g>
        </svg>
      </section>

      {/* ── CTA ── */}
      <section style={{ borderTop: `1px solid ${C.border}`, padding: "100px 48px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(28px,4vw,52px)", fontWeight: 800, margin: "0 0 20px", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
          Ready to build smarter?
        </h2>
        <p style={{ color: C.mid, fontSize: 17, marginBottom: 40 }}>
          Join the first platform built for data center construction workforce intelligence.
        </p>
        <button style={{ padding: "16px 40px", background: C.bright, color: C.bg, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 16, cursor: "pointer", letterSpacing: "0.02em" }}>
          Get Early Access
        </button>
        <div style={{ marginTop: 64, paddingTop: 32, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap" }}>
          {["Powered by Griseus Engine v1", "© 2026 IX Studio", "griseus.io"].map((t, i) => (
            <span key={i} style={{ fontSize: 11, color: C.dim, letterSpacing: "0.08em" }}>{t}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
