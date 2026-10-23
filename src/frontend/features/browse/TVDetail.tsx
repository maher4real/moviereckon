import { useEffect, useMemo, useState, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  getTVShowDetails,
  getTVShowCredits,
  getTVShowVideos,
  getTVShowKeywords,
  getSimilarTVShows,
  getTVSeasonDetails,
  getTVWatchProviders,
  getPosterUrl,
  getStillUrl,
  getLanguageLabel,
  Cast,
  MovieKeyword,
  TVShow,
  Episode,
} from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import WhereToWatch from "@/frontend/components/WhereToWatch";
import CastList from "@/frontend/components/CastList";
import MediaImage from "@/frontend/components/MediaImage";
import DeferredWatchSources from "@/frontend/components/DeferredWatchSources";
import { DetailSkeleton } from "@/frontend/components/PageSkeletons";
import { Button } from "@/frontend/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/frontend/components/ui/tabs";
import {
  Star,
  Calendar,
  Globe,
  Tv,
  Clock,
  Tag,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  AlignLeft,
  Clapperboard,
  ListVideo,
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
import { Skeleton } from "@/frontend/components/ui/skeleton";

const TV_WRITER_JOBS = new Set([
  "Writer",
  "Screenplay",
  "Story",
  "Novel",
  "Teleplay",
  "Script Editor",
]);
const TV_PRODUCER_JOBS = new Set([
  "Producer",
  "Executive Producer",
  "Co-Executive Producer",
]);

export default function TVDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useAuth();
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);

  const tvId = Number(id);


  // Fetch TV show details
  const { data: tvShow, isLoading: tvLoading, isError: tvError } = useQuery({
    queryKey: ["tv", tvId],
    queryFn: () => getTVShowDetails(tvId),
    enabled: !!tvId,
    retry: 2,
  });

  // Fetch credits
  const { data: creditsData } = useQuery({
    queryKey: ["tv-credits", tvId],
    queryFn: () => getTVShowCredits(tvId),
    enabled: !!tvId,
  });

  // Fetch videos
  const { data: videosData } = useQuery({
    queryKey: ["tv-videos", tvId],
    queryFn: () => getTVShowVideos(tvId),
    enabled: !!tvId,
  });

  // Fetch similar TV shows
  const { data: similarData, isLoading: similarLoading } = useQuery({
    queryKey: ["similar-tv", tvId],
    queryFn: () => getSimilarTVShows(tvId),
    enabled: !!tvId,
  });

  // Fetch season details
  const { data: seasonData, isLoading: seasonLoading } = useQuery({
    queryKey: ["tv-season", tvId, selectedSeason],
    queryFn: () => getTVSeasonDetails(tvId, selectedSeason),
    enabled: !!tvId && selectedSeason > 0,
  });

  // Fetch watch providers
  const { data: watchProvidersData } = useQuery({
    queryKey: ["tv-watch-providers", tvId],
    queryFn: () => getTVWatchProviders(tvId),
    enabled: !!tvId,
  });

  const { data: keywords = [] } = useQuery<MovieKeyword[]>({
    queryKey: ["tv-keywords", tvId],
    queryFn: () => getTVShowKeywords(tvId),
    enabled: !!tvId,
    staleTime: 1000 * 60 * 30,
  });

  // Update selected season when TV show loads
  useEffect(() => {
    const availableSeasons = tvShow?.seasons?.filter((s) => s.season_number > 0) ?? [];
    if (availableSeasons.length === 0) return;

    setSelectedSeason((currentSeason) => {
      if (availableSeasons.some((season) => season.season_number === currentSeason)) {
        return currentSeason;
      }
      return availableSeasons[0].season_number;
    });
  }, [tvShow]);

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
    const fallbackCreators: string[] = [];
    const writers: string[] = [];
    const producers: string[] = [];
    const seenCreators = new Set<string>();
    const seenWriters = new Set<string>();
    const seenProducers = new Set<string>();

    for (const member of crew) {
      const name = member.name;

      if (member.job === "Creator" && !seenCreators.has(name)) {
        seenCreators.add(name);
        fallbackCreators.push(name);
      }

      if (TV_WRITER_JOBS.has(member.job) && !seenWriters.has(name)) {
        seenWriters.add(name);
        writers.push(name);
      }

      if (TV_PRODUCER_JOBS.has(member.job) && !seenProducers.has(name)) {
        seenProducers.add(name);
        producers.push(name);
      }
    }

    const createdByNames: string[] = [];
    const seenCreatedBy = new Set<string>();
    for (const member of tvShow?.created_by || []) {
      const name = member.name?.trim();
      if (!name || seenCreatedBy.has(name)) continue;
      seenCreatedBy.add(name);
      createdByNames.push(name);
    }

    return {
      creators: (createdByNames.length > 0 ? createdByNames : fallbackCreators).slice(0, 3),
      writers: writers.slice(0, 4),
      producers: producers.slice(0, 4),
    };
  }, [crew, tvShow]);
  const { creators, writers, producers } = crewSummary;
  const media = useDetailMedia(tvId, videosData);
  const { trailerModalKey, communitySectionRef, shouldRenderCommunity, openTrailerModal } = media;
  const libraryTitle = useMemo(
    () => tvShow ? {
      id: tvShow.id,
      contentType: "tv" as const,
      title: tvShow.name,
      posterPath: tvShow.poster_path,
      genreIds: tvShow.genres.map((genre) => genre.id),
      language: tvShow.original_language,
    } : null,
    [tvShow],
  );
  const library = useDetailLibrary(tvId, "tv", libraryTitle);

  // Filter out "Specials" (season 0) from seasons list
  const seasons = tvShow?.seasons?.filter((s) => s.season_number > 0) || [];

  // Get providers for IN (India) or US as fallback
  const providers = watchProvidersData?.results?.IN || watchProvidersData?.results?.US || null;
  const watchLink = providers?.link;

  const formatRuntime = (minutes: number | null): string => {
    if (!minutes) return "";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatFirstAirDate = (date: string): string => {
    if (!date) return "N/A";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  if (tvLoading) {
    return <DetailSkeleton />;
  }

  if (tvError || !tvShow) {
    return (
      <div className="app-page pb-20 md:pb-0">
        <Header />
        <div className="flex min-h-screen items-center justify-center px-4 pt-24">
          <div className="empty-state max-w-md">
            <p className="text-xl text-muted-foreground mb-2">
              {tvError ? "Failed to load TV show" : "TV Show not found"}
            </p>
            {tvError && (
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

  const year = tvShow.first_air_date?.split("-")[0] || "";
  const languageLabel = getLanguageLabel(tvShow.original_language);
  const firstAired = formatFirstAirDate(tvShow.first_air_date);
  const averageRuntime = tvShow.episode_run_time?.[0] ?? null;
  const runtimeLabel = averageRuntime ? formatRuntime(averageRuntime) : "N/A";
  const detailRows = [
    { label: "Created by", value: creators.join(", "), icon: Clapperboard },
    { label: "Writer", value: writers.slice(0, 4).join(", "), icon: PenLine },
    { label: "Producer", value: producers.slice(0, 4).join(", "), icon: Users },
    { label: "Status", value: tvShow.status, icon: BadgeCheck },
    { label: "First aired", value: firstAired, icon: Calendar },
    { label: "Type", value: tvShow.type, icon: Tv },
    { label: "Seasons", value: tvShow.number_of_seasons > 0 ? String(tvShow.number_of_seasons) : "", icon: Tv },
    { label: "Episodes", value: tvShow.number_of_episodes > 0 ? String(tvShow.number_of_episodes) : "", icon: ListVideo },
    { label: "Episode runtime", value: averageRuntime ? runtimeLabel : "", icon: Clock },
    { label: "Original language", value: languageLabel, icon: Globe },
  ];
  const sectionLinks = [
    { id: "overview", label: "Overview" },
    { id: "watch", label: "Where to watch" },
    ...(seasons.length > 0 ? [{ id: "episodes", label: "Episodes" }] : []),
    ...(cast.length > 0 || crewAsCast.length > 0 ? [{ id: "cast", label: "Cast & crew" }] : []),
    { id: "reviews", label: "Reviews" },
    ...(similarData && similarData.results.length > 0 ? [{ id: "similar", label: "More like this" }] : []),
  ];
  const sharePageUrl =
    typeof window === "undefined"
      ? `/tv/${tvShow.id}`
      : `${window.location.origin}/tv/${tvShow.id}`;
  const posterShareUrl = getPosterUrl(tvShow.poster_path, "large");
  const shareDetails = {
    contentType: "tv" as const,
    title: tvShow.name,
    year,
    overview: tvShow.overview,
    rating: tvShow.vote_average,
    genres: tvShow.genres.map((genre) => genre.name),
    posterUrl: posterShareUrl,
    pageUrl: sharePageUrl,
  };

  return (
    <div className="app-page pb-20 md:pb-0 overflow-x-hidden">
      <Header />

      <DetailHero media={media} title={tvShow.name} backdropPath={tvShow.backdrop_path} />

      {/* Content */}
      <div className="detail-content-shell container mx-auto px-4 relative z-10 pb-10">
        <div className="detail-header flex flex-col gap-6 md:flex-row lg:gap-8">
          <DetailPoster title={tvShow.name} posterPath={tvShow.poster_path} />

          <div className="flex-1 min-w-0">
            <DetailTitle title={tvShow.name} tagline={tvShow.tagline} posterPath={tvShow.poster_path} share={shareDetails} />

            {/* Meta Info */}
            <div className="detail-metadata mb-4">
              <div className="flex flex-wrap gap-2">
                {tvShow.vote_average > 0 && (
                  <MetaChip icon={Star} tone="rating">
                    {tvShow.vote_average.toFixed(1)}<span className="text-white/50">/10 TMDB</span>
                  </MetaChip>
                )}
                {tvShow.status && <MetaChip icon={BadgeCheck} tone="accent">{tvShow.status}</MetaChip>}
                <MetaChip icon={Calendar}>{year || "TBA"}</MetaChip>
                {tvShow.number_of_seasons > 0 && (
                  <MetaChip icon={Tv}>{tvShow.number_of_seasons} season{tvShow.number_of_seasons !== 1 ? "s" : ""}</MetaChip>
                )}
                {averageRuntime && <MetaChip icon={Clock}>{runtimeLabel}</MetaChip>}
                <MetaChip icon={Globe}>{languageLabel}</MetaChip>
              </div>

              {tvShow.genres.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Genres">
                  {tvShow.genres.map((genre) => (
                    <li key={genre.id}>
                      <a href={`/series?genre=${genre.id}`} onClick={(event) => { event.preventDefault(); navigate(`/series?genre=${genre.id}`); }} className="detail-genre-link">{genre.name}</a>
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
                contentId: tvShow.id,
                contentType: "tv",
                title: tvShow.name,
                posterPath: tvShow.poster_path,
                genres: tvShow.genres.map((genre) => genre.id),
                language: tvShow.original_language,
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
                  {tvShow.overview || "No overview available."}
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
            <DeferredWatchSources contentId={tvShow.id} contentType="tv" title={tvShow.name} />
          </div>

          {seasons.length > 0 && (
            <DetailSection id="episodes" title="Episodes" icon={ListVideo}>
                {/* Season Tabs */}
                <Tabs
                  value={String(selectedSeason)}
                  onValueChange={(value) => setSelectedSeason(Number(value))}
                >
                  <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 mb-4">
                    <TabsList className="inline-flex h-auto w-auto gap-1 rounded-full border border-white/10 bg-card/70 p-1">
                      {seasons.map((season) => (
                        <TabsTrigger key={season.season_number} value={String(season.season_number)} className="min-h-11 rounded-full px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                          Season {season.season_number}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  {seasons.map((season) => (
                    <TabsContent key={season.season_number} value={String(season.season_number)}>
                      <DeferredWatchSources contentId={tvShow.id} contentType="tv" title={tvShow.name}
                        variant="season" season={season.season_number} />
                      {seasonLoading && selectedSeason === season.season_number ? (
                        <div className="space-y-3" role="status" aria-busy="true">
                          <span className="sr-only">Loading episodes</span>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="skeleton-surface flex gap-4 p-4" aria-hidden="true">
                              <Skeleton className="h-20 w-32 shrink-0 rounded sm:h-24 sm:w-40" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-1/2" />
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-3/4" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {seasonData?.episodes?.map((episode: Episode) => (
                            <div
                              key={episode.id}
                              className="tv-episode-card"
                            >
                              <button
                                type="button"
                                className="flex w-full gap-4 p-4 text-left"
                                aria-expanded={expandedEpisode === episode.id}
                                onClick={() =>
                                  setExpandedEpisode(
                                    expandedEpisode === episode.id ? null : episode.id
                                  )
                                }
                              >
                                {/* Episode Thumbnail */}
                                <div className="relative flex-shrink-0">
                                  <MediaImage
                                    src={getStillUrl(episode.still_path)}
                                    alt={episode.name}
                                    className="w-32 sm:w-40 h-20 sm:h-24 object-cover rounded"
                                    loading="lazy"
                                    fallbackSrc="/fallbacks/still.svg"
                                  />
                                  {episode.runtime && (
                                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-background/80 rounded text-xs flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatRuntime(episode.runtime)}
                                    </div>
                                  )}
                                </div>

                                {/* Episode Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <h3 className="font-medium text-sm sm:text-base">
                                        E{episode.episode_number}. {episode.name}
                                      </h3>
                                      {episode.air_date && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {new Date(episode.air_date).toLocaleDateString("en-US", {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric",
                                          })}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {episode.vote_average > 0 && (
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Star className="size-3 fill-current text-[hsl(var(--rating-gold))]" />
                                          {episode.vote_average.toFixed(1)}
                                        </div>
                                      )}
                                      {expandedEpisode === episode.id ? (
                                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-xs sm:text-sm text-muted-foreground mt-2 line-clamp-2">
                                    {episode.overview || "No description available."}
                                  </p>
                                </div>
                              </button>

                              <DeferredWatchSources contentId={tvShow.id} contentType="tv" title={tvShow.name}
                                variant="episode" season={season.season_number} episode={episode.episode_number} />

                              {/* Expanded Overview */}
                              {expandedEpisode === episode.id && episode.overview && (
                                <div className="px-4 pb-4 pt-0">
                                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                                    {episode.overview}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
            </DetailSection>
          )}

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
                  contentId={tvShow.id}
                  contentType="tv"
                  title={tvShow.name}
                  posterPath={tvShow.poster_path}
                  genres={tvShow.genres.map((genre) => genre.id)}
                  language={tvShow.original_language}
                  voteAverage={tvShow.vote_average}
                  voteCount={tvShow.vote_count}
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
                items={similarData.results as TVShow[]}
                isLoading={similarLoading}
                type="tv"
                viewAllHref="/series"
                />
            </div>
          )}
        </div>
      </div>

      <TrailerDialog media={media} title={tvShow.name} />

      <Footer />
    </div>
  );
}
