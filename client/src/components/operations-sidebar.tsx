import { useLocation, Link } from "wouter";
import { Factory, Users, DollarSign, LogOut } from "lucide-react";
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
  { title: "Production Intelligence", url: "/operations", icon: Factory },
  { title: "Workforce Scheduling", url: "/operations/scheduling", icon: Users },
  { title: "Financial Simulation", url: "/operations/finance", icon: DollarSign },
];

export function OperationsSidebar() {
  const [location, setLocation] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/operations">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Griseus" className="h-10 w-10 rounded-lg shadow-md" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-sidebar-foreground">Griseus</h1>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Operations Panel</p>
            </div>
          </div>
        </Link>
        <Separator className="mt-4 bg-sidebar-border" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.url === "/operations"
                    ? location === "/operations"
                    : location === item.url || location.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
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
