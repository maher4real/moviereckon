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

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const CARD_MARGIN = 86;
const POSTER_WIDTH = 390;
const POSTER_HEIGHT = 585;

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

function buildFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return `${slug || "moviereckon"}-share-card.png`;
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);
    line = word;

    if (lines.length === maxLines) break;
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  lines.slice(0, maxLines).forEach((currentLine, index) => {
    const lastVisibleLine = index === maxLines - 1 && lines.length === maxLines;
    context.fillText(
      lastVisibleLine && words.join(" ").length > currentLine.length
        ? truncateText(currentLine, Math.max(8, currentLine.length - 2))
        : currentLine,
      x,
      y + index * lineHeight,
    );
  });

  return y + lines.length * lineHeight;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

function loadPosterImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string): Promise<File | null> {
  if (typeof File === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
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
    url: details.pageUrl || getCurrentPageUrl(),
    posterUrl: cleanText(details.posterUrl) || null,
    fileName: buildFileName(displayTitle),
  };
}

export async function createShareCardFile(payload: ShareCardPayload): Promise<File | null> {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) return null;

  const background = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  background.addColorStop(0, "#0b1020");
  background.addColorStop(0.46, "#141923");
  background.addColorStop(1, "#11100d");
  context.fillStyle = background;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glow = context.createRadialGradient(900, 130, 60, 900, 130, 620);
  glow.addColorStop(0, "rgba(251, 191, 36, 0.34)");
  glow.addColorStop(1, "rgba(251, 191, 36, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  context.fillStyle = "rgba(255, 255, 255, 0.055)";
  drawRoundedRect(context, CARD_MARGIN - 28, CARD_MARGIN - 28, CARD_WIDTH - CARD_MARGIN * 2 + 56, CARD_HEIGHT - CARD_MARGIN * 2 + 56, 34);
  context.fill();

  const posterImage = payload.posterUrl ? await loadPosterImage(payload.posterUrl) : null;
  const posterX = CARD_MARGIN;
  const posterY = 142;
  context.save();
  drawRoundedRect(context, posterX, posterY, POSTER_WIDTH, POSTER_HEIGHT, 28);
  context.clip();

  if (posterImage) {
    drawCoverImage(context, posterImage, posterX, posterY, POSTER_WIDTH, POSTER_HEIGHT);
  } else {
    const posterFallback = context.createLinearGradient(posterX, posterY, posterX + POSTER_WIDTH, posterY + POSTER_HEIGHT);
    posterFallback.addColorStop(0, "#232838");
    posterFallback.addColorStop(1, "#111827");
    context.fillStyle = posterFallback;
    context.fillRect(posterX, posterY, POSTER_WIDTH, POSTER_HEIGHT);
    context.fillStyle = "rgba(255, 255, 255, 0.72)";
    context.font = "700 48px ui-sans-serif, system-ui, sans-serif";
    context.fillText("MR", posterX + 132, posterY + 316);
  }
  context.restore();

  context.strokeStyle = "rgba(255, 255, 255, 0.24)";
  context.lineWidth = 2;
  drawRoundedRect(context, posterX, posterY, POSTER_WIDTH, POSTER_HEIGHT, 28);
  context.stroke();

  const textX = posterX + POSTER_WIDTH + 58;
  const textWidth = CARD_WIDTH - textX - CARD_MARGIN;
  context.fillStyle = "#f6f1e8";
  context.font = "800 54px ui-sans-serif, system-ui, sans-serif";
  const titleEndY = wrapCanvasText(context, payload.title, textX, 184, textWidth, 64, 5);

  const [metaLine] = payload.text.split("\n");
  const metaParts = metaLine.split(" • ").slice(1).join(" • ");
  context.fillStyle = "#f5c76b";
  context.font = "700 24px ui-sans-serif, system-ui, sans-serif";
  wrapCanvasText(context, metaParts || "Shared from MovieReckon", textX, Math.min(titleEndY + 34, 548), textWidth, 34, 4);

  const overview = payload.text.split("\n").slice(1).join("\n");
  context.fillStyle = "rgba(246, 241, 232, 0.82)";
  context.font = "500 34px ui-sans-serif, system-ui, sans-serif";
  wrapCanvasText(context, overview || "Open the full details on MovieReckon.", CARD_MARGIN, 835, CARD_WIDTH - CARD_MARGIN * 2, 48, 6);

  context.fillStyle = "rgba(246, 241, 232, 0.52)";
  context.font = "600 25px ui-sans-serif, system-ui, sans-serif";
  wrapCanvasText(context, payload.url, CARD_MARGIN, 1198, CARD_WIDTH - CARD_MARGIN * 2, 32, 2);

  context.fillStyle = "#f5c76b";
  context.font = "800 30px ui-sans-serif, system-ui, sans-serif";
  context.fillText("MOVIERECKON", CARD_MARGIN, 1285);

  return canvasToPngFile(canvas, payload.fileName);
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
  const cardFile = await createShareCardFile(payload).catch(() => null);

  if (nav?.share) {
    const baseShareData: ShareData = {
      title: payload.title,
      text: payload.text,
      url: payload.url,
    };

    if (cardFile) {
      const fileShareData: ShareData = { ...baseShareData, files: [cardFile] };
      const canShareFiles = !nav.canShare || nav.canShare({ files: [cardFile] });
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
