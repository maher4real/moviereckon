import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Globe, MessageSquare, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MediaImage from "@/components/MediaImage";
import * as mongoClient from "@/lib/mongodbClient";
import { getMovieReviews, getTMDBAvatarUrl, getTVShowReviews } from "@/lib/tmdb";

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
    [contentType, contentId],
  );

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => mongoClient.fetchComments(contentId, contentType),
    enabled: !!contentId,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const { data: publicReviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ["tmdb-public-reviews", contentType, contentId],
    queryFn: () =>
      contentType === "movie"
        ? getMovieReviews(contentId)
        : getTVShowReviews(contentId),
    enabled: !!contentId,
    staleTime: 1000 * 60 * 30,
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
      <h2 className="text-xl font-semibold mb-2">Comments & Reviews</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Community discussions plus public TMDB user reviews for this title.
      </p>

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

      <div className="space-y-7">
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Community Comments
          </h3>

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
        </div>

        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-secondary" />
            Public TMDB Reviews
          </h3>

          {reviewsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="rounded-lg bg-card border border-border p-4 animate-pulse">
                  <div className="h-3 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-full mb-1" />
                  <div className="h-3 bg-muted rounded w-4/5" />
                </div>
              ))}
            </div>
          ) : publicReviews.length === 0 ? (
            <div className="rounded-lg bg-card border border-border p-6 text-center">
              <p className="text-muted-foreground">No public TMDB reviews found for this title.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {publicReviews.slice(0, 5).map((review) => {
                const avatarSrc = getTMDBAvatarUrl(review.author_details?.avatar_path);
                const author = review.author || review.author_details?.username || "TMDB User";
                const rating = review.author_details?.rating;

                return (
                  <article key={review.id} className="rounded-lg bg-card border border-border p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <MediaImage
                          src={avatarSrc}
                          alt={author}
                          className="w-8 h-8 rounded-full object-cover"
                          fallbackSrc="/fallbacks/profile.svg"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{author}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatTimestamp(review.created_at)}
                          </p>
                        </div>
                      </div>
                      {typeof rating === "number" && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary/15 text-secondary whitespace-nowrap">
                          <Star className="w-3 h-3 fill-current" />
                          {rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/85 whitespace-pre-wrap break-words line-clamp-6">
                      {review.content}
                    </p>
                    {review.url && (
                      <a
                        href={review.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Read full review <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
