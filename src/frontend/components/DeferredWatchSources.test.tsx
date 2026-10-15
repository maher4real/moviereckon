import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeferredWatchSources from "./DeferredWatchSources";

const mocks = vi.hoisted(() => ({ read: vi.fn(), fetch: vi.fn() }));
vi.mock("@/frontend/lib/mongodbClient", () => ({ getWatchSources: mocks.read, fetchWatchLinks: mocks.fetch }));
vi.mock("@/frontend/hooks/useAuth", () => ({ useAuth: () => ({ user: { role: "user" } }) }));
let frames: Array<FrameRequestCallback>;
let idles: Array<() => void>;
let client: QueryClient;
const content = { contentId: 42, contentType: "movie", sources: [] };

beforeEach(() => {
  vi.clearAllMocks(); frames = []; idles = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("requestIdleCallback", vi.fn((callback: () => void) => { idles.push(callback); return idles.length; }));
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  mocks.read.mockResolvedValue(content);
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
const view = (id = 42) => <QueryClientProvider client={client}><DeferredWatchSources contentId={id} contentType="movie" title="Example" /></QueryClientProvider>;

async function release() {
  await act(async () => { frames.shift()?.(0); frames.shift()?.(16); idles.splice(0).forEach((callback) => callback()); });
}

describe("deferred watch section", () => {
  it("paints a circular section loader and waits for two frames and idle before reading saved sources", async () => {
    render(view());
    expect(screen.getByRole("status")).toHaveTextContent("Loading saved links");
    expect(screen.getByRole("status").querySelector("svg")).toHaveClass("animate-spin");
    expect(mocks.read).not.toHaveBeenCalled();
    act(() => { frames.shift()?.(0); });
    expect(mocks.read).not.toHaveBeenCalled();
    act(() => { frames.shift()?.(16); });
    expect(mocks.read).not.toHaveBeenCalled();
    await act(async () => { idles.splice(0).forEach((callback) => callback()); });
    await screen.findByText("No watch links available yet.");
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("cancels a pending saved read before a clicked import updates the page, without opening a modal", async () => {
    let oldResolve!: (value: typeof content) => void;
    mocks.read.mockReturnValue(new Promise((resolve) => { oldResolve = resolve; }));
    const saved = { ...content, sources: [{ provider: "hdhub", title: "Example", checkedAt: null, sourcePage: "https://source.example/title/", links: [{
      id: "watch", kind: "watch", label: "WATCH", scope: "movie", url: "https://player.example/watch", host: "player.example",
    }] }] };
    mocks.fetch.mockResolvedValue({ status: "imported", content: saved, importedPages: 1, errors: 0 });
    render(view()); await release();
    fireEvent.click(await screen.findByRole("button", { name: "Fetch links" }));
    await screen.findByRole("link", { name: /Watch Example/ });
    expect((mocks.read.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => { oldResolve(content); });
    expect(screen.getByRole("link", { name: /Watch Example/ })).toHaveAttribute("href", "https://player.example/watch");
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("shares one saved-source query between deferred series and episode sections", async () => {
    render(<QueryClientProvider client={client}>
      <DeferredWatchSources contentId={321} contentType="tv" title="Example" />
      <DeferredWatchSources contentId={321} contentType="tv" title="Example" variant="episode" season={1} episode={1} />
    </QueryClientProvider>);
    await act(async () => { while (frames.length) frames.shift()?.(16); idles.splice(0).forEach((callback) => callback()); });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    expect(mocks.read).toHaveBeenCalledWith(321, "tv", expect.any(AbortSignal));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
