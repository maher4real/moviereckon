"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, BookMarked, ListVideo, X } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/frontend/components/ui/tooltip";
import { getWatchlistStatus, useWatchlist, type WatchlistItem, type WatchlistStatus } from "@/frontend/hooks/useWatchlist";
import { useIsMobile } from "@/frontend/hooks/use-mobile";
import { useAuth } from "@/frontend/hooks/useAuth";
import MediaImage from "@/frontend/components/MediaImage";
import { getPosterUrl } from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

// ─── Sortable item ──────────────────────────────────────────────────────────

const WATCHLIST_STATUSES: { value: WatchlistStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

function SortableWatchlistCard({ item }: { item: WatchlistItem }) {
  const navigate = useNavigate();
  const { removeItem, setStatus, closePanel } = useWatchlist();
  const [isPending, setIsPending] = useState(false);
  const status = getWatchlistStatus(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    void removeItem(item.content_id, item.content_type).catch(() => undefined);
  };

  const handleStatusChange = async (value: string) => {
    const nextStatus = value as WatchlistStatus;
    if (nextStatus === status) return;
    setIsPending(true);
    try { await setStatus(item.content_id, item.content_type, nextStatus); }
    catch { /* The provider restores the previous status and explains the failure. */ }
    finally { setIsPending(false); }
  };

  const handleOpenDetail = () => {
    closePanel();
    navigate(`/${item.content_type}/${item.content_id}`);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "watchlist-item grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-x-1 gap-y-3 rounded-xl p-3",
        "bg-muted/25",
        "motion-safe:transition-colors duration-200",
        "hover:bg-accent/30",
        isDragging && "shadow-lg ring-1 ring-primary/30 z-10",
      )}
      aria-busy={isPending}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className={cn(
          "touch-none shrink-0",
          "cursor-grab active:cursor-grabbing",
          "text-muted-foreground hover:text-foreground",
          "motion-safe:transition-colors duration-150",
          "flex items-center justify-center",
          "size-11",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
        )}
        aria-label={`Reorder ${item.title}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Poster + title — clickable area to open detail */}
      <button
        onClick={handleOpenDetail}
        className="group/link flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${item.title}`}
      >
        <div className="h-18 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
          <MediaImage
            src={getPosterUrl(item.poster_path, "small")}
            alt={item.title}
            className="w-full h-full object-cover"
            width={48}
            height={72}
            fallbackSrc="/fallbacks/poster.svg"
          />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "line-clamp-2 break-words text-sm font-semibold leading-snug",
              "group-hover/link:text-primary motion-safe:transition-colors duration-150",
            )}
          >
            {item.title}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-xs text-muted-foreground capitalize">
              {item.content_type === "tv" ? "Series" : "Movie"}
            </p>
          </div>
        </div>
      </button>

      {/* Removing a title is separate from changing its viewing status. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleRemove}
              disabled={isPending}
              className={cn(
                "cursor-pointer rounded-lg",
                "flex items-center justify-center",
                "size-11 shrink-0 disabled:opacity-50",
                "motion-safe:transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
              )}
              aria-label={`Remove ${item.title} from watchlist`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Remove</TooltipContent>
        </Tooltip>
      <div className="col-span-3 grid min-w-0 grid-cols-2 gap-1 border-t border-border/60 pt-2 min-[400px]:grid-cols-4" role="group" aria-label={`Status for ${item.title}`}>
        {WATCHLIST_STATUSES.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => void handleStatusChange(option.value)}
            disabled={isPending}
            aria-label={`${option.label}: ${item.title}`}
            aria-pressed={status === option.value}
            className={cn(
              "min-h-11 min-w-0 rounded-md px-1 text-xs font-medium transition-colors disabled:opacity-50",
              status === option.value
                ? "bg-primary/15 text-foreground ring-1 ring-inset ring-primary/40"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >{option.label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Panel content ───────────────────────────────────────────────────────────

function WatchlistContent() {
  const { items, isLoading, reorder } = useWatchlist();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    // Completed titles stay in their own group; dragging changes order, not status.
    if ((getWatchlistStatus(items[oldIndex]) === "completed") !== (getWatchlistStatus(items[newIndex]) === "completed")) return;
    void reorder(arrayMove(items, oldIndex, newIndex)).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pt-2" role="status" aria-label="Loading watchlist">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex h-17.5 items-center gap-3 rounded-xl bg-muted/30 p-2" aria-hidden="true">
            <Skeleton className="h-full w-11 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-50 gap-4 text-center px-6 py-8">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
          <BookMarked className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Your watchlist is empty</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Tap the bookmark icon on any movie or series to add it here.
          </p>
        </div>
      </div>
    );
  }

  const unwatched = items.filter((i) => getWatchlistStatus(i) !== "completed");
  const watched = items.filter((i) => getWatchlistStatus(i) === "completed");

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex min-w-0 flex-col gap-3">
          <SortableContext items={unwatched.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {unwatched.map((item) => (
            <SortableWatchlistCard key={item.id} item={item} />
          ))}
          </SortableContext>

          {watched.length > 0 && (
            <>
              <div className="flex items-center gap-2 mt-3 mb-1 px-1">
                <div className="flex-1 h-px bg-border" />
                <p className="shrink-0 text-xs font-medium text-muted-foreground">
                  Watched ({watched.length})
                </p>
                <div className="flex-1 h-px bg-border" />
              </div>
              <SortableContext items={watched.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {watched.map((item) => (
                <SortableWatchlistCard key={item.id} item={item} />
              ))}
              </SortableContext>
            </>
          )}
        </div>
    </DndContext>
  );
}

// ─── FAB + Panel ─────────────────────────────────────────────────────────────

import type { WatchlistFlyEventDetail } from "./ContentCard";
import { Skeleton } from "@/frontend/components/ui/skeleton";

export default function WatchlistPanel() {
  const { user } = useAuth();
  const { items, isOpen, openPanel, closePanel, toggleItem, isInWatchlist } = useWatchlist();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const [isDragOver, setIsDragOver] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [flyingPoster, setFlyingPoster] = useState<{ url: string; x: number; y: number; w: number; h: number } | null>(null);
  const [isSwallowing, setIsSwallowing] = useState(false);

  useEffect(() => {
    const handleFlyAnim = (e: Event) => {
      if (reduceMotion) return;
      const customEvent = e as CustomEvent<WatchlistFlyEventDetail>;
      const { x, y, width, height, posterUrl } = customEvent.detail;
      
      setFlyingPoster({ url: posterUrl, x, y, w: width, h: height });
      
      if (fabRef.current) {
        const fabRect = fabRef.current.getBoundingClientRect();
        const targetX = fabRect.left + fabRect.width / 2 - width / 2;
        const targetY = fabRect.top + fabRect.height / 2 - height / 2;
        
        document.documentElement.style.setProperty('--fly-x', `${targetX - x}px`);
        document.documentElement.style.setProperty('--fly-y', `${targetY - y}px`);
      }

      timers.current.push(setTimeout(() => {
        setFlyingPoster(null);
        setIsSwallowing(true);
        timers.current.push(setTimeout(() => setIsSwallowing(false), 400));
      }, 600));
    };

    window.addEventListener("watchlist-fly-anim", handleFlyAnim);
    return () => {
      window.removeEventListener("watchlist-fly-anim", handleFlyAnim);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduceMotion]);

  if (!user) return null;

  const unwatchedCount = items.filter((i) => !i.watched).length;

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-watchlist-item")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!reduceMotion) {
      setIsSwallowing(true);
      timers.current.push(setTimeout(() => setIsSwallowing(false), 400));
    }
    try {
      const raw = e.dataTransfer.getData("application/x-watchlist-item");
      if (!raw) return;
      const data = JSON.parse(raw) as {
        content_id: number;
        content_type: "movie" | "tv";
        title: string;
        poster_path: string | null;
      };
      if (!isInWatchlist(data.content_id, data.content_type)) await toggleItem(data);
      timers.current.push(setTimeout(() => openPanel(), reduceMotion ? 0 : 300));
    } catch {
      // malformed drag data — ignore
    }
  };

  const panelHeader = (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2.5">
        <ListVideo className="h-5 w-5 text-primary shrink-0" />
        <h2 id="watchlist-heading" className="text-lg font-semibold">Watchlist</h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium tabular-nums text-muted-foreground" aria-live="polite">
          {items.length} {items.length === 1 ? "title" : "titles"}
        </span>
        <button type="button" onClick={closePanel} className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close watchlist"><X className="size-5" /></button>
      </div>
    </div>
  );

  const panelBody = (
    <div className="max-h-[min(32rem,calc(100dvh-15rem))] overflow-y-auto overscroll-contain" data-lenis-prevent>
      <div className="min-w-0 p-3">
        <WatchlistContent />
      </div>
    </div>
  );

  return (
    <>
      {/* Floating Animation Overlay */}
      {flyingPoster && createPortal(
        <div
          style={{
            position: 'fixed',
            top: flyingPoster.y,
            left: flyingPoster.x,
            width: flyingPoster.w,
            height: flyingPoster.h,
            backgroundImage: `url("${flyingPoster.url}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            borderRadius: '0.5rem',
            zIndex: 99999,
            pointerEvents: 'none',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          }}
          className="animate-fly-to-bucket"
        />,
        document.body
      )}

      {/* FAB + Popover */}
      <Popover open={isOpen} onOpenChange={setOpen => setOpen ? openPanel() : closePanel()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                ref={fabRef}
                onDragOver={isMobile ? undefined : handleDragOver}
                onDragLeave={isMobile ? undefined : handleDragLeave}
                onDrop={isMobile ? undefined : handleDrop}
                size="icon"
                className={cn(
                  "group fixed z-[60] rounded-full cursor-pointer overflow-visible",
                  "bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-3 size-14",
                  "md:bottom-6 md:right-6 md:h-12 md:w-auto md:gap-2.5 md:rounded-xl md:px-4",
                  "border border-primary/35 bg-primary text-primary-foreground",
                  "shadow-[0_10px_28px_hsl(0_0%_0%/0.4)]",
                  "motion-safe:transition-all motion-safe:duration-300",
                  "hover:-translate-y-0.5 active:translate-y-0 active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "[&_svg]:size-5",
                  isDragOver
                    ? "scale-110 bg-primary/95 shadow-[0_0_0_10px_hsl(var(--primary)/0.16),0_24px_64px_hsl(var(--primary)/0.58)] ring-4 ring-primary/60 ring-offset-2 ring-offset-background"
                    : "hover:bg-primary/95",
                  isSwallowing && "animate-bucket-swallow"
                )}
                aria-label="Open Watchlist"
              >
                <ListVideo
                  data-icon="inline-start"
                  className={cn(
                    "relative motion-safe:transition-transform duration-300",
                    isDragOver ? "scale-110 -rotate-6" : "group-hover:rotate-[-4deg]",
                  )}
                />
                <span className="hidden text-sm font-semibold md:inline">Watchlist</span>
                {unwatchedCount > 0 && !isDragOver && (
                  <span
                    aria-label={`${unwatchedCount} unwatched items`}
                    className={cn(
                      "absolute -top-1.5 -right-1.5 size-5 rounded-full",
                      "bg-background text-primary",
                      "text-[10px] font-bold tabular-nums",
                      "flex items-center justify-center",
                      "ring-2 ring-primary shadow-[0_8px_20px_hsl(var(--primary)/0.36)]",
                    )}
                  >
                    {unwatchedCount > 99 ? "99+" : unwatchedCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" className="hidden md:block">
            {isDragOver ? "Drop to add to Watchlist" : "Watchlist"}
          </TooltipContent>
        </Tooltip>

        <PopoverContent 
          side="top" 
          align="end" 
          sideOffset={12}
          collisionPadding={12}
          onCloseAutoFocus={event => { event.preventDefault(); fabRef.current?.focus(); }}
          aria-labelledby="watchlist-heading"
          className="z-[60] w-[min(28rem,calc(100vw-1.5rem))] max-w-[var(--radix-popover-content-available-width)] overflow-hidden rounded-2xl border-border bg-card p-0 shadow-[0_16px_60px_hsl(0_0%_0%/0.5)]"
        >
          {panelHeader}
          {panelBody}
        </PopoverContent>
      </Popover>
    </>
  );
}
