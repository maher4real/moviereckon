import type { ComponentProps, ElementType, ReactNode } from "react";
import { Bookmark, CircleAlert, MonitorPlay, Sparkles } from "lucide-react";
import MediaImage from "@/frontend/components/MediaImage";
import PosterShowcase, { type ShowcaseSlide } from "@/frontend/components/PosterShowcase";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";

const FIELD_INPUT =
  "h-12 rounded-xl border-border/50 bg-background/60 pl-10 text-sm transition-colors duration-150 focus-visible:border-primary/50 focus-visible:ring-primary/20";

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-destructive">
      <CircleAlert className="h-3 w-3 shrink-0" />
      {children}
    </p>
  );
}

type AuthFieldProps = Omit<ComponentProps<typeof Input>, "id"> & {
  id: string;
  label: string;
  icon: ElementType;
  error?: string;
  /** Neutral helper line shown when there is no error (e.g. "Checking email..."). */
  hint?: string | null;
  /** Control rendered inside the field on the right, such as a show-password toggle. */
  trailing?: ReactNode;
  /** Extra content under the field (e.g. a "Forgot password?" link). */
  footer?: ReactNode;
};

/** Labelled input with a leading icon, optional trailing control and inline error. */
export function AuthField({ id, label, icon: Icon, error, hint, trailing, footer, className, ...inputProps }: AuthFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-semibold tracking-wide text-foreground/75">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} className={[FIELD_INPUT, trailing ? "pr-10" : "pr-3", className].filter(Boolean).join(" ")} {...inputProps} />
        {trailing}
      </div>
      {error ? <FieldError>{error}</FieldError> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {footer}
    </div>
  );
}

const GOOGLE_PATHS = [
  ["#FFC107", "M43.61 20.08H42V20H24v8h11.3A12 12 0 0 1 12 24 12 12 0 0 1 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66A19.92 19.92 0 0 0 24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92"],
  ["#FF3D00", "M6.31 14.69 12.88 19.5A11.96 11.96 0 0 1 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66A19.92 19.92 0 0 0 24 4 19.99 19.99 0 0 0 6.31 14.69"],
  ["#4CAF50", "M24 44c5.2 0 9.93-1.99 13.49-5.23l-6.23-5.27A11.95 11.95 0 0 1 24 36a12 12 0 0 1-11.28-7.8l-6.52 5.02A20 20 0 0 0 24 44"],
  ["#1976D2", "M43.61 20.08H42V20H24v8h11.3a12.03 12.03 0 0 1-4.04 5.5l6.23 5.27C36.99 39.03 44 34 44 24c0-1.34-.14-2.65-.39-3.92"],
] as const;

/** Fallback "Sign in with Google" button shown until Google's own button is ready. */
export function GoogleFallbackButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 w-full cursor-pointer rounded-xl border-border/30 bg-white text-sm font-semibold text-slate-900 shadow-sm transition-colors duration-150 hover:bg-white/95"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="inline-flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
          {GOOGLE_PATHS.map(([fill, d]) => <path key={fill} fill={fill} d={d} />)}
        </svg>
        {busy ? "Redirecting..." : "Sign in with Google"}
      </span>
    </Button>
  );
}

/** Blurred backdrop that follows the featured title in the showcase. */
export function AuthAmbientBackdrop({ art }: { art?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {art && (
        <MediaImage
          key={art}
          src={art}
          alt=""
          className="auth-ambient-art"
          width={1280}
          height={720}
          sizes="100vw"
          fallbackSrc="/fallbacks/backdrop.svg"
          fadeIn
          priority
        />
      )}
      <div className="auth-ambient-scrim" />
    </div>
  );
}

const PERKS = [
  { icon: Sparkles, label: "A feed tuned to your taste" },
  { icon: Bookmark, label: "Watchlist with progress" },
  { icon: MonitorPlay, label: "Where to watch, by region" },
];

/** Desktop-only carousel column beside the form. */
export function AuthShowcasePanel({ slides, onActiveChange }: {
  slides: ShowcaseSlide[];
  onActiveChange: (slide: ShowcaseSlide) => void;
}) {
  return (
    <aside className="hidden min-w-0 flex-col items-center gap-8 lg:flex" aria-label="Trending now">
      <div className="max-w-lg text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary">Trending this week</p>
        <h2 className="mt-3 text-balance text-4xl font-black leading-[0.95] tracking-[-0.05em] xl:text-5xl">
          Your next favourite is already here.
        </h2>
      </div>
      <PosterShowcase slides={slides} label="Trending movies and series" className="auth-showcase" onActiveChange={onActiveChange} />
      <ul className="grid w-full max-w-xl grid-cols-3 gap-3" aria-label="What you get">
        {PERKS.map((item) => (
          <li key={item.label} className="auth-perk">
            <item.icon className="size-4 text-primary" aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Phone-sized trending row under the form. */
export function AuthTrendingRail({ slides }: { slides: ShowcaseSlide[] }) {
  return (
    <section className="mt-8 lg:hidden" aria-label="Trending this week">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Trending this week</p>
      <ul className="auth-trending-rail">
        {slides.slice(0, 8).map((slide) => (
          <li key={slide.id} className="auth-trending-item">
            <MediaImage src={slide.src} alt="" className="size-full object-cover" width={185} height={278} sizes="96px" fallbackSrc="/fallbacks/poster.svg" loading="lazy" />
            <span className="sr-only">{slide.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
