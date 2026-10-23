import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  CircleX,
  Globe,
  Medal,
  MessageSquare,
  Pencil,
  Rocket,
  Star,
  Timer,
  Trash2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import ReckonMeter from "@/frontend/components/ReckonMeter";
import { computeReckonMeter } from "@/shared/lib/reckonMeter";
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
import { Skeleton } from "@/frontend/components/ui/skeleton";

interface CommentsSectionProps {
  contentId: number;
  contentType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  genres: number[];
  language: string;
  /** TMDB audience average and vote count, used by the Reckon Meter. */
  voteAverage?: number | null;
  voteCount?: number | null;
}

type CommentSort = "newest" | "highest" | "lowest";

const RATING_WORDS: Record<number, string> = {
  1: "Awful", 2: "Awful", 3: "Poor", 4: "Poor", 5: "Okay", 6: "Decent", 7: "Good", 8: "Great", 9: "Excellent", 10: "Masterpiece",
};

export function ratingTone(rating: number): string {
  if (rating >= 8) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
  if (rating >= 6) return "text-sky-400 bg-sky-400/10 border-sky-400/30";
  if (rating >= 4) return "text-amber-400 bg-amber-400/10 border-amber-400/30";
  return "text-rose-400 bg-rose-400/10 border-rose-400/30";
}

function RatingPill({ rating }: { rating: number }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", ratingTone(rating))}>
      <Star className="size-3 fill-current" aria-hidden="true" />
      {Number.isInteger(rating) ? rating : rating.toFixed(1)}<span className="sr-only"> out of 10</span>
    </span>
  );
}

/** Ten numbered steps; reads faster than stars and works on touch. */
function RatingPicker({ value, onChange, idPrefix }: { value: number; onChange: (value: number) => void; idPrefix: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p id={`${idPrefix}-label`} className="text-xs text-muted-foreground">Your rating</p>
        <p className="text-sm font-semibold tabular-nums" aria-live="polite">
          {value}/10 <span className={cn("font-medium", ratingTone(value).split(" ")[0])}>{RATING_WORDS[value]}</span>
        </p>
      </div>
      <div className="mt-2 grid grid-cols-10 gap-1" role="radiogroup" aria-labelledby={`${idPrefix}-label`}>
        {Array.from({ length: 10 }, (_, index) => {
          const rating = index + 1;
          const active = rating <= value;
          return (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`Rate ${rating} out of 10`}
              onClick={() => onChange(rating)}
              className={cn(
                "h-9 rounded-md border text-xs font-semibold tabular-nums transition-colors sm:h-10",
                active ? ratingTone(value) : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {rating}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function relativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Just now";
  const seconds = Math.round((time - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "Just now";
}

const INITIAL_PUBLIC_REVIEWS_VISIBLE = 6;
const PUBLIC_REVIEWS_LOAD_STEP = 6;
const PUBLIC_REVIEW_PREVIEW_LENGTH = 420;

type FeedbackOption = {
  value: mongoClient.FeedbackType;
  label: string;
  icon: typeof Rocket;
  color: string;
};

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  { value: "give_it_a_go", label: "Give it a go", icon: Rocket, color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  { value: "one_time_watch", label: "One-time watch", icon: Timer, color: "text-primary bg-primary/10 border-primary/30" },
  { value: "must_watch", label: "Must Watch", icon: Medal, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" },
  { value: "skip", label: "Skip", icon: CircleX, color: "text-rose-400 bg-rose-400/10 border-rose-400/30" },
  { value: "not_now", label: "Not now", icon: Clock3, color: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
];

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

function FeedbackTag({ feedbackType }: { feedbackType: mongoClient.FeedbackType }) {
  const option = FEEDBACK_OPTIONS.find((o) => o.value === feedbackType);
  if (!option) return null;
  const Icon = option.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", option.color)}>
      <Icon className="w-2.5 h-2.5" />
      {option.label}
    </span>
  );
}

export default function CommentsSection({
  contentId,
  contentType,
  title,
  posterPath,
  genres,
  language,
  voteAverage,
  voteCount,
}: CommentsSectionProps) {
  const [commentSort, setCommentSort] = useState<CommentSort>("newest");
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState(8);
  const [selectedFeedback, setSelectedFeedback] = useState<mongoClient.FeedbackType | null>(null);
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
    setCommentText("");
    setCommentRating(8);
    // Pre-fill feedback selector with the user's existing feedback for this content
    setSelectedFeedback(getFeedback(contentId, contentType));
  }, [contentId, contentType, getFeedback]);

  const hasValidCommentRating = Number.isInteger(commentRating) && commentRating >= 1 && commentRating <= 10;

  const queryKey = useMemo(() => ["content-comments", contentType, contentId], [contentType, contentId]);

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

  const feedbackSummaryKey = useMemo(() => ["content-feedback", contentType, contentId], [contentType, contentId]);
  const { data: feedbackSummary, isLoading: summaryLoading } = useQuery({
    queryKey: feedbackSummaryKey,
    queryFn: () => mongoClient.fetchContentFeedbackSummary(contentId, contentType),
    enabled: !!contentId,
    staleTime: 60_000,
  });

  const { data: meterSources, isLoading: meterSourcesLoading } = useQuery({
    queryKey: ["reckon-meter-sources", contentType, contentId],
    queryFn: () => mongoClient.fetchMeterSources(contentId, contentType),
    enabled: !!contentId,
    staleTime: 1000 * 60 * 60 * 6,
  });

  const postCommentMutation = useMutation({
    mutationFn: async () => {
      const comment = await mongoClient.postComment({
        content_id: contentId,
        content_type: contentType,
        text: commentText.trim(),
        rating: commentRating,
      });

      // Save feedback alongside the comment if one is selected
      if (selectedFeedback) {
        await setFeedback({
          content_id: contentId,
          content_type: contentType,
          feedback_type: selectedFeedback,
          title,
          poster_path: posterPath,
          genres,
          language,
        });
      }

      return comment;
    },
    onSuccess: async (newComment) => {
      setCommentText("");
      setCommentRating(8);

      if (newComment) {
        queryClient.setQueryData<mongoClient.CommentItem[]>(queryKey, (prev = []) => [newComment, ...prev]);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: feedbackSummaryKey }),
      ]);
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

  const handleSubmit = (event: { preventDefault(): void }) => {
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

  const meter = useMemo(
    () => computeReckonMeter({
      // Server data covers every TMDB review page; the page's own data is the
      // fallback when that request fails.
      audience: meterSources?.tmdb
        ? { average: meterSources.tmdb.average, votes: meterSources.tmdb.votes }
        : { average: voteAverage, votes: voteCount },
      reviewerRatings: meterSources?.tmdb
        ? meterSources.tmdb.reviewerRatings
        : publicReviews.map((review) => review.author_details?.rating),
      communityRatings: comments.map((comment) => comment.rating),
      reactions: feedbackSummary?.counts,
      external: meterSources?.wikidata?.ratings,
    }),
    [comments, feedbackSummary?.counts, meterSources, publicReviews, voteAverage, voteCount],
  );

  const sortedComments = useMemo(() => {
    if (commentSort === "newest") return comments;
    const direction = commentSort === "highest" ? -1 : 1;
    return [...comments].sort((left, right) => {
      const leftRating = left.rating ?? (commentSort === "highest" ? 0 : 11);
      const rightRating = right.rating ?? (commentSort === "highest" ? 0 : 11);
      return direction * (leftRating - rightRating);
    });
  }, [commentSort, comments]);

  const visibleReviews = publicReviews.slice(0, visiblePublicReviews);
  const userInitial = (user?.username || user?.email || "Y").charAt(0).toUpperCase();

  const listSkeleton = (rows: number) => (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-surface p-4" aria-hidden="true">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="mb-1.5 h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );

  return (
    <section className="mt-10 max-w-4xl" aria-labelledby="reviews-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="reviews-heading" className="text-2xl font-semibold tracking-tight">Reviews &amp; ratings</h2>
          <p className="mt-1 text-sm text-muted-foreground">What people think of {title}</p>
        </div>
        {communityAverageRating !== null && (
          <p className="text-sm text-muted-foreground">
            Community avg <span className="font-semibold tabular-nums text-foreground">{communityAverageRating.toFixed(1)}</span>/10
          </p>
        )}
      </div>

      <ReckonMeter meter={meter} isLoading={commentsLoading || reviewsLoading || summaryLoading || meterSourcesLoading} />

      {/* Write review */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-border/70 bg-card/50 p-4 sm:p-5" aria-label="Write a review">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary" aria-hidden="true">{userInitial}</div>
          <div>
            <p className="text-sm font-semibold">Your take</p>
            <p className="text-xs text-muted-foreground">Your rating and reaction feed the Reckon Meter and your recommendations.</p>
          </div>
        </div>

        <RatingPicker value={commentRating} onChange={setCommentRating} idPrefix="new-review-rating" />

        <div>
          <p className="mb-2 text-xs text-muted-foreground">Reaction <span className="text-muted-foreground/70">(optional)</span></p>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedFeedback === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedFeedback(isSelected ? null : option.value)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    isSelected ? option.color : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {option.label}
                  {isSelected && <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        <Textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={`What worked, what didn't? Keep spoilers out.`}
          aria-label="Your review"
          maxLength={1000}
          className="min-h-24 w-full max-w-full bg-background/60"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-muted-foreground">{commentText.length}/1000</p>
          <Button
            type="submit"
            disabled={!commentText.trim() || !hasValidCommentRating || postCommentMutation.isPending}
            className="min-h-11 px-5"
          >
            {postCommentMutation.isPending ? "Posting…" : "Post review"}
          </Button>
        </div>
      </form>

      <Tabs defaultValue="community" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Review source" className="h-11 rounded-xl">
            <TabsTrigger value="community" className="min-h-9 gap-2 rounded-lg">
              <MessageSquare className="size-4" aria-hidden="true" />Community
              <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">{comments.length}</span>
            </TabsTrigger>
            <TabsTrigger value="public" className="min-h-9 gap-2 rounded-lg">
              <Globe className="size-4" aria-hidden="true" />Public reviews
              <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">{publicReviews.length}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="community" className="mt-4">
          {comments.length > 1 && (
            <div className="mb-3 flex justify-end">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Sort
                <select
                  value={commentSort}
                  onChange={(event) => setCommentSort(event.target.value as CommentSort)}
                  className="min-h-9 rounded-lg border border-border bg-card/60 px-2 text-sm text-foreground"
                >
                  <option value="newest">Newest</option>
                  <option value="highest">Highest rated</option>
                  <option value="lowest">Lowest rated</option>
                </select>
              </label>
            </div>
          )}

          {commentsLoading ? listSkeleton(3) : comments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
              <MessageSquare className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No reviews yet. Yours will be the first.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {sortedComments.map((comment) => {
                const isOwner = !!user && comment.user_id === user.id;
                const isEditing = editingCommentId === comment.id;
                const hasRating = typeof comment.rating === "number" && comment.rating >= 1 && comment.rating <= 10;
                const userFeedback = isOwner ? getFeedback(contentId, contentType) : null;

                return (
                  <li key={comment.id}>
                    <article className={cn("rounded-xl border bg-card/60 p-4", isOwner ? "border-primary/30" : "border-border/70")}>
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary" aria-hidden="true">
                            {comment.username?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">{comment.username || "User"}</p>
                              {isOwner && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">You</span>}
                              {userFeedback && <FeedbackTag feedbackType={userFeedback} />}
                            </div>
                            <time dateTime={comment.created_at} title={formatTimestamp(comment.created_at)} className="text-[11px] text-muted-foreground">
                              {relativeTime(comment.created_at)}
                              {comment.updated_at && comment.updated_at !== comment.created_at ? " · edited" : ""}
                            </time>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {hasRating && <RatingPill rating={comment.rating!} />}
                          {isOwner && !isEditing && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-9"
                                onClick={() => handleStartEdit(comment)}
                                aria-label="Edit review"
                                title="Edit review"
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-9 text-destructive hover:text-destructive"
                                    disabled={deleteCommentMutation.isPending}
                                    aria-label="Delete review"
                                    title="Delete review"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="border-border bg-card/95 backdrop-blur-md">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete review?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This permanently removes your review and its rating from this title.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Keep review</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => deleteCommentMutation.mutate(comment.id)}
                                    >
                                      {deleteCommentMutation.isPending ? "Deleting…" : "Delete"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-3">
                          <RatingPicker value={editRating} onChange={setEditRating} idPrefix={`edit-${comment.id}`} />
                          <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            aria-label="Edit your review"
                            maxLength={1000}
                            className="min-h-[90px] bg-background"
                          />
                          <div className="flex justify-end gap-2">
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
                              {updateCommentMutation.isPending ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 wrap-break-word">{comment.text}</p>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="public" className="mt-4">
          {reviewsLoading ? listSkeleton(2) : publicReviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
              <Globe className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No public reviews found for this title.</p>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {visibleReviews.map((review) => {
                  const avatarSrc = getTMDBAvatarUrl(review.author_details?.avatar_path);
                  const author = review.author || review.author_details?.username || "TMDB User";
                  const rating = review.author_details?.rating;
                  const fullText = review.content || "";
                  const isExpanded = !!expandedPublicReviews[review.id];
                  const shouldTruncate = fullText.length > PUBLIC_REVIEW_PREVIEW_LENGTH;
                  const displayText = !shouldTruncate || isExpanded ? fullText : `${fullText.slice(0, PUBLIC_REVIEW_PREVIEW_LENGTH).trimEnd()}…`;

                  return (
                    <li key={review.id}>
                      <article className="rounded-xl border border-border/70 bg-card/60 p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <MediaImage
                              src={avatarSrc}
                              alt=""
                              className="size-8 rounded-full object-cover"
                              fallbackSrc="/fallbacks/profile.svg"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{author}</p>
                              <time dateTime={review.created_at} title={formatTimestamp(review.created_at)} className="text-[11px] text-muted-foreground">
                                {relativeTime(review.created_at)} · TMDB
                              </time>
                            </div>
                          </div>
                          {typeof rating === "number" && <RatingPill rating={rating} />}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85 wrap-break-word">{displayText}</p>
                        {shouldTruncate && (
                          <button
                            type="button"
                            onClick={() => togglePublicReviewExpanded(review.id)}
                            aria-expanded={isExpanded}
                            className="mt-2 min-h-9 text-xs font-medium text-primary hover:underline"
                          >
                            {isExpanded ? "Show less" : "Read more"}
                          </button>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ul>

              {publicReviews.length > visiblePublicReviews && (
                <div className="mt-4 flex justify-center">
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
        </TabsContent>
      </Tabs>
    </section>
  );
}
