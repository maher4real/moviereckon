import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Compass,
  Heart,
  LifeBuoy,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const navigate = useNavigate();

  const footerSections = [
    {
      title: "Discover",
      icon: Compass,
      links: [
        { label: "Home", href: "/home" },
        { label: "Upcoming", href: "/upcoming" },
        { label: "Movies", href: "/movies" },
        { label: "TV Series", href: "/series" },
      ],
    },
    {
      title: "Genres",
      icon: Sparkles,
      links: [
        { label: "Action", href: "/movies?genre=28" },
        { label: "Comedy", href: "/movies?genre=35" },
        { label: "Drama", href: "/movies?genre=18" },
        { label: "Thriller", href: "/movies?genre=53" },
      ],
    },
    {
      title: "Your Space",
      icon: UserRound,
      links: [
        { label: "Profile", href: "/profile" },
        { label: "Favorites", href: "/profile?tab=liked" },
        { label: "Reckon", href: "/reckon" },
        { label: "Search", href: "/search" },
      ],
    },
    {
      title: "Support",
      icon: LifeBuoy,
      links: [
        { label: "About", href: "/about" },
        { label: "Feedback", href: "/feedback" },
        { label: "Contact", href: "/contact" },
        { label: "FAQ", href: "/faq" },
      ],
    },
  ];

  return (
    <footer className="relative mt-auto border-t border-border/70 bg-background/95">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,hsl(var(--primary)/0.18),transparent_40%),radial-gradient(circle_at_88%_90%,hsl(var(--accent)/0.2),transparent_35%)]" />

      <div className="container relative mx-auto px-4 py-10 md:py-12">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
          <div className="rounded-2xl border border-border/80 bg-card/60 p-5 backdrop-blur">
            <Link to="/home" className="mb-3 inline-flex items-center">
              <BrandLogo size="md" />
            </Link>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Discover movies and series faster with smart picks, richer detail pages, and
              personal tracking that stays in sync with your profile.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate("/search")}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/75 px-3 py-2 text-xs font-medium transition-colors hover:border-primary hover:text-foreground"
              >
                <Search className="h-3.5 w-3.5" />
                Search Titles
              </button>
              <button
                type="button"
                onClick={() => navigate("/reckon")}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/75 px-3 py-2 text-xs font-medium transition-colors hover:border-primary hover:text-foreground"
              >
                <Heart className="h-3.5 w-3.5" />
                Open Reckon
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {footerSections.map((section) => (
              <div
                key={section.title}
                className="rounded-2xl border border-border/70 bg-card/35 p-4 backdrop-blur"
              >
                <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <section.icon className="h-4 w-4 text-primary" />
                  {section.title}
                </h3>
                <ul className="space-y-2">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.href}
                        className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span>{link.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 border-t border-border/70 pt-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {currentYear} MovieReckon. Crafted for people who love stories.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link to="/contact" className="transition-colors hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
