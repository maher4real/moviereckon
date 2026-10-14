import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CenteredAppSkeleton } from "./AppSkeletons";

describe("CenteredAppSkeleton", () => {
  it("fills the loading backdrop with real poster images, not empty skeleton tiles", () => {
    const { container } = render(<CenteredAppSkeleton />);
    const images = Array.from(container.querySelectorAll("img"));

    expect(images.length).toBeGreaterThanOrEqual(24);
    expect(images.every((img) => img.getAttribute("src")?.includes("/api/tmdb-image"))).toBe(true);
    // Several distinct posters, never a single repeated tile.
    expect(new Set(images.map((img) => img.getAttribute("src"))).size).toBeGreaterThan(3);
    // Lazy loading inside the animated, rotated marquee would never trigger.
    expect(images.every((img) => img.getAttribute("loading") === "eager")).toBe(true);
  });
});
