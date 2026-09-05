import "server-only";

import {
  buildTasteProfile,
  type TasteContentType,
  type TasteExcludedEvidence,
  type TastePreferences,
  type TasteProfile,
  type TasteTitleEvent,
} from "@/shared/lib/recommendation/taste";
import type { connectToDatabase } from "@/backend/api/lib/mongodb";
import {
  AccountDeletedError,
  acquireAccountWriteFence,
  assertAccountWriteFence,
} from "@/backend/services/accountLifecycle";

type Database = Awaited<ReturnType<typeof connectToDatabase>>["db"];

type RawDoc = Record<string, unknown>;

export interface RecommendationTasteState {
  profile: TasteProfile;
  excludedKeys: Set<string>;
  /** Temporary Not Now suppressions, kept separate from permanent exclusions. */
  suppressedKeys: Set<string>;
  events: TasteTitleEvent[];
  controls: RecommendationTasteControls;
}

export type TasteExplorationMode = "familiar" | "adventurous";

export interface RecommendationTasteControls {
  explorationMode: TasteExplorationMode;
  resetAt: string | null;
  excludedLearningKeys: string[];
  revision: number;
}

const DEFAULT_TASTE_CONTROLS: RecommendationTasteControls = {
  explorationMode: "familiar",
  resetAt: null,
  excludedLearningKeys: [],
  revision: 0,
};
const MAX_EXCLUDED_LEARNING_KEYS = 200;

export interface RecommendationTasteLoadOptions {
  // Feed pages use bounded candidate membership queries. Full activity reads
  // remain reserved for stale profile rebuilds.
  includeExclusions?: boolean;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function contentType(value: unknown): TasteContentType | null {
  return value === "movie" || value === "tv" ? value : null;
}

function contentKey(type: TasteContentType, id: number): string {
  return `${type}_${id}`;
}

function canonicalContentKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(movie|tv)[_:](\d+)$/.exec(value.trim().toLowerCase());
  if (!match) return null;
  const id = Number(match[2]);
  return Number.isInteger(id) && id > 0 ? contentKey(match[1] as TasteContentType, id) : null;
}

function title(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Untitled";
}

function genres(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((entry) => Number.isInteger(entry) && entry > 0))];
}

function language(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(normalized) ? normalized : undefined;
}

function eventFromDoc(
  doc: RawDoc,
  signal: TasteTitleEvent["signal"],
  timestampField: string,
): TasteTitleEvent | null {
  const id = positiveInteger(doc.content_id);
  const type = contentType(doc.content_type);
  if (!id || !type) return null;
  return {
    contentId: id,
    contentType: type,
    title: title(doc.title),
    genres: genres(doc.genres),
    language: language(doc.language),
    occurredAt:
      typeof doc[timestampField] === "string" ? String(doc[timestampField]) : undefined,
    signal,
  };
}

function readPreferenceList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))].slice(0, max);
}

function toPreferences(doc: RawDoc | null): TastePreferences {
  const preferredGenres = Array.isArray(doc?.preferred_genres)
    ? [...new Set(doc.preferred_genres.map(Number).filter((value) => Number.isInteger(value) && value > 0))]
    : [];
  const preferredLanguages = readPreferenceList(doc?.preferred_languages, 10)
    .map((value) => value.toLowerCase())
    .filter((value) => /^[a-z]{2,3}$/.test(value));
  return { preferredGenres, preferredLanguages };
}

function controlsFromDocument(doc: RawDoc | null): RecommendationTasteControls {
  if (!doc) return { ...DEFAULT_TASTE_CONTROLS, excludedLearningKeys: [] };
  const mode: TasteExplorationMode = doc.exploration_mode === "adventurous" ? "adventurous" : "familiar";
  const resetAt = typeof doc.reset_at === "string" && Number.isFinite(Date.parse(doc.reset_at))
    ? doc.reset_at
    : null;
  const excludedLearningKeys = Array.isArray(doc.excluded_learning_keys)
    ? [...new Set(doc.excluded_learning_keys.map(canonicalContentKey).filter((key): key is string => Boolean(key)))].slice(0, MAX_EXCLUDED_LEARNING_KEYS)
    : [];
  const revision = Number.isInteger(Number(doc.revision)) && Number(doc.revision) >= 0
    ? Number(doc.revision)
    : 0;
  return { explorationMode: mode, resetAt, excludedLearningKeys, revision };
}

async function readTasteControls(db: Database, userId: string): Promise<RecommendationTasteControls> {
  const collection = db.collection("user_taste_controls");
  if (!collection || typeof collection.findOne !== "function") {
    return { ...DEFAULT_TASTE_CONTROLS, excludedLearningKeys: [] };
  }
  const document = await collection.findOne({ user_id: userId });
  return controlsFromDocument((document || null) as RawDoc | null);
}

export async function loadRecommendationTasteControls(
  db: Database,
  userId: string,
): Promise<RecommendationTasteControls> {
  return readTasteControls(db, userId);
}

export async function updateRecommendationTasteControls(
  db: Database,
  userId: string,
  patch: {
    explorationMode?: TasteExplorationMode;
    excludedLearningKey?: string;
    restoreLearningKey?: string;
  },
): Promise<RecommendationTasteControls> {
  const fence = await acquireAccountWriteFence(db, userId);
  const collection = db.collection("user_taste_controls");
  const now = new Date().toISOString();
  const explorationMode = patch.explorationMode === "adventurous" ? "adventurous" :
    patch.explorationMode === "familiar" ? "familiar" : undefined;
  const excludedLearningKey = canonicalContentKey(patch.excludedLearningKey);
  const restoreLearningKey = canonicalContentKey(patch.restoreLearningKey);
  if (excludedLearningKey && restoreLearningKey) {
    throw new Error("A taste update cannot exclude and restore the same activity together");
  }
  if (!explorationMode && !excludedLearningKey && !restoreLearningKey) {
    return readTasteControls(db, userId);
  }
  const update: Record<string, unknown> = {
    // Keep update paths disjoint. Mongo rejects a path that appears in both
    // $set and $setOnInsert (and an upserted $addToSet creates its own array).
    $set: { updated_at: now },
    $setOnInsert: {
      user_id: userId,
      created_at: now,
    },
    $inc: { revision: 1 },
  };
  if (explorationMode) (update.$set as Record<string, unknown>).exploration_mode = explorationMode;
  if (excludedLearningKey) (update.$addToSet = { excluded_learning_keys: excludedLearningKey });
  if (restoreLearningKey) (update.$pull = { excluded_learning_keys: restoreLearningKey });
  await collection.updateOne({ user_id: userId }, update, { upsert: true });
  try {
    await assertAccountWriteFence(db, fence);
  } catch (error) {
    if (error instanceof AccountDeletedError) {
      await collection.deleteOne({ user_id: userId }).catch(() => undefined);
    }
    throw error;
  }
  await markTasteProfileStale(db, userId);
  return readTasteControls(db, userId);
}

export async function resetRecommendationTaste(
  db: Database,
  userId: string,
  resetAt = new Date().toISOString(),
): Promise<RecommendationTasteControls> {
  const fence = await acquireAccountWriteFence(db, userId);
  const collection = db.collection("user_taste_controls");
  const now = new Date().toISOString();
  await collection.updateOne(
    { user_id: userId },
    {
      $set: {
        user_id: userId,
        reset_at: resetAt,
        excluded_learning_keys: [],
        updated_at: now,
      },
      $setOnInsert: {
        exploration_mode: "familiar",
        created_at: now,
      },
      $inc: { revision: 1 },
    },
    { upsert: true },
  );
  try {
    await assertAccountWriteFence(db, fence);
  } catch (error) {
    if (error instanceof AccountDeletedError) {
      await collection.deleteOne({ user_id: userId }).catch(() => undefined);
    }
    throw error;
  }
  await markTasteProfileStale(db, userId);
  return readTasteControls(db, userId);
}

async function readCollection(
  db: Database,
  name: string,
  userId: string,
  projection?: Record<string, 1>,
): Promise<RawDoc[]> {
  const collection = db.collection(name);
  const cursor = collection.find({ user_id: userId }, projection ? { projection } : undefined);
  return typeof cursor.toArray === "function" ? (await cursor.toArray()) as RawDoc[] : [];
}

function profileFromDocument(doc: RawDoc): TasteProfile | null {
  if (!Number.isInteger(Number(doc.version)) || typeof doc.sourceFingerprint !== "string") return null;
  if (!doc.explicit || !doc.inferred || !Array.isArray(doc.clusters)) return null;
  return {
    version: Number(doc.version),
    sourceFingerprint: String(doc.sourceFingerprint),
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : new Date().toISOString(),
    exploration: Number.isFinite(Number(doc.exploration)) ? Number(doc.exploration) : 0.12,
    explicit: doc.explicit as TasteProfile["explicit"],
    learned: (doc.learned || { genres: {}, languages: {} }) as TasteProfile["learned"],
    inferred: doc.inferred as TasteProfile["inferred"],
    negative: (doc.negative || { genres: {}, languages: {} }) as TasteProfile["negative"],
    clusters: doc.clusters as TasteProfile["clusters"],
    evidence: Array.isArray(doc.evidence) ? doc.evidence as TasteProfile["evidence"] : [],
    excludedEvidence: Array.isArray(doc.excludedEvidence)
      ? doc.excludedEvidence as TasteProfile["excludedEvidence"]
      : [],
  };
}

/** Read all observed activity for profile construction and permanent exclusions. */
export async function loadRecommendationTaste(
  db: Database,
  userId: string,
  options: RecommendationTasteLoadOptions = {},
): Promise<RecommendationTasteState> {
  const fence = await acquireAccountWriteFence(db, userId);
  const profileCollection = db.collection("user_taste_profiles");
  const controls = await readTasteControls(db, userId);
  const previousDoc = await profileCollection.findOne({ user_id: userId });
  const storedProfile = previousDoc ? profileFromDocument(previousDoc as RawDoc) : null;
  const storedMutationRevision = previousDoc && Number.isInteger(Number(previousDoc.mutation_revision))
    ? Number(previousDoc.mutation_revision)
    : null;
  const storedControlsRevisionPresent = Boolean(previousDoc && Number.isInteger(Number(previousDoc.controls_revision)));
  const storedControlsRevision = storedControlsRevisionPresent
    ? Number((previousDoc as RawDoc).controls_revision)
    : 0;
  const exclusionProjection = { content_id: 1, content_type: 1 } as Record<string, 1>;
  const currentPreferencesDoc = await db.collection("user_preferences").findOne(
    { user_id: userId },
    { projection: { preferred_genres: 1, preferred_languages: 1 } },
  );
  const currentPreferences = toPreferences((currentPreferencesDoc || null) as RawDoc | null);
  const preferencesMatch = Boolean(
    storedProfile &&
    JSON.stringify(storedProfile.explicit.genres) === JSON.stringify(currentPreferences.preferredGenres) &&
    JSON.stringify(storedProfile.explicit.languages) === JSON.stringify(currentPreferences.preferredLanguages),
  );
  const controlsMatch = storedControlsRevision === controls.revision;

  const today = new Date().toISOString().slice(0, 10);
  if (storedProfile && preferencesMatch && controlsMatch && previousDoc?.stale !== true && storedProfile.updatedAt.slice(0, 10) === today) {
    if (options.includeExclusions === false) {
      return {
        profile: storedProfile,
        excludedKeys: new Set<string>(),
        suppressedKeys: new Set<string>(),
        events: [],
        controls,
      };
    }
    const [historyDocs, likedDocs, watchlistDocs, feedbackDocs] = await Promise.all([
      readCollection(db, "watch_history", userId, exclusionProjection),
      readCollection(db, "liked_items", userId, exclusionProjection),
      readCollection(db, "watchlist", userId, exclusionProjection),
      readCollection(db, "content_feedback", userId, {
        ...exclusionProjection,
        feedback_type: 1,
        suppress_until: 1,
      }),
    ]);
    const excludedKeys = new Set<string>();
    const suppressedKeys = new Set<string>();
    const addExcluded = (doc: RawDoc, include: boolean) => {
      const id = positiveInteger(doc.content_id);
      const type = contentType(doc.content_type);
      if (include && id && type) excludedKeys.add(contentKey(type, id));
    };
    historyDocs.forEach((doc) => addExcluded(doc, true));
    likedDocs.forEach((doc) => addExcluded(doc, true));
    watchlistDocs.forEach((doc) => addExcluded(doc, true));
    feedbackDocs.forEach((doc) => addExcluded(doc, doc.feedback_type === "skip"));
    feedbackDocs.forEach((doc) => {
      const id = positiveInteger(doc.content_id);
      const type = contentType(doc.content_type);
      const expiresAt = typeof doc.suppress_until === "string" ? Date.parse(doc.suppress_until) : Number.NaN;
      if (id && type && doc.feedback_type === "not_now" && Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        suppressedKeys.add(contentKey(type, id));
      }
    });
    return { profile: storedProfile, excludedKeys, suppressedKeys, events: [], controls };
  }

  const [historyDocs, likedDocs, watchlistDocs, feedbackDocs, preferencesDoc] = await Promise.all([
    readCollection(db, "watch_history", userId),
    readCollection(db, "liked_items", userId),
    readCollection(db, "watchlist", userId),
    readCollection(db, "content_feedback", userId),
    db.collection("user_preferences").findOne({ user_id: userId }),
  ]);

  const events: TasteTitleEvent[] = [];
  const excludedLearningEvents: TasteTitleEvent[] = [];
  const excludedKeys = new Set<string>();
  const suppressedKeys = new Set<string>();
  const resetTimestamp = controls.resetAt ? Date.parse(controls.resetAt) : Number.NEGATIVE_INFINITY;
  const excludedLearningKeys = new Set(controls.excludedLearningKeys);
  const add = (doc: RawDoc, signal: TasteTitleEvent["signal"], timestamp: string) => {
    const event = eventFromDoc(doc, signal, timestamp);
    if (!event) return;
    const key = contentKey(event.contentType, event.contentId);
    if (signal === "watched" || signal === "liked" || signal === "watchlist" || signal === "skip") {
      excludedKeys.add(key);
    }
    const occurredAt = event.occurredAt ? Date.parse(event.occurredAt) : Number.NaN;
    if (excludedLearningKeys.has(key)) {
      // Keep a metadata-bearing copy so the user can restore a forgotten
      // example. It is deliberately excluded from the active profile below.
      excludedLearningEvents.push(event);
      return;
    }
    if (Number.isFinite(resetTimestamp) && (!Number.isFinite(occurredAt) || occurredAt <= resetTimestamp)) {
      return;
    }
    events.push(event);
  };

  historyDocs.forEach((doc) => add(doc, "watched", "watched_at"));
  likedDocs.forEach((doc) => add(doc, "liked", "liked_at"));
  watchlistDocs.forEach((doc) => add(doc, "watchlist", "added_at"));
  feedbackDocs.forEach((doc) => {
    const value = doc.feedback_type;
    if (
      value === "give_it_a_go" ||
      value === "one_time_watch" ||
      value === "must_watch" ||
      value === "skip"
    ) {
      add(doc, value, "updated_at");
    } else if (value === "not_now") {
      const id = positiveInteger(doc.content_id);
      const type = contentType(doc.content_type);
      const expiresAt = typeof doc.suppress_until === "string" ? Date.parse(doc.suppress_until) : Number.NaN;
      if (id && type && Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        suppressedKeys.add(contentKey(type, id));
      }
    }
  });

  const preferences = toPreferences((preferencesDoc || null) as RawDoc | null);
  const metadataByKey = new Map<string, { title?: string; genres: number[]; language?: string }>();
  for (const event of [...events, ...excludedLearningEvents]) {
    const key = contentKey(event.contentType, event.contentId);
    const previous = metadataByKey.get(key) || { genres: [] };
    metadataByKey.set(key, {
      title: event.title && event.title !== "Untitled" ? event.title : previous.title || event.title,
      genres: previous.genres.length > 0 ? previous.genres : event.genres || [],
      language: previous.language || event.language,
    });
  }
  const enrichEvent = (event: TasteTitleEvent) => {
    const metadata = metadataByKey.get(contentKey(event.contentType, event.contentId));
    return metadata
      ? {
          ...event,
          title: metadata.title || event.title,
          genres: event.genres?.length ? event.genres : metadata.genres,
          language: event.language || metadata.language,
        }
      : event;
  };
  const enrichedEvents = events.map(enrichEvent);
  const enrichedExcludedEvents = excludedLearningEvents.map(enrichEvent);
  const previous = previousDoc && Number.isInteger(Number(previousDoc.version))
    ? {
        version: Number(previousDoc.version),
        sourceFingerprint: String(previousDoc.sourceFingerprint || ""),
      }
    : null;
  let profile = buildTasteProfile(enrichedEvents, preferences, previous);
  const excludedEvidenceByKey = new Map<string, TasteExcludedEvidence>();
  for (const event of enrichedExcludedEvents) {
    const key = contentKey(event.contentType, event.contentId);
    const existing = excludedEvidenceByKey.get(key);
    const eventTime = Date.parse(event.occurredAt || "");
    const existingTime = Date.parse(existing?.occurredAt || "");
    if (!existing || (Number.isFinite(eventTime) && (!Number.isFinite(existingTime) || eventTime >= existingTime))) {
      excludedEvidenceByKey.set(key, {
        key,
        title: event.title || "Untitled",
        contentType: event.contentType,
        genreIds: [...(event.genres || [])],
        language: event.language,
        occurredAt: event.occurredAt,
        signal: event.signal,
      });
    }
  }
  profile = {
    ...profile,
    excludedEvidence: [...excludedEvidenceByKey.values()]
      .sort((left, right) => {
        const leftTime = Date.parse(left.occurredAt || "");
        const rightTime = Date.parse(right.occurredAt || "");
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return left.key.localeCompare(right.key);
      }),
  };

  if (
    !previous ||
    previous.version !== profile.version ||
    previous.sourceFingerprint !== profile.sourceFingerprint ||
    previousDoc?.stale === true
  ) {
    const update = {
      $set: {
        user_id: userId,
        ...profile,
        profile_version: profile.version,
        mutation_revision: storedMutationRevision ?? 0,
        controls_revision: controls.revision,
        processing_watermark: new Date().toISOString(),
        stale: false,
      },
      $setOnInsert: { created_at: new Date().toISOString() },
    };
    try {
      await assertAccountWriteFence(db, fence);
      const result = previous
        ? await profileCollection.updateOne(
            {
              user_id: userId,
              version: previous.version,
              sourceFingerprint: previous.sourceFingerprint,
              $and: [
                storedMutationRevision === null
                  ? { $or: [{ mutation_revision: { $exists: false } }, { mutation_revision: 0 }] }
                  : { mutation_revision: storedMutationRevision },
                storedControlsRevisionPresent
                  ? { controls_revision: storedControlsRevision }
                  : { $or: [{ controls_revision: { $exists: false } }, { controls_revision: 0 }] },
              ],
            },
            update,
          )
        : await profileCollection.updateOne({ user_id: userId, version: { $exists: false } }, update, { upsert: true });
      if (result.matchedCount === 0 && result.upsertedCount === 0) {
        const current = await profileCollection.findOne({ user_id: userId });
        const currentProfile = current ? profileFromDocument(current as RawDoc) : null;
        if (currentProfile) profile = currentProfile;
      }
      await assertAccountWriteFence(db, fence);
    } catch (error) {
      if (error instanceof AccountDeletedError) {
        await profileCollection.deleteOne({ user_id: userId }).catch(() => undefined);
        throw error;
      }
      const current = await profileCollection.findOne({ user_id: userId });
      const currentProfile = current ? profileFromDocument(current as RawDoc) : null;
      if (currentProfile) profile = currentProfile;
    }
  }

  return { profile, excludedKeys, suppressedKeys, events: enrichedEvents, controls };
}

/**
 * Check only the candidate IDs on the current page against permanent user
 * history. This keeps feed latency and memory bounded even for long-lived
 * accounts with thousands of watched or saved titles.
 */
export async function loadRecommendationExclusions(
  db: Database,
  userId: string,
  candidates: Array<{ type: TasteContentType; id: number }>,
): Promise<Set<string>> {
  const byType = new Map<TasteContentType, Set<number>>();
  candidates.forEach(({ type, id }) => {
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type)!.add(id);
  });
  const excluded = new Set<string>();
  if (byType.size === 0) return excluded;
  const contentTypes = [...byType.keys()];
  const contentIds = [...new Set(candidates.map(({ id }) => id))];
  const projection = { content_id: 1, content_type: 1 } as Record<string, 1>;
  const [historyDocs, likedDocs, watchlistDocs, feedbackDocs] = await Promise.all([
    readCollectionWithFilter(db, "watch_history", userId, contentIds, contentTypes, projection),
    readCollectionWithFilter(db, "liked_items", userId, contentIds, contentTypes, projection),
    readCollectionWithFilter(db, "watchlist", userId, contentIds, contentTypes, projection),
    readCollectionWithFilter(
      db,
      "content_feedback",
      userId,
      contentIds,
      contentTypes,
      { ...projection, feedback_type: 1 },
    ),
  ]);
  const add = (doc: RawDoc, include: boolean) => {
    if (!include) return;
    const id = positiveInteger(doc.content_id);
    const type = contentType(doc.content_type);
    if (id && type) excluded.add(contentKey(type, id));
  };
  historyDocs.forEach((doc) => add(doc, true));
  likedDocs.forEach((doc) => add(doc, true));
  watchlistDocs.forEach((doc) => add(doc, true));
  feedbackDocs.forEach((doc) => add(doc, doc.feedback_type === "skip"));
  return excluded;
}

/**
 * Candidate-scoped lookup for temporary Not Now suppressions. Suppressions
 * expire on their own and never enter the durable negative taste profile.
 */
export async function loadRecommendationSuppressions(
  db: Database,
  userId: string,
  candidates: Array<{ type: TasteContentType; id: number }>,
  now = Date.now(),
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const contentIds = [...new Set(candidates.map(({ id }) => id))];
  const contentTypes = [...new Set(candidates.map(({ type }) => type))];
  const feedbackDocs = await readCollectionWithFilter(
    db,
    "content_feedback",
    userId,
    contentIds,
    contentTypes,
    { content_id: 1, content_type: 1, feedback_type: 1, suppress_until: 1 },
  );
  const suppressed = new Set<string>();
  feedbackDocs.forEach((doc) => {
    if (doc.feedback_type !== "not_now") return;
    const id = positiveInteger(doc.content_id);
    const type = contentType(doc.content_type);
    const expiresAt = typeof doc.suppress_until === "string" ? Date.parse(doc.suppress_until) : Number.NaN;
    if (id && type && Number.isFinite(expiresAt) && expiresAt > now) suppressed.add(contentKey(type, id));
  });
  return suppressed;
}

async function readCollectionWithFilter(
  db: Database,
  name: string,
  userId: string,
  contentIds: number[],
  contentTypes: TasteContentType[],
  projection: Record<string, 1>,
): Promise<RawDoc[]> {
  const collection = db.collection(name);
  const cursor = collection.find(
    {
      user_id: userId,
      content_id: { $in: contentIds },
      content_type: { $in: contentTypes },
    },
    { projection },
  );
  return typeof cursor.toArray === "function" ? (await cursor.toArray()) as RawDoc[] : [];
}

export async function markTasteProfileStale(db: Database, userId: string): Promise<void> {
  const fence = await acquireAccountWriteFence(db, userId);
  const collection = db.collection("user_taste_profiles");
  await collection.updateOne(
    { user_id: userId },
    {
      $set: { stale: true, updated_at: new Date().toISOString() },
      // The builder includes this revision in its CAS filter. A mutation that
      // races a rebuild therefore cannot be overwritten by an old snapshot.
      $inc: { mutation_revision: 1 },
    },
    { upsert: false },
  );
  try {
    await assertAccountWriteFence(db, fence);
  } catch (error) {
    if (error instanceof AccountDeletedError) {
      await collection.deleteOne({ user_id: userId }).catch(() => undefined);
    }
    throw error;
  }
}
