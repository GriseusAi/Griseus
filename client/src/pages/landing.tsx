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
