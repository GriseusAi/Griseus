import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Legend, Cell, PieChart, Pie,
} from "recharts";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  Brain,
  TrendingUp,
  Users,
  Clock,
  Route,
  Gauge,
  Target,
  Award,
  Zap,
  MapPin,
  ArrowRight,
  ChevronRight,
  BarChart3,
  Activity,
} from "lucide-react";

const GEBZE_CENTER: [number, number] = [40.80, 29.43];

interface TechnicianStats {
  technicianId: string;
  name: string;
  trade: string;
  location: string;
  totalJobs: number;
  completedJobs: number;
  scheduledJobs: number;
  cancelledJobs: number;
  utilization: number;
  jobsPerDay: number;
  completionRate: number;
  avgDuration: number;
  performanceScore: number;
  activeDays: number;
  dailyBreakdown: Array<{ date: string; jobs: number; minutes: number }>;
}

interface RouteData {
  technicianId: string;
  technicianName: string;
  date: string;
  stops: Array<{ title: string; lat: number | null; lng: number | null; time: string; address: string }>;
  totalDistanceKm: number;
  optimizedDistanceKm: number;
  savingsPercent: number;
  optimizedOrder: number[];
}

interface IntelligenceData {
  summary: {
    totalAppointments: number;
    completedCount: number;
    cancelledCount: number;
    activeTechnicians: number;
    avgUtilization: number;
    avgPerformance: number;
    avgJobsPerDay: number;
    totalSavingsKm: number;
  };
  technicians: TechnicianStats[];
  routeAnalysis: RouteData[];
  typeBreakdown: Array<{ type: string; count: number; completed: number; avgDuration: number }>;
}

const COLORS = ["#3B82F6", "#22C55E", "#EF4444", "#8B5CF6", "#F59E0B", "#EC4899"];
const TYPE_COLORS: Record<string, string> = {
  installation: "#3B82F6",
  maintenance: "#22C55E",
  repair: "#EF4444",
  inspection: "#8B5CF6",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-green-500/10";
  if (score >= 60) return "bg-amber-500/10";
  return "bg-red-500/10";
}

function utilizationColor(pct: number) {
  if (pct >= 85) return "#EF4444"; // overloaded
  if (pct >= 60) return "#22C55E"; // healthy
  if (pct >= 30) return "#F59E0B"; // underutilized
  return "#6B7280"; // idle
}

function createStopIcon(index: number, total: number) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const color = isFirst ? "#22C55E" : isLast ? "#EF4444" : "#3B82F6";
  const size = 28;

  return new L.DivIcon({
    html: `<div style="
      background: ${color};
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      color: white; font-weight: 700; font-size: 12px;
    ">${index + 1}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="p-4 rounded-full bg-primary/5 mb-4">
        <Brain className="h-12 w-12 text-primary/40" />
      </div>
      <h2 className="text-xl font-semibold mb-2">No Scheduling Data Yet</h2>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        Create service appointments and assign technicians to see intelligence metrics.
        The dashboard will compute utilization rates, performance scores, and route
        optimization once there is data to analyze.
      </p>
      <div className="grid grid-cols-4 gap-6 mt-8 text-left max-w-2xl">
        {[
          { icon: Gauge, label: "Utilization Rate", desc: "Hours booked vs available capacity per technician" },
          { icon: BarChart3, label: "Jobs / Day", desc: "Daily throughput and workload distribution" },
          { icon: Route, label: "Route Optimization", desc: "Travel distance savings with optimized stop order" },
          { icon: Award, label: "Performance Score", desc: "Composite score: utilization, completion, consistency" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="space-y-1">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Scheduling() {
  usePageMeta("Scheduling Intelligence", "AI-powered workforce analytics for service operations");
  const [selectedRoute, setSelectedRoute] = useState<string>("all");

  const { data, isLoading } = useQuery<IntelligenceData>({
    queryKey: ["/api/scheduling/intelligence"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (!data || data.summary.totalAppointments === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Brain className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Scheduling Intelligence</h1>
          <Badge variant="outline">Çukurova Isı Sistemleri</Badge>
        </div>
        <EmptyState />
      </div>
    );
  }

  const { summary, technicians, routeAnalysis, typeBreakdown } = data;

  // Prepare chart data
  const utilizationData = technicians.map(t => ({
    name: t.name.split(" ")[0],
    utilization: t.utilization,
    fill: utilizationColor(t.utilization),
  }));

  const jobsPerDayData = technicians.map(t => ({
    name: t.name.split(" ")[0],
    jobsPerDay: t.jobsPerDay,
  }));

  const pieData = typeBreakdown.filter(t => t.count > 0).map(t => ({
    name: t.type.charAt(0).toUpperCase() + t.type.slice(1),
    value: t.count,
    fill: TYPE_COLORS[t.type] || "#6B7280",
  }));

  // Route for map view
  const routeOptions = routeAnalysis.map(r => ({
    id: `${r.technicianId}-${r.date}`,
    label: `${r.technicianName} — ${r.date}`,
    data: r,
  }));
  const activeRoute = selectedRoute !== "all"
    ? routeOptions.find(r => r.id === selectedRoute)?.data
    : null;

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Scheduling Intelligence</h1>
          <Badge variant="outline">Çukurova Isı Sistemleri</Badge>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-blue-500/10">
                <Activity className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-xs text-muted-foreground">Appointments</span>
            </div>
            <p className="text-2xl font-bold">{summary.totalAppointments}</p>
            <p className="text-xs text-muted-foreground">
              {summary.completedCount} completed, {summary.cancelledCount} cancelled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-green-500/10">
                <Gauge className="h-4 w-4 text-green-500" />
              </div>
              <span className="text-xs text-muted-foreground">Avg Utilization</span>
            </div>
            <p className="text-2xl font-bold">{summary.avgUtilization}%</p>
            <Progress value={summary.avgUtilization} className="h-1.5 mt-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-amber-500/10">
                <BarChart3 className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-xs text-muted-foreground">Avg Jobs/Day</span>
            </div>
            <p className="text-2xl font-bold">{summary.avgJobsPerDay}</p>
            <p className="text-xs text-muted-foreground">
              across {summary.activeTechnicians} technician{summary.activeTechnicians !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`p-1.5 rounded-md ${scoreBg(summary.avgPerformance)}`}>
                <Award className={`h-4 w-4 ${scoreColor(summary.avgPerformance)}`} />
              </div>
              <span className="text-xs text-muted-foreground">Performance</span>
            </div>
            <p className={`text-2xl font-bold ${scoreColor(summary.avgPerformance)}`}>
              {summary.avgPerformance}
            </p>
            <p className="text-xs text-muted-foreground">composite score / 100</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-purple-500/10">
                <Route className="h-4 w-4 text-purple-500" />
              </div>
              <span className="text-xs text-muted-foreground">Route Savings</span>
            </div>
            <p className="text-2xl font-bold">{summary.totalSavingsKm} km</p>
            <p className="text-xs text-muted-foreground">
              from {routeAnalysis.length} optimized route{routeAnalysis.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Utilization + Jobs/Day + Type Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        {/* Technician Utilization */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Technician Utilization
            </CardTitle>
            <CardDescription className="text-xs">Booked hours vs 8h/day capacity</CardDescription>
          </CardHeader>
          <CardContent>
            {utilizationData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={utilizationData} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} fontSize={11} />
                  <YAxis type="category" dataKey="name" width={60} fontSize={11} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Utilization"]} />
                  <Bar dataKey="utilization" radius={[0, 4, 4, 0]} barSize={20}>
                    {utilizationData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No technician data</p>
            )}
          </CardContent>
        </Card>

        {/* Jobs Per Day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Jobs Per Day
            </CardTitle>
            <CardDescription className="text-xs">Average daily throughput per technician</CardDescription>
          </CardHeader>
          <CardContent>
            {jobsPerDayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={jobsPerDayData} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => [v, "Jobs/Day"]} />
                  <Bar dataKey="jobsPerDay" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Type Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4" />
              Job Type Distribution
            </CardTitle>
            <CardDescription className="text-xs">Breakdown by service category</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="flex items-center">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} innerRadius={40} dataKey="value" strokeWidth={2}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {typeBreakdown.filter(t => t.count > 0).map(t => (
                    <div key={t.type} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ background: TYPE_COLORS[t.type] }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium capitalize">{t.type}</p>
                        <p className="text-[10px] text-muted-foreground">{t.count} jobs, avg {t.avgDuration}m</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Technician Performance Table + Route Optimization Map */}
      <div className="grid grid-cols-2 gap-4">
        {/* Performance Scorecards */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="h-4 w-4" />
              Workforce Performance Scores
            </CardTitle>
            <CardDescription className="text-xs">
              Composite: 40% utilization + 30% completion + 20% throughput + 10% consistency
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {technicians.length > 0 ? (
              [...technicians]
                .sort((a, b) => b.performanceScore - a.performanceScore)
                .map((tech, idx) => (
                  <div key={tech.technicianId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${scoreBg(tech.performanceScore)} ${scoreColor(tech.performanceScore)}`}>
                      {tech.performanceScore}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{tech.name}</p>
                        {idx === 0 && technicians.length > 1 && (
                          <Badge variant="outline" className="text-[10px] py-0 text-amber-600 border-amber-300">Top Performer</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{tech.trade} — {tech.location}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-center shrink-0">
                      <div>
                        <p className="text-xs font-semibold">{tech.utilization}%</p>
                        <p className="text-[10px] text-muted-foreground">Util.</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{tech.completionRate}%</p>
                        <p className="text-[10px] text-muted-foreground">Compl.</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{tech.jobsPerDay}</p>
                        <p className="text-[10px] text-muted-foreground">Jobs/d</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{tech.totalJobs}</p>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                      </div>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">Assign technicians to appointments to see scores</p>
            )}
          </CardContent>
        </Card>

        {/* Route Optimization Map */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  Route Optimization
                </CardTitle>
                <CardDescription className="text-xs">
                  Nearest-neighbor algorithm for minimum travel distance
                </CardDescription>
              </div>
              {routeOptions.length > 0 && (
                <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                  <SelectTrigger className="w-56 h-8 text-xs">
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All routes overview</SelectItem>
                    {routeOptions.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {routeAnalysis.length > 0 ? (
              <div className="space-y-3">
                {activeRoute ? (
                  <>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Current:</span>
                        <span className="font-semibold">{activeRoute.totalDistanceKm} km</span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Optimized:</span>
                        <span className="font-semibold text-green-600">{activeRoute.optimizedDistanceKm} km</span>
                      </div>
                      {activeRoute.savingsPercent > 0 && (
                        <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">
                          {activeRoute.savingsPercent}% savings
                        </Badge>
                      )}
                    </div>
                    <div className="rounded-lg overflow-hidden border h-[220px]">
                      <MapContainer
                        key={selectedRoute}
                        center={
                          activeRoute.stops.find(s => s.lat && s.lng)
                            ? [activeRoute.stops.find(s => s.lat && s.lng)!.lat!, activeRoute.stops.find(s => s.lat && s.lng)!.lng!]
                            : GEBZE_CENTER
                        }
                        zoom={12}
                        style={{ height: "100%", width: "100%" }}
                        zoomControl={false}
                      >
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                        {/* Optimized route polyline */}
                        {(() => {
                          const geoStops = activeRoute.stops.filter(s => s.lat && s.lng);
                          const ordered = activeRoute.optimizedOrder.map(i => geoStops[i]).filter(Boolean);
                          if (ordered.length < 2) return null;
                          return (
                            <Polyline
                              positions={ordered.map(s => [s.lat!, s.lng!] as [number, number])}
                              pathOptions={{ color: "#3B82F6", weight: 3, dashArray: "8 4" }}
                            />
                          );
                        })()}
                        {/* Stop markers */}
                        {activeRoute.stops
                          .filter(s => s.lat && s.lng)
                          .map((stop, idx, arr) => (
                            <Marker
                              key={idx}
                              position={[stop.lat!, stop.lng!]}
                              icon={createStopIcon(idx, arr.length)}
                            >
                              <Popup>
                                <div className="text-xs space-y-0.5">
                                  <p className="font-bold">{stop.title}</p>
                                  <p className="text-gray-500">{stop.time} — {stop.address}</p>
                                </div>
                              </Popup>
                            </Marker>
                          ))}
                      </MapContainer>
                    </div>
                  </>
                ) : (
                  /* Route summary table */
                  <div className="space-y-2 max-h-[260px] overflow-auto">
                    {routeAnalysis.map((route, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedRoute(`${route.technicianId}-${route.date}`)}
                      >
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{route.technicianName} — {route.date}</p>
                          <p className="text-[10px] text-muted-foreground">{route.stops.length} stops</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium">{route.totalDistanceKm} → {route.optimizedDistanceKm} km</p>
                          {route.savingsPercent > 0 && (
                            <p className="text-[10px] text-green-600 font-medium">{route.savingsPercent}% savings</p>
                          )}
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                    {routeAnalysis.length === 0 && (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        Routes appear when technicians have 2+ geo-located stops per day
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <Route className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Add geo-located appointments with assigned technicians to see route optimization
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
