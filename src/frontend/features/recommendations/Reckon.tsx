import { useState, useMemo, useEffect, memo, useRef, useCallback } from "react";
import { useRecommendations } from "@/frontend/hooks/useRecommendations";
import { useUserData } from "@/frontend/hooks/useUserData";
import { Movie, TVShow } from "@/shared/lib/tmdb";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import BottomNav from "@/frontend/components/BottomNav";
import { PosterGridSkeleton } from "@/frontend/components/AppSkeletons";
import { ContentCard } from "@/frontend/components/ContentCard";
import { Button } from "@/frontend/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select";
import { Badge } from "@/frontend/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/frontend/components/ui/sheet";
import { Sparkles, ArrowUpDown, RefreshCw, Film, Tv, BrainCircuit, Settings2, Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import * as mongoClient from "@/frontend/lib/mongodbClient";

type MainTab = "all" | "ai";
type ContentTypeFilter = "all" | "movie" | "tv";
type IndustryFilter = "all" | "hollywood" | "bollywood" | "southindian" | "korean" | "japanese";
type RecommendationTypeFilter = "all" | "trending" | "highrated" | "popular" | "newreleases";
type SortField = "relevance" | "popularity" | "rating" | "release_date";
type SortOrder = "asc" | "desc";

const INDUSTRY_FILTERS: { id: IndustryFilter; label: string; emoji: string; langs?: string[]; langs_exclude?: string[] }[] = [
  { id: "all",        label: "All",        emoji: "🌍" },
  { id: "hollywood",  label: "Hollywood",  emoji: "🎬", langs: ["en"] },
  { id: "bollywood",  label: "Bollywood",  emoji: "🇮🇳", langs: ["hi", "gu"] },
  { id: "southindian",label: "South Indian",emoji: "🎭", langs: ["ta", "te", "ml", "kn"] },
  { id: "korean",     label: "Korean",     emoji: "🇰🇷", langs: ["ko"] },
  { id: "japanese",   label: "Japanese",   emoji: "🇯🇵", langs: ["ja"] },
];

const RECOMMENDATION_TYPES: { id: RecommendationTypeFilter; label: string; emoji: string; description: string }[] = [
  { id: "all",         label: "All",          emoji: "⭐", description: "All recommendations" },
  { id: "trending",    label: "Trending",     emoji: "🔥", description: "Hot picks this week" },
  { id: "highrated",   label: "Highly Rated", emoji: "✨", description: "9.0+ rated" },
  { id: "popular",     label: "Popular",      emoji: "👑", description: "Most watched" },
  { id: "newreleases", label: "New Releases", emoji: "🆕", description: "Recently released" },
];

const INITIAL_VISIBLE_ITEMS = 48;
const LOAD_MORE_BATCH = 32;

const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

const LANGUAGE_MAP: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  gu: "Gujarati",
  ko: "Korean",
  ja: "Japanese",
  es: "Spanish",
  fr: "French",
  tr: "Turkish",
  pt: "Portuguese",
};

const getRecommendationItemType = (item: Movie | TVShow): "movie" | "tv" =>
  "title" in item ? "movie" : "tv";

// Animated neural network dots for the AI Picks tab
function AIOrb() {
  return (
    <div className="relative flex items-center justify-center w-6 h-6">
      <span className="absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-30 animate-ping" />
      <BrainCircuit className="relative w-3.5 h-3.5 text-violet-400" />
    </div>
  );
}

// Floating particle animation for the AI Picks empty/loading header
function AIParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-violet-500/20"
          style={{
            width: `${4 + (i % 4) * 3}px`,
            height: `${4 + (i % 4) * 3}px`,
            left: `${8 + (i * 7.5) % 84}%`,
            top: `${10 + (i * 13) % 80}%`,
            animation: `float-particle ${3 + (i % 4)}s ease-in-out ${(i * 0.4) % 2}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

const ReckonCard = memo(
  ({
    item,
    type,
    reasons,
    seedTitle,
    aiExplanation,
    highlightAI,
  }: {
    item: Movie | TVShow;
    type: "movie" | "tv" | "mixed";
    reasons?: Array<{ label: string; evidence?: string }>;
    seedTitle?: string | null;
    aiExplanation?: { label: string; text: string };
    highlightAI?: boolean;
  }) => {
    const [showAITooltip, setShowAITooltip] = useState(false);

    return (
      <div className="relative group/card">
        <ContentCard
          item={item}
          type={type}
          showActions={true}
          recommendationReasons={reasons}
          recommendationSeedTitle={seedTitle}
        />
        {aiExplanation && (
          <div className="absolute top-2 left-2 z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAITooltip((v) => !v);
              }}
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-sm shadow-sm transition-colors",
                highlightAI
                  ? "bg-violet-600/95 text-white hover:bg-violet-500 ring-1 ring-violet-400/40"
                  : "bg-violet-500/90 text-white hover:bg-violet-500"
              )}
              title={aiExplanation.text}
            >
              <BrainCircuit className="w-2.5 h-2.5" />
              AI Pick
            </button>
            {showAITooltip && (
              <div className="absolute left-0 top-6 z-30 w-48 rounded-lg bg-popover border border-border/80 shadow-lg p-2.5 text-[11px] text-foreground/90 leading-snug">
                {aiExplanation.text}
                <div
                  className="absolute inset-0 -z-10"
                  onClick={() => setShowAITooltip(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

ReckonCard.displayName = "ReckonCard";

// ---------------------------------------------------------------------------
// Preferences Sheet
// ---------------------------------------------------------------------------
function PreferencesSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { preferences, refreshData } = useUserData();
  const [langs, setLangs] = useState<string[]>([]);
  const [genres, setGenres] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLangs(preferences?.preferred_languages ?? []);
      setGenres(preferences?.preferred_genres ?? []);
    }
  }, [open, preferences]);

  const toggleLang = (l: string) =>
    setLangs((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);

  const toggleGenre = (g: number) =>
    setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);

  const save = async () => {
    setSaving(true);
    await mongoClient.updateUserPreferences({ preferred_languages: langs, preferred_genres: genres });
    await refreshData();
    setSaving(false);
    onSaved();
    onClose();
  };

  const PREF_LANGUAGES = [
    { code: "en", label: "English" }, { code: "hi", label: "Hindi" },
    { code: "ta", label: "Tamil" },   { code: "te", label: "Telugu" },
    { code: "gu", label: "Gujarati" },{ code: "ml", label: "Malayalam" },
    { code: "kn", label: "Kannada" }, { code: "ko", label: "Korean" },
    { code: "ja", label: "Japanese" },{ code: "es", label: "Spanish" },
    { code: "fr", label: "French" },  { code: "tr", label: "Turkish" },
  ];

  const PREF_GENRES = [
    { id: 28, name: "Action" },    { id: 12, name: "Adventure" },
    { id: 35, name: "Comedy" },    { id: 18, name: "Drama" },
    { id: 27, name: "Horror" },    { id: 10749, name: "Romance" },
    { id: 878, name: "Sci-Fi" },   { id: 53, name: "Thriller" },
    { id: 9648, name: "Mystery" }, { id: 14, name: "Fantasy" },
    { id: 99, name: "Documentary"},{ id: 80, name: "Crime" },
    { id: 10402, name: "Music" },  { id: 37, name: "Western" },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-5">
          <SheetTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-violet-400" />
            AI Pick Preferences
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Help the AI understand your taste. These are used to boost relevance.
          </p>
        </SheetHeader>

        <div className="space-y-6">
          {/* Languages */}
          <div>
            <p className="text-sm font-semibold mb-3 text-foreground">Preferred Languages</p>
            <div className="flex flex-wrap gap-2">
              {PREF_LANGUAGES.map(({ code, label }) => {
                const active = langs.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleLang(code)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                      active
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "bg-card border-border text-muted-foreground hover:border-violet-500/50 hover:text-foreground"
                    )}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Genres */}
          <div>
            <p className="text-sm font-semibold mb-3 text-foreground">Favorite Genres</p>
            <div className="flex flex-wrap gap-2">
              {PREF_GENRES.map(({ id, name }) => {
                const active = genres.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleGenre(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                      active
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <Button onClick={save} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            Save Preferences
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Reckon() {
  const {
    items: recommendations,
    aiItems,
    isLoading: reckonLoading,
    isRefreshing,
    isPersonalized,
    isAIRanked,
    explanationById,
    aiExplanationById,
    refreshRecommendations,
  } = useRecommendations();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>("all");
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>("all");
  const [industryFilter, setIndustryFilter] = useState<IndustryFilter>("all");
  const [recTypeFilter, setRecTypeFilter] = useState<RecommendationTypeFilter>("all");
  const [sortField, setSortField] = useState<SortField>("relevance");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ITEMS);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const handlePreferencesSaved = useCallback(() => {
    void refreshRecommendations();
  }, [refreshRecommendations]);

  // Source items depend on which main tab is active
  const sourceItems = mainTab === "ai" ? aiItems : recommendations;

  const availableGenres = useMemo(() => {
    const genres = new Set<number>();
    sourceItems.forEach((item) => {
      item.genre_ids?.forEach((g) => genres.add(g));
    });
    return Array.from(genres)
      .filter((g) => GENRE_MAP[g])
      .sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b]));
  }, [sourceItems]);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    sourceItems.forEach((item) => {
      if (item.original_language) langs.add(item.original_language);
    });
    return Array.from(langs)
      .filter((l) => LANGUAGE_MAP[l])
      .sort((a, b) => LANGUAGE_MAP[a].localeCompare(LANGUAGE_MAP[b]));
  }, [sourceItems]);

  const processedItems = useMemo(() => {
    let filtered = [...sourceItems];

    if (contentTypeFilter === "movie") {
      filtered = filtered.filter((item) => "title" in item);
    } else if (contentTypeFilter === "tv") {
      filtered = filtered.filter((item) => "first_air_date" in item && !("title" in item));
    }

    // Industry filter
    const industryDef = INDUSTRY_FILTERS.find((f) => f.id === industryFilter);
    if (industryDef?.langs) {
      filtered = filtered.filter((item) => industryDef.langs!.includes(item.original_language || ""));
    }

    // Recommendation type filter: trending, highly rated, popular, new releases
    if (recTypeFilter !== "all") {
      const now = new Date().getTime();
      const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
      
      switch (recTypeFilter) {
        case "trending":
          // High popularity and recent activity
          filtered = filtered.filter((item) => (item.popularity || 0) > 50);
          break;
        case "highrated":
          // Rating >= 8.0
          filtered = filtered.filter((item) => (item.vote_average || 0) >= 8.0);
          break;
        case "popular":
          // Popularity >= 100
          filtered = filtered.filter((item) => (item.popularity || 0) >= 100);
          break;
        case "newreleases":
          // Released within last 30 days
          filtered = filtered.filter((item) => {
            const releaseDate = "release_date" in item
              ? (item as Movie).release_date
              : (item as TVShow).first_air_date;
            const itemDate = releaseDate ? new Date(releaseDate).getTime() : 0;
            return itemDate > oneMonthAgo;
          });
          break;
      }
    }

    if (selectedGenre !== "all") {
      const genreId = Number(selectedGenre);
      filtered = filtered.filter((item) => item.genre_ids?.includes(genreId));
    }

    if (selectedLanguage !== "all") {
      filtered = filtered.filter((item) => item.original_language === selectedLanguage);
    }

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "popularity":
          comparison = (a.popularity || 0) - (b.popularity || 0);
          break;
        case "rating":
          comparison = (a.vote_average || 0) - (b.vote_average || 0);
          break;
        case "release_date": {
          const dateA = "release_date" in a ? a.release_date : a.first_air_date || "";
          const dateB = "release_date" in b ? b.release_date : b.first_air_date || "";
          comparison = dateA.localeCompare(dateB);
          break;
        }
        case "relevance":
        default:
          return 0;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [sourceItems, contentTypeFilter, industryFilter, recTypeFilter, selectedGenre, selectedLanguage, sortField, sortOrder]);

  const visibleItems = useMemo(
    () => processedItems.slice(0, visibleCount),
    [processedItems, visibleCount]
  );

  const hasMore = visibleCount < processedItems.length;

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ITEMS);
  }, [mainTab, contentTypeFilter, industryFilter, recTypeFilter, selectedGenre, selectedLanguage, sortField, sortOrder]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + LOAD_MORE_BATCH, processedItems.length));
      },
      { rootMargin: "500px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, processedItems.length, visibleItems.length]);

  const toggleSortOrder = () => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));

  const clearFilters = () => {
    setContentTypeFilter("all");
    setIndustryFilter("all");
    setRecTypeFilter("all");
    setSelectedGenre("all");
    setSelectedLanguage("all");
    setSortField("relevance");
    setSortOrder("desc");
  };

  const isAITab = mainTab === "ai";

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      <style>{`
        @keyframes float-particle {
          from { transform: translateY(0px) scale(1); opacity: 0.2; }
          to   { transform: translateY(-14px) scale(1.4); opacity: 0.5; }
        }
        @keyframes shimmer-ai {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .ai-shimmer-text {
          background: linear-gradient(90deg, #a78bfa, #e879f9, #818cf8, #a78bfa);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer-ai 3s linear infinite;
        }
      `}</style>

      <Header />

      <main className="flex-1 pt-20 pb-12">
        <div className="container mx-auto px-4">

          {/* Top header row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Reckon</h1>
                <p className="text-muted-foreground">
                  {isPersonalized
                    ? "Personalized recommendations that evolve with your activity"
                    : "Trending and globally diverse picks"}
                </p>
              </div>
              {isPersonalized && (
                <Badge className="bg-primary/20 text-primary ml-2">Personalized</Badge>
              )}
              {isAIRanked && (
                <Badge className="bg-violet-500/20 text-violet-400 ml-1 gap-1">
                  <BrainCircuit className="w-3 h-3" />
                  AI
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void refreshRecommendations(); }}
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                Refresh Picks
              </Button>
              <span>{processedItems.length} recommendations</span>
            </div>
          </div>

          {/* Main tab switcher: All Picks | AI Picks */}
          <div className="flex gap-2 mb-4 bg-card/50 p-1.5 rounded-xl border border-border w-fit">
            <button
              type="button"
              onClick={() => setMainTab("all")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                !isAITab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="w-4 h-4" />
              All Picks
            </button>

            <button
              type="button"
              onClick={() => setMainTab("ai")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                isAITab
                  ? "bg-violet-600 text-white shadow-sm shadow-violet-500/30"
                  : "text-violet-400 hover:text-violet-300 hover:bg-violet-500/10",
              )}
            >
              {isAITab ? <AIOrb /> : <BrainCircuit className="w-4 h-4" />}
              <span className={isAITab ? "ai-shimmer-text font-semibold" : ""}>
                AI Picks
              </span>
              {isAIRanked && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                  isAITab ? "bg-white/20 text-white" : "bg-violet-500/20 text-violet-400"
                )}>
                  {aiItems.length}
                </span>
              )}
            </button>
          </div>

          {/* AI Picks banner */}
          {isAITab && (
            <div className="relative mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 px-5 py-4 overflow-hidden">
              <AIParticles />
              <div className="relative flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-violet-500/15 border border-violet-500/25 shrink-0">
                  <BrainCircuit className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-violet-300">Picked for you by AI</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ranked using semantic embeddings + your preferences via OpenAI
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrefsOpen(true)}
                  className="gap-1.5 border-violet-500/30 text-violet-300 hover:bg-violet-500/10 hover:border-violet-400 shrink-0"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Preferences</span>
                </Button>
              </div>
            </div>
          )}

          {/* Content type + industry filter row */}
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex gap-2 bg-card/50 p-3 rounded-lg border border-border overflow-x-auto scrollbar-hide">
              <Button
                variant={contentTypeFilter === "all" && industryFilter === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => { setContentTypeFilter("all"); setIndustryFilter("all"); }}
                className="gap-2 shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                All
              </Button>
              <Button
                variant={contentTypeFilter === "movie" ? "default" : "ghost"}
                size="sm"
                onClick={() => { setContentTypeFilter("movie"); setIndustryFilter("all"); }}
                className="gap-2 shrink-0"
              >
                <Film className="w-4 h-4" />
                Movies
              </Button>
              <Button
                variant={contentTypeFilter === "tv" ? "default" : "ghost"}
                size="sm"
                onClick={() => { setContentTypeFilter("tv"); setIndustryFilter("all"); }}
                className="gap-2 shrink-0"
              >
                <Tv className="w-4 h-4" />
                TV Series
              </Button>
              <div className="w-px bg-border mx-1 shrink-0" />
              {INDUSTRY_FILTERS.filter((f) => f.id !== "all").map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setIndustryFilter(f.id); setContentTypeFilter("all"); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all shrink-0",
                    industryFilter === f.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span>{f.emoji}</span>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Recommendation type filter row */}
            <div className="flex gap-2 bg-muted/30 p-3 rounded-lg border border-border/50 overflow-x-auto scrollbar-hide">
              {RECOMMENDATION_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setRecTypeFilter(t.id)}
                  title={t.description}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all shrink-0",
                    recTypeFilter === t.id
                      ? "bg-amber-600/80 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span>{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <PreferencesSheet
            open={prefsOpen}
            onClose={() => setPrefsOpen(false)}
            onSaved={handlePreferencesSaved}
          />

          {/* Sort / filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap">
            <Select value={selectedGenre} onValueChange={setSelectedGenre}>
              <SelectTrigger className="w-full sm:w-[170px] bg-card">
                <SelectValue placeholder="All Genres" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="all">All Genres</SelectItem>
                {availableGenres.map((genreId) => (
                  <SelectItem key={genreId} value={String(genreId)}>
                    {GENRE_MAP[genreId]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-full sm:w-[170px] bg-card">
                <SelectValue placeholder="All Languages" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="all">All Languages</SelectItem>
                {availableLanguages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {LANGUAGE_MAP[lang] || lang.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
              <SelectTrigger className="w-full sm:w-[170px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="popularity">Popularity</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
                <SelectItem value="release_date">Release Date</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={toggleSortOrder}
              className="bg-card shrink-0"
              title={sortOrder === "desc" ? "Descending" : "Ascending"}
            >
              <ArrowUpDown className={cn("w-4 h-4", sortOrder === "asc" && "rotate-180")} />
            </Button>

            {(contentTypeFilter !== "all" || industryFilter !== "all" || recTypeFilter !== "all" || selectedGenre !== "all" || selectedLanguage !== "all" || sortField !== "relevance") && (
              <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {/* Grid */}
          {reckonLoading || (isAITab && !isAIRanked) ? (
            <PosterGridSkeleton count={INITIAL_VISIBLE_ITEMS} />
          ) : visibleItems.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {visibleItems.map((item) => {
                  const itemType = getRecommendationItemType(item);
                  const explanation = explanationById[`${itemType}_${item.id}`];
                  const aiExplanation = aiExplanationById[`${itemType}:${item.id}`];
                  return (
                    <ReckonCard
                      key={`${item.id}-${itemType}`}
                      item={item}
                      type="mixed"
                      reasons={explanation?.reasons}
                      seedTitle={explanation?.seedTitle}
                      aiExplanation={aiExplanation}
                      highlightAI={isAITab}
                    />
                  );
                })}
              </div>

              <div ref={loadMoreRef} className="h-12 w-full" />

              {hasMore && (
                <div className="flex justify-center py-3">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCount((prev) => Math.min(prev + LOAD_MORE_BATCH, processedItems.length))}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No recommendations found</h3>
              <p className="text-muted-foreground mb-4">
                {contentTypeFilter !== "all" || industryFilter !== "all" || recTypeFilter !== "all" || selectedGenre !== "all" || selectedLanguage !== "all"
                  ? "Try adjusting your filters or clearing them"
                  : "Start watching and liking content to unlock stronger recommendations."}
              </p>
              {(contentTypeFilter !== "all" || industryFilter !== "all" || recTypeFilter !== "all" || selectedGenre !== "all" || selectedLanguage !== "all") && (
                <Button onClick={clearFilters}>Clear Filters</Button>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
