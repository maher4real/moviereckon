import { cn } from "@/shared/lib/utils";

/**
 * Placeholder block with a light sweep. Decorative: wrap a group of skeletons in
 * an element with `role="status"` and a label so assistive tech announces one
 * loading state instead of dozens of empty boxes.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("skeleton rounded-md", className)} {...props} />;
}

export { Skeleton };
