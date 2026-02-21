import { useLocation, Link } from "wouter";
import { LayoutDashboard, FolderKanban, ClipboardList, Users, Smartphone, LogOut } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Work Orders", url: "/work-orders", icon: ClipboardList },
  { title: "Team", url: "/team", icon: Users },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/dashboard" data-testid="link-home">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Griseus" className="h-9 w-9 rounded-lg shadow-md" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-sidebar-foreground">Griseus</h1>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Data Center Ops</p>
            </div>
          </div>
        </Link>
        <Separator className="mt-3 bg-sidebar-border" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || location.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        <div className="rounded-lg border border-dashed border-sidebar-border p-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild data-testid="nav-mobile-app">
                <Link href="/mobile">
                  <Smartphone className="h-4 w-4" />
                  <span>Worker App</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              data-testid="button-logout"
              onClick={async () => {
                await apiRequest("POST", "/api/logout");
                queryClient.clear();
                setLocation("/");
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
