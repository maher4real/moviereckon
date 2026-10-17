import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DirectWatchPlayer from "./DirectWatchPlayer";
import { WatchSourceOptions } from "./WatchSourceLinks";
import type { WatchSourceLink } from "@/shared/types/watchSources";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/frontend/lib/mongodbClient", () => ({ resolveWatchLink: mocks.resolve }));
const identity = { contentId: 42, contentType: "movie" as const };
const link: WatchSourceLink = { id: "player", label: "WATCH", url: "https://play4u.org/tt1234567", host: "play4u.org", kind: "watch",
  verification: "unverified", quality: null, resolution: null, codec: null, bitDepth: null, size: null,
  formats: [], languages: [], scope: "movie", season: null, episode: null, episodeEnd: null };
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  mocks.resolve.mockResolvedValue([{ url: "https://media.example/movie.m3u8", format: "hls", label: "Auto" }]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("direct playback controls", () => {
  it("loads only on click, uses an in-page player and never opens an external tab or offers a playlist as a download", async () => {
    render(<DirectWatchPlayer link={link} context="Example" identity={identity} />);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(document.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Play here/ }));
    const video = await screen.findByLabelText("Video for Example");
    await waitFor(() => expect(video).toHaveAttribute("src", "https://media.example/movie.m3u8"));
    expect(mocks.resolve).toHaveBeenCalledWith(identity, "player", expect.any(AbortSignal));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.error(video);
    expect(screen.getByRole("alert")).toHaveTextContent("This stream could not play here");
    fireEvent.click(screen.getByRole("button", { name: "Load stream again" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(2));
  });
  it("plays a scoped MP4 episode and exposes its file URL, without a server media proxy", async () => {
    render(<DirectWatchPlayer link={{ ...link, url: "https://media.example/s1e2.mp4", scope: "episode", season: 1, episode: 2 }} context="Episode 2" />);
    fireEvent.click(screen.getByRole("button", { name: /Play here/ }));
    expect(await screen.findByLabelText("Video for Episode 2")).toHaveAttribute("src", "https://media.example/s1e2.mp4");
    expect(screen.getByRole("link", { name: "Open / save video file" })).toHaveAttribute("href", "https://media.example/s1e2.mp4");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("reports resolution failures without silently navigating to ad pages", async () => {
    mocks.resolve.mockRejectedValueOnce(new Error("Provider unavailable"));
    render(<DirectWatchPlayer link={link} context="Example" identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: /Play here/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("aborts pending resolution on closing the player", async () => {
    mocks.resolve.mockReturnValue(new Promise(() => {}));
    render(<DirectWatchPlayer link={link} context="Example" identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: /Play here/ }));
    const signal = mocks.resolve.mock.calls[0][2] as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps unresolved pages collapsed and never treats season packs or episode ranges as direct episode playback", () => {
    render(<WatchSourceOptions identity={identity} context="Example" links={[
      { ...link, url: "https://other.example/player" },
      { ...link, id: "pack", url: "https://media.example/pack.mp4", scope: "season", season: 1 },
      { ...link, id: "range", url: "https://media.example/episodes.mp4", scope: "episode-range", season: 1, episode: 1, episodeEnd: 3 },
    ]} />);
    expect(screen.queryByRole("button", { name: /Play here/ })).not.toBeInTheDocument();
    expect(screen.getByText("External sites (1) · may show ads").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: /Season 1 pack/ })).toHaveAttribute("href", "https://media.example/pack.mp4");
    expect(screen.getByRole("link", { name: /Episodes 1–3/ })).toHaveAttribute("href", "https://media.example/episodes.mp4");
    expect(screen.getByText(/These are unverified provider pages/)).toBeInTheDocument();
  });
});
