import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
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
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled ? "bg-background/95 backdrop-blur-md shadow-lg" : "bg-gradient-to-b from-background/80 to-transparent"
      )}
    >
      <div className="container mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/home"
            data-brand-logo-anchor="true"
            className="relative z-10 inline-flex shrink-0 items-center transition-opacity hover:opacity-80"
          >
            <BrandLogo size="sm" labelClassName="hidden lg:inline" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex min-w-0 flex-1 items-center justify-center gap-3 lg:gap-6 px-3 lg:px-6">
            {navLinks.map((link) => {
              const active = isActive(link.href);

              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    "relative inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="header-nav-active"
                      className="absolute inset-0 rounded-full border border-primary/25 bg-primary/10 shadow-[0_0_22px_hsl(var(--primary)/0.16)]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative z-10">{link.label}</span>
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
              className="text-muted-foreground hover:text-foreground"
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
              className="md:hidden text-muted-foreground hover:text-foreground"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence initial={false}>
        {isMobileMenuOpen && (
          <motion.div
            key="mobile-header-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden md:hidden bg-background/95 backdrop-blur-md border-t border-border"
          >
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {navLinks.map((link) => {
                const active = isActive(link.href);

                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "relative flex items-center gap-3 overflow-hidden rounded-lg px-4 py-3 transition-colors",
                      active
                        ? "text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="mobile-header-nav-active"
                        className="absolute inset-0 rounded-lg bg-primary/10"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <link.icon className="relative z-10 w-5 h-5" />
                    <span className="relative z-10">{link.label}</span>
                  </Link>
                );
              })}
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
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
