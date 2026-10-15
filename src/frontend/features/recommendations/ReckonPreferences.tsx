import { useState, useEffect } from "react";
import { Button } from "@/frontend/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/frontend/components/ui/sheet";
import { Check, Globe, Film, Settings2, RefreshCw } from "lucide-react";
import { useUserData } from "@/frontend/hooks/useUserData";
import { cn } from "@/shared/lib/utils";

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

// ---------------------------------------------------------------------------
// First Time Setup Card
// ---------------------------------------------------------------------------
export function FirstTimeSetup({
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
    <div className="pb-6 pt-4">
      <div className="max-w-3xl">
        {/* Header */}
        <div className="sr-only">
          <h2>
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
                  ? "bg-primary/15 text-foreground"
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
                    aria-pressed={active}
                  className={cn(
                    "flex min-h-11 items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 cursor-pointer",
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
                  ? "bg-primary/15 text-foreground"
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
                    aria-pressed={active}
                  className={cn(
                    "flex min-h-11 items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 cursor-pointer",
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
export function PreferencesSheet({
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
          <SheetDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
            The engine strongly weights your selections — the more you set, the
            more tailored your feed.
          </SheetDescription>
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
                    ? "bg-primary/15 text-foreground"
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
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-200 cursor-pointer",
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
                    ? "bg-primary/15 text-foreground"
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
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-200 cursor-pointer",
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
            className="min-h-11 flex-1 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 disabled:opacity-50"
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
            className="min-h-11 cursor-pointer"
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
