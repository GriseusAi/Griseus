import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertWorkOrderSchema, type WorkOrder, type Project, type Worker } from "@shared/schema";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  Plus,
  Search,
  ClipboardList,
  AlertTriangle,
  Clock,
  CheckCircle2,
  CircleDot,
} from "lucide-react";

const trades = [
  "Electrical",
  "Mechanical",
  "HVAC",
  "Fire Protection",
  "Networking",
  "Structural",
  "General",
];

const priorityConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  urgent: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/15 text-destructive" },
  high: { icon: AlertTriangle, color: "text-chart-4", bg: "bg-chart-4/15 text-chart-4" },
  medium: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted text-muted-foreground" },
  low: { icon: CheckCircle2, color: "text-chart-3", bg: "bg-chart-3/15 text-chart-3" },
};

const statusConfig: Record<string, { icon: React.ElementType; color: string }> = {
  open: { icon: CircleDot, color: "bg-chart-4/15 text-chart-4" },
  in_progress: { icon: Clock, color: "bg-primary/15 text-primary" },
  completed: { icon: CheckCircle2, color: "bg-chart-3/15 text-chart-3" },
  cancelled: { icon: AlertTriangle, color: "bg-destructive/15 text-destructive" },
};

export default function WorkOrders() {
  usePageMeta("Work Orders", "Track and manage tasks across all data center construction projects.");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: workOrders, isLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
  });
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  const { data: workers } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
  });

  const form = useForm({
    resolver: zodResolver(
      insertWorkOrderSchema.extend({
        title: insertWorkOrderSchema.shape.title.min(1, "Title is required"),
        projectId: insertWorkOrderSchema.shape.projectId.min(1, "Project is required"),
        trade: insertWorkOrderSchema.shape.trade.min(1, "Trade is required"),
      })
    ),
    defaultValues: {
      title: "",
      description: "",
      projectId: "",
      assigneeId: "",
      status: "open",
      priority: "medium",
      trade: "",
      dueDate: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/work-orders", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Work order created", description: "New work order has been added." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/work-orders/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: "Status updated" });
    },
  });

  const filtered = workOrders?.filter((wo) => {
    const matchSearch =
      wo.title.toLowerCase().includes(search.toLowerCase()) ||
      wo.trade.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || wo.status === statusFilter;
    const matchPriority = priorityFilter === "all" || wo.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const getProjectName = (id: string) => projects?.find((p) => p.id === id)?.name || "Unknown";
  const getWorkerName = (id: string | null) => {
    if (!id) return null;
    return workers?.find((w) => w.id === id)?.name || null;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Work Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and manage tasks across all data center projects
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-work-order">
              <Plus className="h-4 w-4 mr-1" /> New Work Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Work Order</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Install PDU in Hall A" {...field} data-testid="input-wo-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-wo-project">
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {projects?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="trade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trade</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-wo-trade">
                              <SelectValue placeholder="Select trade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {trades.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-wo-priority">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="assigneeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assignee (optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger data-testid="select-wo-assignee">
                            <SelectValue placeholder="Assign to..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {workers?.map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.name} - {w.trade}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Work order details..." {...field} value={field.value || ""} data-testid="input-wo-desc" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date (optional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-wo-due" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-wo">
                  {createMutation.isPending ? "Creating..." : "Create Work Order"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search work orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-orders"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center gap-4">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-48 flex-1" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((wo) => {
            const pConfig = priorityConfig[wo.priority] || priorityConfig.medium;
            const sConfig = statusConfig[wo.status] || statusConfig.open;
            const PIcon = pConfig.icon;
            const assigneeName = getWorkerName(wo.assigneeId);

            return (
              <Card key={wo.id} className="hover-elevate" data-testid={`card-wo-${wo.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <PIcon className={`h-4 w-4 flex-shrink-0 ${pConfig.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm" data-testid={`text-wo-title-${wo.id}`}>{wo.title}</p>
                        <Badge variant="secondary" className={`text-[10px] ${pConfig.bg}`}>
                          {wo.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">{getProjectName(wo.projectId)}</span>
                        <span className="text-xs text-muted-foreground">{wo.trade}</span>
                        {assigneeName && (
                          <span className="text-xs text-muted-foreground">{assigneeName}</span>
                        )}
                        {wo.dueDate && (
                          <span className="text-xs text-muted-foreground">Due: {wo.dueDate}</span>
                        )}
                      </div>
                    </div>
                    <Select
                      value={wo.status}
                      onValueChange={(val) => updateStatusMutation.mutate({ id: wo.id, status: val })}
                    >
                      <SelectTrigger className="w-[130px]" data-testid={`select-status-${wo.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">No work orders found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {search || statusFilter !== "all" || priorityFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first work order to get started"}
            </p>
            {!search && statusFilter === "all" && priorityFilter === "all" && (
              <Button onClick={() => setDialogOpen(true)} data-testid="button-empty-new-wo">
                <Plus className="h-4 w-4 mr-1" /> Create Work Order
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
