import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));

import MediaImage from "./MediaImage";

const proxySrc = "/api/tmdb-image?kind=poster&size=w342&ref=abc";

describe("MediaImage fadeIn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts hidden while the image is still loading", () => {
    const { container } = render(<MediaImage src={proxySrc} alt="" fadeIn />);
    expect(container.querySelector("img")).toHaveClass("opacity-0");
  });

  it("reveals an image that finished loading before hydration (no load event)", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(200);

    const { container } = render(<MediaImage src={proxySrc} alt="" fadeIn />);
    expect(container.querySelector("img")).toHaveClass("opacity-100");
  });
});
