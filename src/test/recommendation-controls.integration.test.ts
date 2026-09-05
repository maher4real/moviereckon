/** Native Mongo QA: explicit opt-in, loopback URI, unique disposable database. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { loadRecommendationTaste, markTasteProfileStale, resetRecommendationTaste, updateRecommendationTasteControls } from "@/backend/services/recommendationTaste";

const enabled = process.env.MOVIERECKON_RUN_DB_QA === "1";
const runId = randomUUID().replaceAll("-", "");
const databaseName = `moviereckon_qa_${Date.now()}_${runId.slice(0, 12)}`;
let client: MongoClient | undefined;
let db: Db;
let ownsDatabase = false;
const liked = (userId: string, id: number, genre = 28, at = new Date().toISOString()) => ({
  user_id: userId, content_id: id, content_type: "movie", title: `Disposable QA ${id}`,
  genres: [genre], language: "en", liked_at: at,
});

describe.skipIf(!enabled)("native Mongo taste controls and profile concurrency QA", () => {
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

  it("persists exploration and excludes/restores learning while retaining the original library item", async () => {
    const userId = `${runId}-controls`;
    await db.collection("liked_items").insertOne(liked(userId, 42));
    expect((await loadRecommendationTaste(db, userId)).profile.evidence).toHaveLength(1);
    expect((await updateRecommendationTasteControls(db, userId, { explorationMode: "adventurous" })).explorationMode).toBe("adventurous");
    await updateRecommendationTasteControls(db, userId, { excludedLearningKey: "movie:42" });
    const excluded = await loadRecommendationTaste(db, userId);
    expect(excluded.profile.evidence).toEqual([]);
    expect(excluded.excludedKeys.has("movie_42")).toBe(true);
    expect(await db.collection("liked_items").countDocuments({ user_id: userId })).toBe(1);
    await updateRecommendationTasteControls(db, userId, { restoreLearningKey: "movie_42" });
    expect((await loadRecommendationTaste(db, userId)).profile.evidence.map(e => e.key)).toEqual(["movie_42"]);
  });

  it("reset survives profile reload without relearning retained old activity, then learns genuinely newer feedback", async () => {
    const userId = `${runId}-reset`;
    const resetAt = Date.now();
    await db.collection("liked_items").insertOne(liked(userId, 51, 28, new Date(resetAt - 60_000).toISOString()));
    await db.collection("user_preferences").insertOne({ user_id: userId, preferred_genres: [18], preferred_languages: ["ko"] });
    await loadRecommendationTaste(db, userId);
    await resetRecommendationTaste(db, userId, new Date(resetAt).toISOString());
    for (let n = 0; n < 2; n++) {
      const reset = await loadRecommendationTaste(db, userId);
      expect(reset.profile.evidence).toEqual([]);
      expect(reset.profile.explicit).toMatchObject({ genres: [18], languages: ["ko"] });
    }
    expect(await db.collection("liked_items").countDocuments({ user_id: userId })).toBe(1);
    await db.collection("liked_items").insertOne(liked(userId, 52, 35, new Date(resetAt + 1000).toISOString()));
    await markTasteProfileStale(db, userId);
    expect((await loadRecommendationTaste(db, userId)).profile.evidence.map(e => e.key)).toEqual(["movie_52"]);
  });

  it("preserves active Not Now suppression on both profile rebuild and cached reads", async () => {
    const userId = `${runId}-suppression`;
    await db.collection("content_feedback").insertOne({ user_id: userId, content_id: 71, content_type: "tv", feedback_type: "not_now", suppress_until: new Date(Date.now() + 60_000).toISOString() });
    for (let n = 0; n < 2; n++) expect((await loadRecommendationTaste(db, userId)).suppressedKeys.has("tv_71")).toBe(true);
  });

  it("an older rebuild cannot clear a newer mutation's stale marker", async () => {
    const userId = `${runId}-race`;
    await db.collection("liked_items").insertOne(liked(userId, 81));
    await loadRecommendationTaste(db, userId);
    await markTasteProfileStale(db, userId);
    let resume!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const wrapped = new Proxy(db, { get(target, property) {
      if (property === "collection") return (name: string) => {
        const collection = target.collection(name);
        if (name !== "user_taste_profiles") return collection;
        return new Proxy(collection, { get(source, key) {
          if (key === "updateOne") return async (...args: Parameters<typeof collection.updateOne>) => { entered(); await gate; return collection.updateOne(...args); };
          const value = Reflect.get(source, key); return typeof value === "function" ? value.bind(source) : value;
        } });
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const pending = loadRecommendationTaste(wrapped, userId);
    await started;
    try {
      await db.collection("liked_items").insertOne(liked(userId, 82, 18));
      await markTasteProfileStale(db, userId);
    } finally { resume(); }
    await pending;
    expect((await db.collection("user_taste_profiles").findOne({ user_id: userId }))?.stale).toBe(true);
    expect((await loadRecommendationTaste(db, userId)).profile.evidence.map(e => e.key)).toContain("movie_82");
  });
});
