import { lazy, memo } from "react";
import ContentCarousel from "@/frontend/components/ContentCarousel";

// Shared by MovieDetail and TVDetail so the two pages stay in step.
export const MemoizedCarousel = memo(ContentCarousel);
export const LazyCommentsSection = lazy(() => import("@/frontend/components/CommentsSection"));
export const PREVIEW_AUTOPLAY_TIMEOUT_MS = 12000;
export const BACKGROUND_VIDEO_BOOT_DELAY_MS = 900;
