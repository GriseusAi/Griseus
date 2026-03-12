import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, HardHat, ArrowLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Trade } from "@shared/schema";

type Role = "company" | "worker";

const industries = [
  "Data Center Construction",
  "Electrical Contracting",
  "Mechanical Services",
  "Telecommunications",
  "General Contracting",
  "Engineering Services",
  "Facilities Management",
  "Other",
];

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Company fields
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [position, setPosition] = useState("");

  // Worker fields
  const [trade, setTrade] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [workerLocation, setWorkerLocation] = useState("");

  // Shared fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { data: trades } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
    enabled: role === "worker",
  });

  function selectRole(r: Role) {
    setRole(r);
    setStep(2);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body =
        role === "company"
          ? { role, email, password, name, companyName, industry, position }
          : { role, email, password, name, trade, yearsExperience: parseInt(yearsExperience, 10), location: workerLocation };

      const res = await apiRequest("POST", "/api/register", body);
      const user = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setLocation("/engine");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: "#0F172A" }}>
      {step === 1 ? (
        <div className="relative z-10 w-full max-w-2xl">
          <button
            onClick={() => setLocation("/login")}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </button>

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-white mb-2">Create Your Account</h1>
            <p className="text-slate-400">Select how you'll use the platform</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            <button
              onClick={() => selectRole("company")}
              className="flex-1 group rounded-2xl border border-white/10 p-8 text-left transition-all duration-200 hover:border-blue-500/30 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] hover:scale-[1.02]"
              style={{ background: "rgba(26,26,46,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
            >
              <div className="w-14 h-14 rounded-xl bg-blue-500/15 flex items-center justify-center mb-5 group-hover:bg-blue-500/25 transition-colors">
                <Building2 className="w-7 h-7 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Company</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Manage projects, assign workers, track progress
              </p>
              <div className="mt-4 flex items-center gap-1 text-blue-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                Continue <ChevronRight className="h-4 w-4" />
              </div>
            </button>

            <button
              onClick={() => selectRole("worker")}
              className="flex-1 group rounded-2xl border border-white/10 p-8 text-left transition-all duration-200 hover:border-emerald-500/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:scale-[1.02]"
              style={{ background: "rgba(26,26,46,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
            >
              <div className="w-14 h-14 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-5 group-hover:bg-emerald-500/25 transition-colors">
                <HardHat className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Blue-Collar Worker</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Find jobs, track certifications, manage your career
              </p>
              <div className="mt-4 flex items-center gap-1 text-emerald-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                Continue <ChevronRight className="h-4 w-4" />
              </div>
            </button>
          </div>
        </div>
      ) : (
        <Card className="w-full max-w-md shadow-xl border-white/10 relative z-10" style={{ background: "rgba(26,26,46,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderColor: "rgba(255,255,255,0.08)" }}>
          <CardHeader>
            <button
              onClick={() => { setStep(1); setError(""); }}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-2 w-fit"
            >
              <ArrowLeft className="h-4 w-4" />
              Change role
            </button>
            <CardTitle className="text-white text-xl">
              {role === "company" ? "Company Registration" : "Worker Registration"}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {role === "company"
                ? "Set up your company profile"
                : "Set up your worker profile"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {role === "company" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="text-white">Company Name</Label>
                    <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Acme Data Centers" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry" className="text-white">Industry</Label>
                    <Select value={industry} onValueChange={setIndustry} required>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-blue-500/50 focus:ring-blue-500/20">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1A1A2E] border-white/10 text-white">
                        {industries.map((ind) => (
                          <SelectItem key={ind} value={ind} className="text-white focus:bg-white/10 focus:text-white">{ind}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="position" className="text-white">Your Position</Label>
                    <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} required placeholder="Project Manager" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-white">Contact Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="John Smith" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-white">Full Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Marcus Johnson" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trade" className="text-white">Trade</Label>
                    <Select value={trade} onValueChange={setTrade} required>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-blue-500/50 focus:ring-blue-500/20">
                        <SelectValue placeholder="Select your trade" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1A1A2E] border-white/10 text-white">
                        {trades?.map((t) => (
                          <SelectItem key={t.id} value={t.name} className="text-white focus:bg-white/10 focus:text-white">{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="yearsExperience" className="text-white">Years of Experience</Label>
                    <Input id="yearsExperience" type="number" min="0" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} required placeholder="5" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-white">Location</Label>
                    <Input id="location" value={workerLocation} onChange={(e) => setWorkerLocation(e.target.value)} required placeholder="Dallas, TX" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" placeholder="At least 6 characters" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20" />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full text-white font-semibold" style={{ background: "linear-gradient(135deg, #3B82F6, #10B981)" }}>
                {loading ? "Creating account..." : "Create Account"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Already have an account? Sign in
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
