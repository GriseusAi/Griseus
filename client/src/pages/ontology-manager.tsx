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
  Workflow,
  X,
} from "lucide-react";
import TopNav from "@/components/top-nav";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import { useIsMobile } from "@/hooks/use-mobile";

type SectionId = "discover" | "objects" | "links" | "actions" | "data" | "changes";

type ObjectType = {
  id: string;
  label: string;
  domain: string;
  description: string;
  source: string;
  records: number;
  properties: string[];
  actions: string[];
};

type Proposal = {
  id: string;
  title: string;
  target: string;
  summary: string;
  status: "Draft" | "Review";
};

const objectTypes: ObjectType[] = [
  {
    id: "customer",
    label: "Musteri",
    domain: "Ticari",
    description: "Siparis, termin ve risk etkisi ureten ticari aktor.",
    source: "Satis Excel",
    records: 18,
    properties: ["unvan", "segment", "acik siparis", "teslim onceligi"],
    actions: ["siparis olustur", "teslim tarihi ata"],
  },
  {
    id: "product",
    label: "Urun / SKU",
    domain: "Uretim",
    description: "Gazli veya elektrikli nihai urun kimligi.",
    source: "Urun master + BOM",
    records: 11,
    properties: ["sku", "kategori", "model", "uretim hatti", "max uretilebilir"],
    actions: ["kapasite hesapla", "BOM bagla"],
  },
  {
    id: "component",
    label: "BOM Bileseni",
    domain: "Malzeme",
    description: "Urunu sinirlayan parca, yarimamul veya degisken komponent.",
    source: "Excel BOM + stok",
    records: 286,
    properties: ["kod", "ad", "birim", "gerekli miktar", "mevcut stok"],
    actions: ["stok duzelt", "ikame bagla"],
  },
  {
    id: "supplier",
    label: "Tedarikci",
    domain: "Tedarik",
    description: "Lead time ve tedarik riskini parca seviyesine baglar.",
    source: "Satinalma listesi",
    records: 24,
    properties: ["firma", "parca aileleri", "ortalama lead time", "gecikme skoru"],
    actions: ["termin guncelle", "alternatif kaynak ata"],
  },
  {
    id: "scenario",
    label: "Senaryo",
    domain: "Planlama",
    description: "Talep, stok ve kapasite varsayimlarini izole eder.",
    source: "Griseus scenario layer",
    records: 7,
    properties: ["talep carpani", "stok override", "kapasite override", "snapshot"],
    actions: ["simule et", "karsilastir"],
  },
  {
    id: "risk_signal",
    label: "Risk Sinyali",
    domain: "Zeka",
    description: "Darbogaz ve musteri etkisini aksiyona baglar.",
    source: "Octopus chain",
    records: 9,
    properties: ["severity", "kok neden", "etkilenen SKU", "onerilen aksiyon"],
    actions: ["bildirim ac", "aksiyon logla"],
  },
];

const linkTypes = [
  { from: "Musteri", label: "siparis eder", to: "Urun / SKU", note: "adet + teslim tarihi" },
  { from: "Urun / SKU", label: "gerektirir", to: "BOM Bileseni", note: "requiredPerUnit + tier" },
  { from: "BOM Bileseni", label: "tedarik edilir", to: "Tedarikci", note: "lead time + risk" },
  { from: "Senaryo", label: "varsayim uygular", to: "Urun / SKU", note: "ana veriyi bozmaz" },
  { from: "Risk Sinyali", label: "etkiler", to: "Musteri", note: "teslim riski" },
];

const actionTypes = [
  { label: "BOM import", target: "BOM Bileseni", guard: "kod + birim + miktar zorunlu" },
  { label: "Stok duzeltme", target: "BOM Bileseni", guard: "lineage + hareket kaydi zorunlu" },
  { label: "Kapasite simule et", target: "Senaryo", guard: "snapshot olmadan calismaz" },
  { label: "Riskten aksiyon ac", target: "Risk Sinyali", guard: "kok neden + sorumlu zorunlu" },
];

const dataConnections = [
  { label: "Urun master", owner: "Uretim", state: "Connected" },
  { label: "Excel BOM", owner: "Muhendislik", state: "Connected" },
  { label: "Stok seviyeleri", owner: "Depo", state: "Connected" },
  { label: "Stok hareketleri", owner: "Depo", state: "Connected" },
  { label: "Tedarik lead time", owner: "Satinalma", state: "Draft" },
  { label: "Satis siparisleri", owner: "Satis", state: "Draft" },
];

const sections: Array<{ id: SectionId; label: string; icon: typeof Search }> = [
  { id: "discover", label: "Discover", icon: Search },
  { id: "objects", label: "Object types", icon: Boxes },
  { id: "links", label: "Link types", icon: Network },
  { id: "actions", label: "Action types", icon: Workflow },
  { id: "data", label: "Data connections", icon: Database },
  { id: "changes", label: "Change proposals", icon: GitBranch },
];

const initialProposals: Proposal[] = [
  {
    id: "oma-1",
    title: "Map Excel BOM rows to component objects",
    target: "BOM Bileseni",
    summary: "BOM import satirlari object type + required link olarak yayinlanacak.",
    status: "Review",
  },
  {
    id: "oma-2",
    title: "Add supplier lead time relation",
    target: "Tedarikci",
    summary: "Parca aileleri tedarikci lead time verisiyle baglanacak.",
    status: "Draft",
  },
];

export default function OntologyManagerPage() {
  const isMobile = useIsMobile();
  const [section, setSection] = useState<SectionId>("objects");
  const [selectedId, setSelectedId] = useState(objectTypes[1].id);
  const [query, setQuery] = useState("");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalTarget, setProposalTarget] = useState(objectTypes[1].label);
  const [proposalSummary, setProposalSummary] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);

  const selected = useMemo(() => objectTypes.find(o => o.id === selectedId) ?? objectTypes[0], [selectedId]);
  const filteredObjects = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return objectTypes;
    return objectTypes.filter(object =>
      [object.label, object.domain, object.source, object.description].join(" ").toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [query]);

  const saveProposal = () => {
    const title = proposalTitle.trim();
    const summary = proposalSummary.trim();
    if (!title || !summary) return;
    setProposals(prev => [
      { id: `oma-${Date.now()}`, title, target: proposalTarget, summary, status: "Draft" },
      ...prev,
    ]);
    setProposalTitle("");
    setProposalSummary("");
    setProposalOpen(false);
    setSection("changes");
  };

  return (
    <div style={{ minHeight: "100vh", background: CT.bg, color: CT.ink, fontFamily: CT_FONT, overflowX: "hidden" }}>
      <TopNav />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "280px minmax(0, 1fr)", minHeight: "calc(100vh - 48px)" }}>
        <aside style={{
          minWidth: 0,
          borderRight: isMobile ? "none" : `1px solid ${CT.border}`,
          borderBottom: isMobile ? `1px solid ${CT.border}` : "none",
          background: CT.bgAlt,
          padding: isMobile ? "12px 16px" : "18px 14px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isMobile ? 14 : 18 }}>
            <IconBox><Braces size={18} /></IconBox>
            <div>
              <div style={{ fontSize: 13, fontWeight: 650 }}>Ontology Manager</div>
              <div style={{ fontSize: 11, color: CT.inkSub }}>Semantic layer</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 4, overflowX: isMobile ? "auto" : "visible", maxWidth: "100%" }}>
            {sections.map(item => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  style={{
                    border: `1px solid ${active ? CT.border : "transparent"}`,
                    background: active ? CT.surface : "transparent",
                    color: active ? CT.ink : CT.inkSub,
                    borderRadius: 8,
                    padding: "9px 10px",
                    minWidth: isMobile ? 128 : "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    fontSize: 12,
                    fontFamily: CT_FONT,
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: active ? "0 1px 2px rgba(20,20,19,0.04)" : "none",
                  }}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </aside>

        <main style={{ minWidth: 0, padding: isMobile ? "22px 16px 48px" : "28px 34px 56px", overflow: "hidden" }}>
          <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: CT.accent, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 8 }}>
                Griseus OMA
              </div>
              <h1 style={{ margin: 0, fontSize: isMobile ? 29 : 34, lineHeight: 1.1, letterSpacing: 0, fontWeight: 620 }}>
                Is modeli katalogu
              </h1>
              <p style={{ maxWidth: 720, margin: "10px 0 0", color: CT.inkSub, fontSize: 14, lineHeight: 1.55 }}>
                BOM, stok, musteri, tedarik ve senaryo kavramlari burada tanimlanir. Uygulamalar veriyi bu is dili uzerinden okur.
              </p>
            </div>
            <button
              onClick={() => setProposalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${CT.accentEdge}`,
                background: CT.accentSoft,
                color: CT.accent,
                borderRadius: 8,
                padding: isMobile ? "9px 10px" : "9px 12px",
                fontFamily: CT_FONT,
                fontSize: 12,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Plus size={14} />
              {isMobile ? "New" : "New proposal"}
            </button>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
            <Metric label="Objects" value={objectTypes.length} />
            <Metric label="Links" value={linkTypes.length} />
            <Metric label="Actions" value={actionTypes.length} />
            <Metric label="Proposals" value={proposals.length} />
          </div>

          {section === "discover" && (
            <SectionCard title="Discover" icon={<Search size={16} />}>
              <SearchInput value={query} onChange={setQuery} />
              <ObjectGrid objects={filteredObjects} selectedId={selected.id} onSelect={(id) => { setSelectedId(id); setSection("objects"); }} />
            </SectionCard>
          )}

          {section === "objects" && (
            <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "360px minmax(0, 1fr)", gap: 16 }}>
              <SectionCard title="Object types" icon={<Boxes size={16} />}>
                <SearchInput value={query} onChange={setQuery} />
                <ObjectList objects={filteredObjects} selectedId={selected.id} onSelect={setSelectedId} />
              </SectionCard>

              <SectionCard title={selected.label} eyebrow={`${selected.domain} object`} right={selected.source}>
                <p style={{ margin: "0 0 14px", color: CT.inkSub, fontSize: 13, lineHeight: 1.55 }}>{selected.description}</p>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <Panel title="Properties" icon={<ListChecks size={15} />}>
                    {selected.properties.map(property => <Pill key={property}>{property}</Pill>)}
                  </Panel>
                  <Panel title="Actions" icon={<Workflow size={15} />}>
                    {selected.actions.map(action => <Pill key={action}>{action}</Pill>)}
                  </Panel>
                </div>
              </SectionCard>
            </section>
          )}

          {section === "links" && (
            <SectionCard title="Link types" icon={<Network size={16} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {linkTypes.map(link => (
                  <div key={`${link.from}-${link.to}`} style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "150px 150px 1fr",
                    gap: 10,
                    alignItems: "center",
                    border: `1px solid ${CT.border}`,
                    borderRadius: 8,
                    padding: 12,
                    background: CT.bg,
                  }}>
                    <strong style={{ fontSize: 13 }}>{link.from}</strong>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: CT.accent, fontSize: 12 }}>
                      {link.label}<ArrowRight size={13} />
                    </span>
                    <div>
                      <strong style={{ fontSize: 13 }}>{link.to}</strong>
                      <div style={{ color: CT.inkSub, fontSize: 11, marginTop: 3 }}>{link.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === "actions" && (
            <SectionCard title="Action types" icon={<Workflow size={16} />}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                {actionTypes.map(action => (
                  <div key={action.label} style={{ border: `1px solid ${CT.border}`, borderRadius: 8, padding: 14, background: CT.bg }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <strong style={{ fontSize: 13 }}>{action.label}</strong>
                      <span style={{ fontSize: 11, color: CT.inkMuted }}>{action.target}</span>
                    </div>
                    <div style={{ fontFamily: CT_MONO, color: CT.accent, fontSize: 11 }}>{action.guard}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === "data" && (
            <SectionCard title="Data connections" icon={<Database size={16} />}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {dataConnections.map(source => (
                  <div key={source.label} style={{ border: `1px solid ${CT.border}`, borderRadius: 8, padding: 14, background: CT.bg }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <strong style={{ fontSize: 13 }}>{source.label}</strong>
                      <StatusPill state={source.state} />
                    </div>
                    <div style={{ color: CT.inkSub, fontSize: 12 }}>{source.owner}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {section === "changes" && (
            <SectionCard title="Change proposals" icon={<GitBranch size={16} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {proposals.map(proposal => (
                  <div key={proposal.id} style={{ border: `1px solid ${CT.border}`, borderRadius: 8, padding: 14, background: CT.bg }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong style={{ fontSize: 13 }}>{proposal.title}</strong>
                      <StatusPill state={proposal.status} />
                    </div>
                    <div style={{ color: CT.inkSub, fontSize: 12, lineHeight: 1.5 }}>{proposal.summary}</div>
                    <div style={{ color: CT.accent, fontFamily: CT_MONO, fontSize: 10, marginTop: 8 }}>{proposal.target}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </main>
      </div>

      {proposalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(20,20,19,0.18)",
          display: "flex",
          justifyContent: "flex-end",
          zIndex: 200,
        }}>
          <div style={{
            width: isMobile ? "100%" : 430,
            height: "100%",
            background: CT.surface,
            borderLeft: `1px solid ${CT.border}`,
            boxShadow: "-12px 0 32px rgba(20,20,19,0.12)",
            padding: 22,
            boxSizing: "border-box",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ color: CT.accent, fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase" }}>Proposal</div>
                <h2 style={{ margin: "6px 0 0", fontSize: 22 }}>Schema change draft</h2>
              </div>
              <button onClick={() => setProposalOpen(false)} style={iconButtonStyle} aria-label="Close proposal">
                <X size={16} />
              </button>
            </div>

            <Field label="Title">
              <input value={proposalTitle} onChange={e => setProposalTitle(e.target.value)} style={inputStyle} placeholder="Example: add supplier risk score" />
            </Field>

            <Field label="Target object">
              <select value={proposalTarget} onChange={e => setProposalTarget(e.target.value)} style={inputStyle}>
                {objectTypes.map(object => <option key={object.id}>{object.label}</option>)}
              </select>
            </Field>

            <Field label="Summary">
              <textarea value={proposalSummary} onChange={e => setProposalSummary(e.target.value)} style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} placeholder="What changes in the business model?" />
            </Field>

            <button onClick={saveProposal} disabled={!proposalTitle.trim() || !proposalSummary.trim()} style={{
              marginTop: 10,
              width: "100%",
              border: "none",
              borderRadius: 8,
              padding: "11px 12px",
              background: proposalTitle.trim() && proposalSummary.trim() ? CT.accent : CT.surfaceMuted,
              color: proposalTitle.trim() && proposalSummary.trim() ? "#fff" : CT.inkMuted,
              fontFamily: CT_FONT,
              cursor: proposalTitle.trim() && proposalSummary.trim() ? "pointer" : "default",
            }}>
              Save draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 14 }}>
      <div style={{ color: CT.inkSub, fontSize: 11, marginBottom: 7 }}>{label}</div>
      <div style={{ fontFamily: CT_MONO, fontSize: 24 }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, eyebrow, icon, right, children }: {
  title: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ background: CT.surface, border: `1px solid ${CT.border}`, borderRadius: 8, padding: 18, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div>
          {eyebrow && <div style={{ color: CT.accent, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>{eyebrow}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {icon && <span style={{ color: CT.accent, display: "inline-flex" }}>{icon}</span>}
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{title}</h2>
          </div>
        </div>
        {right && <div style={{ textAlign: "right", color: CT.inkSub, fontSize: 12 }}>{right}</div>}
      </div>
      {children}
    </section>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div style={{ position: "relative", marginBottom: 10 }}>
      <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: CT.inkMuted }} />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="Search ontology"
        style={{ ...inputStyle, paddingLeft: 32 }}
      />
    </div>
  );
}

function ObjectList({ objects, selectedId, onSelect }: { objects: ObjectType[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {objects.map(object => (
        <button
          key={object.id}
          onClick={() => onSelect(object.id)}
          style={{
            border: `1px solid ${selectedId === object.id ? CT.borderStrong : "transparent"}`,
            background: selectedId === object.id ? CT.surfaceHover : "transparent",
            color: CT.ink,
            borderRadius: 7,
            padding: "10px",
            fontFamily: CT_FONT,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ fontSize: 13 }}>{object.label}</strong>
            <span style={{ color: CT.inkMuted, fontSize: 10 }}>{object.records}</span>
          </div>
          <div style={{ marginTop: 4, color: CT.inkSub, fontSize: 11 }}>{object.domain} · {object.source}</div>
        </button>
      ))}
    </div>
  );
}

function ObjectGrid({ objects, selectedId, onSelect }: { objects: ObjectType[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
      {objects.map(object => (
        <button
          key={object.id}
          onClick={() => onSelect(object.id)}
          style={{
            border: `1px solid ${selectedId === object.id ? CT.borderStrong : CT.border}`,
            background: selectedId === object.id ? CT.surfaceHover : CT.bg,
            borderRadius: 8,
            padding: 14,
            textAlign: "left",
            fontFamily: CT_FONT,
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 650, color: CT.ink }}>{object.label}</div>
          <div style={{ fontSize: 11, color: CT.inkSub, marginTop: 5 }}>{object.description}</div>
        </button>
      ))}
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

function StatusPill({ state }: { state: string }) {
  const active = state === "Connected" || state === "Review";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      border: `1px solid ${active ? "rgba(63,143,91,0.28)" : CT.border}`,
      background: active ? CT.okSoft : CT.surfaceMuted,
      color: active ? CT.ok : CT.inkSub,
      borderRadius: 999,
      padding: "3px 7px",
      fontSize: 10,
      whiteSpace: "nowrap",
    }}>
      {active && <CheckCircle2 size={11} />}
      {state}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", marginBottom: 6, color: CT.inkSub, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
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
      flexShrink: 0,
    }}>
      {children}
    </div>
  );
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

const iconButtonStyle: React.CSSProperties = {
  border: `1px solid ${CT.border}`,
  borderRadius: 8,
  background: CT.bg,
  color: CT.inkSub,
  width: 34,
  height: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
