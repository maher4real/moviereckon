# MovieReckon

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People choosing their next film or TV series. Discovering the next watch is the user-confirmed priority for this redesign.

## Product Purpose

Help people choose what to watch through personalized Reckon recommendations, catalog browsing, search, and their watch history.

## Operating Context

Responsive web application with desktop navigation and mobile navigation. Film and television metadata and artwork come from TMDB. Accounts provide preferences, watch history, likes, and personalized recommendations.

## Capabilities and Constraints

- Preserve every existing feature, route, account workflow, API contract, and data source.
- Preserve recommendations and their explanations, movie and series discovery and filters, upcoming releases, title and person details, trailers, watch sources, watchlists, community feedback, profile preferences, and Cinema.
- Next.js App Router serves the React Router application; React, TypeScript, TanStack Query, Tailwind CSS, Radix UI, and Lucide are established dependencies.
- Preserve ongoing watch-source work in the checkout. It is independent of this redesign.
- Do not invent ratings, recommendation scores, availability, testimonials, or commercial claims.

## Brand Commitments

- Keep the MovieReckon name.
- The user's latest instruction is to improve the current UI, preserving its recognizable dark theme, red accents, logo, typography, and established visual identity.
- Refine hierarchy, navigation, spacing, accessibility, and responsive behavior while preserving current functionality.
- The user requested a redesign based on the current interface, taking inspiration from Stan, Prime Video, and Netflix, with red as the brand color. Apply their clarity and cinematic browsing conventions inside MovieReckon's own identity.
- Watchlist status choices must stay visible as buttons; the user explicitly rejected dropdowns for this control.

## Evidence on Hand

README.md describes the shipped product. Existing frontend routes and shared components provide functional truth. TMDB supplies film and TV artwork and metadata. Local QA may use clearly identified synthetic account and catalog responses without changing production authentication.

## Product Principles

1. Make the next useful film or series easy to discover.
2. Explain personalized picks without obscuring the artwork or essential metadata.
3. Preserve the depth of the catalog and all current features.
4. Keep browsing, searching, and navigation usable on phones and with a keyboard.
