import { describe, expect, it } from "vitest";
import {
  getUpcomingQueryKey,
  normalizeUpcomingFilterState,
  parseUpcomingFilterState,
  serializeUpcomingFilterState,
} from "./upcomingFilterState";

describe("upcoming filter state", () => {
  it("rejects impossible dates and unsupported genres", () => {
    const state = parseUpcomingFilterState(
      new URLSearchParams(
        "section=movies&movieType=hollywood&movieGenre=999999&date=2026-02-30",
      ),
    );

    expect(state.movieGenre).toBe("");
    expect(state.selectedFilterDate).toBe("all");
    expect(serializeUpcomingFilterState(new URLSearchParams(), state).toString()).toBe(
      "section=movies&movieType=hollywood",
    );
  });

  it("clears controls that do not belong to the active section", () => {
    const state = parseUpcomingFilterState(
      new URLSearchParams(
        "section=all&movieType=bollywood&bollyLang=ta&movieGenre=28&seriesGenre=18&ott=8&lang=ko&region=IN",
      ),
    );

    expect(state).toMatchObject({
      section: "all",
      movieSectionFilter: "all",
      movieGenre: "",
      seriesGenre: "",
      seriesOtt: "all",
      seriesLanguage: "all",
      watchRegion: "US",
    });
  });

  it("validates providers against the selected region and round-trips URL state", () => {
    const source = new URLSearchParams("section=series&ott=119&region=US&lang=hi&seriesGenre=18");
    const state = parseUpcomingFilterState(source);

    expect(state.seriesOtt).toBe("all");
    expect(state.watchRegion).toBe("US");
    expect(state.seriesGenre).toBe("18");

    const indiaState = normalizeUpcomingFilterState({ ...state, watchRegion: "IN", seriesOtt: "119" });
    expect(parseUpcomingFilterState(serializeUpcomingFilterState(source, indiaState))).toEqual(indiaState);
    expect(getUpcomingQueryKey(indiaState)).toContain("IN");
  });
});
