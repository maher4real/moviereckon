import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentSourceLinks } from "@/shared/lib/watchSources";
import type { ContentWatchSources, WatchSourceLink } from "@/shared/types/watchSources";
import { EpisodeWatchLinks, WatchLinksSection } from "./WatchSourceLinks";
const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/frontend/lib/mongodbClient", () => ({ checkWatchLinks: mocks.check }));
const watch: WatchSourceLink = { id: "ep1", label: "WATCH", url: "https://hdstream4u.com/file/abcdefgh1234", host: "hdstream4u.com", kind: "watch",
  verification: "unverified", quality: "720p", resolution: 720, codec: "H.264", bitDepth: null, size: null,
  formats: [], languages: ["english"], scope: "episode", season: 1, episode: 1, episodeEnd: null };
let contentId = 200;
beforeEach(() => {
  vi.resetAllMocks(); contentId++;
  mocks.check.mockImplementation(async (_identity, ids: string[]) => ids.map((linkId) => ({ linkId, url: watch.url, available: true, downloads: [],
    checkedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 120_000).toISOString() })));
});
describe("saved watch links on detail pages", () => {
  it("checks only the exact episode and keeps other episodes and packs out", async () => {
    render(<EpisodeWatchLinks identity={{ contentId, contentType: "tv" }} season={1} episode={1} links={[watch,
      { ...watch, id: "ep2", episode: 2 }, { ...watch, id: "s2", season: 2 },
      { ...watch, id: "pack", scope: "season", episode: null }, { ...watch, id: "series", scope: "series", season: null },
    ]} />);
    const link = await screen.findByRole("link", { name: /Watch season 1 episode 1/ });
    expect(link).toHaveAttribute("href", watch.url); expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(mocks.check.mock.calls[0][1]).toEqual(["ep1"]);
  });
  it("hides uncheckable ranges and unknown external pages", () => {
    render(<EpisodeWatchLinks identity={{ contentId, contentType: "tv" }} season={1} episode={2} links={[
      { ...watch, id: "range", scope: "episode-range", episode: 1, episodeEnd: 3 },
      { ...watch, id: "unknown", episode: 2, url: "https://player.example/page" },
    ]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(mocks.check).not.toHaveBeenCalled();
  });
  it("shows missing episodes without a substitute player", () => {
    render(<EpisodeWatchLinks identity={{ contentId, contentType: "tv" }} season={1} episode={9} links={[watch]} />);
    expect(screen.getByText("No working links found.")).toBeInTheDocument(); expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("does not expose saved URLs when identity or successful verification is missing", async () => {
    const view = render(<WatchLinksSection heading="Watch movie" context="Example" links={[{ ...watch, scope: "movie" }]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    mocks.check.mockResolvedValue([]);
    view.rerender(<WatchLinksSection identity={{ contentId, contentType: "movie" }} heading="Watch movie" context="Example" links={[{ ...watch, scope: "movie" }]} />);
    await screen.findByText("No working links found."); expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("reports loading, empty and unavailable states and allows a retry", () => {
    const retry = vi.fn();
    const view = render(<WatchLinksSection heading="Watch movie" context="Example" links={[]} isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading watch links");
    view.rerender(<WatchLinksSection heading="Watch movie" context="Example" links={[]} />);
    expect(screen.getByText("No watch links available yet.")).toBeInTheDocument();
    view.rerender(<WatchLinksSection heading="Watch movie" context="Example" links={[]} isError onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry watch links" })); expect(retry).toHaveBeenCalledOnce();
  });
  it("deduplicates the same imported destination across multiple source pages", () => {
    const source = { provider: "hdhub" as const, sourcePage: "https://source.example/title/", title: "Example", checkedAt: null, links: [watch] };
    const content: ContentWatchSources = { contentId, contentType: "tv", sources: [source, { ...source, sourcePage: "https://source.example/another/" }] };
    expect(contentSourceLinks(content)).toEqual([watch]);
  });
});
