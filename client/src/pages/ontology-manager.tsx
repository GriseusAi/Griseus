import { useMemo, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Braces,
  CheckCircle2,
  Database,
  GitBranch,
  ListChecks,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import { useIsMobile } from "@/hooks/use-mobile";

type ObjectType = {
  id: string;
  label: string;
  domain: string;
  description: string;
  count: string;
  source: string;
  properties: string[];
  actions: string[];
};

type LinkType = {
  from: string;
  to: string;
  label: string;
  description: string;
};

type ActionType = {
  label: string;
  target: string;
  description: string;
  guard: string;
};

const objectTypes: ObjectType[] = [
  {
    id: "customer",
    label: "Musteri",
    domain: "Ticari",
    description: "Siparis, teslim tarihi ve risk etkisi ureten ticari aktor.",
    count: "aktif hesaplar",
    source: "CRM / satis Excel",
    properties: ["unvan", "segment", "teslim onceligi", "acik siparis", "risk toleransi"],
    actions: ["siparis olustur", "teslim tarihi ata", "senaryoya dahil et"],
  },
  {
    id: "product",
    label: "Urun / SKU",
    domain: "Uretim",
    description: "Gazli, elektrikli veya yarimamullu nihai urun kimligi.",
    count: "SKU ailesi",
    source: "Urun master + BOM",
    properties: ["sku", "kategori", "model", "uretim hattı", "max uretilebilir"],
    actions: ["kapasite hesapla", "BOM bagla", "alternatif parca oner"],
  },
  {
    id: "component",
    label: "BOM Bileseni",
    domain: "Malzeme",
    description: "Urunu sinirlayan parca, yarimamul veya degisken komponent.",
    count: "BOM satirlari",
    source: "Excel BOM + stok import",
    properties: ["kod", "ad", "birim", "gerekli miktar", "mevcut stok", "lead time"],
    actions: ["stok duzelt", "tedarik riski ac", "ikame bagla"],
  },
  {
    id: "supplier",
    label: "Tedarikci",
    domain: "Tedarik",
    description: "Lead time, kalite ve teslimat riskini semantik modele tasir.",
    count: "tedarikci kaydi",
    source: "satinalma listesi",
    properties: ["firma", "parca aileleri", "ortalama lead time", "gecikme skoru"],
    actions: ["termin guncelle", "alternatif kaynak ata"],
  },
  {
    id: "scenario",
    label: "Senaryo",
    domain: "Planlama",
    description: "Talep, stok, kapasite ve termin varsayimlarini izole eder.",
    count: "kayitli varsayim",
    source: "Griseus scenario layer",
    properties: ["talep carpani", "stok override", "kapasite override", "teslim tarihi"],
    actions: ["simule et", "karsilastir", "aksiyon planina cevir"],
  },
  {
    id: "risk_signal",
    label: "Risk Sinyali",
    domain: "Zeka",
    description: "Darbogaz, stok erimesi ve musteri etkisini aksiyona baglar.",
    count: "aktif sinyal",
    source: "Octopus chain + capacity engine",
    properties: ["severity", "kok neden", "etkilenen SKU", "onerilen aksiyon"],
    actions: ["bildirim ac", "gix'e gonder", "aksiyon logla"],
  },
];

const linkTypes: LinkType[] = [
  { from: "Musteri", to: "Urun / SKU", label: "siparis eder", description: "Adet ve teslim tarihi edge uzerinde tutulur." },
  { from: "Urun / SKU", to: "BOM Bileseni", label: "gerektirir", description: "requiredPerUnit, tier ve yarimamul bilgisi link semantigidir." },
  { from: "BOM Bileseni", to: "Tedarikci", label: "tedarik edilir", description: "Lead time ve tedarik riski parca bazinda izlenir." },
  { from: "Senaryo", to: "Urun / SKU", label: "varsayim uygular", description: "Talep ve kapasite override'lari ana veriyi bozmadan calisir." },
  { from: "Risk Sinyali", to: "Musteri", label: "etkiler", description: "Darbogazin hangi musteri teslimini riske attigi gorunur." },
];

const actionTypes: ActionType[] = [
  {
    label: "BOM import proposal",
    target: "BOM Bileseni",
    description: "Excel satirlarini object/link tiplerine map eder, publish onayi bekler.",
    guard: "kod + birim + requiredPerUnit zorunlu",
  },
  {
    label: "Stok duzeltme",
    target: "BOM Bileseni",
    description: "Kullanici editini lineage ve hareket kaydi ile baglar.",
    guard: "negatif stok icin gerekce zorunlu",
  },
  {
    label: "Kapasite simule et",
    target: "Senaryo",
    description: "Talep, stok ve tedarik varsayimlarindan darboğaz listesi uretir.",
    guard: "snapshot id olmadan calismaz",
  },
  {
    label: "Aksiyon planina cevir",
    target: "Risk Sinyali",
    description: "Risk sinyalini sorumlu, tarih ve takip metriği olan is kaydina cevirir.",
    guard: "kok neden + etkilenen SKU zorunlu",
  },
];

const dataConnections = [
  "Urun master",
  "Excel BOM",
  "Stok seviyeleri",
  "Stok hareketleri",
  "Tedarik lead time",
  "Satis / musteri siparisleri",
];

const sections = [
  { id: "discover", label: "Discover", icon: Search },
  { id: "objects", label: "Object types", icon: Boxes },
  { id: "links", label: "Link types", icon: Network },
  { id: "actions", label: "Action types", icon: Workflow },
  { id: "data", label: "Data connections", icon: Database },
  { id: "changes", label: "Change proposals", icon: GitBranch },
];

export default function OntologyManagerPage() {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState(objectTypes[1].id);
  const selected = useMemo(() => objectTypes.find(o => o.id === selectedId) ?? objectTypes[0], [selectedId]);

  return (
    <div style={{ minHeight: "100vh", background: CT.bg, color: CT.ink, fontFamily: CT_FONT, overflowX: "hidden" }}>
      <TopNav />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "260px minmax(0, 1fr)", minHeight: "calc(100vh - 48px)" }}>
        <aside style={{
          minWidth: 0,
          borderRight: isMobile ? "none" : `1px solid ${CT.border}`,
          borderBottom: isMobile ? `1px solid ${CT.border}` : "none",
          background: CT.bgAlt,
          padding: isMobile ? "14px 16px" : "18px 14px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: CT.surface,
              border: `1px solid ${CT.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: CT.accent,
            }}>
              <Braces size={18} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Ontology Manager</div>
              <div style={{ fontSize: 11, color: CT.inkSub }}>Cukurova semantic layer</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 4, overflowX: isMobile ? "auto" : "visible", maxWidth: "100%" }}>
            {sections.map(section => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  style={{
                    border: "none",
                    background: section.id === "objects" ? CT.surface : "transparent",
                    color: section.id === "objects" ? CT.ink : CT.inkSub,
                    borderRadius: 8,
                    padding: "9px 10px",
                    minWidth: isMobile ? 128 : "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    fontSize: 12,
                    fontFamily: CT_FONT,
                    textAlign: "left",
                    cursor: "default",
                    boxShadow: section.id === "objects" ? "0 1px 2px rgba(20,20,19,0.04)" : "none",
                  }}
                >
                  <Icon size={15} />
                  {section.label}
                </button>
              );
            })}
          </div>
        </aside>

        <main style={{ minWidth: 0, padding: isMobile ? "24px 16px 48px" : "30px 34px 56px", overflow: "hidden" }}>
          <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 11, color: CT.accent, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 10 }}>
                Semantic Layer
              </div>
              <h1 style={{ margin: 0, fontSize: isMobile ? 30 : 36, lineHeight: 1.1, letterSpacing: 0, fontWeight: 560 }}>
                Is modelini veri modelinden ayir
              </h1>
              <p style={{ maxWidth: 720, margin: "12px 0 0", color: CT.inkSub, fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere" }}>
                Griseus OMA, Cukurova Isi'nin BOM, stok, musteri, tedarik ve senaryo kavramlarini tek bir is ontolojisi olarak tanimlar. Uygulamalar bu katmani okur; Excel ve API'ler sadece kaynak olur.
              </p>
            </div>
            {!isMobile && (
              <button style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${CT.accentEdge}`,
                background: CT.accentSoft,
                color: CT.accent,
                borderRadius: 8,
                padding: "9px 12px",
                fontFamily: CT_FONT,
                fontSize: 12,
                cursor: "default",
              }}>
                <Plus size={14} />
                New proposal
              </button>
            )}
          </header>

          <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
            {[
              ["Object types", objectTypes.length],
              ["Link types", linkTypes.length],
              ["Action types", actionTypes.length],
              ["Data sources", dataConnections.length],
            ].map(([label, value]) => (
              <div key={label} style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ color: CT.inkSub, fontSize: 11, marginBottom: 8 }}>{label}</div>
                <div style={{ fontFamily: CT_MONO, fontSize: 26, color: CT.ink }}>{value}</div>
              </div>
            ))}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "360px 1fr", gap: 16, marginBottom: 18 }}>
            <div style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${CT.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <Boxes size={16} color={CT.accent} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Object type catalog</span>
              </div>
              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {objectTypes.map(object => (
                  <button
                    key={object.id}
                    onClick={() => setSelectedId(object.id)}
                    style={{
                      border: `1px solid ${selected.id === object.id ? CT.borderStrong : "transparent"}`,
                      background: selected.id === object.id ? CT.surfaceHover : "transparent",
                      color: CT.ink,
                      borderRadius: 7,
                      padding: "11px 10px",
                      fontFamily: CT_FONT,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 560 }}>{object.label}</span>
                      <span style={{ color: CT.inkMuted, fontSize: 10 }}>{object.domain}</span>
                    </div>
                    <div style={{ marginTop: 4, color: CT.inkSub, fontSize: 11, lineHeight: 1.4 }}>{object.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
                <div>
                  <div style={{ color: CT.accent, fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 6 }}>
                    Object type view
                  </div>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 560 }}>{selected.label}</h2>
                  <p style={{ margin: "8px 0 0", color: CT.inkSub, lineHeight: 1.55, fontSize: 13 }}>{selected.description}</p>
                </div>
                <div style={{ textAlign: "right", minWidth: 120 }}>
                  <div style={{ fontSize: 10, color: CT.inkMuted }}>Connected source</div>
                  <div style={{ fontSize: 12, color: CT.ink, marginTop: 4 }}>{selected.source}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <Panel title="Properties" icon={<ListChecks size={15} />}>
                  {selected.properties.map(property => <Pill key={property}>{property}</Pill>)}
                </Panel>
                <Panel title="Action types" icon={<Workflow size={15} />}>
                  {selected.actions.map(action => <Pill key={action}>{action}</Pill>)}
                </Panel>
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.8fr", gap: 16 }}>
            <div style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Network size={16} color={CT.accent} />
                <h3 style={{ margin: 0, fontSize: 15 }}>Link type graph</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {linkTypes.map(link => (
                  <div key={`${link.from}-${link.to}-${link.label}`} style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "140px 120px 1fr",
                    gap: 10,
                    alignItems: "center",
                    border: `1px solid ${CT.border}`,
                    borderRadius: 8,
                    padding: 12,
                    background: CT.bg,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 560 }}>{link.from}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: CT.accent, fontSize: 11 }}>
                      {link.label}
                      <ArrowRight size={13} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 560 }}>{link.to}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: CT.inkSub }}>{link.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <Database size={16} color={CT.accent} />
                  <h3 style={{ margin: 0, fontSize: 15 }}>Data connections</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {dataConnections.map(source => (
                    <div key={source} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: CT.inkSub }}>
                      <CheckCircle2 size={14} color={CT.ok} />
                      {source}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <ShieldCheck size={16} color={CT.accent} />
                  <h3 style={{ margin: 0, fontSize: 15 }}>Publish guardrails</h3>
                </div>
                {actionTypes.map(action => (
                  <div key={action.label} style={{ borderTop: `1px solid ${CT.border}`, padding: "10px 0" }}>
                    <div style={{ fontSize: 12, fontWeight: 560 }}>{action.label}</div>
                    <div style={{ color: CT.inkSub, fontSize: 11, marginTop: 3 }}>{action.description}</div>
                    <div style={{ color: CT.accent, fontSize: 10, marginTop: 5, fontFamily: CT_MONO }}>{action.guard}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${CT.border}`, borderRadius: 8, padding: 14, background: CT.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: CT.accent, fontSize: 12, marginBottom: 10 }}>
        {icon}
        <span style={{ color: CT.ink, fontWeight: 560 }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      border: `1px solid ${CT.border}`,
      background: CT.surface,
      color: CT.inkSub,
      borderRadius: 999,
      padding: "5px 8px",
      fontSize: 11,
      lineHeight: 1,
    }}>
      {children}
    </span>
  );
}
