import { describe, expect, it } from "vitest";
import {
  ERAS,
  MOODS,
  PACES,
  parseTastePreferenceFields,
  reconcileGenres,
} from "./preferences";

const seed = (overrides: Record<string, unknown> = {}) => ({
  content_id: 603,
  content_type: "movie",
  title: "The Matrix",
  poster_path: "/abc.jpg",
  genres: [28, 878],
  language: "en",
  ...overrides,
});

function ok(body: unknown) {
  const result = parseTastePreferenceFields(body);
  if (!result.ok) throw new Error("expected ok");
  return result.updates;
}

describe("parseTastePreferenceFields", () => {
  it("returns no updates when no new field is present", () => {
    expect(ok({ preferred_genres: [28] })).toEqual({});
    expect(ok(undefined)).toEqual({});
  });

  it("exposes the allowed values", () => {
    expect(MOODS).toEqual(["feel_good", "dark", "mind_bending", "emotional", "funny", "intense"]);
    expect(PACES).toEqual(["slow_burn", "balanced", "fast"]);
    expect(ERAS).toEqual(["classics", "nineties_2000s", "modern", "new"]);
  });

  describe("disliked_genres", () => {
    it("keeps unique positive integers, drops junk", () => {
      expect(ok({ disliked_genres: [27, "27", 27.5, -1, 0, "abc", 53] }).disliked_genres).toEqual([27, 53]);
    });

    it("caps at 12", () => {
      const ids = Array.from({ length: 500 }, (_, i) => i + 1);
      expect(ok({ disliked_genres: ids }).disliked_genres).toHaveLength(12);
    });

    it("rejects a non-array", () => {
      expect(parseTastePreferenceFields({ disliked_genres: "27" })).toEqual({ ok: false });
    });
  });

  describe("seed_titles", () => {
    it("normalizes a valid seed", () => {
      expect(ok({ seed_titles: [seed()] }).seed_titles).toEqual([
        { content_id: 603, content_type: "movie", title: "The Matrix", poster_path: "/abc.jpg", genres: [28, 878], language: "en" },
      ]);
    });

    it("drops invalid seeds and keeps valid ones", () => {
      const result = ok({
        seed_titles: [
          seed({ content_id: "x" }),
          seed({ content_id: 0 }),
          seed({ content_type: "person" }),
          seed({ title: "   " }),
          seed({ content_id: 11 }),
        ],
      }).seed_titles;
      expect(result?.map((s) => s.content_id)).toEqual([11]);
    });

    it("collapses newlines and control characters and caps the title at 220", () => {
      const [first] = ok({ seed_titles: [seed({ title: `Line one\nLine\ttwo\u0000${"x".repeat(10_000)}` })] }).seed_titles!;
      expect(first.title.startsWith("Line one Line two")).toBe(true);
      expect(first.title).not.toContain("\n");
      expect(first.title).not.toContain("\t");
      expect(first.title).not.toContain("\u0000");
      expect(first.title.length).toBeLessThanOrEqual(220);
    });

    it("only accepts TMDB-style poster paths", () => {
      const paths = ["/ok_1.jpg", "https://evil.example/x.jpg", "../x.jpg", "/a/b.jpg", `/${"a".repeat(400)}.jpg`, 42, undefined];
      const result = ok({ seed_titles: paths.map((p, i) => seed({ content_id: i + 1, poster_path: p })) }).seed_titles!;
      expect(result.map((s) => s.poster_path)).toEqual(["/ok_1.jpg", null, null, null, null, null, null]);
    });

    it("sanitizes genres and language", () => {
      const [first] = ok({ seed_titles: [seed({ genres: [28, "28", -3, "x", ...Array.from({ length: 40 }, (_, i) => 1000 + i)], language: "EN" })] }).seed_titles!;
      expect(first.genres).toHaveLength(24);
      expect(first.genres.slice(0, 1)).toEqual([28]);
      expect(first.language).toBe("en");
      const [bad] = ok({ seed_titles: [seed({ language: "english!" })] }).seed_titles!;
      expect(bad.language).toBeUndefined();
    });

    it("de-duplicates by type and id, and caps at 12", () => {
      const duplicates = ok({ seed_titles: [seed(), seed(), seed({ content_type: "tv" })] }).seed_titles!;
      expect(duplicates.map((s) => `${s.content_type}:${s.content_id}`)).toEqual(["movie:603", "tv:603"]);
      const many = Array.from({ length: 40 }, (_, i) => seed({ content_id: i + 1 }));
      expect(ok({ seed_titles: many }).seed_titles).toHaveLength(12);
    });

    it("rejects a non-array", () => {
      expect(parseTastePreferenceFields({ seed_titles: {} })).toEqual({ ok: false });
    });
  });

  describe("moods and eras", () => {
    it("keeps only allowed values, de-duplicated", () => {
      expect(ok({ moods: ["dark", "dark", "sad", "funny"] }).moods).toEqual(["dark", "funny"]);
      expect(ok({ eras: ["new", "new", "future", "classics"] }).eras).toEqual(["new", "classics"]);
    });

    it("rejects non-arrays", () => {
      expect(parseTastePreferenceFields({ moods: "dark" })).toEqual({ ok: false });
      expect(parseTastePreferenceFields({ eras: 1 })).toEqual({ ok: false });
    });
  });

  describe("pace", () => {
    it("accepts allowed values and null (null clears)", () => {
      expect(ok({ pace: "fast" }).pace).toBe("fast");
      expect(ok({ pace: null })).toEqual({ pace: null });
    });

    it("leaves pace out of the update when omitted", () => {
      expect("pace" in ok({ moods: [] })).toBe(false);
    });

    it("rejects anything else", () => {
      expect(parseTastePreferenceFields({ pace: "warp" })).toEqual({ ok: false });
      expect(parseTastePreferenceFields({ pace: 3 })).toEqual({ ok: false });
    });
  });
});

describe("reconcileGenres", () => {
  it("drops disliked genres that are also preferred", () => {
    expect(reconcileGenres([28, 35], [28, 27, 35, 53])).toEqual([27, 53]);
  });

  it("returns disliked unchanged when there is no overlap", () => {
    expect(reconcileGenres([28], [27])).toEqual([27]);
  });
});

describe("garbled lists do not erase stored data", () => {
  it.each([
    ["seed_titles", [{ content_id: "x" }, { content_id: 0 }, "nope"]],
    ["disliked_genres", ["abc", -1, 0]],
    ["moods", ["sad", "bored"]],
    ["eras", ["future"]],
  ])("rejects a non-empty %s list with no valid items", (field, value) => {
    expect(parseTastePreferenceFields({ [field]: value })).toEqual({ ok: false });
  });

  it("still allows an explicit empty list to clear a field", () => {
    expect(ok({ seed_titles: [], disliked_genres: [], moods: [], eras: [] })).toEqual({
      seed_titles: [],
      disliked_genres: [],
      moods: [],
      eras: [],
    });
  });

  it("keeps a list that has at least one valid item", () => {
    expect(ok({ moods: ["sad", "dark"] }).moods).toEqual(["dark"]);
  });
});

