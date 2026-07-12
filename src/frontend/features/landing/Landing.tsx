"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  Clapperboard,
  Clock3,
  Compass,
  Play,
  Quote,
  Sparkles,
  Star,
  WandSparkles,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";

import BrandLogo from "@/frontend/components/BrandLogo";
import LiquidGlassCard from "@/frontend/components/LiquidGlassCard";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { Separator } from "@/frontend/components/ui/separator";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  getBollywoodMovies,
  getPosterUrl,
  getTrendingMovies,
  getTrendingTVShows,
} from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

type LandingPoster = {
  id: string;
  src: string;
  title: string;
  eyebrow: string;
};

const featureCards = [
  {
    icon: WandSparkles,
    index: "01",
    title: "Taste, not trends",
    description:
      "Reckon listens for the feeling behind your request, then filters the noise into a shortlist that feels distinctly yours.",
  },
  {
    icon: Compass,
    index: "02",
    title: "Every screen story",
    description:
      "Move between cinema releases, cult films, comfort series, Bollywood and Hollywood without starting your search over.",
  },
  {
    icon: Bookmark,
    index: "03",
    title: "A queue with purpose",
    description:
      "Save the contenders, mark what you have seen, and keep a watchlist built for the night you actually have.",
  },
] as const;

const journeySteps = [
  {
    number: "01",
    title: "Set the mood",
    description: "Choose a feeling, genre, language, pace—or simply describe the kind of night you are having.",
  },
  {
    number: "02",
    title: "Let Reckon narrow it down",
    description: "Your taste and watch history turn an endless catalogue into a considered, explainable shortlist.",
  },
  {
    number: "03",
    title: "Watch with confidence",
    description: "Compare the final picks, save the winner, and reach the opening credits while the night is still young.",
  },
] as const;

const heroPositions = [
  "left-[1%] top-[25%] -rotate-[10deg]",
  "left-[18%] top-[8%] -rotate-[4deg]",
  "left-1/2 top-[15%] z-10 -translate-x-1/2 rotate-[1.5deg]",
  "right-[17%] top-[7%] rotate-[6deg]",
  "right-[0%] top-[27%] rotate-[11deg]",
] as const;

const tasteBadges = ["Neo-noir", "Slow burn", "Smart sci-fi", "Dark comedy"] as const;

function PosterFrame({
  poster,
  featured = false,
  rail = false,
}: {
  poster: LandingPoster;
  featured?: boolean;
  rail?: boolean;
}) {
  return (
    <figure
      className={cn(
        "group/poster relative aspect-[2/3] shrink-0 overflow-hidden border border-white/12 bg-card shadow-[0_30px_70px_rgba(0,0,0,0.55)] transition-[border-color,box-shadow] duration-500 hover:border-primary/45 hover:shadow-[0_34px_90px_hsl(var(--primary)/0.16)]",
        featured
          ? "w-38 rounded-[1.35rem] sm:w-48 xl:w-56"
          : rail
            ? "w-38 snap-start rounded-2xl sm:w-48 lg:w-54"
            : "w-28 rounded-2xl sm:w-36 xl:w-42",
      )}
    >
      <MediaImage
        src={poster.src}
        alt={`${poster.title} poster`}
        className="size-full object-cover saturate-[0.82] transition-[filter,transform] duration-700 ease-out group-hover/poster:scale-[1.035] group-hover/poster:saturate-110"
        width={featured || rail ? 342 : 185}
        height={featured || rail ? 513 : 278}
        fallbackSrc="/fallbacks/poster.svg"
        priority={featured}
        fadeIn
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.12),transparent_25%,transparent_70%,rgba(225,29,72,0.08))] opacity-70 transition-opacity group-hover/poster:opacity-100" />
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t from-black via-black/82 to-transparent px-3 pt-16 pb-3.5 sm:px-4 sm:pb-4">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary sm:text-[10px]">
          {poster.eyebrow}
        </span>
        <span className="truncate text-xs font-semibold text-white sm:text-sm">{poster.title}</span>
      </figcaption>
    </figure>
  );
}

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
    const movieItems = (trendingMovies || [])
      .filter((item) => item.poster_path)
      .slice(0, 4)
      .map((item) => ({
        id: `movie-${item.id}`,
        src: getPosterUrl(item.poster_path, "medium"),
        title: item.title,
        eyebrow: "Trending film",
      }));
    const tvItems = (trendingTV || [])
      .filter((item) => item.poster_path)
      .slice(0, 4)
      .map((item) => ({
        id: `tv-${item.id}`,
        src: getPosterUrl(item.poster_path, "medium"),
        title: item.name,
        eyebrow: "Acclaimed series",
      }));
    const bollywoodItems = (bollywood?.results || [])
      .filter((item) => item.poster_path)
      .slice(0, 4)
      .map((item) => ({
        id: `bollywood-${item.id}`,
        src: getPosterUrl(item.poster_path, "medium"),
        title: item.title,
        eyebrow: "Bollywood pick",
      }));

    const mixed: LandingPoster[] = [];
    const max = Math.max(movieItems.length, tvItems.length, bollywoodItems.length);
    for (let index = 0; index < max; index += 1) {
      if (movieItems[index]) mixed.push(movieItems[index]);
      if (bollywoodItems[index]) mixed.push(bollywoodItems[index]);
      if (tvItems[index]) mixed.push(tvItems[index]);
    }

    if (mixed.length > 0) return mixed;

    return Array.from({ length: 12 }, (_, index) => ({
      id: `fallback-${index}`,
      src: "/fallbacks/poster.svg",
      title: "Your next discovery",
      eyebrow: index % 2 === 0 ? "MovieReckon pick" : "Made for your mood",
    }));
  }, [bollywood, trendingMovies, trendingTV]);

  const destination = user ? "/home" : "/auth";
  const primaryLabel = user ? "Open MovieReckon" : "Find my next watch";
  const heroPosters = posters.slice(0, 5);
  const railPosters = posters.slice(2, 12);
  const recommendation = posters[0];

  useEffect(() => {
    if (reduceMotion || !landingRef.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

      timeline
        .fromTo("[data-hero='eyebrow']", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45 })
        .fromTo("[data-hero='headline'] > span", { autoAlpha: 0, y: 48 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.11 }, "-=0.2")
        .fromTo("[data-hero='copy']", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.55 }, "-=0.38")
        .fromTo("[data-hero='actions']", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5 }, "-=0.3")
        .fromTo("[data-hero='tastes']", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45 }, "-=0.28")
        .fromTo("[data-parallax='poster']", { autoAlpha: 0, y: 46 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.075 }, "-=0.52")
        .fromTo("[data-parallax='recommendation']", { autoAlpha: 0, y: 24, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55 }, "-=0.34");

      gsap.to("[data-parallax='ambient']", {
        yPercent: 18,
        ease: "none",
        scrollTrigger: { trigger: "[data-section='hero']", start: "top top", end: "bottom top", scrub: 1.2 },
      });

      gsap.utils.toArray<HTMLElement>("[data-parallax='poster']").forEach((poster, index) => {
        gsap.to(poster, {
          yPercent: 8 + index * 5,
          ease: "none",
          scrollTrigger: { trigger: "[data-section='hero']", start: "top top", end: "bottom top", scrub: 0.9 + index * 0.12 },
        });
      });

      gsap.to("[data-parallax='recommendation']", {
        yPercent: -16,
        ease: "none",
        scrollTrigger: { trigger: "[data-section='hero']", start: "top top", end: "bottom top", scrub: 1 },
      });
      gsap.to("[data-parallax='grain']", {
        xPercent: 3,
        ease: "none",
        scrollTrigger: { trigger: landingRef.current, start: "top top", end: "bottom bottom", scrub: 2 },
      });
    }, landingRef);

    return () => context.revert();
  }, [reduceMotion]);

  return (
    <div ref={landingRef} className="landing-cinema min-h-screen overflow-x-clip bg-background text-foreground">
      <a href="#landing-main" className="fixed left-4 top-4 z-[70] -translate-y-24 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-transform focus:translate-y-0">
        Skip to content
      </a>

      <div data-parallax="grain" aria-hidden="true" className="landing-grain pointer-events-none fixed inset-0 z-[60] scale-110 opacity-[0.035]" />

      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="mx-auto flex h-15 max-w-7xl items-center justify-between rounded-2xl border border-white/12 bg-black/62 px-3 shadow-[0_18px_60px_rgba(0,0,0,0.48)] backdrop-blur-2xl sm:px-5">
          <Link to="/" aria-label="MovieReckon home" className="shrink-0 rounded-sm">
            <BrandLogo size="sm" />
          </Link>
          <nav aria-label="Landing page navigation" className="hidden items-center gap-7 md:flex">
            <a className="landing-nav-link" href="#discover">Discover</a>
            <a className="landing-nav-link" href="#stories">Stories</a>
            <a className="landing-nav-link" href="#how-it-works">How it works</a>
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
        <section data-section="hero" className="relative flex min-h-[54rem] items-center overflow-hidden px-4 pb-20 pt-28 sm:min-h-[60rem] sm:px-6 sm:pt-32 lg:min-h-screen lg:px-8 lg:pb-12">
          <div data-parallax="ambient" aria-hidden="true" className="absolute -inset-x-20 -top-28 h-[110%]">
            <div className="absolute left-[8%] top-[12%] size-[28rem] rounded-full bg-primary/18 blur-[120px]" />
            <div className="absolute right-[2%] top-[18%] size-[34rem] rounded-full bg-[#620414]/32 blur-[140px]" />
            <div className="absolute bottom-[5%] left-[42%] h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/8 blur-[120px]" />
          </div>
          <div aria-hidden="true" className="landing-vignette absolute inset-0" />
          <div aria-hidden="true" className="landing-rule-grid absolute inset-0 opacity-40" />

          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-[0.94fr_1.06fr] lg:gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="relative z-20 flex max-w-3xl flex-col items-start gap-7 lg:pr-4">
              <div data-hero="eyebrow" className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-white/60">
                <span className="h-px w-8 bg-primary" />
                AI curation for indecisive nights
              </div>

              <h1 data-hero="headline" className="max-w-4xl text-[clamp(3.65rem,8.5vw,8.4rem)] font-black leading-[0.79] tracking-[-0.072em]">
                <span className="block">Stop scrolling.</span>
                <span className="mt-[0.12em] block bg-[image:var(--brand-gradient)] bg-clip-text pb-[0.08em] text-transparent">Start watching.</span>
              </h1>

              <p data-hero="copy" className="max-w-xl text-pretty text-base leading-7 text-white/62 sm:text-lg sm:leading-8">
                Tell Reckon the mood. Get a confident shortlist across films, series, Bollywood, Hollywood and cinema—shaped around your taste, not everybody else's.
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

              <div data-hero="tastes" className="flex max-w-xl flex-wrap items-center gap-2" aria-label="Example taste preferences">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Tonight's taste</span>
                {tasteBadges.map((taste) => (
                  <span key={taste} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs text-white/66 backdrop-blur-md">{taste}</span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto h-[29rem] w-full max-w-2xl sm:h-[39rem] lg:h-[43rem]" aria-label="A layered selection of trending movie and television posters">
              <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15 bg-primary/8 blur-2xl" />
              {heroPosters.map((poster, index) => (
                <div key={poster.id} data-parallax="poster" className={cn("absolute will-change-transform", heroPositions[index] || heroPositions[0])}>
                  <PosterFrame poster={poster} featured={index === 2} />
                </div>
              ))}

              <div data-parallax="recommendation" className="absolute bottom-1 left-1/2 z-30 w-[min(92%,25rem)] -translate-x-1/2 will-change-transform sm:bottom-5 sm:left-auto sm:right-0 sm:w-[23rem] sm:translate-x-0 lg:-right-3">
                <LiquidGlassCard
                  width={368}
                  blur={18}
                  distortion={16}
                  chromaticAberration={1}
                  borderRadius={22}
                  borderColor="white"
                  borderOpacity={0.2}
                  backgroundColor="#090607"
                  backgroundOpacity={0.76}
                  innerLightColor="#ffffff"
                  innerLightOpacity={0.13}
                  outerLightColor="#e11d48"
                  outerLightOpacity={0.18}
                  padding="0"
                  flexibility={0}
                  className="landing-liquid-full shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
                  contentClassName="p-4 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                      <Sparkles className="size-3.5" aria-hidden="true" /> Reckon says
                    </div>
                    <span className="rounded-full border border-[#f6c453]/25 bg-[#f6c453]/10 px-2 py-1 text-[10px] font-bold text-[#f6c453]">96% match</span>
                  </div>
                  <p className="mt-4 text-xl font-bold tracking-tight text-white">This is the one for tonight.</p>
                  <p className="mt-1.5 text-sm leading-6 text-white/56">Moody, intelligent and absorbing—without demanding your whole weekend.</p>
                </LiquidGlassCard>
              </div>
            </div>
          </div>

          <div aria-hidden="true" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-3 text-[9px] font-bold uppercase tracking-[0.24em] text-white/30 lg:flex">
            <span className="h-px w-10 bg-white/20" /> Curated below <span className="h-px w-10 bg-white/20" />
          </div>
        </section>

        <section id="discover" className="relative scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div>
                <p className="landing-kicker">Discovery without the drift</p>
                <p className="mt-4 max-w-xs text-sm leading-6 text-white/42">Less catalogue. More conviction. Every part of MovieReckon is built to move the night forward.</p>
              </div>
              <h2 className="text-balance text-4xl font-black leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">A better answer than<br className="hidden sm:block" /> “keep browsing.”</h2>
            </div>

            <div id="features" className="mt-14 grid scroll-mt-24 gap-4 md:grid-cols-3">
              {featureCards.map((feature) => (
                <article key={feature.title} className="landing-glass-card group relative flex min-h-80 flex-col overflow-hidden p-6 sm:p-7">
                  <span className="absolute right-5 top-4 text-5xl font-black tracking-[-0.08em] text-white/[0.035] transition-colors group-hover:text-primary/[0.08]">{feature.index}</span>
                  <div className="flex size-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.045] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-[border-color,transform,box-shadow] duration-500 group-hover:-translate-y-1 group-hover:border-primary/35 group-hover:shadow-[0_12px_35px_hsl(var(--primary)/0.16)]">
                    <feature.icon className="size-5" aria-hidden="true" />
                  </div>
                  <div className="mt-auto pt-16">
                    <h3 className="text-2xl font-bold tracking-tight">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/52">{feature.description}</p>
                  </div>
                  <div className="mt-6 h-px w-full origin-left scale-x-30 bg-linear-to-r from-primary via-primary/25 to-transparent transition-transform duration-500 group-hover:scale-x-100" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="stories" className="scroll-mt-20 border-y border-white/[0.07] bg-white/[0.018] py-20 sm:py-28">
          <div className="mx-auto max-w-[92rem]">
            <div className="flex flex-col justify-between gap-6 px-4 sm:px-8 lg:flex-row lg:items-end lg:px-12">
              <div>
                <p className="landing-kicker">Across every screen story</p>
                <h2 className="mt-4 max-w-4xl text-balance text-4xl font-black leading-none tracking-[-0.05em] sm:text-6xl">One taste profile. Every kind of story.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/45">Drag the rail and cross genres, languages and formats without losing what makes a title right for you.</p>
            </div>
            <div className="landing-poster-rail mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-6 pt-3 sm:gap-5 sm:px-8 lg:px-12">
              {railPosters.map((poster, index) => (
                <div key={poster.id} className={cn("shrink-0", index % 3 === 1 && "mt-8")}>
                  <PosterFrame poster={poster} rail />
                </div>
              ))}
              <div className="flex w-38 shrink-0 snap-start items-center justify-center sm:w-48">
                <Link to={destination} className="group flex flex-col items-center gap-3 text-center text-sm font-semibold text-white/60 transition-colors hover:text-white">
                  <span className="flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary transition-[transform,background-color] group-hover:scale-105 group-hover:bg-primary group-hover:text-white"><ArrowRight aria-hidden="true" /></span>
                  Find your cut
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
            <div className="flex flex-col items-start lg:sticky lg:top-28 lg:self-start">
              <p className="landing-kicker">How it works</p>
              <h2 className="mt-5 text-balance text-4xl font-black leading-[0.95] tracking-[-0.055em] sm:text-6xl">Three scenes.<br />One decision.</h2>
              <Quote className="mt-9 size-8 text-primary/50" aria-hidden="true" />
              <p className="mt-3 max-w-sm text-pretty text-base leading-7 text-white/48">Like the friend who remembers what you loved, what you abandoned, and exactly how much energy you have tonight.</p>
            </div>

            <ol className="relative border-l border-white/10 pl-6 sm:pl-10">
              {journeySteps.map((step, index) => (
                <li key={step.number} className={cn("group relative pb-12 sm:pb-16", index === journeySteps.length - 1 && "pb-0 sm:pb-0")}>
                  <span className="absolute -left-[1.9rem] top-1 flex size-3 rounded-full border-2 border-background bg-primary shadow-[0_0_20px_hsl(var(--primary)/0.7)] sm:-left-[2.9rem]" />
                  <div className="landing-glass-card grid gap-6 p-6 transition-transform duration-500 group-hover:translate-x-1 sm:grid-cols-[5.5rem_1fr] sm:p-8">
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

        <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8 lg:pb-36" aria-labelledby="recommendation-preview-title">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#080708] shadow-[0_45px_120px_rgba(0,0,0,0.48)] sm:rounded-[2.5rem]">
            <div aria-hidden="true" className="absolute inset-0 opacity-30">
              <MediaImage src={recommendation.src} alt="" className="size-full scale-110 object-cover blur-2xl saturate-50" width={900} height={600} fallbackSrc="/fallbacks/poster.svg" />
              <div className="absolute inset-0 bg-linear-to-r from-black via-black/90 to-black/55" />
            </div>
            <div className="relative grid min-h-[38rem] items-center gap-10 p-6 sm:p-10 lg:grid-cols-[0.78fr_1.22fr] lg:p-16">
              <div className="mx-auto w-full max-w-xs lg:mx-0">
                <PosterFrame poster={recommendation} featured />
              </div>
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary"><Sparkles className="size-4" aria-hidden="true" />Personalized recommendation</div>
                <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-3">
                  <h2 id="recommendation-preview-title" className="text-balance text-4xl font-black leading-none tracking-[-0.05em] sm:text-6xl">{recommendation.title}</h2>
                  <span className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-[#f6c453]"><Star className="size-4 fill-current" aria-hidden="true" />96% match</span>
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Atmospheric", "Character-driven", "Clever", "Tonight-sized"].map((tag) => <span key={tag} className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs text-white/60 backdrop-blur-lg">{tag}</span>)}
                </div>
                <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-white/55 sm:text-lg sm:leading-8">You like stories that reveal their hand slowly, reward attention and still land with an emotional pulse. This pick sits right at that intersection.</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="h-12 rounded-full px-6"><Link to={destination}><Play className="fill-current" />View recommendation</Link></Button>
                  <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/14 bg-white/[0.035] px-6 hover:bg-white/[0.08]"><Link to={destination}><Bookmark />Add to watchlist</Link></Button>
                </div>
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-5 text-xs text-white/38">
                  <span className="inline-flex items-center gap-2"><Clock3 className="size-3.5 text-primary" aria-hidden="true" />Fits your evening</span>
                  <span className="inline-flex items-center gap-2"><Check className="size-3.5 text-primary" aria-hidden="true" />Based on your taste</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-primary/20 p-1 shadow-[0_45px_120px_hsl(var(--primary)/0.12)]">
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,hsl(var(--primary)/0.34),transparent_33%),linear-gradient(135deg,#130609,#050505_72%)]" />
            <LiquidGlassCard
              width={1200}
              blur={20}
              distortion={13}
              chromaticAberration={0.8}
              borderRadius={28}
              borderColor="white"
              borderOpacity={0.1}
              backgroundColor="#090607"
              backgroundOpacity={0.54}
              innerLightColor="#ffffff"
              innerLightOpacity={0.09}
              outerLightColor="#e11d48"
              outerLightOpacity={0.2}
              padding="0"
              flexibility={0}
              className="landing-liquid-full relative"
              contentClassName="relative grid gap-10 p-7 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-end lg:p-16"
            >
              <div className="max-w-4xl">
                <p className="landing-kicker">Tonight starts here</p>
                <h2 className="mt-5 text-balance text-4xl font-black leading-[0.9] tracking-[-0.06em] sm:text-6xl lg:text-7xl">Trade the scroll<br />for opening credits.</h2>
                <p className="mt-6 max-w-xl text-base leading-7 text-white/52">Create your free profile, set the mood, and let Reckon turn the whole catalogue into the right few choices.</p>
              </div>
              <Button asChild size="lg" className="group h-14 rounded-full px-7 text-base shadow-[0_18px_50px_hsl(var(--primary)/0.34)]">
                <Link to={destination}>{primaryLabel}<ChevronRight className="transition-transform group-hover:translate-x-1" data-icon="inline-end" /></Link>
              </Button>
            </LiquidGlassCard>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <BrandLogo size="sm" />
            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/42">
              {["About", "FAQ", "Contact", "Privacy", "Terms"].map((label) => <Link key={label} className="rounded-sm transition-colors hover:text-white" to={`/${label.toLowerCase()}`}>{label}</Link>)}
            </nav>
          </div>
          <Separator className="bg-white/[0.07]" />
          <div className="flex flex-col justify-between gap-3 text-xs text-white/32 sm:flex-row">
            <p>© {new Date().getFullYear()} MovieReckon. Find the story worth your time.</p>
            <p className="inline-flex items-center gap-2"><Clapperboard className="size-3.5 text-primary" aria-hidden="true" />Movies, series and cinema—reckoned for you.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
