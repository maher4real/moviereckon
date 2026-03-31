import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Clapperboard,
  Globe,
  MapPin,
  Star,
  Tv,
  UserRound,
} from "lucide-react";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  getPersonCombinedCredits,
  getPersonDetails,
  getPosterUrl,
  getProfileUrl,
  type PersonCombinedCastCredit,
  type PersonCombinedCrewCredit,
} from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

type MediaFilter = "all" | "movie" | "tv";
type WorkCredit = PersonCombinedCastCredit | PersonCombinedCrewCredit;

function formatDate(value?: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getCreditDateValue(credit: WorkCredit): number {
  const rawDate = credit.release_date || credit.first_air_date || "";
  const parsed = Date.parse(rawDate);
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

function getCreditTitle(credit: WorkCredit): string {
  return credit.title || credit.name || "Untitled";
}

function getCreditYear(credit: WorkCredit): string {
  const rawDate = credit.release_date || credit.first_air_date || "";
  return rawDate.split("-")[0] || "TBA";
}

function getGenderLabel(gender: number): string {
  if (gender === 1) return "Female";
  if (gender === 2) return "Male";
  if (gender === 3) return "Non-binary";
  return "Not specified";
}

function filterCreditsByMedia<T extends WorkCredit>(credits: T[], mediaFilter: MediaFilter): T[] {
  if (mediaFilter === "all") return credits;
  return credits.filter((credit) => credit.media_type === mediaFilter);
}

function buildCrewRoleLabel(credit: PersonCombinedCrewCredit): string {
  if (credit.job && credit.department && credit.job !== credit.department) {
    return `${credit.job} • ${credit.department}`;
  }
  return credit.job || credit.department || "Crew";
}

function WorkCard({
  credit,
  roleLabel,
  fromPath,
}: {
  credit: WorkCredit;
  roleLabel: string;
  fromPath: string;
}) {
  const navigate = useNavigate();
  const title = getCreditTitle(credit);

  return (
    <button
      type="button"
      onClick={() => navigate(`/${credit.media_type}/${credit.id}`, { state: { from: fromPath } })}
      className="group rounded-xl border border-border/70 bg-card/45 p-3 text-left transition-all duration-300 hover:border-primary/40 hover:bg-card/70"
    >
      <div className="flex gap-3">
        <MediaImage
          src={getPosterUrl(credit.poster_path, "small")}
          alt={title}
          className="h-24 w-16 shrink-0 rounded-md object-cover bg-muted/30"
          fallbackSrc="/fallbacks/poster.svg"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-tight group-hover:text-primary transition-colors">
            {title}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {credit.media_type === "movie" ? (
              <Clapperboard className="h-3.5 w-3.5" />
            ) : (
              <Tv className="h-3.5 w-3.5" />
            )}
            <span>{credit.media_type === "movie" ? "Movie" : "TV Series"}</span>
            <span>•</span>
            <span>{getCreditYear(credit)}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs text-foreground/90">{roleLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Rating: {credit.vote_average > 0 ? credit.vote_average.toFixed(1) : "N/A"}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");

  const personId = Number(id);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [authLoading, navigate, user]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [personId]);

  const { data: person, isLoading: personLoading } = useQuery({
    queryKey: ["person", personId],
    queryFn: () => getPersonDetails(personId),
    enabled: Number.isFinite(personId) && personId > 0,
  });

  const { data: creditsData } = useQuery({
    queryKey: ["person-combined-credits", personId],
    queryFn: () => getPersonCombinedCredits(personId),
    enabled: Number.isFinite(personId) && personId > 0,
  });

  const castCredits = useMemo(
    () =>
      [...(creditsData?.cast || [])]
        .sort(
          (a, b) =>
            getCreditDateValue(b) - getCreditDateValue(a) ||
            (b.popularity || 0) - (a.popularity || 0),
        ),
    [creditsData],
  );

  const crewCredits = useMemo(
    () =>
      [...(creditsData?.crew || [])]
        .sort(
          (a, b) =>
            getCreditDateValue(b) - getCreditDateValue(a) ||
            (b.popularity || 0) - (a.popularity || 0),
        ),
    [creditsData],
  );

  const filteredCastCredits = useMemo(
    () => filterCreditsByMedia(castCredits, mediaFilter),
    [castCredits, mediaFilter],
  );
  const filteredCrewCredits = useMemo(
    () => filterCreditsByMedia(crewCredits, mediaFilter),
    [crewCredits, mediaFilter],
  );

  const fromPath = `${location.pathname}${location.search}${location.hash}`;
  const birthDate = formatDate(person?.birthday);
  const deathDate = person?.deathday ? formatDate(person.deathday) : null;
  const profileImageSrc = getProfileUrl(person?.profile_path || null, "large");
  const biography = person?.biography?.trim() || "Biography is not available for this person.";

  const backDestination =
    (location.state as { from?: string } | null)?.from ||
    (typeof window !== "undefined" && window.history.length > 1 ? -1 : "/home");

  if (authLoading || personLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 container mx-auto px-4 space-y-4">
          <div className="h-12 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-72 animate-pulse rounded-2xl bg-muted" />
          <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-muted-foreground mb-4">Person not found</p>
          <Button onClick={() => navigate("/home")} className="bg-primary hover:bg-primary/90">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 overflow-x-hidden">
      <Header />

      <main className="pt-20">
        <section className="relative border-b border-border/60 bg-gradient-to-b from-primary/10 via-background to-background">
          <div className="container mx-auto px-4 py-6 md:py-8">
            <Button
              variant="ghost"
              onClick={() =>
                typeof backDestination === "number"
                  ? navigate(backDestination)
                  : navigate(backDestination)
              }
              className="mb-5 rounded-full border border-border/70 bg-background/70 px-4 hover:bg-background"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="mx-auto w-full max-w-[260px]">
                <MediaImage
                  src={profileImageSrc}
                  alt={person.name}
                  className="aspect-[3/4] w-full rounded-2xl border border-border/70 object-cover bg-muted/30 shadow-2xl"
                  fallbackSrc="/fallbacks/profile.svg"
                />
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Biography
                  </p>
                  <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">{person.name}</h1>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-foreground/90">
                    {person.known_for_department || "Department Unknown"}
                  </span>
                  <span className="rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-foreground/90">
                    Gender: {getGenderLabel(person.gender)}
                  </span>
                  <span className="rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-foreground/90">
                    Popularity: {person.popularity ? person.popularity.toFixed(1) : "N/A"}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-card/50 p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      Born
                    </p>
                    <p className="mt-1 text-sm font-semibold">{birthDate}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/50 p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      Place of Birth
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {person.place_of_birth || "Unknown"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/50 p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <UserRound className="h-4 w-4" />
                      Died
                    </p>
                    <p className="mt-1 text-sm font-semibold">{deathDate || "Alive"}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/50 p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Globe className="h-4 w-4" />
                      IMDb
                    </p>
                    <p className="mt-1 text-sm font-semibold break-all">
                      {person.imdb_id || "Unavailable"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card/45 p-4">
                  <h2 className="text-lg font-semibold mb-2">Biography</h2>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                    {biography}
                  </p>
                </div>

                {person.also_known_as?.length > 0 && (
                  <div className="rounded-2xl border border-border/70 bg-card/45 p-4">
                    <h2 className="text-lg font-semibold mb-2">Also Known As</h2>
                    <div className="flex flex-wrap gap-2">
                      {person.also_known_as.map((alias) => (
                        <span
                          key={alias}
                          className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-foreground/90"
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Filmography</h2>
              <p className="text-sm text-muted-foreground">
                Complete credits fetched from TMDB API.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-border/70 bg-card/55 p-1">
              {(["all", "movie", "tv"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setMediaFilter(filter)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                    mediaFilter === filter
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter === "all" ? "All" : filter === "movie" ? "Movies" : "TV"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <Star className="h-4 w-4 text-primary" />
                Cast Credits ({filteredCastCredits.length})
              </h3>
              {filteredCastCredits.length === 0 ? (
                <p className="rounded-xl border border-border/70 bg-card/45 p-4 text-sm text-muted-foreground">
                  No cast credits found for this filter.
                </p>
              ) : (
                <div className="grid gap-3">
                  {filteredCastCredits.map((credit) => (
                    <WorkCard
                      key={credit.credit_id}
                      credit={credit}
                      roleLabel={credit.character || "Character not specified"}
                      fromPath={fromPath}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <BriefcaseBusiness className="h-4 w-4 text-primary" />
                Crew Credits ({filteredCrewCredits.length})
              </h3>
              {filteredCrewCredits.length === 0 ? (
                <p className="rounded-xl border border-border/70 bg-card/45 p-4 text-sm text-muted-foreground">
                  No crew credits found for this filter.
                </p>
              ) : (
                <div className="grid gap-3">
                  {filteredCrewCredits.map((credit) => (
                    <WorkCard
                      key={credit.credit_id}
                      credit={credit}
                      roleLabel={buildCrewRoleLabel(credit)}
                      fromPath={fromPath}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
