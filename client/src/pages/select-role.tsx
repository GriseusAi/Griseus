import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Building2, HardHat } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export default function SelectRolePage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === "company") setLocation("/dashboard");
    if (user?.role === "worker") setLocation("/mobile");
  }, [user?.role, setLocation]);

  async function selectRole(role: "company" | "worker") {
    setLoading(role);
    try {
      await apiRequest("PATCH", "/api/user/role", { role });
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setLocation(role === "company" ? "/dashboard" : "/mobile");
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: "#090a0f" }}>
      {/* Ambient glow */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="text-center mb-10 relative z-10">
        <h1 className="text-3xl font-bold text-white mb-2">Choose Your Role</h1>
        <p className="text-gray-400">Select how you'll use the platform</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 relative z-10 w-full max-w-2xl">
        {/* Company Card */}
        <button
          onClick={() => selectRole("company")}
          disabled={loading !== null}
          className="flex-1 group rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8 text-left transition-all duration-200 hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] hover:scale-[1.02] disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="w-14 h-14 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-5 group-hover:bg-indigo-600/30 transition-colors">
            <Building2 className="w-7 h-7 text-indigo-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Company</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Manage projects, assign workers, track progress
          </p>
          {loading === "company" && (
            <div className="mt-4 text-indigo-400 text-sm">Setting up...</div>
          )}
        </button>

        {/* Worker Card */}
        <button
          onClick={() => selectRole("worker")}
          disabled={loading !== null}
          className="flex-1 group rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8 text-left transition-all duration-200 hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] hover:scale-[1.02] disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="w-14 h-14 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-5 group-hover:bg-indigo-600/30 transition-colors">
            <HardHat className="w-7 h-7 text-indigo-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Blue-Collar Worker</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Find jobs, track certifications, manage your career
          </p>
          {loading === "worker" && (
            <div className="mt-4 text-indigo-400 text-sm">Setting up...</div>
          )}
        </button>
      </div>
    </div>
  );
}
