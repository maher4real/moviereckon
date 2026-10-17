import { load } from "cheerio";
import { publicLink } from "./parser";

const MAX_HTML = 1_000_000;
const MAX_TOKEN = 8192;
const rot13 = (value: string) => value.replace(/[A-Za-z]/g, (letter) =>
  String.fromCharCode(letter.charCodeAt(0) + (letter.toLowerCase() <= "m" ? 13 : -13)));

function decodeBase64(value: string): string {
  if (!value || value.length > MAX_TOKEN || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Malformed redirect data");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("Noncanonical redirect data");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function archiveLink(value: string): URL | null {
  if (!value.startsWith("https://hblinks.lol/")) return null;
  const url = publicLink(value, "https://hblinks.lol");
  return url?.origin === "https://hblinks.lol" && url.href === value && !url.search && !url.hash &&
    /^\/archives\/[1-9]\d*$/.test(url.pathname) ? url : null;
}

function mirrorLink(value: string, base: string): URL | null {
  const url = publicLink(value, base);
  if (!url || url.protocol !== "https:" || url.search || url.hash) return null;
  const supported = (url.origin === "https://hubcloud.ist" && /^\/drive\/[a-z0-9]+\/?$/.test(url.pathname)) ||
    (url.origin === "https://hubdrive.pics" && /^\/file\/\d+\/?$/.test(url.pathname)) ||
    (["https://hubcdn.club", "https://hubcdn.wiki"].includes(url.origin) && /^\/file\/[A-Za-z0-9]+\/?$/.test(url.pathname));
  return supported ? url : null;
}

/** Read this provider's published payload as data; never execute its redirect scripts. */
export function decodeGreenMotorsDestination(html: string): URL | null {
  if (html.length > MAX_HTML) return null;
  const $ = load(html);
  const tokens = new Set<string>();
  $("script:not([src])").each((_, node) => {
    const script = $(node).html() || "";
    for (const match of script.matchAll(/\bs\s*\(\s*(['"])o\1\s*,\s*(['"])([A-Za-z0-9+/=]{1,8192})\2\s*,\s*180\s*\*\s*1000\s*\)/g)) {
      tokens.add(match[3]);
    }
  });
  if (tokens.size !== 1) return null;
  try {
    const json = decodeBase64(rot13(decodeBase64(decodeBase64([...tokens][0]))));
    const data: unknown = JSON.parse(json);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const fields = data as Record<string, unknown>;
    if (Object.keys(fields).sort().join(",") !== "l,o,w" ||
        !Number.isInteger(fields.w) || (fields.w as number) < 0 || (fields.w as number) > 120 ||
        fields.l !== "https://greenmotors.cc/homelander/" || typeof fields.o !== "string") return null;
    // These three known field values cannot contain property declarations; repeated
    // keys signal an ambiguous payload even though JSON.parse would accept them.
    if (["w", "l", "o"].some((key) => [...json.matchAll(new RegExp(`"${key}"\\s*:`, "g"))].length !== 1)) return null;
    const destination = decodeBase64(fields.o);
    const url = archiveLink(destination) || mirrorLink(destination, "https://hblinks.lol");
    return url && destination.startsWith("https://") && url.href === destination ? url : null;
  } catch {
    return null;
  }
}

/** Keep archive-only callers from mistaking a direct provider page for an archive. */
export function decodeGreenMotorsArchive(html: string): URL | null {
  const destination = decodeGreenMotorsDestination(html);
  return destination ? archiveLink(destination.href) : null;
}

/** Archive mirrors remain candidates until the existing resolver verifies the file metadata. */
export function parseGreenMotorsMirrors(html: string, archiveUrl: string | URL): string[] {
  if (html.length > MAX_HTML || !archiveLink(String(archiveUrl))) return [];
  const $ = load(html);
  const mirrors = new Set<string>();
  $(".entry-content a[href]").each((_, node) => {
    if ($(node).closest("nav,header,footer,aside,#comments,.comments").length) return;
    const url = mirrorLink($(node).attr("href") || "", String(archiveUrl));
    if (url && mirrors.size < 10) mirrors.add(url.href);
  });
  return [...mirrors];
}
