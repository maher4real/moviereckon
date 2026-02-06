import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import * as mongoClient from "@/lib/mongodbClient";

interface CommentsSectionProps {
  contentId: number;
  contentType: "movie" | "tv";
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CommentsSection({ contentId, contentType }: CommentsSectionProps) {
  const [commentText, setCommentText] = useState("");
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => ["content-comments", contentType, contentId],
    [contentType, contentId]
  );

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => mongoClient.fetchComments(contentId, contentType),
    enabled: !!contentId,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const postCommentMutation = useMutation({
    mutationFn: () =>
      mongoClient.postComment({
        content_id: contentId,
        content_type: contentType,
        text: commentText.trim(),
      }),
    onSuccess: async (newComment) => {
      setCommentText("");

      if (newComment) {
        queryClient.setQueryData<mongoClient.CommentItem[]>(queryKey, (prev = []) => [
          newComment,
          ...prev,
        ]);
      }

      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!commentText.trim() || postCommentMutation.isPending) return;
    postCommentMutation.mutate();
  };

  return (
    <section className="mt-10 max-w-4xl">
      <h2 className="text-xl font-semibold mb-4">Comments</h2>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 mb-6 rounded-xl border border-border bg-card/50 p-4"
      >
        <Textarea
          value={commentText}
          onChange={(event) => setCommentText(event.target.value)}
          placeholder="Share your thoughts..."
          maxLength={1000}
          className="min-h-[96px] w-full max-w-full bg-card"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{commentText.length}/1000</p>
          <Button
            type="submit"
            disabled={!commentText.trim() || postCommentMutation.isPending}
            className="bg-primary hover:bg-primary/90"
          >
            {postCommentMutation.isPending ? "Posting..." : "Post Comment"}
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-lg bg-card border border-border p-4 animate-pulse">
              <div className="h-3 bg-muted rounded w-1/3 mb-2" />
              <div className="h-3 bg-muted rounded w-full mb-1" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded-lg bg-card border border-border p-6 text-center">
          <p className="text-muted-foreground">No comments yet. Be the first to share your review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <article key={comment.id} className="rounded-lg bg-card border border-border p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                  {comment.username?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{comment.username || "User"}</p>
                  <p className="text-[11px] text-muted-foreground">{formatTimestamp(comment.created_at)}</p>
                </div>
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{comment.text}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
