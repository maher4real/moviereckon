import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleX, Medal, Rocket, Timer } from "lucide-react";
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

type FeedbackOption = {
  value: mongoClient.FeedbackType;
  label: string;
  hint: string;
  icon: typeof Rocket;
};

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  {
    value: "give_it_a_go",
    label: "Give it a go",
    hint: "Worth trying at least once.",
    icon: Rocket,
  },
  {
    value: "one_time_watch",
    label: "One-time watch",
    hint: "Decent, but not a rewatch.",
    icon: Timer,
  },
  {
    value: "must_watch",
    label: "Must Watch",
    hint: "Highly recommended by viewers.",
    icon: Medal,
  },
  {
    value: "skip",
    label: "Skip",
    hint: "Not worth your time.",
    icon: CircleX,
  },
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
    [contentType, contentId],
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
  const totalVotes = FEEDBACK_OPTIONS.reduce(
    (acc, option) => acc + (counts[option.value] || 0),
    0,
  );

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-2">Community Feedback</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Your reaction helps improve recommendations for everyone.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-4xl">
        {FEEDBACK_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedFeedback === option.value;
          const count = counts[option.value] || 0;
          const voteShare = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

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

              <div className="w-full mt-1">
                <div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/80 transition-all duration-500"
                    style={{ width: `${Math.max(voteShare, isSelected ? 6 : 0)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {count} votes{totalVotes > 0 ? ` (${voteShare}%)` : ""}
                </p>
              </div>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
