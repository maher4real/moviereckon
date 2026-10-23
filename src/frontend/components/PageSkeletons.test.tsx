import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RouteSkeleton } from "./PageSkeletons";
import { PosterGridSkeleton } from "./AppSkeletons";
import { Skeleton } from "./ui/skeleton";

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteSkeleton />
    </MemoryRouter>,
  );
}

describe("RouteSkeleton", () => {
  it.each([
    ["/home", ".streaming-hero", "Loading home"],
    ["/movies", ".browse-hero", "Loading titles"],
    ["/series", ".browse-hero", "Loading titles"],
    ["/upcoming", ".browse-hero", "Loading titles"],
    ["/movie/603", ".detail-hero-media", "Loading details"],
    ["/tv/1396", ".detail-hero-media", "Loading details"],
    ["/profile", ".profile-hero", "Loading profile"],
    ["/reckon", ".reckon-hero", "Loading your recommendations"],
    ["/reckon/preferences", ".reckon-hero", "Loading your recommendations"],
    ["/search", ".search-hero", "Loading search"],
  ])("matches the layout of %s", (path, selector, label) => {
    const { container } = at(path);
    expect(container.querySelector(selector), `${path} should render ${selector}`).not.toBeNull();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("shows the form-shaped skeleton on authentication routes", () => {
    for (const path of ["/auth", "/forgot-password"]) {
      const { container, unmount } = at(path);
      expect(container.querySelector(".surface-panel")).not.toBeNull();
      unmount();
    }
  });

  it("keeps the branded splash only for the landing route and loads no posters elsewhere", () => {
    const landing = at("/");
    expect(landing.container.querySelectorAll("img").length).toBeGreaterThan(0);
    landing.unmount();

    const home = at("/home");
    expect(home.container.querySelectorAll("img")).toHaveLength(0);
  });

  it("announces one loading state, not every placeholder block", () => {
    const { container } = at("/movies");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const blocks = container.querySelectorAll(".skeleton");
    expect(blocks.length).toBeGreaterThan(20);
    blocks.forEach((block) => expect(block).toHaveAttribute("aria-hidden", "true"));
  });
});

describe("Skeleton primitives", () => {
  it("uses the shimmer sweep instead of an opacity pulse", () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    expect(container.firstElementChild).toHaveClass("skeleton");
    expect(container.firstElementChild).not.toHaveClass("animate-pulse");
  });

  it("renders the poster grid with the same grid class as the real pages", () => {
    const { container } = render(<PosterGridSkeleton count={6} />);
    expect(container.firstElementChild).toHaveClass("content-grid");
    expect(container.querySelectorAll(".skeleton").length).toBe(18);
  });
});
