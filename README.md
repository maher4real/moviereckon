# MovieReckon

MovieReckon is a movie and TV discovery app with personalized recommendations, rich detail pages, and account-based tracking.

Live app: `https://moviereckon.vercel.app/`

<img width="1724" height="911" alt="Screenshot 2026-02-01 at 5 43 09 pm" src="https://github.com/user-attachments/assets/b8aa225c-b976-4e23-827d-ff873c3f27be" />
<img width="1728" height="909" alt="Screenshot 2026-02-01 at 5 44 16 pm" src="https://github.com/user-attachments/assets/66ac84f0-389f-4754-9c8d-1ab7040daedd" />
<img width="1728" height="913" alt="Screenshot 2026-02-01 at 5 43 51 pm" src="https://github.com/user-attachments/assets/ed6774e4-a748-4ff8-aa79-b36d1a2ecf88" />
<img width="1728" height="897" alt="Screenshot 2026-02-01 at 5 46 48 pm" src="https://github.com/user-attachments/assets/e477b6cf-e998-44a9-abac-8c788b8919bc" />
<img width="1728" height="909" alt="Screenshot 2026-02-01 at 5 44 16 pm" src="https://github.com/user-attachments/assets/8729ccaa-a51c-4753-8a4d-aa8f4969cb70" />
<img width="1728" height="908" alt="Screenshot 2026-02-01 at 5 47 26 pm" src="https://github.com/user-attachments/assets/3f8790ab-073a-491d-9b85-1ce710bb5102" />
<img width="1660" height="899" alt="Screenshot 2026-02-01 at 5 47 46 pm" src="https://github.com/user-attachments/assets/50a274d0-834a-4fa6-b0a3-619bdff68412" />

## Highlights

- Personalized recommendations on the `Reckon` page
- Movie and TV detail pages with trailers, cast, keywords, providers, and related titles
- Watch history, likes, profile preferences, comments, and community feedback
- Advanced filtering for upcoming releases (movies + series)
- Hybrid rendering with server-side prefetch + client-side hydration for key routes
- MongoDB-only backend (Supabase removed)

## Full Feature Set

### Discovery and Browsing

- Home feed with multiple curated shelves:
  - Trending movies
  - Now Playing
  - Upcoming (movies + series)
  - Continue Watching
  - Bollywood, Hollywood, Tamil, Telugu, Gujarati shelves
  - Trending TV and Top Rated
- Movies screen:
  - Categories: All, Now Playing, Trending, Bollywood, Hollywood
  - Filters: genre, year, sort, Bollywood language
  - Infinite loading and prefetching for smoother browsing
- Series screen:
  - Categories: All, Popular, Top Rated, Upcoming, Korean, Indian, Anime
  - Filters: genre, year, sort, OTT platform, language
  - Infinite loading and smart filtering
- Upcoming screen:
  - Unified movie + series release discovery
  - Timeline/date grouping
  - Filters by section, genre, language, OTT, region-focused movie type
  - Date-specific browsing with load-more timeline
- Search screen:
  - Debounced multi-search
  - Type tabs (All, Movies, TV)
  - Recent searches persisted in browser
  - Dynamic popular suggestions sourced from trending data

### Detail Pages

- Movie detail page:
  - Hero with backdrop and trailer playback
  - Trailer modal
  - Overview, quick facts, release/certification/runtime/financial data
  - Keywords, cast, crew
  - Where to Watch providers
  - Similar movies carousel
  - Community feedback and comments
  - Watch/like actions
- TV detail page:
  - Hero with trailer playback and modal
  - Overview and quick facts
  - Keywords, cast, crew
  - Where to Watch providers
  - Season selector + episode list/details
  - Similar series carousel
  - Community feedback and comments
  - Watch/like actions

### Personalization and Recommendation Engine

- `Reckon` personalized recommendation feed
- Fallback to non-personalized trending signals when user history is limited
- Explainable recommendations (`Why?`) using reason labels and seed context
- Filtering inside Reckon by content type, genre, language
- Sorting inside Reckon by relevance, popularity, rating, release date
- Large-list optimization with incremental rendering and auto load-more

### Account and Profile

- Email/password signup and login
- Google OAuth sign-in
- Turnstile CAPTCHA protection on auth forms
- Cookie-based sessions with refresh flow
- Profile editing:
  - Username update
  - Avatar from preset options
  - Avatar upload with client-side optimization/compression
- Profile analytics and management:
  - Movies watched count
  - Series watched count
  - Total liked titles
  - Watch history listing + removal
  - Liked content listing

### Community Features

- Per-title community feedback voting with 4 options:
  - `Give it a go`
  - `One-time watch`
  - `Must Watch`
  - `Skip`
- Aggregated feedback counts + user selection state
- Comment section on detail pages

### UX, Routing, and Shared Pages

- Auth transition overlay and startup sound orchestration
- Global skeleton loaders and route-level loading fallbacks
- Error boundary for runtime crash protection
- Responsive layout with:
  - Desktop header navigation
  - Mobile bottom navigation
  - Rich footer navigation
- Support/legal static pages with working routes:
  - `/about`
  - `/feedback`
  - `/contact`
  - `/faq`
  - `/terms`
  - `/privacy`

### Backend and Data Layer

- MongoDB-backed API for auth + user data + recommendations
- API routers:
  - `/api/auth/*`
  - `/api/user/*`
  - `/api/tmdb`
  - `/api/health`
- CORS allowlist and security headers
- In-memory rate limiting for auth endpoints
- TMDB proxy/data fetching for movie/TV catalogs and metadata

## Tech Stack

- Next.js 16 (App Router + API routes)
- React 19 + React Router
- TypeScript
- TanStack Query
- Tailwind CSS + Radix UI
- MongoDB
- TMDB API
- Cloudflare Turnstile (captcha)

## Architecture

This project uses a hybrid approach:

- Next.js serves the app and API routes.
- A catch-all app route (`src/app/[[...slug]]/page.tsx`) prefetches data server-side for important pages.
- The UI itself is routed by React Router in `src/App.tsx`.
- API entrypoints are in `src/pages/api/*` and delegate to handlers in `src/server/api/*`.

### Rendering Strategy

- SSR-prefetch + hydration:
  - `/`, `/auth`
  - `/home`
  - `/search`
  - `/upcoming`
  - `/movie/:id`
  - `/tv/:id`
- Mostly client-rendered (with API calls after hydration):
  - `/profile`, `/reckon`, `/movies`, `/series`
  - static info pages: `/about`, `/feedback`, `/contact`, `/faq`, `/terms`, `/privacy`

## Project Structure

```txt
src/
  app/
    [[...slug]]/page.tsx         # Next catch-all SSR prefetch entry
    layout.tsx                   # root metadata/layout
  pages/api/                     # Next API route wrappers
  server/api/                    # API routers + handlers + server libs
  screens/                       # route-level UI screens
  components/                    # shared UI
  hooks/                         # auth, user data, recommendations
  lib/                           # client libs, tmdb client, mongodb client
```

## Environment Variables

Copy `.env.example` to `.env` and fill values.

Required for full app behavior:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `JWT_SECRET` (min 32 chars)
- `TMDB_API_KEY`
- `TURNSTILE_SECRET_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

Public API base URL (optional in same-origin deploys):

- `NEXT_PUBLIC_MONGODB_API_URL`
- fallback keys supported: `NEXT_PUBLIC_VITE_MONGODB_API_URL`, `VITE_MONGODB_API_URL`

Optional auth/email variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `EMAIL_VERIFICATION_BASE_URL`
- `EMAIL_VERIFICATION_REDIRECT_BASE_URL`
- `EMAIL_VERIFICATION_TOKEN_PEPPER`
- `REFRESH_TOKEN_PEPPER`
- `SESSION_COOKIE_SECURE`
- `SESSION_COOKIE_SAMESITE`
- `CORS_ORIGIN`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Run development server:

```bash
npm run dev
```

4. Open:

`http://localhost:3000`

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - start production server
- `npm run lint` - run ESLint
- `npm run test` - run Vitest once
- `npm run test:watch` - run Vitest in watch mode

## API Routes

Auth routes:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/auth/google-start`
- `GET /api/auth/google-callback`
- `GET /api/auth/verify-email`

User routes:

- `/api/user/watch-history`
- `/api/user/liked-items`
- `/api/user/preferences`
- `/api/user/profile`
- `/api/user/clear-history`
- `/api/user/comments`
- `/api/user/feedback`
- `/api/user/recommendations`

Other:

- `GET /api/health`
- `GET /api/tmdb` (server proxy endpoint)

## Auth Notes

- Session is cookie-based (`HttpOnly` access + refresh cookies).
- Turnstile captcha is enforced for login and signup.
- Refresh tokens are stored hashed in MongoDB.

## Temporary Behavior

Email verification is currently disabled in signup flow.

- Flag location: `src/server/api/_handlers/auth/register.ts`
- Current state: `EMAIL_VERIFICATION_DISABLED = true`

New users are auto-marked verified and signed in immediately after registration.

## Deployment

Recommended: Vercel.

- Build command: `npm run build`
- Start command: `npm run start`
- Configure all required env vars in Vercel Project Settings.
