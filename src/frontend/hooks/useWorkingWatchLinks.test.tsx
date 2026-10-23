import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchLinkCheck, WatchSourceLink } from "@/shared/types/watchSources";
const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/frontend/lib/mongodbClient", () => ({ checkWatchLinks: mocks.check }));
import { useWorkingWatchLinks } from "./useWorkingWatchLinks";
const base: WatchSourceLink = { id: "ep1", label: "720p", url: "https://hubcdn.club/file/episode1", host: "hubcdn.club", kind: "download",
  verification: "unverified", quality: "720p", resolution: 720, codec: "H.264", bitDepth: null, size: null,
  formats: [], languages: [], scope: "episode", season: 1, episode: 1, episodeEnd: null };
let id = 1000;
beforeEach(() => { vi.resetAllMocks(); id++; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const identity = () => ({ contentId: id, contentType: "tv" as const });
const result = (link = base, available = true, seconds = 120): WatchLinkCheck => ({ linkId: link.id, url: link.url, available, downloads: [],
  checkedAt: new Date().toISOString(), validUntil: new Date(Date.now() + seconds * 1000).toISOString() });

describe("working-only source lists", () => {
  it("keeps pending and failed sources hidden while revealing independent successful checks", async () => {
    let finish!: (checks: WatchLinkCheck[]) => void;
    mocks.check.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const failed = { ...base, id: "failed", url: "https://hubcdn.club/file/failed" };
    const external = { ...base, id: "external", url: "https://ads.example/page" };
    const { result: hook } = renderHook(() => useWorkingWatchLinks([base, failed, external], identity()));
    expect(hook.current.confirmed).toEqual([]); expect(hook.current.isChecking).toBe(true);
    expect(mocks.check.mock.calls[0][1]).toEqual([base.id, failed.id]);
    await act(async () => finish([result(), result(failed, false)]));
    expect(hook.current.confirmed.map((item) => item.link.id)).toEqual([base.id]);
    expect(hook.current.isChecking).toBe(false);
  });
  it("checks every batch after finding working links and continues past a failed batch", async () => {
    vi.useFakeTimers();
    const links = Array.from({ length: 12 }, (_, index) => ({ ...base, id: `mirror${index}`, url: `https://hubcdn.club/file/mirror${index}` }));
    const batchResult = async (_identity: unknown, ids: string[]) => ids.map((id) => result(links.find((link) => link.id === id)!));
    mocks.check.mockImplementationOnce(batchResult).mockRejectedValueOnce(new Error("Temporary failure")).mockImplementation(batchResult);
    const hook = renderHook(() => useWorkingWatchLinks(links, identity()));
    await act(async () => { await Promise.resolve(); }); expect(hook.result.current.confirmed).toHaveLength(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(6500); });
    expect(mocks.check).toHaveBeenCalledTimes(3);
    expect(mocks.check.mock.calls.flatMap((call) => call[1])).toEqual(links.map((link) => link.id));
    expect(hook.result.current.confirmed).toHaveLength(8); expect(hook.result.current.isChecking).toBe(false);
  });
  it("reuses fresh checks but never reuses another title or changed destination", async () => {
    mocks.check.mockResolvedValue([result()]);
    const first = renderHook(() => useWorkingWatchLinks([base], identity()));
    await waitFor(() => expect(first.result.current.confirmed).toHaveLength(1)); first.unmount();
    const next = renderHook(({ link, contentId }) => useWorkingWatchLinks([link], { contentId, contentType: "tv" }), { initialProps: { link: base, contentId: id } });
    await waitFor(() => expect(next.result.current.confirmed).toHaveLength(1));
    expect(mocks.check).toHaveBeenCalledOnce();
    mocks.check.mockReturnValue(new Promise(() => {}));
    next.rerender({ link: base, contentId: id + 100 }); expect(next.result.current.confirmed).toEqual([]);
    next.rerender({ link: { ...base, url: "https://hubcdn.club/file/changed" }, contentId: id }); expect(next.result.current.confirmed).toEqual([]);
  });
  it("aborts stale episode checks and ignores late results", async () => {
    let finish!: (checks: WatchLinkCheck[]) => void;
    mocks.check.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValue([]);
    const next = { ...base, id: "ep2", episode: 2, url: "https://hubcdn.club/file/episode2" };
    const hook = renderHook(({ link }) => useWorkingWatchLinks([link], identity()), { initialProps: { link: base } });
    const signal = mocks.check.mock.calls[0][2] as AbortSignal;
    hook.rerender({ link: next }); expect(signal.aborted).toBe(true);
    await act(async () => finish([result()])); expect(hook.result.current.confirmed).toEqual([]);
  });
  it("removes expired checks while a new validation is pending", async () => {
    vi.useFakeTimers(); mocks.check.mockResolvedValueOnce([result(base, true, 2)]).mockReturnValue(new Promise(() => {}));
    const hook = renderHook(() => useWorkingWatchLinks([base], identity()));
    await act(async () => { await Promise.resolve(); }); expect(hook.result.current.confirmed).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(hook.result.current.confirmed).toEqual([]); expect(mocks.check).toHaveBeenCalledTimes(2);
  });
  it("hides newly failed actions and never treats an endpoint error as success", async () => {
    mocks.check.mockResolvedValueOnce([result()]);
    const hook = renderHook(() => useWorkingWatchLinks([base], identity()));
    await waitFor(() => expect(hook.result.current.confirmed).toHaveLength(1));
    act(() => hook.result.current.reject(base)); expect(hook.result.current.confirmed).toEqual([]);
    mocks.check.mockRejectedValue(new Error("503")); act(() => hook.result.current.refresh());
    await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.confirmed).toEqual([]);
    expect(mocks.check.mock.calls.at(-1)![3]).toBe(true);
  });
});
