import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tv } from "lucide-react";
import { BrowseFilters } from "./BrowseLayout";

function setDesktop(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop && query.includes("min-width: 1024px"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderBar(activeCount = 0) {
  const onReset = vi.fn();
  render(
    <BrowseFilters
      categories={[{ value: "all", label: "All", Icon: Tv }]}
      activeCategory="all"
      onCategory={vi.fn()}
      genres={[{ id: 1, name: "Drama" }]}
      selectedGenre=""
      onGenre={vi.fn()}
      selects={[
        { id: "sort", label: "Sort by", value: "a", options: [{ value: "a", label: "Most popular" }], onChange: vi.fn() },
        { id: "genre", label: "Genre", value: "all", options: [{ value: "all", label: "All genres" }], onChange: vi.fn() },
      ]}
      activeFilters={Array.from({ length: activeCount }, (_, i) => ({ key: `f${i}`, label: `Filter ${i}`, onClear: vi.fn() }))}
      onReset={onReset}
      note="Availability varies by title."
    />,
  );
  return { onReset };
}

describe("BrowseFilters", () => {
  beforeEach(() => setDesktop(true));
  afterEach(() => vi.restoreAllMocks());

  it("opens the filter panel from the Filters button on desktop", async () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /Open filters/ }));
    expect(await screen.findByText("Availability varies by title.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toBeInTheDocument();
  });

  it("does not auto-focus the first dropdown when the panel opens", async () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /Open filters/ }));
    await screen.findByRole("combobox", { name: "Sort by" });
    expect(document.activeElement).not.toBe(screen.getByRole("combobox", { name: "Sort by" }));
    expect(document.activeElement?.classList.contains("browse-panel")).toBe(true);
  });

  it("leaves out the genre dropdown because the genre chips cover it", async () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /Open filters/ }));
    await screen.findByRole("combobox", { name: "Sort by" });
    expect(screen.queryByRole("combobox", { name: "Genre" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drama" })).toBeInTheDocument();
  });

  it("opens as a bottom sheet on small screens", async () => {
    setDesktop(false);
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /Open filters/ }));
    expect(await screen.findByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("shows how many filters are active and offers a reset", async () => {
    const { onReset } = renderBar(2);
    expect(screen.getByRole("button", { name: "Open filters, 2 active" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open filters, 2 active" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset filters" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
