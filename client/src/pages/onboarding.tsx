import { useLocation } from "wouter";
import { Building2, HardHat } from "lucide-react";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: "#F5F5F5" }}
    >
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-12">
        {/* Logo + tagline */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
            Griseus
          </h1>
          <p className="text-gray-500 text-base">
            Where white collar meets blue collar
          </p>
        </div>

        {/* Role cards */}
        <div className="w-full max-w-lg flex flex-col sm:flex-row gap-4">
          {/* Company card — white */}
          <button
            onClick={() => setLocation("/onboarding/company")}
            className="flex-1 group rounded-2xl border border-gray-200 bg-white p-8 text-left transition-all duration-200 hover:shadow-md hover:border-gray-300 hover:scale-[1.02]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-5 group-hover:bg-gray-200 transition-colors">
              <Building2 className="w-7 h-7 text-gray-700" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              I'm Hiring
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Find skilled workers for your data center projects
            </p>
          </button>

          {/* Worker card — blue */}
          <button
            onClick={() => setLocation("/onboarding/worker")}
            className="flex-1 group rounded-2xl bg-blue-500 p-8 text-left transition-all duration-200 hover:bg-blue-600 hover:shadow-md hover:scale-[1.02]"
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
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Already have an account?{" "}
            <span className="text-blue-500 font-medium hover:text-blue-600">
              Sign in
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
