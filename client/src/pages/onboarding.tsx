import { useLocation } from "wouter";
import { Building2, HardHat } from "lucide-react";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: "#EEE7DD" }}
    >
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-12">
        {/* Logo + tagline */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-[#2D2D2D] mb-2">
            Griseus
          </h1>
          <p className="text-[#5A5A5A] text-base">
            Where white collar meets blue collar
          </p>
        </div>

        {/* Role cards */}
        <div className="w-full max-w-lg flex flex-col sm:flex-row gap-4">
          {/* Company card — white with brown accent */}
          <button
            onClick={() => setLocation("/onboarding/company")}
            className="flex-1 group rounded-2xl border border-[#CEB298]/30 bg-white p-8 text-left transition-all duration-200 hover:shadow-md hover:border-[#9F6C52]/40 hover:scale-[1.02]"
          >
            <div className="w-14 h-14 rounded-xl bg-[#9F6C52]/10 flex items-center justify-center mb-5 group-hover:bg-[#9F6C52]/20 transition-colors">
              <Building2 className="w-7 h-7 text-[#9F6C52]" />
            </div>
            <h2 className="text-xl font-semibold text-[#2D2D2D] mb-1">
              I'm Hiring
            </h2>
            <p className="text-[#5A5A5A] text-sm leading-relaxed">
              Find skilled workers for your data center projects
            </p>
          </button>

          {/* Worker card — muted blue */}
          <button
            onClick={() => setLocation("/onboarding/worker")}
            className="flex-1 group rounded-2xl bg-[#92ABBB] p-8 text-left transition-all duration-200 hover:bg-[#839dae] hover:shadow-md hover:scale-[1.02]"
          >
            <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center mb-5 group-hover:bg-white/30 transition-colors">
              <HardHat className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">
              I'm Looking for Work
            </h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Showcase your skills and find the right jobs
            </p>
          </button>
        </div>

        {/* Sign-in link */}
        <div className="mt-8">
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
      </div>
    </div>
  );
}
