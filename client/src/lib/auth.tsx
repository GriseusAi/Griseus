import { useUser } from "@/hooks/use-user";
import { Redirect } from "wouter";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();
  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>Yükleniyor...</div>;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}
