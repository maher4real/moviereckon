import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, MessageSquare, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MediaImage from "@/components/MediaImage";
import { cn } from "@/lib/utils";
import * as mongoClient from "@/lib/mongodbClient";
import { useAuth } from "@/hooks/useAuth";
import {
  getMovieReviewsExpanded,
  getTMDBAvatarUrl,
  getTVShowReviewsExpanded,
} from "@/lib/tmdb";

interface CommentsSectionProps {
  contentId: number;
  contentType: "movie" | "tv";
}

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  interactive?: boolean;
  sizeClass?: string;
}

const INITIAL_PUBLIC_REVIEWS_VISIBLE = 6;
const PUBLIC_REVIEWS_LOAD_STEP = 6;
const PUBLIC_REVIEW_PREVIEW_LENGTH = 420;

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

function StarRating({
  value,
  onChange,
  max = 10,
  interactive = false,
  sizeClass = "w-4 h-4",
}: StarRatingProps) {
  return (
    <div className="flex items-center flex-wrap gap-1">
      {Array.from({ length: max }, (_, index) => {
        const ratingValue = index + 1;
        const filled = ratingValue <= value;

        if (interactive) {
          return (
            <button
              key={ratingValue}
              type="button"
              onClick={() => onChange?.(ratingValue)}
              className="rounded-sm p-0.5 transition-transform duration-150 hover:scale-110"
              aria-label={`Rate ${ratingValue} out of ${max}`}
            >
              <Star
                className={cn(
                  sizeClass,
                  filled
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40 hover:text-amber-300",
                )}
              />
            </button>
          );
        }

        return (
          <Star
            key={ratingValue}
            className={cn(
              sizeClass,
              filled
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/35",
            )}
          />
        );
      })}
    </div>
  );
}

export default function CommentsSection({
  contentId,
  contentType,
}: CommentsSectionProps) {
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState(8);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editRating, setEditRating] = useState(8);
  const [visiblePublicReviews, setVisiblePublicReviews] = useState(
    INITIAL_PUBLIC_REVIEWS_VISIBLE,
  );
  const [expandedPublicReviews, setExpandedPublicReviews] = useState<
    Record<string, boolean>
  >({});

  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    setVisiblePublicReviews(INITIAL_PUBLIC_REVIEWS_VISIBLE);
    setExpandedPublicReviews({});
    setEditingCommentId(null);
  }, [contentId, contentType]);

  const hasValidCommentRating =
    Number.isInteger(commentRating) &&
    commentRating >= 1 &&
    commentRating <= 10;

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
        ? getMovieReviewsExpanded(contentId, 3)
        : getTVShowReviewsExpanded(contentId, 3),
    enabled: !!contentId,
    staleTime: 1000 * 60 * 30,
  });

  const postCommentMutation = useMutation({
    mutationFn: () =>
      mongoClient.postComment({
        content_id: contentId,
        content_type: contentType,
        text: commentText.trim(),
        rating: commentRating,
      }),
    onSuccess: async (newComment) => {
      setCommentText("");
      setCommentRating(8);

      if (newComment) {
        queryClient.setQueryData<mongoClient.CommentItem[]>(
          queryKey,
          (prev = []) => [newComment, ...prev],
        );
      }

      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({
      commentId,
      text,
      rating,
    }: {
      commentId: string;
      text: string;
      rating: number;
    }) =>
      mongoClient.updateComment({
        comment_id: commentId,
        text,
        rating,
      }),
    onSuccess: async (updatedComment) => {
      if (updatedComment) {
        queryClient.setQueryData<mongoClient.CommentItem[]>(
          queryKey,
          (prev = []) =>
            prev.map((comment) =>
              comment.id === updatedComment.id ? updatedComment : comment,
            ),
        );
      }

      setEditingCommentId(null);
      setEditText("");
      setEditRating(8);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => mongoClient.deleteComment(commentId),
    onSuccess: async (success, commentId) => {
      if (success) {
        queryClient.setQueryData<mongoClient.CommentItem[]>(
          queryKey,
          (prev = []) => prev.filter((comment) => comment.id !== commentId),
        );
      }
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !commentText.trim() ||
      !hasValidCommentRating ||
      postCommentMutation.isPending
    )
      return;
    postCommentMutation.mutate();
  };

  const handleStartEdit = (comment: mongoClient.CommentItem) => {
    setEditingCommentId(comment.id);
    setEditText(comment.text);
    setEditRating(
      comment.rating && comment.rating >= 1 && comment.rating <= 10
        ? comment.rating
        : 8,
    );
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditText("");
    setEditRating(8);
  };

  const handleSaveEdit = (commentId: string) => {
    const normalizedText = editText.trim();
    if (!normalizedText) return;
    if (!Number.isInteger(editRating) || editRating < 1 || editRating > 10)
      return;

    updateCommentMutation.mutate({
      commentId,
      text: normalizedText,
      rating: editRating,
    });
  };

  const handleDelete = (commentId: string) => {
    if (!window.confirm("Delete this comment?")) return;
    deleteCommentMutation.mutate(commentId);
  };

  const togglePublicReviewExpanded = (reviewId: string) => {
    setExpandedPublicReviews((prev) => ({
      ...prev,
      [reviewId]: !prev[reviewId],
    }));
  };

  const ratedComments = comments.filter(
    (comment) =>
      typeof comment.rating === "number" &&
      comment.rating >= 1 &&
      comment.rating <= 10,
  );
  const communityAverageRating = ratedComments.length
    ? ratedComments.reduce(
        (sum, comment) => sum + (comment.rating as number),
        0,
      ) / ratedComments.length
    : null;

  const visibleReviews = publicReviews.slice(0, visiblePublicReviews);

  return (
    <section className="mt-10 max-w-4xl">
      <h2 className="text-xl font-semibold mb-2">Comments & Reviews</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Community discussions with ratings
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

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1 min-w-[220px]">
            <p className="text-xs text-muted-foreground">Your Rating (1-10)</p>
            <div className="flex items-center gap-2">
              <StarRating
                value={commentRating}
                onChange={setCommentRating}
                interactive
              />
              <span className="text-sm font-medium text-foreground/90">
                {commentRating}/10
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <p className="text-xs text-muted-foreground">
              {commentText.length}/1000
            </p>
            <Button
              type="submit"
              disabled={
                !commentText.trim() ||
                !hasValidCommentRating ||
                postCommentMutation.isPending
              }
              className="bg-primary hover:bg-primary/90"
            >
              {postCommentMutation.isPending ? "Posting..." : "Post Comment"}
            </Button>
          </div>
        </div>
      </form>

      <div className="space-y-7">
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Community Comments
            </span>
            {communityAverageRating !== null && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/15 text-primary whitespace-nowrap">
                <Star className="w-3 h-3 fill-current" />
                Avg {communityAverageRating.toFixed(1)} / 10
              </span>
            )}
          </h3>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-lg bg-card border border-border p-4 animate-pulse"
                >
                  <div className="h-3 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-full mb-1" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="rounded-lg bg-card border border-border p-6 text-center">
              <p className="text-muted-foreground">
                No comments yet. Be the first to share your review.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => {
                const isOwner = !!user && comment.user_id === user.id;
                const isEditing = editingCommentId === comment.id;
                const hasRating =
                  typeof comment.rating === "number" &&
                  comment.rating >= 1 &&
                  comment.rating <= 10;

                return (
                  <article
                    key={comment.id}
                    className="rounded-lg bg-card border border-border p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                          {comment.username?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {comment.username || "User"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatTimestamp(comment.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {hasRating && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/15 text-primary whitespace-nowrap">
                            <Star className="w-3 h-3 fill-current" />
                            {comment.rating!.toFixed(1)}
                          </span>
                        )}

                        {isOwner && !isEditing && (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleStartEdit(comment)}
                              title="Edit comment"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(comment.id)}
                              disabled={deleteCommentMutation.isPending}
                              title="Delete comment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          maxLength={1000}
                          className="min-h-[90px] bg-background"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <StarRating
                              value={editRating}
                              onChange={setEditRating}
                              interactive
                            />
                            <span className="text-sm font-medium text-foreground/90">
                              {editRating}/10
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleCancelEdit}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={() => handleSaveEdit(comment.id)}
                              disabled={
                                !editText.trim() ||
                                updateCommentMutation.isPending ||
                                !Number.isInteger(editRating) ||
                                editRating < 1 ||
                                editRating > 10
                              }
                            >
                              {updateCommentMutation.isPending
                                ? "Saving..."
                                : "Save"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                        {comment.text}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-secondary" />
            Public Reviews
          </h3>

          {reviewsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-lg bg-card border border-border p-4 animate-pulse"
                >
                  <div className="h-3 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-full mb-1" />
                  <div className="h-3 bg-muted rounded w-4/5" />
                </div>
              ))}
            </div>
          ) : publicReviews.length === 0 ? (
            <div className="rounded-lg bg-card border border-border p-6 text-center">
              <p className="text-muted-foreground">
                No public reviews found for this title.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {visibleReviews.map((review) => {
                  const avatarSrc = getTMDBAvatarUrl(
                    review.author_details?.avatar_path,
                  );
                  const author =
                    review.author ||
                    review.author_details?.username ||
                    "TMDB User";
                  const rating = review.author_details?.rating;
                  const fullText = review.content || "";
                  const isExpanded = !!expandedPublicReviews[review.id];
                  const shouldTruncate =
                    fullText.length > PUBLIC_REVIEW_PREVIEW_LENGTH;
                  const displayText =
                    !shouldTruncate || isExpanded
                      ? fullText
                      : `${fullText.slice(0, PUBLIC_REVIEW_PREVIEW_LENGTH).trimEnd()}...`;

                  return (
                    <article
                      key={review.id}
                      className="rounded-lg bg-card border border-border p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <MediaImage
                            src={avatarSrc}
                            alt={author}
                            className="w-8 h-8 rounded-full object-cover"
                            fallbackSrc="/fallbacks/profile.svg"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {author}
                            </p>
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

                      <p className="text-sm text-foreground/85 whitespace-pre-wrap break-words">
                        {displayText}
                      </p>

                      {shouldTruncate && (
                        <button
                          type="button"
                          onClick={() => togglePublicReviewExpanded(review.id)}
                          className="mt-3 text-xs text-primary hover:underline"
                        >
                          {isExpanded ? "Show less" : "Read more"}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>

              {publicReviews.length > visiblePublicReviews && (
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setVisiblePublicReviews(
                        (prev) => prev + PUBLIC_REVIEWS_LOAD_STEP,
                      )
                    }
                  >
                    Load more public reviews
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
