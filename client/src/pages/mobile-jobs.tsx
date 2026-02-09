import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Project, JobApplication } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageMeta } from "@/hooks/use-page-meta";
import { MapPin, Zap, DollarSign, ChevronUp, ChevronDown, Briefcase, X, Send, Building2, Clock } from "lucide-react";

const CURRENT_WORKER_ID_KEY = "flux_current_worker_id";

function getStoredWorkerId(): string | null {
  return localStorage.getItem(CURRENT_WORKER_ID_KEY);
}

const projectIcon = new L.DivIcon({
  html: `<div style="background: hsl(190 75% 42%); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></div>`,
  className: "",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

const activeProjectIcon = new L.DivIcon({
  html: `<div style="background: hsl(190 75% 42%); width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid hsl(35 85% 52%); box-shadow: 0 2px 12px rgba(0,0,0,0.4); animation: pulse 2s infinite;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></div>`,
  className: "",
  iconSize: [44, 44],
  iconAnchor: [22, 44],
  popupAnchor: [0, -44],
});

function FlyToProject({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 10, { duration: 0.8 });
  }, [lat, lng, map]);
  return null;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  planning: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  completed: "bg-muted text-muted-foreground",
  on_hold: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export default function MobileJobs() {
  usePageMeta("Find Jobs | Flux", "Discover nearby data center projects and apply with one tap.");

  const { data: projects, isLoading } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const workerId = getStoredWorkerId();
  const { data: applications } = useQuery<JobApplication[]>({
    queryKey: ["/api/job-applications", workerId],
    enabled: !!workerId,
  });

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const { toast } = useToast();

  const applyMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await apiRequest("POST", "/api/job-applications", {
        workerId,
        projectId,
        status: "pending",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-applications", workerId] });
      toast({ title: "Application Sent", description: "Your application has been submitted. You'll hear back soon." });
    },
  });

  const hasApplied = (projectId: string) => {
    return applications?.some((a) => a.projectId === projectId);
  };

  const activeProjects = projects?.filter((p) => p.status !== "completed" && p.latitude && p.longitude) || [];

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setSheetOpen(true);
    if (project.latitude && project.longitude) {
      setFlyTo({ lat: project.latitude, lng: project.longitude });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[300px] w-full rounded-md" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-mobile-jobs-title">Find Jobs</h1>
        </div>
        <p className="text-sm text-muted-foreground">{activeProjects.length} projects hiring near you</p>
      </div>

      <div className="mx-4 mb-3 rounded-md overflow-hidden border" style={{ height: "280px" }} data-testid="map-container">
        <MapContainer
          center={[37.5, -110.0]}
          zoom={4}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          {flyTo && <FlyToProject lat={flyTo.lat} lng={flyTo.lng} />}
          {activeProjects.map((project) => (
            <Marker
              key={project.id}
              position={[project.latitude!, project.longitude!]}
              icon={selectedProject?.id === project.id ? activeProjectIcon : projectIcon}
              eventHandlers={{
                click: () => handleSelectProject(project),
              }}
            >
              <Popup>
                <div className="font-sans text-sm">
                  <strong>{project.name}</strong>
                  <br />
                  {project.location}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Available Projects</h2>
        {activeProjects.map((project) => (
          <Card
            key={project.id}
            className={`hover-elevate cursor-pointer transition-all ${
              selectedProject?.id === project.id ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => handleSelectProject(project)}
            data-testid={`card-job-${project.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate" data-testid={`text-job-name-${project.id}`}>{project.name}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    {project.location}
                  </p>
                </div>
                <Badge className={statusColors[project.status] || ""} data-testid={`badge-job-status-${project.id}`}>
                  {project.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-3">
                {project.hourlyRate && (
                  <span className="text-sm font-medium text-primary flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {project.hourlyRate}
                  </span>
                )}
                {project.powerCapacity && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {project.powerCapacity}
                  </span>
                )}
                {project.tradesNeeded && project.tradesNeeded.length > 0 && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {project.tradesNeeded.length} trades
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {sheetOpen && selectedProject && (
        <div className="absolute inset-x-0 bottom-0 z-40 bg-card border-t rounded-t-2xl shadow-lg max-h-[60%] flex flex-col animate-in slide-in-from-bottom duration-300" data-testid="job-detail-sheet">
          <div className="flex items-center justify-between gap-2 flex-wrap p-4 border-b">
            <h2 className="font-bold text-lg truncate flex-1">{selectedProject.name}</h2>
            <Button size="icon" variant="ghost" onClick={() => setSheetOpen(false)} data-testid="button-close-sheet">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="overflow-auto p-4 space-y-4 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={statusColors[selectedProject.status] || ""}>{selectedProject.status}</Badge>
              {selectedProject.tier && (
                <Badge variant="outline">{selectedProject.tier.replace("_", " ").toUpperCase()}</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">{selectedProject.description}</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="text-sm font-medium">{selectedProject.client}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Pay Rate</p>
                  <p className="text-sm font-medium">{selectedProject.hourlyRate || "TBD"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Power</p>
                  <p className="text-sm font-medium">{selectedProject.powerCapacity}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Timeline</p>
                  <p className="text-sm font-medium">
                    {selectedProject.startDate ? new Date(selectedProject.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "TBD"}
                    {selectedProject.endDate ? ` - ${new Date(selectedProject.endDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
                  </p>
                </div>
              </div>
            </div>

            {selectedProject.tradesNeeded && selectedProject.tradesNeeded.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Trades Needed</p>
                <div className="flex flex-wrap gap-2">
                  {selectedProject.tradesNeeded.map((trade) => (
                    <Badge key={trade} variant="secondary">{trade}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t">
            {hasApplied(selectedProject.id) ? (
              <Button className="w-full" size="lg" disabled data-testid="button-applied">
                Applied
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={() => applyMutation.mutate(selectedProject.id)}
                disabled={applyMutation.isPending || !workerId}
                data-testid="button-apply-job"
              >
                {applyMutation.isPending ? (
                  "Applying..."
                ) : !workerId ? (
                  "Select worker in Passport first"
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Apply Now
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
