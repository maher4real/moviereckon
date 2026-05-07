import { Link, useLocation } from "react-router-dom";
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
    <nav className="fixed bottom-3 left-3 right-3 z-50 rounded-2xl border border-border/70 bg-background/90 shadow-2xl shadow-black/45 backdrop-blur-xl safe-area-bottom md:hidden">
      <div className="flex h-16 items-center justify-around px-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <item.icon className={cn("w-5 h-5", active && "fill-primary/20")} />
              <span className="text-[10px] font-medium truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
