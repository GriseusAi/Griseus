import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Braces,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  LineChart,
  Network,
  Play,
  Search,
  Sparkles,
  Workflow,
} from "lucide-react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import { apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";

type ModeId = "program" | "forecast" | "ontology";

type Product = {
  sku: string;
  name: string;
  category?: string;
  component_count?: number;
};

type CapacityResult = {
  product: string;
  maxProducible: number;
  bottlenecks: Array<{
    code: string;
    name: string;
    stock: number;
    required: number;
    maxProducts: number;
  }>;
  onDemandComponents?: Array<{ code: string; name: string; reason: string }>;
  variableComponents?: Array<{ code: string; name: string; reason: string }>;
};

type Prediction = {
  targetMonthName: string;
  targetYear: number;
  forecastedDemand: number;
  trend: string;
  canProduce: boolean;
  componentAnalysis: {
    shortages: Array<{ code: string; name: string; shortage: number; currentStock: number; required: number; unit: string }>;
  };
};

type PredictResult = {
  product: string;
  predictions: Prediction[];
  purchaseSummary: {
    totalItemsToOrder: number;
    items: Array<{ code: string; name: string; totalShortage: number; unit: string; months: string[] }>;
  };
  currentProductionCapacity: {
    maxProducible: number;
    topBottlenecks: CapacityResult["bottlenecks"];
  };
};

type PlanningResult = {
  chartSpec: {
    data: Array<{
      kind: string;
      lane?: string;
      customer?: string;
      label?: string;
      note?: string;
      risk?: boolean;
      color?: string;
      startPct?: number;
      widthPct?: number;
      durationLabel?: string;
      ticks?: Array<{ label: string; pct: number }>;
    }>;
  };
  plan: {
    title: string;
    bullets: string[];
  };
};

type RunResult = {
  capacity: CapacityResult;
  predict: PredictResult | null;
  planning: PlanningResult | null;
};

type Decision = {
  status: "ok" | "watch" | "risk";
  title: string;
  producible: number;
  blocked: number;
  maxNow: number;
  forecastDemand: number;
};

const modes: Array<{ id: ModeId; label: string; icon: typeof Play }> = [
  { id: "program", label: "Program builder", icon: Workflow },
  { id: "forecast", label: "Forecast impact", icon: LineChart },
  { id: "ontology", label: "Semantic model", icon: Network },
];

const fallbackProducts: Product[] = [
  { sku: "GSS20P", name: "GSS20P" },
  { sku: "GSA30", name: "GSA30" },
  { sku: "ELT.7-11", name: "ELT.7-11" },
  { sku: "BH.25-230", name: "BH.25-230" },
];

const semanticObjects = [
  { label: "Musteri ihtiyaci", source: "satis / teklif", fields: ["musteri", "adet", "termin", "oncelik"] },
  { label: "Urun / SKU", source: "urun master", fields: ["sku", "model", "kategori", "uretim hatti"] },
  { label: "BOM bileseni", source: "BOM + stok", fields: ["kod", "gerekli miktar", "mevcut stok", "darbogaz"] },
  { label: "Senaryo", source: "OMA program", fields: ["talep", "depo karsilama", "uretim", "risk"] },
  { label: "Aksiyon", source: "planning compute", fields: ["uretilebilir", "bloke", "tedarik", "teslim"] },
];

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function OntologyManagerPage() {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<ModeId>("program");
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [customer, setCustomer] = useState("Cukurova Isı Demo");
  const [sku, setSku] = useState("GSS20P");
  const [quantity, setQuantity] = useState(250);
  const [fromWarehouse, setFromWarehouse] = useState(25);
  const [deadline, setDeadline] = useState(addDays(21));
  const [monthsAhead, setMonthsAhead] = useState(3);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products", { credentials: "include" })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("products failed")))
      .then((rows: Product[]) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setProducts(rows);
          setSku((current) => rows.some((row) => row.sku === current) ? current : rows[0].sku);
        }
      })
      .catch(() => setProducts(fallbackProducts));
  }, []);

  const selectedProduct = useMemo(() => products.find((product) => product.sku === sku), [products, sku]);
  const toProduce = Math.max(0, quantity - fromWarehouse);
  const filteredObjects = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return semanticObjects;
    return semanticObjects.filter((item) => [item.label, item.source, ...item.fields].join(" ").toLocaleLowerCase("tr-TR").includes(q));
  }, [query]);

  const decision = useMemo<Decision | null>(() => {
    if (!result) return null;
    const maxNow = result.capacity.maxProducible;
    const producible = Math.min(toProduce, maxNow);
    const blocked = Math.max(0, toProduce - maxNow);
    const nextForecast = result.predict?.predictions[0];
    const forecastDemand = nextForecast?.forecastedDemand ?? 0;
    const status: Decision["status"] = blocked > 0 ? "risk" : forecastDemand > maxNow ? "watch" : "ok";

    return {
      status,
      producible,
      blocked,
      maxNow,
      forecastDemand,
      title: status === "risk"
        ? "Program tedarik aksiyonu olmadan kapanmiyor"
        : status === "watch"
          ? "Musteri talebi karsilaniyor, forecast kapasiteyi zorluyor"
          : "Musteri talebi kapasite icinde",
    };
  }, [result, toProduce]);

  const runProgram = async () => {
    setLoading(true);
    setError(null);
    try {
      const [capacityRes, predictRes, planningRes] = await Promise.allSettled([
        fetch(`/api/bom/${encodeURIComponent(sku)}/production-capacity`, { credentials: "include" }).then(assertJson<CapacityResult>),
        fetch(`/api/planning/predict/${encodeURIComponent(sku)}?months_ahead=${monthsAhead}`, { credentials: "include" }).then(assertJson<PredictResult>),
        apiRequest("POST", "/api/planning/compute", {
          lines: [{ id: "oma-program-1", customer, sku, quantity, deadline, fromWarehouse, toProduce }],
        }).then((res) => res.json() as Promise<PlanningResult>),
      ]);

      if (capacityRes.status === "rejected") throw capacityRes.reason;

      setResult({
        capacity: capacityRes.value,
        predict: predictRes.status === "fulfilled" ? predictRes.value : null,
        planning: planningRes.status === "fulfilled" ? planningRes.value : null,
      });
      setMode("program");
    } catch (err: any) {
      setError(err?.message ?? "Program hesaplanamadi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: CT.bg, color: CT.ink, fontFamily: CT_FONT, overflowX: "hidden" }}>
      <TopNav />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "300px minmax(0, 1fr)", minHeight: "calc(100vh - 48px)" }}>
        <aside style={{
          minWidth: 0,
          borderRight: isMobile ? "none" : `1px solid ${CT.border}`,
          borderBottom: isMobile ? `1px solid ${CT.border}` : "none",
          background: CT.bgAlt,
          padding: isMobile ? "12px 16px" : "18px 14px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <IconBox><Braces size={18} /></IconBox>
            <div>
              <div style={{ fontSize: 13, fontWeight: 650 }}>Ontology Manager</div>
              <div style={{ fontSize: 11, color: CT.inkSub }}>Need to program layer</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 4, overflowX: isMobile ? "auto" : "visible" }}>
            {modes.map((item) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button key={item.id} onClick={() => setMode(item.id)} style={navButtonStyle(active, isMobile)}>
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 18, borderTop: `1px solid ${CT.border}`, paddingTop: 16 }}>
            <div style={{ color: CT.accent, fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", marginBottom: 10 }}>
              Customer need
            </div>
            <Field label="Musteri">
              <input value={customer} onChange={(event) => setCustomer(event.target.value)} style={inputStyle} />
            </Field>
            <Field label="Urun / SKU">
              <select value={sku} onChange={(event) => setSku(event.target.value)} style={inputStyle}>
                {products.map((product) => (
                  <option key={product.sku} value={product.sku}>{product.sku} - {product.name}</option>
                ))}
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Talep">
                <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value) || 0)} style={inputStyle} />
              </Field>
              <Field label="Depodan">
                <input type="number" min={0} max={quantity} value={fromWarehouse} onChange={(event) => setFromWarehouse(Math.min(quantity, Number(event.target.value) || 0))} style={inputStyle} />
              </Field>
            </div>
            <Field label="Termin">
              <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} style={inputStyle} />
            </Field>
            <Field label="Forecast ufku">
              <select value={monthsAhead} onChange={(event) => setMonthsAhead(Number(event.target.value))} style={inputStyle}>
                <option value={2}>2 ay</option>
                <option value={3}>3 ay</option>
                <option value={6}>6 ay</option>
              </select>
            </Field>
            <button onClick={runProgram} disabled={loading || !sku || quantity <= 0} style={primaryButtonStyle(loading)}>
              <Play size={15} />
              {loading ? "Hesaplaniyor" : "Programi hesapla"}
            </button>
            {error && <div style={{ marginTop: 10, color: CT.err, fontSize: 12, lineHeight: 1.45 }}>{error}</div>}
          </div>
        </aside>

        <main style={{ minWidth: 0, padding: isMobile ? "22px 16px 48px" : "28px 34px 56px", overflow: "hidden" }}>
          <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: CT.accent, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                Griseus OMA
              </div>
              <h1 style={{ margin: 0, fontSize: isMobile ? 29 : 36, lineHeight: 1.08, letterSpacing: 0, fontWeight: 650 }}>
                Musteri ihtiyacindan uretim programi cikar
              </h1>
              <p style={{ maxWidth: 760, margin: "10px 0 0", color: CT.inkSub, fontSize: 14, lineHeight: 1.55 }}>
                OMA burada katalog degil; musteri talebini SKU, BOM, stok, kapasite, forecast ve termin baglamina baglayip uygulanabilir senaryo uretir.
              </p>
            </div>
            <Signal status={decision?.status ?? "idle"} />
          </header>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
            <Metric label="Talep" value={`x${quantity}`} />
            <Metric label="Uretilecek" value={`x${toProduce}`} />
            <Metric label="Canli kapasite" value={result ? `x${result.capacity.maxProducible}` : "-"} />
            <Metric label="Forecast" value={decision?.forecastDemand ? `x${decision.forecastDemand}` : "-"} />
          </div>

          {mode === "program" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(360px, 0.9fr)", gap: 16 }}>
              <SectionCard title="Program sonucu" icon={<ClipboardList size={16} />} right={selectedProduct?.name ?? sku}>
                {!result || !decision ? (
                  <EmptyState title="Musteri ihtiyacini gir ve programi hesapla" text="Ekran, secilen SKU icin BOM kapasitesi, forecast ve termin planini canli API'lerden hesaplayacak." />
                ) : (
                  <>
                    <DecisionBanner decision={decision} sku={sku} />
                    <StepList
                      steps={[
                        { label: "Ihtiyac yakalandi", value: `${customer} · ${sku} x${quantity} · ${deadline}` },
                        { label: "Depo ayrildi", value: `${fromWarehouse} adet bitmis stoktan karsilanir` },
                        { label: "Uretim senaryosu", value: `${decision.producible} adet simdi uretilebilir${decision.blocked > 0 ? `, ${decision.blocked} adet bloke` : ""}` },
                        { label: "Aksiyon", value: actionText(decision, result) },
                      ]}
                    />
                    {result.planning?.plan.bullets?.length ? (
                      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        {result.planning.plan.bullets.map((bullet) => <Bullet key={bullet}>{bullet}</Bullet>)}
                      </div>
                    ) : null}
                  </>
                )}
              </SectionCard>

              <SectionCard title="Darbogaz ve aksiyon" icon={<AlertTriangle size={16} />}>
                {!result ? (
                  <EmptyState title="Darbogaz henuz hesaplanmadi" text="Program calistiginda ilk kritik BOM bilesenleri burada gorunur." />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {result.capacity.bottlenecks.slice(0, 6).map((item) => (
                      <RiskRow key={item.code} code={item.code} name={item.name} value={`max x${item.maxProducts}`} meta={`stok ${item.stock} / gerekli ${item.required}`} />
                    ))}
                    {result.capacity.onDemandComponents?.slice(0, 3).map((item) => (
                      <RiskRow key={item.code} code={item.code} name={item.name} value="on-demand" meta={item.reason} soft />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Timeline" icon={<CalendarDays size={16} />}>
                <Timeline data={result?.planning?.chartSpec.data ?? []} />
              </SectionCard>

              <SectionCard title="OMA semantic chain" icon={<Network size={16} />}>
                <SemanticChain />
              </SectionCard>
            </div>
          )}

          {mode === "forecast" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 360px", gap: 16 }}>
              <SectionCard title="Forecast impact" icon={<LineChart size={16} />} right={`${monthsAhead} ay`}>
                {!result?.predict ? (
                  <EmptyState title="Forecast icin programi hesapla" text="Tahmin verisi varsa aylik talep ve parca acigi burada acilir." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    {result.predict.predictions.map((prediction) => (
                      <ForecastCard key={`${prediction.targetYear}-${prediction.targetMonthName}`} prediction={prediction} />
                    ))}
                  </div>
                )}
              </SectionCard>
              <SectionCard title="Satinalma ozeti" icon={<Database size={16} />}>
                {!result?.predict ? (
                  <EmptyState title="Eksik listesi yok" text="Forecast hesaplaninca en kritik satinalma kalemleri listelenir." />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {result.predict.purchaseSummary.items.slice(0, 8).map((item) => (
                      <RiskRow key={item.code} code={item.code} name={item.name} value={`${item.totalShortage} ${item.unit}`} meta={item.months.join(", ")} />
                    ))}
                    {result.predict.purchaseSummary.items.length === 0 && <Bullet>Forecast ufkunda BOM acigi gorunmuyor.</Bullet>}
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {mode === "ontology" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "360px minmax(0, 1fr)", gap: 16 }}>
              <SectionCard title="Semantic objects" icon={<Boxes size={16} />}>
                <SearchInput value={query} onChange={setQuery} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredObjects.map((item) => (
                    <div key={item.label} style={{ border: `1px solid ${CT.border}`, borderRadius: 8, padding: 12, background: CT.bg }}>
                      <strong style={{ fontSize: 13 }}>{item.label}</strong>
                      <div style={{ color: CT.inkSub, fontSize: 11, marginTop: 4 }}>{item.source}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>
              <SectionCard title="Program ontology" icon={<Sparkles size={16} />}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  {semanticObjects.map((item) => (
                    <Panel key={item.label} title={item.label}>
                      <div style={{ color: CT.inkSub, fontSize: 12, marginBottom: 9 }}>{item.source}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {item.fields.map((field) => <Pill key={field}>{field}</Pill>)}
                      </div>
                    </Panel>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

async function assertJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

function DecisionBanner({ decision, sku }: { decision: Decision; sku: string }) {
  const tone = decision.status === "risk" ? "risk" : decision.status === "watch" ? "watch" : "ok";
  const palette = tone === "risk"
    ? { bg: "rgba(205,66,70,0.08)", border: "rgba(205,66,70,0.28)", color: CT.err }
    : tone === "watch"
      ? { bg: "rgba(200,118,25,0.09)", border: "rgba(200,118,25,0.24)", color: CT.warn }
      : { bg: CT.okSoft, border: "rgba(63,143,91,0.28)", color: CT.ok };

  return (
    <div style={{ border: `1px solid ${palette.border}`, background: palette.bg, borderRadius: 8, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: palette.color, marginBottom: 7 }}>
        {tone === "risk" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        <strong style={{ fontSize: 14, color: CT.ink }}>{decision.title}</strong>
      </div>
      <div style={{ color: CT.inkSub, fontSize: 12, lineHeight: 1.5 }}>
        {sku}: simdi uretilebilir x{decision.producible}; bloke x{decision.blocked}; canli kapasite x{decision.maxNow}.
      </div>
    </div>
  );
}

function actionText(decision: Decision, result: RunResult) {
  if (decision.blocked > 0) {
    const first = result.capacity.bottlenecks[0];
    return first ? `${first.code} tedarik/ikame aksiyonu ac; sonra ikinci uretim fazini planla` : "Tedarik acigini kapat ve ikinci uretim fazini planla";
  }
  if (decision.forecastDemand > decision.maxNow) return "Bu siparis tamam; forecast icin satinalma buffer'i ac";
  return "Siparisi uretim planina al; ek schema degisikligi gerekmiyor";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 14 }}>
      <div style={{ color: CT.inkSub, fontSize: 11, marginBottom: 7 }}>{label}</div>
      <div style={{ fontFamily: CT_MONO, fontSize: 23 }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, icon, right, children }: { title: string; icon?: React.ReactNode; right?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 18, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ color: CT.accent, display: "inline-flex" }}>{icon}</span>}
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{title}</h2>
        </div>
        {right && <div style={{ textAlign: "right", color: CT.inkSub, fontSize: 12 }}>{right}</div>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ border: `1px dashed ${CT.border}`, borderRadius: 8, padding: 18, background: CT.bg }}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
      <div style={{ color: CT.inkSub, fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>{text}</div>
    </div>
  );
}

function StepList({ steps }: { steps: Array<{ label: string; value: string }> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
      {steps.map((step, index) => (
        <div key={step.label} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
          <div style={{ width: 24, height: 24, borderRadius: 999, background: CT.accentSoft, color: CT.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: CT_MONO, fontSize: 11 }}>
            {index + 1}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 650 }}>{step.label}</div>
            <div style={{ color: CT.inkSub, fontSize: 12, lineHeight: 1.45, marginTop: 2 }}>{step.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${CT.border}`, background: CT.bg, borderRadius: 8, padding: 11, color: CT.inkSub, fontSize: 12, lineHeight: 1.45 }}>
      {children}
    </div>
  );
}

function RiskRow({ code, name, value, meta, soft }: { code: string; name: string; value: string; meta: string; soft?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 11, background: soft ? CT.surfaceMuted : CT.bg }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: CT_MONO, fontSize: 11, color: CT.accent }}>{code}</div>
        <strong style={{ display: "block", fontSize: 12, marginTop: 3 }}>{name}</strong>
        <div style={{ color: CT.inkSub, fontSize: 11, marginTop: 4 }}>{meta}</div>
      </div>
      <div style={{ fontFamily: CT_MONO, color: soft ? CT.inkSub : CT.err, fontSize: 12, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function Timeline({ data }: { data: PlanningResult["chartSpec"]["data"] }) {
  const tasks = data.filter((item) => item.kind === "task");
  const ticks = data.find((item) => item.kind === "ticks")?.ticks ?? [];
  if (tasks.length === 0) return <EmptyState title="Timeline bekliyor" text="Program hesaplaninca depo, uretim, tedarik ve teslim fazlari burada cizilir." />;

  return (
    <div style={{ position: "relative", paddingTop: 20 }}>
      <div style={{ position: "relative", height: 18, borderBottom: `1px solid ${CT.border}`, marginBottom: 12 }}>
        {ticks.map((tick) => (
          <span key={tick.label} style={{ position: "absolute", left: `${tick.pct}%`, transform: "translateX(-50%)", color: CT.inkMuted, fontSize: 10 }}>{tick.label}</span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tasks.slice(0, 8).map((task, index) => (
          <div key={`${task.lane}-${task.label}-${index}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
              <strong style={{ fontSize: 11 }}>{task.label}</strong>
              <span style={{ color: task.risk ? CT.err : CT.inkSub, fontSize: 10 }}>{task.durationLabel}</span>
            </div>
            <div style={{ position: "relative", height: 18, borderRadius: 999, background: CT.surfaceMuted, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: `${task.startPct ?? 0}%`, width: `${task.widthPct ?? 4}%`, top: 0, bottom: 0, borderRadius: 999, background: task.color ?? CT.accent }} />
            </div>
            {task.note && <div style={{ marginTop: 4, color: CT.inkSub, fontSize: 10, lineHeight: 1.35 }}>{task.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ForecastCard({ prediction }: { prediction: Prediction }) {
  const shortages = prediction.componentAnalysis.shortages.length;
  return (
    <div style={{ border: `1px solid ${prediction.canProduce ? CT.border : "rgba(205,66,70,0.28)"}`, background: prediction.canProduce ? CT.bg : "rgba(205,66,70,0.06)", borderRadius: 8, padding: 14 }}>
      <div style={{ color: CT.accent, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase" }}>{prediction.targetMonthName} {prediction.targetYear}</div>
      <div style={{ fontFamily: CT_MONO, fontSize: 24, marginTop: 7 }}>x{prediction.forecastedDemand}</div>
      <div style={{ color: CT.inkSub, fontSize: 12, marginTop: 7 }}>{prediction.trend} trend</div>
      <div style={{ marginTop: 10, color: shortages ? CT.err : CT.ok, fontSize: 12 }}>{shortages ? `${shortages} parca acigi` : "BOM yeterli"}</div>
    </div>
  );
}

function SemanticChain() {
  const nodes = ["Musteri", "SKU", "BOM", "Forecast", "Program", "Aksiyon"];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {nodes.map((node, index) => (
        <div key={node} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Pill>{node}</Pill>
          {index < nodes.length - 1 && <ArrowRight size={14} color={CT.inkMuted} />}
        </div>
      ))}
    </div>
  );
}

function Signal({ status }: { status: "idle" | "ok" | "watch" | "risk" }) {
  const label = status === "risk" ? "Riskli" : status === "watch" ? "Izle" : status === "ok" ? "Kapasite icinde" : "Hazir";
  const color = status === "risk" ? CT.err : status === "watch" ? CT.warn : status === "ok" ? CT.ok : CT.inkSub;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${CT.border}`, borderRadius: 8, padding: "8px 10px", background: CT.surface, color, whiteSpace: "nowrap", fontSize: 12 }}>
      {status === "risk" ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
      {label}
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div style={{ position: "relative", marginBottom: 10 }}>
      <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: CT.inkMuted }} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Semantic model ara" style={{ ...inputStyle, paddingLeft: 32 }} />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${CT.border}`, borderRadius: 8, padding: 14, background: CT.bg }}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
      <div style={{ marginTop: 9 }}>{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ border: `1px solid ${CT.border}`, background: CT.surface, color: CT.inkSub, borderRadius: 999, padding: "5px 8px", fontSize: 11, lineHeight: 1 }}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", marginBottom: 6, color: CT.inkSub, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 34, height: 34, borderRadius: 8, background: CT.surface, border: `1px solid ${CT.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: CT.accent, flexShrink: 0 }}>
      {children}
    </div>
  );
}

function navButtonStyle(active: boolean, isMobile: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? CT.border : "transparent"}`,
    background: active ? CT.surface : "transparent",
    color: active ? CT.ink : CT.inkSub,
    borderRadius: 8,
    padding: "9px 10px",
    minWidth: isMobile ? 150 : "auto",
    display: "flex",
    alignItems: "center",
    gap: 9,
    fontSize: 12,
    fontFamily: CT_FONT,
    textAlign: "left",
    cursor: "pointer",
    boxShadow: active ? "0 1px 2px rgba(20,20,19,0.04)" : "none",
  };
}

function primaryButtonStyle(loading: boolean): React.CSSProperties {
  return {
    width: "100%",
    border: "none",
    borderRadius: 8,
    background: loading ? CT.surfaceMuted : CT.accent,
    color: loading ? CT.inkMuted : "#fff",
    padding: "11px 12px",
    fontFamily: CT_FONT,
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: loading ? "default" : "pointer",
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.bg,
  color: CT.ink,
  padding: "9px 10px",
  fontFamily: CT_FONT,
  fontSize: 13,
  outline: "none",
};
