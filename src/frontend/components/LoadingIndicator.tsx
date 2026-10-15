import { LoaderCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export default function LoadingIndicator({ label, className, large = false }: { label: string; className?: string; large?: boolean }) {
  return <div role="status" aria-live="polite" className={cn("flex items-center gap-3 text-sm text-muted-foreground", className)}>
    <LoaderCircle aria-hidden="true" className={cn("shrink-0 animate-spin text-primary motion-reduce:animate-none", large ? "h-9 w-9" : "h-5 w-5")} />
    <span>{label}</span>
  </div>;
}
