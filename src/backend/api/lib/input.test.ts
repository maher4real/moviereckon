import { describe, expect, it } from "vitest";
import {
  sanitizeEmailAddress,
  sanitizeLanguageCode,
  sanitizeMultiLineText,
  sanitizeSingleLineText,
} from "./input";

describe("input sanitizers", () => {
  it("normalizes single-line text and collapses whitespace", () => {
    expect(sanitizeSingleLineText("  hello\tworld \n again  ", 40)).toBe("hello world again");
  });

  it("preserves line breaks for multiline text while stripping control characters", () => {
    expect(sanitizeMultiLineText(" \r\nHello\u0000\nworld\r\n ", 40, "")).toBe("Hello\nworld");
  });

  it("normalizes email casing and strips unsafe surrounding characters", () => {
    expect(sanitizeEmailAddress("  TeSt@example.com\r\n")).toBe("test@example.com");
  });

  it("normalizes supported language codes", () => {
    expect(sanitizeLanguageCode(" EN-us ")).toBe("en-us");
    expect(sanitizeLanguageCode("bad value", "en")).toBe("en");
  });

  it("returns the fallback for empty or overlong values", () => {
    expect(sanitizeSingleLineText("   ", 10, { fallback: "" })).toBe("");
    expect(sanitizeMultiLineText("x".repeat(41), 40, "")).toBe("");
  });
});
