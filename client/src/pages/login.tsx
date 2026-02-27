import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiRequest("POST", "/api/login", { email, password });
      const user = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setLocation(user.role === "company" ? "/dashboard" : "/mobile");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#EEE7DD" }}>
      <Card className="w-full max-w-sm shadow-md border-[#CEB298]/30">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-xl font-bold tracking-tight text-[#2D2D2D]">Griseus</span>
          </div>
          <CardTitle className="text-[#2D2D2D] text-xl">Welcome Back</CardTitle>
          <CardDescription className="text-[#5A5A5A]">
            Sign in to your Griseus dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#2D2D2D]">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="Enter your email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#2D2D2D]">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? "Please wait..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="text-sm text-[#92ABBB] hover:text-[#7a97a8] transition-colors"
            >
              Don't have an account? Sign up
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
