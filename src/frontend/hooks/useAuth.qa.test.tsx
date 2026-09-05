import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MongoUser } from "@/frontend/lib/mongodbClient";
import { AuthProvider, useAuth } from "./useAuth";

const mocks = vi.hoisted(() => ({ getStoredUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("@/frontend/lib/mongodbClient", () => mocks);
vi.mock("@/frontend/lib/googleIdentity", () => ({ disableGoogleAutoSelect: vi.fn() }));
vi.mock("@/frontend/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const user = (id: string): MongoUser => ({
  id, email: `${id}@example.test`, username: id, role: "user", avatar_url: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", emailVerified: true,
});
beforeEach(() => { vi.clearAllMocks(); mocks.getStoredUser.mockReturnValue(user("stale-account")); });
afterEach(cleanup);

describe("authoritative SSR identity QA", () => {
  it("keeps both identity and profile anonymous after effects despite another cached account", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider authResolved initialUser={null}>{children}</AuthProvider>
    );
    const { result, rerender } = renderHook(useAuth, { wrapper });
    rerender();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("preserves the trusted SSR account and its matching profile over a stale cached account", () => {
    const trusted = user("trusted-account");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider authResolved initialUser={trusted}>{children}</AuthProvider>
    );
    const { result, rerender } = renderHook(useAuth, { wrapper });
    rerender();
    expect(result.current.user).toEqual(trusted);
    expect(result.current.profile).toMatchObject({ user_id: trusted.id, username: trusted.username });
    expect(result.current.isLoading).toBe(false);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });
});
