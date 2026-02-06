import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import * as mongoClient from "@/lib/mongodbClient";
import { useUserData } from "@/hooks/useUserData";
import { cn } from "@/lib/utils";

interface FeedbackButtonsProps {
  contentId: number;
  contentType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  genres: number[];
  language: string;
}

const FEEDBACK_OPTIONS: { value: mongoClient.FeedbackType; label: string }[] = [
  { value: "give_it_a_go", label: "Give it a go" },
  { value: "one_time_watch", label: "One-time watch" },
  { value: "must_watch", label: "Must Watch" },
  { value: "skip", label: "Skip" },
];

const EMPTY_COUNTS: Record<mongoClient.FeedbackType, number> = {
  give_it_a_go: 0,
  one_time_watch: 0,
  must_watch: 0,
  skip: 0,
};

export default function FeedbackButtons({
  contentId,
  contentType,
  title,
  posterPath,
  genres,
  language,
}: FeedbackButtonsProps) {
  const queryClient = useQueryClient();
  const { setFeedback, getFeedback } = useUserData();

  const queryKey = useMemo(
    () => ["content-feedback", contentType, contentId],
    [contentType, contentId]
  );

  const { data: summary } = useQuery({
    queryKey,
    queryFn: () => mongoClient.fetchContentFeedbackSummary(contentId, contentType),
    enabled: !!contentId,
    refetchInterval: 20_000,
    staleTime: 10_000,
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
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const selectedFeedback = summary?.user_feedback || getFeedback(contentId, contentType);
  const counts = summary?.counts || EMPTY_COUNTS;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">Community Feedback</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Your reaction helps improve recommendations for everyone.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-4xl">
        {FEEDBACK_OPTIONS.map((option) => {
          const isSelected = selectedFeedback === option.value;
          const count = counts[option.value] || 0;
          return (
            <Button
              key={option.value}
              type="button"
              variant={isSelected ? "default" : "outline"}
              onClick={() => feedbackMutation.mutate(option.value)}
              disabled={feedbackMutation.isPending}
              className={cn(
                "h-auto py-3 px-3 whitespace-normal text-left flex-col items-start gap-1 transition-all duration-200 active:scale-95",
                isSelected && "shadow-md shadow-primary/20"
              )}
            >
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-xs opacity-80">{count} votes</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
