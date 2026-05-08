import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Clapperboard,
  MapPin,
  Sparkles,
  Star,
  Tv,
  UserRound,
} from "lucide-react";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import MediaImage from "@/frontend/components/MediaImage";
import { Button } from "@/frontend/components/ui/button";
import { ScrollArea, ScrollBar } from "@/frontend/components/ui/scroll-area";
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

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDate(value?: string | null): string {
  const parsed = parseDate(value);
  if (!parsed) return value || "Unknown";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function calculateAge(birthday?: string | null, until?: string | null): number | null {
  const birth = parseDate(birthday);
  if (!birth) return null;

  const end = parseDate(until) || new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const monthDelta = end.getMonth() - birth.getMonth();
  const dayDelta = end.getDate() - birth.getDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function formatBornWithAge(birthday?: string | null, deathday?: string | null): string {
  if (!birthday) return "Unknown";
  const formatted = formatDate(birthday);
  const age = calculateAge(birthday, deathday);
  if (age === null) return formatted;
  if (deathday) return `${formatted} (${age} at passing)`;
  return `${formatted} (${age} years old)`;
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

function getKnownForScore(credit: WorkCredit): number {
  const ratingWeight = (credit.vote_average || 0) * 1000;
  const voteWeight = credit.vote_count || 0;
  const popularityWeight = credit.popularity || 0;
  const recencyWeight = getCreditDateValue(credit) / 1_000_000_000_000;
  return ratingWeight + voteWeight + popularityWeight + recencyWeight;
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
    <motion.button
      type="button"
      onClick={() => navigate(`/${credit.media_type}/${credit.id}`, { state: { from: fromPath } })}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className="group surface-panel p-2.5 text-left transition-colors duration-200 hover:border-primary/40 hover:bg-card/70 sm:p-3"
    >
      <div className="flex gap-2.5 sm:gap-3">
        <MediaImage
          src={getPosterUrl(credit.poster_path, "small")}
          alt={title}
          className="h-20 w-14 sm:h-24 sm:w-16 shrink-0 rounded-md object-cover bg-muted/30"
          fallbackSrc="/fallbacks/poster.svg"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] sm:text-sm font-semibold leading-tight group-hover:text-primary transition-colors">
            {title}
          </p>
          <div className="mt-1 flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-muted-foreground">
            {credit.media_type === "movie" ? (
              <Clapperboard className="h-3.5 w-3.5" />
            ) : (
              <Tv className="h-3.5 w-3.5" />
            )}
            <span>{credit.media_type === "movie" ? "Movie" : "TV Series"}</span>
            <span>•</span>
            <span>{getCreditYear(credit)}</span>
          </div>
          <p className="mt-1.5 sm:mt-2 line-clamp-2 text-[11px] sm:text-xs text-foreground/90">{roleLabel}</p>
          <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
            Rating: {credit.vote_average > 0 ? credit.vote_average.toFixed(1) : "N/A"}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

function KnownForCard({
  credit,
  fromPath,
}: {
  credit: WorkCredit;
  fromPath: string;
}) {
  const navigate = useNavigate();
  const title = getCreditTitle(credit);

  return (
    <motion.button
      type="button"
      onClick={() => navigate(`/${credit.media_type}/${credit.id}`, { state: { from: fromPath } })}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className="group w-32 sm:w-36 md:w-40 shrink-0 text-left"
    >
      <div className="overflow-hidden rounded-lg poster-card">
        <MediaImage
          src={getPosterUrl(credit.poster_path, "medium")}
          alt={title}
          className="aspect-[2/3] w-full object-cover bg-muted/30"
          fallbackSrc="/fallbacks/poster.svg"
        />
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium group-hover:text-primary transition-colors">
        {title}
      </p>
    </motion.button>
  );
}

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");

  const personId = Number(id);
  const currentPath = `${location.pathname}${location.search}${location.hash}`;

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
      [...(creditsData?.cast || [])].sort(
        (a, b) =>
          getCreditDateValue(b) - getCreditDateValue(a) ||
          (b.popularity || 0) - (a.popularity || 0),
      ),
    [creditsData],
  );

  const crewCredits = useMemo(
    () =>
      [...(creditsData?.crew || [])].sort(
        (a, b) =>
          getCreditDateValue(b) - getCreditDateValue(a) ||
          (b.popularity || 0) - (a.popularity || 0),
      ),
    [creditsData],
  );

  const knownForCredits = useMemo(() => {
    const combined = [...castCredits, ...crewCredits]
      .filter((credit) => credit.poster_path)
      .sort((a, b) => getKnownForScore(b) - getKnownForScore(a));

    const byMediaId = new Map<string, WorkCredit>();
    for (const credit of combined) {
      const key = `${credit.media_type}:${credit.id}`;
      if (!byMediaId.has(key)) {
        byMediaId.set(key, credit);
      }
    }

    return Array.from(byMediaId.values()).slice(0, 12);
  }, [castCredits, crewCredits]);

  const filteredCastCredits = useMemo(
    () => filterCreditsByMedia(castCredits, mediaFilter),
    [castCredits, mediaFilter],
  );
  const filteredCrewCredits = useMemo(
    () => filterCreditsByMedia(crewCredits, mediaFilter),
    [crewCredits, mediaFilter],
  );

  const bornWithAge = formatBornWithAge(person?.birthday, person?.deathday);
  const statusValue = person?.deathday ? `Deceased • ${formatDate(person.deathday)}` : "Alive";
  const profileImageSrc = getProfileUrl(person?.profile_path || null, "large");
  const biography = person?.biography?.trim() || "Biography is not available for this person.";
  const previousFrom = (location.state as { from?: string } | null)?.from;
  const safeFrom =
    typeof previousFrom === "string" && previousFrom.length > 0 && previousFrom !== currentPath
      ? previousFrom
      : null;

  const handleBack = () => {
    if (safeFrom) {
      navigate(safeFrom);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/home");
  };

  if (personLoading) {
    return (
      <div className="app-page">
        <Header />
        <div className="container mx-auto space-y-3 px-3 pt-24 sm:space-y-4 sm:px-4">
          <div className="h-12 w-14 animate-pulse rounded-full bg-muted" />
          <div className="h-72 animate-pulse rounded-2xl bg-muted" />
          <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="app-page pb-20 md:pb-0">
        <Header />
        <div className="flex min-h-screen items-center justify-center px-4 pt-24">
          <div className="empty-state max-w-md">
            <p className="text-xl text-muted-foreground mb-4">Person not found</p>
            <Button onClick={() => navigate("/home")} className="bg-primary hover:bg-primary/90">
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page pb-20 md:pb-0 overflow-x-hidden">
      <Header />

      <main className="pt-24">
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--primary)/0.18),transparent_38%),linear-gradient(to_bottom,hsl(var(--background)/0.78),hsl(var(--background)))]" />
          <div className="container relative mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
            <Button
              variant="ghost"
              onClick={handleBack}
              aria-label="Go back"
              className="mb-4 sm:mb-5 h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-border/70 bg-background/75 p-0 hover:bg-background"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <div className="grid gap-4 sm:gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="mx-auto w-full max-w-[210px] sm:max-w-[240px] xl:max-w-[280px]">
                <div className="surface-panel bg-gradient-to-b from-card/70 to-card/35 p-3">
                  <MediaImage
                    src={profileImageSrc}
                    alt={person.name}
                    className="aspect-[3/4] w-full rounded-2xl object-cover bg-muted/30"
                    fallbackSrc="/fallbacks/profile.svg"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Biography
                  </p>
                  <h1 className="mt-1 text-2xl sm:text-4xl font-bold tracking-tight">{person.name}</h1>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border/70 bg-card/70 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs text-foreground/90">
                    {person.known_for_department || "Department Unknown"}
                  </span>
                  <span className="rounded-full border border-border/70 bg-card/70 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs text-foreground/90">
                    Gender: {getGenderLabel(person.gender)}
                  </span>
                  <span className="rounded-full border border-border/70 bg-card/70 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs text-foreground/90">
                    Popularity: {person.popularity ? person.popularity.toFixed(1) : "N/A"}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-card/55 p-2.5 sm:p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      Born
                    </p>
                    <p className="mt-1 text-[13px] sm:text-sm font-semibold">{bornWithAge}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/55 p-2.5 sm:p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      Place of Birth
                    </p>
                    <p className="mt-1 text-[13px] sm:text-sm font-semibold">
                      {person.place_of_birth || "Unknown"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/55 p-2.5 sm:p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <UserRound className="h-4 w-4" />
                      Status
                    </p>
                    <p className="mt-1 text-[13px] sm:text-sm font-semibold">{statusValue}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/55 p-2.5 sm:p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <BriefcaseBusiness className="h-4 w-4" />
                      Known For
                    </p>
                    <p className="mt-1 text-[13px] sm:text-sm font-semibold">
                      {person.known_for_department || "Not specified"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card/45 p-4">
                  <h2 className="text-lg font-semibold mb-2">Biography</h2>
                  <p className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                    {biography}
                  </p>
                </div>

                {person.also_known_as?.length > 0 && (
                  <div className="rounded-2xl border border-border/70 bg-card/45 p-3 sm:p-4">
                    <h2 className="text-lg font-semibold mb-2">Also Known As</h2>
                    <div className="flex flex-wrap gap-2">
                      {person.also_known_as.map((alias) => (
                        <span
                          key={alias}
                          className="rounded-full border border-border/70 bg-background/60 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs text-foreground/90"
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

        {knownForCredits.length > 0 && (
          <section className="container mx-auto px-3 sm:px-4 pt-6 sm:pt-8">
            <h2 className="mb-3 flex items-center gap-2.5 text-xl font-bold sm:text-2xl">
              <span className="section-glass-icon" aria-hidden="true">
                <Sparkles className="h-4 w-4" />
              </span>
              Known For
            </h2>
            <ScrollArea className="w-full">
              <div className="flex gap-4 pb-3 pr-2">
                {knownForCredits.map((credit) => (
                  <KnownForCard
                    key={`${credit.media_type}:${credit.id}`}
                    credit={credit}
                    fromPath={currentPath}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </section>
        )}

        <section className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Filmography</h2>
              <p className="text-sm text-muted-foreground">
                Complete credits fetched from TMDB API.
              </p>
            </div>
            <div className="filter-panel mb-0 inline-flex p-1">
              {(["all", "movie", "tv"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setMediaFilter(filter)}
                  className={cn(
                    "filter-chip",
                    mediaFilter === filter
                      ? "filter-chip-active"
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
                      fromPath={currentPath}
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
                      fromPath={currentPath}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
