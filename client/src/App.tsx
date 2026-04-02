import { useState, createContext, useContext, useCallback } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import AgentPanel from "@/components/AgentPanel";

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
import OntologyPage from "@/pages/ontology";

// Global agent panel context
const AgentPanelContext = createContext<{
  agentOpen: boolean;
  toggleAgent: () => void;
}>({ agentOpen: false, toggleAgent: () => {} });

export function useAgentPanel() {
  return useContext(AgentPanelContext);
}

function App() {
  const [agentOpen, setAgentOpen] = useState(false);
  const toggleAgent = useCallback(() => setAgentOpen(prev => !prev), []);

  return (
    <QueryClientProvider client={queryClient}>
      <AgentPanelContext.Provider value={{ agentOpen, toggleAgent }}>
        <Switch>
          <Route path="/" component={StokDurum} />
          <Route path="/stok/durum" component={StokDurum} />
          <Route path="/stok/urun/:sku" component={UrunIstihbarat} />
          <Route path="/sihir" component={PalantirPage} />
          <Route path="/ontology" component={OntologyPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/admin" component={AdminPage} />
          <Route component={NotFound} />
        </Switch>
        <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} />
        <Toaster />
      </AgentPanelContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
