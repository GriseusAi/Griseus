import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cpu,
  Network,
  Search,
  SlidersHorizontal,
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

type ProjectionDomain = "device" | "component" | "risk";
type ChartKind = "combo" | "bar" | "line" | "area" | "table";
type XAxisMode = "name" | "category" | "risk";
type LineStyle = "smooth" | "solid" | "step" | "dash";
type MetricKey =
  | "warehouse"
  | "capacity"
  | "production"
  | "sold"
  | "critical"
  | "warnings"
  | "componentCount"
  | "componentStock"
  | "requiredPerUnit"
  | "deviceCount";

type DeviceView = {
  sku: string;
  name: string;
  category: string;
  componentCount: number;
  warehouse: number;
  production: number;
  sold: number;
  updatedAt: string;
  ageDays: number | null;
  critical: number;
  warnings: number;
  capacity: number;
};

type ProjectionRow = {
  id: string;
  label: string;
  category: string;
  risk: string;
  domain: ProjectionDomain;
  source: string;
  fields: Partial<Record<MetricKey, number>>;
};

const metricDefs: Record<MetricKey, { label: string; color: string; domains: ProjectionDomain[]; mode: "bar" | "line" }> = {
  warehouse: { label: "Depo", color: "#f4a340", domains: ["device"], mode: "bar" },
  capacity: { label: "Uretilebilir", color: "#4775db", domains: ["device"], mode: "bar" },
  production: { label: "Uretimde", color: "#9b73df", domains: ["device"], mode: "bar" },
  sold: { label: "Satilan", color: "#22232b", domains: ["device"], mode: "bar" },
  critical: { label: "Kritik", color: "#ef7d70", domains: ["device", "component", "risk"], mode: "line" },
  warnings: { label: "Risk", color: "#f2a65a", domains: ["device", "component", "risk"], mode: "line" },
  componentCount: { label: "Bilesen", color: "#4bb7ad", domains: ["device", "risk"], mode: "line" },
  componentStock: { label: "Stok", color: "#68c75f", domains: ["component"], mode: "bar" },
  requiredPerUnit: { label: "BOM miktari", color: "#78a6ff", domains: ["component"], mode: "line" },
  deviceCount: { label: "Cihaz sayisi", color: "#d9b36a", domains: ["component", "risk"], mode: "bar" },
};

const domainMetrics: Record<ProjectionDomain, MetricKey[]> = {
  device: ["warehouse", "capacity", "critical"],
  component: ["componentStock", "requiredPerUnit", "deviceCount", "critical"],
  risk: ["deviceCount", "critical", "warnings", "componentCount"],
};

export default function OntologyLayersPage() {
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<"devices" | "groups">("devices");
  const [groupDomain, setGroupDomain] = useState<Exclude<ProjectionDomain, "device">>("component");
  const [chartKind, setChartKind] = useState<ChartKind>("combo");
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>("name");
  const [lineStyle, setLineStyle] = useState<LineStyle>("smooth");
  const [activeMetrics, setActiveMetrics] = useState<MetricKey[]>(domainMetrics.device);
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const domain: ProjectionDomain = workspaceTab === "devices" ? "device" : groupDomain;

  const productsQuery = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const stockLevelsQuery = useQuery<StockLevel[]>({ queryKey: ["/api/stock/levels"] });
  const products = productsQuery.data ?? [];
  const stockLevels = stockLevelsQuery.data ?? [];
  const activeSkus = selectedSkus.length > 0 ? selectedSkus : products.slice(0, 6).map(product => product.sku);

  const bomQueries = useQueries({
    queries: activeSkus.map(sku => ({
      queryKey: [`/api/bom/${encodeURIComponent(sku)}/stock`],
      queryFn: async () => {
        const res = await fetch(`/api/bom/${encodeURIComponent(sku)}/stock`);
        if (!res.ok) throw new Error(`${sku} BOM okunamadi`);
        return res.json() as Promise<BomResponse>;
      },
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
  }, [activeSkus.join("|"), bomQueries.map(queryItem => queryItem.dataUpdatedAt).join("|")]);

  const components = useMemo(() => {
    const rows: FlatComponent[] = [];
    for (const sku of activeSkus) {
      const product = productBySku.get(sku);
      const bom = bomBySku.get(sku);
      bom?.components.forEach(component => {
        rows.push(...flattenComponent(component, sku, product?.name || sku, component.code));
      });
    }
    return rows;
  }, [activeSkus.join("|"), bomBySku, productBySku]);

  const devices = useMemo<DeviceView[]>(() => {
    return activeSkus.map(sku => {
      const product = productBySku.get(sku);
      const stock = stockBySku.get(sku);
      const deviceComponents = components.filter(component => component.sku === sku);
      const capacity = minNumber(deviceComponents.map(component => component.maxProducts).filter((value): value is number => value !== null)) ?? 0;
      return {
        sku,
        name: product?.name || stock?.productName || sku,
        category: product?.category || stock?.productCategory || "-",
        componentCount: Number(product?.component_count ?? deviceComponents.length ?? 0),
        warehouse: Number(stock?.inWarehouse ?? 0),
        production: Number(stock?.inProduction ?? 0),
        sold: Number(stock?.totalSold ?? 0),
        updatedAt: stock?.updatedAt || "",
        ageDays: stock?.updatedAt ? daysSince(stock.updatedAt) : null,
        critical: deviceComponents.filter(component => component.status === "critical").length,
        warnings: deviceComponents.filter(component => component.status === "warning").length,
        capacity,
      };
    });
  }, [activeSkus.join("|"), productBySku, stockBySku, components]);

  const projectionRows = useMemo(() => {
    const rows = buildProjectionRows(domain, devices, components);
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter(row => riskFilter === "all" || row.risk === riskFilter)
      .filter(row => !needle || `${row.label} ${row.category} ${row.source}`.toLocaleLowerCase("tr-TR").includes(needle))
      .slice(0, 40);
  }, [domain, devices, components, query, riskFilter]);

  const availableMetrics = useMemo(() => {
    return Object.entries(metricDefs)
      .filter(([, def]) => def.domains.includes(domain))
      .map(([key]) => key as MetricKey);
  }, [domain]);

  const selectedMetrics = activeMetrics.filter(metric => availableMetrics.includes(metric));
  const metrics = selectedMetrics.length > 0 ? selectedMetrics : domainMetrics[domain];
  const loading = productsQuery.isLoading || stockLevelsQuery.isLoading || bomQueries.some(queryItem => queryItem.isLoading);

  function changeWorkspace(nextTab: "devices" | "groups") {
    const nextDomain = nextTab === "devices" ? "device" : groupDomain;
    setWorkspaceTab(nextTab);
    setActiveMetrics(domainMetrics[nextDomain]);
    setXAxisMode("name");
    setRiskFilter("all");
  }

  function changeGroupDomain(nextDomain: Exclude<ProjectionDomain, "device">) {
    setGroupDomain(nextDomain);
    setActiveMetrics(domainMetrics[nextDomain]);
    setXAxisMode("name");
    setRiskFilter("all");
  }

  return (
    <div style={pageStyle}>
      <TopNav />
      <main style={shellStyle}>
        <aside style={deviceRailStyle}>
          <div style={railHeaderStyle}>
            <div>
              <strong>Cihaz seti</strong>
              <span>{activeSkus.length} secili</span>
            </div>
            <button type="button" onClick={() => setSelectedSkus([])} style={smallButtonStyle}>Sifirla</button>
          </div>
          <div style={deviceListStyle}>
            {products.map(product => {
              const active = activeSkus.includes(product.sku);
              const stock = stockBySku.get(product.sku);
              return (
                <button key={product.sku} type="button" onClick={() => toggleSku(product.sku, selectedSkus, setSelectedSkus, products)} style={deviceButtonStyle(active)}>
                  <span style={checkStyle(active)}>{active ? <CheckCircle2 size={13} /> : null}</span>
                  <span style={{ minWidth: 0 }}>
                    <strong>{product.sku}</strong>
                    <small>{product.name}</small>
                  </span>
                  <b>{fmt(stock?.inWarehouse ?? 0)}</b>
                </button>
              );
            })}
          </div>
        </aside>

        <section style={workspaceStyle}>
          <section style={builderStyle}>
            <div style={builderTitleStyle}>
              <Network size={18} />
              <div>
                <span>Ontology</span>
                <strong>Cihazlar ve seçili f(x) grupları</strong>
              </div>
            </div>

            <div style={workspaceSwitchStyle}>
              {(["devices", "groups"] as const).map(item => (
                <button key={item} type="button" onClick={() => changeWorkspace(item)} style={workspaceButtonStyle(workspaceTab === item)}>
                  {item === "devices" ? "Cihazlar" : "Ontology grupları"}
                </button>
              ))}
            </div>

            {workspaceTab === "groups" && (
              <div style={groupSwitchStyle}>
                <button type="button" onClick={() => changeGroupDomain("component")} style={groupButtonStyle(groupDomain === "component")}>Bileşen</button>
                <button type="button" onClick={() => changeGroupDomain("risk")} style={groupButtonStyle(groupDomain === "risk")}>Risk</button>
              </div>
            )}

            <div style={builderGridStyle}>
              <label style={fieldStyle}>
                <span>Search</span>
                <div style={searchBoxStyle}>
                  <Search size={15} />
                  <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Kod, cihaz veya bilesen ara" />
                  {query && <button type="button" onClick={() => setQuery("")}><X size={13} /></button>}
                </div>
              </label>
              <label style={fieldStyle}>
                <span>Risk</span>
                <select value={riskFilter} onChange={event => setRiskFilter(event.target.value)}>
                  <option value="all">Hepsi</option>
                  <option value="critical">Kritik</option>
                  <option value="warning">Risk</option>
                  <option value="ok">Yeterli</option>
                </select>
              </label>
            </div>

            <div style={metricStripStyle}>
              {availableMetrics.map(metric => (
                <button
                  key={metric}
                  type="button"
                  onClick={() => setActiveMetrics(current => toggleMetric(current, metric))}
                  style={metricButtonStyle(metrics.includes(metric), metricDefs[metric].color)}
                >
                  <span />
                  {metricDefs[metric].label}
                </button>
              ))}
            </div>
          </section>

          <section style={chartPanelStyle}>
            <div style={chartHeaderStyle}>
              <div>
                <strong>{workspaceTab === "devices" ? "Cihazlar" : "Ontology f(x) grupları"}</strong>
                <span>{projectionRows.length} satir · {metrics.length} metric</span>
              </div>
              <div style={summaryStyle}>
                <Summary icon={<Boxes size={15} />} label="Cihaz" value={activeSkus.length} />
                <Summary icon={<Cpu size={15} />} label="Bilesen" value={components.length} />
                <Summary icon={<AlertTriangle size={15} />} label="Kritik" value={components.filter(row => row.status === "critical").length} tone="risk" />
              </div>
            </div>

            <div style={controlDeckStyle}>
              <Segmented values={["combo", "bar", "line", "area", "table"] as ChartKind[]} value={chartKind} onChange={setChartKind} labels={{ combo: "Combo", bar: "Bar", line: "Line", area: "Area", table: "Table" }} />
              <label style={compactSelectStyle}>
                <span>X</span>
                <select value={xAxisMode} onChange={event => setXAxisMode(event.target.value as XAxisMode)}>
                  <option value="name">Isim</option>
                  <option value="category">Kategori</option>
                  <option value="risk">Risk</option>
                </select>
              </label>
              <label style={compactSelectStyle}>
                <span>Line</span>
                <select value={lineStyle} onChange={event => setLineStyle(event.target.value as LineStyle)}>
                  <option value="smooth">Smooth</option>
                  <option value="solid">Solid</option>
                  <option value="step">Step</option>
                  <option value="dash">Dash</option>
                </select>
              </label>
              <button type="button" onClick={() => setActiveMetrics(domainMetrics[domain])} style={resetChartButtonStyle}>
                <SlidersHorizontal size={14} />
                Reset
              </button>
            </div>

            <FiscalChart rows={projectionRows} metrics={metrics} chartKind={chartKind} xAxisMode={xAxisMode} lineStyle={lineStyle} />
          </section>
        </section>
      </main>
      {loading && <div style={loadingStyle}>Gercek cihaz, stok ve BOM verisi okunuyor.</div>}
    </div>
  );
}

function buildProjectionRows(domain: ProjectionDomain, devices: DeviceView[], components: FlatComponent[]): ProjectionRow[] {
  if (domain === "device") {
    return devices.map(device => ({
      id: device.sku,
      label: device.sku,
      category: device.category,
      risk: device.critical > 0 ? "critical" : device.warnings > 0 ? "warning" : "ok",
      domain,
      source: device.name,
      fields: {
        warehouse: device.warehouse,
        capacity: device.capacity,
        production: device.production,
        sold: device.sold,
        critical: device.critical,
        warnings: device.warnings,
        componentCount: device.componentCount,
      },
    }));
  }

  if (domain === "component") {
    const byCode = new Map<string, ProjectionRow & { names: Set<string> }>();
    components.forEach(component => {
      const current = byCode.get(component.code) ?? {
        id: component.code,
        label: component.code,
        category: component.unit || "-",
        risk: component.status === "critical" ? "critical" : component.status === "warning" ? "warning" : "ok",
        domain,
        source: component.name,
        fields: { componentStock: Number.POSITIVE_INFINITY, requiredPerUnit: 0, deviceCount: 0, critical: 0 },
        names: new Set<string>(),
      };
      current.names.add(component.sku);
      current.source = component.name;
      current.risk = severityRank(component.status) > severityRank(current.risk) ? component.status : current.risk;
      current.fields.componentStock = Math.min(Number(current.fields.componentStock ?? 0), Number(component.currentStock ?? 0));
      current.fields.requiredPerUnit = Math.max(Number(current.fields.requiredPerUnit ?? 0), Number(component.requiredPerUnit ?? 0));
      current.fields.critical = Number(current.fields.critical ?? 0) + (component.status === "critical" ? 1 : 0);
      byCode.set(component.code, current);
    });
    return Array.from(byCode.values())
      .map(row => ({ ...row, fields: { ...row.fields, deviceCount: row.names.size, componentStock: row.fields.componentStock === Number.POSITIVE_INFINITY ? 0 : row.fields.componentStock } }))
      .sort((a, b) => severityRank(b.risk) - severityRank(a.risk) || Number(a.fields.componentStock ?? 0) - Number(b.fields.componentStock ?? 0));
  }

  const groups = new Map<string, ProjectionRow>();
  components.forEach(component => {
    const key = component.status === "critical" ? "Kritik" : component.status === "warning" ? "Risk" : "Yeterli";
    const current = groups.get(key) ?? {
      id: key,
      label: key,
      category: "Risk",
      risk: component.status === "critical" ? "critical" : component.status === "warning" ? "warning" : "ok",
      domain,
      source: "BOM risk projection",
      fields: { deviceCount: 0, critical: 0, warnings: 0, componentCount: 0 },
    };
    current.fields.componentCount = Number(current.fields.componentCount ?? 0) + 1;
    current.fields.critical = Number(current.fields.critical ?? 0) + (component.status === "critical" ? 1 : 0);
    current.fields.warnings = Number(current.fields.warnings ?? 0) + (component.status === "warning" ? 1 : 0);
    current.fields.deviceCount = Math.max(Number(current.fields.deviceCount ?? 0), components.filter(row => row.status === component.status).map(row => row.sku).filter((sku, index, arr) => arr.indexOf(sku) === index).length);
    groups.set(key, current);
  });
  return Array.from(groups.values()).sort((a, b) => severityRank(b.risk) - severityRank(a.risk));
}

function FiscalChart({ rows, metrics, chartKind, xAxisMode, lineStyle }: {
  rows: ProjectionRow[];
  metrics: MetricKey[];
  chartKind: ChartKind;
  xAxisMode: XAxisMode;
  lineStyle: LineStyle;
}) {
  if (chartKind === "table") return <ProjectionTable rows={rows} metrics={metrics} />;

  const width = 1100;
  const height = 420;
  const pad = { top: 34, right: 34, bottom: 58, left: 58 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const chartRows = groupRows(rows, metrics, xAxisMode).slice(0, 14);
  const max = Math.max(1, ...chartRows.flatMap(row => metrics.map(metric => Number(row.fields[metric] ?? 0))));
  const slot = innerW / Math.max(1, chartRows.length);
  const barMetrics = metrics.filter(metric => chartKind === "bar" || (chartKind === "combo" && metricDefs[metric].mode === "bar"));
  const lineMetrics = metrics.filter(metric => chartKind === "line" || chartKind === "area" || (chartKind === "combo" && metricDefs[metric].mode === "line"));
  const barW = Math.min(30, slot / Math.max(1, barMetrics.length + 1));

  return (
    <div style={fiscalChartWrapStyle}>
      <svg viewBox={`0 0 ${width} ${height}`} style={fiscalSvgStyle} preserveAspectRatio="none">
        <rect width={width} height={height} fill="#27262f" />
        {Array.from({ length: 7 }).map((_, index) => {
          const y = pad.top + (innerH / 6) * index;
          return <line key={index} x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(222,226,235,0.16)" />;
        })}
        {chartRows.map((row, index) => {
          const x = pad.left + slot * index + slot / 2;
          return (
            <g key={row.id}>
              <line x1={x} x2={x} y1={pad.top} y2={height - pad.bottom} stroke="rgba(222,226,235,0.08)" />
              <text x={x} y={height - 24} fill="#aeb1bd" fontSize="12" textAnchor="middle">{row.label.length > 13 ? `${row.label.slice(0, 12)}…` : row.label}</text>
            </g>
          );
        })}
        {barMetrics.map((metric, metricIndex) => {
          const def = metricDefs[metric];
          return chartRows.map((row, rowIndex) => {
            const value = Number(row.fields[metric] ?? 0);
            const h = (value / max) * innerH;
            const x = pad.left + slot * rowIndex + slot / 2 - (barMetrics.length * barW) / 2 + metricIndex * barW;
            const y = pad.top + innerH - h;
            return <rect key={`${metric}-${row.id}`} x={x} y={y} width={barW * 0.76} height={Math.max(2, h)} rx="3" fill={def.color} />;
          });
        })}
        {lineMetrics.map(metric => {
          const def = metricDefs[metric];
          const points = chartRows.map((row, index) => ({
            x: pad.left + slot * index + slot / 2,
            y: pad.top + innerH - (Number(row.fields[metric] ?? 0) / max) * innerH,
          }));
          const path = linePath(points, lineStyle);
          const areaPath = points.length > 0 ? `M ${points[0].x} ${pad.top + innerH} L ${path.replace(/^M /, "")} L ${points[points.length - 1].x} ${pad.top + innerH} Z` : "";
          return (
            <g key={metric}>
              {chartKind === "area" && areaPath && <path d={areaPath} fill={def.color} opacity="0.18" />}
              <path d={path} fill="none" stroke={def.color} strokeWidth="2.4" strokeDasharray={lineStyle === "dash" ? "8 6" : undefined} />
              {points.map(point => <circle key={`${metric}-${point.x}`} cx={point.x} cy={point.y} r="3.2" fill={def.color} />)}
            </g>
          );
        })}
      </svg>
      <div style={legendStyle}>
        {metrics.map(metric => <span key={metric}><i style={{ background: metricDefs[metric].color }} />{metricDefs[metric].label}</span>)}
      </div>
    </div>
  );
}

function ProjectionTable({ rows, metrics }: { rows: ProjectionRow[]; metrics: MetricKey[] }) {
  return (
    <div style={tableWrapStyle}>
      <div style={tableRowStyle(true)}>
        <span>Object</span>
        <span>Domain</span>
        <span>Risk</span>
        {metrics.map(metric => <span key={metric}>{metricDefs[metric].label}</span>)}
      </div>
      {rows.slice(0, 28).map(row => (
        <div key={row.id} style={tableRowStyle(false)}>
          <strong>{row.label}</strong>
          <span>{row.category}</span>
          <span style={riskTextStyle(row.risk)}>{riskLabel(row.risk)}</span>
          {metrics.map(metric => <span key={metric}>{fmt(row.fields[metric] ?? 0)}</span>)}
        </div>
      ))}
    </div>
  );
}

function groupRows(rows: ProjectionRow[], metrics: MetricKey[], mode: XAxisMode) {
  if (mode === "name") return rows;
  const map = new Map<string, ProjectionRow>();
  rows.forEach(row => {
    const label = mode === "category" ? row.category : riskLabel(row.risk);
    const current = map.get(label) ?? { ...row, id: label, label, fields: {} };
    metrics.forEach(metric => {
      current.fields[metric] = Number(current.fields[metric] ?? 0) + Number(row.fields[metric] ?? 0);
    });
    map.set(label, current);
  });
  return Array.from(map.values());
}

function flattenComponent(component: BomComponent, sku: string, productName: string, path: string): FlatComponent[] {
  const row: FlatComponent = { ...component, sku, productName, path };
  return [row, ...(component.children ?? []).flatMap(child => flattenComponent(child, sku, productName, `${path}/${child.code}`))];
}

function toggleSku(sku: string, selectedSkus: string[], setSelectedSkus: (next: string[]) => void, products: Product[]) {
  const defaults = products.slice(0, 6).map(product => product.sku);
  const current = selectedSkus.length > 0 ? selectedSkus : defaults;
  const next = current.includes(sku) ? current.filter(item => item !== sku) : [...current, sku];
  setSelectedSkus(next.slice(0, 10));
}

function toggleMetric(current: MetricKey[], metric: MetricKey) {
  if (current.includes(metric)) return current.length === 1 ? current : current.filter(item => item !== metric);
  return [...current, metric].slice(-6);
}

function linePath(points: Array<{ x: number; y: number }>, style: LineStyle) {
  if (points.length === 0) return "";
  if (style === "step") {
    return points.slice(1).reduce((path, point, index) => {
      const previous = points[index];
      const mid = (previous.x + point.x) / 2;
      return `${path} L ${mid} ${previous.y} L ${mid} ${point.y} L ${point.x} ${point.y}`;
    }, `M ${points[0].x} ${points[0].y}`);
  }
  if (style === "smooth") {
    return points.slice(1).reduce((path, point, index) => {
      const previous = points[index];
      const cx = (previous.x + point.x) / 2;
      return `${path} C ${cx} ${previous.y}, ${cx} ${point.y}, ${point.x} ${point.y}`;
    }, `M ${points[0].x} ${points[0].y}`);
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function minNumber(values: number[]) {
  return values.length === 0 ? null : Math.min(...values);
}

function daysSince(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function severityRank(status: string) {
  if (status === "critical") return 4;
  if (status === "warning") return 3;
  if (status === "ok" || status === "abundant") return 2;
  return 1;
}

function riskLabel(status: string) {
  if (status === "critical") return "Kritik";
  if (status === "warning") return "Risk";
  return "Yeterli";
}

function fmt(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}

function Summary({ icon, label, value, tone = "normal" }: { icon: React.ReactNode; label: string; value: number; tone?: "normal" | "risk" }) {
  return (
    <div style={summaryPillStyle(tone)}>
      {icon}
      <span>{label}</span>
      <strong>{fmt(value)}</strong>
    </div>
  );
}

function Segmented<T extends string>({ values, value, onChange, labels }: { values: T[]; value: T; onChange: (value: T) => void; labels: Record<T, string> }) {
  return (
    <div style={segmentedStyle}>
      {values.map(item => (
        <button key={item} type="button" onClick={() => onChange(item)} style={segmentButtonStyle(value === item)}>{labels[item]}</button>
      ))}
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f5f3ee",
  color: CT.ink,
  fontFamily: CT_FONT,
};

const shellStyle: CSSProperties = {
  height: "calc(100vh - 49px)",
  display: "grid",
  gridTemplateColumns: "292px minmax(0, 1fr)",
  overflow: "hidden",
  borderTop: `1px solid ${CT.border}`,
};

const deviceRailStyle: CSSProperties = {
  background: "#fffdf8",
  borderRight: `1px solid ${CT.border}`,
  padding: 16,
  overflow: "auto",
};

const railHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  fontSize: 14,
};

const smallButtonStyle: CSSProperties = {
  border: `1px solid ${CT.border}`,
  background: "#f1eee7",
  borderRadius: 7,
  padding: "6px 10px",
  fontWeight: 800,
  color: CT.inkMuted,
  cursor: "pointer",
};

const deviceListStyle: CSSProperties = {
  display: "grid",
  gap: 9,
};

const deviceButtonStyle = (active: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  border: `1px solid ${active ? "#e6b49f" : CT.border}`,
  background: active ? "#fff8f3" : "#fff",
  borderRadius: 8,
  padding: 11,
  color: CT.ink,
  textAlign: "left",
  cursor: "pointer",
  boxShadow: active ? "0 1px 0 rgba(157, 90, 54, 0.16)" : "none",
});

const checkStyle = (active: boolean): CSSProperties => ({
  width: 20,
  height: 20,
  borderRadius: 6,
  border: `1px solid ${active ? "#e39d7e" : CT.border}`,
  color: "#c56745",
  display: "grid",
  placeItems: "center",
  background: active ? "#fde9df" : "#f3f0ea",
});

const workspaceStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  overflow: "hidden",
};

const builderStyle: CSSProperties = {
  background: "#eef3f5",
  borderBottom: `1px solid ${CT.border}`,
  padding: "14px 18px",
  display: "grid",
  gridTemplateColumns: "240px 320px minmax(280px, 1fr)",
  gap: 12,
  alignItems: "center",
};

const builderTitleStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  color: "#33554f",
};

const workspaceSwitchStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  background: "#ffffff",
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  padding: 4,
};

const workspaceButtonStyle = (active: boolean): CSSProperties => ({
  border: 0,
  borderRadius: 6,
  background: active ? "#2f5d50" : "transparent",
  color: active ? "#fff" : CT.inkMuted,
  padding: "9px 10px",
  fontWeight: 850,
  cursor: "pointer",
});

const groupSwitchStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 6,
};

const groupButtonStyle = (active: boolean): CSSProperties => ({
  height: 34,
  border: `1px solid ${active ? "#2f5d50" : CT.border}`,
  borderRadius: 7,
  background: active ? "#eef7f3" : "#fff",
  color: active ? "#2f5d50" : CT.inkMuted,
  fontWeight: 850,
  cursor: "pointer",
});

const builderGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) 130px",
  gap: 10,
  alignItems: "end",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 11,
  fontWeight: 850,
  color: CT.inkMuted,
};

const searchBoxStyle: CSSProperties = {
  height: 34,
  border: `1px solid ${CT.border}`,
  background: "#fff",
  borderRadius: 7,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 9px",
};

const metricStripStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const metricButtonStyle = (active: boolean, color: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: `1px solid ${active ? color : CT.border}`,
  background: active ? "#fff" : "#f7f5f0",
  color: active ? CT.ink : CT.inkMuted,
  borderRadius: 7,
  height: 30,
  padding: "0 11px",
  fontWeight: 850,
  cursor: "pointer",
});

const chartPanelStyle: CSSProperties = {
  minHeight: 0,
  margin: 16,
  background: "#27262f",
  border: "1px solid #1e1e25",
  display: "grid",
  gridTemplateRows: "auto auto minmax(0, 1fr)",
  overflow: "hidden",
  boxShadow: "0 16px 40px rgba(27, 28, 36, 0.16)",
};

const chartHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  padding: "12px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  color: "#f2f1ee",
};

const summaryStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const summaryPillStyle = (tone: "normal" | "risk"): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: `1px solid ${tone === "risk" ? "rgba(239,125,112,0.55)" : "rgba(255,255,255,0.12)"}`,
  background: tone === "risk" ? "rgba(239,125,112,0.12)" : "rgba(255,255,255,0.05)",
  borderRadius: 7,
  padding: "7px 10px",
  color: tone === "risk" ? "#ffb3a8" : "#d9dae0",
  fontSize: 12,
  fontWeight: 800,
});

const controlDeckStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  background: "#302f39",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const segmentedStyle: CSSProperties = {
  display: "inline-flex",
  background: "#1d1d24",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 7,
  padding: 3,
};

const segmentButtonStyle = (active: boolean): CSSProperties => ({
  border: 0,
  borderRadius: 5,
  height: 30,
  minWidth: 58,
  padding: "0 12px",
  background: active ? "#4f9a60" : "transparent",
  color: active ? "#fff" : "#c3c4cc",
  fontWeight: 850,
  cursor: "pointer",
});

const compactSelectStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  color: "#c3c4cc",
  fontSize: 12,
  fontWeight: 850,
};

const resetChartButtonStyle: CSSProperties = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  height: 32,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#3a3944",
  color: "#e7e7ec",
  borderRadius: 7,
  padding: "0 11px",
  fontWeight: 850,
  cursor: "pointer",
};

const fiscalChartWrapStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "minmax(360px, 1fr) auto",
};

const fiscalSvgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
};

const legendStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  padding: "10px 16px 14px",
  color: "#d9dae0",
  fontSize: 12,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const tableWrapStyle: CSSProperties = {
  overflow: "auto",
  padding: 14,
};

const tableRowStyle = (header: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr .8fr repeat(6, minmax(88px, 1fr))",
  gap: 10,
  minWidth: 900,
  padding: "10px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  color: header ? "#f2f1ee" : "#cfd0d8",
  fontWeight: header ? 900 : 650,
  fontSize: 12,
});

const riskTextStyle = (risk: string): CSSProperties => ({
  color: risk === "critical" ? "#ff9b8f" : risk === "warning" ? "#f5bd72" : "#9dd69c",
  fontWeight: 900,
});

const loadingStyle: CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  background: "#27262f",
  color: "#f8f7f4",
  borderRadius: 8,
  padding: "10px 13px",
  fontWeight: 850,
  boxShadow: "0 14px 34px rgba(20,20,19,0.18)",
};

const globalInputStyle = `
  select, input { font: inherit; }
  ${""}
`;

void globalInputStyle;
