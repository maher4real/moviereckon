import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { RouteSkeleton } from "@/frontend/components/PageSkeletons";

export const ONBOARDING_PATH = "/welcome";

const flagKey = (userId: string) => `mr:onboarded:${userId}`;

function hasOnboardedFlag(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return window.localStorage.getItem(flagKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function rememberOnboarded(userId: string | undefined): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(flagKey(userId), "1");
  } catch {
    // Storage blocked: the gate just waits for preferences on the next visit.
  }
}

/**
 * Sends a signed-in viewer who has not picked a taste yet to onboarding before
 * the feed renders, so the first home page is already personalised. Viewers
 * known to be onboarded on this device render instantly; if preferences fail
 * to load, nobody is blocked.
 */
export default function OnboardingGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { preferences, isLoading } = useUserData();
  const location = useLocation();
  const completed = Boolean(preferences?.onboarding_completed_at);

  useEffect(() => {
    if (completed) rememberOnboarded(user?.id);
  }, [completed, user?.id]);

  if (user && preferences && !completed) {
    return <Navigate to={ONBOARDING_PATH} replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (isLoading && !hasOnboardedFlag(user?.id)) return <RouteSkeleton />;
  return <>{children}</>;
}
