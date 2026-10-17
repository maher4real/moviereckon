import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchSourceLink } from "@/shared/types/watchSources";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: string, data: unknown) => void>(),
  load: vi.fn(), attach: vi.fn(), destroy: vi.fn(), supported: vi.fn(),
  engine: { currentLevel: -1, audioTrack: 0 },
  config: null as Record<string, unknown> | null,
}));
vi.mock("hls.js", () => ({ FetchLoader: class {}, default: class {
  constructor(config: Record<string, unknown>) { mocks.config = config; }
  static isSupported = mocks.supported;
  static Events = { ERROR: "error", MANIFEST_PARSED: "manifest", AUDIO_TRACKS_UPDATED: "audio" };
  levels = [{ height: 480 }, { height: 1080 }];
  set currentLevel(value: number) { mocks.engine.currentLevel = value; }
  set audioTrack(value: number) { mocks.engine.audioTrack = value; }
  on(event: string, handler: (event: string, data: unknown) => void) { mocks.handlers.set(event, handler); }
  loadSource = mocks.load;
  attachMedia = mocks.attach;
  destroy = mocks.destroy;
} }));
import DirectWatchPlayer from "./DirectWatchPlayer";

const link: WatchSourceLink = { id: "hls", label: "WATCH", url: "https://media.example/movie.m3u8", host: "media.example", kind: "watch",
  verification: "unverified", quality: null, resolution: null, codec: null, bitDepth: null, size: null,
  formats: [], languages: [], scope: "movie", season: null, episode: null, episodeEnd: null };
beforeEach(() => {
  vi.clearAllMocks(); mocks.handlers.clear(); mocks.supported.mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("HLS player lifecycle", () => {
  it("plays supplied playlist metadata from a local Blob and releases it on close", async () => {
    const create = vi.fn((_blob: Blob) => "blob:https://moviereckon.example/playlist");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
    render(<DirectWatchPlayer link={link} context="Example" media={{ url: link.url, format: "hls", label: "720p",
      hlsPlaylist: "#EXTM3U\n#EXTINF:4,\nhttps://media.example/segment.ts\n#EXT-X-ENDLIST\n" }} />);
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Play here/ }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith("blob:https://moviereckon.example/playlist"));
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(revoke).toHaveBeenCalledWith("blob:https://moviereckon.example/playlist");
  });
  it("honors a source's referrer policy for playlist and media fetches even when native HLS is advertised", async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("probably");
    render(<DirectWatchPlayer link={link} context="Example" media={{ url: link.url, format: "hls", label: "Auto", referrerPolicy: "no-referrer" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Play here/ }));
    await waitFor(() => expect(mocks.attach).toHaveBeenCalled());
    const setup = mocks.config!.fetchSetup as (context: { url: string }, init: RequestInit) => Request;
    const request = setup({ url: "https://media.example/fragment" }, { method: "GET" });
    expect(request.referrerPolicy).toBe("no-referrer");
    expect(request.url).toBe("https://media.example/fragment");
    expect(mocks.config!.loader).toBeDefined();
  });
  it("loads HLS on demand, uses manifest quality/audio choices, and stops the player when closed", async () => {
    render(<DirectWatchPlayer link={link} context="Example" />);
    expect(mocks.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Play here/ }));
    await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith(document.querySelector("video")));
    expect(mocks.load).toHaveBeenCalledWith(link.url);
    act(() => {
      mocks.handlers.get("manifest")!("manifest", {});
      mocks.handlers.get("audio")!("audio", { audioTracks: [{ name: "English" }, { name: "Hindi" }] });
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Quality" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Audio" }), { target: { value: "1" } });
    expect(mocks.engine).toEqual({ currentLevel: 1, audioTrack: 1 });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(document.querySelector("video")).toBeNull();
  });
  it("reports fatal HLS errors instead of opening the provider page", async () => {
    render(<DirectWatchPlayer link={link} context="Example" />);
    fireEvent.click(screen.getByRole("button", { name: /Play here/ }));
    await waitFor(() => expect(mocks.handlers.has("error")).toBe(true));
    act(() => { mocks.handlers.get("error")!("error", { fatal: true }); });
    expect(screen.getByRole("alert")).toHaveTextContent("This stream could not play here");
    expect(mocks.destroy).toHaveBeenCalled();
  });
});
