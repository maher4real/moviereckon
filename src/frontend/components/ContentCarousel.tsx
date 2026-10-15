import { type ElementType, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles, Star, Play } from "lucide-react";
import { Movie, TVShow, getPosterUrl, getLanguageBadgeClass } from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";
import MediaImage from "@/frontend/components/MediaImage";
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover";

interface ContentItem extends Movie, TVShow {
  _content_type?: "movie" | "tv";
}

interface ContentCarouselProps {
  title: string;
  icon?: ElementType;
  items: (Movie | TVShow | ContentItem)[] | undefined;
  isLoading: boolean;
  type: "movie" | "tv" | "mixed";
  viewAllHref?: string;
  showViewAllCard?: boolean;
  priorityImages?: boolean;
  recommendationExplanations?: Record<
    string,
    {
      reasons: Array<{ label: string; evidence?: string }>;
      seedTitle?: string | null;
    }
  >;
}

const INITIAL_VISIBLE_MOBILE = 10;
const INITIAL_VISIBLE_DESKTOP = 18;
const LOAD_STEP_MOBILE = 8;
const LOAD_STEP_DESKTOP = 12;
const PRIORITY_POSTER_COUNT = 6;
const POSTER_CARD_WIDTH_CLASS = "w-[42vw] max-w-[170px] sm:w-[160px] sm:max-w-none md:w-[180px] lg:w-[200px] xl:w-[210px]";
const POSTER_CARD_SIZES = "(max-width: 639px) 42vw, (max-width: 767px) 160px, (max-width: 1023px) 180px, (max-width: 1279px) 200px, 210px";

function getInitialVisibleCount(): number {
  if (typeof window === "undefined") return INITIAL_VISIBLE_DESKTOP;
  return window.innerWidth < 768 ? INITIAL_VISIBLE_MOBILE : INITIAL_VISIBLE_DESKTOP;
}

function getLoadStep(): number {
  if (typeof window === "undefined") return LOAD_STEP_DESKTOP;
  return window.innerWidth < 768 ? LOAD_STEP_MOBILE : LOAD_STEP_DESKTOP;
}

export default function ContentCarousel({
  title,
  icon: Icon,
  items,
  isLoading,
  type,
  viewAllHref,
  showViewAllCard = true,
  priorityImages = false,
  recommendationExplanations,
}: ContentCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [visibleCount, setVisibleCount] = useState(() => getInitialVisibleCount());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const fromPath = `${location.pathname}${location.search}${location.hash}`;
  const itemsLength = items?.length || 0;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  const handleItemClick = (item: Movie | TVShow | ContentItem) => {
    if ("_content_type" in item && item._content_type) {
      navigate(`/${item._content_type}/${item.id}`, {
        state: { from: fromPath },
      });
      return;
    }

    const isTV = "first_air_date" in item && item.first_air_date;
    const itemType = type === "mixed" ? (isTV ? "tv" : "movie") : type;
    navigate(`/${itemType}/${item.id}`, { state: { from: fromPath } });
  };

  const getTitle = (item: Movie | TVShow): string => {
    return "title" in item ? item.title : item.name;
  };

  const getYear = (item: Movie | TVShow): string => {
    const date =
      "release_date" in item ? item.release_date : item.first_air_date;
    return date?.split("-")[0] || "";
  };

  const getItemType = (item: Movie | TVShow | ContentItem): "movie" | "tv" => {
    if ("_content_type" in item && item._content_type) {
      return item._content_type;
    }
    return "title" in item ? "movie" : "tv";
  };

  const getDefaultViewAllHref = (): string => {
    if (type === "tv") return "/series";
    if (type === "movie") return "/movies";
    return "/reckon";
  };

  const resolvedViewAllHref = viewAllHref || getDefaultViewAllHref();
  const visibleItems = useMemo(
    () => items?.slice(0, Math.max(visibleCount, getInitialVisibleCount())) || [],
    [items, visibleCount],
  );
  const shouldRenderViewAllCard =
    !isLoading && visibleItems.length > 0 && showViewAllCard && !!resolvedViewAllHref;

  useEffect(() => {
    setVisibleCount(getInitialVisibleCount());
  }, [itemsLength, title, type]);

  useEffect(() => {
    if (!itemsLength || isLoading) return;

    const container = scrollRef.current;
    if (!container) return;

    let rafId = 0;
    const maybeLoadMore = () => {
      rafId = 0;
      setCanScrollLeft(container.scrollLeft > 4);
      setCanScrollRight(container.scrollWidth - container.clientWidth - container.scrollLeft > 4);
      if (visibleCount >= itemsLength) return;

      const remaining = container.scrollWidth - (container.scrollLeft + container.clientWidth);
      if (remaining <= container.clientWidth * 1.2) {
        setVisibleCount((current) => Math.min(itemsLength, current + getLoadStep()));
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(maybeLoadMore);
    };

    maybeLoadMore();
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isLoading, itemsLength, visibleCount]);

  if (!isLoading && (!items || items.length === 0)) {
    return null;
  }

  return (
    <section className="content-shelf" aria-label={title || "Recommended titles"}>
      <div className="shelf-heading">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <Icon className="hidden size-[18px] shrink-0 text-primary/80 sm:block" aria-hidden="true" />}
          {title && <h2 className="min-w-0 text-lg font-semibold tracking-tight md:text-2xl">{title}</h2>}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {resolvedViewAllHref && <button type="button" onClick={() => navigate(resolvedViewAllHref)} className="shelf-view-all">View All<ArrowRight className="size-4" aria-hidden="true" /></button>}
          {(canScrollLeft || canScrollRight) && <div className="hidden items-center gap-1.5 md:flex">
            <button type="button" onClick={() => scroll("left")} disabled={!canScrollLeft} className="shelf-arrow" aria-label={`Scroll ${title || "carousel"} left`}><ChevronLeft className="size-[18px]" /></button>
            <button type="button" onClick={() => scroll("right")} disabled={!canScrollRight} className="shelf-arrow" aria-label={`Scroll ${title || "carousel"} right`}><ChevronRight className="size-[18px]" /></button>
          </div>}
        </div>
      </div>
      <div className="relative group">
        <div
          ref={scrollRef}
          className="carousel-edge-mask flex items-start gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-1 pt-2 pb-3 sm:gap-4 md:pb-4"
        >
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={cn("shrink-0 snap-start", POSTER_CARD_WIDTH_CLASS)}
              >
                <div className="aspect-2/3 rounded-lg bg-muted animate-pulse" />
                <div className="mt-2 h-4 bg-muted rounded animate-pulse w-3/4" />
                <div className="mt-1 h-3 bg-muted rounded animate-pulse w-1/2" />
              </div>
            ))
          ) : (
            <>
              {visibleItems.map((item, index) => {
                const itemType = getItemType(item);
                const explanation = recommendationExplanations?.[`${itemType}_${item.id}`];
                // Only the first visible shelf opts into eager loading. Other
                // shelves stay lazy so the home page does not request every
                // poster before the user reaches it.
                const isPriorityPoster = priorityImages && index < PRIORITY_POSTER_COUNT;

                return (
                  <motion.div
                    key={`${itemType}-${item.id}`}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 360, damping: 30 }}
                    className={cn(
                      "shrink-0 snap-start cursor-pointer group/card relative text-left bg-transparent border-0 p-0",
                      POSTER_CARD_WIDTH_CLASS,
                    )}
                  >
                    <button type="button" onClick={() => handleItemClick(item)} aria-label={`View ${getTitle(item)}`} className="block w-full rounded-lg text-left">
                    <div className="relative aspect-2/3 rounded-lg overflow-hidden poster-card">
                      <MediaImage
                        src={getPosterUrl(item.poster_path, "medium")}
                        alt={getTitle(item)}
                        className="w-full h-full object-cover"
                        sizes={POSTER_CARD_SIZES}
                        loading={isPriorityPoster ? "eager" : "lazy"}
                        fetchPriority={isPriorityPoster ? "high" : "auto"}
                        priority={isPriorityPoster}
                        fallbackSrc="/fallbacks/poster.svg"
                      />

                      <div className="absolute inset-0 bg-background/60 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
                        <motion.div
                          className="poster-play-button"
                          initial={false}
                          whileHover={{ scale: 1.08 }}
                          transition={{ type: "spring", stiffness: 420, damping: 24 }}
                        >
                          <Play className="h-5 w-5 fill-current" />
                        </motion.div>
                      </div>

                      {item.vote_average > 0 && (
                        <div className="rating-badge absolute top-2 right-2">
                          <Star className="h-3 w-3 fill-current" />
                          {item.vote_average.toFixed(1)}
                        </div>
                      )}

                      <div
                        className={cn(
                          "language-badge absolute top-2 left-2",
                          getLanguageBadgeClass(item.original_language),
                        )}
                      >
                        {item.original_language.toUpperCase()}
                      </div>
                    </div>

                    <h3 className="mt-3 break-words text-sm font-semibold leading-snug line-clamp-2 group-hover/card:text-foreground/80 transition-colors">
                      {getTitle(item)}
                    </h3>
                    </button>
                    <div className="flex min-h-9 items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{getYear(item)}</p>
                      {explanation?.reasons?.length ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Why ${getTitle(item)} is recommended`}
                            >
                              <Sparkles className="h-3 w-3" />
                              <span className="hidden sm:inline">Why This</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            sideOffset={8}
                            className="w-72 overflow-hidden border border-primary/30 p-0"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="border-b border-border/60 bg-muted/40 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Why This Pick
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {explanation.seedTitle
                                  ? `Because you liked ${explanation.seedTitle}`
                                  : "Because this matches your taste profile"}
                              </p>
                            </div>
                            <div className="space-y-2 px-3 py-3">
                              {explanation.reasons.slice(0, 3).map((reason, index) => (
                                <div
                                  key={`${reason.label}-${index}`}
                                  className="rounded-lg border border-border/60 bg-background/80 px-2.5 py-2"
                                >
                                  <p className="text-xs font-medium text-foreground">
                                    {reason.label}
                                  </p>
                                  {reason.evidence ? (
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {reason.evidence}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}

              {shouldRenderViewAllCard && (
                <motion.button
                  type="button"
                  onClick={() => navigate(resolvedViewAllHref)}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 360, damping: 30 }}
                  className={cn(
                    "shrink-0 snap-start cursor-pointer group/viewall bg-transparent border-0 p-0 text-left",
                    POSTER_CARD_WIDTH_CLASS,
                  )}
                >
                  <div className="relative aspect-2/3 rounded-lg overflow-hidden border border-border bg-linear-to-br from-card to-muted/40 transition-all duration-300 group-hover/viewall:border-primary/40 group-hover/viewall:shadow-[0_10px_30px_rgba(0,0,0,0.35)] flex items-center justify-center">
                    <div className="flex flex-col items-center justify-center gap-3 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center group-hover/viewall:bg-primary group-hover/viewall:text-primary-foreground transition-all duration-300">
                        <ArrowRight className="w-6 h-6" />
                      </div>
                      <p className="text-base md:text-lg font-semibold text-foreground">
                        View All
                      </p>
                    </div>
                  </div>

                  <h3 className="mt-2 font-medium text-sm line-clamp-1 text-primary group-hover/viewall:text-primary/80 transition-colors">
                    Explore More
                  </h3>
                  {title && (
                    <p className="text-xs text-muted-foreground">{title}</p>
                  )}
                </motion.button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
