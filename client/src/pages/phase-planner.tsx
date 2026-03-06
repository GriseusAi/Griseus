import { CalendarRange } from "lucide-react";

export default function PhasePlanner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <CalendarRange className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-3">
        Phase-Based Workforce Planning
      </h1>
      <p className="text-muted-foreground max-w-md mb-2">
        Coming soon. You're on the early access list.
      </p>
      <p className="text-sm text-muted-foreground/70 max-w-lg">
        Map your data center project phases to the exact trades and certifications you need.
        Plan workforce requirements 6-8 weeks ahead of each construction phase.
      </p>
    </div>
  );
}
