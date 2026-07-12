import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/runtimeEnv", () => ({
  getPublicMongoApiUrl: () => "",
}));

describe("MongoDB auth client logout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("waits for legacy logout and also clears a Better Auth session", async () => {
    window.sessionStorage.setItem("moviereckon_user", JSON.stringify({ id: "user-1" }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const { logout } = await import("./mongodbClient.js");

    await logout({ keepalive: true });

    expect(window.sessionStorage.getItem("moviereckon_user")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ credentials: "include", keepalive: true, method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/better-auth/sign-out",
      expect.objectContaining({ credentials: "include", keepalive: true, method: "POST" }),
    );
  });

  it("reports a failed primary logout instead of silently navigating away", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "failed" }), { status: 500 }),
    );
    const { logout } = await import("./mongodbClient.js");

    await expect(logout()).rejects.toThrow("Logout failed with status 500");
  });

  it("waits for an active refresh before sending logout", async () => {
    let finishRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      finishRefresh = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => refreshResponse)
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { logout, refreshAccessToken } = await import("./mongodbClient.js");

    const refresh = refreshAccessToken();
    const signOut = logout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishRefresh?.(
      new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200 }),
    );
    await refresh;
    await signOut;

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/better-auth/sign-out",
    ]);
  });
});
