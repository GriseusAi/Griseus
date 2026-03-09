import { useState } from "react";
import { Link } from "wouter";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("https://formspree.io/f/xkovrrzd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setMessage({ text: "You're on the list! We'll be in touch soon.", type: "success" });
        setEmail("");
      } else {
        throw new Error("failed");
      }
    } catch {
      setMessage({ text: "Something went wrong. Please try again.", type: "error" });
    }
    setSubmitting(false);
  }

  return (
    <div className="landing font-sans text-slate-400 antialiased overflow-x-hidden" style={{ backgroundColor: "#0F172A" }}>
      {/* Accent bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-emerald-500 to-amber-500 z-[60]" />
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/10 bg-[#0F172A]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-white tracking-tight">Griseus</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
              Login
            </Link>
            <a href="#waitlist" className="text-sm px-5 py-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors">
              Join Waitlist
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center pt-24 pb-20">
          {/* Badge */}
          <div className="landing-fade-in inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-medium text-blue-400 tracking-wide uppercase">Early Access</span>
          </div>

          {/* Heading */}
          <h1 className="landing-fade-in landing-fade-in-delay-1 text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] tracking-tight mb-6">
            Workforce Intelligence<br />
            <span className="text-blue-400">for Manufacturing</span>
          </h1>

          {/* Tagline */}
          <p className="landing-fade-in landing-fade-in-delay-2 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Optimize your production floor &mdash; right operator, right shift, right line.
            Built for Turkish industrial manufacturers.
          </p>

          {/* Waitlist Form */}
          <div id="waitlist" className="landing-fade-in landing-fade-in-delay-3 scroll-mt-32">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 px-4 py-3 rounded-xl bg-[#1E293B] border border-white/10 text-white text-sm
                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25
                           transition-all placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold
                           transition-all shadow-lg hover:shadow-xl hover:shadow-blue-500/20 active:scale-[0.98]
                           whitespace-nowrap disabled:opacity-50"
              >
                {submitting ? "Joining..." : "Join Waitlist"}
              </button>
            </form>
            {message && (
              <p className={`mt-3 text-sm ${message.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                {message.text}
              </p>
            )}
            <p className="mt-4 text-xs text-slate-400/60">No spam. We'll notify you when we launch.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-medium text-blue-400 mb-3 tracking-wide uppercase">What we do</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Smarter workforce decisions for your production floor
            </h2>
            <p className="text-slate-400 leading-relaxed">
              From shift planning to seasonal forecasting, Griseus gives manufacturing
              leaders the intelligence to make the right call &mdash; before it's too late.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                ),
                title: "Production Line Optimization",
                desc: "Maximize output per operator. Assign the right people to the right lines based on skills, experience, and real-time production data.",
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                ),
                title: "Seasonal Demand Forecasting",
                desc: "Prepare for peak season before it hits. Model demand curves and workforce needs so you're never caught understaffed.",
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                ),
                title: "Financial Simulation",
                desc: "Model workforce changes before committing. See the cost impact of adding shifts, hiring temps, or restructuring lines.",
              },
            ].map((feature) => (
              <div key={feature.title} className="landing-card-hover group p-6 rounded-2xl border border-white/10 bg-[#1A1A2E]">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 group-hover:border-blue-500/40 transition-colors">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    {feature.icon}
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Griseus Works — Architecture Diagram */}
      <section className="relative py-24 sm:py-32 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, #38bdf8 0%, transparent 70%)" }} />
        </div>

        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-blue-400 mb-3 tracking-wide uppercase">Architecture</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">How Griseus Works</h2>
            <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
              Your factory data flows through our intelligence layer and becomes actionable decisions.
            </p>
          </div>

          {/* Three-layer diagram */}
          <div className="relative flex flex-col items-center gap-0">

            {/* ─── LAYER 3: DECISIONS (top) ─── */}
            <div className="w-full max-w-3xl mb-2">
              <p className="text-[11px] font-semibold text-emerald-400 tracking-[0.15em] uppercase mb-3 text-center">Aksiyon Alın</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { title: "Darboğaz Tespiti", desc: "Bottleneck detection", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" },
                  { title: "Vardiya Optimizasyonu", desc: "Shift optimization", icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" },
                  { title: "Maliyet Simülasyonu", desc: "Cost simulation", icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
                ].map((card) => (
                  <div key={card.title} className="group p-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] hover:border-emerald-500/30 hover:bg-emerald-500/[0.06] transition-all duration-300">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-2.5">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                      </svg>
                    </div>
                    <p className="text-white text-sm font-semibold mb-0.5">{card.title}</p>
                    <p className="text-[11px] text-slate-500">{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── FLOW LINES: Ontology → Decisions ─── */}
            <div className="relative w-full max-w-3xl h-14 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 700 56" fill="none" preserveAspectRatio="xMidYMid meet">
                {/* Three upward lines from ontology to decision cards */}
                {[175, 350, 525].map((x, i) => (
                  <g key={i}>
                    <line x1={x} y1={52} x2={x} y2={4} stroke="rgba(16,185,129,0.15)" strokeWidth={1} strokeDasharray="4 3" />
                    <circle r={2.5} fill="#10b981">
                      <animate attributeName="cy" values="52;4" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
                      <animate attributeName="cx" values={`${x};${x}`} dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0;1;1;0" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
                    </circle>
                  </g>
                ))}
              </svg>
            </div>

            {/* ─── LAYER 2: ONTOLOGY (middle, highlighted) ─── */}
            <div className="w-full max-w-3xl relative">
              <p className="text-[11px] font-semibold text-blue-400 tracking-[0.15em] uppercase mb-3 text-center">Griseus Intelligence Layer</p>
              <div className="relative rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-6 sm:p-8 overflow-hidden">
                {/* Subtle glow overlay */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: "radial-gradient(ellipse at center, rgba(56,189,248,0.06) 0%, transparent 70%)",
                }} />

                {/* Ontology nodes with connecting lines */}
                <svg className="w-full" viewBox="0 0 640 80" fill="none" preserveAspectRatio="xMidYMid meet">
                  {/* Connecting lines */}
                  {[
                    { x1: 96, x2: 224 },
                    { x1: 224, x2: 352 },
                    { x1: 352, x2: 480 },
                    { x1: 480, x2: 576 },
                  ].map((seg, i) => (
                    <g key={i}>
                      <line x1={seg.x1} y1={40} x2={seg.x2} y2={40} stroke="rgba(56,189,248,0.2)" strokeWidth={1.5} />
                      {/* Flowing dot */}
                      <circle r={3} fill="#38bdf8" opacity={0.9}>
                        <animate attributeName="cx" values={`${seg.x1};${seg.x2}`} dur="2.5s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                        <animate attributeName="cy" values="40;40" dur="2.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0;0.9;0.9;0" dur="2.5s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                      </circle>
                    </g>
                  ))}

                  {/* Nodes */}
                  {[
                    { x: 64, label: "Factory" },
                    { x: 192, label: "Prod. Line" },
                    { x: 320, label: "Operator" },
                    { x: 448, label: "Shift" },
                    { x: 576, label: "Output" },
                  ].map((node) => (
                    <g key={node.label}>
                      {/* Outer glow ring */}
                      <circle cx={node.x} cy={40} r={20} fill="none" stroke="rgba(56,189,248,0.1)" strokeWidth={1}>
                        <animate attributeName="r" values="20;24;20" dur="3s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" />
                      </circle>
                      {/* Node circle */}
                      <circle cx={node.x} cy={40} r={16} fill="rgba(56,189,248,0.08)" stroke="rgba(56,189,248,0.35)" strokeWidth={1.5} />
                      <circle cx={node.x} cy={40} r={4} fill="#38bdf8" opacity={0.7} />
                      {/* Label */}
                      <text x={node.x} y={72} textAnchor="middle" fill="rgba(148,163,184,0.7)" fontSize={10} fontFamily="Inter, system-ui, sans-serif" fontWeight={500}>
                        {node.label}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {/* ─── FLOW LINES: Data → Ontology ─── */}
            <div className="relative w-full max-w-3xl h-14 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 700 56" fill="none" preserveAspectRatio="xMidYMid meet">
                {[130, 280, 420, 570].map((x, i) => (
                  <g key={i}>
                    <line x1={x} y1={52} x2={x} y2={4} stroke="rgba(56,189,248,0.12)" strokeWidth={1} strokeDasharray="4 3" />
                    <circle r={2.5} fill="#38bdf8">
                      <animate attributeName="cy" values="52;4" dur="2.2s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
                      <animate attributeName="cx" values={`${x};${x}`} dur="2.2s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0;0.8;0.8;0" dur="2.2s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
                    </circle>
                  </g>
                ))}
              </svg>
            </div>

            {/* ─── LAYER 1: DATA (bottom) ─── */}
            <div className="w-full max-w-3xl">
              <p className="text-[11px] font-semibold text-slate-500 tracking-[0.15em] uppercase mb-3 text-center">Fabrika Verileriniz</p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Shift Records", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
                  { label: "Operator Profiles", icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
                  { label: "Production Output", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
                  { label: "Equipment Status", icon: "M11.42 15.17l-5.1-3.06a1.5 1.5 0 010-2.58l5.1-3.06a1.5 1.5 0 012.08.56v.5a.75.75 0 001.5 0v-.5a3 3 0 00-4.16-1.12L5.74 9.37a3 3 0 000 5.16l5.1 3.06a3 3 0 004.16-1.12v-.5a.75.75 0 00-1.5 0v.5a1.5 1.5 0 01-2.08.56zM18.75 12a.75.75 0 00-.75.75v.01c0 .414.336.75.75.75h.01a.75.75 0 00.75-.75V12.75a.75.75 0 00-.75-.75h-.01zM15 12a.75.75 0 00-.75.75v.01c0 .414.336.75.75.75h.01a.75.75 0 00.75-.75V12.75a.75.75 0 00-.75-.75H15z" },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium text-center leading-tight">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Pilot Program */}
      <section className="relative py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="relative rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 sm:p-14 text-center overflow-hidden">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-medium text-emerald-400 tracking-wide uppercase">Pilot Program</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Live in production
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto mb-2 leading-relaxed text-lg">
                Currently piloting with <span className="text-white font-semibold">Cukurova Isi Sistemleri</span> &mdash; one of Turkey's largest HVAC manufacturers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="relative rounded-2xl border border-white/10 bg-[#1A1A2E] p-10 sm:p-14 text-center overflow-hidden">
            <div className="relative z-10">
              <p className="text-sm font-medium text-blue-400 mb-3 font-mono">// launching soon</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Workforce intelligence built for the production floor
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto mb-8 leading-relaxed">
                Whether you run a single factory or multiple production sites,
                Griseus optimizes every shift, every line, every operator.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a href="#waitlist" className="inline-flex px-8 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.98]">
                  Join the Waitlist
                </a>
                <Link href="/login" className="inline-flex px-8 py-3 rounded-xl border border-white/10 hover:border-white/20 text-white hover:text-white text-sm font-medium transition-all">
                  Login to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white tracking-tight">Griseus</span>
            <span className="text-sm text-slate-400">&copy; 2026 All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
