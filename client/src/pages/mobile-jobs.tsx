import { useState, useEffect, useRef, useMemo } from "react";
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
import {
  MapPin,
  Zap,
  DollarSign,
  ChevronUp,
  ChevronDown,
  Briefcase,
  X,
  Send,
  Building2,
  Clock,
  Search,
  SlidersHorizontal,
  Navigation,
  Users,
  Layers,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────
const CURRENT_WORKER_ID_KEY = "griseus_current_worker_id";
const US_CENTER: [number, number] = [39.0, -98.0];
const DEFAULT_ZOOM = 4;
const SELECTED_ZOOM = 10;

const TRADE_FILTERS = [
  { key: "all", label: "All Trades", icon: Layers },
  { key: "Electrician", label: "Electrical", icon: Zap },
  { key: "HVAC Technician", label: "HVAC", icon: SlidersHorizontal },
  { key: "Network Technician", label: "Network", icon: Navigation },
  { key: "Facility Engineer", label: "Facility", icon: Building2 },
  { key: "Project Manager", label: "PM", icon: Users },
  { key: "General Labor", label: "General", icon: Briefcase },
];

// ─── Helpers ─────────────────────────────────────────────────────────
function getStoredWorkerId(): string | null {
  return localStorage.getItem(CURRENT_WORKER_ID_KEY);
}

// ─── Map Icons ───────────────────────────────────────────────────────
function createMarkerIcon(isSelected: boolean) {
  const size = isSelected ? 46 : 36;
  const borderColor = isSelected ? "#9F6C52" : "white";
  const shadow = isSelected
    ? "0 0 0 4px rgba(159, 108, 82, 0.3), 0 2px 12px rgba(0,0,0,0.2)"
    : "0 2px 8px rgba(0,0,0,0.15)";
  const pulse = isSelected ? "animation: pulse 2s infinite;" : "";

  return new L.DivIcon({
    html: `<div style="
      background: #92ABBB;
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 3px solid ${borderColor};
      box-shadow: ${shadow};
      transition: all 0.2s ease;
      ${pulse}
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="${isSelected ? 22 : 18}" height="${isSelected ? 22 : 18}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

const projectIcon = createMarkerIcon(false);
const activeProjectIcon = createMarkerIcon(true);

// ─── Map Controller ──────────────────────────────────────────────────
function FlyToProject({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], SELECTED_ZOOM, { duration: 0.8 });
  }, [lat, lng, map]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onMapClick();
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [map, onMapClick]);
  return null;
}

// ─── Status Colors ───────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  planning: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-gray-100 text-gray-600",
  on_hold: "bg-amber-50 text-amber-700 border-amber-200",
};

const tradeColors: Record<string, string> = {
  Electrician: "bg-amber-50 text-amber-700",
  "HVAC Technician": "bg-sky-50 text-sky-700",
  "Network Technician": "bg-violet-50 text-violet-700",
  "Facility Engineer": "bg-emerald-50 text-emerald-700",
  "Project Manager": "bg-rose-50 text-rose-700",
  "General Labor": "bg-slate-100 text-slate-600",
  "Fire Protection": "bg-red-50 text-red-700",
};

// ─── Bottom Sheet States ─────────────────────────────────────────────
type SheetState = "collapsed" | "peek" | "expanded";

// ─── Main Component ──────────────────────────────────────────────────
export default function MobileJobs() {
  usePageMeta(
    "Find Jobs | Griseus",
    "Discover nearby data center projects and apply with one tap."
  );

  // Data
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  const workerId = getStoredWorkerId();
  const { data: applications } = useQuery<JobApplication[]>({
    queryKey: ["/api/job-applications", workerId],
    enabled: !!workerId,
  });

  // UI State
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>("peek");
  const [activeTrade, setActiveTrade] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartSheetState = useRef<SheetState>("peek");
  const { toast } = useToast();

  // Mutations
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
      queryClient.invalidateQueries({
        queryKey: ["/api/job-applications", workerId],
      });
      toast({
        title: "Application Sent",
        description: "Your application has been submitted.",
      });
    },
  });

  const hasApplied = (projectId: string) => {
    return applications?.some((a) => a.projectId === projectId);
  };

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter((p) => {
      if (p.status === "completed") return false;
      if (!p.latitude || !p.longitude) return false;
      if (activeTrade !== "all" && !p.tradesNeeded?.includes(activeTrade))
        return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          p.client.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [projects, activeTrade, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const rates = filteredProjects
      .map((p) => {
        const match = p.hourlyRate?.match(/\$(\d+)/);
        return match ? parseInt(match[1]) : null;
      })
      .filter(Boolean) as number[];
    const avgRate =
      rates.length > 0
        ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
        : 0;
    const tradeSet = new Set(filteredProjects.flatMap((p) => p.tradesNeeded || []));
    return {
      count: filteredProjects.length,
      avgRate,
      trades: tradeSet.size,
    };
  }, [filteredProjects]);

  // Handlers
  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setSheetState("collapsed");
    if (project.latitude && project.longitude) {
      setFlyTo({ lat: project.latitude, lng: project.longitude });
    }
  };

  const handleCloseDetail = () => {
    setSelectedProject(null);
    setSheetState("peek");
  };

  const handleMapClick = () => {
    if (selectedProject) {
      handleCloseDetail();
    }
  };

  // Sheet drag handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartSheetState.current = sheetState;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - dragStartY.current;
    const threshold = 50;

    if (deltaY < -threshold) {
      // Swiped up
      if (sheetState === "collapsed") setSheetState("peek");
      else if (sheetState === "peek") setSheetState("expanded");
    } else if (deltaY > threshold) {
      // Swiped down
      if (sheetState === "expanded") setSheetState("peek");
      else if (sheetState === "peek") setSheetState("collapsed");
    }
  };

  const sheetHeight: Record<SheetState, string> = {
    collapsed: "h-0",
    peek: "h-[38%]",
    expanded: "h-[75%]",
  };

  // ─── Loading State ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="p-4 space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-[50vh] w-full rounded-md" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-background">
      {/* ── Full-screen Map ──────────────────────────────────────── */}
      <div className="absolute inset-0 z-0" data-testid="map-container">
        <MapContainer
          center={US_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          {flyTo && <FlyToProject lat={flyTo.lat} lng={flyTo.lng} />}
          <MapClickHandler onMapClick={handleMapClick} />
          {filteredProjects.map((project) => (
            <Marker
              key={project.id}
              position={[project.latitude!, project.longitude!]}
              icon={
                selectedProject?.id === project.id
                  ? activeProjectIcon
                  : projectIcon
              }
              eventHandlers={{
                click: () => handleSelectProject(project),
              }}
            >
              <Popup>
                <div className="font-sans text-sm">
                  <strong>{project.name}</strong>
                  <br />
                  <span className="text-muted-foreground">
                    {project.location}
                  </span>
                  {project.hourlyRate && (
                    <>
                      <br />
                      <span className="text-primary font-medium">
                        {project.hourlyRate}
                      </span>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* ── Top Overlay: Search + Filters ────────────────────────── */}
      <div className="relative z-10 pointer-events-none">
        <div className="p-4 pb-2 space-y-3 pointer-events-auto">
          {/* Search Bar */}
          <div
            className={`flex items-center gap-2 bg-card/95 backdrop-blur-md border rounded-xl px-3 h-11 transition-all ${
              searchFocused ? "ring-2 ring-primary/40" : ""
            }`}
          >
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search projects, locations..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              data-testid="input-job-search"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Trade Filter Chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {TRADE_FILTERS.map((filter) => {
              const isActive = activeTrade === filter.key;
              const Icon = filter.icon;
              return (
                <button
                  key={filter.key}
                  onClick={() => setActiveTrade(filter.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-card/90 backdrop-blur-md text-muted-foreground border border-border/50 hover:text-foreground"
                  }`}
                  data-testid={`filter-trade-${filter.key}`}
                >
                  <Icon className="h-3 w-3" />
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats Strip */}
        <div className="flex items-center justify-center gap-4 px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-4 bg-card/90 backdrop-blur-md border rounded-full px-4 py-1.5 text-xs">
            <span className="flex items-center gap-1 font-medium">
              <MapPin className="h-3 w-3 text-primary" />
              {stats.count} jobs
            </span>
            <span className="w-px h-3 bg-border" />
            <span className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Avg ${stats.avgRate}/hr
            </span>
            <span className="w-px h-3 bg-border" />
            <span className="flex items-center gap-1 text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              {stats.trades} trades
            </span>
          </div>
        </div>
      </div>

      {/* ── Selected Project Detail Card ─────────────────────────── */}
      {selectedProject && (
        <div
          className="absolute inset-x-0 bottom-0 z-30 animate-in slide-in-from-bottom duration-300"
          data-testid="job-detail-sheet"
        >
          <div className="mx-3 mb-3 bg-card/95 backdrop-blur-md border rounded-2xl shadow-xl overflow-hidden card-accent-top">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 p-4 pb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    className={`text-[10px] ${statusColors[selectedProject.status] || ""}`}
                  >
                    {selectedProject.status}
                  </Badge>
                  {selectedProject.tier && (
                    <Badge variant="outline" className="text-[10px]">
                      {selectedProject.tier.replace("_", " ").toUpperCase()}
                    </Badge>
                  )}
                </div>
                <h2
                  className="font-bold text-base leading-tight"
                  data-testid="text-selected-job-name"
                >
                  {selectedProject.name}
                </h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3" />
                  {selectedProject.location}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={handleCloseDetail}
                data-testid="button-close-sheet"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Info Grid */}
            <div className="px-4 pb-3 grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-lg bg-success/10">
                <DollarSign className="h-4 w-4 mx-auto mb-1 text-success" />
                <p className="text-xs font-semibold text-success">
                  {selectedProject.hourlyRate || "TBD"}
                </p>
                <p className="text-[10px] text-muted-foreground">Pay Rate</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-background/50">
                <Zap className="h-4 w-4 mx-auto mb-1 text-amber-400" />
                <p className="text-xs font-semibold">
                  {selectedProject.powerCapacity || "N/A"}
                </p>
                <p className="text-[10px] text-muted-foreground">Power</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-background/50">
                <Clock className="h-4 w-4 mx-auto mb-1 text-sky-400" />
                <p className="text-xs font-semibold">
                  {selectedProject.startDate
                    ? new Date(selectedProject.startDate).toLocaleDateString(
                        "en-US",
                        { month: "short", year: "2-digit" }
                      )
                    : "TBD"}
                </p>
                <p className="text-[10px] text-muted-foreground">Start</p>
              </div>
            </div>

            {/* Description */}
            {selectedProject.description && (
              <div className="px-4 pb-3">
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {selectedProject.description}
                </p>
              </div>
            )}

            {/* Trades */}
            {selectedProject.tradesNeeded &&
              selectedProject.tradesNeeded.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProject.tradesNeeded.map((trade) => (
                      <Badge
                        key={trade}
                        variant="secondary"
                        className={`text-[10px] ${tradeColors[trade] || ""}`}
                      >
                        {trade}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

            {/* Apply Button */}
            <div className="p-4 pt-2 border-t border-border/50">
              {hasApplied(selectedProject.id) ? (
                <Button
                  className="w-full"
                  size="lg"
                  disabled
                  data-testid="button-applied"
                >
                  <Briefcase className="h-4 w-4 mr-2" />
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
                      <Send className="h-4 w-4 mr-2" />
                      Quick Apply
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Sheet: Project List ────────────────────────────── */}
      {!selectedProject && (
        <div
          ref={sheetRef}
          className={`absolute inset-x-0 bottom-0 z-20 bg-card/95 backdrop-blur-md border-t rounded-t-2xl shadow-lg flex flex-col transition-all duration-300 ease-out ${sheetHeight[sheetState]}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          data-testid="project-list-sheet"
        >
          {/* Drag Handle */}
          <div className="flex flex-col items-center pt-2 pb-1 cursor-grab">
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Sheet Header */}
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Available Projects</h2>
              <Badge variant="secondary" className="text-[10px]">
                {filteredProjects.length}
              </Badge>
            </div>
            <button
              onClick={() =>
                setSheetState(sheetState === "expanded" ? "peek" : "expanded")
              }
              className="text-muted-foreground hover:text-foreground p-1"
              data-testid="button-toggle-sheet"
            >
              {sheetState === "expanded" ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Project Cards */}
          <div className="flex-1 overflow-auto px-4 pb-4 space-y-2.5">
            {filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Search className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No projects match your filters
                </p>
                <button
                  onClick={() => {
                    setActiveTrade("all");
                    setSearchQuery("");
                  }}
                  className="text-xs text-primary mt-1 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  className="cursor-pointer transition-all active:scale-[0.98] hover:border-primary/20"
                  onClick={() => handleSelectProject(project)}
                  data-testid={`card-job-${project.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3
                          className="font-semibold text-sm truncate"
                          data-testid={`text-job-name-${project.id}`}
                        >
                          {project.name}
                        </h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          {project.location}
                          <span className="mx-1 text-border">|</span>
                          <Building2 className="h-3 w-3 flex-shrink-0" />
                          {project.client}
                        </p>
                      </div>
                      <Badge
                        className={`text-[10px] shrink-0 ${statusColors[project.status] || ""}`}
                        data-testid={`badge-job-status-${project.id}`}
                      >
                        {project.status}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {project.hourlyRate && (
                        <span className="text-xs font-semibold text-primary flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {project.hourlyRate}
                        </span>
                      )}
                      {project.powerCapacity && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          {project.powerCapacity}
                        </span>
                      )}
                      {project.tradesNeeded &&
                        project.tradesNeeded.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {project.tradesNeeded.slice(0, 2).map((trade) => (
                              <Badge
                                key={trade}
                                variant="secondary"
                                className={`text-[10px] py-0 ${tradeColors[trade] || ""}`}
                              >
                                {trade.split(" ")[0]}
                              </Badge>
                            ))}
                            {project.tradesNeeded.length > 2 && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] py-0"
                              >
                                +{project.tradesNeeded.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
