import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageMeta } from "@/hooks/use-page-meta";
import { FolderKanban, Search, Wrench } from "lucide-react";
import type { Project } from "@shared/schema";

const statusColors: Record<string, string> = {
  planning: "bg-amber-500/15 text-amber-400",
  active: "bg-blue-500/15 text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  on_hold: "bg-red-500/15 text-red-400",
};

interface PhaseSummary {
  phase: { id: string; name: string; orderIndex: number };
  totalWorkers: number;
  trades: Array<{ tradeName: string; tradeId: string }>;
}

export default function AdminProjects() {
  usePageMeta("Projects", "Manage all platform projects.");
  const [, setLocation] = useLocation();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: phaseSummary } = useQuery<PhaseSummary[]>({
    queryKey: ["/api/phase-requirements/summary"],
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tradeFilter, setTradeFilter] = useState<string>("all");

  // Collect all unique trade names from phase requirements
  const allTrades = useMemo(() => {
    if (!phaseSummary) return [];
    const set = new Set<string>();
    phaseSummary.forEach(ps => ps.trades.forEach(t => set.add(t.tradeName)));
    return Array.from(set).sort();
  }, [phaseSummary]);

  // Trades needed across all phases (for the trade filter)
  const tradeToProjects = useMemo(() => {
    // Since phase requirements are global (not per-project), trade filter
    // matches projects whose tradesNeeded array includes the selected trade
    if (tradeFilter === "all" || !projects) return null;
    return new Set(
      projects
        .filter(p => (p.tradesNeeded ?? []).some(t =>
          t.toLowerCase().includes(tradeFilter.toLowerCase())
        ))
        .map(p => p.id)
    );
  }, [tradeFilter, projects]);

  const filtered = projects?.filter(p => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.client.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesTrade = !tradeToProjects || tradeToProjects.has(p.id);
    return matchesSearch && matchesStatus && matchesTrade;
  }) ?? [];

  const statuses = ["all", "active", "planning", "completed", "on_hold"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-8">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
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
        <Select value={tradeFilter} onValueChange={setTradeFilter}>
          <SelectTrigger className="w-[240px]">
            <div className="flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Filter by trade" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trades</SelectItem>
            {allTrades.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === s
                ? "bg-blue-500 text-white"
                : "bg-[#1E293B] border border-white/10 text-slate-400 hover:bg-white/5"
            }`}
          >
            {s === "all" ? "All" : s === "on_hold" ? "On Hold" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="border border-white/10">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
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
                    <tr
                      key={p.id}
                      className="border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/admin/projects/${p.id}`)}
                    >
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
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${p.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{p.progress}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(p.tradesNeeded ?? []).map(t => (
                            <Badge key={t} variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-400">
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
