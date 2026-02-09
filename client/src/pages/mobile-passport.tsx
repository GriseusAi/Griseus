import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Worker, JobApplication, ProjectAssignment, Project } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  Shield, Award, MapPin, Mail, Phone, Briefcase, Star, CheckCircle2,
  Clock, FileText, ChevronRight, Zap
} from "lucide-react";

const CURRENT_WORKER_ID_KEY = "flux_current_worker_id";

const certBadgeStyles: Record<string, { bg: string; icon: typeof Award }> = {
  "Master Electrician": { bg: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Zap },
  "OSHA 30": { bg: "bg-red-500/15 text-red-700 dark:text-red-400", icon: Shield },
  "OSHA 500 Trainer": { bg: "bg-red-500/15 text-red-700 dark:text-red-400", icon: Shield },
  "NFPA 70E": { bg: "bg-orange-500/15 text-orange-700 dark:text-orange-400", icon: Shield },
  "Arc Flash Safety": { bg: "bg-orange-500/15 text-orange-700 dark:text-orange-400", icon: Shield },
  "Siemens High Voltage Certified": { bg: "bg-blue-500/15 text-blue-700 dark:text-blue-400", icon: Zap },
  "PMP": { bg: "bg-violet-500/15 text-violet-700 dark:text-violet-400", icon: Award },
  "CDCMP": { bg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400", icon: Award },
  "Six Sigma Black Belt": { bg: "bg-slate-500/15 text-slate-700 dark:text-slate-300", icon: Award },
  "EPA 608 Universal": { bg: "bg-green-500/15 text-green-700 dark:text-green-400", icon: CheckCircle2 },
  "ASHRAE Certified": { bg: "bg-teal-500/15 text-teal-700 dark:text-teal-400", icon: Award },
  "LEED AP": { bg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: Star },
  "Carrier Chiller Specialist": { bg: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400", icon: Award },
  "BMS Controls Pro": { bg: "bg-sky-500/15 text-sky-700 dark:text-sky-400", icon: Award },
  "BICSI RCDD": { bg: "bg-purple-500/15 text-purple-700 dark:text-purple-400", icon: Award },
  "Cisco CCNP": { bg: "bg-blue-500/15 text-blue-700 dark:text-blue-400", icon: Award },
  "CDCDP": { bg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400", icon: Award },
  "Fiber Optic Pro": { bg: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400", icon: Star },
  "Corning Certified Installer": { bg: "bg-rose-500/15 text-rose-700 dark:text-rose-400", icon: CheckCircle2 },
  "CDCEP": { bg: "bg-teal-500/15 text-teal-700 dark:text-teal-400", icon: Award },
  "AEE CEM": { bg: "bg-lime-500/15 text-lime-700 dark:text-lime-400", icon: Award },
  "Uptime Tier Designer": { bg: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Star },
  "Uptime Institute ATD": { bg: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: Star },
  "Schneider Electric Certified": { bg: "bg-green-500/15 text-green-700 dark:text-green-400", icon: Zap },
  "Generator Systems Pro": { bg: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400", icon: Zap },
};

function getCertStyle(certName: string) {
  return certBadgeStyles[certName] || { bg: "bg-primary/10 text-primary", icon: Award };
}

export default function MobilePassport() {
  usePageMeta("Digital Passport | Flux", "Your verified professional profile with certifications and skills.");

  const { data: workers, isLoading: workersLoading } = useQuery<Worker[]>({ queryKey: ["/api/workers"] });
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CURRENT_WORKER_ID_KEY);
    if (stored) setSelectedWorkerId(stored);
  }, []);

  useEffect(() => {
    if (!selectedWorkerId && workers && workers.length > 0) {
      const id = workers[0].id;
      setSelectedWorkerId(id);
      localStorage.setItem(CURRENT_WORKER_ID_KEY, id);
    }
  }, [workers, selectedWorkerId]);

  const handleWorkerChange = (id: string) => {
    setSelectedWorkerId(id);
    localStorage.setItem(CURRENT_WORKER_ID_KEY, id);
  };

  const worker = workers?.find((w) => w.id === selectedWorkerId);

  const { data: assignments } = useQuery<ProjectAssignment[]>({
    queryKey: ["/api/project-assignments/worker", selectedWorkerId],
    enabled: !!selectedWorkerId,
  });

  const { data: applications } = useQuery<JobApplication[]>({
    queryKey: ["/api/job-applications", selectedWorkerId],
    enabled: !!selectedWorkerId,
  });

  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  if (workersLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-passport-title">Digital Passport</h1>
        </div>
        <Select value={selectedWorkerId || ""} onValueChange={handleWorkerChange}>
          <SelectTrigger data-testid="select-worker">
            <SelectValue placeholder="Select your profile" />
          </SelectTrigger>
          <SelectContent>
            {workers?.map((w) => (
              <SelectItem key={w.id} value={w.id} data-testid={`select-worker-${w.id}`}>
                {w.name} - {w.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {worker && (
        <div className="px-4 pb-6 space-y-4">
          <Card data-testid="card-worker-profile">
            <CardContent className="p-5">
              <div className="flex items-center gap-4 mb-4">
                <Avatar className="h-16 w-16 border-2 border-primary">
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {worker.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold truncate" data-testid="text-worker-name">{worker.name}</h2>
                  <p className="text-sm text-muted-foreground" data-testid="text-worker-title">{worker.title}</p>
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
              </div>

              <div className="space-y-2 text-sm">
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
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Award className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground" data-testid="text-certs-heading">
                Verified Certifications ({worker.certifications?.length || 0})
              </h3>
            </div>
            <div className="space-y-2" data-testid="certs-list">
              {worker.certifications?.map((cert, i) => {
                const style = getCertStyle(cert);
                const CertIcon = style.icon;
                return (
                  <Card key={i} className="overflow-visible" data-testid={`card-cert-${i}`}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={`flex items-center justify-center h-10 w-10 rounded-md ${style.bg} flex-shrink-0`}>
                        <CertIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{cert}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
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

          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Active Assignments ({assignments?.length || 0})
              </h3>
            </div>
            {assignments && assignments.length > 0 ? (
              <div className="space-y-2">
                {assignments.map((a) => {
                  const project = projects?.find((p) => p.id === a.projectId);
                  return (
                    <Card key={a.id} className="overflow-visible" data-testid={`card-assignment-${a.id}`}>
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

          {applications && applications.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Pending Applications ({applications.length})
                </h3>
              </div>
              <div className="space-y-2">
                {applications.map((a) => {
                  const project = projects?.find((p) => p.id === a.projectId);
                  return (
                    <Card key={a.id} className="overflow-visible" data-testid={`card-application-${a.id}`}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-md bg-amber-500/10 flex-shrink-0">
                          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{project?.name || "Unknown Project"}</p>
                          <p className="text-xs text-muted-foreground">Applied {a.appliedAt ? new Date(a.appliedAt).toLocaleDateString() : "recently"}</p>
                        </div>
                        <Badge variant="secondary" className="capitalize">{a.status}</Badge>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
