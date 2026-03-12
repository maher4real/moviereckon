import { del, put } from "@vercel/blob";

const AVATAR_BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const MAX_AVATAR_UPLOAD_BYTES = 750_000;
const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isBlobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function getBlobImageExtension(contentType: string): string | null {
  return CONTENT_TYPE_TO_EXTENSION[contentType.toLowerCase()] || null;
}

export function isManagedAvatarBlobUrl(value: string | null | undefined): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "public.blob.vercel-storage.com" ||
        parsed.hostname.endsWith(AVATAR_BLOB_HOST_SUFFIX));
  } catch {
    return false;
  }
}

export async function uploadAvatarToBlob(params: {
  userId: string;
  body: Buffer;
  contentType: string;
  filenameBase?: string;
}): Promise<string> {
  const { body, contentType, filenameBase, userId } = params;

  if (!isBlobStorageConfigured()) {
    throw new Error("Vercel Blob is not configured on this deployment.");
  }

  if (body.byteLength === 0 || body.byteLength > MAX_AVATAR_UPLOAD_BYTES) {
    throw new Error("Avatar payload is invalid or too large.");
  }

  const extension = getBlobImageExtension(contentType);
  if (!extension) {
    throw new Error("Unsupported avatar file type.");
  }

  const safeBase =
    (filenameBase || "avatar")
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "avatar";

  const pathname = `avatars/${userId}/${safeBase}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const blob = await put(pathname, body, {
    access: "public",
    addRandomSuffix: false,
    contentType,
  });

  return blob.url;
}

export async function deleteManagedAvatarBlob(value: string | null | undefined) {
  if (!value || !isManagedAvatarBlobUrl(value) || !isBlobStorageConfigured()) {
    return;
  }

  await del(value);
}
