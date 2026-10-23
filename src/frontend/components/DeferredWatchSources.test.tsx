import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentWatchSources, FetchContentSourcesResult, SourceSearchEvent, WatchSourceLink } from "@/shared/types/watchSources";
import DeferredWatchSources from "./DeferredWatchSources";

const mocks = vi.hoisted(() => ({ read: vi.fn(), search: vi.fn(), check: vi.fn() }));
vi.mock("@/frontend/lib/mongodbClient", () => ({ getWatchSources: mocks.read, searchWatchLinks: mocks.search, checkWatchLinks: mocks.check }));
let client: QueryClient;
const content: ContentWatchSources = { contentId: 42, contentType: "movie", sources: [] };
const result: FetchContentSourcesResult = { status: "not_found", content, importedPages: 0, errors: 0 };
const link: WatchSourceLink = { id: "watch", kind: "watch", label: "HDStream", scope: "movie", url: "https://hdstream4u.com/file/abcdefgh1234", host: "hdstream4u.com",
  verification: "unverified", quality: "1080p", resolution: 1080, codec: "H.264", bitDepth: 8, size: null, formats: [], languages: [], season: null, episode: null, episodeEnd: null };
const populated: ContentWatchSources = { ...content, sources: [{ provider: "hdhub", title: "Example", checkedAt: null, sourcePage: "https://source.example/title/", links: [link,
  { ...link, id: "download", kind: "download", label: "File", url: "https://hubcdn.club/file/example", host: "hubcdn.club" }] }] };

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.check.mockImplementation(async (_identity, ids) => ids.map((id: string) => ({ linkId: id, url: populated.sources[0].links.find((item) => item.id === id)?.url,
    available: true, checkedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 120_000).toISOString(),
    downloads: id === "download" ? [{ url: "https://file.example/video.mkv", filename: "Example.720p.mkv", sizeBytes: 1234, contentType: "video/x-matroska", checkedAt: new Date().toISOString(), expiresAt: null }] : [] })));
  mocks.read.mockResolvedValue(content);
  mocks.search.mockResolvedValue(result);
});
afterEach(() => { cleanup(); client.clear(); });
const view = (id = 42) => <QueryClientProvider client={client}><DeferredWatchSources contentId={id} contentType="movie" title="Example" /></QueryClientProvider>;
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Watch movie" }));
  await screen.findByRole("tab", { name: /Watch/ });
}
const showTab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });

describe("watch source popup", () => {
  it("does no work before opening, searches automatically, reuses recent results and resets on title navigation", async () => {
    const rendered = render(view());
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.search).not.toHaveBeenCalled(); expect(mocks.check).not.toHaveBeenCalled();
    await open();
    await waitFor(() => expect(mocks.search).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Example" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await open();
    expect(mocks.search).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    rendered.rerender(view(43));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.search).toHaveBeenCalledOnce();
  });
  it("shows progressive rows before search completes and prevents an old read overwriting them", async () => {
    let oldResolve!: (value: ContentWatchSources) => void;
    let emit!: (event: SourceSearchEvent) => void;
    let finish!: (value: FetchContentSourcesResult) => void;
    mocks.read.mockReturnValue(new Promise((resolve) => { oldResolve = resolve; }));
    mocks.search.mockImplementation((_identity, callback) => { emit = callback; return new Promise((resolve) => { finish = resolve; }); });
    render(view()); await open();
    await waitFor(() => expect(mocks.search).toHaveBeenCalledOnce());
    act(() => emit({ type: "content", content: populated }));
    expect(screen.getByRole("tab", { name: /Download/ })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("button", { name: /Get file link/ })).toBeInTheDocument();
    showTab(/Watch/);
    const watchLink = await screen.findByRole("link", { name: /Watch Example/ });
    expect(watchLink).toHaveAttribute("href", link.url);
    expect(watchLink).toHaveAttribute("target", "_blank");
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("button", { name: "Search again" })).toBeDisabled();
    expect((mocks.read.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
    await act(async () => oldResolve(content));
    expect(screen.getByRole("link", { name: /Watch Example/ })).toBeInTheDocument();
    showTab(/Download/);
    expect(await screen.findByRole("button", { name: /Get file link/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Watch Example/ })).not.toBeInTheDocument();
    await act(async () => finish({ ...result, content: populated, status: "imported" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Search again" })).toBeEnabled());
  });
  it("aborts search on close and retries failures without losing saved links", async () => {
    mocks.read.mockResolvedValue(populated);
    mocks.search.mockRejectedValueOnce(new Error("Provider offline"));
    render(view()); await open();
    expect(await screen.findByText("Provider offline")).toBeInTheDocument();
    showTab(/Watch/);
    expect(await screen.findByRole("link", { name: /Watch Example/ })).toBeInTheDocument();
    mocks.search.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Search again" }));
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2));
    const signal = mocks.search.mock.calls[1][2] as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(signal.aborted).toBe(true);
  });
});
