import { isReleased } from "@/shared/lib/recommendation/feedRanking";

// Unreleased titles are only shown where the user explicitly browses upcoming
// content: TMDB's /movie/upcoming list and discover queries that ask for
// future dates (the Upcoming page and the home "Upcoming" rows). Everywhere
// else — trending, popular, search, similar, filmographies — they are hidden.

type Params = Record<string, unknown> | undefined;

const FUTURE_DATE_PARAMS = [
  "primary_release_date.gte",
  "release_date.gte",
  "first_air_date.gte",
  "air_date.gte",
] as const;

const TITLE_LIST_KEYS = ["results", "cast", "crew"] as const;

function todayIso(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isUpcomingRequest(endpoint: string, params: Params, now = Date.now()): boolean {
  if (endpoint === "/movie/upcoming") return true;
  if (!endpoint.startsWith("/discover/")) return false;

  return FUTURE_DATE_PARAMS.some((key) => {
    const value = params?.[key];
    if (value === undefined || value === null || value === "") return false;
    const time = Date.parse(String(value));
    return Number.isFinite(time) && time > now;
  });
}

/**
 * Cap discover queries at today so TMDB itself drops unreleased titles —
 * filtering afterwards would leave short or empty pages in infinite lists.
 */
export function withReleasedOnlyParams<P extends Params>(
  endpoint: string,
  params: P,
  now = Date.now(),
): P {
  if (isUpcomingRequest(endpoint, params, now)) return params;

  const lteKey =
    endpoint === "/discover/movie"
      ? "primary_release_date.lte"
      : endpoint === "/discover/tv"
        ? "first_air_date.lte"
        : null;
  if (!lteKey) return params;

  const today = todayIso(now);
  const current = params?.[lteKey];
  if (typeof current === "string" && current && current <= today) return params;

  return { ...(params ?? {}), [lteKey]: today } as P;
}

/** Movies carry `release_date`, series `first_air_date`; people and other records carry neither. */
export function isUnreleasedTitle(item: unknown, now = Date.now()): boolean {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  if (!("release_date" in record) && !("first_air_date" in record)) return false;

  const date = (record.release_date ?? record.first_air_date) as string | null | undefined;
  return !isReleased(date, now);
}

export function filterUnreleasedTitles<T>(payload: T, now = Date.now()): T {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;

  const record = payload as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;

  for (const key of TITLE_LIST_KEYS) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((item) => !isUnreleasedTitle(item, now));
    if (kept.length !== list.length) {
      next ??= { ...record };
      next[key] = kept;
    }
  }

  return (next ?? payload) as T;
}

/** Apply both rules to one TMDB request/response pair. */
export function applyReleasedOnlyPolicy<T>(
  endpoint: string,
  params: Params,
  payload: T,
  now = Date.now(),
): T {
  return isUpcomingRequest(endpoint, params, now) ? payload : filterUnreleasedTitles(payload, now);
}
