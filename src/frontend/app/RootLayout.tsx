import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/index.css";

// Resolves relative canonical and Open Graph URLs. Without APP_URL Next falls back to its default.
function siteUrl(): URL | undefined {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  applicationName: "MovieReckon",
  description: "Movie and TV recommendations tailored to your taste.",
  manifest: "/manifest.webmanifest",
  title: {
    default: "MovieReckon",
    template: "%s | MovieReckon",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MovieReckon",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/app-icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#d83a12",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="dns-prefetch" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
