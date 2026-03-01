import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  ShieldCheck,
  Users,
  UserCheck,
  Building2,
  FolderKanban,
  Target,
} from "lucide-react";
import type { User, Worker, Project } from "@shared/schema";

interface WorkforceSummary {
  totalWorkers: number;
  availableWorkers: number;
  activeProjects: number;
  avgMatchScore: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
        </div>
        <p className="text-4xl font-extrabold tracking-tight text-[#1A1A1A]">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminOverview() {
  usePageMeta("Admin Overview", "Platform overview for administrators.");

  const { data: users, isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: summary, isLoading: loadingSummary } = useQuery<WorkforceSummary>({
    queryKey: ["/api/analytics/workforce-summary"],
  });

  const { data: projects, isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: workers, isLoading: loadingWorkers } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
  });

  const totalUsers = users?.length ?? 0;
  const workerUsers = users?.filter(u => u.role === "worker").length ?? 0;
  const companyUsers = users?.filter(u => u.role === "company").length ?? 0;

  const recentProjects = projects
    ?.filter(p => p.status === "active" || p.status === "planning")
    .slice(0, 5) ?? [];

  const recentWorkers = workers?.slice(0, 5) ?? [];

  const statusColors: Record<string, string> = {
    planning: "bg-amber-100 text-amber-800",
    active: "bg-[#92ABBB] text-white",
    completed: "bg-emerald-100 text-emerald-800",
    on_hold: "bg-red-100 text-red-800",
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-8">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1A1A1A]">
              Admin Overview
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg">
            Platform-wide metrics and recent activity at a glance.
          </p>
        </div>
      </div>

      {/* Stats */}
      {loadingSummary || loadingUsers ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-5 w-24 mb-4" /><Skeleton className="h-10 w-20" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Users} label="Total Users" value={totalUsers} accent="bg-[#92ABBB]" />
          <StatCard icon={UserCheck} label="Workers" value={summary?.totalWorkers ?? 0} accent="bg-emerald-500" />
          <StatCard icon={Building2} label="Companies" value={companyUsers} accent="bg-[#9F6C52]" />
          <StatCard icon={FolderKanban} label="Active Projects" value={summary?.activeProjects ?? 0} accent="bg-amber-500" />
          <StatCard icon={Target} label="Avg Match Score" value={`${summary?.avgMatchScore ?? 0}%`} accent="bg-indigo-500" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <Card className="bg-white shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              Recent Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingProjects ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : recentProjects.length > 0 ? (
              <div className="divide-y divide-border">
                {recentProjects.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.client} — {p.location}</p>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] font-semibold ml-2 flex-shrink-0 ${statusColors[p.status] || ""}`}>
                      {p.status.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No active projects</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Workers */}
        <Card className="bg-white shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Recent Workers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingWorkers ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : recentWorkers.length > 0 ? (
              <div className="divide-y divide-border">
                {recentWorkers.map(w => (
                  <div key={w.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{w.name}</p>
                      <p className="text-xs text-muted-foreground">{w.trade} — {w.location}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] font-semibold ml-2 flex-shrink-0 ${
                        w.available ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {w.available ? "Available" : "Unavailable"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No workers</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
