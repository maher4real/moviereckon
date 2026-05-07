import type { FeedbackType } from "@/frontend/hooks/useUserData";

export type ReactionAction = "like" | "dislike";
export type ReactionMutation = "toggleLike" | "toggleDislike" | "clearDislike";

export function getReactionMutations(
  state: { liked: boolean; feedback: FeedbackType | null },
  action: ReactionAction,
): ReactionMutation[] {
  if (action === "like") {
    return state.feedback === "skip" ? ["clearDislike", "toggleLike"] : ["toggleLike"];
  }

  return state.liked ? ["toggleLike", "toggleDislike"] : ["toggleDislike"];
}
