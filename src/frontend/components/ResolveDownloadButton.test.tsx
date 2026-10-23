import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResolveDownloadButton from "./ResolveDownloadButton";
import { WatchSourceOptions } from "./WatchSourceLinks";
import type { ResolvedDownload, WatchSourceLink } from "@/shared/types/watchSources";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/frontend/lib/mongodbClient", () => ({ resolveDownloadLink: mocks.resolve }));
const identity = { contentId: 321, contentType: "tv" as const };
const link: WatchSourceLink = { id: "download-ep1", label: "720p", url: "https://hubcdn.club/file/episode1", host: "hubcdn.club", kind: "download",
  verification: "unverified", quality: "720p", resolution: 720, codec: "H.264", bitDepth: null, size: "515MB",
  formats: [], languages: [], scope: "episode", season: 1, episode: 1, episodeEnd: null };
const file: ResolvedDownload = { url: "https://storage.example/file", filename: "The.Trap.S01E01.720p.x264.mkv", sizeBytes: 540426006,
  contentType: "video/x-matroska", checkedAt: "2026-10-15T11:00:00Z", expiresAt: null };
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue([file]); });
afterEach(() => cleanup());

describe("final download link action", () => {
  it("distinguishes generic provider labels by resolution and codec", () => {
    render(<><ResolveDownloadButton identity={identity} link={{ ...link, label: "Instant" }} /><ResolveDownloadButton identity={identity} link={{ ...link, id: "1080p", label: "Instant", quality: "1080p", resolution: 1080 }} /></>);
    expect(screen.getByRole("button", { name: "Get file link: S1 E1 · 720p · Instant · H.264" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get file link: S1 E1 · 1080p · Instant · H.264" })).toBeInTheDocument();
  });
  it("resolves only after a click for the selected content/link and shows the final file rather than opening the intermediate page", async () => {
    render(<ResolveDownloadButton identity={identity} link={link} />);
    expect(mocks.resolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Get file link/ }));
    expect(mocks.resolve).toHaveBeenCalledWith(identity, "download-ep1", expect.any(AbortSignal));
    const download = await screen.findByRole("link", { name: "Download file" });
    expect(download).toHaveAttribute("href", file.url);
    expect(download).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(download).toHaveAttribute("rel", "noopener noreferrer");
    expect(download).toHaveTextContent("515.4 MB");
    expect(screen.queryByRole("link", { name: /hubcdn/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Get file link/ }));
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    await screen.findByRole("link", { name: "Download file" });
  });
  it("removes expiring download actions and offers refresh", async () => {
    mocks.resolve.mockResolvedValue([{ ...file, expiresAt: new Date(Date.now() + 60_000).toISOString() }]);
    render(<ResolveDownloadButton identity={identity} link={link} />);
    fireEvent.click(screen.getByRole("button", { name: /Get file link/ }));
    await screen.findByRole("link", { name: "Download file" });
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 70_000);
    try {
      await screen.findByText("File links expired. Refresh to get a new link.", {}, { timeout: 2000 });
      expect(screen.queryByRole("link", { name: "Download file" })).not.toBeInTheDocument();
    } finally { now.mockRestore(); }
  });
  it("never plays a resolved MP4 inside the app — only offers the download", async () => {
    mocks.resolve.mockResolvedValue([{ ...file, contentType: "video/mp4", filename: "The.Trap.S01E01.720p.x264.mp4" }]);
    render(<ResolveDownloadButton identity={identity} link={link} />);
    fireEvent.click(screen.getByRole("button", { name: /Get file link/ }));
    expect(await screen.findByRole("link", { name: "Download file" })).toHaveAttribute("href", file.url);
    expect(screen.queryByRole("button", { name: /Play here/ })).not.toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });
  it("shows a host error and retains the explicit retry action", async () => {
    mocks.resolve.mockRejectedValueOnce(new Error("No matching file could be confirmed"));
    render(<ResolveDownloadButton identity={identity} link={link} />);
    fireEvent.click(screen.getByRole("button", { name: /Get file link/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No matching file");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("prevents duplicate work and aborts resolution when navigating away", () => {
    mocks.resolve.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<ResolveDownloadButton identity={identity} link={link} />);
    const button = screen.getByRole("button", { name: /Get file link/ });
    fireEvent.click(button); fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(mocks.resolve).toHaveBeenCalledOnce();
    const signal = mocks.resolve.mock.calls[0][2] as AbortSignal;
    unmount(); expect(signal.aborted).toBe(true);
  });
  it("keeps unsupported ad pages out of the list", () => {
    render(<WatchSourceOptions identity={identity} context="Episode 1" links={[
      { ...link, id: "other", url: "https://other.example/page", host: "other.example" },
    ]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Get file link/ })).not.toBeInTheDocument();
  });
  it("reuses checked files immediately and removes the source when refreshing fails", async () => {
    const unavailable = vi.fn();
    mocks.resolve.mockRejectedValueOnce(new Error("File removed"));
    render(<ResolveDownloadButton identity={identity} link={link} initialFiles={[file]} onUnavailable={unavailable} />);
    expect(screen.getByRole("link", { name: "Download file" })).toHaveAttribute("href", file.url);
    expect(mocks.resolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Get file link/ }));
    await screen.findByRole("alert"); expect(unavailable).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
