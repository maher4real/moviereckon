import { memo } from "react";
import { getProfileUrl, Cast } from "@/lib/tmdb";
import MediaImage from "@/components/MediaImage";

interface CastListProps {
  cast: Cast[];
}

function CastList({ cast }: CastListProps) {
  if (cast.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4">Top Cast</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {cast.map((actor) => (
          <div key={actor.id} className="text-center group min-w-0">
            <MediaImage
              src={getProfileUrl(actor.profile_path, "medium")}
              alt={actor.name}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover object-top mx-auto mb-2 border-2 border-transparent group-hover:border-primary transition-colors"
              fallbackSrc="/fallbacks/profile.svg"
            />
            <p className="text-xs sm:text-sm font-medium text-center leading-tight line-clamp-2 break-words">
              {actor.name}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground text-center leading-tight mt-1 line-clamp-2 break-words">
              {actor.character}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(CastList);
