import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "@/frontend/hooks/useWatchlist";
import { TooltipProvider } from "@/frontend/components/ui/tooltip";

const mocks = vi.hoisted(() => ({ watchlist: {} as Record<string, unknown>, mobile: false }));

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/frontend/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/frontend/hooks/use-mobile", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("@/frontend/hooks/useWatchlist", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/frontend/hooks/useWatchlist")>()),
  useWatchlist: () => mocks.watchlist,
}));

import WatchlistPanel from "./WatchlistPanel";

const item = (id: number, title: string, status: WatchlistItem["status"]): WatchlistItem => ({
  id: `w${id}`, user_id: "u1", content_id: id, content_type: id % 2 ? "movie" : "tv", title, poster_path: null,
  added_at: "2026-10-01T00:00:00Z", position: id, watched: status === "completed", status,
});

const setStatus = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  setStatus.mockClear();
  mocks.mobile = false;
  mocks.watchlist = {
    items: [item(1, "Dune", "saved"), item(2, "Severance", "watching"), item(3, "Heat", "completed")],
    isLoading: false, isOpen: true, openPanel: vi.fn(), closePanel: vi.fn(), toggleItem: vi.fn(),
    isInWatchlist: () => true, removeItem: vi.fn().mockResolvedValue(undefined), setStatus, reorder: vi.fn().mockResolvedValue(undefined),
  };
});

function renderPanel() {
  return render(<MemoryRouter><TooltipProvider><WatchlistPanel /></TooltipProvider></MemoryRouter>);
}

describe("WatchlistPanel", () => {
  it("filters titles by status with counts, hiding empty statuses", () => {
    renderPanel();
    const filters = screen.getByRole("group", { name: "Filter watchlist" });
    expect(within(filters).getAllByRole("button").map((button) => button.textContent)).toEqual(["All3", "Saved1", "Watching1", "Completed1"]);
    expect(screen.getByRole("button", { name: "Open Dune" })).toBeInTheDocument();
    expect(screen.getByText("Watched · 1")).toBeInTheDocument();

    fireEvent.click(within(filters).getByRole("button", { name: /Watching/ }));
    expect(within(filters).getByRole("button", { name: /Watching/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Open Severance" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Dune" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Heat" })).not.toBeInTheDocument();
  });

  it("changes status from the status pill menu", async () => {
    renderPanel();
    const pill = screen.getByRole("button", { name: "Status for Dune: Saved" });
    fireEvent.pointerDown(pill, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Watching" }));
    expect(setStatus).toHaveBeenCalledWith(1, "movie", "watching");
  });

  it("has no floating button on phones and shows the list in a drawer", async () => {
    mocks.mobile = true;
    renderPanel();
    expect(screen.queryByRole("button", { name: "Open Watchlist" })).not.toBeInTheDocument();
    const drawer = await screen.findByRole("dialog", { name: "Watchlist" });
    expect(within(drawer).getByRole("button", { name: "Open Dune" })).toBeInTheDocument();
    expect(within(drawer).getByRole("group", { name: "Filter watchlist" })).toBeInTheDocument();
  });
});
