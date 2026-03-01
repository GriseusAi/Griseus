import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageMeta } from "@/hooks/use-page-meta";
import { FolderKanban, Search } from "lucide-react";
import type { Project, ProjectAssignment } from "@shared/schema";

const statusColors: Record<string, string> = {
  planning: "bg-amber-100 text-amber-800",
  active: "bg-[#92ABBB] text-white",
  completed: "bg-emerald-100 text-emerald-800",
  on_hold: "bg-red-100 text-red-800",
};

export default function AdminProjects() {
  usePageMeta("Projects", "Manage all platform projects.");

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = projects?.filter(p => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.client.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) ?? [];

  const statuses = ["all", "active", "planning", "completed", "on_hold"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-8">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1A1A1A]">
              Projects
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {projects?.length ?? 0} total projects across the platform
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, client, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "bg-[#9F6C52] text-white"
                  : "bg-white border border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {s === "all" ? "All" : s === "on_hold" ? "On Hold" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card className="bg-white shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Client</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Location</th>
                    <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Status</th>
                    <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Progress</th>
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Trades Needed</th>
                    <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Power</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-medium">{p.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{p.client}</td>
                      <td className="py-3 px-4">{p.location}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="secondary" className={`text-[10px] font-semibold ${statusColors[p.status] || ""}`}>
                          {p.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#92ABBB] rounded-full"
                              style={{ width: `${p.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{p.progress}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(p.tradesNeeded ?? []).map(t => (
                            <Badge key={t} variant="secondary" className="text-[10px] bg-[#92ABBB]/10 text-[#92ABBB]">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center text-xs">{p.powerCapacity || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No projects match your filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
