import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth";
import type { MongoUser } from "@/frontend/lib/mongodbClient";

const mocks = vi.hoisted(() => ({
  getStoredUser: vi.fn(),
  getCurrentUser: vi.fn(),
  refreshAccessToken: vi.fn(),
  clearTokens: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/frontend/lib/mongodbClient", () => ({
  getStoredUser: mocks.getStoredUser,
  getCurrentUser: mocks.getCurrentUser,
  refreshAccessToken: mocks.refreshAccessToken,
  clearTokens: mocks.clearTokens,
}));

vi.mock("@/frontend/lib/googleIdentity", () => ({
  disableGoogleAutoSelect: vi.fn(),
}));

vi.mock("@/frontend/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

function cachedUser(): MongoUser {
  return {
    id: "cached-user",
    email: "cached@example.test",
    username: "cached",
    role: "user",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    emailVerified: true,
  };
}

function Consumer() {
  const { user, isLoading } = useAuth();
  return <output data-testid="auth-state">{user?.id ?? "anonymous"}:{String(isLoading)}</output>;
}

function tree(authResolved = false) {
  return (
    <AuthProvider initialUser={null} authResolved={authResolved}>
      <Consumer />
    </AuthProvider>
  );
}

describe("AuthProvider hydration", () => {
  beforeEach(() => {
    mocks.getStoredUser.mockReset();
    mocks.getCurrentUser.mockReset();
    mocks.refreshAccessToken.mockReset();
    mocks.clearTokens.mockReset();
    mocks.toast.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("does not read sessionStorage during the server render", async () => {
    const user = cachedUser();
    sessionStorage.setItem("moviereckon_user", JSON.stringify(user));
    mocks.getStoredUser.mockReturnValue(user);
    mocks.getCurrentUser.mockResolvedValue(user);

    const serverMarkup = renderToString(tree());
    expect(serverMarkup).toMatch(/anonymous.*true/);

    render(tree());
    await waitFor(() => expect(screen.getByTestId("auth-state")).toHaveTextContent("cached-user:false"));
    expect(mocks.getStoredUser).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect a cached identity after an authoritative anonymous SSR result", async () => {
    const user = cachedUser();
    sessionStorage.setItem("moviereckon_user", JSON.stringify(user));
    mocks.getStoredUser.mockReturnValue(user);

    render(tree(true));
    await waitFor(() => expect(screen.getByTestId("auth-state")).toHaveTextContent("anonymous:false"));
    expect(mocks.getStoredUser).not.toHaveBeenCalled();
  });
});
