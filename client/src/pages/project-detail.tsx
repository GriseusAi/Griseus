import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  MapPin,
  Building2,
  Calendar,
  Zap,
  Wrench,
  Sparkles,
  UserCheck,
  Clock,
  Award,
} from "lucide-react";
import type { Project, Worker } from "@shared/schema";

interface WorkerMatchResult {
  worker: Worker;
  score: { total: number };
  matchedTrade: string;
  alreadyAssigned: boolean;
  skillDetails: { tradeSkillCount: number; workerMatchedSkills: number; avgProficiency: number };
  certDetails: { requiredCertCount: number; validCerts: number; expiredCerts: number; missingCerts: number };
}

const statusColors: Record<string, string> = {
  planning: "bg-amber-100 text-amber-800 font-semibold",
  active: "bg-[#92ABBB] text-white font-semibold",
  completed: "bg-emerald-100 text-emerald-800 font-semibold",
  on_hold: "bg-red-100 text-red-800 font-semibold",
};

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
    <Badge variant="secondary" className={`text-xs font-bold ${color}`}>
      {score}%
    </Badge>
  );
}

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id;
  const { toast } = useToast();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const [matchResults, setMatchResults] = useState<WorkerMatchResult[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    async function fetchMatches() {
      setMatchLoading(true);
      try {
        const res = await apiRequest("POST", "/api/matching/workers-for-project", {
          projectId,
        });
        const data = await res.json();
        if (!cancelled) setMatchResults(data);
      } catch {
        if (!cancelled) setMatchResults([]);
      } finally {
        if (!cancelled) setMatchLoading(false);
      }
    }
    fetchMatches();
    return () => { cancelled = true; };
  }, [projectId]);

  usePageMeta(
    project ? project.name : "Project Details",
    project
      ? `${project.client} - ${project.location}. ${project.description || ""}`
      : "View project details"
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/projects">
          <Button variant="ghost" size="sm" data-testid="button-back-projects">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Projects
          </Button>
        </Link>
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <h3 className="font-semibold mb-1">Project not found</h3>
            <p className="text-sm text-muted-foreground">
              This project may have been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto animate-fade-in">
      {/* Gradient header banner */}
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Link href="/projects">
              <Button variant="ghost" size="icon" data-testid="button-back-projects">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1
                  className="text-3xl font-extrabold tracking-tight"
                  data-testid="text-project-detail-name"
                >
                  {project.name}
                </h1>
                <Badge
                  variant="secondary"
                  className={statusColors[project.status] || ""}
                >
                  {project.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{project.client}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Project Info */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="text-sm font-medium">{project.location}</p>
              </div>
            </div>
            {project.powerCapacity && (
              <div className="flex items-start gap-3">
                <Zap className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Power Capacity</p>
                  <p className="text-sm font-medium">{project.powerCapacity}</p>
                </div>
              </div>
            )}
            {project.tier && (
              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Tier</p>
                  <p className="text-sm font-medium">
                    {project.tier.replace("_", " ").toUpperCase()}
                  </p>
                </div>
              </div>
            )}
            {project.startDate && (
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p className="text-sm font-medium">{project.startDate}</p>
                </div>
              </div>
            )}
          </div>
          {project.description && (
            <>
              <Separator className="my-4" />
              <p className="text-sm text-muted-foreground">{project.description}</p>
            </>
          )}
          <Separator className="my-4" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-2xl font-extrabold text-primary">
                {project.progress}%
              </span>
            </div>
            <Progress value={project.progress} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Workforce Needs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Workforce Needs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {project.tradesNeeded && project.tradesNeeded.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {project.tradesNeeded.map((trade) => (
                <div
                  key={trade}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-muted/30"
                >
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{trade}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No trades specified for this project yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Recommended Workers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Recommended Workers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {matchLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : matchResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {matchResults.slice(0, 10).map((result) => (
                <div
                  key={result.worker.id}
                  className="rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                        {getInitials(result.worker.name)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{result.worker.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {result.worker.title}
                        </p>
                      </div>
                    </div>
                    <ScoreBadge score={result.score.total} />
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="outline" className="text-[10px]">
                      {result.matchedTrade}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {result.worker.experience} yrs
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${
                        result.alreadyAssigned
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {result.alreadyAssigned ? "On Assignment" : "Available"}
                    </Badge>
                    {result.worker.certifications &&
                      result.worker.certifications.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Award className="h-3 w-3" />
                          {result.worker.certifications.length} certs
                        </span>
                      )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      toast({
                        title: "Request submitted",
                        description: `Request submitted for ${result.worker.name}`,
                      })
                    }
                  >
                    <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                    Request Worker
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No matching workers found. Try adding more trades to your project.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
