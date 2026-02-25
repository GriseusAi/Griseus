import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
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
  Activity,
} from "lucide-react";
import type { Project, WorkOrder, Worker } from "@shared/schema";

const iconBgColors: Record<string, string> = {
  "stat-active-projects": "bg-primary/10 text-primary",
  "stat-open-orders": "bg-warning/10 text-warning",
  "stat-available-workers": "bg-success/10 text-success",
  "stat-completion-rate": "bg-info/10 text-info",
};

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  testId,
  index,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  testId: string;
  index: number;
}) {
  return (
    <Card className="card-accent-top" data-testid={testId} style={{ animationDelay: `${index * 80}ms` }}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconBgColors[testId] || "bg-muted"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight" data-testid={`${testId}-value`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const statusColors: Record<string, string> = {
    planning: "bg-warning/15 text-warning",
    active: "bg-primary/15 text-primary",
    completed: "bg-success/15 text-success",
    on_hold: "bg-destructive/15 text-destructive",
  };

  return (
    <div
      className="flex items-center gap-4 py-3 px-2 hover:bg-muted/50 rounded-md transition-colors"
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
    high: "text-warning",
    medium: "text-muted-foreground",
    low: "text-success",
  };
  const PIcon = priorityIcon[workOrder.priority] || Clock;

  return (
    <div
      className="flex items-center gap-3 py-3 px-2 hover:bg-muted/50 rounded-md transition-colors"
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

const chartConfig = {
  open: { label: "Open", color: "hsl(var(--warning))" },
  in_progress: { label: "In Progress", color: "hsl(var(--primary))" },
  completed: { label: "Completed", color: "hsl(var(--success))" },
  cancelled: { label: "Cancelled", color: "hsl(var(--muted-foreground))" },
};

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

  // Chart data
  const chartData = workOrders
    ? [
        { status: "Open", count: workOrders.filter((o) => o.status === "open").length, fill: "hsl(var(--warning))" },
        { status: "In Progress", count: workOrders.filter((o) => o.status === "in_progress").length, fill: "hsl(var(--primary))" },
        { status: "Completed", count: workOrders.filter((o) => o.status === "completed").length, fill: "hsl(var(--success))" },
        { status: "Cancelled", count: workOrders.filter((o) => o.status === "cancelled").length, fill: "hsl(var(--muted-foreground))" },
      ]
    : [];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Gradient Header */}
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-8">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Welcome to Griseus</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Your command center for data center construction. Manage projects, coordinate teams, and track work orders across all your sites.
          </p>
          <div className="flex items-center gap-4 mt-4">
            <span className="text-xs text-muted-foreground">{today}</span>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-success font-medium">All systems operational</span>
            </div>
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
            index={0}
          />
          <StatCard
            title="Open Work Orders"
            value={openOrders}
            icon={ClipboardList}
            description={`${urgentOrders} high priority`}
            testId="stat-open-orders"
            index={1}
          />
          <StatCard
            title="Available Workers"
            value={availableWorkers}
            icon={Users}
            description={`${workers?.length || 0} total team members`}
            testId="stat-available-workers"
            index={2}
          />
          <StatCard
            title="Completion Rate"
            value={`${workOrders?.length ? Math.round((workOrders.filter((o) => o.status === "completed").length / workOrders.length) * 100) : 0}%`}
            icon={TrendingUp}
            description="Across all work orders"
            testId="stat-completion-rate"
            index={3}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Work Order Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <Skeleton className="h-[200px] w-full" />
            ) : chartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="status" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Projects */}
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

        {/* Recent Work Orders */}
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
