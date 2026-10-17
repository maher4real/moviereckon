import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import type { ResolvedDownload, WatchSourceLink } from "@/shared/types/watchSources";
import { filenameMatchesSource, finalStorageUrl, resolveSourceDownloads } from "./downloads";

const MAX_OUTPUT = 256 * 1024;
const resultSchema = z.object({ downloads: z.array(z.object({
  url: z.string().max(12_000), filename: z.string().max(1000), sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  contentType: z.string().max(100), checkedAt: z.iso.datetime(), expiresAt: z.iso.datetime().nullable(),
})).max(8) });

function validate(raw: unknown, link: WatchSourceLink, title: string): ResolvedDownload[] {
  const { downloads } = resultSchema.parse(raw);
  if (downloads.some((file) => !finalStorageUrl(file.url) || !filenameMatchesSource(file.filename, link, title) ||
      (file.expiresAt && Date.parse(file.expiresAt) <= Date.now() + 30_000) ||
      !/^(?:video\/[a-z0-9.+-]+|application\/(?:octet-stream|zip|x-zip-compressed|x-rar-compressed|vnd\.rar|x-7z-compressed))$/.test(file.contentType))) {
    throw new Error("The Python resolver returned a file that does not match this content");
  }
  return downloads;
}

async function remotePython(url: string, payload: string): Promise<unknown> {
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password || endpoint.hash ||
      (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))) {
    throw new Error("Configure a trusted HTTPS Python worker URL");
  }
  const secret = process.env.WATCH_SOURCE_PYTHON_SECRET || "";
  if (secret.length < 32) throw new Error("Configure WATCH_SOURCE_PYTHON_SECRET for the Python worker");
  const response = await fetch(endpoint.href, { method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(27_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }, body: payload });
  if (!response.ok) { await response.body?.cancel(); throw new Error("The Python link worker is unavailable. Please try again"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The Python worker returned no result");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_OUTPUT) throw new Error("The Python worker response is too large");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function localPython(payload: string): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.WATCH_SOURCE_PYTHON_BIN || "python3", [path.join(process.cwd(), "scripts/resolve_watch_links.py"), "--stdin"],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("The Python link resolver timed out. Try another source")); }, 28_000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT) { child.kill("SIGKILL"); reject(new Error("The Python resolver response is too large")); }
      else chunks.push(chunk);
    });
    // Never echo provider URLs or Python process errors into client responses.
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => {});
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (error.code === "ENOENT") resolve(null);
      else reject(new Error("Unable to start the Python link resolver"));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) { reject(new Error("The Python resolver could not confirm this file. Try another source")); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("The Python resolver returned an invalid response")); }
    });
    child.stdin.end(payload);
  });
}

/** Exactly one engine handles a click. Local Python is started only on demand. */
export async function resolveContentDownloads(link: WatchSourceLink, title: string): Promise<ResolvedDownload[]> {
  const mode = process.env.WATCH_SOURCE_RESOLVER || "auto";
  if (!["auto", "python", "typescript"].includes(mode)) throw new Error("Invalid WATCH_SOURCE_RESOLVER");
  if (mode === "typescript") return resolveSourceDownloads(link, title);
  const payload = JSON.stringify({ title, link });
  const worker = process.env.WATCH_SOURCE_PYTHON_URL;
  if (worker) return validate(await remotePython(worker, payload), link, title);
  if (!process.env.VERCEL) {
    const result = await localPython(payload);
    if (result !== null) return validate(result, link, title);
  }
  if (mode === "python") throw new Error("Configure the Python worker URL or install Python 3 locally");
  return resolveSourceDownloads(link, title);
}
