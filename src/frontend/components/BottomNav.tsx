import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Home, Clapperboard, Sparkles, Tv, CalendarDays, ListVideo } from "lucide-react";
import { useOptionalWatchlist } from "@/frontend/hooks/useWatchlist";
import { cn } from "@/shared/lib/utils";

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof Home;
}> = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/reckon", label: "Reckon", icon: Sparkles },
  { href: "/movies", label: "Movies", icon: Clapperboard },
  { href: "/series", label: "Series", icon: Tv },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
];

const tabClass = "relative flex h-full min-h-11 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-[1.25rem] px-0.5 transition-colors duration-200 sm:px-1";
const tabLabelClass = "relative z-10 max-w-full truncate text-[10px] font-medium leading-none";

export default function BottomNav() {
  const location = useLocation();
  // Search lives in the header; the last tab opens the watchlist so nothing floats over content.
  const watchlist = useOptionalWatchlist();
  const watchlistCount = watchlist?.items.filter((item) => !item.watched).length ?? 0;

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <motion.nav
      aria-label="Primary mobile navigation"
      data-bottom-nav="true"
      initial={{ opacity: 0, y: 22, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 360, damping: 32 }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-2 safe-area-bottom sm:px-3 md:hidden"
    >
      <div className="pointer-events-auto mx-auto max-w-[31rem] rounded-[1.5rem] border border-white/10 bg-card/95 p-1.5 shadow-[0_10px_32px_hsl(0_0%_0%/0.5)] backdrop-blur-md">
        <div className="grid h-14 grid-cols-6 items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  tabClass,
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-active"
                    className="absolute inset-0 rounded-[1.1rem] bg-primary/12"
                    transition={{ type: "spring", stiffness: 440, damping: 36 }}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex size-7 items-center justify-center rounded-full transition-colors duration-200",
                    active ? "bg-primary/12 text-primary" : "bg-transparent"
                  )}
                >
                  <item.icon className={cn("size-[1.125rem]", active && "fill-primary/20")} />
                </span>
                <span className={tabLabelClass}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          {watchlist && (
            <button
              type="button"
              onClick={watchlist.openPanel}
              data-watchlist-target
              aria-haspopup="dialog"
              aria-expanded={watchlist.isOpen}
              aria-label={watchlistCount ? `Watchlist, ${watchlistCount} unwatched` : "Watchlist"}
              className={cn(tabClass, watchlist.isOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <span className={cn("relative z-10 flex size-7 items-center justify-center rounded-full", watchlist.isOpen && "bg-primary/12 text-primary")}>
                <ListVideo className="size-[1.125rem]" />
                {watchlistCount > 0 && (
                  <span aria-hidden="true" className="absolute -right-1.5 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-bold leading-4 tabular-nums text-primary-foreground">
                    {watchlistCount > 99 ? "99+" : watchlistCount}
                  </span>
                )}
              </span>
              <span className={tabLabelClass}>Watchlist</span>
            </button>
          )}
        </div>
      </div>
    </motion.nav>
  );
}
