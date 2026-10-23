import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));

const preloadMock = vi.hoisted(() => vi.fn());
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  preload: preloadMock,
}));

import MediaImage, { preloadMediaImage } from "./MediaImage";

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

describe("MediaImage preload", () => {
  afterEach(() => {
    preloadMock.mockClear();
  });

  it("preloads priority proxy images with their responsive srcset", () => {
    render(<MediaImage src={proxySrc} alt="" priority />);
    expect(preloadMock).toHaveBeenCalledWith(
      proxySrc,
      expect.objectContaining({
        as: "image",
        fetchPriority: "high",
        imageSrcSet: expect.stringContaining("size=w500"),
        imageSizes: expect.any(String),
      }),
    );
  });

  it("does not preload lazy images", () => {
    render(<MediaImage src={proxySrc} alt="" />);
    expect(preloadMock).not.toHaveBeenCalled();
  });
});

describe("preloadMediaImage", () => {
  afterEach(() => {
    preloadMock.mockClear();
  });

  it("warms the same responsive candidates MediaImage renders", () => {
    preloadMediaImage("/api/tmdb-image?kind=backdrop&size=w1280&ref=abc", {
      sizes: "100vw",
      fetchPriority: "low",
    });
    expect(preloadMock).toHaveBeenCalledWith(
      "/api/tmdb-image?kind=backdrop&size=w1280&ref=abc",
      expect.objectContaining({
        as: "image",
        fetchPriority: "low",
        imageSrcSet: expect.stringContaining("size=w780"),
        imageSizes: "100vw",
      }),
    );
  });

  it("skips empty and data URIs", () => {
    preloadMediaImage(null);
    preloadMediaImage("data:image/png;base64,AAAA");
    expect(preloadMock).not.toHaveBeenCalled();
  });
});
