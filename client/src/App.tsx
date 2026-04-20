import { useState, createContext, useContext, useCallback, useRef } from "react";
import type { ProactiveAlertData } from "./lib/useStockWebSocket";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import AgentPanel from "@/components/AgentPanel";
import { SKUProvider } from "@/lib/sku-context";

/* ═══════════════════════════════════════════════════════════
   GRISEUS — Single-Product Stock Intelligence

   Routes:
   ┌─────────────────────────────────────────────────────┐
   │  /              → Stok Komuta Merkezi               │
   │  /stok/hareket  → Hızlı Giriş (üretim şefi)       │
   │  /stok/urun/:sku → Ürün İstihbaratı (BOM/kapasite) │
   │  /planlama      → Prediktif Planlama (Forecast+BOM)  │
   │  /engine        → CEO Agent (redirect → panel)      │
   │  /admin         → Platform Architecture (Admin)     │
   │  /login         → Giriş                             │
   └─────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════ */

import StokDurum from "@/pages/stok-durum";
import UrunIstihbarat from "@/pages/urun-istihbarat";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import AdminPage from "@/pages/admin/index";
import PalantirPage from "@/pages/palantir";
import LineAgePage from "@/pages/ontology"; // lineage force-graph sayfası
import BhOntologyPage from "@/pages/bh-ontology";
import VeriYukle from "@/pages/veri-yukle";

// Global agent panel context
const AgentPanelContext = createContext<{
  agentOpen: boolean;
  toggleAgent: () => void;
}>({ agentOpen: false, toggleAgent: () => {} });

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
      <SKUProvider>
      <AlertContext.Provider value={{ alerts, pushAlerts }}>
      <AgentPanelContext.Provider value={{ agentOpen, toggleAgent }}>
        <Switch>
          <Route path="/" component={StokDurum} />
          <Route path="/stok/durum" component={StokDurum} />
          <Route path="/stok/urun/:sku" component={UrunIstihbarat} />
          <Route path="/sihir" component={PalantirPage} />
          <Route path="/lineage" component={LineAgePage} />
          <Route path="/ontology" component={BhOntologyPage} />
          <Route path="/veri-yukle" component={VeriYukle} />
          <Route path="/login" component={LoginPage} />
          <Route path="/admin" component={AdminPage} />
          <Route component={NotFound} />
        </Switch>
        <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} />
        <Toaster />
      </AgentPanelContext.Provider>
      </AlertContext.Provider>
      </SKUProvider>
    </QueryClientProvider>
  );
}

export default App;
