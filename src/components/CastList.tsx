import { memo } from "react";
import { getProfileUrl, Cast } from "@/lib/tmdb";
import MediaImage from "@/components/MediaImage";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface CastListProps {
  cast: Cast[];
  title?: string;
}

interface CastCardProps {
  actor: Cast;
  compact?: boolean;
}

function CastCard({ actor, compact = false }: CastCardProps) {
  return (
    <article
      className={cn(
        "group min-w-0",
        compact
          ? "w-28 shrink-0"
          : "rounded-xl border border-border/70 bg-card/35 p-3 transition-all duration-300 hover:border-primary/40 hover:bg-card/60"
      )}
    >
      <MediaImage
        src={getProfileUrl(actor.profile_path, "large")}
        alt={actor.name}
        className={cn(
          "w-full aspect-[3/4] rounded-lg object-cover object-[50%_18%] bg-muted/40",
          compact
            ? "shadow-md"
            : "shadow-sm transition-transform duration-300 group-hover:scale-[1.02]"
        )}
        fallbackSrc="/fallbacks/profile.svg"
      />
      <p className="mt-2 text-xs sm:text-sm font-semibold leading-tight line-clamp-2 break-words">
        {actor.name}
      </p>
      <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight mt-1 line-clamp-2 break-words">
        {actor.character}
      </p>
    </article>
  );
}

function CastList({ cast, title = "Top Cast" }: CastListProps) {
  if (cast.length === 0) return null;

  return (
    <div className="mb-10">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>

      <div className="sm:hidden">
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-4 pr-2">
            {cast.map((actor, index) => (
              <CastCard key={`${actor.id}-${actor.character}-${index}`} actor={actor} compact />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {cast.map((actor, index) => (
          <CastCard key={`${actor.id}-${actor.character}-${index}`} actor={actor} />
        ))}
      </div>
    </div>
  );
}

export default memo(CastList);
