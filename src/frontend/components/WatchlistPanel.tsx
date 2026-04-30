"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Bookmark, GripVertical, Check, Trash2, BookMarked, ExternalLink, ListVideo } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { ScrollArea } from "@/frontend/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/frontend/components/ui/tooltip";
import { useWatchlist, type WatchlistItem } from "@/frontend/hooks/useWatchlist";
import { useIsMobile } from "@/frontend/hooks/use-mobile";
import { useAuth } from "@/frontend/hooks/useAuth";
import MediaImage from "@/frontend/components/MediaImage";
import { getPosterUrl } from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

// ─── Sortable item ──────────────────────────────────────────────────────────

function SortableWatchlistCard({ item }: { item: WatchlistItem }) {
  const navigate = useNavigate();
  const { removeItem, markWatched } = useWatchlist();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleMarkWatched = (e: React.MouseEvent) => {
    e.stopPropagation();
    markWatched(item.content_id, item.content_type, !item.watched);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeItem(item.content_id, item.content_type);
  };

  const handleOpenDetail = () => {
    navigate(`/${item.content_type}/${item.content_id}`);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-2 rounded-xl",
        "bg-card border border-border",
        "motion-safe:transition-colors duration-200",
        "hover:bg-accent/30",
        isDragging && "shadow-lg ring-1 ring-primary/30 z-10",
        item.watched && "opacity-60",
      )}
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
          "min-h-11 min-w-11 md:min-h-0 md:min-w-0 md:p-1",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
        )}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Poster + title — clickable area to open detail */}
      <button
        onClick={handleOpenDetail}
        className="flex items-center gap-3 flex-1 min-w-0 text-left group/link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        aria-label={`Open ${item.title}`}
      >
        <div className="shrink-0 w-10 h-14 rounded-lg overflow-hidden bg-muted">
          <MediaImage
            src={getPosterUrl(item.poster_path, "small")}
            alt={item.title}
            className="w-full h-full object-cover"
            width={40}
            height={56}
            fallbackSrc="/fallbacks/poster.svg"
          />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-medium truncate leading-tight",
              "group-hover/link:text-primary motion-safe:transition-colors duration-150",
              item.watched && "line-through text-muted-foreground",
            )}
          >
            {item.title}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-xs text-muted-foreground capitalize">
              {item.content_type === "tv" ? "Series" : "Movie"}
            </p>
            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/50 group-hover/link:text-primary/60 motion-safe:transition-colors" />
          </div>
        </div>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleMarkWatched}
              className={cn(
                "cursor-pointer rounded-lg",
                "flex items-center justify-center",
                "min-h-11 min-w-11 md:min-h-8 md:min-w-8",
                "motion-safe:transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.watched
                  ? "text-green-500 bg-green-500/10 hover:bg-green-500/20"
                  : "text-muted-foreground hover:text-green-500 hover:bg-green-500/10",
              )}
              aria-label={item.watched ? "Mark as unwatched" : "Mark as watched"}
            >
              <Check className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {item.watched ? "Mark as unwatched" : "Mark as watched"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleRemove}
              className={cn(
                "cursor-pointer rounded-lg",
                "flex items-center justify-center",
                "min-h-11 min-w-11 md:min-h-8 md:min-w-8",
                "motion-safe:transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
              )}
              aria-label="Remove from watchlist"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Remove</TooltipContent>
        </Tooltip>
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
    reorder(arrayMove(items, oldIndex, newIndex));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pt-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-17.5 rounded-xl bg-muted/50 animate-pulse"
            aria-hidden="true"
          />
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
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Tap the bookmark icon on any movie or series to add it here.
          </p>
        </div>
      </div>
    );
  }

  const unwatched = items.filter((i) => !i.watched);
  const watched = items.filter((i) => i.watched);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {unwatched.map((item) => (
            <SortableWatchlistCard key={item.id} item={item} />
          ))}

          {watched.length > 0 && (
            <>
              <div className="flex items-center gap-2 mt-3 mb-1 px-1">
                <div className="flex-1 h-px bg-border" />
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">
                  Watched ({watched.length})
                </p>
                <div className="flex-1 h-px bg-border" />
              </div>
              {watched.map((item) => (
                <SortableWatchlistCard key={item.id} item={item} />
              ))}
            </>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─── FAB + Panel ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import type { WatchlistFlyEventDetail } from "./ContentCard";

export default function WatchlistPanel() {
  const { user } = useAuth();
  const { items, isOpen, openPanel, closePanel, toggleItem } = useWatchlist();
  const isMobile = useIsMobile();
  const [isDragOver, setIsDragOver] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);

  const [flyingPoster, setFlyingPoster] = useState<{ url: string; x: number; y: number; w: number; h: number } | null>(null);
  const [isSwallowing, setIsSwallowing] = useState(false);

  useEffect(() => {
    const handleFlyAnim = (e: Event) => {
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

      setTimeout(() => {
        setFlyingPoster(null);
        setIsSwallowing(true);
        setTimeout(() => setIsSwallowing(false), 400);
      }, 600);
    };

    window.addEventListener("watchlist-fly-anim", handleFlyAnim);
    return () => window.removeEventListener("watchlist-fly-anim", handleFlyAnim);
  }, []);

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
    setIsSwallowing(true);
    setTimeout(() => setIsSwallowing(false), 400);
    try {
      const raw = e.dataTransfer.getData("application/x-watchlist-item");
      if (!raw) return;
      const data = JSON.parse(raw) as {
        content_id: number;
        content_type: "movie" | "tv";
        title: string;
        poster_path: string | null;
      };
      await toggleItem(data);
      // Let it swallow the item first before opening the panel maybe, but for now just open it
      setTimeout(() => openPanel(), 300);
    } catch {
      // malformed drag data — ignore
    }
  };

  const panelHeader = (
    <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
      <div className="flex items-center gap-2">
        <ListVideo className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold text-base">Watchlist</span>
      </div>
      {items.length > 0 && (
        <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
          {items.length} {items.length === 1 ? "title" : "titles"}
        </span>
      )}
    </div>
  );

  const panelBody = (
    <ScrollArea className="h-96 md:h-110 w-full">
      <div className="px-2 pt-2 pb-6">
        <WatchlistContent />
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Floating Animation Overlay */}
      {flyingPoster && (
        <div
          style={{
            position: 'fixed',
            top: flyingPoster.y,
            left: flyingPoster.x,
            width: flyingPoster.w,
            height: flyingPoster.h,
            backgroundImage: `url(${flyingPoster.url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            borderRadius: '0.5rem',
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          }}
          className="animate-fly-to-bucket"
        />
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
                  "fixed z-40 shadow-xl rounded-full cursor-pointer",
                  "bottom-20 right-4 h-14 w-14",
                  "md:bottom-6 md:right-6 md:h-14 md:w-14",
                  "bg-primary text-primary-foreground",
                  "motion-safe:transition-all motion-safe:duration-200",
                  "hover:scale-105 active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isDragOver
                    ? "scale-110 shadow-2xl shadow-primary/50 ring-4 ring-primary/60 ring-offset-2 ring-offset-background bg-primary/90"
                    : "hover:bg-primary/90 hover:shadow-primary/25",
                  isSwallowing && "animate-bucket-swallow"
                )}
                aria-label="Open Watchlist"
              >
                <ListVideo className={cn("md:h-6 md:w-6 transition-transform", isDragOver ? "h-8 w-8 scale-110" : "h-6 w-6")} />
                {unwatchedCount > 0 && !isDragOver && (
                  <span
                    aria-label={`${unwatchedCount} unwatched items`}
                    className={cn(
                      "absolute -top-1.5 -right-1.5",
                      "h-5 w-5 rounded-full",
                      "bg-destructive text-destructive-foreground",
                      "text-[10px] font-bold",
                      "flex items-center justify-center",
                      "ring-2 ring-background",
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
          sideOffset={20}
          className="w-[calc(100vw-2rem)] sm:w-96 md:w-100 p-0 rounded-2xl shadow-2xl border-border bg-card/95 backdrop-blur-md overflow-hidden"
        >
          {panelHeader}
          {panelBody}
        </PopoverContent>
      </Popover>
    </>
  );
}
