import { useLocation } from "wouter";
import type { ReactNode } from "react";
import TopNav from "@/components/top-nav";
import { useSKU } from "@/lib/sku-context";
import { CT, CT_FONT } from "@/lib/claude-theme";
import { BarChart3, Factory, GitBranch, UploadCloud } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

type Tile = {
  label: string;
  icon: ReactNode;
  path: string;
  tagline: string;
};

export default function Home() {
  const [, navigate] = useLocation();
  const { selectedSku } = useSKU();
  const isMobile = useIsMobile();

  const tiles: Tile[] = [
    { label: "Stok Durumu", icon: <Factory size={20} />, path: "/stok/durum", tagline: "Tüm bileşenlerin canlı stok ve durum paneli" },
    { label: "Ürün İstihbaratı", icon: <BarChart3 size={20} />, path: `/stok/urun/${selectedSku}`, tagline: "SKU bazlı derin analiz ve üretim zekası" },
    { label: "Veri Yükle", icon: <UploadCloud size={20} />, path: "/veri-yukle", tagline: "ERP/Excel import ve cihaz onboarding" },
    { label: "Pipeline Builder", icon: <GitBranch size={20} />, path: "/pipeline-builder", tagline: "Input, transform, preview ve deploy akışı" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: CT.bg, color: CT.ink, fontFamily: CT_FONT }}>
      <TopNav />

      <div style={{ maxWidth: 980, margin: "0 auto", padding: isMobile ? "56px 20px 72px" : "72px 32px 96px" }}>
        <div style={{ marginBottom: isMobile ? 36 : 56 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.6, color: CT.accent, fontWeight: 500, marginBottom: 14, textTransform: "uppercase" }}>
            Griseus
          </div>
          <h1 style={{ fontSize: isMobile ? 34 : 36, fontWeight: 500, margin: 0, color: CT.ink, letterSpacing: 0, lineHeight: 1.15 }}>
            Nereden başlamak istersin?
          </h1>
          <div style={{ fontSize: 15, color: CT.inkSub, marginTop: 12, lineHeight: 1.6 }}>
            Temel çalışma alanları — tek tıkla aç.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: isMobile ? 12 : 16 }}>
          {tiles.map(t => (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              style={{
                textAlign: "left",
                padding: isMobile ? "18px 20px" : "24px 24px 22px",
                borderRadius: 14,
                background: CT.surface,
                border: `1px solid ${CT.border}`,
                color: CT.ink,
                cursor: "pointer",
                fontFamily: CT_FONT,
                transition: "border-color 0.15s ease, background 0.15s ease, transform 0.15s ease",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                minHeight: isMobile ? 132 : 160,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CT.surfaceHover;
                e.currentTarget.style.borderColor = CT.borderStrong;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CT.surface;
                e.currentTarget.style.borderColor = CT.border;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: CT.surfaceMuted,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: CT.accent,
              }}>
                {t.icon}
              </div>

              <div>
                <div style={{ fontSize: 17, fontWeight: 500, color: CT.ink, marginBottom: 4, letterSpacing: -0.2 }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 13, color: CT.inkSub, lineHeight: 1.5 }}>
                  {t.tagline}
                </div>
              </div>

              <div style={{ marginTop: "auto", fontSize: 12, color: CT.accent, fontWeight: 500 }}>
                Aç
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
