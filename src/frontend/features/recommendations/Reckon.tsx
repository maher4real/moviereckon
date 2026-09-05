import React, {
  useState,
  useMemo,
  useEffect,
  memo,
  useRef,
  useCallback,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRecommendations } from "@/frontend/hooks/useRecommendations";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useUserData } from "@/frontend/hooks/useUserData";
import { Movie, TVShow } from "@/shared/lib/tmdb";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import Header from "@/frontend/components/Header";
import Footer from "@/frontend/components/Footer";
import { PosterGridSkeleton } from "@/frontend/components/AppSkeletons";
import { ContentCard } from "@/frontend/components/ContentCard";
import { Button } from "@/frontend/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Badge } from "@/frontend/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/frontend/components/ui/sheet";
import {
  Sparkles,
  ArrowUpDown,
  RefreshCw,
  Film,
  Tv,
  Settings2,
  Check,
  SlidersHorizontal,
  TrendingUp,
  Star,
  Crown,
  CalendarDays,
  Globe,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import PickTonight from "./PickTonight";
import YourTastePanel, { type TasteSignal } from "./YourTastePanel";

type ContentTypeFilter = "all" | "movie" | "tv";
type RecommendationTypeFilter =
  | "all"
  | "trending"
  | "highrated"
  | "popular"
  | "newreleases";
type SortField = "relevance" | "popularity" | "rating" | "release_date";
type SortOrder = "asc" | "desc";

const RECOMMENDATION_TYPES: {
  id: RecommendationTypeFilter;
  label: string;
  Icon: React.ElementType;
  description: string;
}[] = [
  {
    id: "all",
    label: "All",
    Icon: Sparkles,
    description: "All recommendations",
  },
  {
    id: "trending",
    label: "Trending",
    Icon: TrendingUp,
    description: "Hot picks this week",
  },
  {
    id: "highrated",
    label: "Highly Rated",
    Icon: Star,
    description: "8.0+ rated",
  },
  { id: "popular", label: "Popular", Icon: Crown, description: "Most watched" },
  {
    id: "newreleases",
    label: "New Releases",
    Icon: CalendarDays,
    description: "Recently released",
  },
];

const INITIAL_VISIBLE_ITEMS = 48;

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
  ml: "Malayalam",
  kn: "Kannada",
  ko: "Korean",
  ja: "Japanese",
  es: "Spanish",
  fr: "French",
  tr: "Turkish",
  pt: "Portuguese",
  zh: "Chinese",
  ar: "Arabic",
  ru: "Russian",
  it: "Italian",
  de: "German",
};

const getRecommendationItemType = (item: Movie | TVShow): "movie" | "tv" =>
  "title" in item ? "movie" : "tv";

function getRecommendationKey(item: Movie | TVShow): string {
  return `${getRecommendationItemType(item)}_${item.id}`;
}

const PREF_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "gu", label: "Gujarati" },
  { code: "ml", label: "Malayalam" },
  { code: "kn", label: "Kannada" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "tr", label: "Turkish" },
  { code: "pt", label: "Portuguese" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "it", label: "Italian" },
  { code: "de", label: "German" },
  { code: "ru", label: "Russian" },
];

const PREF_GENRES = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Sci-Fi" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

const ReckonCard = memo(
  ({
    item,
    type,
    reasons,
    seedTitle,
  }: {
    item: Movie | TVShow;
    type: "movie" | "tv" | "mixed";
    reasons?: Array<{ label: string; evidence?: string }>;
    seedTitle?: string | null;
  }) => (
    <ContentCard
      item={item}
      type={type}
      showActions={true}
      recommendationReasons={reasons}
      recommendationSeedTitle={seedTitle}
    />
  ),
);

ReckonCard.displayName = "ReckonCard";

// ---------------------------------------------------------------------------
// First Time Setup Card
// ---------------------------------------------------------------------------
function FirstTimeSetup({
  langs,
  genres,
  onToggleLang,
  onToggleGenre,
  onSave,
  onSkip,
  saving,
}: {
  langs: string[];
  genres: number[];
  onToggleLang: (lang: string) => void;
  onToggleGenre: (genre: number) => void;
  onSave: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  return (
    <div className="surface-panel glass-detail-panel mb-6 border-primary/30 bg-linear-to-br from-primary/10 via-card/60 to-primary/5 px-6 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Welcome to Reckon!
          </h2>
          <p className="text-muted-foreground">
            Set your preferences to unlock personalized movie and TV
            recommendations tailored just for you.
          </p>
        </div>

        {/* Languages */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <span className="text-base font-semibold text-foreground">
                Preferred Languages
              </span>
            </div>
            <span
              className={cn(
                "text-sm font-medium px-3 py-1 rounded-full transition-all duration-200",
                langs.length > 0
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {langs.length > 0 ? `${langs.length} selected` : "None selected"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PREF_LANGUAGES.map(({ code, label }) => {
              const active = langs.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onToggleLang(code)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 cursor-pointer",
                    active
                      ? "bg-primary border-primary text-primary-foreground shadow-sm"
                      : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5",
                  )}
                >
                  {active && <Check className="w-4 h-4" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Genres */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              <span className="text-base font-semibold text-foreground">
                Favorite Genres
              </span>
            </div>
            <span
              className={cn(
                "text-sm font-medium px-3 py-1 rounded-full transition-all duration-200",
                genres.length > 0
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {genres.length > 0
                ? `${genres.length} selected`
                : "None selected"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PREF_GENRES.map(({ id, name }) => {
              const active = genres.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggleGenre(id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 cursor-pointer",
                    active
                      ? "bg-primary border-primary text-primary-foreground shadow-sm"
                      : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5",
                  )}
                >
                  {active && <Check className="w-4 h-4" />}
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={onSave}
            disabled={saving || (langs.length === 0 && genres.length === 0)}
            size="lg"
            className="flex-1 sm:flex-none bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Saving Preferences…
              </>
            ) : (
              <>
                <Check className="w-5 h-5 mr-2" />
                Get My Recommendations
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onSkip}
            disabled={saving}
            size="lg"
            className="flex-1 sm:flex-none cursor-pointer"
          >
            Skip for Now
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          You can always change these preferences later from the settings
          button.
        </p>
      </div>
    </div>
  );
}
function PreferencesSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { preferences, updatePreferences } = useUserData();
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
    setLangs((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );

  const toggleGenre = (g: number) =>
    setGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );

  const save = async () => {
    setSaving(true);
    try {
      await updatePreferences({
        preferred_languages: langs,
        preferred_genres: genres,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    JSON.stringify([...langs].sort()) !==
      JSON.stringify([...(preferences?.preferred_languages ?? [])].sort()) ||
    JSON.stringify([...genres].sort((a, b) => a - b)) !==
      JSON.stringify(
        [...(preferences?.preferred_genres ?? [])].sort((a, b) => a - b),
      );

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2.5 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <Settings2 className="w-4 h-4 text-primary" />
              </div>
              Recommendation Preferences
            </SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            The engine strongly weights your selections — the more you set, the
            more tailored your feed.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Languages */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Languages
                </span>
              </div>
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full transition-all duration-200",
                  langs.length > 0
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {langs.length > 0 ? `${langs.length} selected` : "None"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PREF_LANGUAGES.map(({ code, label }) => {
                const active = langs.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleLang(code)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 cursor-pointer",
                      active
                        ? "bg-primary border-primary text-primary-foreground shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5",
                    )}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border/60" />

          {/* Genres */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Genres
                </span>
              </div>
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full transition-all duration-200",
                  genres.length > 0
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {genres.length > 0 ? `${genres.length} selected` : "None"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PREF_GENRES.map(({ id, name }) => {
                const active = genres.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleGenre(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 cursor-pointer",
                      active
                        ? "bg-primary border-primary text-primary-foreground shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5",
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

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-border bg-card/50 flex gap-3">
          <Button
            onClick={save}
            disabled={saving || !hasChanges}
            className="flex-1 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            {saving
              ? "Saving…"
              : hasChanges
                ? "Save Preferences"
                : "No Changes"}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer"
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Reckon() {
  const { user } = useAuth();
  const { preferences, updatePreferences, setFeedback } = useUserData();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const tastePreferencesKey = [
    ...(preferences?.preferred_genres || []),
    "|",
    ...(preferences?.preferred_languages || []),
  ].join(",");
  const tasteQueryKey = useMemo(
    () => ["recommendation-taste", user?.id || "anonymous", tastePreferencesKey] as const,
    [tastePreferencesKey, user?.id],
  );
  const { data: tasteSnapshot, refetch: refetchTaste } = useQuery({
    queryKey: tasteQueryKey,
    queryFn: () => mongoClient.fetchRecommendationTasteSnapshot(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const tasteProfile = tasteSnapshot?.profile || null;

  const [contentTypeFilter, setContentTypeFilter] =
    useState<ContentTypeFilter>("all");
  const [recTypeFilter, setRecTypeFilter] =
    useState<RecommendationTypeFilter>("all");
  const [sortField, setSortField] = useState<SortField>("relevance");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [skippedSetup, setSkippedSetup] = useState(false);
  const [setupLangs, setSetupLangs] = useState<string[]>([]);
  const [setupGenres, setSetupGenres] = useState<number[]>([]);
  const [setupSaving, setSetupSaving] = useState(false);
  const [explorationMode, setExplorationMode] = useState<mongoClient.TasteExplorationMode>("familiar");

  useEffect(() => {
    if (tasteSnapshot?.controls.explorationMode) {
      setExplorationMode(tasteSnapshot.controls.explorationMode);
    }
  }, [tasteSnapshot?.controls.explorationMode]);

  const applyTasteSnapshot = useCallback((snapshot: mongoClient.RecommendationTasteSnapshot | null) => {
    if (!snapshot) return;
    setExplorationMode(snapshot.controls.explorationMode);
    queryClient.setQueryData(tasteQueryKey, snapshot);
  }, [queryClient, tasteQueryKey]);
  const toggleSetupLang = (l: string) =>
    setSetupLangs((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );

  const toggleSetupGenre = (g: number) =>
    setSetupGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );

  const {
    items: recommendations,
    isLoading: reckonLoading,
    isRefreshing,
    isFetchingNextPage,
    hasMore: hasMoreFromServer,
    state: recommendationsState,
    hasError: recommendationsHasError,
    errorCode: recommendationsErrorCode,
    isPersonalized,
    explanationById,
    fetchNextPage,
    refreshRecommendations,
    retryRecommendations,
    feedMode,
  } = useRecommendations({
    contentType: contentTypeFilter,
    recommendationType: recTypeFilter,
    genre: selectedGenre,
    language: selectedLanguage,
    sort: sortField,
    sortOrder,
    exploration: explorationMode,
  });

  const handleExplorationChange = useCallback(async (mode: mongoClient.TasteExplorationMode) => {
    if (feedMode === "legacy") return;
    const snapshot = await mongoClient.updateRecommendationTasteControls({ explorationMode: mode });
    if (!snapshot) throw new Error("taste_controls_update_failed");
    applyTasteSnapshot(snapshot);
    await refreshRecommendations();
  }, [applyTasteSnapshot, feedMode, refreshRecommendations]);

  const handleForgetLearning = useCallback(async (key: string, excluded: boolean) => {
    const snapshot = await mongoClient.updateRecommendationTasteControls(
      excluded ? { restoreLearningKey: key } : { excludeLearningKey: key },
    );
    if (!snapshot) throw new Error("taste_learning_update_failed");
    applyTasteSnapshot(snapshot);
    await refreshRecommendations();
  }, [applyTasteSnapshot, refreshRecommendations]);

  const handleResetLearned = useCallback(async () => {
    const snapshot = await mongoClient.resetRecommendationTaste();
    if (!snapshot) throw new Error("taste_reset_failed");
    applyTasteSnapshot(snapshot);
    await refreshRecommendations();
  }, [applyTasteSnapshot, refreshRecommendations]);

  const handleTitleSignal = useCallback(async (item: Movie | TVShow, signal: TasteSignal) => {
    const contentType = "title" in item ? "movie" : "tv";
    const title = "title" in item ? item.title : item.name;
    const result = await setFeedback({
      content_id: item.id,
      content_type: contentType,
      feedback_type: signal === "positive" ? "give_it_a_go" : "skip",
      title,
      poster_path: item.poster_path,
      genres: item.genre_ids || [],
      language: item.original_language || "en",
    });
    if (result.ok) {
      queryClient.invalidateQueries({ queryKey: tasteQueryKey });
      const refreshed = await refetchTaste();
      applyTasteSnapshot(refreshed.data || null);
      await refreshRecommendations();
    }
    return result;
  }, [applyTasteSnapshot, queryClient, refetchTaste, refreshRecommendations, setFeedback, tasteQueryKey]);

  const saveSetup = useCallback(async () => {
    setSetupSaving(true);
    try {
      await updatePreferences({
        preferred_languages: setupLangs,
        preferred_genres: setupGenres,
      });
      await refetchTaste();
      await refreshRecommendations();
    } finally {
      setSetupSaving(false);
    }
  }, [refetchTaste, refreshRecommendations, setupGenres, setupLangs, updatePreferences]);
  const [extraItems, setExtraItems] = useState<(Movie | TVShow)[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [moreExhausted, setMoreExhausted] = useState(false);

  // Reset extra items whenever precision filters change
  useEffect(() => {
    setExtraItems([]);
    setMoreExhausted(false);
  }, [
    recommendations,
    selectedLanguage,
    selectedGenre,
    contentTypeFilter,
    recTypeFilter,
    sortField,
    sortOrder,
  ]);

  const canFetchMore = !moreExhausted;

  const hasPreferences =
    (preferences?.preferred_languages?.length ?? 0) > 0 ||
    (preferences?.preferred_genres?.length ?? 0) > 0;

  const handlePreferencesSaved = useCallback(() => {
    void refetchTaste();
    void refreshRecommendations();
  }, [refetchTaste, refreshRecommendations]);

  const showFirstTimeSetup =
    !hasPreferences && !reckonLoading && preferences !== null && !skippedSetup;

  const availableGenres = useMemo(() => {
    const genres = new Set<number>(Object.keys(GENRE_MAP).map(Number));
    preferences?.preferred_genres?.forEach((g) => genres.add(g));
    return Array.from(genres)
      .filter((g) => GENRE_MAP[g])
      .sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b]));
  }, [preferences]);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>(Object.keys(LANGUAGE_MAP));
    preferences?.preferred_languages?.forEach((l) => langs.add(l));
    return Array.from(langs)
      .filter((l) => LANGUAGE_MAP[l])
      .sort((a, b) => LANGUAGE_MAP[a].localeCompare(LANGUAGE_MAP[b]));
  }, [preferences]);

  const processedItems = useMemo(() => {
    // Merge extra discovered items, dedup by id+type
    const seen = new Set<string>();
    const merged: (Movie | TVShow)[] = [];
    for (const item of [...recommendations, ...extraItems]) {
      const key = `${"title" in item ? "movie" : "tv"}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    let filtered = merged;

    if (contentTypeFilter === "movie") {
      filtered = filtered.filter((item) => "title" in item);
    } else if (contentTypeFilter === "tv") {
      filtered = filtered.filter(
        (item) => "first_air_date" in item && !("title" in item),
      );
    }

    if (selectedGenre !== "all") {
      const genreId = Number(selectedGenre);
      filtered = filtered.filter((item) => item.genre_ids?.includes(genreId));
    }

    if (selectedLanguage !== "all") {
      filtered = filtered.filter(
        (item) => item.original_language === selectedLanguage,
      );
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
          const dateA =
            "release_date" in a ? a.release_date : a.first_air_date || "";
          const dateB =
            "release_date" in b ? b.release_date : b.first_air_date || "";
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
  }, [
    recommendations,
    extraItems,
    contentTypeFilter,
    selectedGenre,
    selectedLanguage,
    sortField,
    sortOrder,
  ]);

  const visibleItems = processedItems;

  const fetchMoreLikeThis = useCallback(async () => {
    if (isFetchingMore) return;
    setIsFetchingMore(true);

    const currentItems = [...recommendations, ...extraItems];
    const excludedKeys = Array.from(
      new Set(currentItems.map(getRecommendationKey)),
    );
    const seedKeys = (tasteProfile?.clusters || [])
      .flatMap((cluster) => cluster.evidence)
      .filter((evidence) => ["liked", "must_watch", "give_it_a_go"].includes(evidence.signal))
      .map((evidence) => evidence.key)
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .slice(0, 10);
    if (seedKeys.length === 0) {
      setMoreExhausted(true);
      setIsFetchingMore(false);
      return;
    }

    try {
      const payload = await mongoClient.fetchMoreLikeThisRecommendations({
        seedKeys,
        excludedKeys,
        genre: selectedGenre,
        language: selectedLanguage,
        contentType: contentTypeFilter,
      });
      const existing = new Set(excludedKeys);
      const fresh = payload.items.filter((item) => {
        const key = getRecommendationKey(item);
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });

      setMoreExhausted(fresh.length === 0);
      setExtraItems((prev) => [...prev, ...fresh]);
    } catch {
      return;
    } finally {
      setIsFetchingMore(false);
    }
  }, [
    isFetchingMore,
    recommendations,
    extraItems,
    selectedGenre,
    selectedLanguage,
    contentTypeFilter,
    tasteProfile,
  ]);

  const hasMore = hasMoreFromServer;

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || recommendationsHasError || recommendationsState === "retryable") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore, isFetchingNextPage, processedItems.length, recommendationsHasError, recommendationsState]);

  const toggleSortOrder = () =>
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));

  const clearFilters = () => {
    setContentTypeFilter("all");
    setRecTypeFilter("all");
    setSelectedGenre("all");
    setSelectedLanguage("all");
    setSortField("relevance");
    setSortOrder("desc");
  };

  const hasActiveFilters =
    contentTypeFilter !== "all" ||
    recTypeFilter !== "all" ||
    selectedGenre !== "all" ||
    selectedLanguage !== "all" ||
    sortField !== "relevance";

  const hasResolvedItems = processedItems.length > 0;

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="page-main">
        <div className="container mx-auto px-4">
          {/* Top header row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="page-heading-icon">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold tracking-tight">Reckon</h1>
                  {isPersonalized && (
                    <Badge className="bg-primary/15 text-primary border border-primary/25 text-[10px] font-semibold px-2">
                      Personalized
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {isPersonalized
                    ? "Picks that evolve with your taste"
                    : "Trending and globally diverse picks"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrefsOpen(true)}
                className={cn(
                  "gap-2 cursor-pointer transition-colors duration-200",
                  hasPreferences
                    ? "border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60"
                    : "hover:border-primary/30 hover:text-primary",
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Preferences
                {hasPreferences && (
                  <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold leading-none">
                    {(preferences?.preferred_languages?.length ?? 0) +
                      (preferences?.preferred_genres?.length ?? 0)}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshRecommendations()}
                disabled={isRefreshing}
                className="gap-2 cursor-pointer transition-colors duration-200 hover:border-primary/30 hover:text-primary"
              >
                <RefreshCw
                  className={cn("w-4 h-4", isRefreshing && "animate-spin")}
                />
                Refresh
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {processedItems.length} picks
              </span>
            </div>
          </div>

          {/* First Time Setup or Preferences Nudge */}
          {showFirstTimeSetup ? (
            <FirstTimeSetup
              langs={setupLangs}
              genres={setupGenres}
              onToggleLang={toggleSetupLang}
              onToggleGenre={toggleSetupGenre}
              onSave={saveSetup}
              onSkip={() => setSkippedSetup(true)}
              saving={setupSaving}
            />
          ) : !hasPreferences && !reckonLoading ? (
            <div className="surface-panel glass-detail-panel mb-5 flex items-center gap-3 border-primary/25 bg-linear-to-r from-primary/10 to-primary/5 px-4 py-3.5">
              <span className="section-glass-icon" aria-hidden="true">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Unlock personalized recommendations
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set your favorite languages and genres — the engine strongly
                  prioritizes them.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setPrefsOpen(true)}
                className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer transition-colors duration-200"
              >
                Set Up
              </Button>
            </div>
          ) : null}

          <YourTastePanel
            snapshot={tasteSnapshot || null}
            feedMode={feedMode}
            onEditPreferences={() => setPrefsOpen(true)}
            onExplorationChange={handleExplorationChange}
            onForgetLearning={handleForgetLearning}
            onResetLearned={handleResetLearned}
            onTitleSignal={handleTitleSignal}
          />

          <PickTonight items={recommendations} explanationById={explanationById} />

          {/* Content type + rec type filter rows */}
          <div className="flex flex-col gap-3 mb-6">
            <div className="filter-panel mb-0">
              <div className="filter-row">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContentTypeFilter("all")}
                className={cn("filter-chip", contentTypeFilter === "all" && "filter-chip-active")}
              >
                <Sparkles className="w-4 h-4" />
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContentTypeFilter("movie")}
                className={cn("filter-chip", contentTypeFilter === "movie" && "filter-chip-active")}
              >
                <Film className="w-4 h-4" />
                Movies
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContentTypeFilter("tv")}
                className={cn("filter-chip", contentTypeFilter === "tv" && "filter-chip-active")}
              >
                <Tv className="w-4 h-4" />
                TV Series
              </Button>
              </div>
            </div>

            <div className="filter-panel mb-0">
              <div className="filter-row">
              {RECOMMENDATION_TYPES.map((t) => {
                const active = recTypeFilter === t.id;
                const unavailableInLegacy = feedMode === "legacy" && t.id !== "all";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (!unavailableInLegacy) setRecTypeFilter(t.id);
                    }}
                    disabled={unavailableInLegacy}
                    title={unavailableInLegacy ? "Available when the durable recommendation feed is enabled" : t.description}
                    className={cn(
                      "filter-chip flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-45",
                      active && "filter-chip-active",
                    )}
                  >
                    <t.Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
              </div>
              {feedMode === "legacy" && (
                <p className="px-3 pb-2 text-xs text-muted-foreground">
                  Trending, rating, popularity, and new-release modes are available with the durable feed.
                </p>
              )}
            </div>
          </div>

          <PreferencesSheet
            open={prefsOpen}
            onClose={() => setPrefsOpen(false)}
            onSaved={handlePreferencesSaved}
          />

          {/* Sort / filter bar */}
          <div className="filter-panel flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Select value={selectedGenre} onValueChange={setSelectedGenre}>
              <SelectTrigger className="select-surface w-full sm:w-42.5">
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

            <Select
              value={selectedLanguage}
              onValueChange={setSelectedLanguage}
            >
              <SelectTrigger className="select-surface w-full sm:w-42.5">
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

            <Select
              value={sortField}
              onValueChange={(v) => setSortField(v as SortField)}
            >
              <SelectTrigger className="select-surface w-full sm:w-42.5">
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
              className="select-surface shrink-0"
              title={sortOrder === "desc" ? "Descending" : "Ascending"}
            >
              <ArrowUpDown
                className={cn("w-4 h-4", sortOrder === "asc" && "rotate-180")}
              />
            </Button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                onClick={clearFilters}
                className="text-muted-foreground"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {/* Grid */}
          {reckonLoading && !hasResolvedItems ? (
            <PosterGridSkeleton count={INITIAL_VISIBLE_ITEMS} />
          ) : visibleItems.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {visibleItems.map((item) => {
                  const itemType = getRecommendationItemType(item);
                  const explanation = explanationById[`${itemType}_${item.id}`];
                  return (
                    <ReckonCard
                      key={`${item.id}-${itemType}`}
                      item={item}
                      type="mixed"
                      reasons={explanation?.reasons}
                      seedTitle={explanation?.seedTitle}
                    />
                  );
                })}
              </div>

              <div ref={loadMoreRef} className="h-12 w-full" />

              {recommendationsHasError ? (
                <div className="flex flex-col items-center gap-2 py-6" role="alert">
                  <p className="text-xs text-muted-foreground">
                    {recommendationsState === "retryable" && recommendationsErrorCode !== "SESSION_EXPIRED"
                      ? "More recommendations could not load. Your current picks are still available."
                      : "Your recommendation session expired. Restart to continue."}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => void retryRecommendations()}
                    disabled={isRefreshing}
                    className="gap-2"
                  >
                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                    {isRefreshing ? "Retrying…" : recommendationsErrorCode === "SESSION_EXPIRED" ? "Restart feed" : "Retry"}
                  </Button>
                </div>
              ) : hasMore && (
                <div className="flex justify-center py-3">
                  <Button
                    variant="outline"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading…" : "Load More"}
                  </Button>
                </div>
              )}

              {!hasMore && canFetchMore && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <p className="text-xs text-muted-foreground">
                    {recommendationsState === "retryable"
                      ? "Recommendations are temporarily unavailable"
                      : selectedLanguage !== "all" && selectedGenre !== "all"
                      ? `More ${GENRE_MAP[Number(selectedGenre)] || "content"} in ${LANGUAGE_MAP[selectedLanguage] || selectedLanguage}`
                      : selectedLanguage !== "all"
                        ? `More content in ${LANGUAGE_MAP[selectedLanguage] || selectedLanguage}`
                        : selectedGenre !== "all"
                          ? `More ${GENRE_MAP[Number(selectedGenre)] || "content"}`
                          : hasPreferences
                            ? "More picks guided by your preferences"
                            : "More recommendations"}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      recommendationsState === "retryable"
                        ? void refreshRecommendations()
                        : void fetchMoreLikeThis()
                    }
                    disabled={isFetchingMore}
                    className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <RefreshCw
                      className={cn(
                        "w-4 h-4",
                        isFetchingMore && "animate-spin",
                      )}
                    />
                    {isFetchingMore
                      ? "Fetching…"
                      : recommendationsState === "retryable"
                        ? "Retry"
                        : "Show More Like This"}
                  </Button>
                </div>
              )}
            </>
          ) : recommendationsHasError ? (
            <div className="empty-state">
              <RefreshCw className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Recommendations could not load</h3>
              <p className="text-muted-foreground mb-4">Your feed is still available to retry.</p>
              <Button onClick={() => void retryRecommendations()} disabled={isRefreshing}>
                {isRefreshing ? "Retrying…" : "Retry"}
              </Button>
            </div>
          ) : hasMore ? (
            <div className="empty-state">
              <div ref={loadMoreRef} className="h-12 w-full" />
              <RefreshCw className={cn("w-12 h-12 text-muted-foreground mx-auto mb-4", isFetchingNextPage && "animate-spin")} />
              <h3 className="text-xl font-semibold mb-2">Loading more recommendations</h3>
              <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading…" : "Load More"}
              </Button>
            </div>
          ) : (
            <div className="empty-state">
              <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                No recommendations found
              </h3>
              <p className="text-muted-foreground mb-4">
                {hasActiveFilters
                  ? "Try adjusting your filters or clearing them"
                  : "Start watching and liking content to unlock stronger recommendations."}
              </p>
              {hasActiveFilters && (
                <Button onClick={clearFilters}>Clear Filters</Button>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
