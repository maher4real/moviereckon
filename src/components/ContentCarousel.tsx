import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { Movie, TVShow, getPosterUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MediaImage from "@/components/MediaImage";

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
}

export default function ContentCarousel({
  title,
  items,
  isLoading,
  type,
  viewAllHref,
  showViewAllCard = true,
}: ContentCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = `${location.pathname}${location.search}${location.hash}`;

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

  const getDefaultViewAllHref = (): string => {
    const normalized = title.toLowerCase();

    if (normalized.includes("now playing"))
      return "/movies?category=now_playing";
    if (normalized.includes("coming soon") || normalized.includes("upcoming")) {
      return "/movies?category=upcoming";
    }
    if (normalized.includes("continue watching")) return "/profile";
    if (normalized.includes("bollywood")) return "/movies?category=bollywood";
    if (normalized.includes("hollywood")) return "/movies?category=hollywood";
    if (normalized.includes("tamil")) return "/movies?category=tamil";
    if (normalized.includes("telugu")) return "/movies?category=telugu";
    if (normalized.includes("gujarati")) return "/browse?type=gujarati";
    if (normalized.includes("trending tv")) return "/series?category=popular";
    if (normalized.includes("top rated"))
      return "/movies?sort=vote_average.desc";
    if (normalized.includes("trending")) return "/movies?category=trending";
    if (normalized.includes("similar"))
      return type === "tv" ? "/series" : "/movies";
    if (type === "movie") return "/movies";
    if (type === "tv") return "/series";
    return "/reckon";
  };

  const resolvedViewAllHref = viewAllHref || getDefaultViewAllHref();
  const shouldRenderViewAllCard =
    !isLoading && showViewAllCard && !!items?.length && !!resolvedViewAllHref;

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
          className="flex gap-2 md:gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory px-2 md:px-4 pb-2 md:pb-4"
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
              {items?.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="flex-shrink-0 snap-start w-[128px] sm:w-[140px] md:w-[180px] lg:w-[200px] cursor-pointer group/card"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
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
                        item.original_language === "hi"
                          ? "badge-hindi"
                          : item.original_language === "en"
                            ? "badge-english"
                            : "bg-muted",
                      )}
                    >
                      {item.original_language === "hi"
                        ? "HI"
                        : item.original_language.toUpperCase()}
                    </div>
                  </div>

                  <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover/card:text-primary transition-colors">
                    {getTitle(item)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {getYear(item)}
                  </p>
                </div>
              ))}

              {shouldRenderViewAllCard && (
                <div
                  onClick={() => navigate(resolvedViewAllHref)}
                  className="flex-shrink-0 snap-start w-[128px] sm:w-[140px] md:w-[180px] lg:w-[200px] cursor-pointer group/viewall"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-border bg-gradient-to-br from-card to-muted/40 transition-all duration-300 group-hover/viewall:border-primary/40 group-hover/viewall:shadow-[0_10px_30px_rgba(0,0,0,0.35)] flex items-center justify-center">
                    <div className="flex flex-col items-center justify-center gap-3 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center group-hover/viewall:bg-primary group-hover/viewall:text-primary-foreground transition-colors">
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
