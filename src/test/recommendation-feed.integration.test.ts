/**
 * Opt-in real MongoDB protocol QA. Never uses the configured application DB.
 * Run: MOVIERECKON_RUN_DB_QA=1 npm test -- src/test/recommendation-feed.integration.test.ts
 * Auth and TMDB are fixtures; profile, exclusion, cursor, lease and storage code is real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import type { VercelRequest, VercelResponse } from "../backend/api/lib/http";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getUserFromRequest: vi.fn(),
  discoverServerMovies: vi.fn(),
  discoverServerTVShows: vi.fn(),
}));
vi.mock("@/backend/api/lib/mongodb", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/backend/api/lib/auth", () => ({ getUserFromRequest: mocks.getUserFromRequest }));
vi.mock("@/backend/services/tmdbServer", () => ({
  discoverServerMovies: mocks.discoverServerMovies,
  discoverServerTVShows: mocks.discoverServerTVShows,
}));
import handler from "@/backend/api/_handlers/user/recommendations-v2";

interface FeedPage {
  items: Array<{ id: number; title?: string; name?: string }>;
  nextCursor: string | null;
  hasMore: boolean;
  feedSessionId: string;
}
interface ResponseBody { data?: FeedPage; code?: string }
const enabled = process.env.MOVIERECKON_RUN_DB_QA === "1";
const runId = randomUUID().replaceAll("-", "");
const databaseName = `moviereckon_qa_${Date.now()}_${runId.slice(0, 12)}`;
const userId = `qa-${runId}`;
let client: MongoClient | undefined;
let db: Db;
let ownsDatabase = false;
let restoreErrorLogging: (() => void) | undefined;
const initialSecret = process.env.RECOMMENDATIONS_CURSOR_SECRET;

async function readQaUri(): Promise<string> {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  // Read only URI; do not import app env or its configured database name.
  for (const path of [".env.local", ".env"]) {
    try {
      const values = parseEnv(await readFile(path, "utf8"));
      if (values.MONGODB_URI) return values.MONGODB_URI;
    } catch { /* Missing optional env file. */ }
  }
  throw new Error("Disposable Mongo QA requires MONGODB_URI; no URI was printed.");
}

function movie(id: number) {
  return {
    id, title: `Database QA ${id}`, original_title: `Database QA ${id}`,
    overview: "Synthetic disposable integration fixture", poster_path: null,
    backdrop_path: null, release_date: "2024-01-01", vote_average: 7,
    vote_count: 100, popularity: 1000-id/100, genre_ids: [18],
    original_language: "en", adult: false, video: false,
  };
}

async function call(cursor?: string) {
  const params = new URLSearchParams({ limit: "24", content_type: "movie" });
  if (cursor) params.set("cursor", cursor);
  const request = {
    method: "GET", url: `/api/user/recommendations/v2?${params}`,
    headers: { host: "localhost:3000", "x-forwarded-for": "203.0.113.76" },
  } as unknown as VercelRequest;
  const response = {
    statusCode: 200, body: {} as ResponseBody,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(body: ResponseBody) { this.body = body; return this; },
  };
  await handler(request, response as unknown as VercelResponse);
  return response;
}
function data(response: Awaited<ReturnType<typeof call>>): FeedPage {
  expect(response.statusCode).toBe(200);
  expect(response.body.data).toBeDefined();
  return response.body.data!;
}
async function sanitized(body: () => Promise<void>) {
  try { await body(); } catch (error) {
    if (error instanceof Error && (error.name === "AssertionError" || error.name === "AssertionError$1")) throw error;
    // eslint-disable-next-line preserve-caught-error -- Raw database causes can disclose infrastructure details.
    throw new Error("Disposable Mongo QA operation failed; infrastructure details were withheld.");
  }
}

describe.skipIf(!enabled)("real Mongo recommendation feed protocol (disposable database)", () => {
  beforeAll(async () => {
    restoreErrorLogging = vi.spyOn(console, "error").mockImplementation(() => undefined).mockRestore;
    process.env.RECOMMENDATIONS_CURSOR_SECRET = `disposable-integration-secret-${runId}`;
    let stage = "validate-name";
    try {
      if (!/^moviereckon_qa_\d+_[a-f0-9]{12}$/.test(databaseName)) throw new Error("Invalid disposable name");
      stage = "create-client";
      client = new MongoClient(await readQaUri(), { serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 10_000 });
      stage = "connect";
      await client.connect();
      db = client.db(databaseName);
      stage = "check-disposable-database";
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      if (collections.length) throw new Error("Disposable name unexpectedly exists");
      stage = "create-disposable-marker";
      await db.collection("qa_ownership").insertOne({ runId, createdAt: new Date() });
      ownsDatabase = true;
      mocks.connectToDatabase.mockResolvedValue({ db, client });
      mocks.getUserFromRequest.mockResolvedValue({ id: userId, email: "qa@example.test" });
      mocks.discoverServerTVShows.mockResolvedValue({ page: 1, total_pages: 1, results: [] });
      mocks.discoverServerMovies.mockImplementation(async ({ page }: { page: number }) => ({
        page, total_pages: 30,
        results: Array.from({ length: 40 }, (_, index) => movie((page-1)*40+index+1)),
      }));
    } catch (error) {
      const code = typeof (error as { code?: unknown })?.code === "number" ? (error as { code: number }).code : "unavailable";
      // eslint-disable-next-line preserve-caught-error -- Keep URI and raw database details out of test output.
      throw new Error(`Could not initialize disposable Mongo QA at ${stage} (numeric code: ${code}); infrastructure details withheld.`);
    }
  }, 30_000);

  afterAll(async () => {
    try {
      if (ownsDatabase && client && db.databaseName === databaseName && databaseName.startsWith("moviereckon_qa_")) {
        const marker = await db.collection("qa_ownership").findOne({ runId });
        if (!marker) throw new Error("Disposable ownership marker missing");
        await db.dropDatabase();
        ownsDatabase = false;
      }
    } catch {
      throw new Error("Disposable Mongo QA cleanup failed; inspect only the uniquely prefixed QA database. Existing application data was never selected.");
    } finally {
      await client?.close().catch(() => undefined);
      if (initialSecret === undefined) delete process.env.RECOMMENDATIONS_CURSOR_SECRET;
      else process.env.RECOMMENDATIONS_CURSOR_SECRET = initialSecret;
      restoreErrorLogging?.();
    }
  }, 30_000);

  it("persists cursor replay through a fresh Mongo client connection", async () => sanitized(async () => {
    const first = data(await call());
    expect(first.nextCursor).toBeTruthy();
    const second = data(await call(first.nextCursor!));
    const callsBeforeReplay = mocks.discoverServerMovies.mock.calls.length;
    const freshClient = new MongoClient(await readQaUri(), { serverSelectionTimeoutMS: 10_000 });
    try {
      await freshClient.connect();
      mocks.connectToDatabase.mockResolvedValue({ db: freshClient.db(databaseName), client: freshClient });
      const replay = data(await call(first.nextCursor!));
      expect(replay.items).toEqual(second.items);
      expect(replay.nextCursor).toBe(second.nextCursor);
      expect(mocks.discoverServerMovies.mock.calls.length).toBe(callsBeforeReplay);
      const delivered = await db.collection("recommendation_deliveries").countDocuments({ session_id: first.feedSessionId });
      expect(delivered).toBe(first.items.length+second.items.length);
    } finally {
      mocks.connectToDatabase.mockResolvedValue({ db, client });
      await freshClient.close();
    }
  }), 30_000);

  it("returns one durable page for concurrent requests and no duplicates on continuation", async () => sanitized(async () => {
    const first = data(await call());
    expect(first.nextCursor).toBeTruthy();
    const responses = await Promise.all(Array.from({ length: 4 }, () => call(first.nextCursor!)));
    expect(responses.every(response => [200,503].includes(response.statusCode))).toBe(true);
    expect(responses.some(response => response.statusCode===200)).toBe(true);
    const replay = data(await call(first.nextCursor!));
    for (const response of responses.filter(response => response.statusCode===200)) {
      expect(data(response).items).toEqual(replay.items);
    }
    const firstIds = new Set(first.items.map(item => item.id));
    expect(replay.items.every(item => !firstIds.has(item.id))).toBe(true);
    const third = data(await call(replay.nextCursor!));
    const allIds = [...first.items,...replay.items,...third.items].map(item => item.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(await db.collection("recommendation_batches").countDocuments({ session_id:first.feedSessionId, page:2 })).toBe(1);
    expect(await db.collection("recommendation_deliveries").countDocuments({ session_id:first.feedSessionId })).toBe(allIds.length);
  }), 30_000);

  it("applies real full-history canonical exclusions beyond 160 titles", async () => sanitized(async () => {
    await db.collection("watch_history").insertMany(Array.from({ length: 190 }, (_, index) => ({
      user_id:userId, content_id:index+1, content_type:"movie", title:`Watched QA ${index+1}`,
      genres:[18], language:"en", watched_at:"2000-01-01T00:00:00.000Z",
    })));
    await db.collection("liked_items").insertOne({ user_id:userId,content_id:203,content_type:"movie",title:"Liked QA",liked_at:new Date().toISOString() });
    const first = data(await call());
    const collected = [...first.items];
    let current = first;
    // A bounded source scan may return an empty but resumable page when an
    // account has already seen the early catalog. Follow that public contract.
    for (let attempt = 0; collected.length < 48 && attempt < 12; attempt++) {
      expect(current.hasMore).toBe(true);
      expect(current.nextCursor).toBeTruthy();
      current = data(await call(current.nextCursor!));
      collected.push(...current.items);
    }
    expect(collected.length).toBeGreaterThanOrEqual(48);
    expect(collected.every(item => item.id>190 && item.id!==203)).toBe(true);
    expect(new Set(collected.map(item => item.id)).size).toBe(collected.length);
    const keys = await db.collection("recommendation_deliveries").find({ session_id:first.feedSessionId }).toArray();
    expect(keys.every(row => /^movie_\d+$/.test(String(row.content_key)))).toBe(true);
  }), 30_000);
});
