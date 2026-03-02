import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

type Step = "email" | "reset" | "success";

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setStep("reset");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }
    setLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", {
        email,
        code,
        newPassword,
      });
      setStep("success");
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
          <CardTitle className="text-[#2D2D2D] text-xl">
            {step === "success" ? "Password Reset" : "Forgot Password"}
          </CardTitle>
          <CardDescription className="text-[#5A5A5A]">
            {step === "email" && "Enter your email to receive a reset code"}
            {step === "reset" && "Enter the 6-digit code and your new password"}
            {step === "success" && "Your password has been updated"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" && (
            <form onSubmit={handleSendCode} className="space-y-4">
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

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Sending..." : "Send Reset Code"}
              </Button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-[#2D2D2D]">Reset Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  placeholder="6-digit code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-[#2D2D2D]">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[#2D2D2D]">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          )}

          {step === "success" && (
            <div className="space-y-4">
              <p className="text-sm text-center text-[#5A5A5A]">
                Your password has been successfully reset. You can now sign in with your new password.
              </p>
              <Button onClick={() => setLocation("/login")} className="w-full">
                Back to Sign In
              </Button>
            </div>
          )}

          {step !== "success" && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-sm text-[#92ABBB] hover:text-[#7a97a8] transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
