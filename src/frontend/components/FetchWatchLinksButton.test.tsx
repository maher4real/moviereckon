import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FetchWatchLinksButton from "./FetchWatchLinksButton";
import type { FetchContentSourcesResult, WatchSourceLink } from "@/shared/types/watchSources";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn(), setQueryData: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ setQueryData: mocks.setQueryData }) }));
vi.mock("@/frontend/hooks/useAuth", () => ({ useAuth: mocks.auth }));
vi.mock("@/frontend/lib/mongodbClient", () => ({ fetchWatchLinks: mocks.fetch }));
const link: WatchSourceLink = { id: "watch", label: "Player 1", url: "https://player.example/42", host: "player.example", kind: "watch", verification: "unverified",
  quality: null, resolution: null, codec: null, bitDepth: null, size: null, formats: [], languages: [], scope: "movie", season: null, episode: null, episodeEnd: null };
const result: FetchContentSourcesResult = { status: "imported", importedPages: 1, errors: 0, content: { contentId: 42, contentType: "movie", sources: [{
  provider: "hdhub", sourcePage: "https://source.example/title/", checkedAt: null, title: "Example", links: [link,
    { ...link, id: "download", label: "1080p HEVC", url: "https://download.example/42", kind: "download", quality: "1080p" }],
}] } };

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockReturnValue({ user: { role: "admin" } }); mocks.fetch.mockResolvedValue(result); });

describe("Fetch links action", () => {
  it("fetches the selected movie and displays separate watch and quality options", async () => {
    render(<FetchWatchLinksButton contentId={42} contentType="movie" title="Example" />);
    fireEvent.click(screen.getByRole("button", { name: "Fetch links" }));
    expect(mocks.fetch).toHaveBeenCalledWith(42, "movie", undefined, expect.any(AbortSignal));
    expect(await screen.findByRole("link", { name: /Player 1/ })).toHaveAttribute("href", link.url);
    expect(screen.getByRole("region", { name: "Download options" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 links available");
    expect(mocks.setQueryData).toHaveBeenCalledWith(["watch-sources", "movie", 42], result.content);
  });
  it("prevents duplicate clicks while a request is pending", async () => {
    let resolve!: (value: FetchContentSourcesResult) => void;
    mocks.fetch.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<FetchWatchLinksButton contentId={42} contentType="movie" title="Example" />);
    const pending = screen.getByRole("button", { name: "Fetch links" });
    fireEvent.click(pending);
    expect(pending).toHaveTextContent("Fetching links");
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    resolve(result);
    await screen.findByRole("link", { name: /Player 1/ });
  });
  it("allows a source URL fallback for a series and explains empty discovery", async () => {
    mocks.fetch.mockResolvedValueOnce({ ...result, status: "not_found", content: { sources: [] } });
    render(<FetchWatchLinksButton contentId={321} contentType="tv" title="Signal Show" />);
    fireEvent.click(screen.getByRole("button", { name: "Fetch links" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matching source"));
    const input = screen.getByRole("textbox", { name: "HDHub source-page URL" });
    fireEvent.change(input, { target: { value: "https://source.example/show/" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch from page" }));
    expect(mocks.fetch).toHaveBeenLastCalledWith(321, "tv", "https://source.example/show/", expect.any(AbortSignal));
    await screen.findByRole("link", { name: /Player 1/ });
  });
  it("shows actionable failures and hides the control for non-admins", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("Configure TMDB_API_KEY on the server"));
    const { unmount } = render(<FetchWatchLinksButton contentId={42} contentType="movie" title="Example" />);
    fireEvent.click(screen.getByRole("button", { name: "Fetch links" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("TMDB_API_KEY");
    unmount();
    mocks.auth.mockReturnValue({ user: { role: "user" } });
    render(<FetchWatchLinksButton contentId={42} contentType="movie" title="Example" />);
    expect(screen.queryByRole("button", { name: "Fetch links" })).not.toBeInTheDocument();
  });
  it("aborts an in-flight request when navigating to another title", () => {
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<FetchWatchLinksButton key="movie:42" contentId={42} contentType="movie" title="Example" />);
    fireEvent.click(screen.getByRole("button", { name: "Fetch links" }));
    const signal = mocks.fetch.mock.calls[0][3] as AbortSignal;
    rerender(<FetchWatchLinksButton key="movie:43" contentId={43} contentType="movie" title="Another movie" />);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
