import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentSourceLinks } from "@/shared/lib/watchSources";
import type { ContentWatchSources, FetchContentSourcesResult, WatchSourceLink } from "@/shared/types/watchSources";
import FetchWatchLinksButton from "@/frontend/components/FetchWatchLinksButton";
import { WatchLinksSection } from "@/frontend/components/WatchSourceLinks";
import { useWatchSources } from "./useWatchSources";

const mocks = vi.hoisted(() => ({ read: vi.fn(), import: vi.fn(), auth: vi.fn() }));
vi.mock("@/frontend/lib/mongodbClient", () => ({ getWatchSources: mocks.read, fetchWatchLinks: mocks.import }));
vi.mock("@/frontend/hooks/useAuth", () => ({ useAuth: mocks.auth }));
const link: WatchSourceLink = { id: "movie", label: "WATCH", url: "https://player.example/42", host: "player.example", kind: "watch",
  verification: "unverified", quality: null, resolution: null, codec: null, bitDepth: null, size: null, formats: [], languages: [],
  scope: "movie", season: null, episode: null, episodeEnd: null };
const content: ContentWatchSources = { contentId: 42, contentType: "movie", sources: [{
  provider: "hdhub", sourcePage: "https://source.example/title/", title: "Example", checkedAt: null, links: [link],
}] };

function Detail({ id }: { id: number }) {
  const sources = useWatchSources(id, "movie");
  return <>
    <FetchWatchLinksButton key={id} contentId={id} contentType="movie" title="Example" />
    <WatchLinksSection heading="Saved players" context={`movie ${id}`} links={contentSourceLinks(sources.data)}
      isLoading={sources.isLoading} isError={sources.isError} />
  </>;
}

function provider(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { role: "user" } });
  mocks.read.mockResolvedValue(content);
});

describe("saved source queries", () => {
  it("deduplicates reads for the same title and never imports on a viewer visit", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<><Detail id={42} /><Detail id={42} /></>, { wrapper: provider(client) });
    await waitFor(() => expect(screen.getAllByRole("link", { name: /Watch movie 42/ })).toHaveLength(2));
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.read).toHaveBeenCalledWith(42, "movie", expect.any(AbortSignal));
    expect(mocks.import).not.toHaveBeenCalled();
    client.clear();
  });

  it("does not display the previous movie's links while the next movie loads", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<Detail id={42} />, { wrapper: provider(client) });
    await screen.findByRole("link", { name: /Watch movie 42/ });
    mocks.read.mockReturnValue(new Promise(() => {}));
    view.rerender(<Detail id={99} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading watch links");
    client.clear();
  });

  it("updates the detail page immediately after a regular user fetches links without another lookup", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.read.mockResolvedValue({ ...content, sources: [] });
    const result: FetchContentSourcesResult = { status: "imported", content, importedPages: 1, errors: 0 };
    mocks.import.mockResolvedValue(result);
    render(<Detail id={42} />, { wrapper: provider(client) });
    await screen.findByText("No watch links available yet.");
    fireEvent.click(screen.getByRole("button", { name: "Fetch links" }));
    await screen.findByText("1 link available for this title.");
    const saved = await screen.findByRole("region", { name: "Saved players" });
    await waitFor(() => expect(within(saved).getByRole("link", { name: /Watch movie 42/ })).toHaveAttribute("href", link.url));
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.import).toHaveBeenCalledOnce();
    client.clear();
  });
});
