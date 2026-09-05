import { describe, expect, it } from "vitest";
import { getSeriesCardTagLabel, getSeriesWatchProviderFilter } from "./Series";

const REQUESTED_TRUSTED_PROVIDER_IDS = "8|119|122|220|337|350|192|237|232";

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
      with_watch_providers: REQUESTED_TRUSTED_PROVIDER_IDS,
      watch_region: "IN",
      "vote_count.gte": 20,
      "vote_average.gte": 5,
    });
  });

  it("does not infer a viewing country from the original language", () => {
    expect(
      getSeriesWatchProviderFilter({
        category: "all",
        ottFilter: "all",
        selectedLanguage: "hi",
      }),
    ).toEqual({});
  });

  it("uses the explicitly selected provider region", () => {
    expect(
      getSeriesWatchProviderFilter({
        category: "all",
        ottFilter: "8",
        selectedLanguage: "hi",
        watchRegion: "IN",
      }),
    ).toEqual({
      with_watch_providers: "8",
      watch_region: "IN",
    });
  });
});
