import { memo } from "react";
import { getProfileUrl, Cast } from "@/shared/lib/tmdb";
import MediaImage from "@/frontend/components/MediaImage";
import { ScrollArea, ScrollBar } from "@/frontend/components/ui/scroll-area";

interface CastListProps {
  cast: Cast[];
  title?: string;
}

function CastCard({ actor }: { actor: Cast }) {
  return (
    <article className="group w-full rounded-xl border border-border/70 bg-card/35 p-2.5 transition-all duration-300 hover:border-primary/40 hover:bg-card/60">
      <MediaImage
        src={getProfileUrl(actor.profile_path, "large")}
        alt={actor.name}
        className="w-full aspect-[3/4] rounded-lg object-cover object-[50%_18%] bg-muted/40 shadow-sm transition-transform duration-300 group-hover:scale-[1.02]"
        fallbackSrc="/fallbacks/profile.svg"
      />
      <p className="mt-2 text-xs font-semibold leading-tight line-clamp-2 break-words">
        {actor.name}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight mt-1 line-clamp-2 break-words">
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

      <ScrollArea className="w-full">
        <div className="grid grid-flow-col grid-rows-2 auto-cols-[130px] sm:auto-cols-[145px] lg:auto-cols-[160px] gap-3 pb-4 pr-2">
          {cast.map((actor, index) => (
            <CastCard key={`${actor.id}-${actor.character}-${index}`} actor={actor} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

export default memo(CastList);
