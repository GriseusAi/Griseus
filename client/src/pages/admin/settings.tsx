import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Settings } from "lucide-react";

export default function AdminSettings() {
  usePageMeta("Settings", "Admin settings and configuration.");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="relative rounded-xl overflow-hidden gradient-header noise-subtle border">
        <div className="relative z-10 p-8">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1A1A1A]">
              Settings
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Platform configuration and administration settings.
          </p>
        </div>
      </div>

      <Card className="bg-white shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Platform Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Settings className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">Settings panel coming soon.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Platform configuration, notification preferences, and security settings will be available here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
