import { Check } from "lucide-react";
import MediaImage from "@/frontend/components/MediaImage";
import { PREF_GENRES, type GenreArtwork } from "@/frontend/hooks/useGenreArtwork";
import { getBackdropUrl } from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";
import { LANGUAGES } from "@/shared/lib/catalogue";

export const PREF_LANGUAGES = LANGUAGES;

export { PREF_GENRES, useGenreArtwork } from "@/frontend/hooks/useGenreArtwork";

export function LanguagePicker({ selected, onToggle }: { selected: string[]; onToggle: (code: string) => void }) {
  return (
    <div className="pref-language-grid" role="group" aria-label="Languages">
      {PREF_LANGUAGES.map(({ code, label, native }) => {
        const active = selected.includes(code);
        return (
          <button key={code} type="button" aria-pressed={active} onClick={() => onToggle(code)} className={cn("pref-language-tile", active && "pref-tile-active")}>
            <span className="pref-language-native" lang={code}>{native}</span>
            <span className="pref-language-label">{label}</span>
            <span className="pref-check" aria-hidden="true"><Check className="size-3.5" /></span>
          </button>
        );
      })}
    </div>
  );
}

export function GenrePicker({ selected, onToggle, artwork, loading }: {
  selected: number[];
  onToggle: (id: number) => void;
  artwork?: GenreArtwork;
  loading?: boolean;
}) {
  return (
    <div className="pref-genre-grid" role="group" aria-label="Genres">
      {PREF_GENRES.map(({ id, name }, index) => {
        const active = selected.includes(id);
        const art = artwork?.[id];
        return (
          <button key={id} type="button" aria-pressed={active} onClick={() => onToggle(id)} className={cn("pref-genre-tile", active && "pref-tile-active")}>
            {art ? (
              <MediaImage
                src={getBackdropUrl(art.backdrop, "medium")}
                alt=""
                className="pref-genre-art"
                width={780}
                height={439}
                sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
                loading={index < 8 ? "eager" : "lazy"}
                fallbackSrc="/fallbacks/backdrop.svg"
                fadeIn
              />
            ) : (
              <span className={cn("pref-genre-art pref-genre-placeholder", loading && "skeleton")} aria-hidden="true" />
            )}
            <span className="pref-genre-scrim" aria-hidden="true" />
            <span className="pref-genre-name">{name}</span>
            {art && <span className="pref-genre-credit">{art.title}</span>}
            <span className="pref-check" aria-hidden="true"><Check className="size-3.5" /></span>
          </button>
        );
      })}
    </div>
  );
}
