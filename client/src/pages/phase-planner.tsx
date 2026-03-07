import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarRange,
  Users,
  ShieldCheck,
  Clock,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Wrench,
  Send,
  ArrowLeft,
  Shield,
  Award,
  Mail,
  Phone,
  Briefcase,
  Star,
  Zap,
  Wallet,
  DollarSign,
  Timer,
  X,
} from "lucide-react";
import type { Worker, ProjectAssignment, Project } from "@shared/schema";

// ── Lead Time by order index ───────────────────────────────────────────
// Earlier phases need more lead time for sourcing; later phases less.
function getLeadTimeWeeks(orderIndex: number): number {
  if (orderIndex <= 1) return 12;
  if (orderIndex <= 2) return 10;
  if (orderIndex <= 4) return 8;
  if (orderIndex <= 6) return 6;
  return 4;
}

// ── Types ──────────────────────────────────────────────────────────────

interface PhaseSummary {
  phase: { id: string; name: string; orderIndex: number };
  totalWorkers: number;
  trades: Array<{
    tradeName: string;
    tradeId: string;
    workersNeeded: number;
    priority: string;
    durationWeeks: number;
    notes: string | null;
  }>;
}

interface PhaseRequirementDetail {
  id: string;
  projectPhaseId: string;
  tradeId: string;
  workersNeeded: number;
  priority: string;
  durationWeeks: number;
  requiredCertifications: string | null;
  notes: string | null;
  tradeName: string;
}

interface PhaseRequirementResponse {
  phase: { id: string; name: string; description: string | null; orderIndex: number };
  requirements: PhaseRequirementDetail[];
}

// ── Helper Components ──────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-500/20",
    important: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    supporting: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };
  return (
    <Badge variant="outline" className={styles[priority] || styles.supporting}>
      {priority}
    </Badge>
  );
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function subtractWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - weeks * 7);
  return d.toISOString().split("T")[0];
}

// ── Phase Selector ─────────────────────────────────────────────────────

function PhaseSelector({
  phases,
  selectedPhaseId,
  onSelect,
}: {
  phases: PhaseSummary[];
  selectedPhaseId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {phases.map((ps) => {
        const isSelected = selectedPhaseId === ps.phase.id;
        const leadTime = getLeadTimeWeeks(ps.phase.orderIndex);
        return (
          <button
            key={ps.phase.id}
            onClick={() => onSelect(ps.phase.id)}
            className={`group flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
              isSelected
                ? "border-primary/40 bg-primary/5"
                : "border-white/10 bg-card hover:border-white/20 hover:bg-card/80"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                isSelected
                  ? "bg-primary/20 text-primary"
                  : "bg-white/5 text-muted-foreground group-hover:bg-white/10"
              }`}
            >
              {ps.phase.orderIndex}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
                {ps.phase.name}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {ps.totalWorkers} workers &middot; {ps.trades.length} trades
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-xs border-white/10">
                {leadTime}w lead
              </Badge>
              <ChevronRight className={`w-4 h-4 transition-colors ${isSelected ? "text-primary" : "text-muted-foreground/50"}`} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Trade Requirements Panel ───────────────────────────────────────────

function TradeRequirementsPanel({
  requirements,
  phaseName,
}: {
  requirements: PhaseRequirementDetail[];
  phaseName: string;
}) {
  if (requirements.length === 0) {
    return (
      <Card className="border-white/10">
        <CardContent className="p-6 text-center text-muted-foreground">
          No trade requirements found for this phase.
        </CardContent>
      </Card>
    );
  }

  const totalWorkers = requirements.reduce((sum, r) => sum + r.workersNeeded, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          Required Trades
        </h3>
        <Badge className="bg-primary/15 text-primary border-primary/20" variant="outline">
          {totalWorkers} workers total
        </Badge>
      </div>

      <div className="grid gap-3">
        {requirements
          .sort((a, b) => {
            const order = { critical: 0, important: 1, supporting: 2 };
            return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
          })
          .map((req) => (
            <Card key={req.id} className="border-white/10">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground">{req.tradeName}</span>
                      <PriorityBadge priority={req.priority} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {req.workersNeeded} workers
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {req.durationWeeks} weeks
                      </span>
                    </div>
                    {req.requiredCertifications && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex flex-wrap gap-1">
                          {req.requiredCertifications.split(",").map((cert) => (
                            <Badge key={cert.trim()} variant="outline" className="text-[10px] border-amber-500/20 text-amber-400/80">
                              {cert.trim()}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {req.notes && (
                      <p className="text-xs text-muted-foreground/70 mt-2 leading-relaxed">{req.notes}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}

// ── Available Workers Panel ────────────────────────────────────────────

function AvailableWorkersPanel({
  tradeNames,
}: {
  tradeNames: string[];
}) {
  const [passportWorkerId, setPassportWorkerId] = useState<string | null>(null);
  const tradesParam = tradeNames.join(",");
  const { data: workers, isLoading } = useQuery<Worker[]>({
    queryKey: ["/api/phase-workers", tradesParam],
    queryFn: async () => {
      const res = await fetch(`/api/phase-workers?trades=${encodeURIComponent(tradesParam)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch workers");
      return res.json();
    },
    enabled: tradeNames.length > 0,
  });

  const available = workers?.filter(w => w.available) || [];
  const unavailable = workers?.filter(w => !w.available) || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" />
          Available Workers
        </h3>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20" variant="outline">
            {available.length} available
          </Badge>
          {unavailable.length > 0 && (
            <Badge className="bg-white/5 text-muted-foreground border-white/10" variant="outline">
              {unavailable.length} busy
            </Badge>
          )}
        </div>
      </div>

      {workers && workers.length === 0 && (
        <Card className="border-white/10">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No workers match the required trades for this phase.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1">
        {available.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} onClick={() => setPassportWorkerId(worker.id)} />
        ))}
        {unavailable.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} dimmed onClick={() => setPassportWorkerId(worker.id)} />
        ))}
      </div>

      <WorkerPassportDialog
        workerId={passportWorkerId}
        open={!!passportWorkerId}
        onClose={() => setPassportWorkerId(null)}
      />
    </div>
  );
}

function WorkerCard({ worker, dimmed, onClick }: { worker: Worker; dimmed?: boolean; onClick?: () => void }) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-card cursor-pointer hover:border-white/20 hover:bg-card/80 transition-all ${dimmed ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
        {getInitials(worker.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{worker.name}</span>
          {worker.available ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span className="flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            {worker.trade}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {worker.location}
          </span>
        </div>
      </div>
      <div className="shrink-0 flex flex-wrap gap-1 max-w-[160px] justify-end">
        {(worker.certifications || []).slice(0, 3).map((cert) => (
          <Badge key={cert} variant="outline" className="text-[10px] border-white/10">
            {cert}
          </Badge>
        ))}
        {(worker.certifications || []).length > 3 && (
          <Badge variant="outline" className="text-[10px] border-white/10">
            +{(worker.certifications || []).length - 3}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── Cert Badge Styles (matching passport page) ─────────────────────────

const certBadgeStyles: Record<string, { bg: string; icon: typeof Award }> = {
  "Master Electrician": { bg: "bg-amber-500/15 text-amber-400", icon: Zap },
  "OSHA 30": { bg: "bg-red-500/15 text-red-400", icon: Shield },
  "OSHA 500 Trainer": { bg: "bg-red-500/15 text-red-400", icon: Shield },
  "NFPA 70E": { bg: "bg-orange-500/15 text-orange-400", icon: Shield },
  "Arc Flash Safety": { bg: "bg-orange-500/15 text-orange-400", icon: Shield },
  "Siemens High Voltage Certified": { bg: "bg-blue-500/15 text-blue-400", icon: Zap },
  "PMP": { bg: "bg-violet-500/15 text-violet-400", icon: Award },
  "CDCMP": { bg: "bg-indigo-500/15 text-indigo-400", icon: Award },
  "Six Sigma Black Belt": { bg: "bg-slate-500/15 text-slate-400", icon: Award },
  "EPA 608 Universal": { bg: "bg-green-500/15 text-green-400", icon: CheckCircle2 },
  "ASHRAE Certified": { bg: "bg-teal-500/15 text-teal-400", icon: Award },
  "LEED AP": { bg: "bg-emerald-500/15 text-emerald-400", icon: Star },
  "Carrier Chiller Specialist": { bg: "bg-cyan-500/15 text-cyan-400", icon: Award },
  "BMS Controls Pro": { bg: "bg-sky-500/15 text-sky-400", icon: Award },
  "BICSI RCDD": { bg: "bg-purple-500/15 text-purple-400", icon: Award },
  "Cisco CCNP": { bg: "bg-blue-500/15 text-blue-400", icon: Award },
  "CDCDP": { bg: "bg-indigo-500/15 text-indigo-400", icon: Award },
  "Fiber Optic Pro": { bg: "bg-fuchsia-500/15 text-fuchsia-400", icon: Star },
  "Corning Certified Installer": { bg: "bg-rose-500/15 text-rose-400", icon: CheckCircle2 },
  "CDCEP": { bg: "bg-teal-500/15 text-teal-400", icon: Award },
  "AEE CEM": { bg: "bg-lime-500/15 text-lime-400", icon: Award },
  "Uptime Tier Designer": { bg: "bg-amber-500/15 text-amber-400", icon: Star },
  "Uptime Institute ATD": { bg: "bg-amber-500/15 text-amber-400", icon: Star },
  "Schneider Electric Certified": { bg: "bg-green-500/15 text-green-400", icon: Zap },
  "Generator Systems Pro": { bg: "bg-yellow-500/15 text-yellow-400", icon: Zap },
};

function getCertStyle(certName: string) {
  return certBadgeStyles[certName] || { bg: "bg-primary/10 text-primary", icon: Award };
}

// ── Worker Passport Dialog ─────────────────────────────────────────────

function WorkerPassportDialog({
  workerId,
  open,
  onClose,
}: {
  workerId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: worker, isLoading: workerLoading } = useQuery<Worker>({
    queryKey: ["/api/workers", workerId],
    queryFn: async () => {
      const res = await fetch(`/api/workers/${workerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch worker");
      return res.json();
    },
    enabled: !!workerId && open,
  });

  const { data: assignments } = useQuery<ProjectAssignment[]>({
    queryKey: ["/api/project-assignments/worker", workerId],
    enabled: !!workerId && open,
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!workerId && open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{worker?.name || "Worker Profile"}</DialogTitle>
        </DialogHeader>

        {workerLoading || !worker ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            {/* Profile card */}
            <div className="overflow-hidden">
              <div className="h-20 bg-gradient-to-br from-blue-600 to-blue-500 relative">
                <div className="absolute -bottom-8 left-5">
                  <Avatar className="h-16 w-16 bg-gradient-to-br from-blue-600 to-blue-500 text-white border-4 border-card shadow-lg">
                    <AvatarFallback className="text-lg font-bold bg-gradient-to-br from-blue-600 to-blue-500 text-white">
                      {getInitials(worker.name)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div className="pt-12 px-5 pb-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold truncate">{worker.name}</h2>
                  <p className="text-sm text-muted-foreground">{worker.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant={worker.available ? "default" : "secondary"}>
                      {worker.available ? "Available" : "On Assignment"}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {worker.experience} yrs
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm mt-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>{worker.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span>{worker.email}</span>
                  </div>
                  {worker.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4 flex-shrink-0" />
                      <span>{worker.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-4 w-4 flex-shrink-0" />
                    <span>{worker.trade}</span>
                  </div>
                </div>

                {worker.bio && (
                  <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">{worker.bio}</p>
                )}
              </div>
            </div>

            {/* Wallet & Stats */}
            <div className="px-5">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Wallet className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Wallet & Stats</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center justify-center h-9 w-9 rounded-md bg-emerald-500/10 mx-auto mb-1.5">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                      </div>
                      <p className="text-lg font-bold text-emerald-500">
                        ${(worker.walletBalance / 100).toLocaleString()}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-tight">Balance</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center justify-center h-9 w-9 rounded-md bg-amber-500/10 mx-auto mb-1.5">
                        <Clock className="h-4 w-4 text-amber-500" />
                      </div>
                      <p className="text-lg font-bold">
                        ${(worker.pendingPayout / 100).toLocaleString()}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-tight">Pending</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-center justify-center h-9 w-9 rounded-md bg-blue-500/10 mx-auto mb-1.5">
                        <Timer className="h-4 w-4 text-blue-500" />
                      </div>
                      <p className="text-lg font-bold">
                        {worker.totalHoursWorked.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-tight">Hours Worked</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Certifications */}
            <div className="px-5">
              <div className="flex items-center gap-2 mb-3">
                <Award className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Verified Certifications ({worker.certifications?.length || 0})
                </h3>
              </div>
              <div className="space-y-2">
                {worker.certifications?.map((cert, i) => {
                  const style = getCertStyle(cert);
                  const CertIcon = style.icon;
                  return (
                    <Card key={i}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`flex items-center justify-center h-10 w-10 rounded-md ${style.bg} flex-shrink-0`}>
                          <CertIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{cert}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            Verified
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Active Assignments */}
            <div className="px-5">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Assignments ({assignments?.length || 0})
                </h3>
              </div>
              {assignments && assignments.length > 0 ? (
                <div className="space-y-2">
                  {assignments.map((a) => {
                    const project = projects?.find((p) => p.id === a.projectId);
                    return (
                      <Card key={a.id}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className="flex items-center justify-center h-10 w-10 rounded-md bg-primary/10 flex-shrink-0">
                            <Briefcase className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{project?.name || "Unknown Project"}</p>
                            <p className="text-xs text-muted-foreground capitalize">{a.role} &middot; {project?.location}</p>
                          </div>
                          <Badge variant="outline" className="capitalize">{a.role}</Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-4 text-center text-sm text-muted-foreground">
                    No active assignments
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Scheduling Component ───────────────────────────────────────────────

function SchedulingPanel({
  phaseName,
  leadTimeWeeks,
  tradeNames,
  availableCount,
}: {
  phaseName: string;
  leadTimeWeeks: number;
  tradeNames: string[];
  availableCount: number;
}) {
  const [startDate, setStartDate] = useState("");
  const { toast } = useToast();

  const sourcingDeadline = startDate ? subtractWeeks(startDate, leadTimeWeeks) : null;
  const isPastDeadline = sourcingDeadline ? new Date(sourcingDeadline) < new Date() : false;

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!startDate) throw new Error("Select a start date");
      const res = await apiRequest("POST", "/api/project-schedules", {
        phaseName,
        phaseStartDate: startDate,
        sourcingDeadline: sourcingDeadline!,
        tradesNeeded: tradeNames,
        status: "planning",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-schedules"] });
      toast({
        title: "Schedule Created",
        description: `${phaseName} workforce request saved. Sourcing deadline: ${sourcingDeadline ? formatDate(sourcingDeadline) : "N/A"}.`,
      });
      setStartDate("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="w-5 h-5 text-primary" />
          Schedule This Phase
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">
            When does this phase start?
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-white/10 text-foreground text-sm focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

        {startDate && sourcingDeadline && (
          <div className="space-y-3">
            <div className={`flex items-start gap-3 p-3 rounded-lg border ${isPastDeadline ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
              {isPastDeadline ? (
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="text-sm">
                <p className={isPastDeadline ? "text-red-400 font-medium" : "text-emerald-400 font-medium"}>
                  {isPastDeadline ? "Sourcing deadline has passed!" : "Sourcing Timeline"}
                </p>
                <p className="text-muted-foreground mt-1">
                  Start sourcing by <span className="text-foreground font-medium">{formatDate(sourcingDeadline)}</span>
                  {" "}({leadTimeWeeks} weeks before phase start)
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 text-sm">
              <span className="text-muted-foreground">Matching workers in system:</span>
              <span className="font-medium text-foreground">{availableCount}</span>
            </div>

            <Button
              onClick={() => createScheduleMutation.mutate()}
              disabled={createScheduleMutation.isPending}
              className="w-full"
            >
              <Send className="w-4 h-4 mr-2" />
              {createScheduleMutation.isPending ? "Saving..." : "Request Workers"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function PhasePlanner() {
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  const { data: phaseSummary, isLoading: loadingSummary } = useQuery<PhaseSummary[]>({
    queryKey: ["/api/phase-requirements/summary"],
  });

  // Derive selected phase data from the API summary
  const selectedPhaseData = phaseSummary?.find(p => p.phase.id === selectedPhaseId);
  const selectedPhaseName = selectedPhaseData?.phase.name || null;
  const leadTimeWeeks = selectedPhaseData ? getLeadTimeWeeks(selectedPhaseData.phase.orderIndex) : 0;

  const { data: phaseDetail, isLoading: loadingDetail } = useQuery<PhaseRequirementResponse>({
    queryKey: ["/api/phase-requirements", selectedPhaseId],
    queryFn: async () => {
      const res = await fetch(`/api/phase-requirements?phaseId=${selectedPhaseId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch phase requirements");
      return res.json();
    },
    enabled: !!selectedPhaseId,
  });

  const tradeNames = useMemo(() => {
    return phaseDetail?.requirements.map(r => r.tradeName) || [];
  }, [phaseDetail]);

  // Get available worker count for the selected phase
  const tradesParam = tradeNames.join(",");
  const { data: phaseWorkers } = useQuery<Worker[]>({
    queryKey: ["/api/phase-workers", tradesParam],
    queryFn: async () => {
      const res = await fetch(`/api/phase-workers?trades=${encodeURIComponent(tradesParam)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch workers");
      return res.json();
    },
    enabled: tradeNames.length > 0,
  });
  const availableCount = phaseWorkers?.filter(w => w.available).length || 0;

  if (loadingSummary) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Phase Planner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a project phase to see required trades, certifications, and available workforce.
        </p>
      </div>

      {/* Summary stats */}
      {phaseSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-foreground">{phaseSummary.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Project Phases</div>
            </CardContent>
          </Card>
          <Card className="border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-foreground">
                {phaseSummary.reduce((sum, p) => sum + p.totalWorkers, 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Workers Needed</div>
            </CardContent>
          </Card>
          <Card className="border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-foreground">
                {new Set(phaseSummary.flatMap(p => p.trades.map(t => t.tradeName))).size}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Unique Trades</div>
            </CardContent>
          </Card>
          <Card className="border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-primary">
                {selectedPhaseId ? leadTimeWeeks + "w" : "--"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Lead Time</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Phase Selector */}
        <div className="lg:col-span-1">
          <div className="sticky top-20">
            <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              Construction Phases
            </h2>
            {phaseSummary && (
              <PhaseSelector
                phases={phaseSummary}
                selectedPhaseId={selectedPhaseId}
                onSelect={setSelectedPhaseId}
              />
            )}
          </div>
        </div>

        {/* Right: Phase Details */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedPhaseId ? (
            <Card className="border-white/10">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <CalendarRange className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Select a Phase
                </h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Choose a data center construction phase from the left to view trade requirements, certification needs, and available workforce.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Phase header */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedPhaseId(null)}
                  className="lg:hidden p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedPhaseName}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {phaseDetail?.phase.description}
                  </p>
                </div>
              </div>

              {/* Trade Requirements */}
              {loadingDetail ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : phaseDetail ? (
                <TradeRequirementsPanel
                  requirements={phaseDetail.requirements}
                  phaseName={selectedPhaseName || ""}
                />
              ) : null}

              {/* Scheduling */}
              {selectedPhaseName && (
                <SchedulingPanel
                  phaseName={selectedPhaseName}
                  leadTimeWeeks={leadTimeWeeks}
                  tradeNames={tradeNames}
                  availableCount={availableCount}
                />
              )}

              {/* Available Workers */}
              {tradeNames.length > 0 && (
                <AvailableWorkersPanel tradeNames={tradeNames} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
