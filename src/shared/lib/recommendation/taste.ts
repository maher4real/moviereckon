export type TasteContentType = "movie" | "tv";

export interface TasteTitleEvent {
  contentId: number;
  contentType: TasteContentType;
  title?: string;
  genres?: number[];
  language?: string;
  occurredAt?: string;
  signal: "watched" | "liked" | "watchlist" | "give_it_a_go" | "one_time_watch" | "must_watch" | "skip";
}

export interface TastePreferences {
  preferredGenres?: number[];
  preferredLanguages?: string[];
}

export interface TasteEvidence {
  key: string;
  title: string;
  contentType: TasteContentType;
  /** Metadata captured with the activity so seed reconstruction stays honest. */
  genreIds?: number[];
  language?: string;
  signal: "liked" | "watchlist" | "give_it_a_go" | "one_time_watch" | "must_watch";
  weight: number;
}

/** Activity examples intentionally removed from learning, kept for restore UI. */
export interface TasteExcludedEvidence {
  key: string;
  title: string;
  contentType: TasteContentType;
  genreIds?: number[];
  language?: string;
  occurredAt?: string;
  signal: TasteTitleEvent["signal"];
}

export interface TasteCluster {
  id: string;
  contentType: TasteContentType | "mixed";
  genreIds: number[];
  language?: string;
  weight: number;
  evidence: TasteEvidence[];
}

export interface TasteProfile {
  version: number;
  sourceFingerprint: string;
  updatedAt: string;
  exploration: number;
  explicit: {
    genres: number[];
    languages: string[];
  };
  /** Affinities learned from activity only; explicit choices are kept separate. */
  learned: {
    genres: Record<string, number>;
    languages: Record<string, number>;
  };
  inferred: {
    genres: Record<string, number>;
    languages: Record<string, number>;
  };
  negative: {
    genres: Record<string, number>;
    languages: Record<string, number>;
  };
  clusters: TasteCluster[];
  evidence: TasteEvidence[];
  excludedEvidence?: TasteExcludedEvidence[];
}

const SIGNAL_WEIGHT: Record<TasteTitleEvent["signal"], number> = {
  watched: 0,
  liked: 3.5,
  must_watch: 3,
  give_it_a_go: 2,
  one_time_watch: 0.75,
  watchlist: 1,
  skip: -2.5,
};

function normalizeLanguage(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(normalized) ? normalized : null;
}

function normalizeGenres(values: number[] | undefined): number[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].slice(0, 24);
}

function normalizeLanguages(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values
      .map(normalizeLanguage)
      .filter((value): value is string => Boolean(value)),
  )].slice(0, 10);
}

// Keep activity/profile keys identical to the canonical recommendation key.
// These keys cross the server/client boundary and are also used for durable
// delivery and full-history exclusion membership checks.
function tasteContentKey(type: TasteContentType, id: number): string {
  return `${type}_${id}`;
}

function normalizeEvents(events: TasteTitleEvent[]): TasteTitleEvent[] {
  return events
    .filter(
      (event) =>
        Number.isInteger(event.contentId) &&
        event.contentId > 0 &&
        (event.contentType === "movie" || event.contentType === "tv") &&
        Number.isFinite(SIGNAL_WEIGHT[event.signal]),
    )
    .map((event) => ({
      ...event,
      title: event.title?.trim() || "Untitled",
      genres: normalizeGenres(event.genres),
      language: normalizeLanguage(event.language) || undefined,
    }));
}

function fingerprint(
  events: TasteTitleEvent[],
  preferences: TastePreferences,
  now: string,
): string {
  const normalized = normalizeEvents(events)
    .map((event) =>
      [
        event.contentType,
        event.contentId,
        event.signal,
        event.title || "",
        normalizeGenres(event.genres).join(","),
        normalizeLanguage(event.language) || "",
        event.occurredAt || "",
      ].join(":"),
    )
    .sort();
  const genres = normalizeGenres(preferences.preferredGenres).join(",");
  const languages = normalizeLanguages(preferences.preferredLanguages).join(",");
  const input = `${normalized.join("|")}|preferences:${genres}|${languages}|time:${now.slice(0, 10)}`;
  // Keep the profile builder usable from shared/browser tests without pulling
  // a Node crypto polyfill into the client bundle.
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function addWeight(target: Record<string, number>, key: string, weight: number): void {
  if (!Number.isFinite(weight) || weight === 0) return;
  target[key] = (target[key] || 0) + weight;
}

/**
 * Build a rebuildable profile from observed activity. Watched is retained as
 * history/exclusion evidence but has zero affinity weight; a title contributes
 * at most its strongest observed positive signal.
 */
export function buildTasteProfile(
  events: TasteTitleEvent[],
  preferences: TastePreferences,
  previous?: Pick<TasteProfile, "version" | "sourceFingerprint"> | null,
  now = new Date().toISOString(),
): TasteProfile {
  const normalizedEvents = normalizeEvents(events);
  const sourceFingerprint = fingerprint(normalizedEvents, preferences, now);
  const version =
    previous && previous.sourceFingerprint === sourceFingerprint
      ? previous.version
      : Math.max(1, (previous?.version || 0) + 1);

  const strongestByTitle = new Map<string, TasteTitleEvent & { weight: number }>();
  const decisionSignals = new Set<TasteTitleEvent["signal"]>([
    "give_it_a_go",
    "one_time_watch",
    "must_watch",
    "skip",
  ]);
  for (const event of normalizedEvents) {
    const key = tasteContentKey(event.contentType, event.contentId);
    const weight = SIGNAL_WEIGHT[event.signal];
    const current = strongestByTitle.get(key);
    const eventTime = Date.parse(event.occurredAt || "");
    const currentTime = Date.parse(current?.occurredAt || "");
    const eventIsDecision = decisionSignals.has(event.signal);
    const currentIsDecision = Boolean(current && decisionSignals.has(current.signal));
    const eventIsNewer = Number.isFinite(eventTime) &&
      (!Number.isFinite(currentTime) || eventTime > currentTime);
    const currentIsNewer = Number.isFinite(currentTime) &&
      (!Number.isFinite(eventTime) || currentTime > eventTime);
    // Feedback is an explicit decision. Once a user has changed their mind,
    // the newest decision wins even when its nominal weight is lower than an
    // older rejection (or vice versa). This makes undo/reaction order stable.
    const newestDecisionWins = eventIsDecision && currentIsDecision && (
      eventIsNewer || (!eventIsNewer && !currentIsNewer && event.signal > (current?.signal || ""))
    );
    const newerRejectionWins = event.signal === "skip" && eventIsNewer;
    const newerPositiveWins = current?.signal === "skip" && weight > 0 && eventIsNewer;
    const sameStrengthIsNewer = current && Math.abs(weight) === Math.abs(current.weight) && eventIsNewer;
    if (!current || newestDecisionWins || newerRejectionWins || newerPositiveWins || (
      !currentIsNewer && Math.abs(weight) > Math.abs(current.weight)
    ) || Boolean(sameStrengthIsNewer)) {
      strongestByTitle.set(key, { ...event, weight });
    }
  }

  const learnedGenreWeights: Record<string, number> = {};
  const learnedLanguageWeights: Record<string, number> = {};
  const negativeGenreWeights: Record<string, number> = {};
  const negativeLanguageWeights: Record<string, number> = {};
  const evidence: TasteEvidence[] = [];
  const clusterMap = new Map<string, TasteCluster>();

  const explicitGenres = normalizeGenres(preferences.preferredGenres);
  const explicitLanguages = normalizeLanguages(preferences.preferredLanguages);

  for (const event of strongestByTitle.values()) {
    if (event.weight < 0) {
      const recency = event.occurredAt ? recencyMultiplier(event.occurredAt, now) : 1;
      const weight = Math.abs(event.weight) * recency;
      for (const genreId of event.genres || []) addWeight(negativeGenreWeights, String(genreId), weight);
      const language = normalizeLanguage(event.language);
      if (language) addWeight(negativeLanguageWeights, language, weight);
      continue;
    }
    if (event.weight === 0) continue;
    const recency = event.occurredAt ? recencyMultiplier(event.occurredAt, now) : 1;
    const weight = event.weight * recency;
    for (const genreId of event.genres || []) addWeight(learnedGenreWeights, String(genreId), weight);
    const language = normalizeLanguage(event.language);
    if (language) addWeight(learnedLanguageWeights, language, weight);

    if (event.signal === "watched") continue;
    const titleEvidence: TasteEvidence = {
      key: tasteContentKey(event.contentType, event.contentId),
      title: event.title || "Untitled",
      contentType: event.contentType,
      genreIds: [...(event.genres || [])],
      language: normalizeLanguage(event.language) || undefined,
      signal: event.signal as TasteEvidence["signal"],
      weight,
    };
    evidence.push(titleEvidence);

    for (const genreId of event.genres || []) {
      const id = `${event.contentType}:genre:${genreId}`;
      const existing = clusterMap.get(id) || {
        id,
        contentType: event.contentType,
        genreIds: [genreId],
        weight: 0,
        evidence: [],
      } satisfies TasteCluster;
      existing.weight += weight;
      if (existing.evidence.length < 8) existing.evidence.push(titleEvidence);
      clusterMap.set(id, existing);
    }
  }

  for (const genreId of explicitGenres) {
    const id = `preference:genre:${genreId}`;
    const existing = clusterMap.get(id) || {
      id,
      contentType: "mixed",
      genreIds: [genreId],
      weight: 0,
      evidence: [],
    } satisfies TasteCluster;
    existing.weight += Math.max(1.4, 3 - explicitGenres.indexOf(genreId) * 0.2);
    clusterMap.set(id, existing);
  }

  const inferredGenreWeights: Record<string, number> = { ...learnedGenreWeights };
  const inferredLanguageWeights: Record<string, number> = { ...learnedLanguageWeights };
  explicitGenres.forEach((genreId, index) => addWeight(
    inferredGenreWeights,
    String(genreId),
    Math.max(1.4, 3 - index * 0.2),
  ));
  explicitLanguages.forEach((language, index) => addWeight(
    inferredLanguageWeights,
    language,
    Math.max(1.4, 2.8 - index * 0.2),
  ));

  const inferredGenres = Object.fromEntries(
    Object.entries(inferredGenreWeights)
      .filter(([, weight]) => weight > 0)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 24),
  );
  const inferredLanguages = Object.fromEntries(
    Object.entries(inferredLanguageWeights)
      .filter(([, weight]) => weight > 0)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 12),
  );

  return {
    version,
    sourceFingerprint,
    updatedAt: now,
    exploration: evidence.length === 0 ? 0.12 : Math.min(0.2, 0.16 + 1 / Math.max(10, evidence.length * 2)),
    explicit: { genres: explicitGenres, languages: explicitLanguages },
    learned: { genres: learnedGenreWeights, languages: learnedLanguageWeights },
    inferred: { genres: inferredGenres, languages: inferredLanguages },
    negative: { genres: negativeGenreWeights, languages: negativeLanguageWeights },
    clusters: [...clusterMap.values()]
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 12)
      .map((cluster) => ({
        ...cluster,
        evidence: cluster.evidence.slice(0, 5),
      })),
    evidence: evidence.sort((left, right) => right.weight - left.weight).slice(0, 24),
  };
}

function recencyMultiplier(timestamp: string, now = new Date().toISOString()): number {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) return 1;
  const nowValue = Date.parse(now);
  const days = Math.max(0, ((Number.isFinite(nowValue) ? nowValue : Date.now()) - value) / 86_400_000);
  return Math.max(0.55, 1 - Math.max(0, days - 7) / 45);
}

export function getTasteGenreWeight(profile: TasteProfile, genreId: number): number {
  return profile.inferred.genres[String(genreId)] || 0;
}

export function getLearnedTasteGenreWeight(profile: TasteProfile, genreId: number): number {
  return profile.learned?.genres[String(genreId)] || 0;
}

export function getTasteLanguageWeight(profile: TasteProfile, language: string | undefined): number {
  const normalized = normalizeLanguage(language);
  return normalized ? profile.inferred.languages[normalized] || 0 : 0;
}

export function getLearnedTasteLanguageWeight(profile: TasteProfile, language: string | undefined): number {
  const normalized = normalizeLanguage(language);
  return normalized ? profile.learned?.languages[normalized] || 0 : 0;
}
