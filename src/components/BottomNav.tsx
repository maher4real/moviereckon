import { Link, useLocation } from "react-router-dom";
import { Home, Grid, Search, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/reckon", label: "Reckon", icon: Sparkles },
  { href: "/browse", label: "Browse", icon: Grid },
  { href: "/search", label: "Search", icon: Search },
  { href: "/profile", label: "Profile", icon: User },
];

export default function BottomNav() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path.includes("?")) {
      const [basePath, query] = path.split("?");
      return location.pathname === basePath && location.search.includes(query.split("=")[1]);
    }
    if (path === "/browse") {
      return location.pathname.startsWith("/browse") && !location.search.includes("type=all");
    }
    return location.pathname === path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors min-w-0",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
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
