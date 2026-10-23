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
import { GripVertical, Trash2, BookMarked, ListVideo, X, ChevronDown } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/frontend/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/frontend/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/frontend/components/ui/tooltip";
import { getWatchlistStatus, useWatchlist, type WatchlistItem, type WatchlistStatus } from "@/frontend/hooks/useWatchlist";
import { useIsMobile } from "@/frontend/hooks/use-mobile";
import { useAuth } from "@/frontend/hooks/useAuth";
import MediaImage from "@/frontend/components/MediaImage";
import { getPosterUrl } from "@/shared/lib/tmdb";
import { cn } from "@/shared/lib/utils";

// ─── Sortable item ──────────────────────────────────────────────────────────

const WATCHLIST_STATUSES: { value: WatchlistStatus; label: string; dot: string }[] = [
  { value: "saved", label: "Saved", dot: "bg-muted-foreground" },
  { value: "watching", label: "Watching", dot: "bg-sky-400" },
  { value: "completed", label: "Completed", dot: "bg-emerald-400" },
  { value: "dropped", label: "Dropped", dot: "bg-rose-400" },
];

type WatchlistFilter = "all" | WatchlistStatus;

function SortableWatchlistCard({ item }: { item: WatchlistItem }) {
  const navigate = useNavigate();
  const { removeItem, setStatus, closePanel } = useWatchlist();
  const [isPending, setIsPending] = useState(false);
  const status = getWatchlistStatus(item);
  const current = WATCHLIST_STATUSES.find((option) => option.value === status)!;
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
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "watchlist-item group/item flex min-w-0 items-center gap-1 rounded-xl border border-transparent p-2 pr-1",
        "motion-safe:transition-colors duration-200 hover:border-border/70 hover:bg-muted/30",
        isDragging && "z-10 border-primary/30 bg-card shadow-lg",
      )}
      aria-busy={isPending}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex size-11 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing motion-safe:transition-colors"
        aria-label={`Reorder ${item.title}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        onClick={handleOpenDetail}
        className="group/link shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${item.title}`}
      >
        <span className={cn(
          "block h-21 w-14 overflow-hidden rounded-lg bg-muted shadow-[0_6px_16px_hsl(0_0%_0%/0.35)] ring-1 ring-white/5",
          status === "dropped" && "opacity-50 grayscale",
        )}>
          <MediaImage
            src={getPosterUrl(item.poster_path, "small")}
            alt=""
            className="h-full w-full object-cover motion-safe:transition-transform duration-300 group-hover/link:scale-105"
            width={56}
            height={84}
            fallbackSrc="/fallbacks/poster.svg"
          />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2 pl-2">
        <button
          type="button"
          onClick={handleOpenDetail}
          tabIndex={-1}
          className={cn(
            "line-clamp-2 break-words text-left text-sm font-semibold leading-snug hover:text-primary motion-safe:transition-colors",
            status === "dropped" && "text-muted-foreground",
          )}
        >
          {item.title}
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {item.content_type === "tv" ? "Series" : "Movie"}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isPending}
                aria-label={`Status for ${item.title}: ${current.label}`}
                className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-border/70 px-2 text-[11px] font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <span className={cn("size-1.5 rounded-full", current.dot)} aria-hidden="true" />
                {current.label}
                <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[70] min-w-36">
              <DropdownMenuRadioGroup value={status} onValueChange={(value) => void handleStatusChange(value)}>
                {WATCHLIST_STATUSES.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className="min-h-10 gap-2">
                    <span className={cn("size-2 rounded-full", option.dot)} aria-hidden="true" />
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-safe:transition-colors md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100"
            aria-label={`Remove ${item.title} from watchlist`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Remove</TooltipContent>
      </Tooltip>
    </li>
  );
}

// ─── Panel content ───────────────────────────────────────────────────────────

function WatchlistContent() {
  const { items, isLoading, reorder } = useWatchlist();
  const [filter, setFilter] = useState<WatchlistFilter>("all");

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
          <div key={n} className="flex items-center gap-3 rounded-xl p-2" aria-hidden="true">
            <Skeleton className="h-21 w-14 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-5 w-1/3 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-50 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
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

  const counts = Object.fromEntries(WATCHLIST_STATUSES.map(({ value }) => [value, items.filter((i) => getWatchlistStatus(i) === value).length])) as Record<WatchlistStatus, number>;
  const filters = [
    { value: "all" as const, label: "All", count: items.length, dot: null },
    ...WATCHLIST_STATUSES.filter(({ value }) => counts[value] > 0).map(({ value, label, dot }) => ({ value, label, count: counts[value], dot })),
  ];
  const activeFilter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const groups = activeFilter === "all"
    ? [
        { key: "active", label: null, rows: items.filter((i) => getWatchlistStatus(i) !== "completed") },
        { key: "completed", label: `Watched · ${counts.completed}`, rows: items.filter((i) => getWatchlistStatus(i) === "completed") },
      ]
    : [{ key: activeFilter, label: null, rows: items.filter((i) => getWatchlistStatus(i) === activeFilter) }];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div role="group" aria-label="Filter watchlist" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
        {filters.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={activeFilter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium motion-safe:transition-colors",
              activeFilter === option.value
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.dot && <span className={cn("size-1.5 rounded-full", option.dot)} aria-hidden="true" />}
            {option.label}
            <span className="tabular-nums text-muted-foreground">{option.count}</span>
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {groups.filter((group) => group.rows.length > 0).map((group) => (
          <section key={group.key} className="min-w-0">
            {group.label && (
              <div className="mb-1 mt-2 flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-border" />
                <p className="shrink-0 text-xs font-medium text-muted-foreground">{group.label}</p>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <SortableContext items={group.rows.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex min-w-0 flex-col gap-1">
                {group.rows.map((item) => <SortableWatchlistCard key={item.id} item={item} />)}
              </ul>
            </SortableContext>
          </section>
        ))}
      </DndContext>
    </div>
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
      
      // Desktop flies into the floating button, phones into the bottom-nav tab.
      const target = [...document.querySelectorAll<HTMLElement>("[data-watchlist-target]")]
        .find((element) => element.getBoundingClientRect().width > 0);
      if (target) {
        const fabRect = target.getBoundingClientRect();
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

  // The drawer names itself from its own title id; the desktop popover uses this one.
  const heading = <h2 {...(isMobile ? {} : { id: "watchlist-heading" })} className="text-lg font-semibold">Watchlist</h2>;
  const panelHeader = (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2.5">
        <ListVideo className="h-5 w-5 text-primary shrink-0" />
        {isMobile ? <DrawerTitle asChild>{heading}</DrawerTitle> : heading}
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
    <div className="max-h-[32rem] min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
      <div className="min-w-0 p-3">
        <WatchlistContent />
      </div>
    </div>
  );

  const flyingOverlay = flyingPoster && createPortal(
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
      );

  // Phones open the list from the bottom nav as a drawer; a floating button
  // there would sit on top of page content.
  if (isMobile) {
    return (
      <>
        {flyingOverlay}
        <Drawer open={isOpen} onOpenChange={(open) => open ? openPanel() : closePanel()} shouldScaleBackground={false} handleOnly>
          <DrawerContent aria-describedby={undefined} className="max-h-[88dvh] border-border bg-card pb-[env(safe-area-inset-bottom,0px)]">
            {panelHeader}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
              <div className="min-w-0 p-3"><WatchlistContent /></div>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      {flyingOverlay}

      {/* FAB + Popover */}
      <Popover open={isOpen} onOpenChange={setOpen => setOpen ? openPanel() : closePanel()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                ref={fabRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                size="icon"
                className={cn(
                  // Above page content, below the header, bottom nav, dialogs and sheets (z-50).
                  "group fixed z-40 rounded-full cursor-pointer overflow-visible",
                  "bottom-6 right-6 h-12 w-auto gap-2.5 rounded-xl px-4",
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
                data-watchlist-target
              >
                <ListVideo
                  data-icon="inline-start"
                  className={cn(
                    "relative motion-safe:transition-transform duration-300",
                    isDragOver ? "scale-110 -rotate-6" : "group-hover:rotate-[-4deg]",
                  )}
                />
                <span className="text-sm font-semibold">Watchlist</span>
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
          <TooltipContent side="left">
            {isDragOver ? "Drop to add to Watchlist" : "Watchlist"}
          </TooltipContent>
        </Tooltip>

        <PopoverContent 
          side="top" 
          align="end" 
          sideOffset={12}
          // Keep clear of the fixed header; the panel shrinks to the space that is left.
          collisionPadding={{ top: 88, right: 12, bottom: 12, left: 12 }}
          onCloseAutoFocus={event => { event.preventDefault(); fabRef.current?.focus(); }}
          aria-labelledby="watchlist-heading"
          className="z-[60] flex max-h-[var(--radix-popover-content-available-height)] w-[min(28rem,calc(100vw-1.5rem))] max-w-[var(--radix-popover-content-available-width)] flex-col overflow-hidden rounded-2xl border-border bg-card p-0 shadow-[0_16px_60px_hsl(0_0%_0%/0.5)]"
        >
          {panelHeader}
          {panelBody}
        </PopoverContent>
      </Popover>
    </>
  );
}
