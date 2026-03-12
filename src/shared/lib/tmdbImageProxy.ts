export const TMDB_IMAGE_PROXY_ROUTE = "/api/tmdb-image";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const TMDB_IMAGE_PATH_PATTERN = /^\/[A-Za-z0-9._/-]+$/;

export const TMDB_IMAGE_SIZE_MAP = {
  poster: ["w185", "w342", "w500", "original"],
  backdrop: ["w300", "w780", "w1280", "original"],
  profile: ["w45", "w185", "h632", "original"],
  still: ["w185", "w300", "w500", "original"],
  provider: ["w45", "w92", "w154", "w185", "original"],
} as const;

export type TmdbImageKind = keyof typeof TMDB_IMAGE_SIZE_MAP;

const TMDB_IMAGE_DEFAULT_SIZE: Record<TmdbImageKind, string> = {
  poster: "w342",
  backdrop: "w1280",
  profile: "w185",
  still: "w300",
  provider: "w92",
};

function toBase64Url(value: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  return window
    .btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string | null {
  try {
    if (typeof window === "undefined") {
      return Buffer.from(value, "base64url").toString("utf8");
    }

    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return window.atob(padded);
  } catch {
    return null;
  }
}

export function isTmdbImageKind(value: string): value is TmdbImageKind {
  return value in TMDB_IMAGE_SIZE_MAP;
}

export function normalizeTmdbImageSize(
  kind: TmdbImageKind,
  size: string | null | undefined,
): string {
  if (!size) return TMDB_IMAGE_DEFAULT_SIZE[kind];

  return (TMDB_IMAGE_SIZE_MAP[kind] as readonly string[]).includes(size)
    ? size
    : TMDB_IMAGE_DEFAULT_SIZE[kind];
}

export function encodeTmdbImageRef(path: string): string {
  return toBase64Url(path.trim());
}

export function decodeTmdbImageRef(ref: string): string | null {
  const decoded = fromBase64Url(ref.trim());
  if (!decoded) return null;
  return TMDB_IMAGE_PATH_PATTERN.test(decoded) ? decoded : null;
}

export function buildTmdbImageProxyUrl(params: {
  apiBase?: string;
  path: string | null | undefined;
  kind: TmdbImageKind;
  size?: string;
}): string | null {
  const path = params.path?.trim();
  if (!path) return null;

  const normalizedSize = normalizeTmdbImageSize(params.kind, params.size);
  const ref = encodeTmdbImageRef(path);
  const base = params.apiBase || "";

  return `${base}${TMDB_IMAGE_PROXY_ROUTE}?kind=${params.kind}&size=${normalizedSize}&ref=${encodeURIComponent(ref)}`;
}

export function resolveTmdbImageSourceUrl(params: {
  kind: TmdbImageKind;
  ref: string;
  size?: string | null;
}): string | null {
  const path = decodeTmdbImageRef(params.ref);
  if (!path) return null;

  const normalizedSize = normalizeTmdbImageSize(params.kind, params.size);
  return `${TMDB_IMAGE_BASE}/${normalizedSize}${path}`;
}
