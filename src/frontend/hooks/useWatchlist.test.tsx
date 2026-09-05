import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistProvider, useWatchlist } from "./useWatchlist";
import type { MongoUser, WatchlistItem } from "@/frontend/lib/mongodbClient";

const mocks = vi.hoisted(() => ({
  user: null as MongoUser | null,
  fetchWatchlist: vi.fn(),
  toggleWatchlistItem: vi.fn(),
  removeWatchlistItem: vi.fn(),
  reorderWatchlist: vi.fn(),
  markWatchlistItemWatched: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("./useAuth", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/frontend/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/frontend/lib/mongodbClient", () => ({
  fetchWatchlist: mocks.fetchWatchlist,
  toggleWatchlistItem: mocks.toggleWatchlistItem,
  removeWatchlistItem: mocks.removeWatchlistItem,
  reorderWatchlist: mocks.reorderWatchlist,
  markWatchlistItemWatched: mocks.markWatchlistItemWatched,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function user(id: string): MongoUser {
  return {
    id,
    email: `${id}@example.test`,
    username: id,
    role: "user",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    emailVerified: true,
  };
}

function item(
  id: string,
  contentId: number,
  title: string,
  userId = "user-a",
): WatchlistItem {
  return {
    id,
    user_id: userId,
    content_id: contentId,
    content_type: "movie",
    title,
    poster_path: null,
    added_at: "2026-01-01T00:00:00.000Z",
    position: 0,
    watched: false,
  };
}

function Consumer() {
  const { items, toggleItem } = useWatchlist();
  return (
    <div>
      <output data-testid="items">{items.map((entry) => `${entry.id}:${entry.title}`).join("|")}</output>
      <button onClick={() => void toggleItem({ content_id: 1, content_type: "movie", title: "One", poster_path: null })}>
        add-one
      </button>
      <button onClick={() => void toggleItem({ content_id: 2, content_type: "movie", title: "Two", poster_path: null })}>
        add-two
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <WatchlistProvider>
      <Consumer />
    </WatchlistProvider>,
  );
}

describe("WatchlistProvider account and optimistic state", () => {
  beforeEach(() => {
    mocks.user = user("user-a");
    mocks.fetchWatchlist.mockReset();
    mocks.toggleWatchlistItem.mockReset();
    mocks.removeWatchlistItem.mockReset();
    mocks.reorderWatchlist.mockReset();
    mocks.markWatchlistItemWatched.mockReset();
    mocks.toast.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not let a previous account load repopulate the current account", async () => {
    const accountALoad = deferred<WatchlistItem[]>();
    const accountBLoad = deferred<WatchlistItem[]>();
    mocks.fetchWatchlist
      .mockReturnValueOnce(accountALoad.promise)
      .mockReturnValueOnce(accountBLoad.promise);

    const view = renderProvider();
    await waitFor(() => expect(mocks.fetchWatchlist).toHaveBeenCalledTimes(1));

    mocks.user = user("user-b");
    view.rerender(
      <WatchlistProvider>
        <Consumer />
      </WatchlistProvider>,
    );
    await waitFor(() => expect(mocks.fetchWatchlist).toHaveBeenCalledTimes(2));

    accountALoad.resolve([item("a-item", 10, "Account A", "user-a")]);
    await Promise.resolve();
    expect(screen.getByTestId("items")).not.toHaveTextContent("Account A");

    accountBLoad.resolve([item("b-item", 20, "Account B", "user-b")]);
    await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("Account B"));
    expect(screen.getByTestId("items")).not.toHaveTextContent("Account A");
  });

  it("reconciles each optimistic add independently", async () => {
    mocks.fetchWatchlist.mockResolvedValue([]);
    const firstToggle = deferred<{
      ok: true;
      action: "added";
      data: WatchlistItem;
    }>();
    const secondToggle = deferred<{
      ok: true;
      action: "added";
      data: WatchlistItem;
    }>();
    mocks.toggleWatchlistItem
      .mockReturnValueOnce(firstToggle.promise)
      .mockReturnValueOnce(secondToggle.promise);

    renderProvider();
    await waitFor(() => expect(mocks.fetchWatchlist).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "add-one" }));
    fireEvent.click(screen.getByRole("button", { name: "add-two" }));
    expect(screen.getByTestId("items")).toHaveTextContent("One");
    expect(screen.getByTestId("items")).toHaveTextContent("Two");

    secondToggle.resolve({ ok: true, action: "added", data: item("server-two", 2, "Two") });
    await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("server-two:Two"));
    expect(screen.getByTestId("items")).toHaveTextContent("One");

    firstToggle.resolve({ ok: true, action: "added", data: item("server-one", 1, "One") });
    await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("server-one:One"));
    expect(screen.getByTestId("items")).toHaveTextContent("server-two:Two");
  });
});
