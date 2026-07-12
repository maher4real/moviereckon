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

vi.mock("@/frontend/components/LiquidGlassCard", () => ({
  default: ({
    children,
    className,
    contentClassName,
  }: {
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
  }) => (
    <div className={className}>
      <div className={contentClassName}>{children}</div>
    </div>
  ),
}));

vi.mock("@/frontend/components/MediaImage", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) => (
    <img alt={alt} className={className} src="/fallbacks/poster.svg" />
  ),
}));

import Landing from "./Landing";

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
    fireEvent.click(screen.getAllByRole("link", { name: /find my next watch/i })[0]);
    expect(screen.getByText("Authentication screen")).toBeInTheDocument();
  });

  it("sends signed-in members directly to the app", () => {
    authenticated = true;
    renderLanding();

    fireEvent.click(screen.getAllByRole("link", { name: /open moviereckon/i })[0]);
    expect(screen.getByText("Member home")).toBeInTheDocument();
  });
});
