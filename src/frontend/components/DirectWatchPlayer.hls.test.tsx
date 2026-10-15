import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchSourceLink } from "@/shared/types/watchSources";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: string, data: unknown) => void>(),
  load: vi.fn(), attach: vi.fn(), destroy: vi.fn(), supported: vi.fn(),
  engine: { currentLevel: -1, audioTrack: 0 },
}));
vi.mock("hls.js", () => ({ default: class {
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("HLS player lifecycle", () => {
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
