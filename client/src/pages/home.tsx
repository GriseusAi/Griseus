import { useLocation } from "wouter";
import TopNav from "@/components/top-nav";
import { useSKU } from "@/lib/sku-context";
import { CT, CT_FONT } from "@/lib/claude-theme";

type Tile = {
  label: string;
  icon: string;
  path: string;
  tagline: string;
};

export default function Home() {
  const [, navigate] = useLocation();
  const { selectedSku } = useSKU();

  const tiles: Tile[] = [
    { label: "Stok Durumu", icon: "\u{1F3ED}", path: "/stok/durum", tagline: "Tüm bileşenlerin canlı stok ve durum paneli" },
    { label: "Ürün İstihbaratı", icon: "\u{1F4CA}", path: `/stok/urun/${selectedSku}`, tagline: "SKU bazlı derin analiz ve üretim zekası" },
    { label: "Sihir", icon: "⬡", path: "/sihir", tagline: "Palantir-seviye ontology deneyimi" },
    { label: "Veri Yükle", icon: "\u{1F4C2}", path: "/veri-yukle", tagline: "ERP/Excel import ve cihaz onboarding" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: CT.bg, color: CT.ink, fontFamily: CT_FONT }}>
      <TopNav />

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "72px 32px 96px" }}>
        <div style={{ marginBottom: 56 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.6, color: CT.accent, fontWeight: 500, marginBottom: 14, textTransform: "uppercase" }}>
            Griseus
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 500, margin: 0, color: CT.ink, letterSpacing: -0.6, lineHeight: 1.15 }}>
            Nereden başlamak istersin?
          </h1>
          <div style={{ fontSize: 15, color: CT.inkSub, marginTop: 12, lineHeight: 1.6 }}>
            Dört temel çalışma alanı — tek tıkla aç.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {tiles.map(t => (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              style={{
                textAlign: "left",
                padding: "24px 24px 22px",
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
                minHeight: 160,
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
                fontSize: 20,
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
                Aç →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
