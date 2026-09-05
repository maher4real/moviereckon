/** Opt-in local native Mongo lifecycle QA; never selects an application DB. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { loadRecommendationTaste } from "@/backend/services/recommendationTaste";
import { deleteUserAccount, exportUserData } from "@/backend/services/userPrivacy";

const enabled = process.env.MOVIERECKON_RUN_DB_QA === "1";
const runId = randomUUID().replaceAll("-", "");
const databaseName = `moviereckon_qa_${Date.now()}_${runId.slice(0, 12)}`;
let client: MongoClient | undefined;
let db: Db;
let ownsDatabase = false;

function interceptCollection(database: Db, name: string, method: string, action: (invoke: () => Promise<unknown>) => Promise<unknown>): Db {
  return new Proxy(database, { get(target, property) {
    if (property === "collection") return (collectionName: string) => {
      const collection = target.collection(collectionName);
      if (collectionName !== name) return collection;
      return new Proxy(collection, { get(source, key) {
        const value = Reflect.get(source, key);
        if (key === method) return (...args: unknown[]) => action(() => value.apply(source, args));
        return typeof value === "function" ? value.bind(source) : value;
      } });
    };
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
}
async function account() {
  const _id = new ObjectId();
  await db.collection("users").insertOne({ _id, email: `${_id}@example.test`, username: "Disposable QA", password_hash: "never-export-this" });
  return _id.toHexString();
}

describe.skipIf(!enabled)("native Mongo account lifecycle QA", () => {
  beforeAll(async () => {
    const uri = process.env.MONGODB_URI || "";
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) throw new Error("This QA suite requires an explicit loopback MongoDB URI");
    try {
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      db = client.db(databaseName);
      if ((await db.listCollections().toArray()).length) throw new Error("QA namespace collision");
      await db.collection("qa_ownership").insertOne({ runId });
      ownsDatabase = true;
      await db.collection("user_taste_profiles").createIndex({ user_id: 1 }, { unique: true });
      await db.collection("user_taste_controls").createIndex({ user_id: 1 }, { unique: true });
      await db.collection("account_lifecycle").createIndex({ user_id: 1 }, { unique: true });
    } catch {
      throw new Error("Could not initialize isolated local Mongo QA; connection details withheld");
    }
  });
  afterAll(async () => {
    try {
      if (ownsDatabase && db.databaseName === databaseName && /^moviereckon_qa_\d+_[a-f0-9]{12}$/.test(databaseName)) {
        if (!(await db.collection("qa_ownership").findOne({ runId }))) throw new Error("QA ownership marker missing");
        await db.dropDatabase();
      }
    } finally { await client?.close(); }
  });
  it("cleans a real profile upsert that was paused after its pre-write fence until deletion completed", async () => {
    const userId = await account();
    await db.collection("liked_items").insertOne({ user_id: userId, content_id: 1, content_type: "movie", title: "QA", genres: [28], liked_at: new Date().toISOString() });
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const delayed = interceptCollection(db, "user_taste_profiles", "updateOne", async invoke => { reached(); await gate; return invoke(); });
    const pending = loadRecommendationTaste(delayed, userId).then(() => null, error => error);
    await entered;
    try { expect((await deleteUserAccount(db, userId)).deleted).toBe(true); }
    finally { release(); }
    expect(await pending).toMatchObject({ code: "ACCOUNT_DELETED" });
    expect(await db.collection("user_taste_profiles").countDocuments({ user_id: userId })).toBe(0);
    expect(await db.collection("users").countDocuments({ _id: new ObjectId(userId) })).toBe(0);
  });

  it("removes exactly one vote from a shared summary when deleting one account", async () => {
    const userId = await account();
    await db.collection("content_feedback").insertMany([
      { user_id: userId, content_id: 201, content_type: "movie", feedback_type: "must_watch" },
      { user_id: "other-qa", content_id: 201, content_type: "movie", feedback_type: "must_watch" },
    ]);
    await db.collection("content_feedback_summary").insertOne({ content_id: 201, content_type: "movie", counts: { must_watch: 2 }, total_votes: 2 });
    await deleteUserAccount(db, userId);
    await deleteUserAccount(db, userId);
    const summary = await db.collection("content_feedback_summary").findOne({ content_id: 201 });
    expect(summary).toMatchObject({ counts: { must_watch: 1 }, total_votes: 1 });
    expect(await db.collection("content_feedback").countDocuments({ user_id: "other-qa" })).toBe(1);
  });

  it("recovers correct feedback totals after failure between source deletion and summary persistence", async () => {
    const userId = await account();
    await db.collection("content_feedback").insertOne({ user_id: userId, content_id: 202, content_type: "tv", feedback_type: "must_watch" });
    await db.collection("content_feedback_summary").insertOne({ content_id: 202, content_type: "tv", counts: { must_watch: 1 }, total_votes: 1 });
    let fail = true;
    const failing = interceptCollection(db, "content_feedback_summary", "updateOne", async invoke => {
      if (fail) { fail = false; throw new Error("Injected disposable QA storage interruption"); }
      return invoke();
    });
    await expect(deleteUserAccount(failing, userId)).rejects.toThrow();
    // Model recovery after a crashed worker's lease expires, without sleeping.
    await db.collection("account_lifecycle").updateOne({ user_id: userId }, { $set: { deletion_lease_expires_at: "2000-01-01T00:00:00Z" } });
    await deleteUserAccount(db, userId);
    const summary = await db.collection("content_feedback_summary").findOne({ content_id: 202 });
    expect(Number(summary?.total_votes || 0)).toBe(0);
    expect(Number(summary?.counts?.must_watch || 0)).toBe(0);
  });

  it("reconciles a terminal tombstone's late crash residue including orphan batches without sessions", async () => {
    const userId = await account();
    await deleteUserAccount(db, userId);
    await db.collection("user_taste_profiles").insertOne({ user_id: userId, private_evidence: "late worker result" });
    await db.collection("recommendation_batches").insertOne({ user_id: userId, session_id: "missing-session", items: [] });
    await db.collection("recommendation_deliveries").insertOne({ user_id: userId, session_id: "missing-session", content_key: "movie_1" });
    await deleteUserAccount(db, userId);
    for (const name of ["user_taste_profiles", "recommendation_batches", "recommendation_deliveries"]) {
      expect(await db.collection(name).countDocuments({ user_id: userId })).toBe(0);
    }
    const tombstone = await db.collection("account_lifecycle").findOne({ user_id: userId });
    expect(tombstone?.state).toBe("deleted");
    expect(tombstone).not.toHaveProperty("email");
    expect(tombstone).not.toHaveProperty("username");
  });

  it("exports only the requested user's data and strips nested secrets", async () => {
    const userId = await account();
    await db.collection("user_preferences").insertMany([
      { user_id: userId, preferred_genres: [28], nested: { access_token: "secret", safe: "retained" } },
      { user_id: "other-qa", preferred_genres: [99], private_note: "another-user" },
    ]);
    const result = await exportUserData(db, userId);
    expect(result.data.preferences).toHaveLength(1);
    expect(result.data.preferences[0]).toMatchObject({ nested: { safe: "retained" } });
    expect(JSON.stringify(result)).not.toContain("access_token");
    expect(JSON.stringify(result)).not.toContain("never-export-this");
    expect(JSON.stringify(result)).not.toContain("another-user");
  });
});
