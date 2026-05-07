import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/frontend/hooks/useAuth";
import {
  Search,
  Menu,
  X,
  User,
  Home,
  Tv,
  Clapperboard,
  LogOut,
  Sparkles,
  CalendarDays,
  Film,
} from "lucide-react";
import BrandLogo from "@/frontend/components/BrandLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/shared/lib/utils";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setIsScrolled(window.scrollY > 50);
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const navLinks = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/reckon", label: "Reckon", icon: Sparkles },
    { href: "/movies", label: "Movies", icon: Clapperboard },
    { href: "/series", label: "Series", icon: Tv },
    { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
    { href: "/theater", label: "Cinema", icon: Film },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const profileAvatarSrc =
    typeof profile?.avatar_url === "string" && profile.avatar_url.trim().length > 0
      ? profile.avatar_url.trim()
      : undefined;

  return (
    <header className="pointer-events-none fixed left-0 right-0 top-3 z-50 px-3 transition-all duration-300">
      <div
        className={cn(
          "container pointer-events-auto mx-auto overflow-hidden rounded-2xl border px-3 shadow-2xl backdrop-blur-xl transition-all duration-300 sm:px-4",
          isScrolled
            ? "border-border/80 bg-background/90 shadow-black/40"
            : "border-white/10 bg-background/60 shadow-black/25",
        )}
      >
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/home"
            data-brand-logo-anchor="true"
            className="relative z-10 inline-flex shrink-0 items-center rounded-lg transition-opacity hover:opacity-85"
            aria-label="Go to home"
          >
            <BrandLogo size="sm" labelClassName="hidden lg:inline" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 px-3 md:flex lg:px-6">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors duration-200",
                    active
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                  )}
                >
                  <link.icon className={cn("h-4 w-4", active && "text-primary-foreground")} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Side Actions */}
          <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Search Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/search")}
              className="rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </Button>

            {/* Profile Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/profile")}
              className="h-10 w-10 rounded-full border border-white/10 bg-background/40 p-0 text-muted-foreground backdrop-blur-sm hover:bg-background/70 hover:text-foreground"
              aria-label="Open profile"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={profileAvatarSrc} alt={profile?.username || "Profile"} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </Button>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground md:hidden"
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="container pointer-events-auto mx-auto mt-2 overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl shadow-black/35 backdrop-blur-xl animate-fade-in md:hidden">
          <nav className="px-4 py-4 flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
                  isActive(link.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <link.icon className="w-5 h-5" />
                {link.label}
              </Link>
            ))}
            {profile && (
              <>
                <div className="px-4 py-3 mt-2 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Logged in as <span className="text-foreground font-medium">{profile.username}</span>
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
