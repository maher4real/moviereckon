const LETTER_LIKE_SUBSTITUTIONS: Record<string, string> = {
  "@": "a",
  "$": "s",
  "!": "i",
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
};

const BLOCKED_TERMS = [
  "asshole",
  "bastard",
  "bitch",
  "bitches",
  "bullshit",
  "cunt",
  "dickhead",
  "fuck",
  "fucked",
  "fucker",
  "fuckers",
  "fucking",
  "motherfucker",
  "motherfuckers",
  "motherfucking",
  "shit",
  "shits",
  "shitty",
  "slut",
  "sluts",
  "whore",
  "whores",
] as const;

function stripDiacritics(value: string): string {
  try {
    return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    return value;
  }
}

function normalizeForModeration(value: string): string {
  const source = stripDiacritics(value).toLowerCase();
  let normalized = "";

  for (const char of source) {
    const mapped = LETTER_LIKE_SUBSTITUTIONS[char] ?? char;
    normalized += /[a-z]/.test(mapped) ? mapped : " ";
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function buildPattern(term: string): RegExp {
  const spacedLetters = term.split("").join("\\s*");
  return new RegExp(`(?:^|\\s)${spacedLetters}(?:$|\\s)`, "i");
}

const BLOCKED_PATTERNS = BLOCKED_TERMS.map((term) => ({
  term,
  pattern: buildPattern(term),
}));

export function findBlockedTerms(value: unknown): string[] {
  if (typeof value !== "string") return [];

  const normalized = normalizeForModeration(value);
  if (!normalized) return [];

  return BLOCKED_PATTERNS.filter(({ pattern }) => pattern.test(normalized)).map(({ term }) => term);
}

export function containsBlockedTerms(value: unknown): boolean {
  return findBlockedTerms(value).length > 0;
}
