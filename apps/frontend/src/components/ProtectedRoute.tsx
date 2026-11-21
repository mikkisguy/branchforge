import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { workspaceLoginPath } from "@/lib/workspace-location";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={workspaceLoginPath(
          location.pathname + location.search + location.hash
        )}
        replace
      />
    );
  }

  return <>{children}</>;
}
