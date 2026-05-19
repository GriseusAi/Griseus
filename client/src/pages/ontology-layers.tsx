import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, Polyline, useMap } from "react-leaflet";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import { LocateFixed, Route, Search } from "lucide-react";

type Dealer = {
  id: string;
  code: string;
  name: string;
  city: string;
  district: string;
  side: "Avrupa" | "Anadolu";
  lat: number;
  lng: number;
  status: "Aktif" | "Adres bekleniyor";
  address: string;
  load: number;
  monthlyAvg: number;
  topDevice: string;
  deviceMix: Array<{ sku: string; family: string; avg: number; historyAvg: number; share: number; seasonalAvg?: number[] }>;
  scenarioNote: string;
};

const ISTANBUL_CENTER: [number, number] = [41.0151, 28.9795];
const FACTORY = {
  name: "CUKUROVA ISI FABRIKA",
  address: "Ataturk Bulvari Gebze Plastikciler Organize Sanayi Bolgesi No:28, 41400 Gebze / Kocaeli",
  position: [40.8417566, 29.43842] as [number, number],
};
const MONTH_LABELS = ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];
const DEVICE_CATALOG = [
  { sku: "GSA15", family: "Goldsun Aqua" },
  { sku: "GSA20", family: "Goldsun Aqua" },
  { sku: "GSA30", family: "Goldsun Aqua" },
  { sku: "GSS20P", family: "Goldsun Supra" },
  { sku: "GSS40P", family: "Goldsun Supra" },
  { sku: "ELT.5-7", family: "Elite seramik" },
  { sku: "ELT.7-11", family: "Elite seramik" },
  { sku: "BH.50ST.SV", family: "Blackheat" },
  { sku: "BH.50UT.SV", family: "Blackheat" },
  { sku: "BH.55ST.SV", family: "Blackheat" },
];

const ISTANBUL_DEALERS: Dealer[] = [
  {
    id: "deltaterm-isi",
    code: "IST-01",
    name: "DELTATERM ISI LTD. STI.",
    city: "Istanbul",
    district: "Maltepe",
    side: "Anadolu",
    lat: 40.936,
    lng: 29.13,
    status: "Aktif",
    address: "Altaycesme Mah. Sarigul Sok. Soykent Sit. B Blok No:1A 34843 Maltepe / Istanbul",
    load: 78,
    monthlyAvg: 26,
    topDevice: "GSA30",
    deviceMix: [
      { sku: "GSA30", family: "Goldsun Aqua", avg: 8, historyAvg: 11, share: 31 },
      { sku: "GSA20", family: "Goldsun Aqua", avg: 6, historyAvg: 8, share: 23 },
      { sku: "GSS20P", family: "Goldsun Supra", avg: 5, historyAvg: 7, share: 19 },
      { sku: "GSA15", family: "Goldsun Aqua", avg: 3, historyAvg: 4, share: 12 },
      { sku: "ELT.5-7", family: "Elite seramik", avg: 2, historyAvg: 3, share: 8 },
      { sku: "BH.50ST.SV", family: "Blackheat", avg: 2, historyAvg: 2, share: 7 },
    ],
    scenarioNote: "Maltepe-Kartal-Pendik hattinda elektrikli isitici agirlikli perakende ve servis talebi varsayildi.",
  },
  {
    id: "optimum-muhendislik",
    code: "IST-02",
    name: "OPTIMUM MUHENDISLIK",
    city: "Istanbul",
    district: "Kadikoy",
    side: "Anadolu",
    lat: 40.9826315,
    lng: 29.0553332,
    status: "Aktif",
    address: "Yildiray Sk. No:20/A Feneryolu Kadikoy / Istanbul",
    load: 64,
    monthlyAvg: 18,
    topDevice: "GSS20P",
    deviceMix: [
      { sku: "GSS20P", family: "Goldsun Supra", avg: 5, historyAvg: 9, share: 28 },
      { sku: "GSA20", family: "Goldsun Aqua", avg: 4, historyAvg: 6, share: 22 },
      { sku: "GSA30", family: "Goldsun Aqua", avg: 3, historyAvg: 5, share: 17 },
      { sku: "GSS40P", family: "Goldsun Supra", avg: 3, historyAvg: 5, share: 17 },
      { sku: "ELT.7-11", family: "Elite seramik", avg: 2, historyAvg: 3, share: 11 },
      { sku: "GSA15", family: "Goldsun Aqua", avg: 1, historyAvg: 2, share: 5 },
    ],
    scenarioNote: "Kadikoy-Beykoz-Uskudar bolgesinde proje bazli premium elektrikli urun karmasi varsayildi.",
  },
  {
    id: "duz-isitma",
    code: "IST-03",
    name: "DUZ ISITMA SOGUTMA SAN. VE TIC. LTD. STI.",
    city: "Istanbul",
    district: "Pendik",
    side: "Anadolu",
    lat: 40.8773356,
    lng: 29.2522595,
    status: "Aktif",
    address: "Kaynarca Mah. Adnan Kahveci Cad. No:18/A Pendik / Istanbul",
    load: 71,
    monthlyAvg: 31,
    topDevice: "GSA20",
    deviceMix: [
      { sku: "GSA20", family: "Goldsun Aqua", avg: 9, historyAvg: 13, share: 29 },
      { sku: "GSA30", family: "Goldsun Aqua", avg: 7, historyAvg: 10, share: 23 },
      { sku: "BH.50ST.SV", family: "Blackheat", avg: 5, historyAvg: 7, share: 16 },
      { sku: "BH.55ST.SV", family: "Blackheat", avg: 4, historyAvg: 6, share: 13 },
      { sku: "GSS20P", family: "Goldsun Supra", avg: 4, historyAvg: 5, share: 13 },
      { sku: "ELT.5-7", family: "Elite seramik", avg: 2, historyAvg: 3, share: 6 },
    ],
    scenarioNote: "Pendik-Tuzla sanayi ve sahil hattinda stok devir hizi yuksek bayi profili varsayildi.",
  },
  {
    id: "avrupa-isitma",
    code: "IST-04",
    name: "AVRUPA ISITMA SOGUTMA SAN. VE TIC. LTD. STI.",
    city: "Istanbul",
    district: "Basaksehir",
    side: "Avrupa",
    lat: 41.0973187,
    lng: 28.7992904,
    status: "Aktif",
    address: "Mutfakcilar Sanayi Sitesi M9 Blok No:32 Ikitelli / Istanbul",
    load: 55,
    monthlyAvg: 22,
    topDevice: "BH.55ST.SV",
    deviceMix: [
      { sku: "BH.55ST.SV", family: "Blackheat", avg: 6, historyAvg: 8, share: 27 },
      { sku: "BH.50UT.SV", family: "Blackheat", avg: 5, historyAvg: 7, share: 23 },
      { sku: "BH.50ST.SV", family: "Blackheat", avg: 4, historyAvg: 6, share: 18 },
      { sku: "GSA30", family: "Goldsun Aqua", avg: 3, historyAvg: 5, share: 14 },
      { sku: "GSS40P", family: "Goldsun Supra", avg: 2, historyAvg: 3, share: 9 },
      { sku: "ELT.7-11", family: "Elite seramik", avg: 2, historyAvg: 3, share: 9 },
    ],
    scenarioNote: "Ikitelli sanayi bolgesi icin dogalgazli radyant ve endustriyel talep agirligi varsayildi.",
  },
];

export default function OntologyLayersPage() {
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("Hepsi");
  const [selectedId, setSelectedId] = useState(ISTANBUL_DEALERS[0].id);
  const [showRoutes, setShowRoutes] = useState(true);
  const [dealers, setDealers] = useState(ISTANBUL_DEALERS);
  const [panelOpen, setPanelOpen] = useState(true);

  const selectedDealer = dealers.find(dealer => dealer.id === selectedId) ?? dealers[0];
  const filteredDealers = useMemo(() => {
    const needle = normalize(query);
    return dealers.filter(dealer => {
      const sideMatch = side === "Hepsi" || dealer.side === side;
      const queryMatch = !needle || normalize(`${dealer.code} ${dealer.name} ${dealer.city} ${dealer.district} ${dealer.side}`).includes(needle);
      return sideMatch && queryMatch;
    });
  }, [dealers, query, side]);

  const updateDeviceMix = (dealerId: string, sku: string, patch: Partial<Dealer["deviceMix"][number]>) => {
    setDealers(items => items.map(item => item.id === dealerId
      ? { ...item, deviceMix: item.deviceMix.map(device => device.sku === sku ? { ...device, ...patch } : device) }
      : item));
  };
  const addDeviceMix = (dealerId: string, sku: string) => {
    const catalogItem = DEVICE_CATALOG.find(item => item.sku === sku);
    if (!catalogItem) return;
    setDealers(items => items.map(item => {
      if (item.id !== dealerId || item.deviceMix.some(device => device.sku === sku)) return item;
      const nextDevice = {
        ...catalogItem,
        avg: 1,
        historyAvg: 2,
        share: 5,
        seasonalAvg: buildSeasonalSeries({ ...catalogItem, avg: 1, historyAvg: 2, share: 5 }),
      };
      return { ...item, deviceMix: [...item.deviceMix, nextDevice] };
    }));
  };
  const removeDeviceMix = (dealerId: string, sku: string) => {
    setDealers(items => items.map(item => item.id === dealerId
      ? { ...item, deviceMix: item.deviceMix.filter(device => device.sku !== sku) }
      : item));
  };

  return (
    <div style={pageStyle}>
      <LeafletStyleOverrides />
      <TopNav />
      <main style={shellStyle}>
        <section style={workspaceStyle}>
          <RealMap
            dealers={filteredDealers}
            selectedDealer={selectedDealer}
            showRoutes={showRoutes}
            onSelect={setSelectedId}
          />
          <div style={mapToolbarStyle}>
            <div style={titleBlockStyle}>
              <span>CUKUROVA ISI</span>
              <h1>Geospatial Bayi OS</h1>
            </div>
            <label style={searchStyle}>
              <Search size={16} />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Bayi, ilce veya kod ara" />
            </label>
            <select value={side} onChange={event => setSide(event.target.value)} style={selectStyle}>
              {["Hepsi", "Avrupa", "Anadolu"].map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button type="button" onClick={() => setShowRoutes(value => !value)} style={modeButtonStyle(showRoutes)}>
              <Route size={16} />
              Hatlar
            </button>
          </div>
          <div style={mapSearchChipStyle}>
                <Search size={15} />
            <span>{filteredDealers.length} bayi gorunuyor</span>
          </div>
          <button type="button" onClick={() => setPanelOpen(open => !open)} style={panelToggleStyle}>
            {panelOpen ? "Paneli kapat" : "Veri paneli"}
          </button>
          {panelOpen && (
            <ControlPanel
              dealers={dealers}
              selectedDealer={selectedDealer}
              onSelect={setSelectedId}
              onDeviceChange={updateDeviceMix}
              onDeviceAdd={addDeviceMix}
              onDeviceRemove={removeDeviceMix}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function ControlPanel({
  dealers,
  selectedDealer,
  onSelect,
  onDeviceChange,
  onDeviceAdd,
  onDeviceRemove,
}: {
  dealers: Dealer[];
  selectedDealer: Dealer;
  onSelect: (id: string) => void;
  onDeviceChange: (dealerId: string, sku: string, patch: Partial<Dealer["deviceMix"][number]>) => void;
  onDeviceAdd: (dealerId: string, sku: string) => void;
  onDeviceRemove: (dealerId: string, sku: string) => void;
}) {
  const [chartSkus, setChartSkus] = useState(() => selectedDealer.deviceMix.slice(0, 2).map(item => item.sku));

  useEffect(() => {
    setChartSkus(selectedDealer.deviceMix.slice(0, 2).map(item => item.sku));
  }, [selectedDealer.id]);

  const chartDevices = selectedDealer.deviceMix.filter(item => chartSkus.includes(item.sku));
  const addableDevices = DEVICE_CATALOG.filter(item => !selectedDealer.deviceMix.some(device => device.sku === item.sku));
  const toggleChartSku = (sku: string) => {
    setChartSkus(current => current.includes(sku) ? current.filter(item => item !== sku) : [...current, sku]);
  };
  const removeDevice = (sku: string) => {
    setChartSkus(current => current.filter(item => item !== sku));
    onDeviceRemove(selectedDealer.id, sku);
  };

  return (
    <aside className="semantic-control-panel" style={controlPanelStyle}>
      <header style={panelHeaderStyle}>
        <strong>Bayi verisi</strong>
        <span>{selectedDealer.code}</span>
      </header>
      <select value={selectedDealer.id} onChange={event => onSelect(event.target.value)} style={panelSelectStyle}>
        {dealers.map(dealer => <option key={dealer.id} value={dealer.id}>{dealer.code} · {dealer.name}</option>)}
      </select>
      <section style={panelSectionStyle}>
        <div style={productHeaderStyle}>
          <span>Cihaz tipi</span>
          <span>Miktar</span>
        </div>
        <div style={deviceGridStyle}>
          {selectedDealer.deviceMix.map(item => (
            <div key={item.sku} style={deviceCardStyle(chartSkus.includes(item.sku))}>
              <button type="button" onClick={() => toggleChartSku(item.sku)} style={deviceCardButtonStyle}>
                <strong>{item.sku}</strong>
              </button>
              <input type="number" value={item.avg} onChange={event => onDeviceChange(selectedDealer.id, item.sku, { avg: Number(event.target.value) || 0 })} />
              <button type="button" onClick={() => removeDevice(item.sku)} style={deviceRemoveButtonStyle} aria-label={`${item.sku} kaldir`}>x</button>
            </div>
          ))}
        </div>
        <select
          value=""
          onChange={event => {
            if (!event.target.value) return;
            onDeviceAdd(selectedDealer.id, event.target.value);
            setChartSkus(current => [...current, event.target.value]);
          }}
          style={addDeviceSelectStyle}
        >
          <option value="">+ Cihaz ekle</option>
          {addableDevices.map(item => <option key={item.sku} value={item.sku}>{item.sku} · {item.family}</option>)}
        </select>
      </section>
      <section style={chartPanelStyle}>
        <div style={chartHeaderStyle}>
          <strong>Ortalamalar</strong>
          <span>ontology f(x)</span>
        </div>
        <SeasonalAverageChart
          devices={chartDevices.length ? chartDevices : selectedDealer.deviceMix.slice(0, 1)}
          onSeasonChange={(sku, seasonalAvg) => onDeviceChange(selectedDealer.id, sku, { seasonalAvg })}
        />
      </section>
    </aside>
  );
}

function SeasonalAverageChart({
  devices,
  onSeasonChange,
}: {
  devices: Dealer["deviceMix"];
  onSeasonChange: (sku: string, seasonalAvg: number[]) => void;
}) {
  const series = devices.map((device, index) => ({
    device,
    color: chartColors[index % chartColors.length],
    values: buildSeasonalSeries(device),
  }));
  const maxValue = Math.max(1, ...series.flatMap(item => item.values));
  const width = 336;
  const height = 150;
  const chartLeft = 28;
  const chartTop = 16;
  const chartWidth = 292;
  const chartHeight = 82;
  const toX = (index: number) => chartLeft + (index / (MONTH_LABELS.length - 1)) * chartWidth;
  const toY = (value: number) => chartTop + chartHeight - (value / maxValue) * chartHeight;

  return (
    <div style={chartWrapStyle}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Aylik satis ortalamalari" style={chartSvgStyle}>
        {[0, 0.5, 1].map(ratio => (
          <line
            key={ratio}
            x1={chartLeft}
            x2={chartLeft + chartWidth}
            y1={chartTop + chartHeight - chartHeight * ratio}
            y2={chartTop + chartHeight - chartHeight * ratio}
            stroke="rgba(20,20,19,0.08)"
          />
        ))}
        <line x1={chartLeft} x2={chartLeft} y1={chartTop} y2={chartTop + chartHeight} stroke="rgba(20,20,19,0.18)" />
        <line x1={chartLeft} x2={chartLeft + chartWidth} y1={chartTop + chartHeight} y2={chartTop + chartHeight} stroke="rgba(20,20,19,0.18)" />
        <text x={4} y={chartTop + 5} style={chartAxisTextStyle}>{maxValue}</text>
        <text x={8} y={chartTop + chartHeight + 4} style={chartAxisTextStyle}>0</text>
        {MONTH_LABELS.map((month, index) => (
          <text key={month} x={toX(index)} y={height - 8} textAnchor="middle" style={chartAxisTextStyle}>{month}</text>
        ))}
        {series.map(item => {
          const points = item.values.map((value, index) => `${toX(index)},${toY(value)}`).join(" ");
          return (
            <g key={item.device.sku}>
              <polyline points={points} fill="none" stroke={item.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              {item.values.map((value, index) => (
                <circle key={`${item.device.sku}-${index}`} cx={toX(index)} cy={toY(value)} r="2.6" fill="#fff" stroke={item.color} strokeWidth="1.8" />
              ))}
            </g>
          );
        })}
      </svg>
      <div style={chartLegendStyle}>
        {series.map(item => (
          <span key={item.device.sku} style={chartLegendItemStyle}><i style={{ ...chartLegendDotStyle, background: item.color }} />{item.device.sku}</span>
        ))}
      </div>
      <div style={seasonEditorStyle}>
        {series.map(item => (
          <div key={`edit-${item.device.sku}`} style={seasonEditorRowStyle}>
            <strong style={{ color: item.color }}>{item.device.sku}</strong>
            <div style={seasonInputGridStyle}>
              {item.values.map((value, index) => (
                <label key={`${item.device.sku}-${MONTH_LABELS[index]}`} style={seasonInputStyle}>
                  <span>{MONTH_LABELS[index]}</span>
                  <input
                    type="number"
                    value={value}
                    onChange={event => {
                      const nextValues = [...item.values];
                      nextValues[index] = Number(event.target.value) || 0;
                      onSeasonChange(item.device.sku, nextValues);
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RealMap({
  dealers,
  selectedDealer,
  showRoutes,
  onSelect,
}: {
  dealers: Dealer[];
  selectedDealer: Dealer;
  showRoutes: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <MapContainer
      className="griseus-real-map"
      center={ISTANBUL_CENTER}
      zoom={11}
      minZoom={3}
      maxZoom={18}
      zoomControl={false}
      attributionControl={false}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution="OpenStreetMap, CARTO"
      />
      <MapSync selectedDealer={selectedDealer} />
      <MapControls selectedDealer={selectedDealer} />
      {showRoutes && dealers.map(dealer => (
        <Polyline
          key={`route-${dealer.id}`}
          positions={[FACTORY.position, [dealer.lat, dealer.lng]]}
          pathOptions={{
            color: dealer.id === selectedDealer.id ? "#3b5f9f" : "#1f2937",
            weight: dealer.id === selectedDealer.id ? 3 : 1.5,
            opacity: dealer.id === selectedDealer.id ? 0.72 : 0.28,
          }}
        />
      ))}
      <Marker position={FACTORY.position} icon={hubIcon()}>
        <Popup>
          <div style={popupStyle}>
            <span style={popupEyebrowStyle}>FABRIKA</span>
            <strong>{FACTORY.name}</strong>
            <p>{FACTORY.address}</p>
          </div>
        </Popup>
      </Marker>
      {dealers.map(dealer => (
        <Marker
          key={dealer.id}
          position={[dealer.lat, dealer.lng]}
          icon={dealerIcon(dealer.id === selectedDealer.id)}
          eventHandlers={{ click: () => onSelect(dealer.id) }}
        />
      ))}
    </MapContainer>
  );
}

function MapSync({ selectedDealer }: { selectedDealer: Dealer }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([FACTORY.position, ...ISTANBUL_DEALERS.map(dealer => [dealer.lat, dealer.lng] as [number, number])]);
    map.fitBounds(bounds, { padding: [86, 86], maxZoom: 10, animate: true });
  }, [map, selectedDealer.id]);
  return null;
}

function MapControls({ selectedDealer }: { selectedDealer: Dealer }) {
  const map = useMap();
  return (
    <div style={zoomRailStyle}>
      <button type="button" onClick={() => map.zoomIn()} style={iconButtonStyle} aria-label="Zoom in">+</button>
      <button type="button" onClick={() => map.zoomOut()} style={iconButtonStyle} aria-label="Zoom out">-</button>
      <button type="button" onClick={() => map.flyTo([selectedDealer.lat, selectedDealer.lng], 13)} style={iconButtonStyle} aria-label="Center selected">
        <LocateFixed size={16} />
      </button>
    </div>
  );
}

const chartColors = ["#3b5f9f", "#c96442", "#3f7c5f", "#8a6f2a", "#6c5f8f", "#263241"];

function buildSeasonalSeries(device: Dealer["deviceMix"][number]) {
  if (device.seasonalAvg?.length === MONTH_LABELS.length) return device.seasonalAvg;
  const profile = seasonalProfile(device.sku);
  return profile.map(multiplier => Math.max(1, Math.round(device.historyAvg * multiplier)));
}

function seasonalProfile(sku: string) {
  if (sku.startsWith("BH")) return [0.72, 0.68, 0.62, 0.54, 0.46, 0.4, 0.48, 0.74, 1.28, 1.22, 1.08, 0.9];
  if (sku.startsWith("GSS")) return [0.82, 0.78, 0.72, 0.68, 0.66, 0.72, 0.9, 1.32, 1.14, 1.02, 0.94, 0.86];
  if (sku.startsWith("ELT")) return [0.7, 0.68, 0.64, 0.58, 0.52, 0.48, 0.56, 0.74, 1.02, 1.3, 1.18, 0.92];
  return [0.88, 0.82, 0.76, 0.68, 0.62, 0.58, 0.66, 0.78, 0.96, 1.16, 1.34, 1.18];
}

function dealerIcon(active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="griseus-map-pin ${active ? "is-active" : ""}"></div>`,
    iconSize: active ? [34, 34] : [26, 26],
    iconAnchor: active ? [17, 17] : [13, 13],
  });
}

function hubIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="griseus-map-hub">+</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function LeafletStyleOverrides() {
  return (
    <style>{`
      .griseus-real-map .leaflet-tile-container img {
        filter: grayscale(1) saturate(0.25) contrast(0.94) brightness(1.08) !important;
      }
      .griseus-real-map .leaflet-control-attribution {
        display: none;
      }
      .griseus-real-map .leaflet-popup-content-wrapper {
        border-radius: 8px;
        border: 1px solid rgba(20,20,19,0.12);
        box-shadow: 0 18px 36px rgba(26,28,34,0.18);
      }
      .griseus-real-map .leaflet-popup-content {
        width: 320px !important;
        margin: 14px;
        font-family: ${CT_FONT};
      }
      .griseus-map-pin {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        background: #536d8f;
        border: 4px solid #fff;
        box-shadow: 0 9px 22px rgba(31,41,55,0.24);
        position: relative;
      }
      .griseus-map-pin::after {
        content: "";
        position: absolute;
        inset: 7px;
        border-radius: 999px;
        background: #fff;
      }
      .griseus-map-pin.is-active {
        width: 34px;
        height: 34px;
        background: #3b5f9f;
        box-shadow: 0 14px 32px rgba(59,95,159,0.28);
      }
      .griseus-map-pin.is-active::after {
        inset: 10px;
      }
      .griseus-map-hub {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background: #111827;
        color: #fff;
        border: 4px solid #fff;
        font: 900 18px/1 ${CT_MONO};
        box-shadow: 0 12px 26px rgba(26,28,34,0.28);
      }
      .leaflet-popup-content p {
        margin: 0;
        line-height: 1.35;
      }
      .leaflet-popup-content strong {
        font-size: 14px;
        line-height: 1.2;
      }
      .leaflet-popup-content small {
        color: ${CT.inkMuted};
        line-height: 1.35;
      }
      .leaflet-popup-content span > b {
        display: block;
        margin-top: 2px;
        font-size: 13px;
      }
      .leaflet-popup-content span > b small {
        display: inline;
        margin-left: 7px;
        font-size: 10px;
        font-weight: 750;
        color: ${CT.inkMuted};
      }
      .leaflet-popup-content span > i {
        font-style: normal;
        color: ${CT.inkMuted};
      }
      .leaflet-popup-content span > em {
        display: block;
        height: 5px;
        margin-top: 4px;
        border-radius: 999px;
        background: #3b5f9f;
      }
      .leaflet-popup-content details summary {
        cursor: pointer;
        font-weight: 900;
        color: ${CT.ink};
      }
      .leaflet-popup-content details > div,
      .leaflet-popup-content [style*="fbfaf6"] > div {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      .leaflet-popup-content details > div span,
      .leaflet-popup-content [style*="fbfaf6"] > div span {
        border: 1px solid rgba(20,20,19,0.08);
        border-radius: 6px;
        padding: 5px;
        background: #fff;
      }
      .semantic-control-panel input,
      .semantic-control-panel select {
        min-width: 0;
        border: 1px solid rgba(20,20,19,0.12);
        border-radius: 6px;
        background: #fff;
        color: #141413;
        font: 800 12px/1.2 ${CT_FONT};
        padding: 6px 7px;
      }
    `}</style>
  );
}

function normalize(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
  position: "relative",
  border: `1px solid ${CT.border}`,
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
};

const mapToolbarStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  right: 16,
  top: 16,
  display: "grid",
  gridTemplateColumns: "248px minmax(260px, 1fr) 150px 110px",
  gap: 10,
  alignItems: "center",
  padding: "10px 14px",
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: "rgba(251,250,246,0.94)",
  boxShadow: "0 14px 36px rgba(26,28,34,0.14)",
  zIndex: 500,
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

const modeButtonStyle = (active: boolean): CSSProperties => ({
  height: 38,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: `1px solid ${active ? "rgba(201,100,66,0.52)" : CT.border}`,
  borderRadius: 7,
  background: active ? "#f7e7df" : "#fff",
  color: active ? CT.accent : CT.inkMuted,
  fontFamily: CT_FONT,
  fontWeight: 900,
  cursor: "pointer",
});

const mapSearchChipStyle: CSSProperties = {
  position: "absolute",
  left: 18,
  top: 88,
  height: 38,
  minWidth: 250,
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: "rgba(255,255,255,0.94)",
  boxShadow: "0 10px 26px rgba(26,28,34,0.12)",
  color: CT.inkMuted,
  padding: "0 12px",
  zIndex: 500,
};

const panelToggleStyle: CSSProperties = {
  position: "absolute",
  left: 18,
  top: 136,
  height: 34,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "rgba(255,255,255,0.95)",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontWeight: 900,
  padding: "0 12px",
  zIndex: 520,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(26,28,34,0.12)",
};

const controlPanelStyle: CSSProperties = {
  position: "absolute",
  left: 18,
  top: 178,
  bottom: 18,
  width: 360,
  display: "grid",
  gridAutoRows: "max-content",
  gap: 10,
  overflowY: "auto",
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 18px 42px rgba(26,28,34,0.16)",
  padding: 12,
  zIndex: 520,
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 12,
};

const panelSelectStyle: CSSProperties = {
  height: 36,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fff",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontWeight: 850,
  padding: "0 8px",
};

const panelSectionStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fbfaf6",
  padding: 8,
};

const productHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 56px",
  gap: 8,
  padding: "0 2px 2px",
  color: CT.inkMuted,
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
};

const deviceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
};

const deviceCardStyle = (active: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 48px 18px",
  gap: 6,
  alignItems: "center",
  border: `1px solid ${active ? "rgba(59,95,159,0.42)" : CT.border}`,
  borderRadius: 7,
  background: active ? "#eef3fb" : "#fff",
  padding: 6,
});

const deviceCardButtonStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
  border: 0,
  background: "transparent",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 12,
  textAlign: "left",
  padding: 0,
  cursor: "pointer",
};

const deviceRemoveButtonStyle: CSSProperties = {
  width: 18,
  height: 18,
  display: "grid",
  placeItems: "center",
  border: 0,
  borderRadius: 99,
  background: "rgba(20,20,19,0.07)",
  color: CT.inkMuted,
  fontFamily: CT_FONT,
  fontSize: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const addDeviceSelectStyle: CSSProperties = {
  height: 32,
  border: `1px dashed rgba(20,20,19,0.22)`,
  borderRadius: 7,
  background: "#fff",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontWeight: 900,
  padding: "0 8px",
};

const chartPanelStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "#fff",
  padding: 8,
};

const chartHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 12,
};

const chartWrapStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const chartSvgStyle: CSSProperties = {
  width: "100%",
  height: 150,
  display: "block",
};

const chartAxisTextStyle: CSSProperties = {
  fill: CT.inkMuted,
  fontFamily: CT_MONO,
  fontSize: 9,
  fontWeight: 800,
};

const chartLegendStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: CT.inkMuted,
  fontSize: 11,
  fontWeight: 850,
};

const chartLegendItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const chartLegendDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 99,
  display: "inline-block",
};

const seasonEditorStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  borderTop: `1px solid ${CT.border}`,
  paddingTop: 6,
};

const seasonEditorRowStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 11,
};

const seasonInputGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 1fr)",
  gap: 5,
};

const seasonInputStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  color: CT.inkMuted,
  fontSize: 9,
  fontWeight: 850,
};

const zoomRailStyle: CSSProperties = {
  position: "absolute",
  right: 16,
  top: 16,
  display: "grid",
  gap: 6,
  zIndex: 600,
};

const iconButtonStyle: CSSProperties = {
  width: 36,
  height: 36,
  display: "grid",
  placeItems: "center",
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: "rgba(255,255,255,0.95)",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 20,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(26,28,34,0.12)",
};

const popupStyle: CSSProperties = {
  display: "grid",
  gap: 9,
  fontSize: 12,
  color: CT.ink,
};

const popupEyebrowStyle: CSSProperties = {
  fontFamily: CT_MONO,
  fontSize: 10,
  fontWeight: 900,
  color: CT.accent,
};
