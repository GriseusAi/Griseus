import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { insertWorkerSchema, type Worker } from "@shared/schema";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  Plus,
  Search,
  Users,
  MapPin,
  Mail,
  Phone,
  Award,
  Briefcase,
} from "lucide-react";

const tradeOptions = [
  "Electrician",
  "HVAC Technician",
  "Mechanical Engineer",
  "Network Technician",
  "Fire Protection Specialist",
  "Project Manager",
  "Facility Engineer",
  "Structural Engineer",
  "General Contractor",
  "Safety Officer",
];

const tradeColors: Record<string, string> = {
  Electrician: "bg-warning/15 text-warning",
  "HVAC Technician": "bg-primary/15 text-primary",
  "Mechanical Engineer": "bg-chart-2/15 text-chart-2",
  "Network Technician": "bg-success/15 text-success",
  "Fire Protection Specialist": "bg-destructive/15 text-destructive",
  "Project Manager": "bg-chart-5/15 text-chart-5",
  "Facility Engineer": "bg-chart-1/15 text-chart-1",
  "Structural Engineer": "bg-chart-2/15 text-chart-2",
  "General Contractor": "bg-muted text-muted-foreground",
  "Safety Officer": "bg-warning/15 text-warning",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function Team() {
  usePageMeta("Team Directory", "Find and connect with data center professionals across all trades and specialties.");

  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [availFilter, setAvailFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: workers, isLoading } = useQuery<Worker[]>({
    queryKey: ["/api/workers"],
  });

  const form = useForm({
    resolver: zodResolver(
      insertWorkerSchema.extend({
        name: insertWorkerSchema.shape.name.min(1, "Name is required"),
        title: insertWorkerSchema.shape.title.min(1, "Job title is required"),
        trade: insertWorkerSchema.shape.trade.min(1, "Trade is required"),
        email: insertWorkerSchema.shape.email.email("Valid email required"),
        location: insertWorkerSchema.shape.location.min(1, "Location is required"),
      })
    ),
    defaultValues: {
      name: "",
      title: "",
      trade: "",
      email: "",
      phone: "",
      location: "",
      avatarUrl: "",
      experience: 0,
      certifications: [],
      available: true,
      bio: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/workers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Team member added", description: "New professional has been added to the directory." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filtered = workers?.filter((w) => {
    const matchSearch =
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.trade.toLowerCase().includes(search.toLowerCase()) ||
      w.title.toLowerCase().includes(search.toLowerCase()) ||
      w.location.toLowerCase().includes(search.toLowerCase());
    const matchTrade = tradeFilter === "all" || w.trade === tradeFilter;
    const matchAvail =
      availFilter === "all" ||
      (availFilter === "available" && w.available) ||
      (availFilter === "unavailable" && !w.available);
    return matchSearch && matchTrade && matchAvail;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Team Directory
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Find and connect with data center professionals
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-worker">
              <Plus className="h-4 w-4 mr-1" /> Add Professional
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. John Rodriguez" {...field} data-testid="input-worker-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Senior Electrician" {...field} data-testid="input-worker-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="trade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trade</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-worker-trade">
                              <SelectValue placeholder="Select trade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tradeOptions.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="email@example.com" {...field} data-testid="input-worker-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 (555) 000-0000" {...field} value={field.value || ""} data-testid="input-worker-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Dallas, TX" {...field} data-testid="input-worker-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="experience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Experience (years)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-worker-experience"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio (optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Brief professional summary..." {...field} value={field.value || ""} data-testid="input-worker-bio" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-worker">
                  {createMutation.isPending ? "Adding..." : "Add Professional"}
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
            placeholder="Search by name, trade, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-workers"
          />
        </div>
        <Select value={tradeFilter} onValueChange={setTradeFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-trade">
            <SelectValue placeholder="Trade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trades</SelectItem>
            {tradeOptions.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={availFilter} onValueChange={setAvailFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-filter-availability">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="unavailable">On Assignment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 flex items-start gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((worker) => (
            <Card key={worker.id} className="hover:shadow-md hover:border-primary/20 transition-all" data-testid={`card-worker-${worker.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar className={`h-12 w-12 ${worker.available ? "ring-2 ring-success ring-offset-2 ring-offset-card" : ""}`}>
                    <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                      {getInitials(worker.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm" data-testid={`text-worker-name-${worker.id}`}>
                        {worker.name}
                      </h3>
                      <Badge variant={worker.available ? "default" : "secondary"} className={`text-[10px] ${worker.available ? "bg-success/15 text-success" : ""}`}>
                        {worker.available ? "Available" : "On Assignment"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{worker.title}</p>
                    <Badge variant="secondary" className={`mt-2 text-[10px] ${tradeColors[worker.trade] || ""}`}>
                      {worker.trade}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{worker.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{worker.email}</span>
                  </div>
                  {worker.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 flex-shrink-0" />
                      <span>{worker.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3 flex-shrink-0" />
                    <span>{worker.experience} years experience</span>
                  </div>
                  {worker.certifications && worker.certifications.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Award className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{worker.certifications.join(", ")}</span>
                    </div>
                  )}
                </div>
                {worker.bio && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{worker.bio}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">No team members found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {search || tradeFilter !== "all" || availFilter !== "all"
                ? "Try adjusting your filters"
                : "Add your first team member to get started"}
            </p>
            {!search && tradeFilter === "all" && availFilter === "all" && (
              <Button onClick={() => setDialogOpen(true)} data-testid="button-empty-add-worker">
                <Plus className="h-4 w-4 mr-1" /> Add Professional
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
