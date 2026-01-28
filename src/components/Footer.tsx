import { Link } from "react-router-dom";
import { Film } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const footerLinks = [
    {
      title: "Browse",
      links: [
        { label: "Bollywood", href: "/browse/bollywood" },
        { label: "Hollywood", href: "/browse/hollywood" },
        { label: "TV Series", href: "/browse/tv" },
        { label: "Top Rated", href: "/browse?sort=vote_average.desc" },
      ],
    },
    {
      title: "Genres",
      links: [
        { label: "Action", href: "/browse?genre=28" },
        { label: "Comedy", href: "/browse?genre=35" },
        { label: "Drama", href: "/browse?genre=18" },
        { label: "Thriller", href: "/browse?genre=53" },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "Profile", href: "/profile" },
        { label: "Watch History", href: "/profile" },
        { label: "Liked Movies", href: "/profile" },
      ],
    },
  ];

  return (
    <footer className="bg-card/50 border-t border-border mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/home" className="flex items-center gap-2 mb-4">
              <Film className="w-8 h-8 text-primary" />
              <span className="text-xl font-bold text-gradient">
                MovieReckon
              </span>
            </Link>
            <p className="text-sm text-muted-foreground mb-4">
              Your personalized gateway to Bollywood & Hollywood entertainment.
            </p>
          </div>

          {/* Links */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold mb-4">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {currentYear} MovieReckon. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
