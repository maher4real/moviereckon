import BottomNav from "@/frontend/components/BottomNav";
import Footer from "@/frontend/components/Footer";
import Header from "@/frontend/components/Header";
import { BadgeInfo, BookCheck, FileText, HelpCircle, Mail, MessageSquare } from "lucide-react";

type InfoPageKey = "about" | "feedback" | "contact" | "faq" | "terms" | "privacy";

type InfoSection = {
  heading: string;
  text: string[];
  points?: string[];
};

type InfoPageContent = {
  icon: typeof BadgeInfo;
  title: string;
  subtitle: string;
  updatedOn: string;
  sections: InfoSection[];
};

const PAGE_CONTENT: Record<InfoPageKey, InfoPageContent> = {
  about: {
    icon: BadgeInfo,
    title: "About MovieReckon",
    subtitle:
      "MovieReckon is built to help you decide what to watch faster using trends, detail pages, and personalized recommendations.",
    updatedOn: "February 23, 2026",
    sections: [
      {
        heading: "What We Do",
        text: [
          "MovieReckon brings movies and series into one experience with discovery shelves, smart filtering, and rich detail pages.",
          "The goal is simple: spend less time searching and more time watching stories that match your taste.",
        ],
      },
      {
        heading: "How Recommendations Work",
        text: [
          "Recommendations use your activity, likes, watch history, and community feedback signals.",
          "As you interact more, the ranking improves and adapts to your recent preferences.",
        ],
      },
      {
        heading: "Data Sources",
        text: [
          "Title metadata, artwork, and provider availability come from public entertainment data providers such as TMDB.",
          "Watch availability can differ by country and may change over time.",
        ],
      },
    ],
  },
  feedback: {
    icon: MessageSquare,
    title: "Feedback",
    subtitle:
      "Your input helps improve ranking quality, content surfaces, and day-to-day product reliability.",
    updatedOn: "February 23, 2026",
    sections: [
      {
        heading: "How To Share Feedback",
        text: [
          "Use the in-page community feedback options on movie and series detail pages to rate whether a title is worth watching.",
          "For feature requests or bug reports, use the Contact page and include as much detail as possible.",
        ],
      },
      {
        heading: "What To Include",
        text: ["Helpful reports are specific and reproducible."],
        points: [
          "Title name and page URL",
          "Device, browser, and OS version",
          "Expected behavior vs actual behavior",
          "Screenshot or short screen recording",
        ],
      },
      {
        heading: "How We Use Feedback",
        text: [
          "Feedback is reviewed to prioritize fixes, improve recommendation quality, and reduce noisy results.",
          "Not every request ships immediately, but every issue helps guide roadmap decisions.",
        ],
      },
    ],
  },
  contact: {
    icon: Mail,
    title: "Contact",
    subtitle: "Reach out for support, partnership, or product questions.",
    updatedOn: "February 23, 2026",
    sections: [
      {
        heading: "Support",
        text: [
          "For account, profile, and recommendation issues, contact: support@moviereckon.app",
          "When reporting issues, include the page URL and steps so we can investigate quickly.",
        ],
      },
      {
        heading: "Business Inquiries",
        text: [
          "For collaboration, integration, or media requests, contact: hello@moviereckon.app",
        ],
      },
      {
        heading: "Response Time",
        text: [
          "Most messages are reviewed within 1-3 business days.",
          "Urgent production issues are prioritized first.",
        ],
      },
    ],
  },
  faq: {
    icon: HelpCircle,
    title: "Frequently Asked Questions",
    subtitle: "Quick answers to common questions about the platform and account behavior.",
    updatedOn: "February 23, 2026",
    sections: [
      {
        heading: "Do I need an account?",
        text: [
          "You can browse some content without signing in, but personalized recommendations and profile features require an account.",
        ],
      },
      {
        heading: "Where does movie and series data come from?",
        text: [
          "Metadata and artwork are sourced from public catalog providers such as TMDB.",
          "Availability by OTT platform can vary by region and change without notice.",
        ],
      },
      {
        heading: "Why did my recommendations change?",
        text: [
          "Recommendations update as your likes, watch history, and feedback evolve.",
          "Recent activity has more influence so the feed stays relevant.",
        ],
      },
      {
        heading: "Can I reset recommendation signals?",
        text: [
          "Yes. Use profile controls to remove likes/history entries and the system will re-rank your feed accordingly.",
        ],
      },
    ],
  },
  terms: {
    icon: FileText,
    title: "Terms of Use",
    subtitle:
      "These terms explain the baseline rules for using MovieReckon and its recommendation features.",
    updatedOn: "February 23, 2026",
    sections: [
      {
        heading: "Acceptable Use",
        text: [
          "Use the service lawfully and do not attempt to disrupt, scrape, or abuse platform APIs.",
          "Automated misuse, fraudulent behavior, and harassment may lead to account restrictions.",
        ],
      },
      {
        heading: "Content and Availability",
        text: [
          "Third-party metadata and provider availability may be incomplete, delayed, or region-specific.",
          "MovieReckon does not guarantee that any title is available on any platform at all times.",
        ],
      },
      {
        heading: "Liability",
        text: [
          "The service is provided as-is without warranties of uninterrupted operation.",
          "To the maximum extent allowed by law, MovieReckon is not liable for indirect or consequential damages.",
        ],
      },
    ],
  },
  privacy: {
    icon: BookCheck,
    title: "Privacy Policy",
    subtitle: "This policy describes what information is collected and how it is used.",
    updatedOn: "February 23, 2026",
    sections: [
      {
        heading: "Information We Collect",
        text: [
          "Account details, authentication metadata, and profile settings needed to operate your account.",
          "Behavioral signals such as likes, watch history, and feedback used to personalize recommendations.",
        ],
      },
      {
        heading: "How We Use Data",
        text: [
          "To power account login, maintain preferences, and improve recommendation relevance.",
          "To diagnose reliability issues and monitor product performance.",
        ],
      },
      {
        heading: "Data Sharing and Retention",
        text: [
          "We do not sell personal data.",
          "Operational data is retained only as long as required for service functionality, analytics, or legal obligations.",
        ],
      },
      {
        heading: "Your Controls",
        text: [
          "You can update profile information and remove recommendation signals from your account areas.",
          "For data-related requests, contact: privacy@moviereckon.app",
        ],
      },
    ],
  },
};

interface InfoPageProps {
  page: InfoPageKey;
}

export default function InfoPage({ page }: InfoPageProps) {
  const content = PAGE_CONTENT[page];
  const Icon = content.icon;

  return (
    <div className="app-page flex flex-col pb-20 md:pb-0">
      <Header />

      <main className="page-main">
        <div className="container mx-auto px-4">
          <div className="surface-panel p-6 md:p-8">
            <div className="flex items-start gap-3">
              <div className="page-heading-icon">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{content.subtitle}</p>
                <p className="mt-3 text-xs text-muted-foreground">Last updated: {content.updatedOn}</p>
              </div>
            </div>

            <div className="mt-8 space-y-6">
              {content.sections.map((section) => (
                <section
                  key={section.heading}
                  className="rounded-lg border border-border/70 bg-background/50 p-4 md:p-5"
                >
                  <h2 className="text-lg font-semibold">{section.heading}</h2>
                  <div className="mt-3 space-y-2">
                    {section.text.map((paragraph) => (
                      <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {section.points ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {section.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
