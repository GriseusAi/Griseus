import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

/* ═══════════════════════════════════════════════════════════
   GRISEUS — Single-Product Stock Intelligence

   Routes:
   ┌─────────────────────────────────────────────────────┐
   │  /              → Stok Komuta Merkezi               │
   │  /stok/hareket  → Hızlı Giriş (üretim şefi)       │
   │  /stok/urun/:sku → Ürün İstihbaratı (BOM/kapasite) │
   │  /planlama      → Prediktif Planlama (Forecast+BOM)  │
   │  /engine        → CEO Agent                         │
   │  /admin         → Platform Architecture (Admin)     │
   │  /login         → Giriş                             │
   └─────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════ */

import StokDurum from "@/pages/stok-durum";
import UrunIstihbarat from "@/pages/urun-istihbarat";
import EnginePage from "@/pages/engine";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import AdminPage from "@/pages/admin/index";
import PalantirPage from "@/pages/palantir";
import OntologyPage from "@/pages/ontology";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={StokDurum} />
        <Route path="/stok/durum" component={StokDurum} />
        <Route path="/stok/urun/:sku" component={UrunIstihbarat} />
        <Route path="/sihir" component={PalantirPage} />
        <Route path="/ontology" component={OntologyPage} />
        <Route path="/engine" component={EnginePage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
