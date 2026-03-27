import { useLocation } from "wouter";

export default function AdminPage() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col min-h-screen w-full" style={{ background: "#f5f5f7" }}>
      {/* Header bar */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center cursor-pointer"
            onClick={() => navigate("/")}
          >
            <span className="text-white text-xs font-bold">G</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">Griseus Admin</h1>
            <p className="text-[10px] text-gray-400">Çukurova Isı Sistemleri</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-gray-400 uppercase tracking-widest">Ontology Engine v1</span>
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </header>

      {/* Main — full image */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <img
          src="/platform-architecture.png"
          alt="Griseus Platform Architecture — Ontology-driven intelligence for manufacturing"
          style={{
            maxWidth: "100%",
            maxHeight: "calc(100vh - 120px)",
            objectFit: "contain",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
