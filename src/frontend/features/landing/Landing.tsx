"use client";

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Bookmark,
  Check,
  Clapperboard,
  Compass,
  Film,
  Sparkles,
  Star,
} from "lucide-react";

import BrandLogo from "@/frontend/components/BrandLogo";
import MediaImage from "@/frontend/components/MediaImage";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
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
    icon: Sparkles,
    title: "Recommendations with a point of view",
    description:
      "Tell Reckon what you are in the mood for and get a focused shortlist built around your taste—not a wall of thumbnails.",
  },
  {
    icon: Compass,
    title: "One place for every kind of night",
    description:
      "Move naturally between Bollywood, Hollywood, movies, series, upcoming releases, and what is playing in the cinema.",
  },
  {
    icon: Bookmark,
    title: "A watchlist that stays useful",
    description:
      "Save discoveries, reorder your queue, mark titles watched, and keep the next great pick close without losing your place.",
  },
] as const;

const journeySteps = [
  {
    number: "01",
    title: "Set the mood",
    description: "Choose the vibe, language, genre, or occasion you want right now.",
  },
  {
    number: "02",
    title: "Let Reckon narrow it down",
    description: "Your history and preferences shape a smaller, more relevant selection.",
  },
  {
    number: "03",
    title: "Watch with confidence",
    description: "Open the details, save the winner, and spend less of the night deciding.",
  },
] as const;

function PosterFrame({ poster, featured = false }: { poster: LandingPoster; featured?: boolean }) {
  return (
    <figure
      className={cn(
        "relative aspect-[2/3] shrink-0 overflow-hidden border bg-card shadow-2xl",
        featured
          ? "w-34 rounded-2xl sm:w-44 lg:w-52"
          : "w-24 rounded-xl shadow-xl sm:w-32 lg:w-38",
      )}
    >
      <MediaImage
        src={poster.src}
        alt={`${poster.title} poster`}
        className="size-full object-cover"
        width={featured ? 342 : 185}
        height={featured ? 513 : 278}
        fallbackSrc="/fallbacks/poster.svg"
        priority={featured}
        fadeIn
      />
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-linear-to-t from-background via-background/86 to-transparent px-3 pt-12 pb-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          {poster.eyebrow}
        </span>
        <span className="truncate text-xs font-semibold text-foreground sm:text-sm">{poster.title}</span>
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();

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
        eyebrow: "Trending movie",
      }));
    const tvItems = (trendingTV || [])
      .filter((item) => item.poster_path)
      .slice(0, 4)
      .map((item) => ({
        id: `tv-${item.id}`,
        src: getPosterUrl(item.poster_path, "medium"),
        title: item.name,
        eyebrow: "Trending series",
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

    return Array.from({ length: 9 }, (_, index) => ({
      id: `fallback-${index}`,
      src: "/fallbacks/poster.svg",
      title: "Your next discovery",
      eyebrow: index % 2 === 0 ? "MovieReckon pick" : "Made for your mood",
    }));
  }, [bollywood, trendingMovies, trendingTV]);

  const destination = user ? "/home" : "/auth";
  const primaryLabel = user ? "Open MovieReckon" : "Find my next watch";
  const heroPosters = posters.slice(0, 5);
  const railPosters = posters.slice(3, 12);

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <a
        href="#landing-main"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="mx-auto flex h-15 max-w-6xl items-center justify-between rounded-2xl border bg-background/82 px-3 shadow-2xl backdrop-blur-xl sm:px-5">
          <Link to="/" aria-label="MovieReckon home" className="shrink-0">
            <BrandLogo size="sm" />
          </Link>

          <nav aria-label="Landing page navigation" className="hidden items-center gap-6 md:flex">
            <a className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="#discover">
              Discover
            </a>
            <a className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="#how-it-works">
              How it works
            </a>
            <a className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="#features">
              Features
            </a>
          </nav>

          <Button asChild size="sm" className="rounded-full">
            <Link to={destination}>
              {user ? "Open app" : "Sign in"}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </header>

      <main id="landing-main">
        <section className="relative flex min-h-[46rem] items-center overflow-hidden px-4 pt-28 pb-18 sm:min-h-screen sm:px-6 lg:px-8">
          <div aria-hidden="true" className="absolute inset-0">
            <div className="absolute -left-24 top-12 size-96 rounded-full bg-primary/18 blur-3xl" />
            <div className="absolute -right-32 top-1/3 size-112 rounded-full bg-secondary/28 blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--foreground)/0.04)_1px,transparent_1px),linear-gradient(hsl(var(--foreground)/0.04)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
          </div>

          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-w-3xl flex-col items-start gap-7"
            >
              <Badge variant="outline" className="gap-2 rounded-full px-3 py-1 text-muted-foreground [&_svg]:size-3.5">
                <Sparkles className="text-primary" aria-hidden="true" />
                Your taste. Reckoned.
              </Badge>

              <div className="flex flex-col gap-5">
                <h1 className="max-w-4xl text-balance text-[clamp(3.3rem,9vw,7.5rem)] font-black leading-[0.84] tracking-[-0.065em]">
                  Stop scrolling.
                  <span className="mt-2 block bg-[image:var(--brand-gradient)] bg-clip-text text-transparent">
                    Start watching.
                  </span>
                </h1>
                <p className="max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                  MovieReckon turns your mood and taste into a tighter, smarter shortlist across movies, series, Bollywood, Hollywood, and cinema releases.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full px-6 shadow-[var(--shadow-glow)]">
                  <Link to={destination}>
                    {primaryLabel}
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6">
                  <a href="#how-it-works">
                    See how it works
                    <Compass data-icon="inline-end" />
                  </a>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground sm:text-sm">
                {["Movies + series", "Bollywood + Hollywood", "Personal watchlist"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-primary" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto flex h-[25rem] w-full max-w-xl items-center justify-center sm:h-[32rem]"
              aria-label="A selection of trending titles"
            >
              {heroPosters.map((poster, index) => {
                const positions = [
                  "left-[2%] top-[20%] -rotate-8",
                  "left-[21%] top-[5%] -rotate-3",
                  "left-1/2 top-[15%] z-10 -translate-x-1/2 rotate-2",
                  "right-[18%] top-[7%] rotate-6",
                  "right-[1%] top-[24%] rotate-10",
                ];
                return (
                  <div key={poster.id} className={cn("absolute", positions[index] || positions[0])}>
                    <PosterFrame poster={poster} featured={index === 2} />
                  </div>
                );
              })}
              <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-2xl border bg-background/88 px-4 py-3 shadow-2xl backdrop-blur-xl">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Sparkles className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Reckon says</p>
                  <p className="truncate text-sm font-semibold">This one fits tonight.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="discover" className="scroll-mt-24 px-4 py-18 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <Badge variant="outline" className="w-fit rounded-full">Discovery, without the drift</Badge>
              <h2 className="text-balance text-4xl font-black leading-none tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Everything you need to choose well. Nothing that gets in the way.
              </h2>
            </div>

            <div id="features" className="grid scroll-mt-24 gap-4 md:grid-cols-3">
              {featureCards.map((feature) => (
                <Card key={feature.title} className="flex min-h-72 flex-col overflow-hidden">
                  <CardHeader className="gap-5">
                    <div className="flex size-11 items-center justify-center rounded-xl border bg-primary/10 text-primary">
                      <feature.icon className="size-5" aria-hidden="true" />
                    </div>
                    <CardTitle className="text-balance text-2xl leading-tight">{feature.title}</CardTitle>
                    <CardDescription className="text-pretty text-sm leading-6">{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Separator />
                  </CardContent>
                  <CardFooter className="gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    <Film className="size-4 text-primary" aria-hidden="true" />
                    Built for movie nights
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y bg-card/35 py-18 sm:py-24">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 overflow-hidden px-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
              <Badge variant="secondary" className="rounded-full">Across every screen story</Badge>
              <h2 className="text-balance text-4xl font-black tracking-[-0.045em] sm:text-6xl">
                From opening weekend to your quiet-night comfort show.
              </h2>
            </div>
            <div className="flex gap-3 overflow-x-auto py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {railPosters.map((poster, index) => (
                <div key={poster.id} className={index % 2 === 0 ? "mt-0" : "mt-7"}>
                  <PosterFrame poster={poster} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 px-4 py-18 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div className="flex flex-col items-start gap-5 lg:sticky lg:top-28 lg:self-start">
              <Badge variant="outline" className="rounded-full">Three scenes. One decision.</Badge>
              <h2 className="text-balance text-4xl font-black leading-none tracking-[-0.045em] sm:text-6xl">
                Your next favourite starts with one honest mood.
              </h2>
              <p className="max-w-md text-pretty leading-7 text-muted-foreground">
                MovieReckon keeps discovery conversational and deliberate, so recommendations feel closer to a trusted friend than an algorithmic feed.
              </p>
            </div>

            <ol className="flex flex-col gap-4">
              {journeySteps.map((step) => (
                <li key={step.number}>
                  <Card className="overflow-hidden">
                    <CardHeader className="grid gap-5 sm:grid-cols-[5rem_1fr] sm:items-start">
                      <span className="text-5xl font-black tracking-[-0.06em] text-primary">{step.number}</span>
                      <div className="flex flex-col gap-2">
                        <CardTitle className="text-2xl">{step.title}</CardTitle>
                        <CardDescription className="max-w-lg text-base leading-7">{step.description}</CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 pb-18 sm:px-6 sm:pb-28 lg:px-8">
          <div className="relative mx-auto overflow-hidden rounded-[2rem] border bg-card px-6 py-14 shadow-2xl sm:px-12 sm:py-18 lg:px-18">
            <div aria-hidden="true" className="absolute -right-24 -top-28 size-96 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]">
              <div className="flex max-w-3xl flex-col gap-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Star className="size-4 fill-current" aria-hidden="true" />
                  Tonight deserves a better answer
                </div>
                <h2 className="text-balance text-4xl font-black leading-none tracking-[-0.05em] sm:text-6xl">
                  Your watchlist is waiting for its first great pick.
                </h2>
                <p className="max-w-xl text-pretty leading-7 text-muted-foreground">
                  Create your free account, tell Reckon what sounds good, and turn the next twenty minutes of scrolling into the opening credits.
                </p>
              </div>
              <Button asChild size="lg" className="h-13 rounded-full px-7">
                <Link to={destination}>
                  {primaryLabel}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <BrandLogo size="sm" />
            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
              <Link className="transition-colors hover:text-foreground" to="/about">About</Link>
              <Link className="transition-colors hover:text-foreground" to="/faq">FAQ</Link>
              <Link className="transition-colors hover:text-foreground" to="/contact">Contact</Link>
              <Link className="transition-colors hover:text-foreground" to="/privacy">Privacy</Link>
              <Link className="transition-colors hover:text-foreground" to="/terms">Terms</Link>
            </nav>
          </div>
          <Separator />
          <div className="flex flex-col justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} MovieReckon. Find the story worth your time.</p>
            <p className="inline-flex items-center gap-2">
              <Clapperboard className="size-3.5 text-primary" aria-hidden="true" />
              Movies, series, and cinema—reckoned for you.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
