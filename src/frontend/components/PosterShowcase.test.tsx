import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({ useReducedMotion: () => true }));
vi.mock("@/frontend/components/MediaImage", () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }));

import PosterShowcase, { type ShowcaseSlide } from "./PosterShowcase";

const slide = (id: string, src: string, title: string): ShowcaseSlide => ({ id, src, title, eyebrow: "Trending" });

describe("PosterShowcase", () => {
  it("shows a title once even when it arrives from several lists", () => {
    render(
      <PosterShowcase
        label="Trending"
        slides={[
          slide("movie-1", "/p/dune.jpg", "Dune"),
          slide("bollywood-1", "/p/dune.jpg", "Dune"), // same poster, different list
          slide("tv-2", "/p/dark.jpg", "Dark"),
          slide("movie-3", "/p/heat.jpg", "Heat"),
        ]}
      />,
    );
    // One dot per distinct title, so the repeated poster is not in the carousel.
    const dots = screen.getAllByRole("button", { name: /^Show / }).filter((button) => button.hasAttribute("aria-pressed"));
    expect(dots).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Show Dune" })).toHaveLength(1);
  });
});
