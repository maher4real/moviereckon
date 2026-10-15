import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveContentDownloads } from "./downloadResolver";
import { parseSourcePage } from "./parser";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), fallback: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("./downloads", async (original) => ({ ...await original<typeof import("./downloads")>(), resolveSourceDownloads: mocks.fallback }));
const link = parseSourcePage('<h1>The Trap (Season 1)</h1><h2>DOWNLOAD LINKS</h2><h3>Episode 1</h3><h4>720p x264 <a href="https://hubcdn.club/file/episode1">Instant</a></h4>', "https://source.example/show/").links[0];
const file = { url: "https://pub-0123456789abcdef0123456789abcdef.r2.dev/file", filename: "The.Trap.S01E01.720p.x264.mkv", sizeBytes: 123,
  contentType: "application/octet-stream", checkedAt: "2026-10-15T11:00:00Z", expiresAt: null };

function child(result: unknown) {
  const process = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() });
  let input = "";
  process.stdin.on("data", (chunk) => { input += chunk.toString(); });
  process.stdin.on("finish", () => queueMicrotask(() => { process.stdout.emit("data", Buffer.from(JSON.stringify(result))); process.emit("close", 0); }));
  mocks.spawn.mockReturnValue(process);
  return () => JSON.parse(input);
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["VERCEL", "WATCH_SOURCE_PYTHON_URL", "WATCH_SOURCE_PYTHON_SECRET", "WATCH_SOURCE_PYTHON_BIN"]) vi.stubEnv(key, "");
  vi.stubEnv("WATCH_SOURCE_RESOLVER", "auto");
  mocks.fallback.mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Python resolver selection", () => {
  it("falls back once if the local Python executable is absent", async () => {
    mocks.spawn.mockImplementation(() => {
      const process = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() });
      queueMicrotask(() => process.emit("error", Object.assign(new Error("Not found"), { code: "ENOENT" })));
      return process;
    });
    expect(await resolveContentDownloads(link, "The Trap")).toEqual([]);
    expect(mocks.fallback).toHaveBeenCalledOnce();
  });
  it("starts Python only for the requested file and never runs both engines", async () => {
    const input = child({ downloads: [file] });
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(await resolveContentDownloads(link, "The Trap")).toEqual([file]);
    expect(input()).toEqual({ title: "The Trap", link });
    expect(mocks.spawn).toHaveBeenCalledWith("python3", [expect.stringContaining("scripts/resolve_watch_links.py"), "--stdin"], expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }));
    expect(mocks.fallback).not.toHaveBeenCalled();
  });
  it("validates Python results against the saved episode and fails without starting a second scrape", async () => {
    child({ downloads: [{ ...file, filename: file.filename.replace("S01E01", "S01E02") }] });
    await expect(resolveContentDownloads(link, "The Trap")).rejects.toThrow("does not match");
    expect(mocks.fallback).not.toHaveBeenCalled();
  });
  it("uses an authenticated worker for configured deployments and does not spawn a local process", async () => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("WATCH_SOURCE_PYTHON_URL", "https://worker.example/resolve");
    vi.stubEnv("WATCH_SOURCE_PYTHON_SECRET", "x".repeat(32));
    const request = vi.fn().mockResolvedValue(Response.json({ downloads: [file] })); vi.stubGlobal("fetch", request);
    expect(await resolveContentDownloads(link, "The Trap")).toEqual([file]);
    expect(request).toHaveBeenCalledWith("https://worker.example/resolve", expect.objectContaining({ method: "POST", redirect: "manual",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${"x".repeat(32)}` } }));
    expect(mocks.spawn).not.toHaveBeenCalled(); expect(mocks.fallback).not.toHaveBeenCalled();
  });
  it("keeps Vercel functional without assuming it has a Python executable", async () => {
    vi.stubEnv("VERCEL", "1");
    expect(await resolveContentDownloads(link, "The Trap")).toEqual([]);
    expect(mocks.fallback).toHaveBeenCalledOnce(); expect(mocks.spawn).not.toHaveBeenCalled();
    vi.stubEnv("WATCH_SOURCE_RESOLVER", "python");
    await expect(resolveContentDownloads(link, "The Trap")).rejects.toThrow("Configure the Python worker");
    expect(mocks.fallback).toHaveBeenCalledOnce();
  });
  it("does not retry a failed or redirected worker response through TypeScript", async () => {
    vi.stubEnv("WATCH_SOURCE_PYTHON_URL", "https://worker.example/resolve"); vi.stubEnv("WATCH_SOURCE_PYTHON_SECRET", "x".repeat(32));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://other.example" } })));
    await expect(resolveContentDownloads(link, "The Trap")).rejects.toThrow("unavailable");
    expect(mocks.fallback).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
