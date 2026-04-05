import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/frontend/hooks/useAuth";
import { CenteredAppSkeleton } from "@/frontend/components/AppSkeletons";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Wraps a route so unauthenticated users are sent to "/" and a skeleton
 * is shown while the auth state is still loading. Replaces the duplicated
 * useEffect guard that used to live in every protected page component.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <CenteredAppSkeleton />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
