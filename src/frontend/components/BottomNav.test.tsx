import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({
  motion: {
    nav: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <nav {...props}>{children}</nav>,
    span: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  },
}));

const watchlist = vi.hoisted(() => ({ current: null as null | { items: Array<{ watched: boolean }>; isOpen: boolean; openPanel: () => void } }));
vi.mock("@/frontend/hooks/useWatchlist", () => ({ useOptionalWatchlist: () => watchlist.current }));

import BottomNav from "./BottomNav";

beforeEach(() => { watchlist.current = null; });

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("renders the route tabs and marks the active route", () => {
    renderAt("/reckon");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Home", "Reckon", "Movies", "Series", "Upcoming"]);
    expect(screen.getByRole("link", { name: "Reckon" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("uses a Watchlist tab instead of a floating button and hides no tab on narrow phones", () => {
    const openPanel = vi.fn();
    watchlist.current = { items: [{ watched: false }, { watched: false }, { watched: true }], isOpen: false, openPanel };
    renderAt("/home");
    const tab = screen.getByRole("button", { name: "Watchlist, 2 unwatched" });
    expect(tab).toHaveAttribute("data-watchlist-target");
    fireEvent.click(tab);
    expect(openPanel).toHaveBeenCalledOnce();
    expect(screen.getByRole("navigation").innerHTML).not.toMatch(/max-\[\d+px\]:(hidden|grid-cols-5)/);
  });

  it("keeps Upcoming visible at every width so it is always one tap away", () => {
    renderAt("/upcoming");
    const upcoming = screen.getByRole("link", { name: "Upcoming" });
    expect(upcoming.className).not.toMatch(/(^|\s)max-\[\d+px\]:hidden/);
    expect(upcoming).toHaveAttribute("aria-current", "page");
  });

  it("keeps the iOS safe-area padding on the nav", () => {
    renderAt("/home");
    expect(screen.getByRole("navigation")).toHaveClass("safe-area-bottom");
  });
});
