import { Navigate } from "react-router-dom";
import { CenteredAppSkeleton } from "@/frontend/components/AppSkeletons";
import { useAuth } from "@/frontend/hooks/useAuth";

/**
 * Legacy route component retained for old links.
 * Admin access now uses the normal HttpOnly user session plus DB-backed RBAC.
 */
export default function AdminLogin() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <CenteredAppSkeleton />;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== "admin") return <Navigate to="/home" replace />;
  return <Navigate to="/theater/admin" replace />;
}
