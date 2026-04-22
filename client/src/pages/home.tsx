import { useLocation } from "wouter";
import TopNav from "@/components/top-nav";
import { useSKU } from "@/lib/sku-context";

const C = {
  bg: "#050507",
  surface: "rgba(10,10,15,0.6)",
  surfaceHover: "rgba(16,16,22,0.85)",
  border: "rgba(255,255,255,0.08)",
  borderHover: "rgba(129,140,248,0.35)",
  accent: "#818cf8",
  accentDim: "rgba(129,140,248,0.08)",
  white: "#f0f0f5",
  mid: "#8888a0",
  dim: "#4a4a60",
};

const mono = "'Outfit', sans-serif";

type Tile = {
  label: string;
  icon: string;
  path: string;
  tagline: string;
  accent: string;
};

export default function Home() {
  const [, navigate] = useLocation();
  const { selectedSku } = useSKU();

  const tiles: Tile[] = [
    {
      label: "Stok Durumu",
      icon: "\u{1F3ED}",
      path: "/stok/durum",
      tagline: "Tüm bileşenlerin canlı stok ve durum paneli",
      accent: "#60a5fa",
    },
    {
      label: "Ürün İstihbaratı",
      icon: "\u{1F4CA}",
      path: `/stok/urun/${selectedSku}`,
      tagline: "SKU bazlı derin analiz ve üretim zekası",
      accent: "#34d399",
    },
    {
      label: "Sihir",
      icon: "⬡",
      path: "/sihir",
      tagline: "Palantir-seviye ontology deneyimi",
      accent: "#f472b6",
    },
    {
      label: "Veri Yükle",
      icon: "\u{1F4C2}",
      path: "/veri-yukle",
      tagline: "ERP/Excel import ve cihaz onboarding",
      accent: "#fbbf24",
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: mono }}>
      <TopNav />

      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "64px 32px 96px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontSize: 11, letterSpacing: 2.4, color: C.accent,
            fontWeight: 500, marginBottom: 10,
          }}>
            GRISEUS · HOME
          </div>
          <h1 style={{
            fontSize: 32, fontWeight: 300, margin: 0, color: C.white, letterSpacing: -0.4,
          }}>
            Nereden başlamak istersin?
          </h1>
          <div style={{ fontSize: 13, color: C.mid, marginTop: 10 }}>
            Dört temel çalışma alanı — tek tıkla aç.
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 20,
        }}>
          {tiles.map(t => (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              style={{
                textAlign: "left",
                padding: "28px 28px",
                borderRadius: 16,
                background: C.surface,
                border: `1px solid ${C.border}`,
                color: C.white,
                cursor: "pointer",
                fontFamily: mono,
                transition: "all 0.18s ease",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                minHeight: 180,
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C.surfaceHover;
                e.currentTarget.style.border = `1px solid ${t.accent}55`;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C.surface;
                e.currentTarget.style.border = `1px solid ${C.border}`;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, ${t.accent}, transparent)`,
                opacity: 0.6,
              }} />

              <div style={{
                width: 52, height: 52, borderRadius: 12,
                background: `${t.accent}18`,
                border: `1px solid ${t.accent}35`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26,
              }}>
                {t.icon}
              </div>

              <div>
                <div style={{
                  fontSize: 20, fontWeight: 400, color: C.white, marginBottom: 6, letterSpacing: -0.2,
                }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 12, color: C.mid, lineHeight: 1.55 }}>
                  {t.tagline}
                </div>
              </div>

              <div style={{
                marginTop: "auto",
                fontSize: 10, letterSpacing: 1.4, color: t.accent, fontWeight: 500,
              }}>
                AÇ →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
