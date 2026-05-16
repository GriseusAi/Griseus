import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  Factory,
  Filter,
  GitCompare,
  Layers3,
  Search,
  X,
} from "lucide-react";

type Product = {
  id: number;
  sku: string;
  name: string;
  category?: string;
  component_count?: number | string;
};

type StockLevel = {
  productSku: string;
  productName?: string;
  productCategory?: string;
  inProduction: number;
  inWarehouse: number;
  totalSold: number;
  updatedAt?: string;
};

type BomComponent = {
  code: string;
  name: string;
  requiredPerUnit: number;
  unit: string;
  tier: number;
  parentComponentCode: string | null;
  currentStock: number;
  rawStock?: number;
  maxProducts: number | null;
  status: string;
  isSubAssembly?: boolean;
  children?: BomComponent[];
};

type BomResponse = {
  product: string;
  components: BomComponent[];
};

type FlatComponent = BomComponent & {
  sku: string;
  productName: string;
  path: string;
};

type StatusFilter = "all" | "critical" | "warning" | "ok" | "abundant" | "variable";
type StockFilter = "all" | "zero" | "low" | "enough";
type TimeFilter = "all" | "fresh" | "week" | "stale";
type SortMode = "risk" | "stock" | "required" | "device";

const statusLabels: Record<string, string> = {
  critical: "Kritik",
  warning: "Risk",
  ok: "Yeterli",
  abundant: "Bol",
  variable: "Opsiyonel",
  "N/A": "N/A",
};

export default function OntologyLayersPage() {
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [componentQuery, setComponentQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("risk");

  const productsQuery = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const stockLevelsQuery = useQuery<StockLevel[]>({ queryKey: ["/api/stock/levels"] });
  const products = productsQuery.data ?? [];
  const stockLevels = stockLevelsQuery.data ?? [];
  const activeSkus = selectedSkus.length > 0 ? selectedSkus : products.slice(0, 4).map(product => product.sku);

  const bomQueries = useQueries({
    queries: activeSkus.map(sku => ({
      queryKey: [`/api/bom/${encodeURIComponent(sku)}/stock`],
      queryFn: () => fetch(`/api/bom/${encodeURIComponent(sku)}/stock`).then(res => {
        if (!res.ok) throw new Error(`${sku} BOM okunamadi`);
        return res.json() as Promise<BomResponse>;
      }),
      enabled: Boolean(sku),
    })),
  });

  const stockBySku = useMemo(() => new Map(stockLevels.map(level => [level.productSku, level])), [stockLevels]);
  const productBySku = useMemo(() => new Map(products.map(product => [product.sku, product])), [products]);
  const bomBySku = useMemo(() => {
    const map = new Map<string, BomResponse>();
    activeSkus.forEach((sku, index) => {
      const data = bomQueries[index]?.data as BomResponse | undefined;
      if (data) map.set(sku, data);
    });
    return map;
  }, [activeSkus.join("|"), bomQueries.map(query => query.dataUpdatedAt).join("|")]);

  const flatComponents = useMemo(() => {
    const rows: FlatComponent[] = [];
    for (const sku of activeSkus) {
      const product = productBySku.get(sku);
      const bom = bomBySku.get(sku);
      if (!bom) continue;
      bom.components.forEach(component => {
        rows.push(...flattenComponent(component, sku, product?.name || sku, component.code));
      });
    }
    return rows;
  }, [activeSkus.join("|"), bomBySku, productBySku]);

  const filteredComponents = useMemo(() => {
    const needle = componentQuery.trim().toLocaleLowerCase("tr-TR");
    return flatComponents
      .filter(row => statusFilter === "all" || row.status === statusFilter)
      .filter(row => {
        if (stockFilter === "zero") return Number(row.currentStock) <= 0;
        if (stockFilter === "low") return row.maxProducts !== null && row.maxProducts > 0 && row.maxProducts < 150;
        if (stockFilter === "enough") return row.maxProducts === null || row.maxProducts >= 150;
        return true;
      })
      .filter(row => {
        if (!needle) return true;
        return `${row.sku} ${row.code} ${row.name} ${row.path}`.toLocaleLowerCase("tr-TR").includes(needle);
      })
      .sort((a, b) => compareComponents(a, b, sortMode));
  }, [flatComponents, componentQuery, statusFilter, stockFilter, sortMode]);

  const visibleDevices = useMemo(() => {
    return activeSkus
      .map(sku => {
        const product = productBySku.get(sku);
        const stock = stockBySku.get(sku);
        const bom = bomBySku.get(sku);
        const components = flatComponents.filter(row => row.sku === sku);
        const critical = components.filter(row => row.status === "critical").length;
        const warnings = components.filter(row => row.status === "warning").length;
        const capacity = minNumber(components.map(row => row.maxProducts).filter((n): n is number => n !== null));
        return {
          sku,
          name: product?.name || stock?.productName || sku,
          category: product?.category || stock?.productCategory || "-",
          componentCount: Number(product?.component_count ?? bom?.components.length ?? components.length ?? 0),
          warehouse: Number(stock?.inWarehouse ?? 0),
          production: Number(stock?.inProduction ?? 0),
          sold: Number(stock?.totalSold ?? 0),
          updatedAt: stock?.updatedAt || "",
          dataAgeDays: stock?.updatedAt ? daysSince(stock.updatedAt) : null,
          critical,
          warnings,
          capacity,
          loading: activeSkus.includes(sku) && !bom,
        };
      })
      .filter(device => {
        if (timeFilter === "fresh") return device.dataAgeDays !== null && device.dataAgeDays <= 1;
        if (timeFilter === "week") return device.dataAgeDays !== null && device.dataAgeDays <= 7;
        if (timeFilter === "stale") return device.dataAgeDays === null || device.dataAgeDays > 7;
        return true;
      });
  }, [activeSkus.join("|"), productBySku, stockBySku, bomBySku, flatComponents, timeFilter]);

  const sharedComponents = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string; devices: Set<string>; minStock: number; worstStatus: string }>();
    flatComponents.forEach(row => {
      const current = byCode.get(row.code) ?? {
        code: row.code,
        name: row.name,
        devices: new Set<string>(),
        minStock: Number.POSITIVE_INFINITY,
        worstStatus: "abundant",
      };
      current.devices.add(row.sku);
      current.minStock = Math.min(current.minStock, Number(row.currentStock));
      current.worstStatus = worstStatus(current.worstStatus, row.status);
      byCode.set(row.code, current);
    });
    return Array.from(byCode.values())
      .filter(item => item.devices.size > 1)
      .sort((a, b) => severityRank(b.worstStatus) - severityRank(a.worstStatus) || b.devices.size - a.devices.size)
      .slice(0, 10);
  }, [flatComponents]);

  const maxCapacity = Math.max(1, ...visibleDevices.map(device => device.capacity ?? 0), ...visibleDevices.map(device => device.warehouse));
  const loading = productsQuery.isLoading || stockLevelsQuery.isLoading || bomQueries.some(query => query.isLoading);

  return (
    <div style={pageStyle}>
      <TopNav />
      <main style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Ontology workspace</div>
            <h1 style={titleStyle}>Cihazlar ve alt bilesenler</h1>
          </div>
          <div style={summaryPillsStyle}>
            <SummaryPill icon={<Factory size={15} />} label="Cihaz" value={products.length} />
            <SummaryPill icon={<Boxes size={15} />} label="Bilesen satiri" value={flatComponents.length} />
            <SummaryPill icon={<AlertTriangle size={15} />} label="Kritik" value={flatComponents.filter(row => row.status === "critical").length} tone="risk" />
          </div>
        </header>

        <section style={layoutStyle}>
          <aside style={sidebarStyle}>
            <div style={panelTitleStyle}>
              <span>Cihaz seti</span>
              <button type="button" onClick={() => setSelectedSkus([])} style={ghostButtonStyle}>Sifirla</button>
            </div>
            <div style={deviceListStyle}>
              {products.map(product => {
                const active = activeSkus.includes(product.sku);
                const stock = stockBySku.get(product.sku);
                return (
                  <button key={product.sku} type="button" onClick={() => toggleSku(product.sku, active, selectedSkus, setSelectedSkus)} style={deviceButtonStyle(active)}>
                    <span style={deviceCheckStyle(active)}>{active ? <CheckCircle2 size={14} /> : null}</span>
                    <span style={{ minWidth: 0 }}>
                      <strong style={deviceNameStyle}>{product.sku}</strong>
                      <span style={deviceSubStyle}>{product.name}</span>
                    </span>
                    <span style={deviceStockStyle}>{fmt(stock?.inWarehouse ?? 0)}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section style={mainPanelStyle}>
            <div style={filterBarStyle}>
              <div style={searchBoxStyle}>
                <Search size={15} color={CT.inkMuted} />
                <input value={componentQuery} onChange={event => setComponentQuery(event.target.value)} placeholder="Bilesen kodu, ad veya cihaz ara" style={searchInputStyle} />
                {componentQuery && (
                  <button type="button" onClick={() => setComponentQuery("")} style={clearButtonStyle}><X size={13} /></button>
                )}
              </div>
              <Select label="Durum" value={statusFilter} onChange={value => setStatusFilter(value as StatusFilter)} options={[
                ["all", "Hepsi"], ["critical", "Kritik"], ["warning", "Risk"], ["ok", "Yeterli"], ["abundant", "Bol"], ["variable", "Opsiyonel"],
              ]} />
              <Select label="Stok" value={stockFilter} onChange={value => setStockFilter(value as StockFilter)} options={[
                ["all", "Hepsi"], ["zero", "Sifir"], ["low", "Dusuk kapasite"], ["enough", "Yeterli"],
              ]} />
              <Select label="Zaman" value={timeFilter} onChange={value => setTimeFilter(value as TimeFilter)} options={[
                ["all", "Hepsi"], ["fresh", "Bugun"], ["week", "7 gun"], ["stale", "Eski/veri yok"],
              ]} />
              <Select label="Sirala" value={sortMode} onChange={value => setSortMode(value as SortMode)} options={[
                ["risk", "Risk"], ["stock", "Stok"], ["required", "BOM ihtiyaci"], ["device", "Cihaz"],
              ]} />
            </div>

            <div style={compareGridStyle}>
              {visibleDevices.map(device => (
                <DeviceCompareCard key={device.sku} device={device} maxCapacity={maxCapacity} />
              ))}
              {visibleDevices.length === 0 && <EmptyState text="Bu zaman filtresine uyan cihaz yok." />}
            </div>

            <div style={contentGridStyle}>
              <section style={tablePanelStyle}>
                <div style={panelTitleStyle}>
                  <span>Alt bilesenler</span>
                  <small>{filteredComponents.length} satir</small>
                </div>
                <div style={componentTableStyle}>
                  <div style={tableHeaderStyle}>
                    <span>Cihaz</span>
                    <span>Bilesen</span>
                    <span>Stok</span>
                    <span>Uretilebilir</span>
                    <span>Durum</span>
                  </div>
                  {filteredComponents.slice(0, 120).map(row => (
                    <div key={`${row.sku}-${row.path}`} style={tableRowStyle}>
                      <strong>{row.sku}</strong>
                      <span style={{ minWidth: 0 }}>
                        <b style={componentCodeStyle}>{row.code}</b>
                        <em style={componentNameStyle}>{row.name}</em>
                      </span>
                      <span>{fmt(row.currentStock)} {row.unit}</span>
                      <span>{row.maxProducts === null ? "-" : fmt(row.maxProducts)}</span>
                      <StatusBadge status={row.status} />
                    </div>
                  ))}
                </div>
              </section>

              <aside style={insightPanelStyle}>
                <div style={panelTitleStyle}>
                  <span>Kesisen bilesenler</span>
                  <GitCompare size={15} color={CT.inkMuted} />
                </div>
                <div style={sharedListStyle}>
                  {sharedComponents.map(item => (
                    <div key={item.code} style={sharedRowStyle}>
                      <div>
                        <strong>{item.code}</strong>
                        <span>{item.name}</span>
                      </div>
                      <div style={sharedMetaStyle}>
                        <StatusBadge status={item.worstStatus} />
                        <small>{item.devices.size} cihaz</small>
                      </div>
                    </div>
                  ))}
                  {sharedComponents.length === 0 && <EmptyState text="Secili cihazlar arasinda ortak bilesen yok." />}
                </div>

                <div style={panelTitleStyle}>
                  <span>Filtre mantigi</span>
                  <Filter size={15} color={CT.inkMuted} />
                </div>
                <div style={ruleBoxStyle}>
                  <div><Clock3 size={14} /> Zaman filtresi cihaz stok kaydinin guncellenme tarihine bakar.</div>
                  <div><Database size={14} /> Stok filtresi BOM + component_stock birlesik verisini kullanir.</div>
                  <div><Layers3 size={14} /> Yari mamul satirlari alt cocuklariyla birlikte listelenir.</div>
                </div>
              </aside>
            </div>
          </section>
        </section>

        {loading && <div style={loadingStyle}>Gercek cihaz ve BOM verileri okunuyor.</div>}
      </main>
    </div>
  );
}

function flattenComponent(component: BomComponent, sku: string, productName: string, path: string): FlatComponent[] {
  const row: FlatComponent = { ...component, sku, productName, path };
  const children = component.children ?? [];
  return [row, ...children.flatMap(child => flattenComponent(child, sku, productName, `${path}/${child.code}`))];
}

function toggleSku(sku: string, active: boolean, selectedSkus: string[], setSelectedSkus: (next: string[]) => void) {
  if (selectedSkus.length === 0) {
    setSelectedSkus(active ? [] : [sku]);
    return;
  }
  const next = active ? selectedSkus.filter(item => item !== sku) : [...selectedSkus, sku];
  setSelectedSkus(next.slice(0, 8));
}

function compareComponents(a: FlatComponent, b: FlatComponent, mode: SortMode) {
  if (mode === "stock") return Number(a.currentStock) - Number(b.currentStock);
  if (mode === "required") return Number(b.requiredPerUnit) - Number(a.requiredPerUnit);
  if (mode === "device") return a.sku.localeCompare(b.sku) || a.code.localeCompare(b.code);
  return severityRank(b.status) - severityRank(a.status)
    || Number(a.maxProducts ?? Number.MAX_SAFE_INTEGER) - Number(b.maxProducts ?? Number.MAX_SAFE_INTEGER)
    || a.code.localeCompare(b.code);
}

function severityRank(status: string) {
  if (status === "critical") return 5;
  if (status === "warning") return 4;
  if (status === "variable") return 3;
  if (status === "ok") return 2;
  if (status === "abundant") return 1;
  return 0;
}

function worstStatus(a: string, b: string) {
  return severityRank(b) > severityRank(a) ? b : a;
}

function minNumber(values: number[]) {
  return values.length === 0 ? null : Math.min(...values);
}

function daysSince(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function fmt(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}

function SummaryPill({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: number; tone?: "neutral" | "risk" }) {
  return (
    <div style={summaryPillStyle(tone)}>
      {icon}
      <span>{label}</span>
      <strong>{fmt(value)}</strong>
    </div>
  );
}

function Select({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={selectWrapStyle}>
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)} style={selectStyle}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function DeviceCompareCard({ device, maxCapacity }: {
  device: {
    sku: string;
    name: string;
    category: string;
    componentCount: number;
    warehouse: number;
    production: number;
    sold: number;
    dataAgeDays: number | null;
    critical: number;
    warnings: number;
    capacity: number | null;
  };
  maxCapacity: number;
}) {
  const capacity = device.capacity ?? 0;
  return (
    <article style={deviceCardStyle}>
      <div style={deviceCardHeaderStyle}>
        <div>
          <strong>{device.sku}</strong>
          <span>{device.name}</span>
        </div>
        <StatusBadge status={device.critical > 0 ? "critical" : device.warnings > 0 ? "warning" : "ok"} />
      </div>
      <div style={barGroupStyle}>
        <Bar label="Depo" value={device.warehouse} max={maxCapacity} color={CT.ok} />
        <Bar label="Uretilebilir" value={capacity} max={maxCapacity} color={CT.info} />
      </div>
      <div style={deviceMetricsStyle}>
        <Metric label="Bilesen" value={device.componentCount} />
        <Metric label="Kritik" value={device.critical} />
        <Metric label="Uretimde" value={device.production} />
        <Metric label="Guncel" value={device.dataAgeDays === null ? "-" : `${device.dataAgeDays}g`} />
      </div>
    </article>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={barRowStyle}>
      <span>{label}</span>
      <div style={barTrackStyle}><div style={{ ...barFillStyle, width: `${Math.min(100, Math.max(2, (value / max) * 100))}%`, background: color }} /></div>
      <strong>{fmt(value)}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={metricStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return <span style={{ ...statusBadgeStyle, color: tone.color, background: tone.bg, borderColor: tone.border }}>{statusLabels[status] ?? status}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div style={emptyStyle}>{text}</div>;
}

function statusTone(status: string) {
  if (status === "critical") return { color: CT.err, bg: CT.errSoft, border: "rgba(179,64,55,0.25)" };
  if (status === "warning") return { color: CT.warn, bg: CT.warnSoft, border: "rgba(184,118,28,0.25)" };
  if (status === "variable") return { color: "#9a5a17", bg: "rgba(154,90,23,0.12)", border: "rgba(154,90,23,0.22)" };
  if (status === "abundant") return { color: CT.ok, bg: CT.okSoft, border: "rgba(63,143,91,0.24)" };
  return { color: CT.info, bg: CT.infoSoft, border: "rgba(61,111,176,0.22)" };
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: CT.bg,
  color: CT.ink,
  fontFamily: CT_FONT,
};

const shellStyle: CSSProperties = {
  padding: "16px clamp(14px, 2vw, 28px) 26px",
  display: "grid",
  gap: 12,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "end",
  justifyContent: "space-between",
  gap: 18,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  color: CT.accent,
  letterSpacing: 1.3,
  textTransform: "uppercase",
  fontWeight: 850,
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 27,
  lineHeight: 1.1,
  fontWeight: 850,
  letterSpacing: 0,
};

const summaryPillsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

function summaryPillStyle(tone: "neutral" | "risk"): CSSProperties {
  return {
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: `1px solid ${tone === "risk" ? "rgba(179,64,55,0.25)" : CT.border}`,
    borderRadius: 7,
    background: tone === "risk" ? CT.errSoft : CT.surface,
    color: tone === "risk" ? CT.err : CT.inkSub,
    padding: "0 10px",
    fontSize: 12,
    fontWeight: 800,
  };
}

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "310px minmax(0, 1fr)",
  gap: 10,
  minHeight: "calc(100vh - 146px)",
};

const sidebarStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 10,
  minHeight: 0,
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "34px minmax(0, 1fr)",
};

const panelTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 12,
  fontWeight: 850,
  color: CT.ink,
};

const ghostButtonStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: CT.surfaceMuted,
  color: CT.inkSub,
  fontFamily: CT_FONT,
  fontSize: 11,
  height: 26,
  padding: "0 8px",
  cursor: "pointer",
};

const deviceListStyle: CSSProperties = {
  overflow: "auto",
  display: "grid",
  alignContent: "start",
  gap: 7,
  paddingRight: 2,
};

function deviceButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 58,
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr) 58px",
    alignItems: "center",
    gap: 8,
    border: `1px solid ${active ? CT.borderStrong : CT.border}`,
    borderRadius: 8,
    background: active ? "#fffaf4" : CT.surface,
    color: CT.ink,
    textAlign: "left",
    fontFamily: CT_FONT,
    padding: "8px 9px",
    cursor: "pointer",
  };
}

function deviceCheckStyle(active: boolean): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: `1px solid ${active ? CT.borderStrong : CT.border}`,
    color: active ? CT.accent : CT.inkMuted,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: active ? CT.accentSoft : CT.surfaceMuted,
  };
}

const deviceNameStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
};

const deviceSubStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: CT.inkMuted,
  fontSize: 10,
  marginTop: 3,
};

const deviceStockStyle: CSSProperties = {
  textAlign: "right",
  fontFamily: CT_MONO,
  fontSize: 12,
  color: CT.inkSub,
};

const mainPanelStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gridTemplateRows: "auto auto minmax(0, 1fr)",
  gap: 10,
};

const filterBarStyle: CSSProperties = {
  minHeight: 54,
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) repeat(4, 138px)",
  gap: 8,
  alignItems: "center",
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 10,
};

const searchBoxStyle: CSSProperties = {
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: CT.surfaceMuted,
  padding: "0 9px",
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 0,
  outline: 0,
  background: "transparent",
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 12,
};

const clearButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  border: 0,
  background: "transparent",
  color: CT.inkMuted,
  cursor: "pointer",
};

const selectWrapStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  color: CT.inkMuted,
  fontSize: 10,
  fontWeight: 800,
};

const selectStyle: CSSProperties = {
  height: 34,
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: CT.surface,
  color: CT.ink,
  fontFamily: CT_FONT,
  fontSize: 12,
  fontWeight: 750,
  padding: "0 8px",
  outline: "none",
};

const compareGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
  gap: 10,
  overflowX: "auto",
};

const deviceCardStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 12,
  display: "grid",
  gap: 12,
  minWidth: 190,
};

const deviceCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "start",
  fontSize: 13,
};

const barGroupStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const barRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "74px minmax(0, 1fr) 54px",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: CT.inkMuted,
};

const barTrackStyle: CSSProperties = {
  height: 7,
  borderRadius: 999,
  background: CT.surfaceMuted,
  overflow: "hidden",
};

const barFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
};

const deviceMetricsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 6,
};

const metricStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 7,
  background: CT.surfaceMuted,
  padding: "6px 7px",
  display: "grid",
  gap: 4,
  color: CT.inkMuted,
  fontSize: 10,
};

const contentGridStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 340px",
  gap: 10,
};

const tablePanelStyle: CSSProperties = {
  minHeight: 0,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 10,
  display: "grid",
  gridTemplateRows: "32px minmax(0, 1fr)",
};

const componentTableStyle: CSSProperties = {
  overflow: "auto",
  borderTop: `1px solid ${CT.border}`,
};

const tableHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  height: 34,
  display: "grid",
  gridTemplateColumns: "90px minmax(240px, 1fr) 110px 110px 92px",
  gap: 10,
  alignItems: "center",
  background: CT.surface,
  color: CT.inkMuted,
  fontSize: 10,
  fontWeight: 850,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tableRowStyle: CSSProperties = {
  minHeight: 46,
  display: "grid",
  gridTemplateColumns: "90px minmax(240px, 1fr) 110px 110px 92px",
  gap: 10,
  alignItems: "center",
  borderTop: `1px solid ${CT.border}`,
  color: CT.inkSub,
  fontSize: 12,
};

const componentCodeStyle: CSSProperties = {
  display: "block",
  color: CT.ink,
  fontFamily: CT_MONO,
  fontSize: 12,
};

const componentNameStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: CT.inkMuted,
  fontStyle: "normal",
  fontSize: 11,
  marginTop: 3,
};

const statusBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 24,
  border: "1px solid",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 850,
  padding: "0 8px",
  whiteSpace: "nowrap",
};

const insightPanelStyle: CSSProperties = {
  minHeight: 0,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  padding: 10,
  display: "grid",
  alignContent: "start",
  gap: 12,
  overflow: "auto",
};

const sharedListStyle: CSSProperties = {
  display: "grid",
  gap: 7,
};

const sharedRowStyle: CSSProperties = {
  minHeight: 54,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surfaceMuted,
  padding: 9,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
  fontSize: 12,
};

const sharedMetaStyle: CSSProperties = {
  display: "grid",
  justifyItems: "end",
  gap: 5,
};

const ruleBoxStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surfaceMuted,
  padding: 10,
  color: CT.inkSub,
  fontSize: 12,
  lineHeight: 1.35,
};

const emptyStyle: CSSProperties = {
  color: CT.inkMuted,
  fontSize: 12,
  padding: 12,
};

const loadingStyle: CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.surface,
  color: CT.inkSub,
  fontSize: 12,
  padding: "10px 12px",
  boxShadow: "0 10px 28px rgba(20,20,19,0.10)",
};

