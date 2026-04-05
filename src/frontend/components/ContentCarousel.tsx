import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles } from "lucide-react";
import { Movie, TVShow, getPosterUrl, getLanguageBadgeClass } from "@/shared/lib/tmdb";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/shared/lib/utils";
import MediaImage from "@/frontend/components/MediaImage";
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover";

interface ContentItem extends Movie, TVShow {
  _content_type?: "movie" | "tv";
}

interface ContentCarouselProps {
  title: string;
  items: (Movie | TVShow | ContentItem)[] | undefined;
  isLoading: boolean;
  type: "movie" | "tv" | "mixed";
  viewAllHref?: string;
  showViewAllCard?: boolean;
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
  items,
  isLoading,
  type,
  viewAllHref,
  showViewAllCard = true,
  recommendationExplanations,
}: ContentCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [visibleCount, setVisibleCount] = useState(() => getInitialVisibleCount());
  const fromPath = `${location.pathname}${location.search}${location.hash}`;
  const itemsLength = items?.length || 0;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
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
    <section className="px-4 md:px-6 lg:px-8">
      {title && (
        <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-3 md:mb-4">
          {title}
        </h2>
      )}

      <div className="relative group">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll("left")}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/70 hover:bg-primary/20 hover:text-primary text-foreground/90 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll("right")}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/70 hover:bg-primary/20 hover:text-primary text-foreground/90 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
        >
          <ChevronRight className="w-6 h-6" />
        </Button>

        <div
          ref={scrollRef}
          className="flex gap-2 md:gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory px-2 md:px-4 pt-2 md:pt-3 pb-2 md:pb-4"
        >
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 snap-start w-[128px] sm:w-[140px] md:w-[180px] lg:w-[200px]"
              >
                <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                <div className="mt-2 h-4 bg-muted rounded animate-pulse w-3/4" />
                <div className="mt-1 h-3 bg-muted rounded animate-pulse w-1/2" />
              </div>
            ))
          ) : (
            <>
              {visibleItems.map((item) => {
                const itemType = getItemType(item);
                const explanation = recommendationExplanations?.[`${itemType}_${item.id}`];

                return (
                  <button
                    key={`${itemType}-${item.id}`}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="flex-shrink-0 snap-start w-[128px] sm:w-[140px] md:w-[180px] lg:w-[200px] cursor-pointer group/card relative text-left bg-transparent border-0 p-0"
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden transform-gpu transition-[transform,box-shadow] duration-300 group-hover/card:-translate-y-1.5 group-hover/card:shadow-[0_12px_36px_rgba(0,0,0,0.48)]">
                      <MediaImage
                        src={getPosterUrl(item.poster_path, "medium")}
                        alt={getTitle(item)}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        fallbackSrc="/fallbacks/poster.svg"
                      />

                      <div className="absolute inset-0 bg-background/60 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center glow-primary">
                          <span className="text-xl">▶</span>
                        </div>
                      </div>

                      {item.vote_average > 0 && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs font-semibold">
                          ⭐ {item.vote_average.toFixed(1)}
                        </div>
                      )}

                      <div
                        className={cn(
                          "absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold",
                          getLanguageBadgeClass(item.original_language),
                        )}
                      >
                        {item.original_language.toUpperCase()}
                      </div>
                    </div>

                    <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover/card:text-primary transition-colors">
                      {getTitle(item)}
                    </h3>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{getYear(item)}</p>
                      {explanation?.reasons?.length ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Sparkles className="h-3 w-3" />
                              Why This
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
                  </button>
                );
              })}

              {shouldRenderViewAllCard && (
                <div
                  onClick={() => navigate(resolvedViewAllHref)}
                  className="flex-shrink-0 snap-start w-[128px] sm:w-[140px] md:w-[180px] lg:w-[200px] cursor-pointer group/viewall"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-border bg-linear-to-br from-card to-muted/40 transition-all duration-300 group-hover/viewall:border-primary/40 group-hover/viewall:shadow-[0_10px_30px_rgba(0,0,0,0.35)] flex items-center justify-center">
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
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
