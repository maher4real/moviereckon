import { describe, expect, it } from "vitest";
import { getSeriesCardTagLabel, getSeriesWatchProviderFilter } from "./Series";

describe("getSeriesCardTagLabel", () => {
  it("does not show an Indian OTT poster tag for the Indian category", () => {
    expect(
      getSeriesCardTagLabel({
        category: "indian",
        ottFilter: "all",
        ottLabel: "All OTT",
      }),
    ).toBeUndefined();
  });

  it("limits the Indian category to trusted India OTT providers by default", () => {
    expect(
      getSeriesWatchProviderFilter({
        category: "indian",
        ottFilter: "all",
      }),
    ).toEqual({
      with_watch_providers: "8|119|122|237|232|220|350",
      watch_region: "IN",
    });
  });
});
