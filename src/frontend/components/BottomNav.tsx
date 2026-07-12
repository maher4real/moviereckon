import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Home, Clapperboard, Search, Sparkles, Tv, CalendarDays } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/reckon", label: "Reckon", icon: Sparkles },
  { href: "/movies", label: "Movies", icon: Clapperboard },
  { href: "/series", label: "Series", icon: Tv },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/search", label: "Search", icon: Search },
];

export default function BottomNav() {
  const location = useLocation();

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
      <div className="pointer-events-auto mx-auto max-w-[31rem] rounded-[1.75rem] border border-primary/20 bg-[linear-gradient(180deg,hsl(var(--card)/0.94),hsl(var(--background)/0.96)),radial-gradient(circle_at_50%_-10%,hsl(var(--primary)/0.20),transparent_18rem)] p-1.5 shadow-[0_18px_48px_hsl(var(--background)/0.82),0_0_30px_hsl(var(--primary)/0.15)] backdrop-blur-xl">
        <div className="grid h-14 grid-cols-6 items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-[1.25rem] px-0.5 transition-colors duration-200 sm:px-1",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-active"
                    className="absolute inset-0 rounded-[1.25rem] border border-primary/30 bg-[image:var(--brand-gradient-soft)] shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.08),0_0_18px_hsl(var(--primary)/0.22)]"
                    transition={{ type: "spring", stiffness: 440, damping: 36 }}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex size-7 items-center justify-center rounded-full transition-colors duration-200",
                    active ? "bg-primary/12" : "bg-transparent"
                  )}
                >
                  <item.icon className={cn("size-[1.125rem]", active && "fill-primary/20")} />
                </span>
                <span className="relative z-10 max-w-full truncate text-[9px] font-medium leading-none">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
