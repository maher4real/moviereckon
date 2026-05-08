export type ShareContentType = "movie" | "tv";

export interface ShareContentDetails {
  contentType: ShareContentType;
  title: string;
  year?: string;
  overview?: string;
  rating?: number;
  genres?: string[];
  posterUrl?: string | null;
  pageUrl?: string;
}

export interface ShareCardPayload {
  title: string;
  text: string;
  url: string;
  posterUrl: string | null;
  fileName: string;
}

export type ShareContentResult =
  | { method: "native"; sharedFile: boolean }
  | { method: "clipboard"; sharedFile: false }
  | { method: "cancelled"; sharedFile: false };

function cleanText(value?: string | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function getContentLabel(contentType: ShareContentType): string {
  return contentType === "movie" ? "Movie" : "Series";
}

function getShareTitle(title: string, year?: string): string {
  const cleanTitle = cleanText(title) || "Untitled";
  const cleanYear = cleanText(year);
  return cleanYear ? `${cleanTitle} (${cleanYear})` : cleanTitle;
}

function getCurrentPageUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.href;
}

function getUrlBase(): string {
  if (typeof window === "undefined") return "https://moviereckon.local";
  return window.location.origin;
}

function buildShortShareUrl(pageUrl: string, contentType: ShareContentType): string {
  const cleanUrl = cleanText(pageUrl);
  if (!cleanUrl) return "";

  const isAbsoluteUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleanUrl);
  const isRootRelativeUrl = cleanUrl.startsWith("/");

  try {
    const url = new URL(cleanUrl, getUrlBase());
    const routePrefix = contentType === "movie" ? "movie" : "tv";
    const shortPrefix = contentType === "movie" ? "m" : "s";
    const match = url.pathname.match(new RegExp(`^/${routePrefix}/([^/?#]+)/?$`));

    if (!match) return cleanUrl;

    url.pathname = `/${shortPrefix}/${match[1]}`;
    url.search = "";
    url.hash = "";

    if (isAbsoluteUrl) return url.href;
    if (isRootRelativeUrl) return url.pathname;
    return cleanUrl;
  } catch {
    return cleanUrl;
  }
}

function buildFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return `${slug || "moviereckon"}-poster.jpg`;
}

function getImageExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/svg+xml") return "svg";
  return "jpg";
}

function replaceFileExtension(fileName: string, mimeType: string): string {
  const extension = getImageExtension(mimeType);
  return fileName.replace(/\.[a-z0-9]+$/i, `.${extension}`);
}

export function buildShareCardPayload(details: ShareContentDetails): ShareCardPayload {
  const displayTitle = getShareTitle(details.title, details.year);
  const rating =
    typeof details.rating === "number" && Number.isFinite(details.rating) && details.rating > 0
      ? `${details.rating.toFixed(1)}/10`
      : "";
  const genres = (details.genres || []).map(cleanText).filter(Boolean).slice(0, 3).join(", ");
  const metadata = [displayTitle, getContentLabel(details.contentType), rating, genres].filter(Boolean);
  const overview = truncateText(cleanText(details.overview), 180);
  const text = overview ? `${metadata.join(" • ")}\n${overview}` : metadata.join(" • ");

  return {
    title: displayTitle,
    text,
    url: buildShortShareUrl(details.pageUrl || getCurrentPageUrl(), details.contentType),
    posterUrl: cleanText(details.posterUrl) || null,
    fileName: buildFileName(displayTitle),
  };
}

export async function createPosterShareFile(payload: ShareCardPayload): Promise<File | null> {
  if (!payload.posterUrl || typeof fetch === "undefined" || typeof File === "undefined") {
    return null;
  }

  try {
    const response = await fetch(payload.posterUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    if (!blob.type.toLowerCase().startsWith("image/")) return null;

    return new File([blob], replaceFileExtension(payload.fileName, blob.type), {
      type: blob.type,
    });
  } catch {
    return null;
  }
}

async function copyShareText(payload: ShareCardPayload) {
  const text = [payload.text, payload.url].filter(Boolean).join("\n");

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") return;

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function isShareAbort(error: unknown): boolean {
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError";
}

export async function shareContentDetails(details: ShareContentDetails): Promise<ShareContentResult> {
  const payload = buildShareCardPayload(details);
  const nav = typeof navigator === "undefined" ? null : navigator;
  const posterFile = await createPosterShareFile(payload).catch(() => null);

  if (nav?.share) {
    const baseShareData: ShareData = {
      title: payload.title,
      text: payload.text,
      url: payload.url,
    };

    if (posterFile) {
      const fileShareData: ShareData = { ...baseShareData, files: [posterFile] };
      const canShareFiles = !nav.canShare || nav.canShare({ files: [posterFile] });
      if (canShareFiles) {
        try {
          await nav.share(fileShareData);
          return { method: "native", sharedFile: true };
        } catch (error) {
          if (isShareAbort(error)) return { method: "cancelled", sharedFile: false };
        }
      }
    }

    try {
      await nav.share(baseShareData);
      return { method: "native", sharedFile: false };
    } catch (error) {
      if (isShareAbort(error)) return { method: "cancelled", sharedFile: false };
    }
  }

  await copyShareText(payload);
  return { method: "clipboard", sharedFile: false };
}
