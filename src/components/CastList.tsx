import { memo } from "react";
import { getProfileUrl, Cast } from "@/lib/tmdb";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import MediaImage from "@/components/MediaImage";

interface CastListProps {
  cast: Cast[];
}

function CastList({ cast }: CastListProps) {
  if (cast.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4">Top Cast</h2>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4">
        {cast.map((actor) => (
          <div key={actor.id} className="flex-shrink-0 text-center group w-24">
            <MediaImage
              src={getProfileUrl(actor.profile_path, "medium")}
              alt={actor.name}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover object-top mx-auto mb-2 border-2 border-transparent group-hover:border-primary transition-colors"
              fallbackSrc="/fallbacks/profile.svg"
            />
            <p className="text-xs sm:text-sm font-medium text-center whitespace-normal leading-tight line-clamp-2">
              {actor.name}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground text-center whitespace-normal leading-tight mt-1 line-clamp-2">
              {actor.character}
            </p>
          </div>
        ))}
      </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

export default memo(CastList);
