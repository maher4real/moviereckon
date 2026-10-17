import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Film, Globe, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import Header from "@/frontend/components/Header";
import { Button } from "@/frontend/components/ui/button";
import { useToast } from "@/frontend/hooks/use-toast";
import { useUserData } from "@/frontend/hooks/useUserData";
import { GenrePicker, LanguagePicker, PREF_GENRES, PREF_LANGUAGES, useGenreArtwork } from "./ReckonPreferences";

const sameSet = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((value) => b.includes(value));
const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

export default function PreferencesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { preferences, updatePreferences } = useUserData();
  const { data: artwork, isLoading: artworkLoading } = useGenreArtwork();
  const savedLangs = useMemo(() => preferences?.preferred_languages ?? [], [preferences]);
  const savedGenres = useMemo(() => preferences?.preferred_genres ?? [], [preferences]);
  const [langs, setLangs] = useState<string[]>(savedLangs);
  const [genres, setGenres] = useState<number[]>(savedGenres);
  const [hydrated, setHydrated] = useState(preferences !== null);
  const [saving, setSaving] = useState(false);
  const returnTo = (location.state as { from?: string } | null)?.from || "/reckon";

  // Preferences load asynchronously; seed the form once, never overwrite edits.
  useEffect(() => {
    if (hydrated || preferences === null) return;
    setLangs(savedLangs);
    setGenres(savedGenres);
    setHydrated(true);
  }, [hydrated, preferences, savedGenres, savedLangs]);

  const dirty = !sameSet(langs, savedLangs) || !sameSet(genres, savedGenres);
  const isFirstSetup = savedLangs.length === 0 && savedGenres.length === 0;

  const save = async () => {
    setSaving(true);
    try {
      await updatePreferences({ preferred_languages: langs, preferred_genres: genres });
      toast({ title: "Preferences saved", description: "Your Reckon feed is being rebuilt around them." });
      navigate(returnTo, { replace: true, state: { preferencesUpdated: true } });
    } catch {
      toast({ title: "Could not save preferences", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedLanguageNames = PREF_LANGUAGES.filter((l) => langs.includes(l.code)).map((l) => l.label);
  const selectedGenreNames = PREF_GENRES.filter((g) => genres.includes(g.id)).map((g) => g.name);

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />
      <main className="flex-1 pb-40">
        <section className="pref-hero">
          <div className="reckon-container">
            <button type="button" onClick={() => navigate(returnTo)} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden="true" />Back to Reckon
            </button>
            <p className="page-kicker mt-4">{isFirstSetup ? "Set up Reckon" : "Your taste"}</p>
            <h1 className="mt-2 text-balance text-4xl font-black tracking-[-0.04em] sm:text-5xl">What do you love to watch?</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Pick the languages you watch in and the genres you reach for. Reckon weights these heavily, then keeps learning from what you like and skip.
            </p>
          </div>
        </section>

        <div className="reckon-container grid gap-12">
          <section aria-labelledby="pref-languages">
            <div className="pref-section-head">
              <span className="pref-step">1</span>
              <div className="min-w-0 flex-1">
                <h2 id="pref-languages" className="flex items-center gap-2 text-xl font-bold tracking-tight"><Globe className="size-5 text-primary" aria-hidden="true" />Languages</h2>
                <p className="text-sm text-muted-foreground">Choose every language you are happy to watch in.</p>
              </div>
              <span className="pref-count">{langs.length} selected</span>
            </div>
            <LanguagePicker selected={langs} onToggle={(code) => setLangs((prev) => toggle(prev, code))} />
          </section>

          <section aria-labelledby="pref-genres">
            <div className="pref-section-head">
              <span className="pref-step">2</span>
              <div className="min-w-0 flex-1">
                <h2 id="pref-genres" className="flex items-center gap-2 text-xl font-bold tracking-tight"><Film className="size-5 text-primary" aria-hidden="true" />Genres</h2>
                <p className="text-sm text-muted-foreground">Three or more gives Reckon the clearest signal.</p>
              </div>
              <span className="pref-count">{genres.length} selected</span>
            </div>
            <GenrePicker selected={genres} onToggle={(id) => setGenres((prev) => toggle(prev, id))} artwork={artwork} loading={artworkLoading} />
          </section>
        </div>
      </main>

      <div className="pref-savebar" role="region" aria-label="Save preferences">
        <div className="reckon-container flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" />{langs.length} languages · {genres.length} genres</p>
            <p className="truncate text-xs text-muted-foreground">
              {[...selectedLanguageNames, ...selectedGenreNames].join(", ") || "Nothing selected yet"}
            </p>
          </div>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => { setLangs(savedLangs); setGenres(savedGenres); }} disabled={saving} className="min-h-11 gap-2 text-muted-foreground">
                <RotateCcw className="size-4" aria-hidden="true" />Undo
              </Button>
            )}
            <Button onClick={() => void save()} disabled={saving || !dirty || (langs.length === 0 && genres.length === 0)} className="brand-primary-button min-h-11 flex-1 gap-2 rounded-full px-6 sm:flex-none">
              {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              {saving ? "Saving…" : isFirstSetup ? "Build my feed" : "Save preferences"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
