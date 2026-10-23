import { useLocation, useNavigate } from "react-router-dom";
import { getPosterUrl, type Movie, type TVShow } from "@/shared/lib/tmdb";
import MediaImage from "@/frontend/components/MediaImage";
import { Skeleton } from "@/frontend/components/ui/skeleton";

type Item = Movie | TVShow;

function itemType(item: Item): "movie" | "tv" {
  return "title" in item ? "movie" : "tv";
}

function itemTitle(item: Item): string {
  return "title" in item ? item.title : item.name;
}

/** Netflix-style ranked row: oversized outline numerals behind each poster. */
export default function Top10Row({ title, items, isLoading }: { title: string; items: Item[]; isLoading: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (!isLoading && items.length === 0) return null;

  return (
    <section className="content-shelf" aria-label={title}>
      <div className="shelf-heading">
        <h2 className="min-w-0 text-lg font-semibold tracking-tight md:text-2xl">{title}</h2>
      </div>
      <ol className="carousel-edge-mask flex items-end gap-1 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-1 pt-2 pb-3 md:pb-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <li key={index} aria-hidden="true" className="top10-item shrink-0 snap-start">
                <span className="top10-rank">{index + 1}</span>
                <Skeleton className="top10-poster aspect-2/3 rounded-md" />
              </li>
            ))
          : items.slice(0, 10).map((item, index) => (
              <li key={`${itemType(item)}-${item.id}`} className="top10-item shrink-0 snap-start">
                <span className="top10-rank" aria-hidden="true">{index + 1}</span>
                <button
                  type="button"
                  onClick={() => navigate(`/${itemType(item)}/${item.id}`, { state: { from: `${location.pathname}${location.search}` } })}
                  aria-label={`Number ${index + 1}: ${itemTitle(item)}`}
                  className="top10-poster poster-card relative block aspect-2/3 overflow-hidden rounded-md transition-transform duration-200 hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transition-none"
                >
                  <MediaImage
                    src={getPosterUrl(item.poster_path, "medium")}
                    alt=""
                    className="h-full w-full object-cover"
                    sizes="(max-width: 639px) 30vw, 150px"
                    fallbackSrc="/fallbacks/poster.svg"
                  />
                  {itemType(item) === "tv" && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Series</span>
                  )}
                </button>
              </li>
            ))}
      </ol>
    </section>
  );
}
