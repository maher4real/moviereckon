import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import MediaImage from "@/frontend/components/MediaImage";
import { PREF_GENRES, useGenreArtwork } from "@/frontend/hooks/useGenreArtwork";
import { getBackdropUrl } from "@/shared/lib/tmdb";

/** Photo tiles that jump straight into the Movies grid filtered by genre. */
export default function GenreRail({ enabled }: { enabled: boolean }) {
  const { data: artwork } = useGenreArtwork({ enabled });

  return (
    <section className="content-shelf" aria-labelledby="genre-rail-heading">
      <div className="shelf-heading">
        <div className="flex min-w-0 items-center gap-2.5">
          <LayoutGrid className="hidden size-[18px] shrink-0 text-primary/80 sm:block" aria-hidden="true" />
          <h2 id="genre-rail-heading" className="min-w-0 text-lg font-semibold tracking-tight md:text-2xl">Browse by genre</h2>
        </div>
      </div>
      <ul className="genre-rail carousel-edge-mask scrollbar-hide">
        {PREF_GENRES.map((genre) => {
          const art = artwork?.[genre.id];
          return (
            <li key={genre.id} className="genre-rail-item">
              <Link to={`/movies?genre=${genre.id}`} className="pref-genre-tile genre-rail-tile">
                {art ? (
                  <MediaImage src={getBackdropUrl(art.backdrop, "medium")} alt="" className="pref-genre-art" width={780} height={439} sizes="240px" loading="lazy" fallbackSrc="/fallbacks/backdrop.svg" fadeIn />
                ) : (
                  <span className="pref-genre-art pref-genre-placeholder" aria-hidden="true" />
                )}
                <span className="pref-genre-scrim" aria-hidden="true" />
                <span className="pref-genre-name">{genre.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
