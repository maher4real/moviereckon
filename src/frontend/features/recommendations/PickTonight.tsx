import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Clock3,
  Heart,
  Loader2,
  RotateCw,
  Save,
} from "lucide-react";
import {
  getMovieDetails,
  getTVShowDetails,
  type Movie,
  type TVShow,
} from "@/shared/lib/tmdb";
import type { FeedbackType, RecommendationExplanation } from "@/frontend/lib/mongodbClient";
import { useUserData } from "@/frontend/hooks/useUserData";
import { useWatchlist } from "@/frontend/hooks/useWatchlist";
import { ToastAction } from "@/frontend/components/ui/toast";
import { useToast } from "@/frontend/hooks/use-toast";
import ContentCard from "@/frontend/components/ContentCard";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/shared/lib/utils";

type ContentItem = Movie | TVShow;

export interface PickRuntimeDetails {
  runtime?: number;
  episode_run_time?: number[];
}

interface PickRuntimeLookup {
  byKey: Record<string, number>;
  failedCount: number;
}

const RUNTIME_OPTIONS: Array<{ label: string; minutes: number | null }> = [
  { label: "Any length", minutes: null },
  { label: "≤ 90m", minutes: 90 },
  { label: "≤ 2h", minutes: 120 },
  { label: "≤ 2.5h", minutes: 150 },
];

export function pickItemKey(item: ContentItem): string {
  return `${"title" in item ? "movie" : "tv"}_${item.id}`;
}

/**
 * Pick Tonight only accepts candidates that are absent from the user's local
 * library and have a known runtime when a time limit is selected. Unknown
 * runtimes are deliberately excluded instead of being treated as zero.
 */
export function selectEligiblePickItems(
  items: ContentItem[],
  excludedKeys: ReadonlySet<string>,
  runtimeByKey: Readonly<Record<string, number>> = {},
  maxMinutes: number | null = null,
): ContentItem[] {
  return items.filter((item) => {
    const key = pickItemKey(item);
    if (excludedKeys.has(key)) return false;
    if (maxMinutes === null) return true;
    const runtime = runtimeByKey[key];
    return Number.isFinite(runtime) && runtime > 0 && runtime <= maxMinutes;
  });
}

/** Keep the first (best-ranked) title of each franchise, in feed order. */
export function onePerFranchise(
  items: ContentItem[],
  explanationById: Readonly<Record<string, RecommendationExplanation>>,
): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const franchise = explanationById[pickItemKey(item)]?.franchiseKey;
    if (!franchise) return true;
    if (seen.has(franchise)) return false;
    seen.add(franchise);
    return true;
  });
}

function itemTitle(item: ContentItem): string {
  return "title" in item ? item.title : item.name;
}

function itemType(item: ContentItem): "movie" | "tv" {
  return "title" in item ? "movie" : "tv";
}

function knownRuntime(details: PickRuntimeDetails): number | null {
  if (Number.isFinite(details.runtime) && (details.runtime || 0) > 0) return details.runtime || null;
  const episodeRuntime = details.episode_run_time?.find((value) => Number.isFinite(value) && value > 0);
  return episodeRuntime || null;
}

function PickTonightCard({
  item,
  explanation,
  runtime,
}: {
  item: ContentItem;
  explanation?: RecommendationExplanation;
  runtime?: number;
}) {
  const {
    isLiked,
    toggleLike,
    isWatched,
    addToWatchHistory,
    getFeedback,
    setFeedback,
    removeFeedback,
  } = useUserData();
  const { isInWatchlist, toggleItem } = useWatchlist();
  const { toast } = useToast();
  const [pendingFeedback, setPendingFeedback] = useState<FeedbackType | null>(null);
  const contentType = itemType(item);
  const title = itemTitle(item);
  const liked = isLiked(item.id, contentType);
  const watched = isWatched(item.id, contentType);
  const saved = isInWatchlist(item.id, contentType);

  const metadata = {
    genres: item.genre_ids || [],
    language: item.original_language || "en",
  };

  const handleLove = async (event: MouseEvent) => {
    event.stopPropagation();
    await toggleLike({
      content_id: item.id,
      content_type: contentType,
      title,
      poster_path: item.poster_path,
      ...metadata,
    });
  };

  const handleSave = async (event: MouseEvent) => {
    event.stopPropagation();
    await toggleItem({
      content_id: item.id,
      content_type: contentType,
      title,
      poster_path: item.poster_path,
      ...metadata,
    });
  };

  const handleWatched = async (event: MouseEvent) => {
    event.stopPropagation();
    if (watched) return;
    await addToWatchHistory({
      content_id: item.id,
      content_type: contentType,
      title,
      poster_path: item.poster_path,
      ...metadata,
    });
  };

  const handleFeedback = async (feedbackType: Extract<FeedbackType, "skip" | "not_now">, event: MouseEvent) => {
    event.stopPropagation();
    if (pendingFeedback) return;
    const previous = getFeedback(item.id, contentType);
    setPendingFeedback(feedbackType);
    try {
      const result = await setFeedback({
        content_id: item.id,
        content_type: contentType,
        feedback_type: feedbackType,
        title,
        poster_path: item.poster_path,
        ...metadata,
      });
      if (!result.ok) return;

      const undo = async () => {
        const current = getFeedback(item.id, contentType);
        if (result.action === "removed") {
          if (previous) {
            await setFeedback({
              content_id: item.id,
              content_type: contentType,
              feedback_type: previous,
              title,
              poster_path: item.poster_path,
              ...metadata,
            });
          }
          return;
        }
        // Do not overwrite a newer choice made after the toast appeared.
        if (current !== feedbackType) return;
        await removeFeedback(item.id, contentType);
        if (previous) {
          await setFeedback({
            content_id: item.id,
            content_type: contentType,
            feedback_type: previous,
            title,
            poster_path: item.poster_path,
            ...metadata,
          });
        }
      };

      toast({
        title: result.action === "removed" ? "Feedback removed" : "Feedback saved",
        description: feedbackType === "not_now"
          ? "This title is hidden for a while."
          : "This title will stay out of future picks.",
        action: (
          <ToastAction altText="Undo feedback" onClick={() => void undo()}>
            Undo
          </ToastAction>
        ),
      });
    } finally {
      setPendingFeedback(null);
    }
  };

  const reasons = explanation?.reasons?.map((reason) => reason.label).filter(Boolean) || [];

  return (
    <article className="tonight-card flex min-w-0 snap-start flex-col">
      <ContentCard item={item} type="mixed" showActions={false} variant="landscape" />
      <ul className="mt-3 flex min-h-6 flex-wrap gap-1.5" aria-label={`Why ${title} was picked`}>
        {(reasons.length > 0 ? reasons.slice(0, 2) : ["Discovery pick"]).map((reason) => (
          <li key={reason} className="tonight-reason">{reason}</li>
        ))}
        {runtime && <li className="tonight-reason gap-1"><Clock3 className="size-3" aria-hidden="true" />{runtime} min{contentType === "tv" ? " / ep" : ""}</li>}
      </ul>
      <div className="mt-auto grid grid-cols-[minmax(0,1fr)_44px_44px] gap-2 pt-4" aria-label={`${title} actions`}>
        <Button type="button" variant={saved ? "outline" : "default"} aria-pressed={saved} onClick={(event) => void handleSave(event)} className="min-h-11 gap-2 px-3 text-sm">
          <Save className="h-3.5 w-3.5" /> {saved ? "Saved" : "Save"}
        </Button>
        <Button type="button" size="icon" variant="outline" aria-pressed={liked} aria-label={liked ? "Loved" : "Love"} title={liked ? "Loved" : "Love"} onClick={(event) => void handleLove(event)} className={cn("size-11", liked && "bg-primary/15 text-foreground ring-1 ring-primary/40")}>
          <Heart className={cn("size-4", liked && "fill-current")} />
        </Button>
        <Button type="button" size="icon" variant="outline" aria-pressed={watched} aria-label={watched ? "Watched" : "Already watched"} title={watched ? "Watched" : "Already watched"} disabled={watched} onClick={(event) => void handleWatched(event)} className="size-11">
          <Check className="size-4" />
        </Button>
        <div className="col-span-3 -ml-2 flex items-center gap-1">
          <Button type="button" variant="ghost" disabled={pendingFeedback !== null} onClick={(event) => void handleFeedback("skip", event)} className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground">
            Not for me
          </Button>
          <span className="text-muted-foreground/40" aria-hidden="true">·</span>
          <Button type="button" variant="ghost" disabled={pendingFeedback !== null} onClick={(event) => void handleFeedback("not_now", event)} className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground">
            Not now
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function PickTonight({
  items,
  explanationById,
}: {
  items: ContentItem[];
  explanationById: Record<string, RecommendationExplanation>;
}) {
  const { isWatched, isLiked, getFeedback } = useUserData();
  const { isInWatchlist } = useWatchlist();
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  const excludedKeys = useMemo(() => {
    const excluded = new Set<string>();
    items.forEach((item) => {
      const type = itemType(item);
      if (
        isWatched(item.id, type) ||
        isLiked(item.id, type) ||
        isInWatchlist(item.id, type) ||
        getFeedback(item.id, type)
      ) {
        excluded.add(pickItemKey(item));
      }
    });
    return excluded;
  }, [getFeedback, isInWatchlist, isLiked, isWatched, items]);

  const runtimeCandidates = useMemo(
    () => selectEligiblePickItems(items, excludedKeys).slice(0, 24),
    [excludedKeys, items],
  );
  const runtimeKeys = useMemo(() => runtimeCandidates.map(pickItemKey), [runtimeCandidates]);
  const { data: runtimeLookup = { byKey: {}, failedCount: 0 }, isFetching: isLoadingRuntime, isError: runtimeError } = useQuery<PickRuntimeLookup>({
    queryKey: ["pick-tonight-runtime", runtimeKeys],
    queryFn: async () => {
      const entries = await Promise.allSettled(runtimeCandidates.map(async (item) => {
        const details = itemType(item) === "movie"
          ? await getMovieDetails(item.id)
          : await getTVShowDetails(item.id);
        const runtime = knownRuntime(details);
        return runtime ? [pickItemKey(item), runtime] as const : null;
      }));
      const successfulEntries = entries.flatMap((entry) =>
        entry.status === "fulfilled" && entry.value ? [entry.value] : [],
      );
      const failedCount = entries.filter((entry) => entry.status === "rejected").length;
      const fulfilledCount = entries.length - failedCount;
      if (runtimeCandidates.length > 0 && fulfilledCount === 0) {
        throw new Error("runtime_lookup_failed");
      }
      return { byKey: Object.fromEntries(successfulEntries), failedCount };
    },
    enabled: maxMinutes !== null && runtimeCandidates.length > 0,
    staleTime: 15 * 60 * 1000,
  });
  const runtimeByKey = runtimeLookup.byKey;

  const eligibleItems = useMemo(
    () => onePerFranchise(selectEligiblePickItems(items, excludedKeys, runtimeByKey, maxMinutes), explanationById),
    [excludedKeys, explanationById, items, maxMinutes, runtimeByKey],
  );
  useEffect(() => {
    setOffset((current) => current >= eligibleItems.length ? 0 : current);
  }, [eligibleItems.length]);

  if (items.length === 0) return null;

  const picks = eligibleItems.slice(offset, offset + 3);
  const hasPartialRuntimeError = maxMinutes !== null && runtimeLookup.failedCount > 0 && !runtimeError;

  return (
    <section className="pick-tonight mb-12" aria-labelledby="pick-tonight-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="page-kicker">Tonight&apos;s shortlist</p>
          <h2 id="pick-tonight-heading" className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Pick Tonight</h2>
          <p className="mt-1 text-sm text-muted-foreground">Three fresh picks you haven&apos;t watched, saved or rated.</p>
        </div>
        <div className="tonight-runtime" role="group" aria-label="Maximum runtime">
          {RUNTIME_OPTIONS.map(({ label, minutes }) => (
            <button
              key={label}
              type="button"
              aria-pressed={maxMinutes === minutes}
              onClick={() => setMaxMinutes(minutes)}
              className="tonight-runtime-option"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {maxMinutes !== null && isLoadingRuntime && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking real runtimes…</p>}
      {maxMinutes !== null && runtimeError && <p className="mt-3 text-xs text-destructive" role="alert">Runtime details could not be loaded. Clear the filter to browse all eligible picks.</p>}
      {hasPartialRuntimeError && <p className="mt-3 text-xs text-muted-foreground" role="status">Some runtime details were unavailable; showing choices with a confirmed runtime.</p>}

      {picks.length > 0 ? (
        <>
          <div className="tonight-grid mt-5">
            {picks.map((item) => {
              const key = pickItemKey(item);
              return <PickTonightCard key={key} item={item} explanation={explanationById[key]} runtime={runtimeByKey[key]} />;
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{eligibleItems.length} eligible {eligibleItems.length === 1 ? "choice" : "choices"}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={eligibleItems.length <= 3}
              onClick={() => setOffset((current) => current + 3 >= eligibleItems.length ? 0 : current + 3)}
              className="min-h-11 gap-2"
            >
              <RotateCw className="h-3.5 w-3.5" /> Show another trio
            </Button>
          </div>
        </>
      ) : maxMinutes !== null && runtimeError ? null : maxMinutes !== null && !isLoadingRuntime ? (
        <p className="mt-4 rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground" role="status">No eligible title has a known runtime within {maxMinutes} minutes.</p>
      ) : (
        <p className="mt-4 rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground" role="status">No new eligible titles are in the loaded feed yet.</p>
      )}
    </section>
  );
}
