// eslint-disable-next-line no-control-regex
const SINGLE_LINE_CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/g;
// eslint-disable-next-line no-control-regex
const MULTI_LINE_CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const MULTI_SPACE_REGEX = /\s+/g;
const LINE_BREAK_REGEX = /\r\n?/g;

interface SingleLineOptions {
  fallback?: string | null;
  collapseWhitespace?: boolean;
}

function normalizeUnicode(value: string): string {
  try {
    return value.normalize("NFC");
  } catch {
    return value;
  }
}

export function sanitizeSingleLineText(
  value: unknown,
  maxLength: number,
  options: SingleLineOptions = {},
): string | null {
  const fallback = options.fallback ?? null;
  const collapseWhitespace = options.collapseWhitespace ?? true;

  if (typeof value !== "string") return fallback;

  let normalized = normalizeUnicode(value).replace(LINE_BREAK_REGEX, "\n");
  normalized = normalized.replace(SINGLE_LINE_CONTROL_CHARS_REGEX, " ");

  if (collapseWhitespace) {
    normalized = normalized.replace(MULTI_SPACE_REGEX, " ");
  }

  normalized = normalized.trim();
  if (!normalized || normalized.length > maxLength) return fallback;
  return normalized;
}

export function sanitizeMultiLineText(
  value: unknown,
  maxLength: number,
  fallback: string | null = null,
): string | null {
  if (typeof value !== "string") return fallback;

  const normalized = normalizeUnicode(value)
    .replace(LINE_BREAK_REGEX, "\n")
    .replace(MULTI_LINE_CONTROL_CHARS_REGEX, "")
    .trim();

  if (!normalized || normalized.length > maxLength) return fallback;
  return normalized;
}

export function sanitizeEmailAddress(value: unknown): string {
  return sanitizeSingleLineText(value, 254, { fallback: "", collapseWhitespace: false })?.toLowerCase() || "";
}

export function sanitizeLanguageCode(
  value: unknown,
  fallback: string | null = null,
): string | null {
  const normalized = sanitizeSingleLineText(value, 32, {
    fallback,
    collapseWhitespace: false,
  });

  if (!normalized) return fallback;

  const lowerCased = normalized.toLowerCase();
  if (!/^[a-z]{2,10}(?:-[a-z]{2,10})?$/.test(lowerCased)) return fallback;
  return lowerCased;
}
