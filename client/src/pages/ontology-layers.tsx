import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import { Building2, Layers, MapPin, Route, Search, Warehouse } from "lucide-react";

type Province = {
  plate: number;
  city: string;
  lat: number;
  lon: number;
  region: string;
  dealers: number;
};

type DealerMarker = Province & {
  id: string;
  name: string;
  offsetX: number;
  offsetY: number;
};

const TURKEY_PROVINCES: Province[] = [
  { plate: 1, city: "Adana", lat: 37.0, lon: 35.3213, region: "Akdeniz", dealers: 1 },
  { plate: 2, city: "Adiyaman", lat: 37.7648, lon: 38.2786, region: "Guneydogu", dealers: 1 },
  { plate: 3, city: "Afyonkarahisar", lat: 38.7569, lon: 30.5387, region: "Ege", dealers: 1 },
  { plate: 4, city: "Agri", lat: 39.7191, lon: 43.0503, region: "Dogu", dealers: 1 },
  { plate: 5, city: "Amasya", lat: 40.6533, lon: 35.8331, region: "Karadeniz", dealers: 1 },
  { plate: 6, city: "Ankara", lat: 39.9334, lon: 32.8597, region: "Ic Anadolu", dealers: 2 },
  { plate: 7, city: "Antalya", lat: 36.8969, lon: 30.7133, region: "Akdeniz", dealers: 1 },
  { plate: 8, city: "Artvin", lat: 41.1828, lon: 41.8183, region: "Karadeniz", dealers: 1 },
  { plate: 9, city: "Aydin", lat: 37.856, lon: 27.8416, region: "Ege", dealers: 1 },
  { plate: 10, city: "Balikesir", lat: 39.6533, lon: 27.8903, region: "Marmara", dealers: 1 },
  { plate: 11, city: "Bilecik", lat: 40.1426, lon: 29.9793, region: "Marmara", dealers: 1 },
  { plate: 12, city: "Bingol", lat: 38.8854, lon: 40.4983, region: "Dogu", dealers: 1 },
  { plate: 13, city: "Bitlis", lat: 38.3938, lon: 42.1232, region: "Dogu", dealers: 1 },
  { plate: 14, city: "Bolu", lat: 40.7395, lon: 31.6116, region: "Karadeniz", dealers: 1 },
  { plate: 15, city: "Burdur", lat: 37.7203, lon: 30.2908, region: "Akdeniz", dealers: 1 },
  { plate: 16, city: "Bursa", lat: 40.1885, lon: 29.061, region: "Marmara", dealers: 1 },
  { plate: 17, city: "Canakkale", lat: 40.1553, lon: 26.4142, region: "Marmara", dealers: 1 },
  { plate: 18, city: "Cankiri", lat: 40.6013, lon: 33.6134, region: "Ic Anadolu", dealers: 1 },
  { plate: 19, city: "Corum", lat: 40.5506, lon: 34.9556, region: "Karadeniz", dealers: 1 },
  { plate: 20, city: "Denizli", lat: 37.7765, lon: 29.0864, region: "Ege", dealers: 1 },
  { plate: 21, city: "Diyarbakir", lat: 37.9144, lon: 40.2306, region: "Guneydogu", dealers: 1 },
  { plate: 22, city: "Edirne", lat: 41.6771, lon: 26.5557, region: "Marmara", dealers: 1 },
  { plate: 23, city: "Elazig", lat: 38.6748, lon: 39.2225, region: "Dogu", dealers: 1 },
  { plate: 24, city: "Erzincan", lat: 39.75, lon: 39.5, region: "Dogu", dealers: 1 },
  { plate: 25, city: "Erzurum", lat: 39.9055, lon: 41.2658, region: "Dogu", dealers: 1 },
  { plate: 26, city: "Eskisehir", lat: 39.7667, lon: 30.5256, region: "Ic Anadolu", dealers: 1 },
  { plate: 27, city: "Gaziantep", lat: 37.0662, lon: 37.3833, region: "Guneydogu", dealers: 1 },
  { plate: 28, city: "Giresun", lat: 40.9128, lon: 38.3895, region: "Karadeniz", dealers: 1 },
  { plate: 29, city: "Gumushane", lat: 40.4603, lon: 39.4814, region: "Karadeniz", dealers: 1 },
  { plate: 30, city: "Hakkari", lat: 37.5744, lon: 43.7408, region: "Dogu", dealers: 1 },
  { plate: 31, city: "Hatay", lat: 36.2023, lon: 36.1613, region: "Akdeniz", dealers: 1 },
  { plate: 32, city: "Isparta", lat: 37.7648, lon: 30.5566, region: "Akdeniz", dealers: 1 },
  { plate: 33, city: "Mersin", lat: 36.8121, lon: 34.6415, region: "Akdeniz", dealers: 1 },
  { plate: 34, city: "Istanbul", lat: 41.0082, lon: 28.9784, region: "Marmara", dealers: 4 },
  { plate: 35, city: "Izmir", lat: 38.4237, lon: 27.1428, region: "Ege", dealers: 1 },
  { plate: 36, city: "Kars", lat: 40.6013, lon: 43.0975, region: "Dogu", dealers: 1 },
  { plate: 37, city: "Kastamonu", lat: 41.3887, lon: 33.7827, region: "Karadeniz", dealers: 1 },
  { plate: 38, city: "Kayseri", lat: 38.7205, lon: 35.4826, region: "Ic Anadolu", dealers: 1 },
  { plate: 39, city: "Kirklareli", lat: 41.7351, lon: 27.2255, region: "Marmara", dealers: 1 },
  { plate: 40, city: "Kirsehir", lat: 39.1425, lon: 34.1709, region: "Ic Anadolu", dealers: 1 },
  { plate: 41, city: "Kocaeli", lat: 40.8533, lon: 29.8815, region: "Marmara", dealers: 1 },
  { plate: 42, city: "Konya", lat: 37.8746, lon: 32.4932, region: "Ic Anadolu", dealers: 1 },
  { plate: 43, city: "Kutahya", lat: 39.4167, lon: 29.9833, region: "Ege", dealers: 1 },
  { plate: 44, city: "Malatya", lat: 38.3552, lon: 38.3095, region: "Dogu", dealers: 1 },
  { plate: 45, city: "Manisa", lat: 38.6191, lon: 27.4289, region: "Ege", dealers: 1 },
  { plate: 46, city: "Kahramanmaras", lat: 37.5753, lon: 36.9228, region: "Akdeniz", dealers: 1 },
  { plate: 47, city: "Mardin", lat: 37.3122, lon: 40.735, region: "Guneydogu", dealers: 1 },
  { plate: 48, city: "Mugla", lat: 37.2153, lon: 28.3636, region: "Ege", dealers: 1 },
  { plate: 49, city: "Mus", lat: 38.9462, lon: 41.7539, region: "Dogu", dealers: 1 },
  { plate: 50, city: "Nevsehir", lat: 38.6244, lon: 34.724, region: "Ic Anadolu", dealers: 1 },
  { plate: 51, city: "Nigde", lat: 37.9667, lon: 34.6833, region: "Ic Anadolu", dealers: 1 },
  { plate: 52, city: "Ordu", lat: 40.9839, lon: 37.8764, region: "Karadeniz", dealers: 1 },
  { plate: 53, city: "Rize", lat: 41.0255, lon: 40.5177, region: "Karadeniz", dealers: 1 },
  { plate: 54, city: "Sakarya", lat: 40.7569, lon: 30.3781, region: "Marmara", dealers: 1 },
  { plate: 55, city: "Samsun", lat: 41.2867, lon: 36.33, region: "Karadeniz", dealers: 1 },
  { plate: 56, city: "Siirt", lat: 37.9333, lon: 41.95, region: "Guneydogu", dealers: 1 },
  { plate: 57, city: "Sinop", lat: 42.0264, lon: 35.1551, region: "Karadeniz", dealers: 1 },
  { plate: 58, city: "Sivas", lat: 39.7477, lon: 37.0179, region: "Ic Anadolu", dealers: 1 },
  { plate: 59, city: "Tekirdag", lat: 40.978, lon: 27.511, region: "Marmara", dealers: 1 },
  { plate: 60, city: "Tokat", lat: 40.3167, lon: 36.55, region: "Karadeniz", dealers: 1 },
  { plate: 61, city: "Trabzon", lat: 41.0015, lon: 39.7178, region: "Karadeniz", dealers: 1 },
  { plate: 62, city: "Tunceli", lat: 39.1081, lon: 39.5483, region: "Dogu", dealers: 1 },
  { plate: 63, city: "Sanliurfa", lat: 37.1674, lon: 38.7955, region: "Guneydogu", dealers: 1 },
  { plate: 64, city: "Usak", lat: 38.6823, lon: 29.4082, region: "Ege", dealers: 1 },
  { plate: 65, city: "Van", lat: 38.4891, lon: 43.4089, region: "Dogu", dealers: 1 },
  { plate: 66, city: "Yozgat", lat: 39.8181, lon: 34.8147, region: "Ic Anadolu", dealers: 1 },
  { plate: 67, city: "Zonguldak", lat: 41.4564, lon: 31.7987, region: "Karadeniz", dealers: 1 },
  { plate: 68, city: "Aksaray", lat: 38.3687, lon: 34.037, region: "Ic Anadolu", dealers: 1 },
  { plate: 69, city: "Bayburt", lat: 40.2552, lon: 40.2249, region: "Karadeniz", dealers: 1 },
  { plate: 70, city: "Karaman", lat: 37.1811, lon: 33.215, region: "Ic Anadolu", dealers: 1 },
  { plate: 71, city: "Kirikkale", lat: 39.8468, lon: 33.5153, region: "Ic Anadolu", dealers: 1 },
  { plate: 72, city: "Batman", lat: 37.8812, lon: 41.1351, region: "Guneydogu", dealers: 1 },
  { plate: 73, city: "Sirnak", lat: 37.5164, lon: 42.4611, region: "Guneydogu", dealers: 1 },
  { plate: 74, city: "Bartin", lat: 41.5811, lon: 32.461, region: "Karadeniz", dealers: 1 },
  { plate: 75, city: "Ardahan", lat: 41.1105, lon: 42.7022, region: "Dogu", dealers: 1 },
  { plate: 76, city: "Igdir", lat: 39.9237, lon: 44.045, region: "Dogu", dealers: 1 },
  { plate: 77, city: "Yalova", lat: 40.65, lon: 29.2667, region: "Marmara", dealers: 1 },
  { plate: 78, city: "Karabuk", lat: 41.2061, lon: 32.6204, region: "Karadeniz", dealers: 1 },
  { plate: 79, city: "Kilis", lat: 36.7184, lon: 37.1212, region: "Guneydogu", dealers: 1 },
  { plate: 80, city: "Osmaniye", lat: 37.0742, lon: 36.2478, region: "Akdeniz", dealers: 1 },
  { plate: 81, city: "Duzce", lat: 40.8438, lon: 31.1565, region: "Karadeniz", dealers: 1 },
];

const HUB = { city: "Adana Operasyon Merkezi", lat: 37.0, lon: 35.3213 };
const W = 1000;
const H = 520;
const LON_MIN = 25.2;
const LON_MAX = 45.1;
const LAT_MIN = 35.7;
const LAT_MAX = 42.3;
const TURKEY_OUTLINE = "M80 151 L126 119 L199 112 L264 134 L319 119 L381 145 L447 138 L514 169 L590 155 L661 179 L743 168 L835 204 L925 224 L960 270 L914 311 L828 303 L752 332 L665 318 L587 348 L499 326 L410 354 L321 325 L235 342 L163 299 L92 279 L50 220 Z";

export default function OntologyLayersPage() {
  const [query, setQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("Hepsi");
  const [selectedDealerId, setSelectedDealerId] = useState("34-1");
  const [showRoutes, setShowRoutes] = useState(true);
  const [mapTheme, setMapTheme] = useState<"light" | "dark">("light");

  const dealers = useMemo(() => expandDealers(TURKEY_PROVINCES), []);
  const filteredDealers = useMemo(() => {
    const needle = normalize(query);
    return dealers.filter(dealer => {
      const regionOk = selectedRegion === "Hepsi" || dealer.region === selectedRegion;
      const textOk = !needle || normalize(`${dealer.city} ${dealer.name} ${dealer.region} ${dealer.plate}`).includes(needle);
      return regionOk && textOk;
    });
  }, [dealers, query, selectedRegion]);
  const selectedDealer = dealers.find(dealer => dealer.id === selectedDealerId) ?? filteredDealers[0] ?? dealers[0];
  const totalDealers = dealers.length;
  const multiDealerCities = TURKEY_PROVINCES.filter(city => city.dealers > 1);

  return (
    <div style={pageStyle(mapTheme)}>
      <TopNav />
      <main style={shellStyle}>
        <section style={mapShellStyle(mapTheme)}>
          <div style={mapToolbarStyle(mapTheme)}>
            <div style={titleBlockStyle}>
              <span style={eyebrowStyle}>CUKUROVA ISI</span>
              <h1 style={titleStyle}>Bayi Operasyon Haritası</h1>
            </div>
            <div style={searchWrapStyle}>
              <Search size={16} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Il, bayi veya bolge ara"
                style={searchInputStyle}
              />
            </div>
            <select value={selectedRegion} onChange={event => setSelectedRegion(event.target.value)} style={selectStyle}>
              {["Hepsi", ...Array.from(new Set(TURKEY_PROVINCES.map(item => item.region)))].map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
            <button type="button" onClick={() => setShowRoutes(prev => !prev)} style={toolButtonStyle(showRoutes)}>
              <Route size={15} />
              Rota
            </button>
            <button type="button" onClick={() => setMapTheme(theme => theme === "light" ? "dark" : "light")} style={toolButtonStyle(mapTheme === "dark")}>
              <Layers size={15} />
              Tema
            </button>
          </div>

          <div style={mapBodyStyle}>
            <aside style={controlPanelStyle(mapTheme)}>
              <div style={statGridStyle}>
                <Metric icon={<Building2 size={15} />} label="Bayi" value={String(totalDealers)} />
                <Metric icon={<MapPin size={15} />} label="Il" value="81" />
                <Metric icon={<Warehouse size={15} />} label="Coklu il" value={String(multiDealerCities.length)} />
              </div>
              <div style={sourceBoxStyle(mapTheme)}>
                <strong>Yetkili satıcı ağı</strong>
                <span>81 il kapsamı; Ankara 2, Istanbul 4 bayi.</span>
              </div>
              <div style={dealerListStyle}>
                {filteredDealers.slice(0, 22).map(dealer => (
                  <button
                    key={dealer.id}
                    type="button"
                    onClick={() => setSelectedDealerId(dealer.id)}
                    style={dealerRowStyle(dealer.id === selectedDealer.id, mapTheme)}
                  >
                    <span>{dealer.plate.toString().padStart(2, "0")}</span>
                    <b>{dealer.name}</b>
                    <small>{dealer.region}</small>
                  </button>
                ))}
              </div>
            </aside>

            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Çukurova Isı bayi haritası" style={mapSvgStyle}>
              <defs>
                <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <rect width={W} height={H} fill={mapTheme === "dark" ? "#202229" : "#dfe8ea"} />
              <path d={TURKEY_OUTLINE} fill={mapTheme === "dark" ? "#30323b" : "#f7f7f3"} stroke={mapTheme === "dark" ? "#535765" : "#bcc7c7"} strokeWidth="2" />
              <g opacity="0.28">
                {[150, 250, 350, 450, 550, 650, 750, 850].map(x => <line key={x} x1={x} y1="46" x2={x} y2="472" stroke={mapTheme === "dark" ? "#5c6070" : "#b7c2c2"} />)}
                {[130, 220, 310, 400].map(y => <line key={y} x1="42" y1={y} x2="958" y2={y} stroke={mapTheme === "dark" ? "#5c6070" : "#b7c2c2"} />)}
              </g>
              {showRoutes && filteredDealers.map(dealer => (
                <path
                  key={`route-${dealer.id}`}
                  d={routePath(HUB, dealer)}
                  fill="none"
                  stroke={dealer.id === selectedDealer.id ? "#ff6f35" : mapTheme === "dark" ? "rgba(118,151,221,0.4)" : "rgba(47,75,135,0.28)"}
                  strokeWidth={dealer.id === selectedDealer.id ? 2.4 : 1}
                  filter={dealer.id === selectedDealer.id ? "url(#routeGlow)" : undefined}
                />
              ))}
              <MapLabel x={project(HUB).x} y={project(HUB).y} active label="HQ" />
              {filteredDealers.map(dealer => {
                const point = project(dealer);
                const active = dealer.id === selectedDealer.id;
                return (
                  <g key={dealer.id} transform={`translate(${point.x + dealer.offsetX} ${point.y + dealer.offsetY})`} onClick={() => setSelectedDealerId(dealer.id)} style={{ cursor: "pointer" }}>
                    <circle r={active ? 13 : 9} fill={active ? "#ff6f35" : "#1e63b6"} stroke="#fff" strokeWidth="2" />
                    <text x="0" y="4" textAnchor="middle" fill="#fff" fontFamily={CT_MONO} fontSize={active ? 8 : 7} fontWeight="900">
                      {dealer.plate.toString().padStart(2, "0")}
                    </text>
                    {active && <MapLabel x={18} y={-18} label={dealer.name} />}
                  </g>
                );
              })}
            </svg>

            <aside style={detailPanelStyle(mapTheme)}>
              <div style={detailHeaderStyle}>
                <span>{selectedDealer.plate.toString().padStart(2, "0")}</span>
                <strong>{selectedDealer.name}</strong>
              </div>
              <div style={detailRowsStyle}>
                <Metric label="Il" value={selectedDealer.city} />
                <Metric label="Bolge" value={selectedDealer.region} />
                <Metric label="Koordinat" value={`${selectedDealer.lat.toFixed(3)}, ${selectedDealer.lon.toFixed(3)}`} />
                <Metric label="Durum" value="Aktif" />
              </div>
              <div style={legendStyle}>
                <span><i style={{ background: "#1e63b6" }} /> Bayi</span>
                <span><i style={{ background: "#ff6f35" }} /> Seçili</span>
                <span><i style={{ background: "#3b6b5b" }} /> Merkez</span>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MapLabel({ x, y, label, active = false }: { x: number; y: number; label: string; active?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-15" y="-14" width={Math.max(34, label.length * 7.2 + 18)} height="24" rx="5" fill={active ? "#3b6b5b" : "#fff"} stroke="rgba(24,29,36,0.24)" />
      <text x="-4" y="2" fill={active ? "#fff" : "#20242b"} fontFamily={CT_FONT} fontSize="11" fontWeight="900">{label}</text>
    </g>
  );
}

function expandDealers(provinces: Province[]): DealerMarker[] {
  const offsets = [[0, 0], [16, -12], [-15, 11], [19, 12]];
  return provinces.flatMap(province => Array.from({ length: province.dealers }, (_, index) => ({
    ...province,
    id: `${province.plate}-${index + 1}`,
    name: `${province.city} Bayi ${province.dealers > 1 ? index + 1 : ""}`.trim(),
    offsetX: offsets[index]?.[0] ?? 0,
    offsetY: offsets[index]?.[1] ?? 0,
  })));
}

function normalize(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function project(point: { lat: number; lon: number }) {
  return {
    x: ((point.lon - LON_MIN) / (LON_MAX - LON_MIN)) * 900 + 50,
    y: (1 - (point.lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * 420 + 50,
  };
}

function routePath(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const a = project(from);
  const b = project(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const curve = Math.max(28, Math.hypot(dx, dy) * 0.18);
  const cx = a.x + dx * 0.5;
  const cy = a.y + dy * 0.5 - curve;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

const pageStyle = (theme: "light" | "dark"): CSSProperties => ({
  minHeight: "100vh",
  background: theme === "dark" ? "#17191f" : "#f4f6f6",
  color: theme === "dark" ? "#f4f2ea" : CT.ink,
  fontFamily: CT_FONT,
});

const shellStyle: CSSProperties = {
  padding: "58px 16px 16px",
};

const mapShellStyle = (theme: "light" | "dark"): CSSProperties => ({
  minHeight: "calc(100vh - 76px)",
  border: `1px solid ${theme === "dark" ? "#3b3f4d" : CT.border}`,
  borderRadius: 10,
  overflow: "hidden",
  background: theme === "dark" ? "#202229" : "#ffffff",
});

const mapToolbarStyle = (theme: "light" | "dark"): CSSProperties => ({
  height: 66,
  display: "grid",
  gridTemplateColumns: "270px minmax(220px, 1fr) 170px auto auto",
  gap: 10,
  alignItems: "center",
  padding: "10px 14px",
  borderBottom: `1px solid ${theme === "dark" ? "#3b3f4d" : CT.border}`,
  background: theme === "dark" ? "#242731" : "#fbfaf6",
});

const titleBlockStyle: CSSProperties = { display: "grid", gap: 2 };
const eyebrowStyle: CSSProperties = { color: "#c96442", fontSize: 11, fontWeight: 900, letterSpacing: 0 };
const titleStyle: CSSProperties = { margin: 0, fontSize: 20, lineHeight: 1.1, fontWeight: 900 };

const searchWrapStyle: CSSProperties = {
  height: 36,
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fff",
  color: CT.inkMuted,
  padding: "0 10px",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  border: 0,
  outline: 0,
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 13,
  background: "transparent",
};

const selectStyle: CSSProperties = {
  height: 36,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fff",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontWeight: 800,
  padding: "0 10px",
};

const toolButtonStyle = (active: boolean): CSSProperties => ({
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${active ? "#c96442" : CT.border}`,
  borderRadius: 7,
  background: active ? "#f7e7df" : "#fff",
  color: active ? "#b34037" : CT.ink,
  fontFamily: CT_FONT,
  fontWeight: 850,
  padding: "0 12px",
  cursor: "pointer",
});

const mapBodyStyle: CSSProperties = {
  position: "relative",
  minHeight: "calc(100vh - 144px)",
};

const mapSvgStyle: CSSProperties = {
  width: "100%",
  height: "calc(100vh - 144px)",
  display: "block",
};

const controlPanelStyle = (theme: "light" | "dark"): CSSProperties => ({
  position: "absolute",
  top: 16,
  left: 16,
  zIndex: 3,
  width: 318,
  maxHeight: "calc(100vh - 182px)",
  display: "grid",
  gap: 10,
  padding: 12,
  border: `1px solid ${theme === "dark" ? "#444858" : CT.border}`,
  borderRadius: 8,
  background: theme === "dark" ? "rgba(31,34,42,0.94)" : "rgba(255,255,255,0.94)",
  boxShadow: "0 16px 40px rgba(28,31,36,0.16)",
});

const statGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 7,
};

const metricStyle: CSSProperties = {
  minHeight: 56,
  display: "grid",
  gap: 5,
  alignContent: "center",
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "rgba(255,255,255,0.78)",
  padding: "8px 9px",
};

const sourceBoxStyle = (theme: "light" | "dark"): CSSProperties => ({
  display: "grid",
  gap: 4,
  border: `1px solid ${theme === "dark" ? "#444858" : CT.border}`,
  borderRadius: 7,
  padding: 10,
  background: theme === "dark" ? "#242731" : "#fbfaf6",
  fontSize: 12,
});

const dealerListStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  overflowY: "auto",
  paddingRight: 2,
};

const dealerRowStyle = (active: boolean, theme: "light" | "dark"): CSSProperties => ({
  minHeight: 34,
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) 82px",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${active ? "#c96442" : theme === "dark" ? "#414552" : CT.border}`,
  borderRadius: 6,
  background: active ? "#f7e7df" : theme === "dark" ? "#20232c" : "#fff",
  color: active ? "#b34037" : "inherit",
  fontFamily: CT_FONT,
  fontSize: 11,
  textAlign: "left",
  padding: "0 8px",
  cursor: "pointer",
});

const detailPanelStyle = (theme: "light" | "dark"): CSSProperties => ({
  position: "absolute",
  right: 16,
  bottom: 16,
  zIndex: 3,
  width: 286,
  display: "grid",
  gap: 12,
  border: `1px solid ${theme === "dark" ? "#444858" : CT.border}`,
  borderRadius: 8,
  background: theme === "dark" ? "rgba(31,34,42,0.94)" : "rgba(255,255,255,0.95)",
  boxShadow: "0 16px 40px rgba(28,31,36,0.16)",
  padding: 12,
});

const detailHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr)",
  alignItems: "center",
  gap: 9,
  fontSize: 14,
};

const detailRowsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const legendStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  color: CT.inkMuted,
  fontSize: 11,
};
