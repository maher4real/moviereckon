import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date object as "YYYY-MM-DD" in local time (used for TMDB date comparisons). */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** True for Japanese animation (anime), used to filter content from non-anime shelves. */
export function isAnimeLike(item: { original_language: string; genre_ids?: number[] }): boolean {
  return item.original_language === "ja" && (item.genre_ids?.includes(16) ?? false);
}
