import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck, Clapperboard, Info, RotateCw, Sparkles, Star, Tv } from "lucide-react";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/frontend/components/ui/dialog";
import { useWatchlist } from "@/frontend/hooks/useWatchlist";
import { buildTodaysPicks, type PickCandidate, type PickFilter, type TodaysPick } from "@/shared/lib/recommendation/todaysPicks";
import { genreName, languageLabel } from "@/shared/lib/catalogue";
import { getBackdropUrl, getPosterUrl } from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

interface TodaysPicksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: PickCandidate[];
  excludeKeys: ReadonlySet<string>;
  personalized: boolean;
  name?: string;
  /** "Skip for today": stop showing this card for the rest of the day. */
  onSkipToday: () => void;
}

const FILTERS: Array<{ value: PickFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "Series" },
];

function greeting(now = new Date()): { eyebrow: string; period: string } {
  const hour = now.getHours();
  if (hour < 5) return { eyebrow: "Late night", period: "tonight" };
  if (hour < 12) return { eyebrow: "Good morning", period: "today" };
  if (hour < 18) return { eyebrow: "Good afternoon", period: "today" };
  return { eyebrow: "Good evening", period: "tonight" };
}

function Meta({ pick }: { pick: TodaysPick }) {
  const rating = pick.item.vote_average;
  const genres = (pick.item.genre_ids || []).slice(0, 2).map((id) => genreName(id)).filter(Boolean);
  return (
    <p className="picks-meta">
      {pick.year && <span>{pick.year}</span>}
      {rating > 0 && (
        <span className="inline-flex items-center gap-1 text-[hsl(var(--rating-gold))]">
          <Star className="size-3 fill-current" aria-hidden="true" />{rating.toFixed(1)}
        </span>
      )}
      {pick.item.original_language && <span>{languageLabel(pick.item.original_language)}</span>}
      {genres.length > 0 && <span>{genres.join(" · ")}</span>}
    </p>
  );
}

function TypeChip({ type }: { type: "movie" | "tv" }) {
  const Icon = type === "movie" ? Clapperboard : Tv;
  return <span className="picks-type"><Icon className="size-3" aria-hidden="true" />{type === "movie" ? "Movie" : "Series"}</span>;
}

/** "What to watch today": a featured pick plus a varied set of movies and series. */
export default function TodaysPicksDialog({ open, onOpenChange, candidates, excludeKeys, personalized, name, onSkipToday }: TodaysPicksDialogProps) {
  const navigate = useNavigate();
  const { isInWatchlist, toggleItem } = useWatchlist();
  const contentRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<PickFilter>("all");
  const [seed, setSeed] = useState(0);
  const picks = useMemo(
    () => buildTodaysPicks(candidates, { excludeKeys, filter, seed }),
    [candidates, excludeKeys, filter, seed],
  );
  const { eyebrow, period } = greeting();
  const [feature, ...more] = picks;

  const openTitle = (pick: TodaysPick) => {
    onOpenChange(false);
    navigate(`/${pick.type}/${pick.item.id}`, { state: { from: "/home" } });
  };

  const toggleSave = (pick: TodaysPick) =>
    toggleItem({
      content_id: pick.item.id,
      content_type: pick.type,
      title: pick.title,
      poster_path: pick.item.poster_path,
      genres: pick.item.genre_ids || [],
      language: pick.item.original_language,
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="picks-dialog flex w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 outline-none focus:outline-none focus-visible:outline-none sm:rounded-2xl"
        // Land focus on the dialog itself: focusing the first filter chip drew a heavy ring on open.
        onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus(); }}
      >
        <header className="picks-header">
          <p className="picks-eyebrow"><Sparkles className="size-3.5" aria-hidden="true" />{eyebrow}{name ? `, ${name}` : ""}</p>
          <DialogTitle className="picks-title mt-1.5 text-2xl font-black leading-[1.1] tracking-[-0.03em] sm:text-3xl">What to watch {period}</DialogTitle>
          <DialogDescription className="picks-subtitle mt-1.5 max-w-2xl leading-relaxed">
            {personalized
              ? "A mix of films and series picked from your taste. Choose one, or shuffle for another round."
              : "Popular right now, across films and series. Set your taste in Reckon for picks made just for you."}
          </DialogDescription>
          <div className="picks-filters" role="group" aria-label="Show">
            {FILTERS.map((option) => (
              <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}
                className={cn("picks-filter", filter === option.value && "picks-filter-active")}>{option.label}</button>
            ))}
          </div>
        </header>

        <div className="picks-body">
          {!feature ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing fresh to suggest in this category right now. Try another filter or shuffle.
            </p>
          ) : (
            <>
              <article className="picks-feature" aria-label={`Top pick: ${feature.title}`}>
                <MediaImage
                  src={feature.item.backdrop_path ? getBackdropUrl(feature.item.backdrop_path, "large") : getPosterUrl(feature.item.poster_path, "large")}
                  alt=""
                  className="picks-feature-art"
                  width={1280}
                  height={720}
                  sizes="(max-width: 768px) 100vw, 896px"
                  fallbackSrc="/fallbacks/backdrop.svg"
                  fadeIn
                />
                <div className="picks-feature-scrim" aria-hidden="true" />
                <div className="picks-feature-content">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="picks-badge">Top pick</span>
                    <TypeChip type={feature.type} />
                    <span className="picks-reason">{feature.reason}</span>
                  </div>
                  <h3 className="picks-feature-title">{feature.title}</h3>
                  <Meta pick={feature} />
                  {feature.item.overview && <p className="picks-overview">{feature.item.overview}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="brand-primary-button min-h-11 gap-2 rounded-full px-5" onClick={() => openTitle(feature)}>
                      <Info className="size-4" aria-hidden="true" />View details
                    </Button>
                    <Button variant="outline" className="min-h-11 gap-2 rounded-full border-white/25 bg-white/10 px-4 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
                      onClick={() => void toggleSave(feature)} aria-pressed={isInWatchlist(feature.item.id, feature.type)}>
                      {isInWatchlist(feature.item.id, feature.type)
                        ? <><BookmarkCheck className="size-4" aria-hidden="true" />Saved</>
                        : <><Bookmark className="size-4" aria-hidden="true" />Save for later</>}
                    </Button>
                  </div>
                </div>
              </article>

              {more.length > 0 && (
                <>
                  <h3 className="picks-more-heading">More to consider</h3>
                  <ul className="picks-grid">
                    {more.map((pick) => {
                      const saved = isInWatchlist(pick.item.id, pick.type);
                      return (
                        <li key={pick.key} className="picks-card">
                          <button type="button" className="picks-card-main" onClick={() => openTitle(pick)} aria-label={`${pick.title}, ${pick.type === "movie" ? "movie" : "series"}. ${pick.reason}. View details`}>
                            <span className="picks-poster">
                              <MediaImage src={getPosterUrl(pick.item.poster_path, "medium")} alt="" className="size-full object-cover" width={342} height={513}
                                sizes="(max-width: 640px) 44vw, 150px" fallbackSrc="/fallbacks/poster.svg" loading="lazy" />
                              <span className="absolute left-2 top-2"><TypeChip type={pick.type} /></span>
                            </span>
                            <span className="picks-card-title">{pick.title}</span>
                            <span className="picks-card-reason">{pick.reason}</span>
                          </button>
                          <button type="button" className="picks-save" onClick={() => void toggleSave(pick)} aria-pressed={saved}
                            aria-label={saved ? `Remove ${pick.title} from watchlist` : `Save ${pick.title} for later`}>
                            {saved ? <BookmarkCheck className="size-4" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        <footer className="picks-footer">
          <Button variant="ghost" className="min-h-11 gap-2 rounded-full" onClick={() => setSeed((value) => value + 1)}>
            <RotateCw className="size-4" aria-hidden="true" />Shuffle picks
          </Button>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" className="min-h-11 rounded-full text-muted-foreground" onClick={() => { onSkipToday(); onOpenChange(false); }}>
              Skip for today
            </Button>
            <Button variant="outline" className="min-h-11 rounded-full" onClick={() => onOpenChange(false)}>Not now</Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
