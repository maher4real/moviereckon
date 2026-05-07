import { describe, expect, it } from "vitest";
import { getReactionMutations } from "./contentReactions";

describe("getReactionMutations", () => {
  it("clears a dislike before applying a like", () => {
    expect(getReactionMutations({ liked: false, feedback: "skip" }, "like")).toEqual([
      "clearDislike",
      "toggleLike",
    ]);
  });

  it("removes a like before applying a dislike", () => {
    expect(getReactionMutations({ liked: true, feedback: null }, "dislike")).toEqual([
      "toggleLike",
      "toggleDislike",
    ]);
  });
});
