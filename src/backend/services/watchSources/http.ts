import "server-only";
import { publicLink } from "./parser";

const MAX_BYTES = 3 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

export class SourceHttpError extends Error {
  constructor(public status: number) { super(`Source HTTP ${status}`); }
}

export interface SourceResponse {
  html: string | null;
  etag: string | null;
  lastModified: string | null;
}

/** Fetch documents only, with a size cap and no cross-origin redirect following. */
export async function fetchSourceDocument(
  value: string,
  baseUrl: string,
  validators: { etag?: string | null; lastModified?: string | null } = {},
  options: { signal?: AbortSignal } = {},
): Promise<SourceResponse> {
  const initial = publicLink(value, baseUrl);
  const origin = new URL(baseUrl).origin;
  if (!initial || initial.origin !== origin) throw new Error("Source URL outside configured origin");
  let url: URL = initial;
  // One retry for transient responses. Persistent failures are retried by the durable queue.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 3; redirects++) {
        response = await fetch(url.href, {
          redirect: "manual", cache: "no-store", signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
          headers: {
            "User-Agent": "MovieReckon-SourceImporter/1.0",
            Accept: "text/html,application/xhtml+xml",
            ...(validators.etag ? { "If-None-Match": validators.etag } : {}),
            ...(validators.lastModified ? { "If-Modified-Since": validators.lastModified } : {}),
          },
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location: string | null = response.headers.get("location");
        await response.body?.cancel();
        const redirected: URL | null = location ? publicLink(location, url.href) : null;
        if (!redirected || redirected.origin !== origin || redirects === 3) throw new Error("Source redirect outside origin or too many redirects");
        url = redirected;
      }
      if (!response) throw new Error("No source response");
      if (response.status === 304) {
        await response.body?.cancel();
        return { html: null, etag: validators.etag || null, lastModified: validators.lastModified || null };
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (attempt === 0 && (response.status >= 500 && response.status <= 599)) continue;
        throw new SourceHttpError(response.status);
      }
      const contentType = response.headers.get("content-type") || "";
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        await response.body?.cancel();
        throw new Error("Source did not return HTML");
      }
      if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) {
        await response.body?.cancel();
        throw new Error("Source document too large");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Source document is empty");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          bytes += result.value.byteLength;
          if (bytes > MAX_BYTES) throw new Error("Source document too large");
          chunks.push(result.value);
        }
      } finally {
        await reader.cancel();
      }
      return {
        html: Buffer.concat(chunks).toString("utf8"),
        etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"),
      };
    } catch (error) {
      if (attempt === 0 && error instanceof TypeError) continue;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Source request failed");
}
