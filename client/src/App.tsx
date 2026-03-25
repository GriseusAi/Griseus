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
   │  /engine        → CEO Agent                         │
   │  /login         → Giriş                             │
   └─────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════ */

import StokDurum from "@/pages/stok-durum";
import StokHareket from "@/pages/stok-hareket";
import EnginePage from "@/pages/engine";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={StokDurum} />
        <Route path="/stok/durum" component={StokDurum} />
        <Route path="/stok/hareket" component={StokHareket} />
        <Route path="/engine" component={EnginePage} />
        <Route path="/login" component={LoginPage} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
