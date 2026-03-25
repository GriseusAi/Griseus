import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";

/* ═══════════════════════════════════════════════════════════
   GRISEUS — Manufacturing Intelligence Platform

   Core routes (Palantir-aligned):
   ┌─────────────────────────────────────────────────────┐
   │  /              → Stok Komuta Merkezi (hub)         │
   │  /stok/hareket  → Operasyon Paneli (quick entry)    │
   │  /engine        → AI Agent (CEO Danışman)           │
   │  /ontology      → Ontoloji Haritası (graph view)    │
   │  /intelligence  → Stok İstihbarat (analytics)       │
   │  /product/:code → Ürün Detay (object detail)        │
   └─────────────────────────────────────────────────────┘

   Everything else is secondary or legacy.
   ═══════════════════════════════════════════════════════════ */

// ── Core pages (manufacturing intelligence)
import StokDurum from "@/pages/stok-durum";
import StokHareket from "@/pages/stok-hareket";
import EnginePage from "@/pages/engine";
import OntologyMap from "@/pages/ontology-map";
import IntelligencePage from "@/pages/intelligence";
import ProductDetail from "@/pages/product-detail";

import UrunIstihbarat from "@/pages/urun-istihbarat";

// ── Secondary pages (kept for compatibility, not in main nav)
import CukurovaOverview from "@/pages/cukurova-overview";
import CukurovaSim from "@/pages/cukurova-sim";
import ProductionFlow from "@/pages/production-flow";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ForgotPasswordPage from "@/pages/forgot-password";

function AppContent() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <Switch>
          {/* ── Core Manufacturing Routes ── */}
          <Route path="/" component={StokDurum} />
          <Route path="/stok/durum" component={StokDurum} />
          <Route path="/stok/hareket" component={StokHareket} />
          <Route path="/engine" component={EnginePage} />
          <Route path="/ontology" component={OntologyMap} />
          <Route path="/intelligence" component={IntelligencePage} />
          <Route path="/product/:productCode" component={ProductDetail} />
          <Route path="/stok/urun/:sku" component={UrunIstihbarat} />

          {/* ── Secondary Routes (compatibility) ── */}
          <Route path="/cukurova" component={CukurovaOverview} />
          <Route path="/cukurova-sim" component={CukurovaSim} />
          <Route path="/production-flow" component={ProductionFlow} />

          {/* ── Auth ── */}
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
          <Route path="/forgot-password" component={ForgotPasswordPage} />

          {/* ── Fallback → Command Center ── */}
          <Route>{() => <Redirect to="/" />}</Route>
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
