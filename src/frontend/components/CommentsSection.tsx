import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleX,
  Globe,
  Medal,
  MessageSquare,
  Pencil,
  Rocket,
  Star,
  ThumbsUp,
  Timer,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/frontend/components/ui/alert-dialog";
import { Button } from "@/frontend/components/ui/button";
import { Textarea } from "@/frontend/components/ui/textarea";
import MediaImage from "@/frontend/components/MediaImage";
import { cn } from "@/shared/lib/utils";
import * as mongoClient from "@/frontend/lib/mongodbClient";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useToast } from "@/frontend/hooks/use-toast";
import { useUserData } from "@/frontend/hooks/useUserData";
import {
  getMovieReviewsExpanded,
  getTMDBAvatarUrl,
  getTVShowReviewsExpanded,
} from "@/shared/lib/tmdb";

interface CommentsSectionProps {
  contentId: number;
  contentType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  genres: number[];
  language: string;
}

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  interactive?: boolean;
  sizeClass?: string;
}

type TabId = "write" | "community" | "reviews" | "feedback";

const INITIAL_PUBLIC_REVIEWS_VISIBLE = 6;
const PUBLIC_REVIEWS_LOAD_STEP = 6;
const PUBLIC_REVIEW_PREVIEW_LENGTH = 420;

type FeedbackOption = {
  value: mongoClient.FeedbackType;
  label: string;
  hint: string;
  icon: typeof Rocket;
};

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  { value: "give_it_a_go", label: "Give it a go", hint: "Worth trying at least once.", icon: Rocket },
  { value: "one_time_watch", label: "One-time watch", hint: "Decent, but not a rewatch.", icon: Timer },
  { value: "must_watch", label: "Must Watch", hint: "Highly recommended by viewers.", icon: Medal },
  { value: "skip", label: "Skip", hint: "Not worth your time.", icon: CircleX },
];

const EMPTY_COUNTS: Record<mongoClient.FeedbackType, number> = {
  give_it_a_go: 0,
  one_time_watch: 0,
  must_watch: 0,
  skip: 0,
};

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

function StarRating({ value, onChange, max = 10, interactive = false, sizeClass = "w-4 h-4" }: StarRatingProps) {
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
              <Star className={cn(sizeClass, filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-300")} />
            </button>
          );
        }

        return (
          <Star key={ratingValue} className={cn(sizeClass, filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/35")} />
        );
      })}
    </div>
  );
}

const TABS: { id: TabId; label: string; icon: typeof MessageSquare }[] = [
  { id: "write", label: "Write Review", icon: Pencil },
  { id: "community", label: "Community", icon: MessageSquare },
  { id: "reviews", label: "Public Reviews", icon: Globe },
  { id: "feedback", label: "Feedback", icon: ThumbsUp },
];

export default function CommentsSection({
  contentId,
  contentType,
  title,
  posterPath,
  genres,
  language,
}: CommentsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabId>("write");
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState(8);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editRating, setEditRating] = useState(8);
  const [visiblePublicReviews, setVisiblePublicReviews] = useState(INITIAL_PUBLIC_REVIEWS_VISIBLE);
  const [expandedPublicReviews, setExpandedPublicReviews] = useState<Record<string, boolean>>({});

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setFeedback, getFeedback } = useUserData();

  useEffect(() => {
    setVisiblePublicReviews(INITIAL_PUBLIC_REVIEWS_VISIBLE);
    setExpandedPublicReviews({});
    setEditingCommentId(null);
    setActiveTab("write");
  }, [contentId, contentType]);

  const hasValidCommentRating = Number.isInteger(commentRating) && commentRating >= 1 && commentRating <= 10;

  const queryKey = useMemo(() => ["content-comments", contentType, contentId], [contentType, contentId]);
  const feedbackQueryKey = useMemo(() => ["content-feedback", contentType, contentId], [contentType, contentId]);

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey,
    queryFn: () => mongoClient.fetchComments(contentId, contentType),
    enabled: !!contentId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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

  const { data: feedbackSummary } = useQuery({
    queryKey: feedbackQueryKey,
    queryFn: () => mongoClient.fetchContentFeedbackSummary(contentId, contentType),
    enabled: !!contentId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
        queryClient.setQueryData<mongoClient.CommentItem[]>(queryKey, (prev = []) => [newComment, ...prev]);
      }
      await queryClient.invalidateQueries({ queryKey });
      setActiveTab("community");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Unable to post comment",
        description: error instanceof Error ? error.message : "Your comment could not be posted.",
      });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({ commentId, text, rating }: { commentId: string; text: string; rating: number }) =>
      mongoClient.updateComment({ comment_id: commentId, text, rating }),
    onSuccess: async (updatedComment) => {
      if (updatedComment) {
        queryClient.setQueryData<mongoClient.CommentItem[]>(queryKey, (prev = []) =>
          prev.map((c) => (c.id === updatedComment.id ? updatedComment : c)),
        );
      }
      setEditingCommentId(null);
      setEditText("");
      setEditRating(8);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Unable to update comment",
        description: error instanceof Error ? error.message : "Your comment could not be updated.",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => mongoClient.deleteComment(commentId),
    onSuccess: async (success, commentId) => {
      if (success) {
        queryClient.setQueryData<mongoClient.CommentItem[]>(queryKey, (prev = []) =>
          prev.filter((c) => c.id !== commentId),
        );
      }
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (feedbackType: mongoClient.FeedbackType) => {
      await setFeedback({
        content_id: contentId,
        content_type: contentType,
        feedback_type: feedbackType,
        title,
        poster_path: posterPath,
        genres,
        language,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: feedbackQueryKey });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentText.trim() || !hasValidCommentRating || postCommentMutation.isPending) return;
    postCommentMutation.mutate();
  };

  const handleStartEdit = (comment: mongoClient.CommentItem) => {
    setEditingCommentId(comment.id);
    setEditText(comment.text);
    setEditRating(comment.rating && comment.rating >= 1 && comment.rating <= 10 ? comment.rating : 8);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditText("");
    setEditRating(8);
  };

  const handleSaveEdit = (commentId: string) => {
    const normalizedText = editText.trim();
    if (!normalizedText || !Number.isInteger(editRating) || editRating < 1 || editRating > 10) return;
    updateCommentMutation.mutate({ commentId, text: normalizedText, rating: editRating });
  };

  const togglePublicReviewExpanded = (reviewId: string) => {
    setExpandedPublicReviews((prev) => ({ ...prev, [reviewId]: !prev[reviewId] }));
  };

  const ratedComments = comments.filter(
    (c) => typeof c.rating === "number" && c.rating >= 1 && c.rating <= 10,
  );
  const communityAverageRating = ratedComments.length
    ? ratedComments.reduce((sum, c) => sum + (c.rating as number), 0) / ratedComments.length
    : null;

  const visibleReviews = publicReviews.slice(0, visiblePublicReviews);

  const selectedFeedback = feedbackSummary?.user_feedback || getFeedback(contentId, contentType);
  const feedbackCounts = feedbackSummary?.counts || EMPTY_COUNTS;
  const totalFeedbackVotes = FEEDBACK_OPTIONS.reduce((acc, o) => acc + (feedbackCounts[o.value] || 0), 0);

  return (
    <section className="mt-10 max-w-4xl">
      <div className="mb-5">
        <h2 className="text-xl font-semibold mb-1">Community</h2>
        <p className="text-sm text-muted-foreground">Reviews, ratings & community reactions</p>
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border/50 mb-6 overflow-x-auto scrollbar-hide">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          let badge: number | null = null;
          if (id === "community") badge = comments.length;
          if (id === "reviews") badge = publicReviews.length;
          if (id === "feedback") badge = totalFeedbackVotes;

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                isActive
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50",
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
              {badge !== null && badge > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none",
                    isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab: Write Review */}
      {activeTab === "write" && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Share your thoughts..."
            maxLength={1000}
            className="min-h-[96px] w-full max-w-full bg-card"
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1 min-w-[220px]">
              <p className="text-xs text-muted-foreground">Your Rating (1-10)</p>
              <div className="flex items-center gap-2">
                <StarRating value={commentRating} onChange={setCommentRating} interactive />
                <span className="text-sm font-medium text-foreground/90">{commentRating}/10</span>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <p className="text-xs text-muted-foreground">{commentText.length}/1000</p>
              <Button
                type="submit"
                disabled={!commentText.trim() || !hasValidCommentRating || postCommentMutation.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {postCommentMutation.isPending ? "Posting..." : "Post Comment"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Tab: Community Comments */}
      {activeTab === "community" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </span>
            {communityAverageRating !== null && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/15 text-primary whitespace-nowrap">
                <Star className="w-3 h-3 fill-current" />
                Avg {communityAverageRating.toFixed(1)} / 10
              </span>
            )}
          </div>

          {commentsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-card border border-border p-4 animate-pulse">
                  <div className="h-3 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-full mb-1" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="rounded-lg bg-card border border-border p-8 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No comments yet.</p>
              <button
                type="button"
                onClick={() => setActiveTab("write")}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Be the first to share your review
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => {
                const isOwner = !!user && comment.user_id === user.id;
                const isEditing = editingCommentId === comment.id;
                const hasRating = typeof comment.rating === "number" && comment.rating >= 1 && comment.rating <= 10;

                return (
                  <article key={comment.id} className="rounded-lg bg-card border border-border p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                          {comment.username?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{comment.username || "User"}</p>
                          <p className="text-[11px] text-muted-foreground">{formatTimestamp(comment.created_at)}</p>
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
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  disabled={deleteCommentMutation.isPending}
                                  title="Delete comment"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="border-border bg-card/95 backdrop-blur-md">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove your comment from the discussion for this title.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Keep comment</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => deleteCommentMutation.mutate(comment.id)}
                                  >
                                    {deleteCommentMutation.isPending ? "Deleting..." : "Delete"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          maxLength={1000}
                          className="min-h-[90px] bg-background"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <StarRating value={editRating} onChange={setEditRating} interactive />
                            <span className="text-sm font-medium text-foreground/90">{editRating}/10</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" onClick={handleCancelEdit}>Cancel</Button>
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
                              {updateCommentMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{comment.text}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Public Reviews */}
      {activeTab === "reviews" && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-secondary" />
            <span className="text-sm font-medium text-muted-foreground">{publicReviews.length} public {publicReviews.length === 1 ? "review" : "reviews"} from TMDB</span>
          </div>

          {reviewsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-card border border-border p-4 animate-pulse">
                  <div className="h-3 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-full mb-1" />
                  <div className="h-3 bg-muted rounded w-4/5" />
                </div>
              ))}
            </div>
          ) : publicReviews.length === 0 ? (
            <div className="rounded-lg bg-card border border-border p-8 text-center">
              <Globe className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No public reviews found for this title.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {visibleReviews.map((review) => {
                  const avatarSrc = getTMDBAvatarUrl(review.author_details?.avatar_path);
                  const author = review.author || review.author_details?.username || "TMDB User";
                  const rating = review.author_details?.rating;
                  const fullText = review.content || "";
                  const isExpanded = !!expandedPublicReviews[review.id];
                  const shouldTruncate = fullText.length > PUBLIC_REVIEW_PREVIEW_LENGTH;
                  const displayText = !shouldTruncate || isExpanded ? fullText : `${fullText.slice(0, PUBLIC_REVIEW_PREVIEW_LENGTH).trimEnd()}...`;

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
                            <p className="text-[11px] text-muted-foreground">{formatTimestamp(review.created_at)}</p>
                          </div>
                        </div>
                        {typeof rating === "number" && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary/15 text-secondary whitespace-nowrap">
                            <Star className="w-3 h-3 fill-current" />
                            {rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground/85 whitespace-pre-wrap break-words">{displayText}</p>
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
                    onClick={() => setVisiblePublicReviews((prev) => prev + PUBLIC_REVIEWS_LOAD_STEP)}
                  >
                    Load more reviews
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Community Feedback */}
      {activeTab === "feedback" && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Your reaction helps improve recommendations for everyone.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEEDBACK_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedFeedback === option.value;
              const count = feedbackCounts[option.value] || 0;
              const voteShare = totalFeedbackVotes > 0 ? Math.round((count / totalFeedbackVotes) * 100) : 0;

              return (
                <Button
                  key={option.value}
                  type="button"
                  variant="outline"
                  onClick={() => feedbackMutation.mutate(option.value)}
                  disabled={feedbackMutation.isPending}
                  className={cn(
                    "h-auto min-h-[110px] p-4 rounded-xl whitespace-normal text-left flex-col items-start gap-2 transition-all duration-300 ease-out",
                    isSelected
                      ? "border-primary/70 bg-primary/10 shadow-md shadow-primary/15"
                      : "border-border/70 bg-card/40 hover:border-primary/40 hover:bg-card/70",
                  )}
                >
                  <div className="w-full flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold leading-tight">
                      <Icon className={cn("w-4 h-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                      {option.label}
                    </span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">{option.hint}</p>
                  <p className="w-full mt-1 text-[11px] text-muted-foreground">
                    {count} votes{totalFeedbackVotes > 0 ? ` (${voteShare}%)` : ""}
                  </p>
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
