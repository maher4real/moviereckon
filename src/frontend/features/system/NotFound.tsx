import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { CalendarDays, Clapperboard, Home, Search, Tv } from "lucide-react";
import BrandLogo from "@/frontend/components/BrandLogo";

const DESTINATIONS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/movies", label: "Movies", icon: Clapperboard },
  { href: "/series", label: "Series", icon: Tv },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { href: "/search", label: "Search", icon: Search },
];

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="app-page flex items-center justify-center px-4 py-16">
      <main className="w-full max-w-lg text-center">
        <Link to="/" className="inline-flex" aria-label="MovieReckon home"><BrandLogo size="md" /></Link>
        <p className="mt-10 text-[7rem] font-black leading-none tracking-[-0.06em] text-primary/90 sm:text-[9rem]">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">This scene was cut</h1>
        <p className="mt-3 text-muted-foreground">
          Nothing lives at <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{location.pathname}</code>. Pick up from one of these instead.
        </p>
        <nav className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Main sections">
          {DESTINATIONS.map(({ href, label, icon: Icon }) => (
            <Link key={href} to={href} className="search-shortcut items-center text-center">
              <Icon className="size-5 text-primary" aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
};

export default NotFound;
