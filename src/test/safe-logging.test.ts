import { describe, expect, it } from "vitest";
import { sanitizeValue } from "@/shared/lib/safeLogging";

describe("safe logging redaction", () => {
  it("redacts sensitive object fields", () => {
    expect(
      sanitizeValue({
        password: "SuperSecret123",
        poster_path: "/abc123.jpg",
        nested: {
          accessToken: "abc123",
          avatar_url: "https://image.tmdb.org/t/p/w500/avatar.webp",
          safe: "ok",
        },
      }),
    ).toEqual({
      password: "[REDACTED]",
      poster_path: "[REDACTED]",
      nested: {
        accessToken: "[REDACTED]",
        avatar_url: "[REDACTED]",
        safe: "ok",
      },
    });
  });

  it("redacts secrets embedded in strings", () => {
    expect(
      sanitizeValue(
        'mongodb+srv://user:pass@cluster.mongodb.net/?token=abc123 Authorization: Bearer jwt-token',
      ),
    ).toBe(
      "mongodb+srv://[REDACTED]@cluster.mongodb.net/?token=[REDACTED] Authorization: [REDACTED]",
    );
  });

  it("redacts headers collections", () => {
    const headers = new Headers({
      authorization: "Bearer top-secret",
      "x-requested-with": "XMLHttpRequest",
    });

    expect(sanitizeValue(headers)).toEqual({
      authorization: "[REDACTED]",
      "x-requested-with": "XMLHttpRequest",
    });
  });

  it("redacts image URLs and data URLs", () => {
    expect(sanitizeValue("https://image.tmdb.org/t/p/w500/poster.jpg")).toBe("[REDACTED]");
    expect(sanitizeValue("/fallbacks/poster.svg")).toBe("[REDACTED]");
    expect(sanitizeValue("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA")).toBe("[REDACTED]");
    expect(sanitizeValue('poster_path=/movie-poster.webp src=https://cdn.example.com/image.png')).toBe(
      "poster_path=[REDACTED] src=[REDACTED]",
    );
  });
});
