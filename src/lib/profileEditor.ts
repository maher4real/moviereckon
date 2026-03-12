const MAX_AVATAR_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const TARGET_AVATAR_DATA_URL_LENGTH = 170_000;
const MAX_AVATAR_DATA_URL_LENGTH = 240_000;
const DATA_IMAGE_REGEX =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const LOCAL_AVATAR_PATH_REGEX =
  /^\/avatars\/[a-z0-9-_]+\.(?:svg|png|jpe?g|webp|gif)$/i;
const MAX_AVATAR_DIMENSION = 320;
const MIN_AVATAR_DIMENSION = 128;
const PRESET_AVATAR_SIZE = 320;
const PRESET_AVATAR_CACHE = new Map<string, string>();

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
export const PROFILE_MAX_AVATAR_FILE_SIZE_BYTES = MAX_AVATAR_FILE_SIZE_BYTES;

export type DefaultAvatarOption = {
  id: string;
  label: string;
  colors: readonly [string, string, string];
  glow: string;
  accent: string;
  surface: string;
};

export const DEFAULT_AVATAR_OPTIONS: readonly DefaultAvatarOption[] = [
  {
    id: "aurora",
    label: "Aurora Lead",
    colors: ["#1d4ed8", "#7c3aed", "#ec4899"],
    glow: "rgba(250, 204, 21, 0.38)",
    accent: "#fef08a",
    surface: "rgba(8, 12, 24, 0.34)",
  },
  {
    id: "noir",
    label: "Noir Cut",
    colors: ["#111827", "#334155", "#ef4444"],
    glow: "rgba(248, 113, 113, 0.28)",
    accent: "#fca5a5",
    surface: "rgba(15, 23, 42, 0.54)",
  },
  {
    id: "sunset",
    label: "Sunset Frame",
    colors: ["#ea580c", "#ef4444", "#facc15"],
    glow: "rgba(253, 186, 116, 0.34)",
    accent: "#fde68a",
    surface: "rgba(49, 18, 7, 0.34)",
  },
  {
    id: "forest",
    label: "Forest Reel",
    colors: ["#14532d", "#15803d", "#84cc16"],
    glow: "rgba(190, 242, 100, 0.28)",
    accent: "#d9f99d",
    surface: "rgba(10, 28, 18, 0.34)",
  },
  {
    id: "ocean",
    label: "Ocean Cast",
    colors: ["#0f766e", "#0284c7", "#38bdf8"],
    glow: "rgba(125, 211, 252, 0.34)",
    accent: "#bae6fd",
    surface: "rgba(8, 32, 49, 0.32)",
  },
  {
    id: "rose",
    label: "Rose Spotlight",
    colors: ["#881337", "#db2777", "#fb7185"],
    glow: "rgba(251, 191, 203, 0.32)",
    accent: "#fecdd3",
    surface: "rgba(59, 10, 32, 0.34)",
  },
] as const;

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
};

export const createDefaultAvatarDataUrl = (
  optionId: DefaultAvatarOption["id"],
) => {
  const cached = PRESET_AVATAR_CACHE.get(optionId);
  if (cached) return cached;
  if (typeof document === "undefined") return "";

  const option = DEFAULT_AVATAR_OPTIONS.find(
    (candidate) => candidate.id === optionId,
  );
  if (!option) return "";

  const canvas = document.createElement("canvas");
  canvas.width = PRESET_AVATAR_SIZE;
  canvas.height = PRESET_AVATAR_SIZE;

  const context = canvas.getContext("2d");
  if (!context) return "";

  const backgroundGradient = context.createLinearGradient(
    0,
    0,
    PRESET_AVATAR_SIZE,
    PRESET_AVATAR_SIZE,
  );
  option.colors.forEach((color, index) => {
    backgroundGradient.addColorStop(index / (option.colors.length - 1), color);
  });
  context.fillStyle = backgroundGradient;
  context.fillRect(0, 0, PRESET_AVATAR_SIZE, PRESET_AVATAR_SIZE);

  const glowGradient = context.createRadialGradient(
    PRESET_AVATAR_SIZE * 0.78,
    PRESET_AVATAR_SIZE * 0.16,
    PRESET_AVATAR_SIZE * 0.03,
    PRESET_AVATAR_SIZE * 0.78,
    PRESET_AVATAR_SIZE * 0.16,
    PRESET_AVATAR_SIZE * 0.34,
  );
  glowGradient.addColorStop(0, option.glow);
  glowGradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glowGradient;
  context.fillRect(0, 0, PRESET_AVATAR_SIZE, PRESET_AVATAR_SIZE);

  context.save();
  context.translate(PRESET_AVATAR_SIZE * 0.16, PRESET_AVATAR_SIZE * 0.18);
  context.rotate(-0.26);
  context.fillStyle = "rgba(255,255,255,0.08)";
  context.fillRect(0, 0, PRESET_AVATAR_SIZE * 0.9, PRESET_AVATAR_SIZE * 0.16);
  context.restore();

  drawRoundedRect(context, 28, 28, 84, 30, 15);
  context.fillStyle = "rgba(255,255,255,0.16)";
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.2)";
  context.lineWidth = 1.5;
  context.stroke();

  drawRoundedRect(context, 28, 176, 264, 108, 30);
  context.fillStyle = option.surface;
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.lineWidth = 2;
  context.stroke();

  drawRoundedRect(context, 48, 196, 52, 52, 18);
  context.fillStyle = "rgba(255,255,255,0.12)";
  context.fill();

  drawRoundedRect(context, 114, 198, 126, 14, 7);
  context.fillStyle = option.accent;
  context.fill();

  drawRoundedRect(context, 114, 220, 114, 12, 6);
  context.fillStyle = "rgba(255,255,255,0.24)";
  context.fill();

  drawRoundedRect(context, 114, 240, 86, 12, 6);
  context.fillStyle = "rgba(255,255,255,0.16)";
  context.fill();

  context.beginPath();
  context.arc(82, 222, 9, 0, Math.PI * 2);
  context.fillStyle = option.accent;
  context.fill();

  const dataUrl = canvas.toDataURL("image/png");
  PRESET_AVATAR_CACHE.set(optionId, dataUrl);
  return dataUrl;
};

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const getLocalAvatarPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (LOCAL_AVATAR_PATH_REGEX.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    return LOCAL_AVATAR_PATH_REGEX.test(parsed.pathname)
      ? parsed.pathname
      : null;
  } catch {
    return null;
  }
};

export const normalizeAvatarValue = (value: string) => {
  const trimmed = value.trim();
  return getLocalAvatarPath(trimmed) || trimmed;
};

export const isSupportedAvatarValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return true;

  if (trimmed.startsWith("data:image/")) {
    return (
      trimmed.length <= MAX_AVATAR_DATA_URL_LENGTH &&
      DATA_IMAGE_REGEX.test(trimmed)
    );
  }

  if (getLocalAvatarPath(trimmed)) {
    return true;
  }

  return isValidHttpUrl(trimmed);
};

export const isRemoteAvatarUrl = (value: string) =>
  Boolean(value.trim()) &&
  !value.trim().startsWith("data:image/") &&
  !getLocalAvatarPath(value) &&
  isValidHttpUrl(value);

const readFileAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Invalid file reader result"));
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });

const loadImageFromDataUrl = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode uploaded image"));
    image.src = dataUrl;
  });

export const compressAvatarImage = async (file: Blob) => {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(
    0,
    Math.floor((image.naturalWidth - sourceSize) / 2),
  );
  const sourceY = Math.max(
    0,
    Math.floor((image.naturalHeight - sourceSize) / 2),
  );
  let targetSize = Math.max(1, Math.min(MAX_AVATAR_DIMENSION, sourceSize));
  const minimumTargetSize = Math.min(targetSize, MIN_AVATAR_DIMENSION);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available for image optimization");
  }

  const drawResizedImage = (size: number) => {
    canvas.width = size;
    canvas.height = size;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, size, size);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      size,
      size,
    );
  };

  const findBestEncodedImage = () => {
    let best = canvas.toDataURL("image/webp", 0.82);
    if (best.length <= TARGET_AVATAR_DATA_URL_LENGTH) return best;

    let low = 0.5;
    let high = 0.82;
    let bestUnderTarget = "";

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const quality = (low + high) / 2;
      const candidate = canvas.toDataURL("image/webp", quality);

      if (candidate.length <= TARGET_AVATAR_DATA_URL_LENGTH) {
        bestUnderTarget = candidate;
        low = quality;
      } else {
        high = quality;
      }
    }

    if (bestUnderTarget) return bestUnderTarget;

    best = canvas.toDataURL("image/webp", 0.6);
    if (best.length <= MAX_AVATAR_DATA_URL_LENGTH) return best;

    return best;
  };

  drawResizedImage(targetSize);

  let output = findBestEncodedImage();

  while (
    output.length > MAX_AVATAR_DATA_URL_LENGTH &&
    targetSize > minimumTargetSize
  ) {
    targetSize = Math.max(minimumTargetSize, Math.round(targetSize * 0.88));
    drawResizedImage(targetSize);
    output = findBestEncodedImage();
  }

  if (output.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error("Unable to compress avatar image within size limits");
  }

  return output;
};

export const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

export const isDefaultAvatarSelected = (
  currentValue: string,
  candidatePath: string,
) => normalizeAvatarValue(currentValue) === normalizeAvatarValue(candidatePath);
