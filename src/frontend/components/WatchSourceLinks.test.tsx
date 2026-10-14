import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { contentSourceLinks } from "@/shared/lib/watchSources";
import type { ContentWatchSources, WatchSourceLink } from "@/shared/types/watchSources";
import { EpisodeWatchLinks, WatchLinksSection } from "./WatchSourceLinks";

const watch: WatchSourceLink = { id: "ep1", label: "WATCH", url: "https://player.example/one", host: "player.example", kind: "watch",
  verification: "unverified", quality: "720p", resolution: 720, codec: "H.264", bitDepth: null, size: null,
  formats: [], languages: ["english"], scope: "episode", season: 1, episode: 1, episodeEnd: null };

describe("saved watch links on detail pages", () => {
  it("keeps episode players separate from other seasons, other episodes and season packs", () => {
    render(<EpisodeWatchLinks season={1} episode={1} links={[watch,
      { ...watch, id: "ep2", episode: 2 }, { ...watch, id: "s2", season: 2 },
      { ...watch, id: "pack", scope: "season", episode: null }, { ...watch, id: "series", scope: "series", season: null },
    ]} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", watch.url);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("labels a multi-episode player as a range instead of implying a single episode", () => {
    render(<EpisodeWatchLinks season={1} episode={2} links={[
      { ...watch, id: "range", scope: "episode-range", episode: 1, episodeEnd: 3 },
    ]} />);
    expect(screen.getByRole("link", { name: /Episodes 1–3/ })).toHaveTextContent("Episodes 1–3");
  });

  it("shows missing episodes without a substitute player", () => {
    render(<EpisodeWatchLinks season={1} episode={9} links={[watch]} />);
    expect(screen.getByText("Watch link unavailable for this episode.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("makes download qualities expandable without displaying them as watch players", () => {
    render(<WatchLinksSection heading="Watch movie" context="Example" links={[{ ...watch, scope: "movie" },
      { ...watch, id: "download", kind: "download", scope: "movie", label: "1080p HEVC", url: "https://download.example/file", quality: "1080p", codec: "HEVC", size: "2GB" },
    ]} />);
    const section = screen.getByRole("region", { name: "Watch movie" });
    expect(within(section).getByRole("link", { name: /^Watch Example/ })).toHaveAttribute("href", watch.url);
    const download = within(section).getByText("Download options (1)");
    const details = download.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(download);
    expect(details).toHaveAttribute("open");
    expect(within(section).getByRole("link", { name: /^Download Example/ })).toHaveAttribute("href", "https://download.example/file");
  });

  it("reports loading, empty and unavailable states and allows a retry", () => {
    const retry = vi.fn();
    const view = render(<WatchLinksSection heading="Watch movie" context="Example" links={[]} isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading watch links");
    view.rerender(<WatchLinksSection heading="Watch movie" context="Example" links={[]} />);
    expect(screen.getByText("No watch links available yet.")).toBeInTheDocument();
    view.rerender(<WatchLinksSection heading="Watch movie" context="Example" links={[]} isError onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry watch links" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("deduplicates the same imported destination across multiple source pages", () => {
    const source = { provider: "hdhub" as const, sourcePage: "https://source.example/title/", title: "Example", checkedAt: null, links: [watch] };
    const content: ContentWatchSources = { contentId: 42, contentType: "tv", sources: [source, { ...source, sourcePage: "https://source.example/another/" }] };
    expect(contentSourceLinks(content)).toEqual([watch]);
  });
});
