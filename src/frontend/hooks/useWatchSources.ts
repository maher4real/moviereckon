import { useQuery } from "@tanstack/react-query";
import { getWatchSources } from "@/frontend/lib/mongodbClient";
import type { SourceMediaType } from "@/shared/types/watchSources";

export const watchSourcesQueryKey = (contentId: number, contentType: SourceMediaType) =>
  ["watch-sources", contentType, contentId] as const;

/** Read one saved snapshot per title; opening a detail page never runs an import. */
export function useWatchSources(contentId: number, contentType: SourceMediaType) {
  return useQuery({
    queryKey: watchSourcesQueryKey(contentId, contentType),
    queryFn: ({ signal }) => getWatchSources(contentId, contentType, signal),
    enabled: Number.isSafeInteger(contentId) && contentId > 0,
    staleTime: 60_000,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
