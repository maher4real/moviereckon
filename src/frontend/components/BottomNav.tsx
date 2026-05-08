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
    <nav
      aria-label="Primary mobile navigation"
      data-bottom-nav="true"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom"
    >
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 h-full min-w-0 overflow-hidden rounded-lg transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-active"
                  className="absolute inset-x-1 top-1 bottom-1 rounded-lg border border-primary/20 bg-primary/10 shadow-[0_0_18px_hsl(var(--primary)/0.14)]"
                  transition={{ type: "spring", stiffness: 440, damping: 36 }}
                />
              )}
              <item.icon className={cn("relative z-10 w-5 h-5", active && "fill-primary/20")} />
              <span className="relative z-10 text-[10px] font-medium truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
