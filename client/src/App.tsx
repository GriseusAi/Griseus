import { useState, createContext, useContext, useCallback, useRef, lazy, Suspense } from "react";
import type { ProactiveAlertData } from "./lib/useStockWebSocket";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { SKUProvider } from "@/lib/sku-context";
import { ThemeProvider } from "@/lib/theme-context";
import { SelectionProvider } from "@/lib/selection-context";
import SelectionPanel from "@/components/selection-panel";
import CommandSafetyLayer from "@/components/command-safety-layer";

/* ═══════════════════════════════════════════════════════════
   GRISEUS — Single-Product Stock Intelligence

   Routes:
   ┌─────────────────────────────────────────────────────┐
   │  /              → Stok Komuta Merkezi               │
   │  /stok/hareket  → Hızlı Giriş (üretim şefi)       │
   │  /stok/urun/:sku → Ürün İstihbaratı (BOM/kapasite) │
   │  /planlama      → Prediktif Planlama (Forecast+BOM)  │
   │  /engine        → gix (redirect → panel)            │
   │  /admin         → Platform Architecture (Admin)     │
   │  /login         → Giriş                             │
   └─────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════ */

import Home from "@/pages/home";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import SceneErrorBoundary from "@/components/SceneErrorBoundary";

const AgentPanel = lazy(() => import("@/components/AgentPanel"));
const StokDurum = lazy(() => import("@/pages/stok-durum"));
const UrunIstihbarat = lazy(() => import("@/pages/urun-istihbarat"));
const AdminPage = lazy(() => import("@/pages/admin/index"));
const PalantirPage = lazy(() => import("@/pages/palantir"));
const LineAgePage = lazy(() => import("@/pages/ontology"));
const BhOntologyPage = lazy(() => import("@/pages/bh-ontology"));
const OntologySimulatePage = lazy(() => import("@/pages/ontology-simulate"));
const VeriYukle = lazy(() => import("@/pages/veri-yukle"));
const PipelineRunsPage = lazy(() => import("@/pages/pipeline-runs"));
const PipelineBuilderPage = lazy(() => import("@/pages/pipeline-builder"));
const TwinHealthPage = lazy(() => import("@/pages/twin-health"));
const DecisionLoopPage = lazy(() => import("@/pages/decision-loop"));
const OperationsPage = lazy(() => import("@/pages/operations"));
const SddiPage = lazy(() => import("@/pages/sddi"));
const WorkshopPage = lazy(() => import("@/pages/workshop"));
const StrategyCanvasPage = lazy(() => import("@/pages/strategy-canvas"));
const BhOntologyRoute = () => <BhOntologyPage />;

const PageFallback = () => <div style={{ minHeight: "100vh", background: "#f8fafc" }} />;

const StrategyCanvasGuarded = () => (
  <SceneErrorBoundary>
    <Suspense fallback={<PageFallback />}>
      <StrategyCanvasPage />
    </Suspense>
  </SceneErrorBoundary>
);

// Global agent panel context
const AgentPanelContext = createContext<{
  agentOpen: boolean;
  toggleAgent: () => void;
  prefillInput: string;
  setPrefillInput: (s: string) => void;
}>({ agentOpen: false, toggleAgent: () => {}, prefillInput: "", setPrefillInput: () => {} });

export function useAgentPanel() {
  return useContext(AgentPanelContext);
}

// Global alert context — tüm sayfalardan erişilebilir bildirim havuzu
const AlertContext = createContext<{
  alerts: ProactiveAlertData[];
  pushAlerts: (newAlerts: ProactiveAlertData[]) => void;
}>({ alerts: [], pushAlerts: () => {} });

export function useGlobalAlerts() {
  return useContext(AlertContext);
}

function App() {
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentLoaded, setAgentLoaded] = useState(false);
  const toggleAgent = useCallback(() => {
    setAgentLoaded(true);
    setAgentOpen(prev => !prev);
  }, []);
  const [prefillInput, setPrefillInput] = useState("");

  const [alerts, setAlerts] = useState<ProactiveAlertData[]>([]);
  const alertIdsRef = useRef(new Set<string>());
  const pushAlerts = useCallback((newAlerts: ProactiveAlertData[]) => {
    setAlerts(prev => {
      const unique = newAlerts.filter(a => !alertIdsRef.current.has(a.id));
      if (unique.length === 0) return prev;
      for (const a of unique) alertIdsRef.current.add(a.id);
      const merged = [...unique, ...prev];
      return merged.slice(0, 100); // max 100 bildirim tut
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <SKUProvider>
      <SelectionProvider>
      <AlertContext.Provider value={{ alerts, pushAlerts }}>
      <AgentPanelContext.Provider value={{ agentOpen, toggleAgent, prefillInput, setPrefillInput }}>
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/home" component={Home} />
            <Route path="/stok/durum" component={StokDurum} />
            <Route path="/stok/urun/:sku" component={UrunIstihbarat} />
            <Route path="/sihir" component={PalantirPage} />
            <Route path="/lineage" component={LineAgePage} />
            <Route path="/ontology" component={StrategyCanvasGuarded} />
            <Route path="/ontology/bh" component={BhOntologyRoute} />
            <Route path="/ontology/simulate" component={OntologySimulatePage} />
            <Route path="/ontology/senaryo"><Redirect to="/ontology" /></Route>
            <Route path="/ontology/strategy"><Redirect to="/ontology" /></Route>
            <Route path="/pipeline" component={PipelineRunsPage} />
            <Route path="/pipeline-builder" component={PipelineBuilderPage} />
            <Route path="/twin-health" component={TwinHealthPage} />
            <Route path="/loop" component={DecisionLoopPage} />
            <Route path="/operations" component={OperationsPage} />
            <Route path="/sddi" component={SddiPage} />
            <Route path="/workshop" component={WorkshopPage} />
            <Route path="/veri-yukle" component={VeriYukle} />
            <Route path="/login" component={LoginPage} />
            <Route path="/admin" component={AdminPage} />
            <Route component={NotFound} />
          </Switch>
          {agentLoaded && <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} />}
        </Suspense>
        <SelectionPanel />
        <CommandSafetyLayer />
        <Toaster />
      </AgentPanelContext.Provider>
      </AlertContext.Provider>
      </SelectionProvider>
      </SKUProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
