import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Compass,
  Edit3,
  Eraser,
  Heart,
  History,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { searchMulti, type Movie, type MultiSearchResult, type TVShow } from "@/shared/lib/tmdb";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Badge } from "@/frontend/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/frontend/components/ui/alert-dialog";
import { useToast } from "@/frontend/hooks/use-toast";
import { cn } from "@/shared/lib/utils";

type FeedMode = "legacy" | "v2";
export type TasteSignal = "positive" | "negative";

export interface YourTastePanelProps {
  snapshot: mongoClient.RecommendationTasteSnapshot | null;
  feedMode: FeedMode;
  onEditPreferences: () => void;
  onExplorationChange: (mode: mongoClient.TasteExplorationMode) => Promise<void>;
  onForgetLearning: (key: string, excluded: boolean) => Promise<void>;
  onResetLearned: () => Promise<void>;
  onTitleSignal: (
    item: Movie | TVShow,
    signal: TasteSignal,
  ) => Promise<mongoClient.FeedbackMutationResult>;
}

const GENRE_LABELS: Record<number, string> = {
  12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama", 27: "Horror",
  28: "Action", 35: "Comedy", 36: "History", 37: "Western", 53: "Thriller",
  80: "Crime", 99: "Documentary", 878: "Sci-Fi", 9648: "Mystery", 10402: "Music",
  10749: "Romance", 10751: "Family", 10752: "War", 10759: "Action & Adventure",
  10762: "Kids", 10765: "Sci-Fi & Fantasy",
};

const LANGUAGE_LABELS: Record<string, string> = {
  ar: "Arabic", de: "German", en: "English", es: "Spanish", fr: "French", gu: "Gujarati",
  hi: "Hindi", it: "Italian", ja: "Japanese", kn: "Kannada", ko: "Korean", ml: "Malayalam",
  pt: "Portuguese", ru: "Russian", ta: "Tamil", te: "Telugu", tr: "Turkish", zh: "Chinese",
};

function isTitleResult(item: MultiSearchResult): item is Movie | TVShow {
  return item.media_type !== "person" && ("title" in item || "name" in item);
}

function titleOf(item: Movie | TVShow): string {
  return "title" in item ? item.title : item.name;
}

function typeOf(item: Movie | TVShow): "movie" | "tv" {
  return "title" in item ? "movie" : "tv";
}

function keyOf(item: Movie | TVShow): string {
  return `${typeOf(item)}_${item.id}`;
}

function signalLabel(signal: string): string {
  switch (signal) {
    case "liked": return "liked";
    case "must_watch": return "marked must watch";
    case "give_it_a_go": return "given a go";
    case "one_time_watch": return "watched once";
    case "skip": return "rejected";
    default: return signal.replaceAll("_", " ");
  }
}

function YourTasteTitleSearch({
  onTitleSignal,
}: {
  onTitleSignal: YourTastePanelProps["onTitleSignal"];
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["taste-title-search", debouncedQuery],
    queryFn: ({ signal }: { signal: AbortSignal }) => searchMulti(debouncedQuery, 1, signal),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const results = useMemo(
    () => (data?.results || []).filter(isTitleResult).slice(0, 6),
    [data?.results],
  );
  const settledQuery = debouncedQuery.length >= 2 && query.trim() === debouncedQuery;

  const applySignal = async (item: Movie | TVShow, signal: TasteSignal) => {
    const key = `${signal}:${keyOf(item)}`;
    setPendingKey(key);
    try {
      const result = await onTitleSignal(item, signal);
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Taste example was not saved",
          description: "Please try again.",
        });
        return;
      }
      toast({
        title: result.action === "removed" ? "Taste example removed" : "Taste example saved",
        description: result.action === "removed"
          ? `${titleOf(item)} no longer teaches your profile.`
          : signal === "positive"
            ? `${titleOf(item)} will guide future picks.`
            : `${titleOf(item)} will stay out of future picks.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Taste example was not saved",
        description: "Please try again.",
      });
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="rounded-xl border border-border/70 bg-background/35 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
          <Search className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Teach Reckon with a title</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Search for something you actually know. Your choice becomes a profile signal with its real metadata.
          </p>
        </div>
      </div>
      <div className="relative mt-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          placeholder="Search a movie or series"
          aria-label="Find a title to teach Reckon"
          className="pr-10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Clear title search"
          >
            ×
          </button>
        )}
      </div>

      {((isFetching || !settledQuery) && query.trim().length >= 2) && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching titles…
        </p>
      )}
      {isError && settledQuery && (
        <p className="mt-3 flex items-center gap-2 text-xs text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5" />
          Search is temporarily unavailable.
          <button type="button" onClick={() => void refetch()} className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Try again</button>
        </p>
      )}
      {!isFetching && settledQuery && !isError && results.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground" role="status">No movie or series titles found.</p>
      )}
      {settledQuery && results.length > 0 && (
        <div className="mt-3 space-y-2" aria-label="Taste title results">
          {results.map((item) => {
            const itemKey = keyOf(item);
            const year = ("release_date" in item ? item.release_date : item.first_air_date)?.slice(0, 4);
            const pendingPositive = pendingKey === `positive:${itemKey}`;
            const pendingNegative = pendingKey === `negative:${itemKey}`;
            return (
              <div
                key={itemKey}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{titleOf(item)}</p>
                  <p className="text-xs text-muted-foreground">
                    {year || "Year unknown"} · {typeOf(item) === "movie" ? "Movie" : "Series"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pendingKey !== null}
                    aria-label={`Use ${titleOf(item)} as a positive taste signal`}
                    onClick={() => void applySignal(item, "positive")}
                    className="gap-1.5"
                  >
                    {pendingPositive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Heart className="h-3.5 w-3.5" />}
                    Love it
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pendingKey !== null}
                    aria-label={`Use ${titleOf(item)} as a negative taste signal`}
                    onClick={() => void applySignal(item, "negative")}
                    className="gap-1.5 text-muted-foreground hover:text-destructive"
                  >
                    {pendingNegative ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
                    Not for me
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function YourTastePanel({
  snapshot,
  feedMode,
  onEditPreferences,
  onExplorationChange,
  onForgetLearning,
  onResetLearned,
  onTitleSignal,
}: YourTastePanelProps) {
  const [pendingControl, setPendingControl] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const { toast } = useToast();

  if (!snapshot) return null;

  const { profile, controls } = snapshot;
  const learnedGenres = Object.entries(profile.learned?.genres || {})
    .map(([id, weight]) => ({ id: Number(id), weight }))
    .filter((entry) => Number.isInteger(entry.id) && entry.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 6);
  const learnedLanguages = Object.entries(profile.learned?.languages || {})
    .filter(([, weight]) => weight > 0)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 6);
  const avoidedGenres = Object.entries(profile.negative?.genres || {})
    .map(([id, weight]) => ({ id: Number(id), weight }))
    .filter((entry) => Number.isInteger(entry.id) && entry.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4);
  const avoidedLanguages = Object.entries(profile.negative?.languages || {})
    .filter(([, weight]) => weight > 0)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 4);
  const excludedKeys = new Set(controls.excludedLearningKeys);
  const evidence = [...(profile.evidence || []), ...(profile.excludedEvidence || [])]
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.key === entry.key) === index)
    .slice(0, 8);

  const runControl = async (key: string, action: () => Promise<void>) => {
    setPendingControl(key);
    try {
      await action();
    } catch {
      toast({
        variant: "destructive",
        title: "Taste update failed",
        description: "Your previous taste profile is still intact. Please try again.",
      });
    } finally {
      setPendingControl(null);
    }
  };

  return (
    <section className="surface-panel glass-detail-panel mb-6" aria-labelledby="your-taste-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="section-glass-icon" aria-hidden="true"><Sparkles className="h-4 w-4" /></span>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Your Taste</p>
            <Badge variant="outline" className="text-[10px]">Profile v{profile.version}</Badge>
          </div>
          <h2 id="your-taste-heading" className="mt-2 text-lg font-semibold">A profile that evolves with you</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Chosen preferences guide the starting point. Learned affinities come from your watched, saved, and feedback activity.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEditPreferences} className="shrink-0 gap-2">
          <Edit3 className="h-4 w-4" /> Edit choices
        </Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-background/35 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4 text-primary" /> Selected preferences</div>
          <p className="mt-1 text-xs text-muted-foreground">These are the genres and languages you chose directly.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.explicit.genres.map((genre) => (
              <Badge key={`genre-${genre}`} variant="secondary">{GENRE_LABELS[genre] || `Genre ${genre}`}</Badge>
            ))}
            {profile.explicit.languages.map((language) => (
              <Badge key={`language-${language}`} variant="secondary">{LANGUAGE_LABELS[language] || language.toUpperCase()}</Badge>
            ))}
            {profile.explicit.genres.length === 0 && profile.explicit.languages.length === 0 && (
              <span className="text-xs text-muted-foreground">No explicit choices yet.</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/35 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" /> Learned affinities</div>
          <p className="mt-1 text-xs text-muted-foreground">These weights are inferred from activity and can be cleared independently.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {learnedGenres.map(({ id, weight }) => (
              <Badge key={`learned-genre-${id}`} variant="outline">{GENRE_LABELS[id] || `Genre ${id}`} · {weight.toFixed(1)}</Badge>
            ))}
            {learnedLanguages.map(([language, weight]) => (
              <Badge key={`learned-language-${language}`} variant="outline">{LANGUAGE_LABELS[language] || language.toUpperCase()} · {weight.toFixed(1)}</Badge>
            ))}
            {learnedGenres.length === 0 && learnedLanguages.length === 0 && (
              <span className="text-xs text-muted-foreground">Your activity has not formed a strong affinity yet.</span>
            )}
          </div>
        </div>
      </div>

      {(avoidedGenres.length > 0 || avoidedLanguages.length > 0) && (
        <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive"><Eraser className="h-4 w-4" /> Signals you have rejected</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {avoidedGenres.map(({ id, weight }) => <Badge key={`avoided-genre-${id}`} variant="outline" className="border-destructive/30 text-destructive">{GENRE_LABELS[id] || `Genre ${id}`} · {weight.toFixed(1)}</Badge>)}
            {avoidedLanguages.map(([language, weight]) => <Badge key={`avoided-language-${language}`} variant="outline" className="border-destructive/30 text-destructive">{LANGUAGE_LABELS[language] || language.toUpperCase()} · {weight.toFixed(1)}</Badge>)}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border/70 bg-background/35 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><Compass className="h-4 w-4 text-primary" /> Recommendation feel</div>
            <p className="mt-1 text-xs text-muted-foreground">Familiar stays close to learned signals. Adventurous gives quality and discovery more room.</p>
          </div>
          <div className="flex gap-2" role="group" aria-label="Recommendation feel">
            {(["familiar", "adventurous"] as const).map((mode) => {
              const active = controls.explorationMode === mode;
              const disabled = feedMode === "legacy" || pendingControl === `mode:${mode}`;
              return (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => void runControl(`mode:${mode}`, () => onExplorationChange(mode))}
                  className="capitalize"
                >
                  {pendingControl === `mode:${mode}` && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {mode}
                </Button>
              );
            })}
          </div>
        </div>
        {feedMode === "legacy" && <p className="mt-3 text-xs text-muted-foreground">This control is available when the durable recommendation feed is enabled.</p>}
      </div>

      {evidence.length > 0 && (
        <div className="mt-4 rounded-xl border border-border/70 bg-background/35 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" /> Activity examples</div>
          <p className="mt-1 text-xs text-muted-foreground">Forget an example when it no longer represents your taste. This does not remove the original item from your library.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {evidence.map((entry) => {
              const excluded = excludedKeys.has(entry.key);
              const actionKey = `evidence:${entry.key}`;
              return (
                <div key={entry.key} className={cn("flex items-center gap-3 rounded-lg border p-3", excluded ? "border-border/50 bg-muted/30 opacity-75" : "border-border/60 bg-card/40")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.title}</p>
                    <p className="text-xs text-muted-foreground">{signalLabel(entry.signal)} · {entry.contentType === "movie" ? "Movie" : "Series"}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pendingControl === actionKey}
                    onClick={() => void runControl(actionKey, () => onForgetLearning(entry.key, excluded))}
                    className="shrink-0 gap-1.5 text-xs"
                  >
                    {pendingControl === actionKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <Eraser className="h-3.5 w-3.5" />}
                    {excluded ? "Restore" : "Forget"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <YourTasteTitleSearch onTitleSignal={onTitleSignal} />
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/70 bg-background/35 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><RotateCcw className="h-4 w-4 text-primary" /> Reset learned taste</div>
          <p className="mt-1 text-xs text-muted-foreground">Start learning again from now. Your selected preferences and library stay unchanged.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setResetOpen(true)} className="shrink-0 gap-2">
          <RotateCcw className="h-4 w-4" /> Reset learned profile
        </Button>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset learned taste?</AlertDialogTitle>
            <AlertDialogDescription>
              Reckon will stop using activity before this moment to learn your profile. Your explicit choices, watched titles, likes, and watchlist remain in place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingControl === "reset"}>Keep profile</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingControl === "reset"}
              onClick={(event) => {
                event.preventDefault();
                void runControl("reset", async () => {
                  await onResetLearned();
                  setResetOpen(false);
                });
              }}
            >
              {pendingControl === "reset" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset learned taste
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
