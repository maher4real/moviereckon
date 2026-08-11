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

const TMDB_IMAGE_WIDTH_HINTS: Record<string, number> = {
  w45: 45,
  w92: 92,
  w154: 154,
  w185: 185,
  w300: 300,
  w342: 342,
  w500: 500,
  w780: 780,
  w1280: 1280,
  h632: 632,
};

const TMDB_IMAGE_RESPONSIVE_GROUPS: Record<
  TmdbImageKind,
  { tokens: readonly string[]; defaultSizes: string }
> = {
  poster: {
    tokens: ["w185", "w342", "w500"],
    defaultSizes: "(max-width: 640px) 44vw, (max-width: 1024px) 24vw, 200px",
  },
  backdrop: {
    tokens: ["w300", "w780", "w1280"],
    defaultSizes: "100vw",
  },
  profile: {
    tokens: ["w45", "w185", "h632"],
    defaultSizes: "(max-width: 640px) 26vw, 120px",
  },
  still: {
    tokens: ["w185", "w300", "w500"],
    defaultSizes: "(max-width: 640px) 70vw, 360px",
  },
  provider: {
    tokens: ["w45", "w92", "w154", "w185"],
    defaultSizes: "92px",
  },
};

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

export function buildTmdbImageProxyResponsiveSource(
  src: string,
): { srcSet: string; sizes: string } | null {
  if (!src) return null;

  try {
    const isAbsoluteUrl = /^https?:\/\//i.test(src);
    const url = new URL(src, "https://moviereckon.invalid");
    if (!url.pathname.endsWith(TMDB_IMAGE_PROXY_ROUTE)) return null;

    const kind = url.searchParams.get("kind");
    const ref = url.searchParams.get("ref");
    if (!kind || !isTmdbImageKind(kind) || !ref) return null;

    const group = TMDB_IMAGE_RESPONSIVE_GROUPS[kind];
    const srcSet = group.tokens
      .map((token) => {
        const width = TMDB_IMAGE_WIDTH_HINTS[token];
        if (!width) return null;

        const candidate = new URL(url.toString());
        candidate.searchParams.set("size", token);
        const candidateUrl = isAbsoluteUrl
          ? candidate.toString()
          : `${candidate.pathname}${candidate.search}`;
        return `${candidateUrl} ${width}w`;
      })
      .filter((value): value is string => value !== null)
      .join(", ");

    if (!srcSet) return null;
    return { srcSet, sizes: group.defaultSizes };
  } catch {
    return null;
  }
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
