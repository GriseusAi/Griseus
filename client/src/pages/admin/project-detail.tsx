import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageMeta } from "@/hooks/use-page-meta";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  FolderKanban,
  MapPin,
  Users,
  Wrench,
  Search,
  UserPlus,
  Briefcase,
  Zap,
  Calendar,
} from "lucide-react";
import type { Project, Worker, ProjectAssignment } from "@shared/schema";

const statusColors: Record<string, string> = {
  planning: "bg-amber-500/15 text-amber-400",
  active: "bg-blue-500/15 text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  on_hold: "bg-red-500/15 text-red-400",
};

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function AdminProjectDetail() {
  usePageMeta("Project Detail", "View project details and manage assignments.");

  const [, params] = useRoute("/admin/projects/:id");
  const projectId = params?.id;

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery<ProjectAssignment[]>({
    queryKey: ["/api/project-assignments/project", projectId],
    enabled: !!projectId,
  });

  const { data: workers } = useQuery<Worker[]>({ queryKey: ["/api/workers"] });

  const assignedWorkers = assignments?.map(a => {
    const worker = workers?.find(w => w.id === a.workerId);
    return worker ? { ...worker, role: a.role, assignmentId: a.id } : null;
  }).filter(Boolean) as (Worker & { role: string; assignmentId: string })[] | undefined;

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  if (projectLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-8">
          <Link href="/admin/projects">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </button>
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {project.name}
            </h1>
            <Badge variant="secondary" className={`text-xs font-semibold ${statusColors[project.status] || ""}`}>
              {project.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{project.description || "No description"}</p>
        </div>
      </div>

      {/* Project Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Client</span>
            </div>
            <p className="text-sm font-semibold">{project.client}</p>
          </CardContent>
        </Card>
        <Card className="border border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Location</span>
            </div>
            <p className="text-sm font-semibold">{project.location}</p>
          </CardContent>
        </Card>
        <Card className="border border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Power</span>
            </div>
            <p className="text-sm font-semibold">{project.powerCapacity || "—"}</p>
          </CardContent>
        </Card>
        <Card className="border border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${project.progress}%` }} />
              </div>
              <span className="text-sm font-semibold">{project.progress}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trades Needed */}
      {(project.tradesNeeded ?? []).length > 0 && (
        <Card className="border border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Trades Needed</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {(project.tradesNeeded ?? []).map(t => (
                <Badge key={t} variant="secondary" className="text-xs bg-blue-500/10 text-blue-400">
                  {t}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assigned Workers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Assigned Workers ({assignedWorkers?.length || 0})</h2>
          </div>
          <Button onClick={() => setAssignDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Assign Worker
          </Button>
        </div>

        {assignmentsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : assignedWorkers && assignedWorkers.length > 0 ? (
          <Card className="border border-white/10">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Worker</th>
                      <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Trade</th>
                      <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Location</th>
                      <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Role</th>
                      <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedWorkers.map(w => (
                      <tr key={w.assignmentId} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs font-bold bg-muted">
                                {getInitials(w.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{w.name}</p>
                              <p className="text-xs text-muted-foreground">{w.title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-400">
                            {w.trade}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{w.location}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="secondary" className="capitalize text-[10px]">
                            {w.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={w.available ? "default" : "secondary"} className="text-[10px]">
                            {w.available ? "Available" : "Busy"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-white/10">
            <CardContent className="p-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No workers assigned yet. Click "Assign Worker" to add team members.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <AssignWorkerDialog
        projectId={projectId!}
        open={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
        existingAssignments={assignments || []}
      />
    </div>
  );
}

function AssignWorkerDialog({
  projectId,
  open,
  onClose,
  existingAssignments,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  existingAssignments: ProjectAssignment[];
}) {
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("crew");
  const { toast } = useToast();

  const { data: workers } = useQuery<Worker[]>({ queryKey: ["/api/workers"] });

  const alreadyAssignedIds = new Set(existingAssignments.map(a => a.workerId));

  const filtered = workers?.filter(w => {
    if (alreadyAssignedIds.has(w.id)) return false;
    if (!search) return true;
    return (
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.trade.toLowerCase().includes(search.toLowerCase())
    );
  }) ?? [];

  const assignMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const res = await apiRequest("POST", "/api/project-assignments", {
        workerId,
        projectId,
        role: selectedRole,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-assignments/project", projectId] });
      toast({ title: "Worker Assigned", description: "Worker has been added to the project." });
      onClose();
      setSearch("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setSearch(""); } }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Assign Worker to Project</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or trade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="crew">Crew</SelectItem>
              <SelectItem value="lead">Team Lead</SelectItem>
              <SelectItem value="foreman">Foreman</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[400px]">
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                {search ? "No workers match your search" : "No available workers to assign"}
              </p>
            </div>
          ) : (
            filtered.map(w => (
              <div
                key={w.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-card hover:border-white/20 hover:bg-card/80 transition-all"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs font-bold bg-muted">
                    {getInitials(w.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{w.name}</span>
                    {w.available ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      {w.trade}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {w.location}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => assignMutation.mutate(w.id)}
                  disabled={assignMutation.isPending}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Assign
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
