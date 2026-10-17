import type { Metadata } from "next";

/**
 * Per-route document metadata for the single catch-all Next.js page.
 *
 * The app is one React Router SPA behind `[[...slug]]`, so without this every
 * route shared the same title and was indexable. Pure on purpose: TMDB lookups
 * for detail pages are injected, which keeps this testable and server-free.
 */

const SITE_NAME = "MovieReckon";
const LANDING_TITLE = "MovieReckon: movie and TV recommendations built around you";
const LANDING_DESCRIPTION =
  "Pick the languages and genres you watch and MovieReckon recommends movies and series for you, then keeps learning from what you like, save and skip.";
const POSTER_BASE = "https://image.tmdb.org/t/p/w500";

interface StaticRoute {
  title: string;
  description: string;
  /** Public marketing/legal pages. Everything else stays out of search results. */
  indexable?: boolean;
}

const STATIC_ROUTES: Record<string, StaticRoute> = {
  "/about": { title: "About", description: "What MovieReckon is, how its recommendations work and where the data comes from.", indexable: true },
  "/faq": { title: "FAQ", description: "Answers about accounts, recommendations, watchlists and where to watch.", indexable: true },
  "/terms": { title: "Terms of Service", description: "The terms for using MovieReckon.", indexable: true },
  "/privacy": { title: "Privacy Policy", description: "How MovieReckon collects, uses and protects your data.", indexable: true },
  "/contact": { title: "Contact", description: "Get in touch with the MovieReckon team.", indexable: true },
  "/feedback": { title: "Feedback", description: "Tell us what to improve in MovieReckon." },
  "/auth": { title: "Sign in", description: "Sign in or create a MovieReckon account." },
  "/forgot-password": { title: "Forgot password", description: "Reset your MovieReckon password." },
  "/reset-password": { title: "Reset password", description: "Choose a new MovieReckon password." },
  "/verify-email": { title: "Verify email", description: "Confirm your MovieReckon email address." },
  "/home": { title: "Home", description: "Trending, new and recommended movies and series." },
  "/movies": { title: "Movies", description: "Browse movies by category, genre, year and language." },
  "/series": { title: "TV Series", description: "Browse series by category, platform, genre and language." },
  "/upcoming": { title: "Upcoming releases", description: "Release calendar for upcoming movies and series." },
  "/search": { title: "Search", description: "Search movies, TV shows and people." },
  "/reckon": { title: "Reckon", description: "Recommendations that learn from what you like." },
  "/reckon/preferences": { title: "Taste preferences", description: "Choose the languages and genres Reckon uses to build your feed." },
  "/profile": { title: "Profile", description: "Your watchlist, history and settings." },
  "/profile/edit": { title: "Edit profile", description: "Update your username and avatar." },
  "/theater": { title: "Theater", description: "The MovieReckon Theater catalogue." },
};

export interface DetailSummary {
  title: string;
  overview?: string | null;
  posterPath?: string | null;
  year?: string | null;
}

export interface DetailLoaders {
  movie?: (id: number) => Promise<DetailSummary | null>;
  tv?: (id: number) => Promise<DetailSummary | null>;
}

const NOINDEX = { index: false, follow: false } as const;

export function pathFromSlug(slug: string | string[] | undefined): string {
  const segments = (Array.isArray(slug) ? slug : slug ? [slug] : []).map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  });
  return segments.length ? `/${segments.join("/")}` : "/";
}

function clip(text: string | null | undefined, max = 180): string | undefined {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function landing(): Metadata {
  return {
    title: { absolute: LANDING_TITLE },
    description: LANDING_DESCRIPTION,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      images: [{ url: "/icon-512.png", width: 512, height: 512, alt: SITE_NAME }],
    },
    twitter: { card: "summary", title: LANDING_TITLE, description: LANDING_DESCRIPTION, images: ["/icon-512.png"] },
  };
}

async function detail(kind: "movie" | "tv", id: number, loaders: DetailLoaders): Promise<Metadata> {
  const fallbackTitle = kind === "movie" ? "Movie" : "TV series";
  let summary: DetailSummary | null = null;
  try {
    summary = (await loaders[kind]?.(id)) ?? null;
  } catch {
    summary = null; // A slow or failing TMDB must never break the page.
  }
  if (!summary?.title) return { title: fallbackTitle, robots: NOINDEX };

  const title = summary.year ? `${summary.title} (${summary.year})` : summary.title;
  const description = clip(summary.overview) ?? `Details, cast and where to watch ${summary.title}.`;
  const poster = summary.posterPath ? `${POSTER_BASE}${summary.posterPath}` : undefined;
  return {
    title,
    description,
    // Detail pages sit behind sign-in, so keep them out of search; link previews still work.
    robots: NOINDEX,
    openGraph: {
      type: kind === "movie" ? "video.movie" : "video.tv_show",
      siteName: SITE_NAME,
      title,
      description,
      ...(poster ? { images: [{ url: poster, alt: `${summary.title} poster` }] } : {}),
    },
    twitter: { card: poster ? "summary_large_image" : "summary", title, description, ...(poster ? { images: [poster] } : {}) },
  };
}

export async function buildRouteMetadata(pathname: string, loaders: DetailLoaders = {}): Promise<Metadata> {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/") return landing();

  const known = STATIC_ROUTES[path];
  if (known) {
    return {
      title: known.title,
      description: known.description,
      robots: known.indexable ? { index: true, follow: true } : NOINDEX,
      ...(known.indexable ? { alternates: { canonical: path } } : {}),
    };
  }

  const content = /^\/(movie|tv)\/(\d+)$/.exec(path);
  if (content) return detail(content[1] as "movie" | "tv", Number(content[2]), loaders);

  if (/^\/theater\/[^/]+(\/play)?$/.test(path)) return { title: "Theater", robots: NOINDEX };
  if (/^\/person\/\d+$/.test(path)) return { title: "Cast and crew", robots: NOINDEX };
  if (path.startsWith("/theater")) return { title: "Theater", robots: NOINDEX };

  return { title: "Page not found", robots: NOINDEX };
}
