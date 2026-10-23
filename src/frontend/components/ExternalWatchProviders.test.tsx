import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ExternalWatchProviders from "./ExternalWatchProviders";
describe("more watch providers", () => {
  it("labels external players as unverified and updates URLs when the selected episode changes", () => {
    const identity = { contentId: 42, contentType: "tv" as const };
    const view = render(<ExternalWatchProviders identity={identity} title="Example" season={2} episode={3} />);
    expect(screen.getByText(/availability unverified/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open VidLink/ })).toHaveAttribute("href", "https://vidlink.pro/tv/42/2/3?autoplay=false");
    view.rerender(<ExternalWatchProviders identity={identity} title="Example" season={2} episode={4} />);
    expect(screen.getByRole("link", { name: /Open VidLink/ })).toHaveAttribute("href", "https://vidlink.pro/tv/42/2/4?autoplay=false");
    expect(screen.getByRole("link", { name: /Open VidLink/ })).toHaveAttribute("rel", "noopener noreferrer");
    view.rerender(<ExternalWatchProviders identity={identity} title="Example" season={2} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/Choose an episode/)).toBeInTheDocument();
  });
});
