import { forwardRef, memo, useRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";
import { Play, RotateCcw, SlidersHorizontal, Star, X } from "lucide-react";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover";
import { useMediaQuery } from "@/frontend/hooks/useMediaQuery";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/frontend/components/ui/sheet";
import { getBackdropUrl, getLanguageBadgeClass, getPosterUrl } from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

type BrowseHeaderProps = {
  kicker: string;
  title: string;
  description: string;
  icon: ElementType;
  /** Backdrop of the first result; the band falls back to a plain gradient. */
  backdropPath?: string | null;
  resultLabel?: string | null;
};

export function BrowseHeader({ kicker, title, description, icon: Icon, backdropPath, resultLabel }: BrowseHeaderProps) {
  return (
    <header className="browse-hero">
      {backdropPath && (
        <MediaImage
          key={backdropPath}
          src={getBackdropUrl(backdropPath, "large")}
          alt=""
          aria-hidden="true"
          className="browse-hero-art"
          width={1280}
          height={720}
          sizes="100vw"
          fadeIn
          priority
        />
      )}
      <div className="browse-hero-scrim" aria-hidden="true" />
      <div className="browse-hero-content container mx-auto px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="page-heading-icon"><Icon className="size-5" /></div>
          <div className="min-w-0">
            <p className="page-kicker">{kicker}</p>
            <h1 className="page-title">{title}</h1>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">{description}</p>
        {resultLabel && <p className="browse-result-pill mt-4">{resultLabel}</p>}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export type BrowseCategory<T extends string> = { value: T; label: string; Icon: ElementType };
export type BrowseSelect = {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
};
export type ActiveFilter = { key: string; label: string; onClear: () => void };

type BrowseFiltersProps<T extends string> = {
  categories: BrowseCategory<T>[];
  activeCategory: T;
  onCategory: (value: T) => void;
  genres?: { id: number; name: string }[];
  selectedGenre: string;
  onGenre: (value: string) => void;
  genreDisabled?: boolean;
  selects: BrowseSelect[];
  activeFilters: ActiveFilter[];
  onReset: () => void;
  note?: ReactNode;
};

function SelectField({ config, className }: { config: BrowseSelect; className?: string }) {
  return (
    <label className={cn("browse-select-field", className)}>
      <span className="browse-select-label">{config.label}</span>
      <Select value={config.value} onValueChange={config.onChange} disabled={config.disabled}>
        <SelectTrigger aria-label={config.label} className="select-surface w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-50 max-h-[320px] border-border bg-popover">
          {config.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function FilterPanel({ selects, activeCount, onReset, note }: { selects: BrowseSelect[]; activeCount: number; onReset: () => void; note?: ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="browse-panel-grid">
        {selects.map((config) => <SelectField key={config.id} config={config} />)}
      </div>
      {note && <p className="text-xs leading-5 text-muted-foreground">{note}</p>}
      {activeCount > 0 && (
        <Button variant="ghost" onClick={onReset} className="w-full gap-2 text-muted-foreground">
          <RotateCcw className="size-4" aria-hidden="true" />Reset filters
        </Button>
      )}
    </div>
  );
}

// Radix triggers (`asChild`) pass onClick, aria and a ref to their child, so it must forward them.
const FilterToggle = forwardRef<HTMLButtonElement, { activeCount: number } & ComponentPropsWithoutRef<typeof Button>>(
  function FilterToggle({ activeCount, ...props }, ref) {
    return (
      <Button ref={ref} variant="outline" className="browse-filter-toggle" aria-label={`Open filters${activeCount ? `, ${activeCount} active` : ""}`} {...props}>
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Filters
        {activeCount > 0 && <span className="browse-filter-count">{activeCount}</span>}
      </Button>
    );
  },
);

export function BrowseFilters<T extends string>({
  categories, activeCategory, onCategory, genres, selectedGenre, onGenre, genreDisabled,
  selects, activeFilters, onReset, note,
}: BrowseFiltersProps<T>) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const panelRef = useRef<HTMLDivElement>(null);
  const hasGenreChips = Boolean(genres && genres.length > 0);
  // The genre chips below already cover genre, so the dropdown would be a duplicate.
  const panelSelects = hasGenreChips ? selects.filter((config) => config.id !== "genre") : selects;
  const panel = <FilterPanel selects={panelSelects} activeCount={activeFilters.length} onReset={onReset} note={note} />;

  return (
    <section className="browse-filters" aria-label="Filters">
      <div className="browse-filters-bar">
        <div className="filter-row min-w-0 flex-1" role="tablist" aria-label="Category">
          {categories.map(({ value, label, Icon }) => {
            const active = value === activeCategory;
            return (
              <button key={value} type="button" role="tab" aria-selected={active} onClick={() => onCategory(value)}
                className={cn("filter-chip inline-flex items-center gap-2", active && "filter-chip-active")}>
                <Icon className="size-4" aria-hidden="true" />{label}
              </button>
            );
          })}
        </div>

        {panelSelects.length > 0 && (isDesktop ? (
          <Popover>
            <PopoverTrigger asChild><FilterToggle activeCount={activeFilters.length} /></PopoverTrigger>
            <PopoverContent
              ref={panelRef}
              align="end"
              sideOffset={8}
              className="browse-panel w-[min(44rem,calc(100vw-2rem))] p-4 outline-none focus:outline-none focus-visible:outline-none"
              // Focus the panel, not the first dropdown: that drew a heavy ring on open. Tab still reaches every control.
              onOpenAutoFocus={(event) => { event.preventDefault(); panelRef.current?.focus(); }}
            >
              <p className="mb-3 text-sm font-semibold">Filters</p>
              {panel}
            </PopoverContent>
          </Popover>
        ) : (
          <Sheet>
            <SheetTrigger asChild><FilterToggle activeCount={activeFilters.length} /></SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border-white/10 bg-card pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
              <SheetHeader className="text-left">
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Refine what shows up in the grid.</SheetDescription>
              </SheetHeader>
              <div className="mt-5">{panel}</div>
            </SheetContent>
          </Sheet>
        ))}
      </div>

      {hasGenreChips && genres && (
        <div className={cn("filter-row browse-genre-row carousel-edge-mask", genreDisabled && "pointer-events-none opacity-45")} aria-label="Genre" aria-disabled={genreDisabled || undefined}>
          <button type="button" onClick={() => onGenre("")} disabled={genreDisabled}
            className={cn("browse-genre-chip", !selectedGenre && "browse-genre-chip-active")}>All genres</button>
          {genres.map((genre) => {
            const active = selectedGenre === String(genre.id);
            return (
              <button key={genre.id} type="button" onClick={() => onGenre(active ? "" : String(genre.id))} disabled={genreDisabled}
                aria-pressed={active} className={cn("browse-genre-chip", active && "browse-genre-chip-active")}>{genre.name}</button>
            );
          })}
        </div>
      )}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <button key={filter.key} type="button" onClick={filter.onClear} className="browse-active-pill" aria-label={`Remove filter ${filter.label}`}>
              {filter.label}<X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
          {activeFilters.length > 1 && (
            <button type="button" onClick={onReset} className="text-xs font-semibold text-primary hover:underline">Clear all</button>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Poster card                                                         */
/* ------------------------------------------------------------------ */

type BrowsePosterCardProps = {
  title: string;
  posterPath: string | null;
  rating: number;
  language: string;
  year?: string;
  tag?: string;
  priority?: boolean;
  onClick: () => void;
};

export const BrowsePosterCard = memo(function BrowsePosterCard({ title, posterPath, rating, language, year, tag, priority = false, onClick }: BrowsePosterCardProps) {
  return (
    <button type="button" onClick={onClick} className="browse-card group text-left" aria-label={`View ${title}`}>
      <div className="poster-card relative aspect-2/3 overflow-hidden rounded-xl">
        <MediaImage
          src={getPosterUrl(posterPath, "medium")}
          alt={title}
          className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          sizes="(max-width: 539px) 46vw, (max-width: 767px) 31vw, (max-width: 1023px) 23vw, (max-width: 1279px) 18vw, 15vw"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          priority={priority}
          fallbackSrc="/fallbacks/poster.svg"
        />
        <div className="poster-hover-scrim absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="poster-play-button"><Play className="size-5 fill-current" /></span>
        </div>
        {rating > 0 && (
          <span className="rating-badge absolute right-2 top-2"><Star className="size-3 fill-current" />{rating.toFixed(1)}</span>
        )}
        <span className={cn("language-badge absolute left-2 top-2", getLanguageBadgeClass(language))}>{language.toUpperCase()}</span>
        {tag && <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm">{tag}</span>}
      </div>
      <h3 className="mt-2.5 line-clamp-2 break-words text-sm font-semibold leading-snug transition-colors group-hover:text-primary">{title}</h3>
      {year && <p className="mt-0.5 text-xs text-muted-foreground">{year}</p>}
    </button>
  );
});
