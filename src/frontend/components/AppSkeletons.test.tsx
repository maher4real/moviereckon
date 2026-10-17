import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CenteredAppSkeleton } from "./AppSkeletons";

describe("CenteredAppSkeleton", () => {
  it("fills the loading backdrop with real poster images, not empty skeleton tiles", () => {
    const { container } = render(<CenteredAppSkeleton />);
    const images = Array.from(container.querySelectorAll("img"));

    expect(images.length).toBeGreaterThanOrEqual(18);
    expect(images.every((img) => img.getAttribute("src")?.includes("/api/tmdb-image"))).toBe(true);
    // Lazy loading inside the animated, rotated marquee would never trigger.
    expect(images.every((img) => img.getAttribute("loading") === "eager")).toBe(true);
  });

  it("never shows the same poster twice at once", () => {
    const { container } = render(<CenteredAppSkeleton />);
    const rows = Array.from(container.querySelectorAll(".auth-poster-row"));
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Each row renders its posters twice so the loop is seamless. Only the first
    // copy can be on screen together, and tiles are sized so a row is wider than
    // the viewport, so compare the first copies across all rows.
    const firstCopies = rows.flatMap((row) => {
      const tiles = Array.from(row.querySelectorAll("img"));
      return tiles.slice(0, tiles.length / 2).map((img) => img.getAttribute("src"));
    });
    expect(new Set(firstCopies).size).toBe(firstCopies.length);

    // The repeated half is hidden from assistive technology.
    rows.forEach((row) => {
      const tiles = Array.from(row.querySelectorAll(".auth-poster-tile"));
      tiles.slice(tiles.length / 2).forEach((tile) => expect(tile).toHaveAttribute("aria-hidden", "true"));
    });
  });

  it("sizes tiles so one row is wider than the screen", () => {
    const { container } = render(<CenteredAppSkeleton />);
    const wall = container.querySelector<HTMLElement>(".auth-poster-row")?.parentElement;
    expect(wall?.style.getPropertyValue("--poster-tile-w")).toMatch(/112vw/);
  });
});
