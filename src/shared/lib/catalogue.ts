/**
 * Single source of truth for TMDB genre and language labels used across the
 * browse pages, preference screens and recommendation engine. Add a genre or
 * language here once instead of editing every page.
 */

/** Movie and TV genre ids with display names. */
export const GENRE_NAMES: Readonly<Record<number, string>> = {
  12: "Adventure",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  36: "History",
  37: "Western",
  53: "Thriller",
  80: "Crime",
  99: "Documentary",
  878: "Sci-Fi",
  9648: "Mystery",
  10402: "Music",
  10749: "Romance",
  10751: "Family",
  10752: "War",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  10770: "TV Movie",
};

/** Genres people can pick as a preference (movie genre ids), in display order. */
export const PREFERENCE_GENRE_IDS = [
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53, 10752, 37,
] as const;

export function genreName(id: number, fallback = `Genre ${id}`): string {
  return GENRE_NAMES[id] ?? fallback;
}

/**
 * Lowercase noun phrases for use inside sentences ("Matches your selected
 * thrillers"). Kept next to the names so they cannot drift apart.
 */
export const GENRE_PHRASES: Readonly<Record<number, string>> = {
  12: "adventure",
  14: "fantasy",
  16: "animation",
  18: "drama",
  27: "horror",
  28: "action",
  35: "comedy",
  36: "history",
  37: "western",
  53: "thrillers",
  80: "crime",
  99: "documentaries",
  878: "science fiction",
  9648: "mysteries",
  10402: "music",
  10749: "romance",
  10751: "family",
  10752: "war",
  10759: "action and adventure",
  10762: "kids",
  10765: "science fiction and fantasy",
};

export interface LanguageInfo {
  code: string;
  label: string;
  /** The language's name in its own script, for preference tiles. */
  native: string;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "tr", label: "Turkish", native: "Türkçe" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "ru", label: "Russian", native: "Русский" },
];

const LANGUAGE_BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export function languageLabel(code: string, fallback = code.toUpperCase()): string {
  return LANGUAGE_BY_CODE.get(code.toLowerCase())?.label ?? fallback;
}

/** code -> label lookup for pages that index by language code. */
export const LANGUAGE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  LANGUAGES.map((language) => [language.code, language.label]),
);

export interface SelectOption {
  value: string;
  label: string;
}

const pickLanguages = (codes: readonly string[]): SelectOption[] =>
  codes.map((code) => ({ value: code, label: languageLabel(code) }));

const ALL_LANGUAGES: SelectOption = { value: "all", label: "All Languages" };

/** Indian-cinema languages treated as "Bollywood" in browse filters. */
export const BOLLYWOOD_LANGUAGE_CODES = ["hi", "gu", "ta", "te", "kn"] as const;
export const BOLLYWOOD_LANGUAGE_OPTIONS: readonly SelectOption[] = [
  ALL_LANGUAGES,
  ...pickLanguages(BOLLYWOOD_LANGUAGE_CODES),
];

/** Languages offered when filtering series. */
export const SERIES_LANGUAGE_OPTIONS: readonly SelectOption[] = [
  ALL_LANGUAGES,
  ...pickLanguages(["en", "hi", "ko", "ja", "ta", "te", "es", "fr"]),
];
