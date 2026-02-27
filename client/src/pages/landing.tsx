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
    <div className="landing font-sans text-gray-300 antialiased overflow-x-hidden" style={{ backgroundColor: "#090a0f" }}>
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#090a0f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <span className="font-semibold text-white tracking-tight">Griseus</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
              Login
            </Link>
            <Link href="/register" className="text-sm px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center landing-grid-bg overflow-hidden">
        <div className="landing-scanline"></div>

        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[128px] landing-pulse-ring pointer-events-none"></div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center pt-24 pb-20">
          {/* Badge */}
          <div className="landing-fade-in inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-medium text-indigo-300 tracking-wide uppercase">Early Access</span>
          </div>

          {/* Heading */}
          <h1 className="landing-fade-in landing-fade-in-delay-1 text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight mb-6">
            Data Center<br />
            <span className="text-indigo-400 landing-glow-text">Workforce Marketplace</span>
          </h1>

          {/* Tagline */}
          <p className="landing-fade-in landing-fade-in-delay-2 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Connecting skilled workers with AI infrastructure projects.
            From rack &amp; stack to commissioning &mdash; find the right talent, fast.
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
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm
                           focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25
                           transition-all placeholder:text-gray-600"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium
                           transition-all hover:shadow-lg hover:shadow-indigo-600/20 active:scale-[0.98]
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
            <p className="mt-4 text-xs text-gray-600">No spam. We'll notify you when we launch.</p>
          </div>

          {/* Stats */}
          <div className="landing-fade-in landing-fade-in-delay-4 flex items-center justify-center gap-8 sm:gap-12 mt-16 pt-8 border-t border-white/5">
            <div className="text-center">
              <div className="text-2xl font-bold text-white font-mono">500+</div>
              <div className="text-xs text-gray-500 mt-1">Workers Ready</div>
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white font-mono">12</div>
              <div className="text-xs text-gray-500 mt-1">Markets</div>
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white font-mono">48h</div>
              <div className="text-xs text-gray-500 mt-1">Avg. Placement</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative py-24 sm:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-medium text-indigo-400 mb-3 tracking-wide uppercase">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Built for the data center industry
            </h2>
            <p className="text-gray-400 leading-relaxed">
              Purpose-built tools that understand the unique demands of data center construction,
              commissioning, and operations.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                ),
                title: "Verified Talent Pool",
                desc: "Pre-screened technicians with verified certifications for electrical, mechanical, fiber, and structured cabling work. Background-checked and compliance-ready.",
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                ),
                title: "Rapid Deployment",
                desc: "Match and mobilize crews in under 48 hours. Our algorithm considers location, skill level, availability, and project clearance requirements.",
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                ),
                title: "Compliance Built-In",
                desc: "Automated tracking of OSHA, NFPA 70E, and site-specific safety certifications. Real-time compliance dashboards for every active project.",
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                ),
                title: "Project Intelligence",
                desc: "Real-time analytics on workforce utilization, project timelines, and cost tracking. Make data-driven staffing decisions across your portfolio.",
              },
            ].map((feature) => (
              <div key={feature.title} className="landing-card-hover group p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:border-indigo-500/40 transition-colors">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    {feature.icon}
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-10 sm:p-14 text-center overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-indigo-600/10 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="relative z-10">
              <p className="text-sm font-medium text-indigo-400 mb-3 font-mono">// launching soon</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                The future of data center staffing
              </h2>
              <p className="text-gray-400 max-w-xl mx-auto mb-8 leading-relaxed">
                Whether you're a hyperscaler building at scale or a technician looking for your next project,
                Griseus connects you to what matters.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/register" className="inline-flex px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-indigo-600/20 active:scale-[0.98]">
                  Get Started
                </Link>
                <Link href="/login" className="inline-flex px-8 py-3 rounded-xl border border-indigo-500/30 hover:border-indigo-500/60 text-indigo-400 hover:text-white text-sm font-medium transition-all">
                  Login to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <span className="text-sm text-gray-500">&copy; 2026 Griseus. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-600">
            <a href="#" className="hover:text-gray-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-gray-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-gray-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
