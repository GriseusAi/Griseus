import { useState, createContext, useContext, useCallback, useRef } from "react";
import type { ProactiveAlertData } from "./lib/useStockWebSocket";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import AgentPanel from "@/components/AgentPanel";
import { SKUProvider } from "@/lib/sku-context";
import { ThemeProvider } from "@/lib/theme-context";
import { SelectionProvider } from "@/lib/selection-context";
import SelectionPanel from "@/components/selection-panel";

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
import StokDurum from "@/pages/stok-durum";
import UrunIstihbarat from "@/pages/urun-istihbarat";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import AdminPage from "@/pages/admin/index";
import PalantirPage from "@/pages/palantir";
import LineAgePage from "@/pages/ontology"; // lineage force-graph sayfası
import BhOntologyPage from "@/pages/bh-ontology";
import OntologySimulatePage from "@/pages/ontology-simulate";
import StrategyCanvasPage from "@/pages/strategy-canvas";
import VeriYukle from "@/pages/veri-yukle";
import PipelineRunsPage from "@/pages/pipeline-runs";
import TwinHealthPage from "@/pages/twin-health";
import DecisionLoopPage from "@/pages/decision-loop";
import OperationsPage from "@/pages/operations";
import SddiPage from "@/pages/sddi";
import WorkshopPage from "@/pages/workshop";

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
  const toggleAgent = useCallback(() => setAgentOpen(prev => !prev), []);
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
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/home" component={Home} />
          <Route path="/stok/durum" component={StokDurum} />
          <Route path="/stok/urun/:sku" component={UrunIstihbarat} />
          <Route path="/sihir" component={PalantirPage} />
          <Route path="/lineage" component={LineAgePage} />
          <Route path="/ontology" component={StrategyCanvasPage} />
          <Route path="/ontology/bh" component={BhOntologyPage} />
          <Route path="/ontology/simulate" component={OntologySimulatePage} />
          <Route path="/ontology/strategy"><Redirect to="/ontology" /></Route>
          <Route path="/pipeline" component={PipelineRunsPage} />
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
        <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} />
        <SelectionPanel />
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
