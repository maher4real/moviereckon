import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn(),
  connectToDatabase: vi.fn(),
  mongodbAdapter: vi.fn(),
  nodeHandler: vi.fn(),
  toNodeHandler: vi.fn(),
}));

vi.mock("better-auth", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("better-auth/node", () => ({ toNodeHandler: mocks.toNodeHandler }));
vi.mock("@better-auth/mongo-adapter", () => ({ mongodbAdapter: mocks.mongodbAdapter }));
vi.mock("./lib/mongodb.js", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("./lib/email.js", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

describe("Better Auth API bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-is-at-least-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "https://example.test/");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://example.test, https://admin.example.test");
    vi.stubEnv("BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION", "true");

    const db = { collection: vi.fn() };
    const adapter = { id: "mongo-adapter" };
    const auth = { id: "auth-instance" };
    mocks.connectToDatabase.mockResolvedValue({ db });
    mocks.mongodbAdapter.mockReturnValue(adapter);
    mocks.betterAuth.mockReturnValue(auth);
    mocks.toNodeHandler.mockReturnValue(mocks.nodeHandler);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds Better Auth with MongoDB, safe base URL, and trusted origins", async () => {
    const { getBetterAuthNodeHandler } = await import("./better-auth");

    const result = await getBetterAuthNodeHandler();

    expect(result).toBe(mocks.nodeHandler);
    expect(mocks.mongodbAdapter).toHaveBeenCalledWith(expect.any(Object), { usePlural: true });
    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: "/api/better-auth",
        baseURL: "https://example.test",
        secret: "test-secret-that-is-at-least-32-characters",
        trustedOrigins: ["https://example.test", "https://admin.example.test"],
        emailAndPassword: expect.objectContaining({
          enabled: true,
          requireEmailVerification: true,
        }),
      }),
    );
  });

  it("delegates Next API requests to Better Auth node handler", async () => {
    const { default: handler } = await import("./better-auth");
    const req = { method: "GET", headers: {} };
    const res = { status: vi.fn() };

    await handler(req as never, res as never);

    expect(mocks.nodeHandler).toHaveBeenCalledWith(req, res);
  });
});
