import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

let authenticated = false;

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined })),
}));

vi.mock("motion/react", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/frontend/hooks/useAuth", () => ({
  useAuth: () => ({ user: authenticated ? { id: "user-1" } : null }),
}));

vi.mock("@/frontend/components/MediaImage", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) => (
    <img alt={alt} className={className} src="/fallbacks/poster.svg" />
  ),
}));

import Landing from "./Landing";
import { useQuery } from "@tanstack/react-query";

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<p>Authentication screen</p>} />
        <Route path="/home" element={<p>Member home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MovieReckon landing page", () => {
  beforeEach(() => {
    authenticated = false;
  });

  it("introduces the product and sends guests to authentication", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Stop scrolling");
    fireEvent.click(screen.getAllByRole("link", { name: /get started/i })[0]);
    expect(screen.getByText("Authentication screen")).toBeInTheDocument();
  });

  it("sends signed-in members directly to the app", () => {
    authenticated = true;
    renderLanding();

    fireEvent.click(screen.getAllByRole("link", { name: /open moviereckon/i })[0]);
    expect(screen.getByText("Member home")).toBeInTheDocument();
  });

  it("never renders invented match scores, runtimes or user activity", () => {
    const { container } = renderLanding();
    const text = container.textContent || "";

    expect(text).not.toMatch(/\d+%\s*match/i);
    expect(text).not.toMatch(/\d+\s*min\b/i);
    expect(text).not.toMatch(/saved yesterday|because you liked/i);
  });

  it("shows a real rating and overview for the spotlight title when TMDB data is available", () => {
    const movie = {
      id: 1,
      title: "Real Title",
      overview: "A real synopsis from TMDB.",
      poster_path: "/a.jpg",
      release_date: "2024-05-01",
      vote_average: 7.84,
      vote_count: 1200,
    };
    vi.mocked(useQuery).mockImplementation(((options: { queryKey: string[] }) => ({
      data: options.queryKey[0] === "landing-trending-movies" ? [movie, { ...movie, id: 2, title: "Second" }, { ...movie, id: 3, title: "Third" }] : undefined,
    })) as unknown as typeof useQuery);

    renderLanding();

    expect(screen.getByText(/7\.8 on TMDB/)).toBeInTheDocument();
    expect(screen.getByText("A real synopsis from TMDB.")).toBeInTheDocument();
    expect(screen.getByText("2024")).toBeInTheDocument();
  });

  it("omits rating and overview when only built-in fallback posters are available", () => {
    vi.mocked(useQuery).mockImplementation((() => ({ data: undefined })) as unknown as typeof useQuery);
    renderLanding();

    expect(screen.queryByText(/on TMDB/)).not.toBeInTheDocument();
    expect(screen.queryByText("Trending this week")).not.toBeInTheDocument();
  });
});
