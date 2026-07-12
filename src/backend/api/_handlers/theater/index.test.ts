import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  userHasRoleAtLeast: vi.fn(),
  toArray: vi.fn(),
}));

vi.mock("../../lib/auth.js", () => ({
  getUserFromRequest: mocks.getUserFromRequest,
  userHasRoleAtLeast: mocks.userHasRoleAtLeast,
}));
vi.mock("../../lib/mongodb.js", () => ({
  ObjectId: class ObjectId {
    static isValid(value: string) { return value.length === 24; }
    constructor(public value: string) {}
  },
  connectToDatabase: vi.fn(async () => ({
    db: {
      collection: vi.fn(() => ({
        find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: mocks.toArray })) })),
        insertOne: vi.fn(async () => ({ insertedId: "movie-1" })),
      })),
    },
  })),
}));

import handler from "./index";

function response() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

describe("theater RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toArray.mockResolvedValue([]);
  });

  it("keeps reads available to authenticated app routes", async () => {
    const res = response();
    await handler({ method: "GET", url: "/api/theater", headers: { host: "test" } } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(mocks.getUserFromRequest).not.toHaveBeenCalled();
  });

  it("rejects writes without admin session", async () => {
    mocks.getUserFromRequest.mockResolvedValue(null);
    const res = response();
    await handler({ method: "POST", url: "/api/theater", headers: { host: "test" }, body: {} } as never, res as never);
    expect(res.statusCode).toBe(403);
  });

  it("allows writes after current DB role confirms admin", async () => {
    const user = { id: "507f1f77bcf86cd799439011", role: "admin" };
    mocks.getUserFromRequest.mockResolvedValue(user);
    mocks.userHasRoleAtLeast.mockResolvedValue(true);
    const res = response();
    await handler({
      method: "POST",
      url: "/api/theater",
      headers: { host: "test", cookie: "session=value" },
      body: { title: "Film", videoUrl: "https://youtu.be/abcdefgh" },
    } as never, res as never);
    expect(res.statusCode).toBe(201);
    expect(mocks.userHasRoleAtLeast).toHaveBeenCalledWith(user, "admin");
  });
});

describe("theater video URL validation", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abcdefgh", "youtube"],
    ["https://youtu.be/abcdefgh", "youtube"],
    ["https://drive.google.com/file/d/abcdefgh/view", "gdrive"],
    ["https://www.dailymotion.com/video/abcdefgh", "dailymotion"],
  ])("accepts supported URL %s", async (url, source) => {
    const module = await import("./index");
    expect(module.detectVideoSource(url)).toBe(source);
  });

  it.each([
    "http://youtube.com/watch?v=abcdefgh",
    "https://youtube.com.evil.test/watch?v=abcdefgh",
    "https://evil.test/?next=youtube.com",
    "https://user:pass@youtube.com/watch?v=abcdefgh",
    "https://youtube.com:8443/watch?v=abcdefgh",
  ])("rejects unsafe URL %s", async (url) => {
    const module = await import("./index");
    expect(module.detectVideoSource(url)).toBeNull();
  });

  it("normalizes a validated provider URL to embed URL", async () => {
    const module = await import("./index");
    expect(module.getEmbedUrl("https://youtu.be/abcdefgh", "youtube")).toBe(
      "https://www.youtube.com/embed/abcdefgh",
    );
  });
});
