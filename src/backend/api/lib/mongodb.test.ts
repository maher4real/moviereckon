import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  MongoClient: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  db: vi.fn(),
  createIndex: vi.fn(),
}));

vi.mock("mongodb", () => ({ MongoClient: mocks.MongoClient, ObjectId: class {} }));

const database = { collection: vi.fn(() => ({ createIndex: mocks.createIndex })) };

function clearConnectionState() {
  globalThis.mongoConnection = undefined;
  globalThis.mongoConnectionPromise = undefined;
  globalThis.mongoIndexBootstrapPromise = undefined;
}

describe("MongoDB function connection lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearConnectionState();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MONGODB_URI", "mongodb+srv://user:password@cluster.example/");
    vi.stubEnv("MONGODB_DB_NAME", "moviereckon_test");
    vi.stubEnv("MONGODB_MAX_POOL_SIZE", undefined);
    vi.stubEnv("MONGODB_TLS_INSECURE", "false");
    vi.stubEnv("MONGODB_SKIP_INDEX_BOOTSTRAP", "false");
    mocks.connect.mockReset().mockResolvedValue(undefined);
    mocks.close.mockReset().mockResolvedValue(undefined);
    mocks.createIndex.mockReset().mockResolvedValue("index");
    mocks.db.mockReturnValue(database);
    mocks.MongoClient.mockReset().mockImplementation(function () {
      return { connect: mocks.connect, close: mocks.close, db: mocks.db };
    });
  });

  afterEach(() => {
    clearConnectionState();
    vi.unstubAllEnvs();
  });

  it("shares a single pool across simultaneous cold requests and later requests", async () => {
    let resolveConnect!: () => void;
    mocks.connect.mockReturnValueOnce(new Promise<void>((resolve) => { resolveConnect = resolve; }));
    const { connectToDatabase } = await import("./mongodb");
    const pending = Array.from({ length: 20 }, () => connectToDatabase());
    expect(mocks.MongoClient).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    resolveConnect();
    const connections = await Promise.all(pending);
    expect(connections.every((connection) => connection === connections[0])).toBe(true);
    expect(connections[0].db).toBe(database);
    const bootstrapCalls = mocks.createIndex.mock.calls.length;
    expect(bootstrapCalls).toBeGreaterThan(0);
    expect(await connectToDatabase()).toBe(connections[0]);
    expect(mocks.createIndex).toHaveBeenCalledTimes(bootstrapCalls);
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("keeps every caller waiting until index bootstrap finishes", async () => {
    let resolveIndex!: () => void;
    mocks.createIndex.mockReturnValueOnce(new Promise<void>((resolve) => { resolveIndex = resolve; }));
    const { connectToDatabase } = await import("./mongodb");
    let ready = false;
    const pending = Promise.all([connectToDatabase(), connectToDatabase()]).then(() => { ready = true; });
    await vi.waitFor(() => expect(mocks.createIndex).toHaveBeenCalledTimes(1));
    expect(ready).toBe(false);
    expect(globalThis.mongoConnection).toBeUndefined();
    resolveIndex();
    await pending;
    expect(ready).toBe(true);
  });

  it("reuses an in-flight connection even when the module is reloaded", async () => {
    let resolveConnect!: () => void;
    mocks.connect.mockReturnValueOnce(new Promise<void>((resolve) => { resolveConnect = resolve; }));
    const firstModule = await import("./mongodb");
    const first = firstModule.connectToDatabase();
    vi.resetModules();
    const secondModule = await import("./mongodb");
    const second = secondModule.connectToDatabase();
    resolveConnect();
    expect(await first).toBe(await second);
    expect(mocks.MongoClient).toHaveBeenCalledTimes(1);
  });

  it("closes a failed pool and allows a later request to reconnect", async () => {
    const failure = new Error("cluster temporarily unavailable");
    mocks.connect.mockRejectedValueOnce(failure);
    const { connectToDatabase } = await import("./mongodb");
    await expect(Promise.all([connectToDatabase(), connectToDatabase()])).rejects.toBe(failure);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(globalThis.mongoConnectionPromise).toBeUndefined();
    await expect(connectToDatabase()).resolves.toMatchObject({ db: database });
    expect(mocks.MongoClient).toHaveBeenCalledTimes(2);
  });

  it("preserves the connection error and recovers even if cleanup fails", async () => {
    const failure = new Error("connection failed");
    mocks.connect.mockRejectedValueOnce(failure);
    mocks.close.mockRejectedValueOnce(new Error("close failed"));
    const { connectToDatabase } = await import("./mongodb");
    await expect(connectToDatabase()).rejects.toBe(failure);
    await expect(connectToDatabase()).resolves.toMatchObject({ db: database });
  });

  it("bounds pool growth, idle sockets and wait time", async () => {
    const { connectToDatabase } = await import("./mongodb");
    await connectToDatabase();
    expect(mocks.MongoClient).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      maxPoolSize: 10, minPoolSize: 0, maxConnecting: 2,
      maxIdleTimeMS: 60_000, waitQueueTimeoutMS: 5_000, tls: true,
    }));
    expect(mocks.db).toHaveBeenCalledWith("moviereckon_test");
  });

  it("supports a validated pool-size override", async () => {
    vi.stubEnv("MONGODB_MAX_POOL_SIZE", "20");
    const { connectToDatabase } = await import("./mongodb");
    await connectToDatabase();
    expect(mocks.MongoClient).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxPoolSize: 20 }));
  });

  it.each(["0", "101", "1.5", "invalid"])("rejects invalid pool size %s before connecting", async (size) => {
    vi.stubEnv("MONGODB_MAX_POOL_SIZE", size);
    const { connectToDatabase } = await import("./mongodb");
    await expect(connectToDatabase()).rejects.toThrow("MONGODB_MAX_POOL_SIZE");
    expect(mocks.MongoClient).not.toHaveBeenCalled();
  });

  it("preserves production TLS verification", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MONGODB_TLS_INSECURE", "true");
    const { connectToDatabase } = await import("./mongodb");
    await expect(connectToDatabase()).rejects.toThrow("MONGODB_TLS_INSECURE");
    expect(mocks.MongoClient).not.toHaveBeenCalled();
  });

  it("preserves externally managed index deployments", async () => {
    vi.stubEnv("MONGODB_SKIP_INDEX_BOOTSTRAP", "true");
    const { connectToDatabase } = await import("./mongodb");
    await connectToDatabase();
    expect(mocks.createIndex).not.toHaveBeenCalled();
  });
});
