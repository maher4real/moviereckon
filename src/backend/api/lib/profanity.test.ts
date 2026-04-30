import { describe, expect, it } from "vitest";
import { containsBlockedTerms, findBlockedTerms } from "./profanity";

describe("profanity filter", () => {
  it("blocks direct profanity", () => {
    expect(findBlockedTerms("This movie is bullshit")).toContain("bullshit");
    expect(containsBlockedTerms("What the fuck was that?")).toBe(true);
  });

  it("blocks simple obfuscation with separators and leetspeak", () => {
    expect(containsBlockedTerms("This is f.u.c.k.ing awful")).toBe(true);
    expect(containsBlockedTerms("That ending was sh1tty")).toBe(true);
  });

  it("does not block clean comments", () => {
    expect(containsBlockedTerms("The pacing was slow but the score was excellent.")).toBe(false);
  });
});
