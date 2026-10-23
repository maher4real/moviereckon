import { useMemo, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  getMovieDetails,
  getMovieCredits,
  getMovieReleaseDates,
  getMovieVideos,
  getMovieKeywords,
  getSimilarMovies,
  getMovieWatchProviders,
  getPosterUrl,
  getLanguageLabel,
  Cast,
  MovieKeyword,
  Movie,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import WhereToWatch from "@/frontend/components/WhereToWatch";
import CastList from "@/frontend/components/CastList";
import DeferredWatchSources from "@/frontend/components/DeferredWatchSources";
import { DetailSkeleton } from "@/frontend/components/PageSkeletons";
import { Button } from "@/frontend/components/ui/button";
import {
  Calendar,
  Clock,
  DollarSign,
  Globe,
  CircleDollarSign,
  Star,
  Tag,
  BadgeCheck,
  AlignLeft,
  Clapperboard,
  PenLine,
  Users,
} from "lucide-react";
import { DetailSection, DetailSectionNav, FactsPanel, MetaChip } from "@/frontend/components/detail/DetailLayout";
import { DetailActions, DetailPoster, DetailTitle } from "@/frontend/components/detail/DetailHeader";
import { DetailHero, TrailerDialog } from "@/frontend/components/detail/DetailHero";
import { useDetailLibrary } from "./useDetailLibrary";
import { useDetailMedia } from "./useDetailMedia";
import {
  LazyCommentsSection,
  MemoizedCarousel,
  } from "./detailShared";

const MOVIE_WRITER_JOBS = new Set(["Writer", "Screenplay", "Story", "Novel"]);
const MOVIE_PRODUCER_JOBS = new Set(["Producer", "Executive Producer"]);

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useAuth();

  const movieId = Number(id);


  // Fetch movie details
  const { data: movie, isLoading: movieLoading, isError: movieError } = useQuery({
    queryKey: ["movie", movieId],
    queryFn: () => getMovieDetails(movieId),
    enabled: !!movieId,
    retry: 2,
  });

  // Fetch credits
  const { data: creditsData } = useQuery({
    queryKey: ["movie-credits", movieId],
    queryFn: () => getMovieCredits(movieId),
    enabled: !!movieId,
  });

  // Fetch videos
  const { data: videosData } = useQuery({
    queryKey: ["movie-videos", movieId],
    queryFn: () => getMovieVideos(movieId),
    enabled: !!movieId,
  });

  // Fetch similar movies
  const { data: similarData, isLoading: similarLoading } = useQuery({
    queryKey: ["similar-movies", movieId],
    queryFn: () => getSimilarMovies(movieId),
    enabled: !!movieId,
  });

  // Fetch watch providers (IN region for India)
  const { data: watchProvidersData } = useQuery({
    queryKey: ["movie-watch-providers", movieId],
    queryFn: () => getMovieWatchProviders(movieId),
    enabled: !!movieId,
  });

  const { data: releaseDatesData } = useQuery({
    queryKey: ["movie-release-dates", movieId],
    queryFn: () => getMovieReleaseDates(movieId),
    enabled: !!movieId,
  });

  const { data: keywords = [] } = useQuery<MovieKeyword[]>({
    queryKey: ["movie-keywords", movieId],
    queryFn: () => getMovieKeywords(movieId),
    enabled: !!movieId,
    staleTime: 1000 * 60 * 30,
  });

  const cast = useMemo(
    () => [...(creditsData?.cast || [])].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)),
    [creditsData],
  );
  const crew = useMemo(
    () =>
      [...(creditsData?.crew || [])].sort(
        (a, b) =>
          a.department.localeCompare(b.department) ||
          a.job.localeCompare(b.job) ||
          a.name.localeCompare(b.name),
      ),
    [creditsData],
  );
  const crewAsCast = useMemo<Cast[]>(
    () =>
      crew.map((member, index) => {
        const role =
          member.job && member.department && member.department !== member.job
            ? `${member.job} • ${member.department}`
            : member.job || member.department || "Crew";

        return {
          id: member.id,
          name: member.name,
          character: role,
          profile_path: member.profile_path,
          order: index,
        };
      }),
    [crew],
  );

  const crewSummary = useMemo(() => {
    const directors: string[] = [];
    const writers: string[] = [];
    const producers: string[] = [];
    const seenDirectors = new Set<string>();
    const seenWriters = new Set<string>();
    const seenProducers = new Set<string>();

    for (const member of crew) {
      const name = member.name;

      if (member.job === "Director" && !seenDirectors.has(name)) {
        seenDirectors.add(name);
        directors.push(name);
      }

      if (MOVIE_WRITER_JOBS.has(member.job) && !seenWriters.has(name)) {
        seenWriters.add(name);
        writers.push(name);
      }

      if (MOVIE_PRODUCER_JOBS.has(member.job) && !seenProducers.has(name)) {
        seenProducers.add(name);
        producers.push(name);
      }
    }

    return {
      directors: directors.slice(0, 3),
      writers: writers.slice(0, 4),
      producers: producers.slice(0, 4),
    };
  }, [crew]);
  const { directors, writers, producers } = crewSummary;

  const certification = useMemo(() => {
    const preferredRegions = ["US", "GB", "CA", "AU", "IN"];
    const results = releaseDatesData?.results || [];
    const certificationsByRegion = new Map<string, string>();
    let fallbackCertification: string | null = null;

    for (const region of results) {
      let regionCertification: string | null = null;

      for (const release of region.release_dates) {
        const certificationValue = release.certification?.trim();
        if (!certificationValue) continue;
        regionCertification = certificationValue;
        break;
      }

      if (!regionCertification) continue;
      if (fallbackCertification === null) {
        fallbackCertification = regionCertification;
      }
      certificationsByRegion.set(region.iso_3166_1, regionCertification);
    }

    for (const regionCode of preferredRegions) {
      const value = certificationsByRegion.get(regionCode);
      if (value) return value;
    }

    return fallbackCertification;
  }, [releaseDatesData]);
  const media = useDetailMedia(movieId, videosData);
  const { trailerModalKey, communitySectionRef, shouldRenderCommunity, openTrailerModal } = media;
  const libraryTitle = useMemo(
    () => movie ? {
      id: movie.id,
      contentType: "movie" as const,
      title: movie.title,
      posterPath: movie.poster_path,
      genreIds: movie.genres.map((genre) => genre.id),
      language: movie.original_language,
    } : null,
    [movie],
  );
  const library = useDetailLibrary(movieId, "movie", libraryTitle);

  // Get providers for IN (India) or US as fallback
  const providers = watchProvidersData?.results?.IN || watchProvidersData?.results?.US || null;
  const watchLink = providers?.link;

  const formatRuntime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatReleaseDate = (date: string): string => {
    if (!date) return "N/A";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatMoney = (amount: number): string => {
    if (!amount || amount <= 0) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (movieLoading) {
    return <DetailSkeleton />;
  }

  if (movieError || !movie) {
    return (
      <div className="app-page pb-20 md:pb-0">
        <Header />
        <div className="flex min-h-screen items-center justify-center px-4 pt-24">
          <div className="empty-state max-w-md">
            <p className="text-xl text-muted-foreground mb-2">
              {movieError ? "Failed to load movie" : "Movie not found"}
            </p>
            {movieError && (
              <p className="text-sm text-muted-foreground mb-4">Check your connection and try again.</p>
            )}
            <Button onClick={() => navigate(-1)} className="brand-primary-button">
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const year = movie.release_date?.split("-")[0] || "";
  const languageLabel = getLanguageLabel(movie.original_language);
  const releasedAt = formatReleaseDate(movie.release_date);
  const detailRows = [
    { label: "Director", value: directors.join(", "), icon: Clapperboard },
    { label: "Writer", value: writers.join(", "), icon: PenLine },
    { label: "Producer", value: producers.slice(0, 4).join(", "), icon: Users },
    { label: "Status", value: movie.status, icon: BadgeCheck },
    { label: "Released", value: releasedAt, icon: Calendar },
    { label: "Original language", value: languageLabel, icon: Globe },
    { label: "Budget", value: movie.budget > 0 ? formatMoney(movie.budget) : "", icon: DollarSign },
    { label: "Revenue", value: movie.revenue > 0 ? formatMoney(movie.revenue) : "", icon: CircleDollarSign },
  ];
  const sectionLinks = [
    { id: "overview", label: "Overview" },
    { id: "watch", label: "Where to watch" },
    ...(cast.length > 0 || crewAsCast.length > 0 ? [{ id: "cast", label: "Cast & crew" }] : []),
    { id: "reviews", label: "Reviews" },
    ...(similarData && similarData.results.length > 0 ? [{ id: "similar", label: "More like this" }] : []),
  ];
    const sharePageUrl =
    typeof window === "undefined"
      ? `/movie/${movie.id}`
      : `${window.location.origin}/movie/${movie.id}`;
  const posterShareUrl = getPosterUrl(movie.poster_path, "large");
  const shareDetails = {
    contentType: "movie" as const,
    title: movie.title,
    year,
    overview: movie.overview,
    rating: movie.vote_average,
    genres: movie.genres.map((genre) => genre.name),
    posterUrl: posterShareUrl,
    pageUrl: sharePageUrl,
  };

  return (
    <div className="app-page pb-20 md:pb-0 overflow-x-hidden">
      <Header />

      <DetailHero media={media} title={movie.title} backdropPath={movie.backdrop_path} />

      {/* Content */}
      <div className="detail-content-shell container mx-auto px-4 relative z-10 pb-10">
        <div className="detail-header flex flex-col gap-6 md:flex-row lg:gap-8">
          <DetailPoster title={movie.title} posterPath={movie.poster_path} />

          <div className="flex-1 min-w-0">
            <DetailTitle title={movie.title} tagline={movie.tagline} posterPath={movie.poster_path} share={shareDetails} />

            {/* Meta Info */}
            <div className="detail-metadata mb-4">
              <div className="flex flex-wrap gap-2">
                {movie.vote_average > 0 && (
                  <MetaChip icon={Star} tone="rating">
                    {movie.vote_average.toFixed(1)}<span className="text-white/50">/10 TMDB</span>
                  </MetaChip>
                )}
                {certification && <MetaChip icon={BadgeCheck} tone="accent">{certification}</MetaChip>}
                <MetaChip icon={Calendar}>{year || "TBA"}</MetaChip>
                {movie.runtime > 0 && <MetaChip icon={Clock}>{formatRuntime(movie.runtime)}</MetaChip>}
                <MetaChip icon={Globe}>{languageLabel}</MetaChip>
              </div>

              {movie.genres.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Genres">
                  {movie.genres.map((genre) => (
                    <li key={genre.id}>
                      <a href={`/movies?genre=${genre.id}`} onClick={(event) => { event.preventDefault(); navigate(`/movies?genre=${genre.id}`); }} className="detail-genre-link">{genre.name}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DetailActions
              library={library}
              hasTrailer={Boolean(trailerModalKey)}
              onTrailer={openTrailerModal}
              reaction={{
                contentId: movie.id,
                contentType: "movie",
                title: movie.title,
                posterPath: movie.poster_path,
                genres: movie.genres.map((genre) => genre.id),
                language: movie.original_language,
              }}
            />
          </div>
        </div>

        <DetailSectionNav sections={sectionLinks} />

        <div className="grid grid-cols-1 gap-6 md:gap-8">
          <DetailSection id="overview" title="Overview" icon={AlignLeft}>
            <div className="grid grid-cols-1 gap-5 md:gap-6">
              <div className="min-w-0">
                <p className="max-w-[72ch] whitespace-pre-wrap break-words text-base leading-7 text-foreground/80">
                  {movie.overview || "No overview available."}
                </p>
                {keywords.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Tag className="size-4" aria-hidden="true" />Keywords
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                      {keywords.map((keyword) => (
                        <li key={keyword.id} className="rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-foreground/90">{keyword.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <FactsPanel rows={detailRows} />
            </div>
          </DetailSection>

          <div id="watch" className="detail-section grid grid-cols-1 gap-4">
            <WhereToWatch providers={providers} link={watchLink} />
            <DeferredWatchSources contentId={movie.id} contentType="movie" title={movie.title} />
          </div>

          {(cast.length > 0 || crewAsCast.length > 0) && (
            <div id="cast" className="detail-section grid grid-cols-1 gap-6">
              <CastList cast={cast} title="Cast" />
              <CastList cast={crewAsCast} title="Crew" />
            </div>
          )}

          <div id="reviews" className="detail-section [&>section]:mt-0">
            <div ref={communitySectionRef} className="h-px" />
            {shouldRenderCommunity ? (
              <Suspense fallback={<div className="detail-skeleton-card" />}>
                <LazyCommentsSection
                  contentId={movie.id}
                  contentType="movie"
                  title={movie.title}
                  posterPath={movie.poster_path}
                  genres={movie.genres.map((genre) => genre.id)}
                  language={movie.original_language}
                  voteAverage={movie.vote_average}
                  voteCount={movie.vote_count}
                />
              </Suspense>
            ) : (
              <div className="detail-skeleton-card" />
            )}
          </div>

          {similarData && similarData.results.length > 0 && (
            <div id="similar" className="detail-section -mx-4 sm:mx-0">
              <MemoizedCarousel
                title="More like this"
                items={similarData.results as Movie[]}
                isLoading={similarLoading}
                type="movie"
                viewAllHref="/movies"
                />
            </div>
          )}
        </div>
      </div>

      <TrailerDialog media={media} title={movie.title} />

      <Footer />
    </div>
  );
}
