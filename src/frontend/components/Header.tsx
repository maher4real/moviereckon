import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, Menu, X, User, Home, Tv, Clapperboard, LogOut, Sparkles, CalendarDays, Film, ListVideo, SlidersHorizontal, UserPen } from "lucide-react";
import { useWatchlist } from "@/frontend/hooks/useWatchlist";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import { useAuth } from "@/frontend/hooks/useAuth";
import BrandLogo from "@/frontend/components/BrandLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/shared/lib/utils";

const navLinks = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/reckon", label: "Reckon", icon: Sparkles },
  { href: "/movies", label: "Movies", icon: Clapperboard },
  { href: "/series", label: "Series", icon: Tv },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/theater", label: "Theater", icon: Film },
];
const accountLinks = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/reckon/preferences", label: "Taste preferences", icon: SlidersHorizontal },
  { href: "/profile/edit", label: "Edit profile", icon: UserPen },
];
const preloadSearch = () => { void import("@/frontend/features/browse/Search"); };

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { profile, signOut } = useAuth();
  const { openPanel, items: watchlistItems } = useWatchlist();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isMobileMenuOpen]);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);
  const goTo = (path: string) => { setIsMobileMenuOpen(false); navigate(path); };
  const handleSignOut = async () => { await signOut(); goTo("/"); };
  const avatar = profile?.avatar_url?.trim() || undefined;

  return (
    <header className="app-header" data-scrolled={isScrolled || isMobileMenuOpen}>
      <div className="app-header-inner">
        <Link to="/home" data-brand-logo-anchor="true" aria-label="MovieReckon home" className="shrink-0 rounded-sm transition-opacity hover:opacity-85" onClick={() => setIsMobileMenuOpen(false)}>
          <BrandLogo size="sm" labelClassName="text-[17px] sm:text-xl" />
        </Link>
        <nav aria-label="Primary navigation" className="app-nav-group hidden min-w-0 items-center gap-0.5 lg:flex">
          {navLinks.map(({ href, label }) => (
            <Link key={href} to={href} aria-current={isActive(href) ? "page" : undefined} className={cn("app-nav-link", isActive(href) && "app-nav-link-active")}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" onClick={() => goTo("/search")} onPointerEnter={preloadSearch} onFocus={preloadSearch} className="header-search size-11 p-0 hover:bg-transparent hover:text-foreground" aria-label="Open search">
            <Search className="size-5" aria-hidden="true" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 rounded-full p-0 hover:bg-white/10" aria-label="Open account menu">
                <Avatar className="size-8 border border-white/15"><AvatarImage src={avatar} alt={profile?.username || "Profile"} /><AvatarFallback className="bg-muted text-foreground"><User className="size-4" /></AvatarFallback></Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-xl border-white/10 bg-popover/95 p-1.5 backdrop-blur-xl">
              {profile && <DropdownMenuLabel className="px-2.5 py-2"><span className="block text-xs font-normal text-muted-foreground">Signed in as</span><span className="block truncate text-sm">{profile.username}</span></DropdownMenuLabel>}
              <DropdownMenuSeparator />
              {accountLinks.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={href} onSelect={() => goTo(href)} className="min-h-10 gap-2.5 rounded-lg px-2.5"><Icon className="size-4 text-muted-foreground" />{label}</DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => openPanel()} className="min-h-10 gap-2.5 rounded-lg px-2.5">
                <ListVideo className="size-4 text-muted-foreground" />Watchlist
                {watchlistItems.length > 0 && <span className="ml-auto rounded-full bg-primary/15 px-2 text-xs tabular-nums text-foreground">{watchlistItems.length}</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleSignOut()} className="min-h-10 gap-2.5 rounded-lg px-2.5 text-destructive focus:text-destructive"><LogOut className="size-4" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button ref={menuButton} variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(open => !open)} className="size-11 text-foreground/80 lg:hidden" aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={isMobileMenuOpen} aria-controls="mobile-header-menu">
            {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isMobileMenuOpen && (
          <motion.div id="mobile-header-menu" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-white/10 bg-background lg:hidden">
            <nav aria-label="Expanded navigation" className="grid gap-1 px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:px-6">
              <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Browse</p>
              {navLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} to={href} onClick={() => setIsMobileMenuOpen(false)} aria-current={isActive(href) ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-lg px-4 text-sm font-medium transition-colors", isActive(href) ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4.5" aria-hidden="true" />{label}</Link>
              ))}
              <p className="mt-3 px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Your space</p>
              {accountLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} to={href} onClick={() => setIsMobileMenuOpen(false)} aria-current={location.pathname === href ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-lg px-4 text-sm font-medium transition-colors", location.pathname === href ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4.5" aria-hidden="true" />{label}</Link>
              ))}
              <button type="button" onClick={() => { setIsMobileMenuOpen(false); openPanel(); }} className="flex min-h-12 items-center gap-3 rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ListVideo className="size-4.5" aria-hidden="true" />Watchlist{watchlistItems.length > 0 && <span className="ml-auto rounded-full bg-primary/15 px-2 text-xs tabular-nums text-foreground">{watchlistItems.length}</span>}</button>
              {profile && <div className="mt-3 border-t border-border pt-3"><p className="px-4 pb-2 text-xs text-muted-foreground">Logged in as <span className="font-medium text-foreground">{profile.username}</span></p><button type="button" onClick={handleSignOut} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-sm text-destructive hover:bg-destructive/10"><LogOut className="size-[18px]" />Sign Out</button></div>}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
