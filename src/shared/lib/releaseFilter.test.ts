import { describe, expect, it } from "vitest";
import {
  applyReleasedOnlyPolicy,
  filterUnreleasedTitles,
  isUpcomingRequest,
  withReleasedOnlyParams,
} from "./releaseFilter";

const NOW = Date.parse("2026-10-23T12:00:00Z");

const released = { id: 1, title: "Out", release_date: "2026-10-01" };
const releasedToday = { id: 2, title: "Today", release_date: "2026-10-23" };
const future = { id: 3, title: "Soon", release_date: "2026-12-18" };
const undated = { id: 4, title: "Announced", release_date: "" };
const airedShow = { id: 5, name: "Aired", first_air_date: "2008-01-20" };
const futureShow = { id: 6, name: "Pilot", first_air_date: "2027-02-01" };
const person = { id: 7, name: "Actor", media_type: "person" };

describe("isUpcomingRequest", () => {
  it("treats the upcoming list and future-dated discover queries as upcoming", () => {
    expect(isUpcomingRequest("/movie/upcoming", undefined, NOW)).toBe(true);
    expect(isUpcomingRequest("/discover/movie", { "primary_release_date.gte": "2026-10-24" }, NOW)).toBe(true);
    expect(isUpcomingRequest("/discover/tv", { "first_air_date.gte": "2026-10-24" }, NOW)).toBe(true);
  });

  it("treats everything else as a released-only request", () => {
    expect(isUpcomingRequest("/trending/movie/week", undefined, NOW)).toBe(false);
    expect(isUpcomingRequest("/discover/movie", { "primary_release_date.gte": "2026-01-01" }, NOW)).toBe(false);
    expect(isUpcomingRequest("/search/multi", { "primary_release_date.gte": "2027-01-01" }, NOW)).toBe(false);
  });
});

describe("withReleasedOnlyParams", () => {
  it("caps discover queries at today", () => {
    expect(withReleasedOnlyParams("/discover/movie", { page: 1 }, NOW)).toEqual({
      page: 1,
      "primary_release_date.lte": "2026-10-23",
    });
    expect(withReleasedOnlyParams("/discover/tv", { "first_air_date.lte": "2026-12-31" }, NOW)).toEqual({
      "first_air_date.lte": "2026-10-23",
    });
  });

  it("keeps an earlier cap, upcoming queries and non-discover endpoints unchanged", () => {
    const pastYear = { "primary_release_date.lte": "2020-12-31" };
    expect(withReleasedOnlyParams("/discover/movie", pastYear, NOW)).toBe(pastYear);
    const upcoming = { "primary_release_date.gte": "2026-10-24" };
    expect(withReleasedOnlyParams("/discover/movie", upcoming, NOW)).toBe(upcoming);
    expect(withReleasedOnlyParams("/movie/popular", { page: 2 }, NOW)).toEqual({ page: 2 });
  });
});

describe("filterUnreleasedTitles", () => {
  it("drops future and undated titles from results, cast and crew", () => {
    const payload = {
      page: 1,
      results: [released, releasedToday, future, undated, airedShow, futureShow, person],
      cast: [released, future],
      crew: [futureShow],
    };

    expect(filterUnreleasedTitles(payload, NOW)).toEqual({
      page: 1,
      results: [released, releasedToday, airedShow, person],
      cast: [released],
      crew: [],
    });
  });

  it("returns the same object when nothing is removed", () => {
    const payload = { results: [released, person] };
    expect(filterUnreleasedTitles(payload, NOW)).toBe(payload);
  });
});

describe("applyReleasedOnlyPolicy", () => {
  it("keeps unreleased titles only for upcoming requests", () => {
    const payload = { results: [released, future] };
    expect(applyReleasedOnlyPolicy("/movie/upcoming", undefined, payload, NOW)).toBe(payload);
    expect(applyReleasedOnlyPolicy("/movie/popular", undefined, payload, NOW)).toEqual({ results: [released] });
  });
});
