import { useLocation, Link } from "wouter";
import { MapPin, Shield, Users } from "lucide-react";

const tabs = [
  { title: "Jobs", url: "/mobile", icon: MapPin },
  { title: "Passport", url: "/mobile/passport", icon: Shield },
  { title: "Squad", url: "/mobile/squad", icon: Users },
];

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col h-screen w-full bg-background" data-testid="mobile-layout">
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <nav className="border-t bg-card sticky bottom-0 z-50 safe-area-bottom" data-testid="mobile-tab-bar">
        <div className="flex items-center justify-around gap-1 px-2 py-2">
          {tabs.map((tab) => {
            const isActive = location === tab.url || (tab.url !== "/mobile" && location.startsWith(tab.url));
            const isJobsActive = tab.url === "/mobile" && (location === "/mobile" || location === "/mobile/");
            const active = isActive || isJobsActive;
            return (
              <Link key={tab.title} href={tab.url}>
                <button
                  className={`flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-md transition-colors min-w-[72px] ${
                    active
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`mobile-tab-${tab.title.toLowerCase()}`}
                >
                  <tab.icon className={`h-6 w-6 ${active ? "stroke-[2.5px]" : ""}`} />
                  <span className={`text-xs font-medium ${active ? "font-semibold" : ""}`}>{tab.title}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
