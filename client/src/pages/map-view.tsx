import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Project, ServiceAppointment, Worker } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  MapPin,
  Search,
  Building2,
  Globe,
  Calendar,
  Clock,
  Users,
  Wrench,
} from "lucide-react";

// ─── HQ Pin ─────────────────────────────────────────────────────────
const CUKUROVA_HQ: [number, number] = [40.7833, 29.4333];
const GEBZE_CENTER: [number, number] = [40.7833, 29.4333];
const DEFAULT_ZOOM = 11;

function createHQIcon() {
  const size = 48;
  return new L.DivIcon({
    html: `<div style="
      background: linear-gradient(135deg, #1E3A5F, #2563EB);
      width: ${size}px; height: ${size}px;
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      border: 3px solid white;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.3), 0 4px 16px rgba(0,0,0,0.3);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

// ─── Project Icons ───────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  active: "#22C55E",
  planning: "#3B82F6",
  completed: "#6B7280",
};

function createProjectIcon(status: string, isSelected: boolean) {
  const color = statusColors[status] || "#3B82F6";
  const size = isSelected ? 40 : 32;
  const border = isSelected ? `3px solid #F59E0B` : `2px solid white`;
  const shadow = isSelected
    ? "0 0 0 3px rgba(245,158,11,0.3), 0 2px 12px rgba(0,0,0,0.25)"
    : "0 2px 8px rgba(0,0,0,0.2)";

  return new L.DivIcon({
    html: `<div style="
      background: ${color};
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: ${border};
      box-shadow: ${shadow};
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="${isSelected ? 18 : 14}" height="${isSelected ? 18 : 14}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
      </svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

// ─── Appointment Icons ───────────────────────────────────────────────
const typeColors: Record<string, string> = {
  installation: "#3B82F6",
  maintenance: "#22C55E",
  repair: "#EF4444",
  inspection: "#8B5CF6",
};

function createAppointmentIcon(type: string, status: string) {
  const color = status === "in_progress" ? "#F59E0B" : (typeColors[type] || "#3B82F6");
  const size = 26;
  return new L.DivIcon({
    html: `<div style="
      background: ${color};
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid white;
      box-shadow: 0 1px 6px rgba(0,0,0,0.2);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
      </svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

// ─── Technician Icons ────────────────────────────────────────────────
function createTechnicianIcon() {
  const size = 28;
  return new L.DivIcon({
    html: `<div style="
      background: #7C3AED;
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid white;
      box-shadow: 0 1px 6px rgba(0,0,0,0.2);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
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

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Technician location approximations from their location strings ──
// In production this would come from GPS; here we offset from HQ
const locationOffsets: Record<string, [number, number]> = {
  "Gebze, Kocaeli": [0.005, 0.008],
  "Darıca, Kocaeli": [-0.015, -0.045],
  "Çayırova, Kocaeli": [0.03, -0.02],
  "Tuzla, Istanbul": [0.02, -0.11],
};

export default function MapView() {
  usePageMeta("Map View", "Service area overview — projects, appointments, and technicians");
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const { data: projects = [], isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: appointments = [], isLoading: loadingAppts } = useQuery<ServiceAppointment[]>({
    queryKey: ["/api/service-appointments"],
  });

  const { data: workers = [] } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
  });

  const isLoading = loadingProjects || loadingAppts;

  // Workers with approximate coords
  const technicianPins = useMemo(() => {
    return workers
      .filter((w) => w.location)
      .map((w) => {
        const offset = locationOffsets[w.location] || [0, 0];
        return {
          ...w,
          lat: CUKUROVA_HQ[0] + offset[0],
          lng: CUKUROVA_HQ[1] + offset[1],
        };
      });
  }, [workers]);

  const mappableProjects = useMemo(
    () => projects.filter((p) => p.latitude && p.longitude),
    [projects],
  );

  const geoAppointments = useMemo(
    () => appointments.filter((a) => a.latitude && a.longitude && a.status !== "cancelled"),
    [appointments],
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
            <Badge variant="outline">Çukurova Isı Sistemleri</Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-[4px]" style={{ background: "linear-gradient(135deg, #1E3A5F, #2563EB)" }} />
              HQ
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              Active Project
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              Appointment
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: "#7C3AED" }} />
              Technician
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
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold">{filtered.length}</p>
              <p className="text-[10px] text-muted-foreground">Projects</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold">{geoAppointments.length}</p>
              <p className="text-[10px] text-muted-foreground">Appointments</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold">{technicianPins.length}</p>
              <p className="text-[10px] text-muted-foreground">Technicians</p>
            </div>
          </div>

          {/* Projects */}
          {filtered.length > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 pt-1">Projects</p>
          )}
          {filtered.map((project) => (
            <Card
              key={project.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedProject?.id === project.id ? "ring-2 ring-primary shadow-md" : ""
              }`}
              onClick={() =>
                setSelectedProject(selectedProject?.id === project.id ? null : project)
              }
            >
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-tight line-clamp-2">{project.name}</h3>
                  <Badge
                    variant={project.status === "active" ? "default" : "secondary"}
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
                      <Badge key={t} variant="outline" className="text-[10px] py-0">{t}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Appointments */}
          {geoAppointments.length > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 pt-2">Service Appointments</p>
          )}
          {geoAppointments.map((appt) => (
            <Card key={appt.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: typeColors[appt.appointmentType] || "#3B82F6" }} />
                  <p className="text-xs font-medium line-clamp-1">{appt.title}</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pl-4">
                  <span className="flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{appt.scheduledDate}</span>
                  <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{appt.scheduledTime}</span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 capitalize">{appt.appointmentType}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Technicians */}
          {technicianPins.length > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 pt-2">Field Technicians</p>
          )}
          {technicianPins.map((tech) => (
            <Card key={tech.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#7C3AED" }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{tech.name}</p>
                    <p className="text-[10px] text-muted-foreground">{tech.trade} — {tech.location}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border shadow-sm">
          <MapContainer
            center={GEBZE_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <FlyToProject project={selectedProject} />

            {/* ── HQ Marker ── */}
            <Marker position={CUKUROVA_HQ} icon={createHQIcon()}>
              <Popup>
                <div className="text-sm space-y-1 min-w-[200px]">
                  <p className="font-bold text-base">Çukurova Isı Sistemleri</p>
                  <p className="text-gray-600">Company Headquarters</p>
                  <p className="text-gray-500 text-xs">Gebze, Kocaeli, Turkey</p>
                  <p className="text-gray-500 text-xs">HVAC Manufacturing & Service Operations</p>
                </div>
              </Popup>
            </Marker>

            {/* ── Project Markers ── */}
            {filtered.map((project) => (
              <Marker
                key={project.id}
                position={[project.latitude!, project.longitude!]}
                icon={createProjectIcon(project.status, selectedProject?.id === project.id)}
                eventHandlers={{ click: () => setSelectedProject(project) }}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[180px]">
                    <p className="font-bold">{project.name}</p>
                    <p className="text-gray-600">{project.client}</p>
                    <p className="text-gray-500 text-xs">{project.location}</p>
                    {project.description && (
                      <p className="text-gray-500 text-xs line-clamp-2">{project.description}</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* ── Appointment Markers ── */}
            {geoAppointments.map((appt) => (
              <Marker
                key={`appt-${appt.id}`}
                position={[appt.latitude!, appt.longitude!]}
                icon={createAppointmentIcon(appt.appointmentType, appt.status)}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[200px]">
                    <p className="font-bold">{appt.title}</p>
                    <p className="text-gray-600">{appt.customerName}</p>
                    <p className="text-gray-500 text-xs">{appt.customerAddress}</p>
                    <p className="text-gray-500 text-xs">
                      {appt.scheduledDate} at {appt.scheduledTime} — {formatDuration(appt.estimatedDuration)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* ── Technician Markers ── */}
            {technicianPins.map((tech) => (
              <Marker
                key={`tech-${tech.id}`}
                position={[tech.lat, tech.lng]}
                icon={createTechnicianIcon()}
              >
                <Popup>
                  <div className="text-sm space-y-1 min-w-[160px]">
                    <p className="font-bold">{tech.name}</p>
                    <p className="text-gray-600">{tech.trade}</p>
                    <p className="text-gray-500 text-xs">{tech.location}</p>
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
