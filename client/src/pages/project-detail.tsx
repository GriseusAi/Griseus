import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  ArrowLeft,
  MapPin,
  Building2,
  Calendar,
  Zap,
  ClipboardList,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { Project, WorkOrder } from "@shared/schema";

const statusColors: Record<string, string> = {
  planning: "bg-chart-4/15 text-chart-4",
  active: "bg-primary/15 text-primary",
  completed: "bg-chart-3/15 text-chart-3",
  on_hold: "bg-destructive/15 text-destructive",
};

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id;

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: workOrders } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
  });

  const projectOrders = workOrders?.filter((wo) => wo.projectId === projectId) || [];
  const openCount = projectOrders.filter((wo) => wo.status === "open").length;
  const inProgressCount = projectOrders.filter((wo) => wo.status === "in_progress").length;
  const completedCount = projectOrders.filter((wo) => wo.status === "completed").length;

  usePageMeta(
    project ? project.name : "Project Details",
    project ? `${project.client} - ${project.location}. ${project.description || ""}` : "View project details"
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
            <p className="text-sm text-muted-foreground">This project may have been removed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/projects">
          <Button variant="ghost" size="icon" data-testid="button-back-projects">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-project-detail-name">{project.name}</h1>
            <Badge variant="secondary" className={statusColors[project.status] || ""}>
              {project.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{project.client}</p>
        </div>
      </div>

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
                  <p className="text-sm font-medium">{project.tier.replace("_", " ").toUpperCase()}</p>
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
              <span className="text-sm font-bold text-primary">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-chart-4/15 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-chart-4" />
            </div>
            <div>
              <p className="text-2xl font-bold">{openCount}</p>
              <p className="text-xs text-muted-foreground">Open</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/15 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{inProgressCount}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-chart-3/15 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-chart-3" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completedCount}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Work Orders ({projectOrders.length})
          </CardTitle>
          <Link href="/work-orders">
            <Button variant="outline" size="sm" data-testid="link-manage-orders">
              Manage
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {projectOrders.length > 0 ? (
            <div className="divide-y divide-border">
              {projectOrders.map((wo) => {
                const priorityColor: Record<string, string> = {
                  urgent: "text-destructive",
                  high: "text-chart-4",
                  medium: "text-muted-foreground",
                  low: "text-chart-3",
                };
                return (
                  <div key={wo.id} className="flex items-center gap-3 py-3" data-testid={`detail-wo-${wo.id}`}>
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      wo.priority === "urgent" || wo.priority === "high" ? "bg-chart-4" :
                      wo.priority === "medium" ? "bg-primary" : "bg-chart-3"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{wo.title}</p>
                      <p className="text-xs text-muted-foreground">{wo.trade}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{wo.status.replace("_", " ")}</Badge>
                    <span className={`text-xs font-medium ${priorityColor[wo.priority] || ""}`}>
                      {wo.priority}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No work orders for this project yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
