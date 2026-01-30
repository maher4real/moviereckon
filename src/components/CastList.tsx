import { memo } from "react";
import { getProfileUrl, Cast } from "@/lib/tmdb";

interface CastListProps {
  cast: Cast[];
}

function CastList({ cast }: CastListProps) {
  if (cast.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4">Top Cast</h2>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {cast.map((actor) => (
          <div key={actor.id} className="flex-shrink-0 text-center group">
            <img
              src={getProfileUrl(actor.profile_path, "medium")}
              alt={actor.name}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover mx-auto mb-2 border-2 border-transparent group-hover:border-primary transition-colors"
            />
            <p 
              className="text-sm font-medium w-20 sm:w-24 text-center break-words leading-tight"
              style={{ 
                fontSize: actor.name.length > 15 ? '0.75rem' : '0.875rem',
                lineHeight: '1.2'
              }}
            >
              {actor.name}
            </p>
            <p 
              className="text-xs text-muted-foreground w-20 sm:w-24 text-center break-words leading-tight mt-1"
              style={{ 
                fontSize: actor.character.length > 18 ? '0.625rem' : '0.75rem' 
              }}
            >
              {actor.character}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(CastList);
