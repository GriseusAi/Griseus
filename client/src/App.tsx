import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileLayout } from "@/components/mobile-layout";
import { ThemeProvider } from "@/lib/theme";
import { ProtectedRoute } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/hooks/use-user";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import OnboardingPage from "@/pages/onboarding";
import WorkerQuiz from "@/pages/quiz-worker";
import CompanyQuiz from "@/pages/quiz-company";
import Dashboard from "@/pages/dashboard";
import Analytics from "@/pages/analytics";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Team from "@/pages/team";
import MobileJobs from "@/pages/mobile-jobs";
import MobilePassport from "@/pages/mobile-passport";
import MobileSquad from "@/pages/mobile-squad";

function DesktopRouter() {
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
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/projects" component={Projects} />
          <Route path="/projects/:id" component={ProjectDetail} />
          <Route path="/team" component={Team} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function MobileRouter() {
  return (
    <MobileLayout>
      <Switch>
        <Route path="/mobile" component={MobileJobs} />
        <Route path="/mobile/passport" component={MobilePassport} />
        <Route path="/mobile/squad" component={MobileSquad} />
        <Route component={NotFound} />
      </Switch>
    </MobileLayout>
  );
}

function DesktopLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 flex-wrap p-2 border-b border-[#CEB298]/20 sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <DesktopRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthenticatedMobile() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <MobileRouter />;
}

function AppContent() {
  const [location] = useLocation();

  if (location === "/") {
    return <OnboardingPage />;
  }

  if (location === "/onboarding/worker") {
    return <WorkerQuiz />;
  }

  if (location === "/onboarding/company") {
    return <CompanyQuiz />;
  }

  if (location === "/login") {
    return <LoginPage />;
  }

  if (location === "/register") {
    return <RegisterPage />;
  }

  if (location.startsWith("/mobile")) {
    return <AuthenticatedMobile />;
  }

  return (
    <ProtectedRoute>
      <DesktopLayout />
    </ProtectedRoute>
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
