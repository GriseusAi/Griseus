import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderKanban,
  ClipboardList,
  Users,
  Zap,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import type { Project, WorkOrder, Worker } from "@shared/schema";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  testId,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`${testId}-value`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const statusColors: Record<string, string> = {
    planning: "bg-chart-4/15 text-chart-4",
    active: "bg-primary/15 text-primary",
    completed: "bg-chart-3/15 text-chart-3",
    on_hold: "bg-destructive/15 text-destructive",
  };

  return (
    <div
      className="flex items-center gap-4 py-3 px-1"
      data-testid={`project-row-${project.id}`}
    >
      <div className="flex-1 min-w-0">
        <Link href={`/projects/${project.id}`}>
          <span className="font-medium text-sm hover:underline cursor-pointer" data-testid={`text-project-name-${project.id}`}>
            {project.name}
          </span>
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{project.client} &middot; {project.location}</p>
      </div>
      <Badge variant="secondary" className={statusColors[project.status] || ""}>
        {project.status.replace("_", " ")}
      </Badge>
      <div className="w-24 hidden sm:block">
        <Progress value={project.progress} className="h-1.5" />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{project.progress}%</span>
    </div>
  );
}

function WorkOrderRow({ workOrder }: { workOrder: WorkOrder }) {
  const priorityIcon: Record<string, React.ElementType> = {
    high: AlertTriangle,
    urgent: AlertTriangle,
    medium: Clock,
    low: CheckCircle2,
  };
  const priorityColor: Record<string, string> = {
    urgent: "text-destructive",
    high: "text-chart-4",
    medium: "text-muted-foreground",
    low: "text-chart-3",
  };
  const PIcon = priorityIcon[workOrder.priority] || Clock;

  return (
    <div
      className="flex items-center gap-3 py-3 px-1"
      data-testid={`workorder-row-${workOrder.id}`}
    >
      <PIcon className={`h-4 w-4 flex-shrink-0 ${priorityColor[workOrder.priority] || ""}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate" data-testid={`text-wo-title-${workOrder.id}`}>{workOrder.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{workOrder.trade}</p>
      </div>
      <Badge variant="outline" className="text-xs">{workOrder.status}</Badge>
    </div>
  );
}

export default function Dashboard() {
  usePageMeta("Dashboard", "Your command center for data center construction projects, work orders, and team management.");

  const { data: projects, isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  const { data: workOrders, isLoading: loadingOrders } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
  });
  const { data: workers, isLoading: loadingWorkers } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
  });

  const activeProjects = projects?.filter((p) => p.status === "active").length || 0;
  const openOrders = workOrders?.filter((o) => o.status === "open" || o.status === "in_progress").length || 0;
  const urgentOrders = workOrders?.filter((o) => o.priority === "urgent" || o.priority === "high").length || 0;
  const availableWorkers = workers?.filter((w) => w.available).length || 0;

  const isLoading = loadingProjects || loadingOrders || loadingWorkers;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="relative rounded-md overflow-hidden mb-8">
        <img
          src="/images/hero-datacenter.png"
          alt="Data center facility"
          className="w-full h-48 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
        <div className="absolute inset-0 flex items-center p-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold text-white">Welcome to Flux</h1>
            </div>
            <p className="text-sm text-gray-300 max-w-md">
              Your command center for data center construction. Manage projects, coordinate teams, and track work orders across all your sites.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Active Projects"
            value={activeProjects}
            icon={FolderKanban}
            description={`${projects?.length || 0} total projects`}
            testId="stat-active-projects"
          />
          <StatCard
            title="Open Work Orders"
            value={openOrders}
            icon={ClipboardList}
            description={`${urgentOrders} high priority`}
            testId="stat-open-orders"
          />
          <StatCard
            title="Available Workers"
            value={availableWorkers}
            icon={Users}
            description={`${workers?.length || 0} total team members`}
            testId="stat-available-workers"
          />
          <StatCard
            title="Completion Rate"
            value={`${projects?.length ? Math.round((projects.filter((p) => p.status === "completed").length / projects.length) * 100) : 0}%`}
            icon={TrendingUp}
            description="Across all projects"
            testId="stat-completion-rate"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
            <CardTitle className="text-base font-semibold">Recent Projects</CardTitle>
            <Link href="/projects">
              <Button variant="ghost" size="sm" data-testid="link-view-all-projects">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loadingProjects ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <Skeleton className="h-4 w-40 flex-1" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-1.5 w-24" />
                  </div>
                ))}
              </div>
            ) : projects && projects.length > 0 ? (
              <div className="divide-y divide-border">
                {projects.slice(0, 5).map((project) => (
                  <ProjectRow key={project.id} project={project} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No projects yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
            <CardTitle className="text-base font-semibold">Recent Work Orders</CardTitle>
            <Link href="/work-orders">
              <Button variant="ghost" size="sm" data-testid="link-view-all-orders">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-40 flex-1" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                ))}
              </div>
            ) : workOrders && workOrders.length > 0 ? (
              <div className="divide-y divide-border">
                {workOrders.slice(0, 5).map((wo) => (
                  <WorkOrderRow key={wo.id} workOrder={wo} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No work orders yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
