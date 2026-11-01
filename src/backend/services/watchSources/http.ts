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
  finalUrl?: string;
}

/** Fetch bounded documents. Cross-origin redirects require an explicit provider policy. */
export async function fetchSourceDocument(
  value: string,
  baseUrl: string,
  validators: { etag?: string | null; lastModified?: string | null } = {},
  options: { signal?: AbortSignal; format?: "html" | "xml" | "json"; redirectOriginAllowed?: (origin: string) => boolean } = {},
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
            Accept: options.format === "json" ? "application/json" : options.format === "xml" ? "application/xml,text/xml" : "text/html,application/xhtml+xml",
            ...(url.origin === origin && validators.etag ? { "If-None-Match": validators.etag } : {}),
            ...(url.origin === origin && validators.lastModified ? { "If-Modified-Since": validators.lastModified } : {}),
          },
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location: string | null = response.headers.get("location");
        await response.body?.cancel();
        const redirected: URL | null = location ? publicLink(location, url.href) : null;
        if (!redirected || (redirected.origin !== origin &&
            (redirected.protocol !== "https:" || !options.redirectOriginAllowed?.(redirected.origin))) || redirects === 3) {
          throw new Error("Source redirect outside origin or too many redirects");
        }
        url = redirected;
      }
      if (!response) throw new Error("No source response");
      if (response.status === 304) {
        await response.body?.cancel();
        if (url.origin !== origin) throw new Error("New source origin returned an invalid 304");
        return { html: null, etag: validators.etag || null, lastModified: validators.lastModified || null };
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (attempt === 0 && (response.status >= 500 && response.status <= 599)) continue;
        throw new SourceHttpError(response.status);
      }
      const contentType = response.headers.get("content-type") || "";
      const expectedType = options.format === "json" ? /^application\/json(?:;|$)/i :
        options.format === "xml" ? /(?:application|text)\/xml/i : /text\/html|application\/xhtml\+xml/i;
      if (!expectedType.test(contentType)) {
        await response.body?.cancel();
        throw new Error(`Source did not return ${(options.format || "html").toUpperCase()}`);
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
        finalUrl: url.href,
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
