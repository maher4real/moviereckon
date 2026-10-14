import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({
  motion: {
    nav: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <nav {...props}>{children}</nav>,
    span: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  },
}));

import BottomNav from "./BottomNav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("renders six tabs and marks the active route", () => {
    renderAt("/reckon");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Home", "Reckon", "Movies", "Series", "Upcoming", "Search"]);
    expect(screen.getByRole("link", { name: "Reckon" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("hides only Search below 400px (the header keeps a search button) and uses five columns", () => {
    renderAt("/home");
    // Tailwind compiles max-[400px]: to width < 400px, so 399px and fractions below 400 get five tabs.
    const hidden = screen.getAllByRole("link").filter((link) => link.className.includes("max-[400px]:hidden"));
    expect(hidden.map((link) => link.textContent)).toEqual(["Search"]);
    expect(screen.getByRole("navigation").innerHTML).toContain("max-[400px]:grid-cols-5");
    expect(screen.getByRole("navigation").innerHTML).not.toContain("max-[399px]");
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
