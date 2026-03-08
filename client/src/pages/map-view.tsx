import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Project } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  MapPin,
  Search,
  Building2,
  Zap,
  Globe,
  Layers,
} from "lucide-react";

const GEBZE_CENTER: [number, number] = [40.80, 29.43];
const DEFAULT_ZOOM = 10;

const statusColors: Record<string, string> = {
  active: "#22C55E",
  planning: "#3B82F6",
  completed: "#6B7280",
};

function createProjectIcon(status: string, isSelected: boolean) {
  const color = statusColors[status] || "#3B82F6";
  const size = isSelected ? 44 : 34;
  const border = isSelected ? `3px solid #F59E0B` : `2px solid white`;
  const shadow = isSelected
    ? "0 0 0 4px rgba(245,158,11,0.3), 0 2px 12px rgba(0,0,0,0.25)"
    : "0 2px 8px rgba(0,0,0,0.2)";

  return new L.DivIcon({
    html: `<div style="
      background: ${color};
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: ${border};
      box-shadow: ${shadow};
      transition: all 0.2s ease;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="${isSelected ? 20 : 16}" height="${isSelected ? 20 : 16}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
        <path d="M9 22v-4h6v4"></path>
        <path d="M8 6h.01"></path><path d="M16 6h.01"></path>
        <path d="M12 6h.01"></path><path d="M12 10h.01"></path>
        <path d="M12 14h.01"></path><path d="M16 10h.01"></path>
        <path d="M16 14h.01"></path><path d="M8 10h.01"></path>
        <path d="M8 14h.01"></path>
      </svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function FlyToProject({ project }: { project: Project | null }) {
  const map = useMap();
  if (project?.latitude && project?.longitude) {
    map.flyTo([project.latitude, project.longitude], 13, { duration: 1 });
  }
  return null;
}

export default function MapView() {
  usePageMeta("Map View", "Geographic overview of all projects and operations");
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const mappableProjects = useMemo(
    () => projects.filter((p) => p.latitude && p.longitude),
    [projects],
  );

  const filtered = useMemo(() => {
    if (!search) return mappableProjects;
    const q = search.toLowerCase();
    return mappableProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q),
    );
  }, [mappableProjects, search]);

  const center: [number, number] = useMemo(() => {
    if (filtered.length === 0) return GEBZE_CENTER;
    const lats = filtered.map((p) => p.latitude!);
    const lngs = filtered.map((p) => p.longitude!);
    return [
      lats.reduce((a, b) => a + b, 0) / lats.length,
      lngs.reduce((a, b) => a + b, 0) / lngs.length,
    ];
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Map View</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              Active
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              Planning
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-gray-500" />
              Completed
            </div>
          </div>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects, locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Map + Sidebar */}
      <div className="flex flex-1 min-h-0 gap-3 p-4 pt-2">
        {/* Sidebar list */}
        <div className="w-80 flex-shrink-0 overflow-auto space-y-2 pr-1">
          <p className="text-xs text-muted-foreground font-medium px-1">
            {filtered.length} project{filtered.length !== 1 ? "s" : ""} on map
          </p>
          {filtered.map((project) => (
            <Card
              key={project.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedProject?.id === project.id
                  ? "ring-2 ring-primary shadow-md"
                  : ""
              }`}
              onClick={() =>
                setSelectedProject(
                  selectedProject?.id === project.id ? null : project,
                )
              }
            >
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-tight line-clamp-2">
                    {project.name}
                  </h3>
                  <Badge
                    variant={
                      project.status === "active" ? "default" : "secondary"
                    }
                    className="text-[10px] shrink-0"
                  >
                    {project.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {project.location}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {project.client}
                </div>
                {project.tradesNeeded && project.tradesNeeded.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {project.tradesNeeded.slice(0, 3).map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="text-[10px] py-0"
                      >
                        {t}
                      </Badge>
                    ))}
                    {project.tradesNeeded.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{project.tradesNeeded.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border shadow-sm">
          <MapContainer
            center={center}
            zoom={DEFAULT_ZOOM}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <FlyToProject project={selectedProject} />
            {filtered.map((project) => (
              <Marker
                key={project.id}
                position={[project.latitude!, project.longitude!]}
                icon={createProjectIcon(
                  project.status,
                  selectedProject?.id === project.id,
                )}
                eventHandlers={{
                  click: () => setSelectedProject(project),
                }}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[180px]">
                    <p className="font-bold">{project.name}</p>
                    <p className="text-gray-600">{project.client}</p>
                    <p className="text-gray-500 text-xs">{project.location}</p>
                    {project.description && (
                      <p className="text-gray-500 text-xs line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
