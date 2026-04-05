const MAX_AVATAR_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const TARGET_AVATAR_DATA_URL_LENGTH = 170_000;
const MAX_AVATAR_DATA_URL_LENGTH = 240_000;
const DATA_IMAGE_REGEX =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const LOCAL_AVATAR_PATH_REGEX =
  /^\/avatars\/[a-z0-9-_]+\.(?:svg|png|jpe?g|webp|gif)$/i;
const MAX_AVATAR_DIMENSION = 320;
const MIN_AVATAR_DIMENSION = 128;

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
export const PROFILE_MAX_AVATAR_FILE_SIZE_BYTES = MAX_AVATAR_FILE_SIZE_BYTES;

export type DefaultAvatarOption = {
  id: string;
  label: string;
  path: string;
};

export const DEFAULT_AVATAR_OPTIONS: readonly DefaultAvatarOption[] = [
  { id: "cinema-aurora", label: "Aurora", path: "/avatars/cinema-aurora.svg" },
  { id: "cinema-noir", label: "Noir", path: "/avatars/cinema-noir.svg" },
  { id: "cinema-sunset", label: "Sunset", path: "/avatars/cinema-sunset.svg" },
  { id: "cinema-forest", label: "Forest", path: "/avatars/cinema-forest.svg" },
  { id: "cinema-ocean", label: "Ocean", path: "/avatars/cinema-ocean.svg" },
  { id: "cinema-rose", label: "Rose", path: "/avatars/cinema-rose.svg" },
  { id: "net-ember", label: "Ember", path: "/avatars/net-ember.svg" },
  { id: "net-mint", label: "Mint", path: "/avatars/net-mint.svg" },
  { id: "net-red", label: "Red", path: "/avatars/net-red.svg" },
  { id: "net-shadow", label: "Shadow", path: "/avatars/net-shadow.svg" },
  { id: "net-sky", label: "Sky", path: "/avatars/net-sky.svg" },
  { id: "net-violet", label: "Violet", path: "/avatars/net-violet.svg" },
] as const;

export const createDefaultAvatarDataUrl = (
  optionId: DefaultAvatarOption["id"],
) => {
  const option = DEFAULT_AVATAR_OPTIONS.find(
    (candidate) => candidate.id === optionId,
  );
  return option?.path ?? "";
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
