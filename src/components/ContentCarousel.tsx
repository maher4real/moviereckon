import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Movie, TVShow, getPosterUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MediaImage from "@/components/MediaImage";

// Extended type for items with preserved content_type (from watch history)
interface ContentItem extends Movie, TVShow {
  _content_type?: "movie" | "tv";
}

interface ContentCarouselProps {
  title: string;
  items: (Movie | TVShow | ContentItem)[] | undefined;
  isLoading: boolean;
  type: "movie" | "tv" | "mixed";
}

export default function ContentCarousel({
  title,
  items,
  isLoading,
  type,
}: ContentCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleItemClick = (item: Movie | TVShow | ContentItem) => {
    // Check for preserved content_type first (from watch history)
    if ("_content_type" in item && item._content_type) {
      navigate(`/${item._content_type}/${item.id}`);
      return;
    }
    // Fall back to checking for TV show properties
    const isTV = "first_air_date" in item && item.first_air_date;
    const itemType = type === "mixed" ? (isTV ? "tv" : "movie") : type;
    navigate(`/${itemType}/${item.id}`);
  };

  const getTitle = (item: Movie | TVShow): string => {
    return "title" in item ? item.title : item.name;
  };

  const getYear = (item: Movie | TVShow): string => {
    const date =
      "release_date" in item ? item.release_date : item.first_air_date;
    return date?.split("-")[0] || "";
  };

  if (!isLoading && (!items || items.length === 0)) {
    return null;
  }

  return (
    <section className="px-0">
      {/* Title */}
      {title && (
        <h2 className="px-4 md:px-8 text-xl md:text-2xl font-bold tracking-tight mb-4">
          {title}
        </h2>
      )}

      {/* Carousel Container */}
      <div className="relative group">
        {/* Scroll Buttons */}
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

        {/* Scrollable Content */}
        <div
          ref={scrollRef}
          className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory pb-3 md:pb-4"
        >
          {isLoading
            ? // Loading Skeletons
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 snap-start w-[140px] md:w-[180px] lg:w-[200px]"
                >
                  <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                  <div className="mt-2 h-4 bg-muted rounded animate-pulse w-3/4" />
                  <div className="mt-1 h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
              ))
            : // Actual Items
              items?.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="flex-shrink-0 snap-start w-[140px] md:w-[180px] lg:w-[200px] cursor-pointer group/card"
                >
                  {/* Poster */}
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden poster-card">
                    <MediaImage
                      src={getPosterUrl(item.poster_path, "medium")}
                      alt={getTitle(item)}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      fallbackSrc="/fallbacks/poster.svg"
                    />

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center glow-primary">
                        <span className="text-xl">▶</span>
                      </div>
                    </div>

                    {/* Rating Badge */}
                    {item.vote_average > 0 && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs font-semibold">
                        ⭐ {item.vote_average.toFixed(1)}
                      </div>
                    )}

                    {/* Language Badge */}
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

                  {/* Info */}
                  <h3 className="mt-2 font-medium text-sm line-clamp-1 group-hover/card:text-primary transition-colors">
                    {getTitle(item)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {getYear(item)}
                  </p>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
