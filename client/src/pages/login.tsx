import { useState } from "react";
import { useLocation } from "wouter";
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
      await apiRequest("POST", "/api/login", { email, password });
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setLocation("/engine");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div style={{
      background: "#07070b", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter','Outfit',sans-serif", position: "relative", overflow: "hidden",
    }}>

      {/* ── Animated mesh background ── */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.35 }}>
        <defs>
          <pattern id="loginGrid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          </pattern>
          {/* Animated radial pulse */}
          <radialGradient id="loginPulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)">
              <animate attributeName="stopColor" values="rgba(255,255,255,0.08);rgba(255,255,255,0.02);rgba(255,255,255,0.08)" dur="6s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#loginGrid)" />
        <rect width="100%" height="100%" fill="url(#loginPulse)" />
        {/* Floating horizontal scan lines */}
        <line x1="0" y1="0" x2="100%" y2="0" stroke="rgba(255,255,255,0.03)" strokeWidth="1">
          <animate attributeName="y1" values="0;100%" dur="12s" repeatCount="indefinite" />
          <animate attributeName="y2" values="0;100%" dur="12s" repeatCount="indefinite" />
        </line>
        <line x1="0" y1="0" x2="100%" y2="0" stroke="rgba(255,255,255,0.02)" strokeWidth="1">
          <animate attributeName="y1" values="100%;0" dur="8s" repeatCount="indefinite" />
          <animate attributeName="y2" values="100%;0" dur="8s" repeatCount="indefinite" />
        </line>
        {/* Corner accent dots */}
        {[0, 1, 2, 3, 4].map(i => (
          <circle key={i} cx={`${15 + i * 18}%`} cy={`${20 + (i % 3) * 25}%`} r="1" fill="rgba(255,255,255,0.08)">
            <animate attributeName="opacity" values="0.08;0.2;0.08" dur={`${3 + i * 0.7}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>

      {/* ── Glass card ── */}
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 400, margin: "0 20px",
        background: "rgba(255,255,255,0.03)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "48px 36px 40px",
        boxShadow: "0 0 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.9)", letterSpacing: "0.1em", marginBottom: 8 }}>
            GRISEUS
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>
            Sign in to your account
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              style={{
                width: "100%", padding: "12px 14px", fontSize: 14, color: "#fff",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, outline: "none", fontFamily: "inherit",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.04)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                width: "100%", padding: "12px 14px", fontSize: 14, color: "#fff",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, outline: "none", fontFamily: "inherit",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.04)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {/* Forgot password */}
          <div style={{ textAlign: "right", marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => setLocation("/forgot-password")}
              style={{
                background: "none", border: "none", padding: 0, fontSize: 12, color: "rgba(255,255,255,0.35)",
                cursor: "pointer", fontFamily: "inherit", transition: "color 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
            >
              Forgot your password?
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "10px 14px", marginBottom: 20, borderRadius: 8, fontSize: 13,
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171",
            }}>
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "13px 0", fontSize: 14, fontWeight: 600, fontFamily: "inherit",
              background: "rgba(255,255,255,0.92)", color: "#07070b", border: "1px solid transparent",
              borderRadius: 8, cursor: loading ? "default" : "pointer", letterSpacing: "0.02em",
              transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (loading) return;
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.92)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
              e.currentTarget.style.boxShadow = "0 0 20px rgba(255,255,255,0.06)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.92)";
              e.currentTarget.style.color = "#07070b";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 24px" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "0.06em" }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        </div>

        {/* Sign up link */}
        <div style={{ textAlign: "center" }}>
          <button
            type="button"
            onClick={() => setLocation("/register")}
            style={{
              background: "none", border: "none", padding: 0, fontSize: 13, color: "rgba(255,255,255,0.35)",
              cursor: "pointer", fontFamily: "inherit", transition: "color 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          >
            Don't have an account? <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Sign up</span>
          </button>
        </div>
      </div>

      {/* ── Keyframes for placeholder styling ── */}
      <style>{`
        input::placeholder { color: rgba(255,255,255,0.15) !important; }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 40px #07070b inset !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}
