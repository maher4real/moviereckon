import { Link, useLocation } from "react-router-dom";
import { Home, Clapperboard, Search, Sparkles, Tv } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/reckon", label: "Reckon", icon: Sparkles },
  { href: "/movies", label: "Movies", icon: Clapperboard },
  { href: "/series", label: "Series", icon: Tv },
  { href: "/search", label: "Search", icon: Search },
];

export default function BottomNav() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/82 backdrop-blur-xl border-t border-white/10 shadow-[0_-10px_28px_rgba(0,0,0,0.45)] safe-area-bottom">
      <div className="grid grid-cols-5 items-center h-14 px-1.5">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 h-[calc(100%-8px)] rounded-xl transition-all duration-200 min-w-0",
                active
                  ? "text-primary bg-primary/12"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("w-[18px] h-[18px]", active && "fill-primary/20")} />
              <span className="text-[10px] font-medium truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
