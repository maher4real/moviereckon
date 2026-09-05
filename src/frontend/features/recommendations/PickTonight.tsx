import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Clock3,
  Heart,
  Loader2,
  RotateCw,
  Save,
  Sparkles,
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
import { Input } from "@/frontend/components/ui/input";
import { Badge } from "@/frontend/components/ui/badge";
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
    <article className="min-w-0 rounded-xl border border-border/70 bg-background/35 p-3">
      <ContentCard item={item} type="mixed" showActions={false} />
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Why ${title} was picked`}>
        {reasons.length > 0 ? reasons.slice(0, 2).map((reason) => <Badge key={reason} variant="outline" className="text-[10px]">{reason}</Badge>) : <Badge variant="outline" className="text-[10px]">Discovery pick</Badge>}
        {runtime && <Badge variant="secondary" className="gap-1 text-[10px]"><Clock3 className="h-3 w-3" /> {runtime} min{contentType === "tv" ? " / episode" : ""}</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3" aria-label={`${title} actions`}>
        <Button type="button" size="sm" variant={liked ? "default" : "outline"} aria-pressed={liked} onClick={(event) => void handleLove(event)} className="gap-1 px-2 text-[11px]">
          <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} /> {liked ? "Loved" : "Love"}
        </Button>
        <Button type="button" size="sm" variant={saved ? "default" : "outline"} aria-pressed={saved} onClick={(event) => void handleSave(event)} className="gap-1 px-2 text-[11px]">
          <Save className="h-3.5 w-3.5" /> {saved ? "Saved" : "Save"}
        </Button>
        <Button type="button" size="sm" variant={watched ? "default" : "outline"} aria-pressed={watched} disabled={watched} onClick={(event) => void handleWatched(event)} className="gap-1 px-2 text-[11px]">
          <Check className="h-3.5 w-3.5" /> {watched ? "Watched" : "Already watched"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendingFeedback !== null} onClick={(event) => void handleFeedback("skip", event)} className="gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive">
          Not for me
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendingFeedback !== null} onClick={(event) => void handleFeedback("not_now", event)} className="gap-1 px-2 text-[11px] text-muted-foreground">
          Not now
        </Button>
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
  const [timeInput, setTimeInput] = useState("");
  const [offset, setOffset] = useState(0);
  const maxMinutes = useMemo(() => {
    if (!timeInput.trim()) return null;
    const parsed = Number(timeInput);
    return Number.isInteger(parsed) && parsed >= 15 ? Math.min(parsed, 360) : null;
  }, [timeInput]);

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
    () => selectEligiblePickItems(items, excludedKeys, runtimeByKey, maxMinutes),
    [excludedKeys, items, maxMinutes, runtimeByKey],
  );
  useEffect(() => {
    setOffset((current) => current >= eligibleItems.length ? 0 : current);
  }, [eligibleItems.length]);

  if (items.length === 0) return null;

  const picks = eligibleItems.slice(offset, offset + 3);
  const hasTimeError = timeInput.trim().length > 0 && maxMinutes === null;
  const hasPartialRuntimeError = maxMinutes !== null && runtimeLookup.failedCount > 0 && !runtimeError;

  return (
    <section className="surface-panel glass-detail-panel mb-6" aria-labelledby="pick-tonight-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="section-glass-icon" aria-hidden="true"><Sparkles className="h-4 w-4" /></span>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Pick Tonight</p>
          </div>
          <h2 id="pick-tonight-heading" className="mt-2 text-lg font-semibold">Three eligible choices for now</h2>
          <p className="mt-1 text-xs text-muted-foreground">Reckon removes titles already watched, liked, saved, or rated before choosing this trio.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="pick-tonight-time" className="text-xs text-muted-foreground">Up to</label>
          <Input
            id="pick-tonight-time"
            type="number"
            min={15}
            max={360}
            step={5}
            value={timeInput}
            onChange={(event) => setTimeInput(event.target.value)}
            placeholder="Any"
            aria-label="Maximum runtime in minutes"
            className="h-9 w-20 text-xs"
          />
          <span className="text-xs text-muted-foreground">min</span>
        </div>
      </div>

      {hasTimeError && <p className="mt-3 text-xs text-destructive" role="alert">Enter at least 15 minutes, or clear the time filter.</p>}
      {maxMinutes !== null && isLoadingRuntime && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking real runtimes…</p>}
      {maxMinutes !== null && runtimeError && <p className="mt-3 text-xs text-destructive" role="alert">Runtime details could not be loaded. Clear the filter to browse all eligible picks.</p>}
      {hasPartialRuntimeError && <p className="mt-3 text-xs text-muted-foreground" role="status">Some runtime details were unavailable; showing choices with a confirmed runtime.</p>}

      {picks.length > 0 ? (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
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
              className="gap-2"
            >
              <RotateCw className="h-3.5 w-3.5" /> Show another trio
            </Button>
          </div>
        </>
      ) : maxMinutes !== null && runtimeError ? null : maxMinutes !== null && !isLoadingRuntime ? (
        <p className="mt-4 rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground" role="status">No eligible title has a known runtime within {maxMinutes} minutes.</p>
      ) : !hasTimeError ? (
        <p className="mt-4 rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground" role="status">No new eligible titles are in the loaded feed yet.</p>
      ) : null}
    </section>
  );
}
