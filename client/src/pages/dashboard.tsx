import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageMeta } from "@/hooks/use-page-meta";
import { apiRequest } from "@/lib/queryClient";
import {
  Zap,
  FolderKanban,
  Users,
  Sparkles,
  ArrowRight,
  MapPin,
  Wrench,
} from "lucide-react";
import type { Project, Worker } from "@shared/schema";

interface WorkerMatchResult {
  worker: Worker;
  score: { total: number };
  matchedTrade: string;
  alreadyAssigned: boolean;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score > 75
      ? "bg-emerald-50 text-emerald-700"
      : score >= 50
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";
  return (
    <Badge variant="secondary" className={color}>
      {score}% match
    </Badge>
  );
}

export default function Dashboard() {
  usePageMeta(
    "Dashboard",
    "Find skilled workers for your data center projects with AI-powered matching."
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<WorkerMatchResult[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [, setLocation] = useLocation();

  const { data: projects, isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  const { data: workers, isLoading: loadingWorkers } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
  });

  const isLoading = loadingProjects || loadingWorkers;
  const availableWorkers = workers?.filter((w) => w.available).length || 0;

  async function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setMatchLoading(true);
    setMatchResults(null);
    try {
      const res = await apiRequest("POST", "/api/matching/workers-for-project", {
        projectId,
      });
      const data = await res.json();
      setMatchResults(data);
    } catch {
      setMatchResults([]);
    } finally {
      setMatchLoading(false);
    }
  }

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  const statusColors: Record<string, string> = {
    planning: "bg-warning/15 text-warning",
    active: "bg-primary/15 text-primary",
    completed: "bg-success/15 text-success",
    on_hold: "bg-destructive/15 text-destructive",
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Hero Section */}
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">
              Find Skilled Workers for Your Data Center Project
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg">
            AI-powered matching connects your projects with verified, certified
            professionals
          </p>
          {!isLoading && (
            <div className="flex items-center gap-4 mt-6">
              <div className="flex items-center gap-2 rounded-lg bg-background/50 border px-4 py-2">
                <FolderKanban className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-lg font-bold leading-none">
                    {projects?.length || 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Total Projects
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-background/50 border px-4 py-2">
                <Users className="h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-lg font-bold leading-none">
                    {availableWorkers}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Available Workers
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-background/50 border px-4 py-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-lg font-bold leading-none">
                    {projects?.filter((p) => p.status === "active").length || 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Active Matches
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick-Start: Select a Project */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Select a Project to Match Workers</h2>
        {loadingProjects ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-40 mb-2" />
                  <Skeleton className="h-4 w-28 mb-2" />
                  <Skeleton className="h-5 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className={`cursor-pointer transition-all hover:border-primary/50 ${
                  selectedProjectId === project.id
                    ? "border-primary ring-1 ring-primary/30"
                    : ""
                }`}
                onClick={() => handleSelectProject(project.id)}
                data-testid={`project-card-${project.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm truncate">{project.name}</p>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${statusColors[project.status] || ""}`}
                    >
                      {project.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <MapPin className="h-3 w-3" /> {project.location}
                  </p>
                  {project.tradesNeeded && project.tradesNeeded.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {project.tradesNeeded.map((trade) => (
                        <Badge
                          key={trade}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {trade}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No projects yet</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI Match Preview */}
      {selectedProjectId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Match Preview{" "}
              {selectedProject && (
                <span className="text-muted-foreground font-normal">
                  — {selectedProject.name}
                </span>
              )}
            </CardTitle>
            <Link href={`/projects/${selectedProjectId}`}>
              <Button variant="ghost" size="sm">
                View All Matches <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {matchLoading ? (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-48 rounded-lg border p-4 space-y-2"
                  >
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : matchResults && matchResults.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {matchResults.slice(0, 5).map((result) => (
                  <div
                    key={result.worker.id}
                    className="flex-shrink-0 w-48 rounded-lg border p-4 space-y-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                      {getInitials(result.worker.name)}
                    </div>
                    <p className="font-medium text-sm truncate">
                      {result.worker.name}
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      {result.matchedTrade}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {result.worker.experience} yrs exp
                    </p>
                    <ScoreBadge score={result.score.total} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                No matching workers found for this project.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Workforce Demand Summary */}
      {!loadingProjects && projects && projects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Workforce Demand Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-4 py-3 px-2 hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
                  onClick={() => setLocation(`/projects/${project.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {project.client} &middot; {project.location}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {project.tradesNeeded && project.tradesNeeded.length > 0 ? (
                      project.tradesNeeded.map((trade) => (
                        <Badge
                          key={trade}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {trade}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        No trades specified
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
