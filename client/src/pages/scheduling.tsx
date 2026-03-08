import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, LineChart, Line, Area, AreaChart, ReferenceLine,
} from "recharts";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ServiceAppointment, Worker } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  MapPin,
  ArrowRight,
  ChevronRight,
  BarChart3,
  Activity,
  Plus,
  Calendar,
  Thermometer,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

const GEBZE_CENTER: [number, number] = [40.7833, 29.4333];

// ─── Types ───────────────────────────────────────────────────────────

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

interface SeasonalMonth {
  month: string;
  actual: number;
  predicted: number;
  multiplier: number;
  isSurge: boolean;
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
  seasonalForecast: SeasonalMonth[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

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
  if (pct >= 85) return "#EF4444";
  if (pct >= 60) return "#22C55E";
  if (pct >= 30) return "#F59E0B";
  return "#6B7280";
}

function trustScoreLabel(score: number) {
  if (score >= 90) return "Exceptional";
  if (score >= 80) return "Trusted";
  if (score >= 65) return "Reliable";
  if (score >= 50) return "Developing";
  return "Needs Attention";
}

function createStopIcon(index: number, total: number) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const color = isFirst ? "#22C55E" : isLast ? "#EF4444" : "#3B82F6";
  const size = 28;
  return new L.DivIcon({
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);color:white;font-weight:700;font-size:12px;">${index + 1}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

// ─── Create Appointment Dialog ───────────────────────────────────────

function CreateAppointmentDialog({ workers }: { workers: Worker[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/service-appointments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/intelligence"] });
      setOpen(false);
      toast({ title: "Appointment created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const serviceWorkers = workers.filter(
    (w) => w.trade === "HVAC Technician" || w.trade === "Electrician" || w.trade === "Facility Engineer",
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Appointment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Service Appointment</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            mutation.mutate({
              title: fd.get("title"),
              appointmentType: fd.get("appointmentType"),
              priority: fd.get("priority"),
              scheduledDate: fd.get("scheduledDate"),
              scheduledTime: fd.get("scheduledTime"),
              estimatedDuration: Number(fd.get("estimatedDuration")),
              customerName: fd.get("customerName"),
              customerPhone: fd.get("customerPhone") || undefined,
              customerAddress: fd.get("customerAddress"),
              latitude: fd.get("latitude") ? Number(fd.get("latitude")) : undefined,
              longitude: fd.get("longitude") ? Number(fd.get("longitude")) : undefined,
              description: fd.get("description") || undefined,
              assigneeId: fd.get("assigneeId") || undefined,
            });
          }}
          className="space-y-3"
        >
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required placeholder="e.g. VRF Installation - Gebze OSB" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="appointmentType">Type</Label>
              <select name="appointmentType" id="appointmentType" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" required>
                <option value="installation">Installation</option>
                <option value="maintenance">Maintenance</option>
                <option value="repair">Repair</option>
                <option value="inspection">Inspection</option>
              </select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <select name="priority" id="priority" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" required>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="scheduledDate">Date</Label>
              <Input id="scheduledDate" name="scheduledDate" type="date" required />
            </div>
            <div>
              <Label htmlFor="scheduledTime">Time</Label>
              <Input id="scheduledTime" name="scheduledTime" type="time" required />
            </div>
            <div>
              <Label htmlFor="estimatedDuration">Duration (min)</Label>
              <Input id="estimatedDuration" name="estimatedDuration" type="number" defaultValue="60" required />
            </div>
          </div>
          <div>
            <Label htmlFor="assigneeId">Assign Technician</Label>
            <select name="assigneeId" id="assigneeId" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              <option value="">Unassigned</option>
              {serviceWorkers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.trade}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="customerName">Customer Name</Label>
            <Input id="customerName" name="customerName" required />
          </div>
          <div>
            <Label htmlFor="customerPhone">Phone</Label>
            <Input id="customerPhone" name="customerPhone" placeholder="+90 ..." />
          </div>
          <div>
            <Label htmlFor="customerAddress">Address</Label>
            <Input id="customerAddress" name="customerAddress" required placeholder="Full address" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="latitude">Latitude</Label>
              <Input id="latitude" name="latitude" type="number" step="any" placeholder="40.78" />
            </div>
            <div>
              <Label htmlFor="longitude">Longitude</Label>
              <Input id="longitude" name="longitude" type="number" step="any" placeholder="29.43" />
            </div>
          </div>
          <div>
            <Label htmlFor="description">Notes</Label>
            <Textarea id="description" name="description" rows={2} placeholder="Additional details..." />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating..." : "Create Appointment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────

function EmptyState({ workers }: { workers: Worker[] }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-full bg-primary/5 mb-4">
        <Brain className="h-12 w-12 text-primary/40" />
      </div>
      <h2 className="text-xl font-semibold mb-2">No Scheduling Data Yet</h2>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed mb-6">
        Create service appointments and assign technicians to activate
        the intelligence dashboard.
      </p>
      <CreateAppointmentDialog workers={workers} />
      <div className="grid grid-cols-4 gap-6 mt-10 text-left max-w-2xl">
        {[
          { icon: Gauge, label: "Utilization Rate", desc: "Hours booked vs available capacity per technician" },
          { icon: BarChart3, label: "Jobs / Day", desc: "Daily throughput and workload distribution" },
          { icon: Route, label: "Route Optimization", desc: "Travel distance savings with optimized stop order" },
          { icon: ShieldCheck, label: "Workforce Trust Score", desc: "0-100 composite: utilization, completion, consistency" },
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

// ─── Main Page ───────────────────────────────────────────────────────

export default function Scheduling() {
  usePageMeta("Scheduling Intelligence", "AI-powered workforce analytics for service operations");
  const { toast } = useToast();
  const [selectedRoute, setSelectedRoute] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("intelligence");

  const { data, isLoading } = useQuery<IntelligenceData>({
    queryKey: ["/api/scheduling/intelligence"],
  });

  const { data: workers = [] } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
  });

  const { data: appointments = [] } = useQuery<ServiceAppointment[]>({
    queryKey: ["/api/service-appointments"],
  });

  const workerMap = useMemo(() => {
    const m = new Map<string, Worker>();
    workers.forEach((w) => m.set(w.id, w));
    return m;
  }, [workers]);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/service-appointments/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/intelligence"] });
      toast({ title: "Status updated" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const hasData = data && data.summary.totalAppointments > 0;

  return (
    <div className="p-6 space-y-5 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Scheduling Intelligence</h1>
          <Badge variant="outline">Çukurova Isı Sistemleri</Badge>
        </div>
        <CreateAppointmentDialog workers={workers} />
      </div>

      {!hasData ? (
        <EmptyState workers={workers} />
      ) : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-md bg-blue-500/10"><Activity className="h-4 w-4 text-blue-500" /></div>
                  <span className="text-xs text-muted-foreground">Appointments</span>
                </div>
                <p className="text-2xl font-bold">{data.summary.totalAppointments}</p>
                <p className="text-xs text-muted-foreground">{data.summary.completedCount} done, {data.summary.cancelledCount} cancelled</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-md bg-green-500/10"><Gauge className="h-4 w-4 text-green-500" /></div>
                  <span className="text-xs text-muted-foreground">Avg Utilization</span>
                </div>
                <p className="text-2xl font-bold">{data.summary.avgUtilization}%</p>
                <Progress value={data.summary.avgUtilization} className="h-1.5 mt-1" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-md bg-amber-500/10"><BarChart3 className="h-4 w-4 text-amber-500" /></div>
                  <span className="text-xs text-muted-foreground">Avg Jobs/Day</span>
                </div>
                <p className="text-2xl font-bold">{data.summary.avgJobsPerDay}</p>
                <p className="text-xs text-muted-foreground">{data.summary.activeTechnicians} technician{data.summary.activeTechnicians !== 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`p-1.5 rounded-md ${scoreBg(data.summary.avgPerformance)}`}>
                    <ShieldCheck className={`h-4 w-4 ${scoreColor(data.summary.avgPerformance)}`} />
                  </div>
                  <span className="text-xs text-muted-foreground">Trust Score</span>
                </div>
                <p className={`text-2xl font-bold ${scoreColor(data.summary.avgPerformance)}`}>{data.summary.avgPerformance}</p>
                <p className="text-xs text-muted-foreground">{trustScoreLabel(data.summary.avgPerformance)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-md bg-purple-500/10"><Route className="h-4 w-4 text-purple-500" /></div>
                  <span className="text-xs text-muted-foreground">Route Savings</span>
                </div>
                <p className="text-2xl font-bold">{data.summary.totalSavingsKm} km</p>
                <p className="text-xs text-muted-foreground">{data.routeAnalysis.length} route{data.routeAnalysis.length !== 1 ? "s" : ""} optimized</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
              <TabsTrigger value="appointments">Appointments ({appointments.length})</TabsTrigger>
              <TabsTrigger value="forecast">Seasonal Forecast</TabsTrigger>
            </TabsList>

            {/* ── Intelligence Tab ── */}
            <TabsContent value="intelligence" className="space-y-4 mt-4">
              {/* Row: Utilization + Jobs/Day + Type Breakdown */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Gauge className="h-4 w-4" />Technician Utilization</CardTitle>
                    <CardDescription className="text-xs">Booked hours vs 8h/day capacity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.technicians.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.technicians.map(t => ({ name: t.name.split(" ")[0], utilization: t.utilization, fill: utilizationColor(t.utilization) }))} layout="vertical" margin={{ left: 0, right: 12 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} fontSize={11} />
                          <YAxis type="category" dataKey="name" width={60} fontSize={11} />
                          <Tooltip formatter={(v: number) => [`${v}%`, "Utilization"]} />
                          <Bar dataKey="utilization" radius={[0, 4, 4, 0]} barSize={20}>
                            {data.technicians.map((t, i) => <Cell key={i} fill={utilizationColor(t.utilization)} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground py-8 text-center">No technician data</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" />Jobs Per Day</CardTitle>
                    <CardDescription className="text-xs">Average daily throughput</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.technicians.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.technicians.map(t => ({ name: t.name.split(" ")[0], jobsPerDay: t.jobsPerDay }))} margin={{ left: 0, right: 12 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip formatter={(v: number) => [v, "Jobs/Day"]} />
                          <Bar dataKey="jobsPerDay" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground py-8 text-center">No data</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Target className="h-4 w-4" />Job Type Mix</CardTitle>
                    <CardDescription className="text-xs">Service category breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.typeBreakdown.filter(t => t.count > 0).length > 0 ? (
                      <div className="flex items-center">
                        <ResponsiveContainer width="50%" height={180}>
                          <PieChart>
                            <Pie data={data.typeBreakdown.filter(t => t.count > 0).map(t => ({ name: t.type, value: t.count, fill: TYPE_COLORS[t.type] || "#6B7280" }))} cx="50%" cy="50%" outerRadius={70} innerRadius={40} dataKey="value" strokeWidth={2}>
                              {data.typeBreakdown.filter(t => t.count > 0).map((t, i) => <Cell key={i} fill={TYPE_COLORS[t.type] || "#6B7280"} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2 flex-1">
                          {data.typeBreakdown.filter(t => t.count > 0).map(t => (
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
                    ) : <p className="text-sm text-muted-foreground py-8 text-center">No data</p>}
                  </CardContent>
                </Card>
              </div>

              {/* Row: Trust Scores + Route Optimization */}
              <div className="grid grid-cols-2 gap-4">
                {/* Workforce Trust Scores */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Workforce Trust Score</CardTitle>
                    <CardDescription className="text-xs">40% utilization + 30% completion + 20% throughput + 10% consistency</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.technicians.length > 0 ? (
                      [...data.technicians]
                        .sort((a, b) => b.performanceScore - a.performanceScore)
                        .map((tech, idx) => (
                          <div key={tech.technicianId} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="relative">
                              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-bold ${scoreBg(tech.performanceScore)} ${scoreColor(tech.performanceScore)}`}>
                                {tech.performanceScore}
                              </div>
                              {idx === 0 && data.technicians.length > 1 && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                                  <Award className="h-2.5 w-2.5 text-white" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{tech.name}</p>
                                <Badge variant="outline" className="text-[10px] py-0">{trustScoreLabel(tech.performanceScore)}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{tech.trade} — {tech.location}</p>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center shrink-0">
                              <div>
                                <p className="text-xs font-semibold">{tech.utilization}%</p>
                                <p className="text-[9px] text-muted-foreground">Util</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold">{tech.completionRate}%</p>
                                <p className="text-[9px] text-muted-foreground">Done</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold">{tech.jobsPerDay}</p>
                                <p className="text-[9px] text-muted-foreground">J/d</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold">{tech.totalJobs}</p>
                                <p className="text-[9px] text-muted-foreground">Tot</p>
                              </div>
                            </div>
                          </div>
                        ))
                    ) : <p className="text-sm text-muted-foreground py-8 text-center">Assign technicians to see scores</p>}
                  </CardContent>
                </Card>

                {/* Route Optimization */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-2"><Route className="h-4 w-4" />Route Optimization</CardTitle>
                        <CardDescription className="text-xs">Nearest-neighbor for minimum travel</CardDescription>
                      </div>
                      {data.routeAnalysis.length > 0 && (
                        <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                          <SelectTrigger className="w-52 h-8 text-xs"><SelectValue placeholder="Select route" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All routes</SelectItem>
                            {data.routeAnalysis.map((r, i) => (
                              <SelectItem key={i} value={`${r.technicianId}-${r.date}`}>{r.technicianName} — {r.date}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const activeRoute = selectedRoute !== "all"
                        ? data.routeAnalysis.find(r => `${r.technicianId}-${r.date}` === selectedRoute)
                        : null;

                      if (activeRoute) {
                        const firstGeo = activeRoute.stops.find(s => s.lat && s.lng);
                        return (
                          <div className="space-y-3">
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-muted-foreground">Current: <span className="font-semibold text-foreground">{activeRoute.totalDistanceKm} km</span></span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Optimized: <span className="font-semibold text-green-600">{activeRoute.optimizedDistanceKm} km</span></span>
                              {activeRoute.savingsPercent > 0 && <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">{activeRoute.savingsPercent}% saved</Badge>}
                            </div>
                            <div className="rounded-lg overflow-hidden border h-[220px]">
                              <MapContainer key={selectedRoute} center={firstGeo ? [firstGeo.lat!, firstGeo.lng!] : GEBZE_CENTER} zoom={12} style={{ height: "100%", width: "100%" }} zoomControl={false}>
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                                {(() => {
                                  const geo = activeRoute.stops.filter(s => s.lat && s.lng);
                                  const ordered = activeRoute.optimizedOrder.map(i => geo[i]).filter(Boolean);
                                  return ordered.length >= 2 ? <Polyline positions={ordered.map(s => [s.lat!, s.lng!] as [number, number])} pathOptions={{ color: "#3B82F6", weight: 3, dashArray: "8 4" }} /> : null;
                                })()}
                                {activeRoute.stops.filter(s => s.lat && s.lng).map((stop, idx, arr) => (
                                  <Marker key={idx} position={[stop.lat!, stop.lng!]} icon={createStopIcon(idx, arr.length)}>
                                    <Popup><div className="text-xs"><p className="font-bold">{stop.title}</p><p className="text-gray-500">{stop.time} — {stop.address}</p></div></Popup>
                                  </Marker>
                                ))}
                              </MapContainer>
                            </div>
                          </div>
                        );
                      }

                      if (data.routeAnalysis.length > 0) {
                        return (
                          <div className="space-y-2 max-h-[260px] overflow-auto">
                            {data.routeAnalysis.map((route, idx) => (
                              <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setSelectedRoute(`${route.technicianId}-${route.date}`)}>
                                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium">{route.technicianName} — {route.date}</p>
                                  <p className="text-[10px] text-muted-foreground">{route.stops.length} stops</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-medium">{route.totalDistanceKm} → {route.optimizedDistanceKm} km</p>
                                  {route.savingsPercent > 0 && <p className="text-[10px] text-green-600 font-medium">{route.savingsPercent}% saved</p>}
                                </div>
                                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              </div>
                            ))}
                          </div>
                        );
                      }

                      return (
                        <div className="flex flex-col items-center py-8 text-center">
                          <Route className="h-8 w-8 text-muted-foreground/30 mb-2" />
                          <p className="text-sm text-muted-foreground">Add 2+ geo-located appointments per technician per day to see routes</p>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Appointments Tab ── */}
            <TabsContent value="appointments" className="mt-4">
              <div className="space-y-2">
                {appointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">No appointments yet</p>
                ) : (
                  appointments.map((appt) => {
                    const tech = appt.assigneeId ? workerMap.get(appt.assigneeId) : null;
                    const tc = TYPE_COLORS[appt.appointmentType] || "#3B82F6";
                    return (
                      <Card key={appt.id}>
                        <CardContent className="p-3 flex items-center gap-4">
                          <div className="w-2 h-10 rounded-full shrink-0" style={{ background: tc }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{appt.title}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{appt.scheduledDate}</span>
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{appt.scheduledTime}</span>
                              <span className="capitalize">{appt.appointmentType}</span>
                              {tech && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{tech.name}</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{appt.customerName} — {appt.customerAddress}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={appt.status === "completed" ? "default" : appt.status === "cancelled" ? "secondary" : "outline"} className="capitalize text-xs">
                              {appt.status.replace("_", " ")}
                            </Badge>
                            {appt.status === "scheduled" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => statusMutation.mutate({ id: appt.id, status: "in_progress" })}>Start</Button>
                            )}
                            {appt.status === "in_progress" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-green-600" onClick={() => statusMutation.mutate({ id: appt.id, status: "completed" })}>Complete</Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* ── Seasonal Forecast Tab ── */}
            <TabsContent value="forecast" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Thermometer className="h-4 w-4" />
                    Seasonal Demand Forecast — HVAC Service Volume
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Based on Turkey climate patterns. Maintenance surges in Sep-Oct (pre-winter heating) and Apr-May (pre-summer cooling).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.seasonalForecast ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={data.seasonalForecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip />
                        <Area type="monotone" dataKey="predicted" stroke="#3B82F6" fill="url(#forecastFill)" strokeWidth={2} name="Predicted" />
                        <Area type="monotone" dataKey="actual" stroke="#22C55E" fill="url(#actualFill)" strokeWidth={2} name="Actual" />
                        <ReferenceLine x="Sep" stroke="#EF4444" strokeDasharray="3 3" label={{ value: "Pre-Winter Surge", position: "top", fontSize: 10, fill: "#EF4444" }} />
                        <ReferenceLine x="Apr" stroke="#F59E0B" strokeDasharray="3 3" label={{ value: "Pre-Summer Surge", position: "top", fontSize: 10, fill: "#F59E0B" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground py-8 text-center">No forecast data</p>}
                </CardContent>
              </Card>

              {/* Surge Months Detail */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="border-red-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-500">
                      <AlertTriangle className="h-4 w-4" />
                      Pre-Winter Surge (Sep–Oct)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">Heating system maintenance, boiler inspections, and radiator installations spike as building managers prepare for winter.</p>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="p-2 bg-red-500/5 rounded-lg text-center">
                        <p className="text-lg font-bold text-red-500">1.5–1.6x</p>
                        <p className="text-[10px] text-muted-foreground">Demand multiplier</p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded-lg text-center">
                        <p className="text-lg font-bold">{data.seasonalForecast?.find(m => m.month === "Sep")?.predicted ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground">Predicted Sep jobs</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      <span className="font-medium text-foreground">Action:</span> Begin hiring seasonal technicians by August. Pre-schedule maintenance campaigns.
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-amber-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-500">
                      <TrendingUp className="h-4 w-4" />
                      Pre-Summer Surge (Apr–May)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">Split AC installations, VRF system commissioning, and cooling system inspections increase as temperatures rise in the Marmara region.</p>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="p-2 bg-amber-500/5 rounded-lg text-center">
                        <p className="text-lg font-bold text-amber-500">1.1–1.2x</p>
                        <p className="text-[10px] text-muted-foreground">Demand multiplier</p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded-lg text-center">
                        <p className="text-lg font-bold">{data.seasonalForecast?.find(m => m.month === "Apr")?.predicted ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground">Predicted Apr jobs</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      <span className="font-medium text-foreground">Action:</span> Stock split AC inventory by March. Schedule installation crews for April-May blocks.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
