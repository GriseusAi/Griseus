import { useLocation } from "wouter";

const C = {
  bg: "rgba(5,5,5,0.4)",
  border: "rgba(255,255,255,0.08)",
  accent: "#818cf8",
  accentDim: "rgba(99,102,241,0.08)",
  borderActive: "rgba(255,255,255,0.12)",
  white: "#f0f0f5",
  mid: "#8888a0",
  dim: "#4a4a60",
  ok: "#34d399",
};
const mono = "'Space Mono', monospace";

const NAV_ITEMS = [
  { path: "/", label: "Stok Durumu", icon: "🏭" },
  { path: "/stok/hareket", label: "Hızlı Giriş", icon: "⚡" },
  { path: "/stok/urun/ELT.7-11", label: "Ürün İstihbaratı", icon: "📊" },
  { path: "/engine", label: "CEO Agent", icon: "🤖" },
];

export default function TopNav({ connected }: { connected?: boolean }) {
  const [location, navigate] = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "/stok/durum";
    if (path.startsWith("/stok/urun")) return location.startsWith("/stok/urun");
    return location === path;
  };

  return (
    <nav style={{
      padding: "0 16px", height: 48, display: "flex", alignItems: "center",
      justifyContent: "space-between", borderBottom: `1px solid ${C.border}`,
      background: C.bg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {NAV_ITEMS.map(n => {
          const active = isActive(n.path);
          return (
            <button
              key={n.path}
              onClick={() => navigate(n.path)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: active ? C.accentDim : "transparent",
                border: `1px solid ${active ? C.borderActive : "transparent"}`,
                color: active ? C.accent : C.dim,
                cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          );
        })}
      </div>
      {connected !== undefined && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
          borderRadius: 16, background: connected ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${connected ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.2)"}`,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: connected ? C.ok : "#ef4444",
          }} />
          <span style={{ fontSize: 9, fontFamily: mono, color: connected ? C.ok : "#ef4444", fontWeight: 600 }}>
            {connected ? "CANLI" : "KOPUK"}
          </span>
        </div>
      )}
      <style>{`
        @media (max-width: 640px) {
          .nav-label { display: none; }
        }
      `}</style>
    </nav>
  );
}
