"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Compass,
  Film,
  ListVideo,
  MessageCircle,
  MonitorPlay,
  Play,
  Search,
  Sparkles,
  Tv,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";

import BrandLogo from "@/frontend/components/BrandLogo";
import PosterShowcase, { type ShowcaseSlide } from "@/frontend/components/PosterShowcase";
import { Button } from "@/frontend/components/ui/button";
import { Separator } from "@/frontend/components/ui/separator";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  getBollywoodMovies,
  getPosterUrl,
  getTrendingMovies,
  getTrendingTVShows,
} from "@/shared/lib/tmdb";
import { TMDB_FALLBACK_POSTERS } from "@/shared/lib/tmdbFallbacks";
import { cn } from "@/shared/lib/utils";

// Every field except id/src/title/eyebrow comes from TMDB and is only present
// for live data. The built-in fallback posters never carry a rating or blurb,
// so the page never shows details it cannot back up.
type LandingPoster = ShowcaseSlide;

const pillars = [
  {
    icon: Sparkles,
    index: "01",
    title: "Recommendations that learn",
    description:
      "Pick the languages and genres you like. Reckon builds your feed from them, then adjusts as you mark titles must-watch, skip or not now.",
  },
  {
    icon: Compass,
    index: "02",
    title: "Movies, series and people",
    description:
      "Search all three from one place, or browse Hollywood, Bollywood and TV catalogues and upcoming releases without losing your place.",
  },
  {
    icon: Bookmark,
    index: "03",
    title: "A watchlist you control",
    description:
      "Save titles, reorder them, and mark each one saved, watching, completed or dropped, so your queue reflects where you actually are.",
  },
] as const;

const journeySteps = [
  {
    number: "01",
    title: "Tell it what you like",
    description: "Choose the languages and genres you watch. You can change them any time from your preferences.",
  },
  {
    number: "02",
    title: "Get a feed built around you",
    description: "Reckon ranks movies and series against your preferences and what you have watched, liked or skipped.",
  },
  {
    number: "03",
    title: "Check where to watch, then save it",
    description: "Open a title for its cast, trailers and streaming providers in your region, then add it to your watchlist.",
  },
] as const;

const features = [
  {
    icon: Sparkles,
    title: "Reckon",
    description: "A personalised feed of movies and series based on your languages, genres and reactions.",
  },
  {
    icon: Search,
    title: "Search",
    description: "One search across movies, TV shows and people, with tabs to narrow by type.",
  },
  {
    icon: Tv,
    title: "Movies and series",
    description: "Browse dedicated Movies and Series pages, including Bollywood and Hollywood filters.",
  },
  {
    icon: CalendarDays,
    title: "Upcoming",
    description: "See what is releasing next, filtered by genre, language and date.",
  },
  {
    icon: Film,
    title: "Title pages",
    description: "Cast, trailers, ratings, synopsis and similar titles on every movie and show.",
  },
  {
    icon: MonitorPlay,
    title: "Where to watch",
    description: "Streaming, rental and purchase options for your region, shown on each title.",
  },
  {
    icon: ListVideo,
    title: "Watchlist",
    description: "Save, reorder and track titles as saved, watching, completed or dropped.",
  },
  {
    icon: MessageCircle,
    title: "Ratings and reviews",
    description: "Rate a title out of 10, leave a review and read what other members thought.",
  },
] as const;

export default function Landing() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const landingRef = useRef<HTMLDivElement>(null);

  const { data: trendingMovies } = useQuery({
    queryKey: ["landing-trending-movies"],
    queryFn: () => getTrendingMovies("week"),
    staleTime: 1000 * 60 * 10,
  });
  const { data: trendingTV } = useQuery({
    queryKey: ["landing-trending-tv"],
    queryFn: () => getTrendingTVShows("week"),
    staleTime: 1000 * 60 * 10,
  });
  const { data: bollywood } = useQuery({
    queryKey: ["landing-bollywood"],
    queryFn: () => getBollywoodMovies(),
    staleTime: 1000 * 60 * 10,
  });

  const posters = useMemo<LandingPoster[]>(() => {
    const rated = (voteAverage: number, voteCount: number) =>
      voteCount > 0 && voteAverage > 0 ? voteAverage : undefined;
    const year = (date?: string) => (date && date.length >= 4 ? date.slice(0, 4) : undefined);

    const movieItems: LandingPoster[] = (trendingMovies || [])
      .filter((item) => item.poster_path)
      .slice(0, 4)
      .map((item) => ({
        id: `movie-${item.id}`,
        src: getPosterUrl(item.poster_path, "medium"),
        title: item.title,
        eyebrow: "Trending film",
        rating: rated(item.vote_average, item.vote_count),
        overview: item.overview?.trim() || undefined,
        year: year(item.release_date),
      }));
    const tvItems: LandingPoster[] = (trendingTV || [])
      .filter((item) => item.poster_path)
      .slice(0, 4)
      .map((item) => ({
        id: `tv-${item.id}`,
        src: getPosterUrl(item.poster_path, "medium"),
        title: item.name,
        eyebrow: "Trending series",
        rating: rated(item.vote_average, item.vote_count),
        overview: item.overview?.trim() || undefined,
        year: year(item.first_air_date),
      }));
    const bollywoodItems: LandingPoster[] = (bollywood?.results || [])
      .filter((item) => item.poster_path)
      .slice(0, 4)
      .map((item) => ({
        id: `bollywood-${item.id}`,
        src: getPosterUrl(item.poster_path, "medium"),
        title: item.title,
        eyebrow: "Bollywood",
        rating: rated(item.vote_average, item.vote_count),
        overview: item.overview?.trim() || undefined,
        year: year(item.release_date),
      }));

    const mixed: LandingPoster[] = [];
    const max = Math.max(movieItems.length, tvItems.length, bollywoodItems.length);
    for (let index = 0; index < max; index += 1) {
      if (movieItems[index]) mixed.push(movieItems[index]);
      if (bollywoodItems[index]) mixed.push(bollywoodItems[index]);
      if (tvItems[index]) mixed.push(tvItems[index]);
    }

    // The same title can come from both trending and regional lists; show it once.
    const seen = new Set<string>();
    const unique = mixed.filter((poster) => (seen.has(poster.src) ? false : (seen.add(poster.src), true)));
    if (unique.length > 0) return unique;

    return TMDB_FALLBACK_POSTERS.map((poster, index) => ({
      id: `fallback-${index}`,
      src: getPosterUrl(poster.path, "medium"),
      title: poster.title,
      eyebrow: poster.eyebrow,
    }));
  }, [bollywood, trendingMovies, trendingTV]);

  const destination = user ? "/home" : "/auth";
  const primaryLabel = user ? "Open MovieReckon" : "Get started";
  const heroPosters = posters.slice(0, 7);

  useEffect(() => {
    if (reduceMotion || !landingRef.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({
      anchors: true,
      autoRaf: false,
      smoothWheel: true,
      stopInertiaOnNavigate: true,
    });
    const raf = (time: number) => lenis.raf(time * 1000);

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

      timeline
        .fromTo("[data-hero='eyebrow']", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45 })
        .fromTo("[data-hero='headline'] > span", { autoAlpha: 0, y: 48 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.11 }, "-=0.2")
        .fromTo("[data-hero='copy']", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.55 }, "-=0.38")
        .fromTo("[data-hero='actions']", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5 }, "-=0.3")
        .fromTo("[data-hero='showcase']", { autoAlpha: 0, y: 46, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.8 }, "-=0.52");

      gsap.to("[data-parallax='ambient']", {
        yPercent: 18,
        ease: "none",
        scrollTrigger: { trigger: "[data-section='hero']", start: "top top", end: "bottom top", scrub: 1.2 },
      });

      // Parallax the showcase wrapper only; the slides own their transforms.
      gsap.to("[data-hero='showcase']", {
        yPercent: 10,
        ease: "none",
        scrollTrigger: { trigger: "[data-section='hero']", start: "top top", end: "bottom top", scrub: 1 },
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.from(element, {
          autoAlpha: 0,
          y: 28,
          duration: 0.75,
          ease: "power3.out",
          immediateRender: false,
          scrollTrigger: { trigger: element, start: "top 88%", once: true },
        });
      });
    }, landingRef);

    return () => {
      context.revert();
      lenis.destroy();
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, [reduceMotion]);

  return (
    <div ref={landingRef} className="landing-cinema min-h-screen overflow-x-clip bg-background text-foreground">
      <a href="#landing-main" className="fixed left-4 top-4 z-[70] -translate-y-24 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-transform focus:translate-y-0">
        Skip to content
      </a>

      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="mx-auto flex h-15 max-w-7xl items-center justify-between rounded-2xl border border-white/12 bg-black/62 px-3 shadow-[0_18px_60px_rgba(0,0,0,0.48)] backdrop-blur-2xl sm:px-5">
          <Link to="/" aria-label="MovieReckon home" className="shrink-0 rounded-sm">
            <BrandLogo size="sm" />
          </Link>
          <nav aria-label="Landing page navigation" className="hidden items-center gap-7 lg:flex">
            <a className="landing-nav-link" href="#what-it-does">What it does</a>
            <a className="landing-nav-link" href="#how-it-works">How it works</a>
            <a className="landing-nav-link" href="#features">Features</a>
          </nav>
          <Button asChild size="sm" className="rounded-full px-4 shadow-[0_0_25px_hsl(var(--primary)/0.18)]">
            <Link to={destination}>
              {user ? "Open app" : "Sign in"}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </header>

      <main id="landing-main">
        <section data-section="hero" className="relative flex min-h-svh items-center overflow-hidden px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:min-h-screen lg:px-8 lg:pb-12">
          <div data-parallax="ambient" aria-hidden="true" className="absolute -inset-x-20 -top-28 h-[110%]">
            <div className="absolute left-[8%] top-[12%] size-[28rem] rounded-full bg-primary/18 blur-[120px]" />
            <div className="absolute right-[2%] top-[18%] size-[34rem] rounded-full bg-[#620414]/32 blur-[140px]" />
          </div>
          <div aria-hidden="true" className="landing-vignette absolute inset-0" />
          <div aria-hidden="true" className="landing-rule-grid absolute inset-0 opacity-40" />

          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[0.94fr_1.06fr] lg:gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="relative z-20 flex max-w-3xl flex-col items-start gap-7 lg:pr-4">
              <div data-hero="eyebrow" className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-white/60">
                <span className="h-px w-8 bg-primary" />
                Movie and TV recommendations
              </div>

              <h1 data-hero="headline" className="max-w-4xl text-[clamp(2.9rem,11vw,8.4rem)] lg:text-[clamp(4.5rem,7.4vw,8.4rem)] font-black leading-[0.79] tracking-[-0.072em]">
                <span className="block">Stop scrolling.</span>
                <span className="mt-[0.12em] block pb-[0.08em] text-primary drop-shadow-[0_16px_36px_hsl(var(--primary)/0.16)]">Start watching.</span>
              </h1>

              <p data-hero="copy" className="max-w-xl text-pretty text-base leading-7 text-white/62 sm:text-lg sm:leading-8">
                MovieReckon recommends movies and series from the languages and genres you pick, then keeps learning from what you watch, like and skip.
              </p>

              <div data-hero="actions" className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="group h-13 rounded-full px-6 shadow-[0_15px_45px_hsl(var(--primary)/0.3)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_20px_55px_hsl(var(--primary)/0.4)]">
                  <Link to={destination}>
                    {primaryLabel}
                    <ArrowRight className="transition-transform group-hover:translate-x-1" data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="group h-13 rounded-full border-white/14 bg-white/[0.035] px-6 backdrop-blur-xl transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.08]">
                  <a href="#how-it-works">
                    <Play className="fill-current" />
                    See how it works
                  </a>
                </Button>
              </div>
            </div>

            <div data-hero="showcase" className="relative mx-auto w-full max-w-2xl overflow-x-clip py-2 lg:overflow-visible">
              <div aria-hidden="true" className="absolute left-1/2 top-[38%] h-2/3 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/12 blur-3xl" />
              <PosterShowcase slides={heroPosters} label="Trending movies and series" className="landing-showcase" />
            </div>
          </div>
        </section>

        <section id="what-it-does" className="relative scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="landing-kicker">What it does</p>
              <h2 className="mt-4 text-balance text-4xl font-black leading-[0.98] tracking-[-0.05em] sm:text-6xl">Find something to watch, then keep track of it.</h2>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {pillars.map((pillar) => (
                <article key={pillar.title} data-reveal className="landing-glass-card group relative flex min-h-72 flex-col overflow-hidden p-6 sm:p-7">
                  <span className="absolute right-5 top-4 text-5xl font-black tracking-[-0.08em] text-white/[0.035] transition-colors group-hover:text-primary/[0.08]">{pillar.index}</span>
                  <div className="flex size-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.045] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <pillar.icon className="size-5" aria-hidden="true" />
                  </div>
                  <div className="mt-auto pt-14">
                    <h3 className="text-2xl font-bold tracking-tight">{pillar.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/52">{pillar.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-section-band scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
            <div className="flex flex-col items-start lg:sticky lg:top-28 lg:self-start">
              <p className="landing-kicker">How it works</p>
              <h2 className="mt-5 text-balance text-4xl font-black leading-[0.95] tracking-[-0.055em] sm:text-6xl">Three steps from sign-up to something to watch.</h2>
            </div>

            <ol className="relative border-l border-white/10 pl-6 sm:pl-10">
              {journeySteps.map((step, index) => (
                <li key={step.number} className={cn("group relative pb-12 sm:pb-16", index === journeySteps.length - 1 && "pb-0 sm:pb-0")}>
                  <span className="absolute -left-[1.9rem] top-1 flex size-3 rounded-full border-2 border-background bg-primary shadow-[0_0_20px_hsl(var(--primary)/0.7)] sm:-left-[2.9rem]" />
                  <div data-reveal className="landing-glass-card grid gap-6 p-6 sm:grid-cols-[5.5rem_1fr] sm:p-8">
                    <span className="text-5xl font-black tracking-[-0.07em] text-primary/85">{step.number}</span>
                    <div>
                      <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">{step.title}</h3>
                      <p className="mt-3 max-w-xl text-base leading-7 text-white/50">{step.description}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32" aria-labelledby="features-title">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="landing-kicker">Features</p>
              <h2 id="features-title" className="mt-4 text-balance text-4xl font-black leading-[0.98] tracking-[-0.05em] sm:text-6xl">Everything in the app today.</h2>
            </div>

            <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <article key={feature.title} data-reveal className="landing-feature-card flex flex-col gap-4 p-5 sm:p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                    <feature.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/48">{feature.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <div className="landing-glass-card relative mx-auto grid max-w-7xl gap-8 overflow-hidden p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-end lg:p-16">
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,hsl(var(--primary)/0.28),transparent_36%)]" />
            <div className="relative max-w-3xl">
              <p className="landing-kicker">Ready when you are</p>
              <h2 className="mt-5 text-balance text-4xl font-black leading-[0.92] tracking-[-0.06em] sm:text-6xl">Pick your genres. Get your feed.</h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/52">Create a profile, choose the languages and genres you watch, and start with recommendations made for you.</p>
            </div>
            <Button asChild size="lg" className="group relative h-14 rounded-full px-7 text-base shadow-[0_18px_50px_hsl(var(--primary)/0.34)]">
              <Link to={destination}>
                {primaryLabel}
                <ArrowRight className="transition-transform group-hover:translate-x-1" data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <BrandLogo size="sm" />
            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/42">
              {["About", "FAQ", "Contact", "Privacy", "Terms"].map((label) => (
                <Link key={label} className="rounded-sm transition-colors hover:text-white" to={`/${label.toLowerCase()}`}>{label}</Link>
              ))}
            </nav>
          </div>
          <Separator className="bg-white/[0.07]" />
          <p className="text-xs text-white/32">© {new Date().getFullYear()} MovieReckon. Movie and TV data from TMDB.</p>
        </div>
      </footer>
    </div>
  );
}
