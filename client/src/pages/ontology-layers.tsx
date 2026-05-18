import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import { Building2, ExternalLink, Layers, MapPin, Navigation, Search } from "lucide-react";

type Province = {
  plate: number;
  city: string;
  region: string;
  dealers: number;
  slug: string;
};

type Dealer = Province & {
  id: string;
  name: string;
  index: number;
};

const PROVINCES: Province[] = [
  [1, "Adana", "Akdeniz", 1, "adana-01"],
  [2, "Adiyaman", "Guneydogu", 1, "adiyaman-02"],
  [3, "Afyonkarahisar", "Ege", 1, "afyon-03"],
  [4, "Agri", "Dogu", 1, "agri-04"],
  [5, "Amasya", "Karadeniz", 1, "amasya-05"],
  [6, "Ankara", "Ic Anadolu", 2, "ankara-06"],
  [7, "Antalya", "Akdeniz", 1, "antalya-07"],
  [8, "Artvin", "Karadeniz", 1, "artvin-08"],
  [9, "Aydin", "Ege", 1, "aydin-09"],
  [10, "Balikesir", "Marmara", 1, "balikesir-10"],
  [11, "Bilecik", "Marmara", 1, "bilecik-11"],
  [12, "Bingol", "Dogu", 1, "bingol-12"],
  [13, "Bitlis", "Dogu", 1, "bitlis-13"],
  [14, "Bolu", "Karadeniz", 1, "bolu-14"],
  [15, "Burdur", "Akdeniz", 1, "burdur-15"],
  [16, "Bursa", "Marmara", 1, "bursa-16"],
  [17, "Canakkale", "Marmara", 1, "canakkale-17"],
  [18, "Cankiri", "Ic Anadolu", 1, "cankiri-18"],
  [19, "Corum", "Karadeniz", 1, "corum-19"],
  [20, "Denizli", "Ege", 1, "denizli-20"],
  [21, "Diyarbakir", "Guneydogu", 1, "diyarbakir-21"],
  [22, "Edirne", "Marmara", 1, "edirne-22"],
  [23, "Elazig", "Dogu", 1, "elazig-23"],
  [24, "Erzincan", "Dogu", 1, "erzincan-24"],
  [25, "Erzurum", "Dogu", 1, "erzurum-25"],
  [26, "Eskisehir", "Ic Anadolu", 1, "eskisehir-26"],
  [27, "Gaziantep", "Guneydogu", 1, "gaziantep-27"],
  [28, "Giresun", "Karadeniz", 1, "giresun-28"],
  [29, "Gumushane", "Karadeniz", 1, "gumushane-29"],
  [30, "Hakkari", "Dogu", 1, "hakkari-30"],
  [31, "Hatay", "Akdeniz", 1, "hatay-31"],
  [32, "Isparta", "Akdeniz", 1, "isparta-32"],
  [33, "Mersin", "Akdeniz", 1, "icel-33"],
  [34, "Istanbul", "Marmara", 4, "istanbul-34"],
  [35, "Izmir", "Ege", 1, "izmir-35"],
  [36, "Kars", "Dogu", 1, "kars-36"],
  [37, "Kastamonu", "Karadeniz", 1, "kastamonu-37"],
  [38, "Kayseri", "Ic Anadolu", 1, "kayseri-38"],
  [39, "Kirklareli", "Marmara", 1, "kirklareli-39"],
  [40, "Kirsehir", "Ic Anadolu", 1, "kirsehir-40"],
  [41, "Kocaeli", "Marmara", 1, "kocaeli-41"],
  [42, "Konya", "Ic Anadolu", 1, "konya-42"],
  [43, "Kutahya", "Ege", 1, "kutahya-43"],
  [44, "Malatya", "Dogu", 1, "malatya-44"],
  [45, "Manisa", "Ege", 1, "manisa-45"],
  [46, "Kahramanmaras", "Akdeniz", 1, "kahramanmaras-46"],
  [47, "Mardin", "Guneydogu", 1, "mardin-47"],
  [48, "Mugla", "Ege", 1, "mugla-48"],
  [49, "Mus", "Dogu", 1, "mus-49"],
  [50, "Nevsehir", "Ic Anadolu", 1, "nevsehir-50"],
  [51, "Nigde", "Ic Anadolu", 1, "nigde-51"],
  [52, "Ordu", "Karadeniz", 1, "ordu-52"],
  [53, "Rize", "Karadeniz", 1, "rize-53"],
  [54, "Sakarya", "Marmara", 1, "sakarya-54"],
  [55, "Samsun", "Karadeniz", 1, "samsun-55"],
  [56, "Siirt", "Guneydogu", 1, "siirt-56"],
  [57, "Sinop", "Karadeniz", 1, "sinop-57"],
  [58, "Sivas", "Ic Anadolu", 1, "sivas-58"],
  [59, "Tekirdag", "Marmara", 1, "tekirdag-59"],
  [60, "Tokat", "Karadeniz", 1, "tokat-60"],
  [61, "Trabzon", "Karadeniz", 1, "trabzon-61"],
  [62, "Tunceli", "Dogu", 1, "tunceli-62"],
  [63, "Sanliurfa", "Guneydogu", 1, "sanliurfa-63"],
  [64, "Usak", "Ege", 1, "usak-64"],
  [65, "Van", "Dogu", 1, "van-65"],
  [66, "Yozgat", "Ic Anadolu", 1, "yozgat-66"],
  [67, "Zonguldak", "Karadeniz", 1, "zonguldak-67"],
  [68, "Aksaray", "Ic Anadolu", 1, "aksaray-68"],
  [69, "Bayburt", "Karadeniz", 1, "bayburt-69"],
  [70, "Karaman", "Ic Anadolu", 1, "karaman-70"],
  [71, "Kirikkale", "Ic Anadolu", 1, "kirikkale-71"],
  [72, "Batman", "Guneydogu", 1, "batman-72"],
  [73, "Sirnak", "Guneydogu", 1, "sirnak-73"],
  [74, "Bartin", "Karadeniz", 1, "bartin-74"],
  [75, "Ardahan", "Dogu", 1, "ardahan-75"],
  [76, "Igdir", "Dogu", 1, "igdir-76"],
  [77, "Yalova", "Marmara", 1, "yalova-77"],
  [78, "Karabuk", "Karadeniz", 1, "karabuk-78"],
  [79, "Kilis", "Guneydogu", 1, "kilis-79"],
  [80, "Osmaniye", "Akdeniz", 1, "osmaniye-80"],
  [81, "Duzce", "Karadeniz", 1, "duzce-81"],
].map(([plate, city, region, dealers, slug]) => ({ plate, city, region, dealers, slug })) as Province[];

const OFFICIAL_BASE = "https://www.cukurovaisi.com/yetkili-saticilar";

export default function OntologyLayersPage() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("Hepsi");
  const [selectedId, setSelectedId] = useState("34-1");
  const [mapMode, setMapMode] = useState<"dealer" | "network">("dealer");

  const dealers = useMemo(() => expandDealers(PROVINCES), []);
  const selectedDealer = dealers.find(dealer => dealer.id === selectedId) ?? dealers[0];
  const filteredDealers = useMemo(() => {
    const needle = normalize(query);
    return dealers.filter(dealer => {
      const regionMatch = region === "Hepsi" || dealer.region === region;
      const queryMatch = !needle || normalize(`${dealer.city} ${dealer.name} ${dealer.region} ${dealer.plate}`).includes(needle);
      return regionMatch && queryMatch;
    });
  }, [dealers, query, region]);

  const mapQuery = mapMode === "network"
    ? "Çukurova Isı yetkili satıcılar Türkiye"
    : `${selectedDealer.city} Çukurova Isı yetkili satıcı`;
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=${mapMode === "network" ? 6 : 12}&output=embed`;
  const mapsOpenUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
  const officialUrl = `${OFFICIAL_BASE}/${selectedDealer.slug}`;

  return (
    <div style={pageStyle}>
      <TopNav />
      <main style={shellStyle}>
        <section style={workspaceStyle}>
          <header style={toolbarStyle}>
            <div style={titleBlockStyle}>
              <span>CUKUROVA ISI</span>
              <h1>Bayi Operasyon Haritası</h1>
            </div>
            <label style={searchStyle}>
              <Search size={16} />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Il, bayi veya bolge ara" />
            </label>
            <select value={region} onChange={event => setRegion(event.target.value)} style={selectStyle}>
              {["Hepsi", ...Array.from(new Set(PROVINCES.map(item => item.region)))].map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button type="button" onClick={() => setMapMode(mode => mode === "dealer" ? "network" : "dealer")} style={modeButtonStyle}>
              <Layers size={16} />
              {mapMode === "dealer" ? "Tek bayi" : "Ağ"}
            </button>
          </header>

          <div style={contentStyle}>
            <aside style={leftPanelStyle}>
              <div style={metricGridStyle}>
                <Metric icon={<Building2 size={15} />} label="Bayi" value={String(dealers.length)} />
                <Metric icon={<MapPin size={15} />} label="Il" value="81" />
                <Metric icon={<Navigation size={15} />} label="Coklu il" value="2" />
              </div>
              <div style={sourceStyle}>
                <b>Kaynak</b>
                <a href="https://www.cukurovaisi.com/tr/kurumsal/yetkili-saticilarimiz/" target="_blank" rel="noreferrer">
                  Çukurova Isı yetkili satıcıları <ExternalLink size={13} />
                </a>
              </div>
              <div style={dealerListStyle}>
                {filteredDealers.map(dealer => (
                  <button
                    key={dealer.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(dealer.id);
                      setMapMode("dealer");
                    }}
                    style={dealerRowStyle(dealer.id === selectedDealer.id)}
                  >
                    <span>{String(dealer.plate).padStart(2, "0")}</span>
                    <b>{dealer.name}</b>
                    <small>{dealer.region}</small>
                  </button>
                ))}
              </div>
            </aside>

            <section style={mapPanelStyle}>
              <iframe
                key={mapsEmbedUrl}
                title="Google Maps bayi haritası"
                src={mapsEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                style={googleMapStyle}
              />
              <div style={mapOverlayStyle}>
                <div>
                  <span>{String(selectedDealer.plate).padStart(2, "0")}</span>
                  <strong>{mapMode === "network" ? "Türkiye bayi ağı" : selectedDealer.name}</strong>
                </div>
                <a href={mapsOpenUrl} target="_blank" rel="noreferrer">Google Maps'te aç</a>
              </div>
            </section>

            <aside style={detailPanelStyle}>
              <div style={detailHeaderStyle}>
                <span>{String(selectedDealer.plate).padStart(2, "0")}</span>
                <strong>{selectedDealer.name}</strong>
              </div>
              <div style={detailGridStyle}>
                <Metric label="Il" value={selectedDealer.city} />
                <Metric label="Bolge" value={selectedDealer.region} />
                <Metric label="Bayi no" value={String(selectedDealer.index)} />
                <Metric label="Durum" value="Aktif" />
              </div>
              <a href={officialUrl} target="_blank" rel="noreferrer" style={primaryLinkStyle}>
                Resmi bayi sayfası <ExternalLink size={14} />
              </a>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

function expandDealers(provinces: Province[]): Dealer[] {
  return provinces.flatMap(province =>
    Array.from({ length: province.dealers }, (_, index) => ({
      ...province,
      id: `${province.plate}-${index + 1}`,
      index: index + 1,
      name: `${province.city} Bayi${province.dealers > 1 ? ` ${index + 1}` : ""}`,
    })),
  );
}

function normalize(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function Metric({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#eef2f3",
  color: CT.ink,
  fontFamily: CT_FONT,
};

const shellStyle: CSSProperties = {
  padding: "58px 14px 14px",
};

const workspaceStyle: CSSProperties = {
  height: "calc(100vh - 76px)",
  display: "grid",
  gridTemplateRows: "62px minmax(0, 1fr)",
  border: `1px solid ${CT.border}`,
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
};

const toolbarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "248px minmax(260px, 1fr) 160px 118px",
  gap: 10,
  alignItems: "center",
  padding: "10px 14px",
  borderBottom: `1px solid ${CT.border}`,
  background: "#fbfaf6",
};

const titleBlockStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const searchStyle: CSSProperties = {
  height: 38,
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fff",
  color: CT.inkMuted,
  padding: "0 10px",
};

const selectStyle: CSSProperties = {
  height: 38,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fff",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontWeight: 850,
  padding: "0 10px",
};

const modeButtonStyle: CSSProperties = {
  height: 38,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: "1px solid rgba(201,100,66,0.52)",
  borderRadius: 7,
  background: "#f7e7df",
  color: CT.accent,
  fontFamily: CT_FONT,
  fontWeight: 900,
  cursor: "pointer",
};

const contentStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "324px minmax(0, 1fr) 286px",
};

const leftPanelStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "auto auto minmax(0, 1fr)",
  gap: 10,
  padding: 12,
  borderRight: `1px solid ${CT.border}`,
  background: "rgba(255,255,255,0.96)",
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 7,
};

const metricStyle: CSSProperties = {
  minHeight: 58,
  display: "grid",
  alignContent: "center",
  gap: 5,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fff",
  padding: "8px 9px",
};

const sourceStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fbfaf6",
  padding: 10,
  fontSize: 12,
};

const dealerListStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  alignContent: "start",
  gap: 5,
  overflowY: "auto",
  paddingRight: 2,
};

const dealerRowStyle = (active: boolean): CSSProperties => ({
  minHeight: 35,
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) 84px",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${active ? CT.accentEdge : CT.border}`,
  borderRadius: 6,
  background: active ? CT.accentSoft : "#fff",
  color: active ? CT.accent : CT.ink,
  fontFamily: CT_FONT,
  fontSize: 11,
  textAlign: "left",
  padding: "0 8px",
  cursor: "pointer",
});

const mapPanelStyle: CSSProperties = {
  position: "relative",
  minWidth: 0,
  minHeight: 0,
  background: "#dfe8ea",
};

const googleMapStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 520,
  border: 0,
  display: "block",
};

const mapOverlayStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  bottom: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 18,
  minWidth: 330,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: "rgba(255,255,255,0.94)",
  boxShadow: "0 14px 34px rgba(26,28,34,0.18)",
  padding: "10px 12px",
};

const detailPanelStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 12,
  borderLeft: `1px solid ${CT.border}`,
  background: "#fbfaf6",
  padding: 12,
};

const detailHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr)",
  alignItems: "center",
  gap: 9,
  fontSize: 15,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const primaryLinkStyle: CSSProperties = {
  height: 38,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: `1px solid ${CT.accentEdge}`,
  borderRadius: 7,
  background: CT.accentSoft,
  color: CT.accent,
  textDecoration: "none",
  fontWeight: 900,
};
