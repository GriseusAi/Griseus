import { useUser } from "@/hooks/use-user";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !user.role) {
    return <Redirect to="/login" />;
  }

  if (user.role === "worker") {
    return <Redirect to="/mobile" />;
  }

  return <>{children}</>;
}
