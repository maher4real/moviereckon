import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingGate from "./OnboardingGate";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "u1" } as { id: string } | null },
  userData: { preferences: null as Record<string, unknown> | null, isLoading: true },
}));

vi.mock("@/frontend/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/frontend/hooks/useUserData", () => ({ useUserData: () => mocks.userData }));
vi.mock("@/frontend/components/PageSkeletons", () => ({ RouteSkeleton: () => <div>loading</div> }));
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/home", search: "" }),
  Navigate: ({ to, state }: { to: string; state?: { from?: string } }) => <div>redirect {to} from {state?.from}</div>,
}));

const gate = () => render(<OnboardingGate><div>feed</div></OnboardingGate>);

describe("OnboardingGate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.userData = { preferences: null, isLoading: true };
  });

  it("sends a new account to onboarding before the feed", () => {
    mocks.userData = { preferences: { preferred_languages: [], onboarding_completed_at: null }, isLoading: false };
    gate();
    expect(screen.getByText("redirect /welcome from /home")).toBeInTheDocument();
  });

  it("waits for preferences on a device it has not seen this account on", () => {
    gate();
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("renders straight away for an account already onboarded here", () => {
    window.localStorage.setItem("mr:onboarded:u1", "1");
    gate();
    expect(screen.getByText("feed")).toBeInTheDocument();
  });

  it("remembers a completed account and shows the feed", () => {
    mocks.userData = { preferences: { onboarding_completed_at: "2026-10-24T00:00:00Z" }, isLoading: false };
    gate();
    expect(screen.getByText("feed")).toBeInTheDocument();
    expect(window.localStorage.getItem("mr:onboarded:u1")).toBe("1");
  });

  it("never blocks when preferences could not load", () => {
    mocks.userData = { preferences: null, isLoading: false };
    gate();
    expect(screen.getByText("feed")).toBeInTheDocument();
  });
});
